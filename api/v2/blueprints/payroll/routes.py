"""
Payroll Blueprint — runs, entries, CBX file generation
"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth
from ...utils.responses import ok, created, err, not_found
import json, datetime

payroll_bp = Blueprint('payroll', __name__, url_prefix='/api/v2')

def _ensure_payroll():
    """Create payroll tables if they don't exist yet."""
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS payroll_runs (
            id SERIAL PRIMARY KEY, month INTEGER NOT NULL, year INTEGER NOT NULL,
            run_date DATE DEFAULT CURRENT_DATE, status TEXT DEFAULT 'New',
            processed_by INTEGER, total_net_salary NUMERIC(12,2) DEFAULT 0,
            cbx_file_content TEXT, notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
            is_active INTEGER DEFAULT 1)""")
        cur.execute("""CREATE TABLE IF NOT EXISTS payroll_entries (
            id SERIAL PRIMARY KEY, payroll_run_id INTEGER REFERENCES payroll_runs(id),
            employee_id INTEGER REFERENCES employees(id),
            loss_of_pay NUMERIC(10,2) DEFAULT 0,
            basic NUMERIC(10,2) DEFAULT 0, hra NUMERIC(10,2) DEFAULT 0,
            conveyance NUMERIC(10,2) DEFAULT 0, medical NUMERIC(10,2) DEFAULT 0,
            special NUMERIC(10,2) DEFAULT 0, incentive NUMERIC(10,2) DEFAULT 0,
            other_earnings NUMERIC(10,2) DEFAULT 0, gross_salary NUMERIC(10,2) DEFAULT 0,
            prof_tax NUMERIC(10,2) DEFAULT 0, esi NUMERIC(10,2) DEFAULT 0,
            tds NUMERIC(10,2) DEFAULT 0, epf NUMERIC(10,2) DEFAULT 0,
            medical_deduction NUMERIC(10,2) DEFAULT 0, advance NUMERIC(10,2) DEFAULT 0,
            other_deductions NUMERIC(10,2) DEFAULT 0, total_deductions NUMERIC(10,2) DEFAULT 0,
            net_salary NUMERIC(10,2) DEFAULT 0, ctc NUMERIC(10,2) DEFAULT 0,
            is_approved INTEGER DEFAULT 0, approval_notes TEXT,
            created_at TIMESTAMP DEFAULT NOW())""")
        conn.close()
    except Exception as ex:
        print(f"[payroll] ensure tables: {ex}", flush=True)

@payroll_bp.route('/payroll/runs', methods=['GET'])
@require_auth
def list_runs():
    _ensure_payroll()
    try:
        runs = db_rows("""SELECT pr.*,
            e.first_name||' '||e.last_name as processed_by_name,
            COUNT(pe.id) as employee_count
            FROM payroll_runs pr
            LEFT JOIN employees e ON e.id = pr.processed_by
            LEFT JOIN payroll_entries pe ON pe.payroll_run_id = pr.id
            WHERE pr.is_active = 1
            GROUP BY pr.id, e.first_name, e.last_name
            ORDER BY pr.year DESC, pr.month DESC""")
        return ok({'items': runs, 'total': len(runs)})
    except Exception as ex:
        return ok({'items': [], 'total': 0})

@payroll_bp.route('/payroll/runs', methods=['POST'])
@require_auth
def create_run():
    _ensure_payroll()
    d = request.get_json() or {}
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""INSERT INTO payroll_runs (month, year, status, processed_by)
            VALUES (%s,%s,'New',%s) RETURNING id""",
            (d.get('month', datetime.date.today().month),
             d.get('year',  datetime.date.today().year),
             g.user.get('id')))
        run_id = cur.fetchone()['id']
        # Update optional fields that may not exist on old tables
        try:
            cur.execute("UPDATE payroll_runs SET run_date=%s, notes=%s WHERE id=%s",
                (d.get('run_date', str(datetime.date.today())), d.get('notes'), run_id))
        except Exception: pass

        # Insert entries from parsed payroll data
        entries = d.get('entries', [])
        for entry in entries:
            gross = sum([
                float(entry.get('basic',0)), float(entry.get('hra',0)),
                float(entry.get('conveyance',0)), float(entry.get('medical',0)),
                float(entry.get('special',0)), float(entry.get('incentive',0)),
                float(entry.get('other_earnings',0))
            ])
            total_ded = sum([
                float(entry.get('prof_tax',0)), float(entry.get('esi',0)),
                float(entry.get('tds',0)), float(entry.get('epf',0)),
                float(entry.get('medical_deduction',0)), float(entry.get('advance',0)),
                float(entry.get('other_deductions',0))
            ])
            net = gross - total_ded - float(entry.get('loss_of_pay', 0))
            cur.execute("""INSERT INTO payroll_entries
                (payroll_run_id, employee_id, loss_of_pay, basic, hra, conveyance, medical,
                 special, incentive, other_earnings, gross_salary, prof_tax, esi, tds, epf,
                 medical_deduction, advance, other_deductions, total_deductions, net_salary, ctc)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (run_id, entry.get('employee_id'),
                 entry.get('loss_of_pay',0), entry.get('basic',0), entry.get('hra',0),
                 entry.get('conveyance',0), entry.get('medical',0), entry.get('special',0),
                 entry.get('incentive',0), entry.get('other_earnings',0), gross,
                 entry.get('prof_tax',0), entry.get('esi',0), entry.get('tds',0),
                 entry.get('epf',0), entry.get('medical_deduction',0), entry.get('advance',0),
                 entry.get('other_deductions',0), total_ded, net, entry.get('ctc',0)))
        conn.close()
        return created({'id': run_id})
    except Exception as ex:
        return err(str(ex))

@payroll_bp.route('/payroll/runs/<int:rid>', methods=['GET','PUT'])
@require_auth
def run_detail(rid):
    _ensure_payroll()
    if request.method == 'PUT':
        d = request.get_json() or {}
        allowed = ['status','notes','total_net_salary']
        sets = ', '.join(f"{k}=%s" for k in d if k in allowed)
        vals = [d[k] for k in d if k in allowed]
        if sets:
            db_execute(f"UPDATE payroll_runs SET {sets}, updated_at=NOW() WHERE id=%s",
                      vals + [rid])
        return ok(message="Updated")

    try:
        run = db_row1("SELECT * FROM payroll_runs WHERE id=%s", (rid,))
        if not run: return not_found("Payroll run")
        entries = db_rows("""SELECT pe.*,
            e.first_name||' '||e.last_name as employee_name,
            e.emp_id, e.designation, e.email as personal_email,
            d.name as department_name, l.name as location_name,
            e.bank_account_number, e.bank_ifsc
            FROM payroll_entries pe
            JOIN employees e ON e.id = pe.employee_id
            LEFT JOIN departments d ON d.id = e.department_id
            LEFT JOIN office_locations l ON l.id = e.location_id
            WHERE pe.payroll_run_id = %s
            ORDER BY e.first_name""", (rid,))
        return ok({'run': run, 'entries': entries})
    except Exception as ex:
        return err(str(ex))

@payroll_bp.route('/payroll/runs/<int:rid>/entries', methods=['PUT'])
@require_auth
def update_entries(rid):
    """Bulk update entries for a payroll run."""
    entries = request.get_json() or []
    for entry in entries:
        eid = entry.get('id')
        if not eid: continue
        gross = sum([float(entry.get(k,0)) for k in ['basic','hra','conveyance','medical','special','incentive','other_earnings']])
        total_ded = sum([float(entry.get(k,0)) for k in ['prof_tax','esi','tds','epf','medical_deduction','advance','other_deductions']])
        net = gross - total_ded - float(entry.get('loss_of_pay',0))
        db_execute("""UPDATE payroll_entries SET
            loss_of_pay=%s, basic=%s, hra=%s, conveyance=%s, medical=%s,
            special=%s, incentive=%s, other_earnings=%s, gross_salary=%s,
            prof_tax=%s, esi=%s, tds=%s, epf=%s, medical_deduction=%s,
            advance=%s, other_deductions=%s, total_deductions=%s, net_salary=%s
            WHERE id=%s""",
            (entry.get('loss_of_pay',0), entry.get('basic',0), entry.get('hra',0),
             entry.get('conveyance',0), entry.get('medical',0), entry.get('special',0),
             entry.get('incentive',0), entry.get('other_earnings',0), gross,
             entry.get('prof_tax',0), entry.get('esi',0), entry.get('tds',0),
             entry.get('epf',0), entry.get('medical_deduction',0), entry.get('advance',0),
             entry.get('other_deductions',0), total_ded, net, eid))
        # Update run total
    total_net = db_row1("SELECT SUM(net_salary) as t FROM payroll_entries WHERE payroll_run_id=%s", (rid,))
    db_execute("UPDATE payroll_runs SET total_net_salary=%s WHERE id=%s",
               (total_net['t'] or 0, rid))
    return ok(message="Updated")

@payroll_bp.route('/payroll/runs/<int:rid>/approve', methods=['POST'])
@require_auth
def approve_run(rid):
    d = request.get_json() or {}
    action = d.get('action', 'approve')
    if action == 'approve':
        db_execute("UPDATE payroll_runs SET status='Approved', processed_by=%s WHERE id=%s",
                  (g.user.get('employee_id'), rid))
        db_execute("UPDATE payroll_entries SET is_approved=1 WHERE payroll_run_id=%s", (rid,))
    elif action == 'reject':
        db_execute("UPDATE payroll_runs SET status='Rejected', notes=%s WHERE id=%s",
                  (d.get('reason',''), rid))
    elif action == 'process':
        db_execute("UPDATE payroll_runs SET status='Processed' WHERE id=%s", (rid,))
    return ok(message=f"Payroll {action}d")

@payroll_bp.route('/payroll/runs/<int:rid>/cbx', methods=['GET'])
@require_auth
def generate_cbx(rid):
    """Generate CBX file in required format."""
    try:
        run = db_row1("SELECT * FROM payroll_runs WHERE id=%s", (rid,))
        if not run: return not_found("Payroll run")
        entries = db_rows("""SELECT pe.net_salary,
            e.first_name||' '||e.last_name as employee_name,
            e.bank_account_number, e.bank_ifsc, e.email as personal_email
            FROM payroll_entries pe
            JOIN employees e ON e.id = pe.employee_id
            WHERE pe.payroll_run_id = %s AND pe.is_approved = 1""", (rid,))

        run_date = run.get('run_date') or datetime.date.today()
        if isinstance(run_date, str):
            run_date = datetime.date.fromisoformat(run_date)
        date_str = run_date.strftime('%d/%m/%Y')

        lines = []
        for e in entries:
            acc = e.get('bank_account_number') or ''
            net = str(int(float(e.get('net_salary') or 0)))
            name = e.get('employee_name') or ''
            ifsc = e.get('bank_ifsc') or ''
            email = e.get('personal_email') or ''
            # Format: N,,{AccountNo},{NetSalary},{Name},,,,,,,,,,,,,,,,,,{Date},,{IFSC},,,{Email}
            line = f"N,,{acc},{net},{name},,,,,,,,,,,,,,,,,,{date_str},,{ifsc},,,{email}"
            lines.append(line)

        cbx_content = '\n'.join(lines)
        # Save to run
        db_execute("UPDATE payroll_runs SET cbx_file_content=%s, status='Processed' WHERE id=%s",
                  (cbx_content, rid))
        return ok({'content': cbx_content, 'filename': f"payroll_{run.get('month')}_{run.get('year')}.txt"})
    except Exception as ex:
        return err(str(ex))

@payroll_bp.route('/payroll/runs/<int:rid>/payslips', methods=['GET'])
@require_auth
def generate_payslips(rid):
    """Return payslip data for all employees in a run."""
    try:
        entries = db_rows("""SELECT pe.*,
            e.first_name||' '||e.last_name as employee_name, e.emp_id,
            e.designation, e.email, d.name as department_name
            FROM payroll_entries pe
            JOIN employees e ON e.id = pe.employee_id
            LEFT JOIN departments d ON d.id = e.department_id
            WHERE pe.payroll_run_id = %s ORDER BY e.first_name""", (rid,))
        return ok(entries)
    except Exception as ex:
        return err(str(ex))
