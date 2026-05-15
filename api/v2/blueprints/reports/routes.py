"""Reports & Analytics Blueprint"""
from flask import Blueprint, request
from ...extensions import db_rows, db_row1
from ...middleware.auth import require_auth
from ...utils.responses import ok

reports_bp = Blueprint('reports', __name__, url_prefix='/api/v1/reports')

@reports_bp.route('/dashboard')
@require_auth
def dashboard():
    return ok({
        # KPIs
        'employees':       db_row1("SELECT COUNT(*) as n FROM employees WHERE is_active=TRUE AND deleted_at IS NULL")['n'],
        'open_jobs':       db_row1("SELECT COUNT(*) as n FROM job_requisitions WHERE status='Open' AND deleted_at IS NULL")['n'],
        'pending_ts':      db_row1("""SELECT COUNT(*) as n FROM timesheets t
            JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE s.name='Pending'""")['n'],
        'pending_invoices':db_row1("""SELECT COUNT(*) as n FROM invoices i
            JOIN master_invoice_statuses s ON s.id=i.status_id
            WHERE s.name NOT IN ('Paid','Cancelled') AND i.due_date < CURRENT_DATE""")['n'],
        # Recruitment funnel
        'pipeline': db_rows("""SELECT s.name as stage, s.color, COUNT(a.id) as count
            FROM master_application_stages s
            LEFT JOIN applications a ON a.stage_id=s.id
            GROUP BY s.id, s.name, s.color ORDER BY s.order_seq"""),
        # Recent activity
        'recent_hires': db_rows("""SELECT id, emp_id, first_name||' '||last_name as name,
            job_title, start_date FROM employees WHERE is_active=TRUE
            ORDER BY start_date DESC NULLS LAST LIMIT 5"""),
        'overdue_invoices': db_rows("""SELECT i.invoice_number, c.name as client,
            i.total_amount, i.due_date FROM invoices i
            JOIN clients c ON c.id=i.client_id
            JOIN master_invoice_statuses s ON s.id=i.status_id
            WHERE s.name NOT IN ('Paid','Cancelled') AND i.due_date < CURRENT_DATE
            ORDER BY i.due_date LIMIT 5"""),
    })

@reports_bp.route('/workforce')
@require_auth
def workforce():
    return ok({
        'by_department':   db_rows("""SELECT d.name as department, COUNT(e.id) as count
            FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.is_active=TRUE
            WHERE d.deleted_at IS NULL GROUP BY d.id, d.name ORDER BY count DESC"""),
        'by_status':       db_rows("""SELECT status, COUNT(*) as count FROM employees
            WHERE deleted_at IS NULL GROUP BY status"""),
        'by_employment_type': db_rows("""SELECT et.name as type, COUNT(e.id) as count
            FROM master_employment_types et
            LEFT JOIN employees e ON e.employment_type_id=et.id AND e.is_active=TRUE
            GROUP BY et.id, et.name ORDER BY count DESC"""),
        'by_location':     db_rows("""SELECT location, COUNT(*) as count FROM employees
            WHERE is_active=TRUE AND location IS NOT NULL GROUP BY location ORDER BY count DESC"""),
        'headcount_trend': db_rows("""SELECT DATE_TRUNC('month', start_date) as month, COUNT(*) as hires
            FROM employees WHERE start_date >= NOW() - INTERVAL '12 months'
            GROUP BY month ORDER BY month"""),
    })

@reports_bp.route('/recruitment')
@require_auth
def recruitment():
    return ok({
        'by_stage':        db_rows("""SELECT s.name, s.color, COUNT(a.id) as count
            FROM master_application_stages s
            LEFT JOIN applications a ON a.stage_id=s.id
            GROUP BY s.id, s.name, s.color ORDER BY s.order_seq"""),
        'by_source':       db_rows("""SELECT cs.name as source, COUNT(c.id) as count
            FROM master_candidate_sources cs
            LEFT JOIN candidates c ON c.source_id=cs.id AND c.deleted_at IS NULL
            GROUP BY cs.id, cs.name ORDER BY count DESC"""),
        'open_jobs_by_client': db_rows("""SELECT c.name as client, COUNT(j.id) as open_jobs
            FROM clients c JOIN job_requisitions j ON j.client_id=c.id
            WHERE j.status='Open' AND j.deleted_at IS NULL
            GROUP BY c.id, c.name ORDER BY open_jobs DESC"""),
        'offer_stats':     db_row1("""SELECT COUNT(*) as total,
            COUNT(*) FILTER(WHERE status='Accepted') as accepted,
            COUNT(*) FILTER(WHERE status='Rejected') as rejected,
            COUNT(*) FILTER(WHERE status='Sent') as pending
            FROM offers"""),
    })

@reports_bp.route('/timesheets')
@require_auth
def timesheets():
    return ok({
        'by_status':       db_rows("""SELECT s.name as status, COUNT(t.id) as count,
            COALESCE(SUM(t.total_hours),0) as total_hours
            FROM master_timesheet_statuses s
            LEFT JOIN timesheets t ON t.status_id=s.id
            GROUP BY s.name"""),
        'by_project':      db_rows("""SELECT p.name as project, COUNT(t.id) as entries,
            COALESCE(SUM(t.total_hours),0) as total_hours
            FROM projects p LEFT JOIN timesheets t ON t.project_id=p.id
            WHERE p.deleted_at IS NULL GROUP BY p.id, p.name
            ORDER BY total_hours DESC LIMIT 10"""),
        'utilization':     db_rows("""SELECT e.first_name||' '||e.last_name as employee,
            COALESCE(SUM(t.total_hours),0) as total_hours,
            COALESCE(SUM(t.billable_hours),0) as billable_hours
            FROM employees e LEFT JOIN timesheets t ON t.employee_id=e.id
            WHERE e.is_active=TRUE GROUP BY e.id, e.first_name, e.last_name
            ORDER BY billable_hours DESC LIMIT 20"""),
    })

@reports_bp.route('/invoices')
@require_auth
def invoice_report():
    return ok({
        'summary':         db_row1("""SELECT
            COALESCE(SUM(total_amount),0) as total_invoiced,
            COALESCE(SUM(amount_paid),0) as total_collected,
            COALESCE(SUM(balance_due),0) as total_outstanding FROM invoices"""),
        'aging':           db_rows("""SELECT
            SUM(CASE WHEN due_date >= CURRENT_DATE THEN balance_due ELSE 0 END) as current_due,
            SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE-30 THEN balance_due ELSE 0 END) as "30_days",
            SUM(CASE WHEN due_date < CURRENT_DATE-30 AND due_date >= CURRENT_DATE-60 THEN balance_due ELSE 0 END) as "60_days",
            SUM(CASE WHEN due_date < CURRENT_DATE-60 THEN balance_due ELSE 0 END) as "90_plus"
            FROM invoices WHERE balance_due > 0"""),
        'by_client':       db_rows("""SELECT c.name as client,
            COUNT(i.id) as invoice_count,
            COALESCE(SUM(i.total_amount),0) as total_amount,
            COALESCE(SUM(i.amount_paid),0) as paid,
            COALESCE(SUM(i.balance_due),0) as outstanding
            FROM clients c LEFT JOIN invoices i ON i.client_id=c.id
            WHERE c.deleted_at IS NULL GROUP BY c.id, c.name
            ORDER BY total_amount DESC LIMIT 20"""),
    })

@reports_bp.route('/leaves')
@require_auth
def leave_report():
    return ok({
        'by_type':  db_rows("""SELECT leave_type, COUNT(*) as requests,
            COALESCE(SUM(days),0) as total_days FROM employee_leaves GROUP BY leave_type"""),
        'by_status':db_rows("""SELECT status, COUNT(*) as count FROM employee_leaves GROUP BY status"""),
        'pending':  db_rows("""SELECT l.*, e.first_name||' '||e.last_name as employee_name, e.emp_id
            FROM employee_leaves l JOIN employees e ON e.id=l.employee_id
            WHERE l.status='Pending' ORDER BY l.applied_at"""),
    })
