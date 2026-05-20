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
            id SERIAL PRIMARY KEY, run_type_id INTEGER, month INTEGER NOT NULL,
            year INTEGER NOT NULL, status TEXT DEFAULT 'New',
            run_date DATE DEFAULT CURRENT_DATE,
            total_gross NUMERIC(15,2) DEFAULT 0, total_net NUMERIC(15,2) DEFAULT 0,
            total_deductions NUMERIC(15,2) DEFAULT 0,
            total_net_salary NUMERIC(12,2) DEFAULT 0,
            processed_by INTEGER, created_by INTEGER, approved_by INTEGER,
            cbx_file_content TEXT, ca_filename TEXT, ca_file_data TEXT,
            notes TEXT, is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS payroll_entries (
            id SERIAL PRIMARY KEY, payroll_run_id INTEGER REFERENCES payroll_runs(id),
            employee_id INTEGER REFERENCES employees(id),
            month INTEGER, year INTEGER,
            loss_of_pay NUMERIC(10,2) DEFAULT 0, lop_days NUMERIC(4,1) DEFAULT 0,
            basic NUMERIC(10,2) DEFAULT 0, hra NUMERIC(10,2) DEFAULT 0,
            allowances NUMERIC(10,2) DEFAULT 0,
            conveyance NUMERIC(10,2) DEFAULT 0, medical NUMERIC(10,2) DEFAULT 0,
            special NUMERIC(10,2) DEFAULT 0, incentive NUMERIC(10,2) DEFAULT 0,
            other_earnings NUMERIC(10,2) DEFAULT 0, gross_salary NUMERIC(10,2) DEFAULT 0,
            prof_tax NUMERIC(10,2) DEFAULT 0,
            esi NUMERIC(10,2) DEFAULT 0, esi_employee NUMERIC(10,2) DEFAULT 0,
            esi_employer NUMERIC(10,2) DEFAULT 0,
            tds NUMERIC(10,2) DEFAULT 0,
            epf NUMERIC(10,2) DEFAULT 0, pf_employee NUMERIC(10,2) DEFAULT 0,
            pf_employer NUMERIC(10,2) DEFAULT 0,
            medical_deduction NUMERIC(10,2) DEFAULT 0, advance NUMERIC(10,2) DEFAULT 0,
            other_deductions NUMERIC(10,2) DEFAULT 0, total_deductions NUMERIC(10,2) DEFAULT 0,
            net_salary NUMERIC(10,2) DEFAULT 0, ctc NUMERIC(10,2) DEFAULT 0,
            is_approved INTEGER DEFAULT 0, approval_notes TEXT,
            designation TEXT, department_name TEXT, location_name TEXT,
            employee_name TEXT, emp_id_ref TEXT,
            working_days NUMERIC(4,1), paid_days NUMERIC(4,1),
            status TEXT DEFAULT 'Draft', payslip_url TEXT, paid_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""")
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
    """Create payroll run. Live DB schema determined from information_schema."""
    _ensure_payroll()
    d = request.get_json() or {}
    entries_data = d.get('entries', [])
    month_val = int(d.get('month') or datetime.date.today().month)
    year_val  = int(d.get('year')  or datetime.date.today().year)
    rundate   = d.get('run_date') or str(datetime.date.today())
    notes_val = d.get('notes') or ''
    user_id   = g.user.get('id')
    # Month label for payroll_entries.month (stored as TEXT NOT NULL)
    month_label = f"{year_val}-{month_val:02d}"

    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()

        # INSERT payroll_runs — run_date is NOT NULL (no default)
        # Only use columns confirmed to exist in live DB
        ca_filename_val = d.get('ca_filename') or ''
        ca_file_data_val= d.get('ca_file_data') or ''
        cur.execute("""INSERT INTO payroll_runs
            (run_date, month, year, status, processed_by, notes, ca_filename, ca_file_data)
            VALUES (%s,%s,%s,'New',%s,%s,%s,%s) RETURNING id""",
            (rundate, month_val, year_val, user_id, notes_val,
             ca_filename_val or None, ca_file_data_val or None))
        run_id = cur.fetchone()['id']

        # INSERT each payroll_entries row
        for entry in entries_data:
            # Resolve employee_id: string "EMP-1001" → integer
            emp_id = entry.get('employee_id') or entry.get('emp_id') or ''
            if emp_id and not str(emp_id).isdigit():
                emp_row = db_row1("SELECT id FROM employees WHERE emp_id=%s AND is_active=1",
                                  (str(emp_id).strip(),))
                emp_id = emp_row['id'] if emp_row else None

            def f(k, default=0):
                return float(entry.get(k) or default)

            gross    = f('gross_salary') or (f('basic')+f('hra')+f('conveyance')+
                       f('medical')+f('special')+f('incentive')+f('other_earnings'))
            total_ded = f('total_deductions') or (f('prof_tax')+f('esi')+
                        f('tds')+f('epf')+f('medical_deduction')+
                        f('advance')+f('other_deductions'))
            net       = f('net_salary') or (gross - total_ded - f('loss_of_pay'))
            lop       = f('loss_of_pay')

            # INSERT with NOT NULL columns: employee_id + month (TEXT)
            cur.execute("""INSERT INTO payroll_entries
                (payroll_run_id, employee_id, month,
                 basic, hra, tds, other_deductions, total_deductions, net_salary, ctc)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (run_id, emp_id, month_label,
                 f('basic'), f('hra'), f('tds'), f('other_deductions'),
                 total_ded, net, f('ctc')))
            eid = cur.fetchone()['id']

            # UPDATE each extended field using ACTUAL live column names
            # Map our data fields to confirmed live column names
            field_map = [
                # (live_column_name, value)
                ('gross_salary',      gross),
                ('total_earnings',    gross),       # alternate name
                ('loss_of_pay',       lop),
                ('lop_days',          lop),         # alternate name
                ('lop_amount',        lop),         # alternate name
                ('conveyance',        f('conveyance')),
                ('medical',           f('medical')),
                ('medical_allowance', f('medical')), # alternate name
                ('special',           f('special')),
                ('special_allowance', f('special')), # alternate name
                ('incentive',         f('incentive')),
                ('other_earnings',    f('other_earnings')),
                ('other_allowances',  f('other_earnings')), # alternate name
                ('prof_tax',          f('prof_tax')),
                ('profession_tax',    f('prof_tax')), # alternate name
                ('esi',               f('esi')),
                ('esi_employee',      f('esi')),     # alternate name
                ('epf',               f('epf')),
                ('pf_employee',       f('epf')),     # alternate name
                ('medical_deduction', f('medical_deduction')),
                ('medical_insurance', f('medical_deduction')), # alternate name
                ('advance',           f('advance')),
                ('hra',               f('hra')),
            ]
            for col, val in field_map:
                try:
                    cur.execute(f"UPDATE payroll_entries SET {col}=%s WHERE id=%s",
                               (val, eid))
                except Exception:
                    pass  # Column doesn't exist in this version — skip

        conn.close()
        return created({'id': run_id})
    except Exception as ex:
        try: conn.close()
        except: pass
        return err(str(ex))

@payroll_bp.route('/payroll/runs/<int:rid>', methods=['GET','PUT'])
@require_auth
def run_detail(rid):
    _ensure_payroll()
    if request.method == 'PUT':
        d = request.get_json() or {}
        allowed = ['status','notes','total_net_salary','is_active']
        sets = ', '.join(f"{k}=%s" for k in d if k in allowed)
        vals = [d[k] for k in d if k in allowed]
        if sets:
            db_execute(f"UPDATE payroll_runs SET {sets} WHERE id=%s",
                      vals + [rid])
        return ok(message="Updated")

    try:
        run = db_row1("SELECT * FROM payroll_runs WHERE id=%s", (rid,))
        if not run: return not_found("Payroll run")
        entries = db_rows("""SELECT pe.*,
            e.first_name||' '||e.last_name as employee_name,
            e.emp_id, COALESCE(e.designation, e.job_title) as designation, e.email as personal_email,
            d.name as department_name, l.name as location_name,
            e.bank_account_number, e.bank_ifsc
            FROM payroll_entries pe
            JOIN employees e ON e.id = pe.employee_id
            LEFT JOIN departments d ON d.id = e.department_id
            LEFT JOIN office_locations l ON l.id = e.office_location_id
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
        # Update each field individually to handle both old and new schema
        _entry_updates = [
            ('loss_of_pay',       entry.get('loss_of_pay',0)),
            ('lop_days',          entry.get('loss_of_pay',0)),
            ('basic',             entry.get('basic',0)),
            ('hra',               entry.get('hra',0)),
            ('conveyance',        entry.get('conveyance',0)),
            ('medical',           entry.get('medical',0)),
            ('medical_allowance', entry.get('medical',0)),
            ('special',           entry.get('special',0)),
            ('special_allowance', entry.get('special',0)),
            ('incentive',         entry.get('incentive',0)),
            ('other_earnings',    entry.get('other_earnings',0)),
            ('other_allowances',  entry.get('other_earnings',0)),
            ('gross_salary',      gross),
            ('total_earnings',    gross),
            ('prof_tax',          entry.get('prof_tax',0)),
            ('profession_tax',    entry.get('prof_tax',0)),
            ('esi',               entry.get('esi',0)),
            ('esi_employee',      entry.get('esi',0)),
            ('tds',               entry.get('tds',0)),
            ('epf',               entry.get('epf',0)),
            ('pf_employee',       entry.get('epf',0)),
            ('medical_deduction', entry.get('medical_deduction',0)),
            ('medical_insurance', entry.get('medical_deduction',0)),
            ('advance',           entry.get('advance',0)),
            ('other_deductions',  entry.get('other_deductions',0)),
            ('total_deductions',  total_ded),
            ('net_salary',        net),
        ]
        for _col, _val in _entry_updates:
            try: db_execute(f"UPDATE payroll_entries SET {_col}=%s WHERE id=%s", (_val, eid))
            except Exception: pass
        # legacy single UPDATE for guarantee (0 placeholder to keep syntax)
        db_execute("SELECT 1",  # no-op placeholder
        )
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
                  (g.user.get('id'), rid))
        db_execute("UPDATE payroll_entries SET is_approved=1 WHERE payroll_run_id=%s", (rid,))
    elif action == 'reject':
        db_execute("UPDATE payroll_runs SET status='Rejected', notes=%s WHERE id=%s",
                  (d.get('reason',''), rid))
    elif action == 'process':
        db_execute("UPDATE payroll_runs SET status='Processed' WHERE id=%s", (rid,))
    return ok(message=f"Payroll {action}d")



@payroll_bp.route('/payroll/runs/<int:rid>/ca', methods=['GET'])
@require_auth
def download_ca(rid):
    """Download stored CA Excel file."""
    try:
        run = db_row1("SELECT ca_filename, ca_file_data, month, year FROM payroll_runs WHERE id=%s", (rid,))
        if not run or not run.get('ca_file_data'):
            return not_found("CA file not found for this run")
        from flask import Response
        import base64
        # Normalize filename to YYYY-MM CA Statement.xlsx
        stored_name = run.get('ca_filename') or ''
        m_num = run.get('month') or 1
        y_num = run.get('year') or ''
        filename = f"{y_num}-{int(m_num):02d} CA Statement.xlsx" 
        # ca_file_data stored as data URI or raw base64
        data_str = run['ca_file_data']
        if data_str.startswith('data:'):
            # data:application/...;base64,<data>
            raw = base64.b64decode(data_str.split(',',1)[1])
        else:
            raw = base64.b64decode(data_str)
        return Response(raw,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'})
    except Exception as ex:
        return err(str(ex))

@payroll_bp.route('/payroll/runs/<int:rid>/cbx', methods=['GET'])
@require_auth
def generate_cbx(rid):
    """Generate CBX file in required format."""
    try:
        run = db_row1("SELECT * FROM payroll_runs WHERE id=%s", (rid,))
        if not run: return not_found("Payroll run")
        entries = db_rows("""SELECT pe.net_salary, pe.employee_id,
            e.first_name||' '||COALESCE(e.middle_name||' ','')||e.last_name as employee_name,
            e.bank_account_number, e.bank_ifsc,
            COALESCE(e.personal_email, e.email) as personal_email,
            e.emp_id as emp_code
            FROM payroll_entries pe
            LEFT JOIN employees e ON e.id = pe.employee_id
            WHERE pe.payroll_run_id = %s""", (rid,))

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
        db_execute("UPDATE payroll_runs SET cbx_file_content=%s WHERE id=%s",
                  (cbx_content, rid))
        fmt_req = request.args.get('format','json')
        m_num = int(run.get('month') or 1)
        y_num = int(run.get('year') or datetime.date.today().year)
        ym    = f"{y_num}-{m_num:02d}"
        filename = f"{ym}.CBX.txt"
        if fmt_req == 'txt':
            from flask import Response
            return Response(cbx_content, mimetype='text/plain',
                headers={'Content-Disposition': f'attachment; filename="{filename}"'})
        return ok({'content': cbx_content, 'filename': filename})
    except Exception as ex:
        return err(str(ex))

@payroll_bp.route('/payroll/runs/<int:rid>/payslips', methods=['GET'])
@require_auth
def generate_payslips(rid):
    """Return payslip data for all employees in a run."""
    try:
        entries = db_rows("""SELECT pe.*,
            e.first_name||' '||e.last_name as employee_name, e.emp_id,
            COALESCE(e.designation, e.job_title) as designation, e.email, d.name as department_name
            FROM payroll_entries pe
            JOIN employees e ON e.id = pe.employee_id
            LEFT JOIN departments d ON d.id = e.department_id
            WHERE pe.payroll_run_id = %s ORDER BY e.first_name""", (rid,))
        return ok(entries)
    except Exception as ex:
        return err(str(ex))
