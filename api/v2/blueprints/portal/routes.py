"""Employee Self-Service Portal Blueprint"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute
from ...middleware.auth import require_auth
from ...utils.responses import ok, err, not_found
from datetime import datetime

portal_bp = Blueprint('portal', __name__, url_prefix='/api/v2/portal')

def _get_emp_id():
    emp_id = g.user.get('employee_id')
    if not emp_id:
        # Try email match
        emp = db_row1("SELECT id FROM employees WHERE email=%s AND is_active=1", (g.user.get('email',''),))
        if not emp:
            # Try username match  
            emp = db_row1("SELECT id FROM employees WHERE (email=%s OR LOWER(first_name||last_name)=LOWER(REPLACE(%s,' ',''))) AND is_active=1",
                         (g.user.get('username',''), g.user.get('full_name','')))
        if emp: emp_id = emp['id']
    return emp_id

@portal_bp.route('/dashboard')
@require_auth
def dashboard():
    emp_id = _get_emp_id()
    if not emp_id:
        # Return basic user info from auth so portal shows something
        return ok({
            'first_name': (g.user.get('full_name') or '').split()[0],
            'last_name': ' '.join((g.user.get('full_name') or '').split()[1:]),
            'email': g.user.get('email',''),
            'job_title': g.user.get('role',''),
            'status': 'Active',
            'emp_id': 'N/A',
            'department_name': None,
            'reporting_manager_name': None,
            'leave_balance': 0, 'pending_ts': 0, 'approved_ts': 0, 'notifications': 0,
        })
    emp = db_row1("""SELECT e.*,
        d.name as department_name, b.name as business_unit_name,
        et.name as employment_type, c.name as client_name,
        rm.first_name||' '||rm.last_name as reporting_manager_name
        FROM employees e
        LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN business_units b ON b.id=e.business_unit_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        LEFT JOIN clients c ON c.id=e.client_id
        LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
        WHERE e.id=%s""", (emp_id,))
    if not emp: return err("Employee record not found", 404)
    year = datetime.now().year
    leaves_taken    = db_row1("""SELECT COALESCE(SUM(days),0) as n FROM employee_leaves
        WHERE employee_id=%s AND status='Approved' AND EXTRACT(YEAR FROM from_date)=%s""",
        (emp_id, year))['n']
    pending_leaves  = db_row1("SELECT COUNT(*) as n FROM employee_leaves WHERE employee_id=%s AND status='Pending'", (emp_id,))['n']
    pending_ts      = db_row1("""SELECT COUNT(*) as n FROM timesheets t
        JOIN master_timesheet_statuses s ON s.id=t.status_id
        WHERE t.employee_id=%s AND s.name='Pending'""", (emp_id,))['n']
    approved_hours  = db_row1("""SELECT COALESCE(SUM(t.total_hours),0) as n FROM timesheets t
        JOIN master_timesheet_statuses s ON s.id=t.status_id
        WHERE t.employee_id=%s AND s.name='Approved'
        AND EXTRACT(MONTH FROM t.week_ending)=EXTRACT(MONTH FROM CURRENT_DATE)""", (emp_id,))['n']
    # Flatten emp dict + stats so JS can use e.first_name, e.email etc. directly
    result = dict(emp) if emp else {}
    result['leaves_taken']       = float(leaves_taken)
    result['leave_balance']      = max(0, 18 - float(leaves_taken))
    result['pending_leaves']     = pending_leaves
    result['pending_ts']         = pending_ts
    result['pending_timesheets'] = pending_ts
    result['approved_hours_mtd'] = float(approved_hours)
    result['notifications']      = 0
    return ok(result)

@portal_bp.route('/team')
@require_auth
def team():
    emp_id = _get_emp_id()
    if not emp_id: return err("No employee profile linked", 400)
    emp = db_row1("SELECT reporting_manager_id FROM employees WHERE id=%s", (emp_id,))
    mgr_id = emp['reporting_manager_id'] if emp else None
    manager   = db_row1("""SELECT id, first_name, last_name, job_title, email, department_id, photo_url
        FROM employees WHERE id=%s""", (mgr_id,)) if mgr_id else None
    reportees = db_rows("""SELECT id, first_name, last_name, job_title, email,
        department_id, photo_url FROM employees
        WHERE reporting_manager_id=%s AND is_active=1""", (emp_id,))
    peers     = db_rows("""SELECT id, first_name, last_name, job_title, email, photo_url
        FROM employees WHERE reporting_manager_id=%s AND id!=%s AND is_active=1""",
        (mgr_id, emp_id)) if mgr_id else []
    return ok({"manager": manager, "reportees": reportees, "peers": peers})

@portal_bp.route('/payslips')
@require_auth
def payslips():
    emp_id = _get_emp_id()
    if not emp_id: return err("No employee profile linked", 400)
    rows = db_rows("""SELECT pe.*, pr.month, pr.year FROM payroll_entries pe
        LEFT JOIN payroll_runs pr ON pr.id=pe.payroll_run_id
        WHERE pe.employee_id=%s ORDER BY pe.created_at DESC""", (emp_id,))
    return ok(rows)
