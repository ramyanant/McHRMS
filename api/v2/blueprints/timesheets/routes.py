"""
Timesheets & Leave Blueprint
============================================================
Core workflow:
  Employee submits timesheet → Reporting Manager gets notified
  Manager approves/rejects → Employee sees status update
  Same for Leave requests
"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found, forbidden
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

ts_bp = Blueprint('timesheets', __name__, url_prefix='/api/v1')

def _get_status_id(name):
    r = db_row1("SELECT id FROM master_timesheet_statuses WHERE name=%s", (name,))
    return r['id'] if r else None

def _notify_manager(emp_id, title, message, link):
    """Create an in-app notification for the reporting manager of an employee."""
    try:
        mgr = db_row1("""SELECT u.id FROM employees e
            JOIN users u ON u.employee_id=e.reporting_manager_id
            WHERE e.id=%s AND e.reporting_manager_id IS NOT NULL LIMIT 1""", (emp_id,))
        if mgr:
            db_execute("""INSERT INTO notifications (user_id, type, title, body, link, module)
                VALUES (%s,'approval',%s,%s,%s,'timesheets')""",
                (mgr['id'], title, message, link))
    except Exception as e:
        print(f"[notify] {e}", flush=True)

def _notify_employee(emp_id, title, message, link):
    """Notify employee of approval decision."""
    try:
        usr = db_row1("SELECT id FROM users WHERE employee_id=%s LIMIT 1", (emp_id,))
        if usr:
            db_execute("""INSERT INTO notifications (user_id, type, title, body, link, module)
                VALUES (%s,'status',%s,%s,%s,'timesheets')""",
                (usr['id'], title, message, link))
    except Exception as e:
        print(f"[notify] {e}", flush=True)

# ════════════════════════════════════════════════════════════
# MY TIMESHEETS (Employee self-service)
# ════════════════════════════════════════════════════════════
@ts_bp.route('/my/timesheets', methods=['GET'])
@require_auth
def my_timesheets():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile linked", 400)
    rows = db_rows("""SELECT t.*, s.name as status, c.name as client_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN clients c ON c.id=t.client_id
        WHERE t.employee_id=%s ORDER BY t.week_ending DESC""", (emp_id,))
    return ok(rows)

@ts_bp.route('/my/timesheets', methods=['POST'])
@require_auth
def submit_my_timesheet():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile linked", 400)
    d = request.get_json() or {}
    try: validate(d, {'week_ending': ['required', 'date']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    regular_hours  = float(d.get('regular_hours', 0) or d.get('mon', 0))
    overtime_hours = float(d.get('overtime_hours', 0))
    # Sum daily hours if provided
    for day in ['mon','tue','wed','thu','fri','sat','sun']:
        if day in d: regular_hours += float(d.get(day, 0) or 0)
    if any(k in d for k in ['mon','tue','wed','thu','fri']):
        regular_hours = sum(float(d.get(k,0) or 0) for k in ['mon','tue','wed','thu','fri','sat','sun'])

    # Use requested status or default to 'Pending'
    requested_status = d.get('status', 'Pending')
    # Map common names to canonical status names
    status_map = {'In Progress': 'In Progress', 'Draft': 'In Progress', 
                  'Submitted': 'Pending', 'Pending': 'Pending'}
    canonical = status_map.get(requested_status, 'Pending')
    status_id = _get_status_id(canonical) or _get_status_id('Pending')
    pending_id = status_id
    emp = db_row1("SELECT reporting_manager_id, first_name, last_name FROM employees WHERE id=%s", (emp_id,))

    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    try:
        cur.execute("""INSERT INTO timesheets
            (employee_id, client_id, project, week_ending,
             regular_hours, overtime_hours, bill_rate, status_id, notes, submitted_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id""",
            (emp_id, d.get('client_id'), d.get('project',''),
             d['week_ending'], regular_hours, overtime_hours,
             d.get('bill_rate', 0), pending_id, d.get('notes','')))
    except Exception:
        # Fallback: v1 schema without overtime_hours column
        cur.execute("""INSERT INTO timesheets
            (employee_id, client_id, project, week_ending,
             regular_hours, bill_rate, status_id, notes, submitted_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id""",
            (emp_id, d.get('client_id'), d.get('project',''),
             d['week_ending'], regular_hours,
             d.get('bill_rate', 0), status_id, d.get('notes','')))
    tid = cur.fetchone()['id']; conn.close()

    # Notify reporting manager
    name = f"{emp['first_name']} {emp['last_name']}" if emp else 'Employee'
    _notify_manager(emp_id, 'Timesheet Awaiting Approval',
        f"{name} submitted a timesheet for week ending {d['week_ending']}",
        f"/portal/approvals")
    write_audit_log('timesheets', 'CREATE', 'timesheet', tid,
                    f"Timesheet submitted for week ending {d['week_ending']}")
    return created({'id': tid})

# ════════════════════════════════════════════════════════════
# ALL TIMESHEETS (Admin / Manager view)
# ════════════════════════════════════════════════════════════
@ts_bp.route('/timesheets', methods=['GET'])
@require_auth
def list_timesheets():
    page, per_page = get_page_params()
    emp_id    = request.args.get('employee_id')
    status    = request.args.get('status')
    week      = request.args.get('week_ending')
    client_id = request.args.get('client_id')
    where, params = ["1=1"], []
    if emp_id:    where.append("t.employee_id=%s");  params.append(emp_id)
    if status:    where.append("s.name=%s");          params.append(status)
    if week:      where.append("t.week_ending=%s");   params.append(week)
    if client_id: where.append("t.client_id=%s");     params.append(client_id)
    clause = " AND ".join(where)
    total  = db_row1(f"""SELECT COUNT(*) as n FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE {clause}""", params)['n']
    rows   = db_rows(f"""SELECT t.*, s.name as status,
        e.first_name||' '||e.last_name as employee_name, e.emp_id,
        c.name as client_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN employees e ON e.id=t.employee_id
        LEFT JOIN clients c ON c.id=t.client_id
        WHERE {clause} ORDER BY t.week_ending DESC, e.first_name
        LIMIT %s OFFSET %s""", params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@ts_bp.route('/timesheets/<int:tid>', methods=['GET','PUT'])
@require_auth
def timesheet_detail(tid):
    ts = db_row1("""SELECT t.*, s.name as status,
        e.first_name||' '||e.last_name as employee_name, e.emp_id, e.reporting_manager_id,
        c.name as client_name,
        ab.first_name||' '||ab.last_name as approved_by_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN employees e ON e.id=t.employee_id
        LEFT JOIN clients c ON c.id=t.client_id
        LEFT JOIN employees ab ON ab.id=t.approved_by
        WHERE t.id=%s""", (tid,))
    if not ts: return not_found("Timesheet")
    if request.method == 'GET': return ok(ts)
    d = request.get_json() or {}
    new_status = d.get('status')
    if new_status in ('Approved','Rejected'):
        approver_emp_id = g.user.get('employee_id')
        sid = _get_status_id(new_status)
        db_execute("""UPDATE timesheets SET status_id=%s, approved_by=%s,
            approved_at=NOW() WHERE id=%s""",
            (sid, approver_emp_id, tid))
        # Notify employee
        _notify_employee(ts['employee_id'],
            f"Timesheet {new_status}",
            f"Your timesheet for week ending {ts['week_ending']} was {new_status.lower()}",
            "/portal/timesheets")
        write_audit_log('timesheets', new_status.upper(), 'timesheet', tid,
                        f"Timesheet {new_status.lower()} by manager")
    else:
        # Edit notes only (hours editable on non-generated-col setups)
        try:
            r = float(d.get('regular_hours', ts['regular_hours'] or 0))
            o = float(d.get('overtime_hours', ts['overtime_hours'] or 0))
            db_execute("UPDATE timesheets SET regular_hours=%s, overtime_hours=%s, notes=%s WHERE id=%s",
                      (r, o, d.get('notes', ts['notes']), tid))
        except Exception:
            # total_hours may be GENERATED ALWAYS - just update notes
            if d.get('notes') is not None:
                db_execute("UPDATE timesheets SET notes=%s WHERE id=%s",
                          (d.get('notes', ts['notes']), tid))
    return ok(message="Updated")

# ════════════════════════════════════════════════════════════
# MANAGER APPROVAL QUEUE
# ════════════════════════════════════════════════════════════
@ts_bp.route('/timesheets/pending-approvals', methods=['GET'])
@require_auth
def pending_approvals():
    """All pending items for the current user's approval queue."""
    emp_id = g.user.get('employee_id')
    if not emp_id:
        # Fall back to email lookup - handles Employee role users who are also managers
        emp = db_row1("SELECT id FROM employees WHERE email=%s AND is_active=1",
                      (g.user.get('email',''),))
        if not emp:
            uname = g.user.get('username','')
            emp = db_row1("SELECT id FROM employees WHERE email=%s AND is_active=1", (uname,))
        if emp: emp_id = emp['id']
    if not emp_id: return ok({'timesheets': [], 'leaves': [], 'total': 0})

    # Get direct reports
    team = db_rows("SELECT id FROM employees WHERE reporting_manager_id=%s AND is_active=1", (emp_id,))
    if not team: return ok({'timesheets': [], 'leaves': [], 'total': 0})
    team_ids = [t['id'] for t in team]
    ph = ','.join(['%s']*len(team_ids))
    pending_id = _get_status_id('Pending')

    ts = db_rows(f"""SELECT t.*, s.name as status,
        e.first_name||' '||e.last_name as employee_name, e.emp_id, c.name as client_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN employees e ON e.id=t.employee_id
        LEFT JOIN clients c ON c.id=t.client_id
        WHERE t.employee_id IN ({ph}) AND t.status_id=%s
        ORDER BY t.submitted_at""", team_ids + [pending_id])

    leaves = db_rows(f"""SELECT l.*, e.first_name||' '||e.last_name as employee_name, e.emp_id
        FROM employee_leaves l
        JOIN employees e ON e.id=l.employee_id
        WHERE l.employee_id IN ({ph}) AND l.status='Pending'
        ORDER BY l.applied_at""", team_ids)

    return ok({'timesheets': ts, 'leaves': leaves, 'total': len(ts)+len(leaves)})

# ════════════════════════════════════════════════════════════
# LEAVE — Employee
# ════════════════════════════════════════════════════════════
@ts_bp.route('/my/leaves', methods=['GET'])
@require_auth
def my_leaves():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile", 400)
    return ok(db_rows("""SELECT l.*, a.first_name||' '||a.last_name as approved_by_name
        FROM employee_leaves l LEFT JOIN employees a ON a.id=l.approved_by
        WHERE l.employee_id=%s ORDER BY l.from_date DESC""", (emp_id,)))

@ts_bp.route('/my/leave-balance', methods=['GET'])
@require_auth
def my_leave_balance():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile", 400)
    from datetime import datetime
    year = datetime.now().year
    taken   = db_row1("""SELECT COALESCE(SUM(days),0) as n FROM employee_leaves
        WHERE employee_id=%s AND status='Approved'
        AND EXTRACT(YEAR FROM from_date)=%s""", (emp_id, year))['n']
    pending = db_row1("SELECT COALESCE(SUM(days),0) as n FROM employee_leaves WHERE employee_id=%s AND status='Pending'", (emp_id,))['n']
    annual_entitlement = 18
    return ok({
        'total':   annual_entitlement,
        'taken':   float(taken),
        'pending': float(pending),
        'balance': float(annual_entitlement - taken - pending),
    })

@ts_bp.route('/my/leaves', methods=['POST'])
@require_auth
def apply_leave():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile", 400)
    d = request.get_json() or {}
    try: validate(d, {'from_date':['required','date'], 'to_date':['required','date'], 'leave_type':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    from datetime import datetime
    try:
        days = (datetime.strptime(d['to_date'],'%Y-%m-%d') - datetime.strptime(d['from_date'],'%Y-%m-%d')).days + 1
    except: days = float(d.get('days', 1))
    actual_days = float(d.get('days', days)) or days

    # Check for overlapping leaves
    overlap = db_row1("""SELECT id FROM employee_leaves
        WHERE employee_id=%s AND status != 'Rejected'
        AND (from_date, to_date) OVERLAPS (%s::date, %s::date)""",
        (emp_id, d['from_date'], d['to_date']))
    if overlap: return err("You already have a leave request overlapping these dates")

    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("""INSERT INTO employee_leaves (employee_id, leave_type, from_date, to_date, days, reason)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
        (emp_id, d['leave_type'], d['from_date'], d['to_date'], actual_days, d.get('reason','')))
    lid = cur.fetchone()['id']; conn.close()

    emp = db_row1("SELECT first_name, last_name FROM employees WHERE id=%s", (emp_id,))
    name = f"{emp['first_name']} {emp['last_name']}" if emp else 'Employee'
    _notify_manager(emp_id, 'Leave Request Awaiting Approval',
        f"{name} applied for {d['leave_type']} leave from {d['from_date']} to {d['to_date']} ({actual_days} days)",
        "/portal/approvals")
    write_audit_log('leaves','CREATE','leave',lid,f"Leave applied: {d['leave_type']} {d['from_date']}→{d['to_date']}")
    return created({'id': lid})

@ts_bp.route('/my/leaves/<int:lid>', methods=['PUT','DELETE'])
@require_auth
def leave_detail(lid):
    leave = db_row1("SELECT * FROM employee_leaves WHERE id=%s", (lid,))
    if not leave: return not_found("Leave")
    emp_id = g.user.get('employee_id')

    if request.method == 'DELETE':
        if leave['employee_id'] != emp_id: return forbidden()
        if leave['status'] != 'Pending': return err("Can only cancel pending leaves")
        db_execute("DELETE FROM employee_leaves WHERE id=%s", (lid,))
        return ok(message="Cancelled")

    # PUT — approve/reject by manager
    d = request.get_json() or {}
    action = d.get('action','approve')
    status = 'Approved' if action == 'approve' else 'Rejected'
    approver_emp_id = g.user.get('employee_id')
    db_execute("""UPDATE employee_leaves SET status=%s, approved_by=%s,
        approved_at=NOW(), rejection_reason=%s, updated_at=NOW() WHERE id=%s""",
        (status, approver_emp_id, d.get('reason'), lid))
    _notify_employee(leave['employee_id'], f"Leave {status}",
        f"Your {leave['leave_type']} leave request was {status.lower()}",
        "/portal/leaves")
    write_audit_log('leaves', action.upper(), 'leave', lid, f"Leave {status.lower()}")
    return ok(message=f"Leave {status.lower()}")

# Admin leave management
@ts_bp.route('/leaves', methods=['GET'])
@require_auth
def list_all_leaves():
    page, per_page = get_page_params()
    status = request.args.get('status','')
    emp_id = request.args.get('employee_id','')
    where, params = ["1=1"],[]
    if status: where.append("l.status=%s"); params.append(status)
    if emp_id: where.append("l.employee_id=%s"); params.append(emp_id)
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM employee_leaves l WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT l.*, e.first_name||' '||e.last_name as employee_name, e.emp_id,
        a.first_name||' '||a.last_name as approved_by_name
        FROM employee_leaves l
        JOIN employees e ON e.id=l.employee_id
        LEFT JOIN employees a ON a.id=l.approved_by
        WHERE {clause} ORDER BY l.applied_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})
