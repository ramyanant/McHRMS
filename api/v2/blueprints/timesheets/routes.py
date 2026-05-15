"""Timesheets Blueprint — submit, approve, history, manager queue"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found, forbidden
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

ts_bp = Blueprint('timesheets', __name__, url_prefix='/api/v1')

def _get_status_id(name):
    r = db_row1("SELECT id FROM master_timesheet_statuses WHERE name=%s", (name,))
    return r['id'] if r else None

# ── My Timesheets (employee self-service) ─────────────────────
@ts_bp.route('/my/timesheets', methods=['GET'])
@require_auth
def my_timesheets():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile linked", 400)
    rows = db_rows("""SELECT t.*, s.name as status, p.name as project_name, c.name as client_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN projects p ON p.id=t.project_id
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

    mon = float(d.get('mon', 0)); tue = float(d.get('tue', 0))
    wed = float(d.get('wed', 0)); thu = float(d.get('thu', 0))
    fri = float(d.get('fri', 0)); sat = float(d.get('sat', 0))
    sun = float(d.get('sun', 0))
    total = mon + tue + wed + thu + fri + sat + sun
    pending_id = _get_status_id('Pending')

    cur_obj = None
    from ...extensions import get_pg_conn
    conn = get_pg_conn()
    try:
        conn.autocommit = False
        cur_obj = conn.cursor()
        cur_obj.execute("""INSERT INTO timesheets
            (employee_id, project_id, client_id, week_ending,
             mon, tue, wed, thu, fri, sat, sun, total_hours, billable_hours,
             status_id, notes, submitted_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id""",
            (emp_id, d.get('project_id'), d.get('client_id'), d['week_ending'],
             mon, tue, wed, thu, fri, sat, sun, total, total,
             pending_id, d.get('notes')))
        tid = cur_obj.fetchone()['id']
        conn.commit()
    except Exception as ex:
        conn.rollback(); raise
    finally:
        conn.close()

    write_audit_log('timesheets', 'CREATE', 'timesheet', tid,
                    f"Timesheet submitted for week ending {d['week_ending']}")
    return created({'id': tid})

# ── All Timesheets (manager/admin) ─────────────────────────────
@ts_bp.route('/timesheets', methods=['GET'])
@require_auth
def list_timesheets():
    page, per_page = get_page_params()
    emp_id  = request.args.get('employee_id')
    status  = request.args.get('status')
    proj_id = request.args.get('project_id')

    where  = ["1=1"]
    params = []
    if emp_id:  where.append("t.employee_id=%s");  params.append(emp_id)
    if status:  where.append("s.name=%s");          params.append(status)
    if proj_id: where.append("t.project_id=%s");    params.append(proj_id)
    clause = " AND ".join(where)

    total = db_row1(f"""SELECT COUNT(*) as n FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        WHERE {clause}""", params)['n']
    rows  = db_rows(f"""SELECT t.*, s.name as status,
        e.first_name||' '||e.last_name as employee_name, e.emp_id,
        p.name as project_name, c.name as client_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN employees e ON e.id=t.employee_id
        LEFT JOIN projects p ON p.id=t.project_id
        LEFT JOIN clients c ON c.id=t.client_id
        WHERE {clause} ORDER BY t.week_ending DESC, e.first_name
        LIMIT %s OFFSET %s""", params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total + per_page - 1) // per_page})

@ts_bp.route('/timesheets/<int:tid>', methods=['GET','PUT'])
@require_auth
def timesheet_detail(tid):
    ts = db_row1("""SELECT t.*, s.name as status,
        e.first_name||' '||e.last_name as employee_name, e.emp_id,
        p.name as project_name, c.name as client_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN employees e ON e.id=t.employee_id
        LEFT JOIN projects p ON p.id=t.project_id
        LEFT JOIN clients c ON c.id=t.client_id
        WHERE t.id=%s""", (tid,))
    if not ts: return not_found("Timesheet")

    if request.method == 'GET': return ok(ts)

    d = request.get_json() or {}
    new_status = d.get('status')
    if new_status in ('Approved', 'Rejected'):
        # Manager approving — check they manage this employee
        approver_emp_id = g.user.get('employee_id')
        status_id = _get_status_id(new_status)
        db_execute("""UPDATE timesheets SET status_id=%s, approved_by=%s, approved_at=NOW(),
            rejection_reason=%s, updated_at=NOW() WHERE id=%s""",
            (status_id, approver_emp_id, d.get('rejection_reason'), tid))
        write_audit_log('timesheets', new_status.upper(), 'timesheet', tid,
                        f"Timesheet {new_status.lower()} for {ts['employee_name']}")
    else:
        # Edit hours
        mon = float(d.get('mon', ts['mon'] or 0))
        tue = float(d.get('tue', ts['tue'] or 0))
        wed = float(d.get('wed', ts['wed'] or 0))
        thu = float(d.get('thu', ts['thu'] or 0))
        fri = float(d.get('fri', ts['fri'] or 0))
        sat = float(d.get('sat', ts['sat'] or 0))
        sun = float(d.get('sun', ts['sun'] or 0))
        total = mon+tue+wed+thu+fri+sat+sun
        db_execute("""UPDATE timesheets SET mon=%s,tue=%s,wed=%s,thu=%s,fri=%s,sat=%s,sun=%s,
            total_hours=%s, notes=%s, updated_at=NOW() WHERE id=%s""",
            (mon,tue,wed,thu,fri,sat,sun,total,d.get('notes',ts['notes']),tid))
    return ok(message="Updated")

# ── Manager approval queue ────────────────────────────────────
@ts_bp.route('/timesheets/pending-approvals', methods=['GET'])
@require_auth
def pending_approvals():
    """Pending timesheets AND leaves for manager to action."""
    emp_id = g.user.get('employee_id')
    if not emp_id: return ok({'timesheets': [], 'leaves': []})
    pending_id = _get_status_id('Pending')

    team_ids = [r['id'] for r in db_rows(
        "SELECT id FROM employees WHERE reporting_manager_id=%s AND is_active=TRUE", (emp_id,))]
    if not team_ids:
        return ok({'timesheets': [], 'leaves': []})

    placeholders = ','.join(['%s'] * len(team_ids))
    ts = db_rows(f"""SELECT t.*, s.name as status,
        e.first_name||' '||e.last_name as employee_name, e.emp_id,
        p.name as project_name
        FROM timesheets t
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN employees e ON e.id=t.employee_id
        LEFT JOIN projects p ON p.id=t.project_id
        WHERE t.employee_id IN ({placeholders}) AND t.status_id=%s
        ORDER BY t.submitted_at""", team_ids + [pending_id])
    leaves = db_rows(f"""SELECT l.*, e.first_name||' '||e.last_name as employee_name, e.emp_id
        FROM employee_leaves l
        JOIN employees e ON e.id=l.employee_id
        WHERE l.employee_id IN ({placeholders}) AND l.status='Pending'
        ORDER BY l.applied_at""", team_ids)

    return ok({'timesheets': ts, 'leaves': leaves,
               'total': len(ts) + len(leaves)})

# ── Leave endpoints ────────────────────────────────────────────
@ts_bp.route('/my/leaves', methods=['GET'])
@require_auth
def my_leaves():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile", 400)
    return ok(db_rows("""SELECT l.*, a.first_name||' '||a.last_name as approved_by_name
        FROM employee_leaves l LEFT JOIN employees a ON a.id=l.approved_by
        WHERE l.employee_id=%s ORDER BY l.from_date DESC""", (emp_id,)))

@ts_bp.route('/my/leaves', methods=['POST'])
@require_auth
def apply_leave():
    emp_id = g.user.get('employee_id')
    if not emp_id: return err("No employee profile", 400)
    d = request.get_json() or {}
    try: validate(d, {'from_date': ['required','date'], 'to_date': ['required','date']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    from datetime import datetime as dt
    try:
        days = (dt.strptime(d['to_date'],'%Y-%m-%d') - dt.strptime(d['from_date'],'%Y-%m-%d')).days + 1
    except: days = float(d.get('days', 1))
    actual_days = float(d.get('days', days)) or days

    from ...extensions import get_pg_conn
    conn = get_pg_conn()
    try:
        conn.autocommit = False
        cur_obj = conn.cursor()
        cur_obj.execute("""INSERT INTO employee_leaves
            (employee_id, leave_type, from_date, to_date, days, reason)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
            (emp_id, d.get('leave_type','Annual'), d['from_date'], d['to_date'],
             actual_days, d.get('reason','')))
        lid = cur_obj.fetchone()['id']
        conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

    write_audit_log('leaves', 'CREATE', 'leave', lid,
                    f"Leave applied: {d['leave_type']} {d['from_date']} to {d['to_date']}")
    return created({'id': lid})

@ts_bp.route('/my/leaves/<int:lid>', methods=['PUT','DELETE'])
@require_auth
def leave_detail(lid):
    emp_id = g.user.get('employee_id')
    leave  = db_row1("SELECT * FROM employee_leaves WHERE id=%s", (lid,))
    if not leave: return not_found("Leave")
    if leave['employee_id'] != emp_id and g.user['role'] not in ('Admin','HR Manager'):
        return forbidden()

    if request.method == 'DELETE':
        if leave['status'] != 'Pending': return err("Can only cancel pending leaves")
        db_execute("DELETE FROM employee_leaves WHERE id=%s", (lid,))
        return ok(message="Cancelled")

    # PUT — approve/reject (manager/HR)
    d = request.get_json() or {}
    action = d.get('action', 'approve')
    status = 'Approved' if action == 'approve' else 'Rejected'
    approver_emp_id = g.user.get('employee_id')
    db_execute("""UPDATE employee_leaves SET status=%s, approved_by=%s,
        approved_at=NOW(), rejection_reason=%s, updated_at=NOW() WHERE id=%s""",
        (status, approver_emp_id, d.get('reason'), lid))
    write_audit_log('leaves', action.upper(), 'leave', lid,
                    f"Leave {status.lower()}")
    return ok(message=f"Leave {status.lower()}")
