"""People Blueprint — v1 schema compatible"""
import psycopg2
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role, hash_password
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found, forbidden
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

people_bp = Blueprint('people', __name__, url_prefix='/api/v2')

def _int(v):
    """Safely convert to int or None — handles empty strings from dropdowns."""
    try: return int(v) if v not in (None, '', 'null', 'undefined') else None
    except (ValueError, TypeError): return None

def _float(v, d=0):
    """Safely convert to float or default."""
    try: return float(v) if v not in (None, '', 'null', 'undefined') else d
    except (ValueError, TypeError): return d

# ── Employee List ─────────────────────────────────────────────
@people_bp.route('/employees', methods=['GET'])
@require_auth
def list_employees():
    page, per_page = get_page_params()
    search  = request.args.get('q', '').strip()
    dept_id = request.args.get('department_id')
    status  = request.args.get('status', '')

    where, params = ["e.is_active=1"], []
    if search:
        where.append("(e.first_name ILIKE %s OR e.last_name ILIKE %s OR e.emp_id ILIKE %s OR e.email ILIKE %s)")
        params += [f'%{search}%'] * 4
    if dept_id:
        where.append("e.department_id=%s"); params.append(dept_id)
    if status:
        where.append("e.status=%s"); params.append(status)

    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM employees e WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT e.id, e.emp_id, e.first_name, e.last_name, e.email, e.phone,
        e.job_title, e.status, e.start_date, e.location, e.is_active,
        d.name as department_name, et.name as employment_type,
        c.name as client_name,
        rm.first_name||' '||rm.last_name as reporting_manager_name
        FROM employees e
        LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        LEFT JOIN clients c ON c.id=e.client_id
        LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
        WHERE {clause} ORDER BY e.first_name, e.last_name
        LIMIT %s OFFSET %s""", params + [per_page, (page-1)*per_page])

    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total + per_page - 1) // per_page})

@people_bp.route('/employees', methods=['POST'])
@require_auth
@require_role('Admin', 'HR Manager')
def create_employee():  # v1779206157
    d = request.get_json() or {}
    try:
        validate(d, {'first_name': ['required'], 'last_name': ['required']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)

    # Format validations
    import re as _re
    if d.get('pan') and not _re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', str(d['pan']).upper()):
        return err("PAN must be in format ABCDE1234F", 400)
    if d.get('aadhaar') and not _re.match(r'^\d{12}$', str(d['aadhaar']).replace(' ','')):
        return err("Aadhaar must be 12 digits", 400)
    if d.get('email') and not _re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', str(d['email'])):
        return err("Invalid email format", 400)

    # Check email uniqueness
    if d.get('email'):
        existing = db_row1("SELECT id FROM employees WHERE email=%s AND is_active=1", (d['email'],))
        if existing:
            return err(f"Email {d['email']} is already registered to another employee", 409)

    # Generate emp_id — reads prefix and start from app_settings
    _prefix_row = db_row1("SELECT value FROM app_settings WHERE key='emp_id_prefix'")
    _start_row  = db_row1("SELECT value FROM app_settings WHERE key='emp_id_start'")
    _prefix     = (_prefix_row['value'] if _prefix_row else None) or 'EMP-'
    _start      = int(_start_row['value']) if _start_row and str(_start_row['value']).isdigit() else 1001

    # Find last emp_id with this prefix
    last = db_row1(
        "SELECT emp_id FROM employees WHERE emp_id LIKE %s ORDER BY id DESC LIMIT 1",
        (_prefix + '%',)
    )
    try:
        if last and last.get('emp_id'):
            suffix = str(last['emp_id'])[len(_prefix):]
            next_n = int(suffix) + 1 if suffix.isdigit() else _start
        else:
            next_n = _start
    except Exception:
        next_n = _start
    emp_id = f"{_prefix}{next_n}"

    try:
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""INSERT INTO employees
            (emp_id, first_name, middle_name, last_name, email, phone,
             personal_email, personal_phone, job_title, department_id,
             employment_type_id, location, office_location_id,
             reporting_manager_id, client_id, salary, bill_rate,
             start_date, status, pan, aadhaar, pf_number, esi_number,
             bank_name, bank_account_number, bank_ifsc)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id""",
            (emp_id, d.get('first_name'), d.get('middle_name'), d.get('last_name'),
             d.get('email') or None, d.get('phone') or None,
             d.get('personal_email') or None, d.get('personal_phone') or None,
             d.get('job_title') or None, _int(d.get('department_id')),
             _int(d.get('employment_type_id')),
             d.get('location') or None, _int(d.get('office_location_id')),
             _int(d.get('reporting_manager_id')), _int(d.get('client_id')),
             _float(d.get('salary'), 0), _float(d.get('bill_rate'), 0),
             d.get('start_date') or None, d.get('status') or 'Active',
             d.get('pan') or None, d.get('aadhaar') or None,
             d.get('pf_number') or None, d.get('esi_number') or None,
             d.get('bank_name') or None, d.get('bank_account_number') or None,
             d.get('bank_ifsc') or None))
        row = cur.fetchone()
        eid = row['id'] if isinstance(row, dict) else row[0]
        conn.close()
    except Exception as insert_err:
        try: conn.close()
        except: pass
        print(f"[CREATE EMPLOYEE ERROR] {insert_err}", flush=True)
        return err(f"Failed to create employee: {insert_err}", 500)

    # ── Auto-create user account for new employee ─────────────────────────
    try:
        import re as _re
        # Build username: firstname.lastname (lowercase, no special chars)
        first = _re.sub(r'[^a-z0-9]', '', d.get('first_name','').lower().strip())
        last  = _re.sub(r'[^a-z0-9]', '', d.get('last_name', '').lower().strip())
        base_username = f"{first}.{last}"

        # Ensure username is unique — append number if taken
        username = base_username
        suffix = 1
        while db_row1("SELECT id FROM users WHERE username=%s", (username,)):
            username = f"{base_username}{suffix}"
            suffix += 1

        # Default password: Employee123 — hashed via the middleware helper
        # (bcrypt when available, salted-SHA256 fallback). Earlier this used
        # plain `hashlib.sha256("Employee123").hexdigest()` (unsalted, no
        # work factor); the verify path keeps accepting that legacy shape
        # so existing accounts aren't disturbed.
        pw_hash = hash_password("Employee123")

        # Get Employee role id
        emp_role = db_row1("SELECT id FROM master_user_roles WHERE name='Employee' LIMIT 1")
        if not emp_role:
            emp_role = db_row1("SELECT id FROM master_user_roles ORDER BY id LIMIT 1")

        if emp_role:
            db_execute(
                """INSERT INTO users
                    (username, email, password_hash, role_id, full_name,
                     employee_id, is_active, must_change_pwd)
                   VALUES (%s,%s,%s,%s,%s,%s,1,1)""",
                (username,
                 d.get('email') or f"{username}@mcraan.com",
                 pw_hash,
                 emp_role['id'],
                 f"{d['first_name']} {d['last_name']}",
                 eid)
            )
            print(f"[create_employee] User account created: {username}", flush=True)
        else:
            print("[create_employee] Warning: no role found for auto-user", flush=True)
    except Exception as user_err:
        # User creation failure must NOT block employee creation
        print(f"[create_employee] User auto-create error: {user_err}", flush=True)

    write_audit_log('employees', 'CREATE', 'employee', eid,
                    f"Employee created: {d['first_name']} {d['last_name']} ({emp_id})")
    # Build username to return in response (same logic as above)
    try:
        import re as _re2
        _first = _re2.sub(r'[^a-z0-9]', '', d.get('first_name','').lower())
        _last  = _re2.sub(r'[^a-z0-9]', '', d.get('last_name', '').lower())
        _created_user = db_row1("SELECT username FROM users WHERE employee_id=%s", (eid,))
        _username = _created_user['username'] if _created_user else f"{_first}.{_last}"
    except Exception:
        _username = None
    return created({'id': eid, 'emp_id': emp_id, 'username': _username})

# ── Employee Detail ───────────────────────────────────────────
@people_bp.route('/employees/<int:eid>', methods=['GET','PUT','DELETE'])
@require_auth
def employee_detail(eid):
    emp = db_row1("""SELECT e.*,
        d.name as department_name,
        et.name as employment_type,
        c.name as client_name,
        rm.first_name||' '||rm.last_name as reporting_manager_name,
        b.name as business_unit_name,
        u.username as login_username,
        u.must_change_pwd as must_change_pwd
        FROM employees e
        LEFT JOIN users u ON u.employee_id=e.id AND u.is_active=1
        LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        LEFT JOIN clients c ON c.id=e.client_id
        LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
        LEFT JOIN business_units b ON b.id=e.business_unit_id
        WHERE e.id=%s AND e.is_active=1""", (eid,))
    if not emp: return not_found("Employee")

    if g.user['role'] == 'Employee' and g.user.get('employee_id') != eid:
        return forbidden()

    if request.method == 'GET': return ok(emp)

    if request.method == 'PUT':
        d = request.get_json() or {}
        before = dict(emp)
        # Only update fields that actually exist in v1 schema
        updatable = ['first_name','middle_name','last_name','email','phone','job_title',
                     'department_id','employment_type_id','reporting_manager_id',
                     'office_location_id','client_id','start_date','end_date',
                     'status','pan','aadhaar','passport_number','pf_number','esi_number',
                     'salary','bill_rate','bank_name','bank_account_number','bank_ifsc',
                     'location','rating','personal_email','personal_phone','notice_period',
                     'gender','dob','marital_status','nationality','blood_group',
                     'business_unit_id','salary_structure','project','designation',
                     'is_active','photo_url','bank_branch','account_holder_name',
                     'linkedin_url','designation','gender','dob','marital_status',
                     'nationality','blood_group','notice_period']
        updates = {k: d[k] for k in updatable if k in d}
        # Coerce FK integer fields — empty strings crash PostgreSQL INT columns
        _int_fks = {'department_id','office_location_id','reporting_manager_id',
                    'client_id','employment_type_id','business_unit_id','cost_centre_id'}
        for k in _int_fks:
            if k in updates:
                updates[k] = _int(updates[k])
        # Coerce float fields
        for k in ('salary','bill_rate'):
            if k in updates:
                updates[k] = _float(updates[k], 0)
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE employees SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [eid])
        write_audit_log('employees', 'UPDATE', 'employee', eid,
                        f"Employee updated: {emp['first_name']} {emp['last_name']}",
                        before_value=before, after_value=updates)
        return ok(message="Updated")

    # Soft delete — set inactive
    db_execute("UPDATE employees SET is_active=0, status='Inactive', updated_at=NOW() WHERE id=%s", (eid,))
    write_audit_log('employees', 'DELETE', 'employee', eid,
                    f"Employee deactivated: {emp['first_name']} {emp['last_name']}")
    return ok(message="Deactivated")

# ── Employee Sub-resources ────────────────────────────────────
@people_bp.route('/employees/<int:eid>/addresses', methods=['GET','POST'])
@require_auth
def emp_addresses(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_addresses WHERE employee_id=%s", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_addresses
        (employee_id, address_type, address_line1, address_line2, city, state_id, pincode, country_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('address_type','Current'), d.get('line1'), d.get('line2'),
         d.get('city'), d.get('state_id'), d.get('pincode'), d.get('country_id')), returning=True)
    return created({'id': result['id']})

@people_bp.route('/employees/<int:eid>/education', methods=['GET','POST'])
@require_auth
def emp_education(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_education WHERE employee_id=%s ORDER BY end_year DESC", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_education
        (employee_id, institution, degree, field_of_study, start_year, end_year, grade)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('institution'), d.get('degree'), d.get('field_of_study'),
         d.get('start_year'), d.get('end_year'), d.get('grade')), returning=True)
    return created({'id': result['id']})

@people_bp.route('/employees/<int:eid>/experience', methods=['GET','POST'])
@require_auth
def emp_experience(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_experience WHERE employee_id=%s ORDER BY start_date DESC", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_experience
        (employee_id, company, designation, location, start_date, end_date, is_current, description)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('company'), d.get('designation'), d.get('location'),
         d.get('start_date'), d.get('end_date'), d.get('is_current', 0),
         d.get('description')), returning=True)
    return created({'id': result['id']})

@people_bp.route('/employees/<int:eid>/emergency-contacts', methods=['GET','POST'])
@require_auth
def emp_emergency(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=%s", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_emergency_contacts
        (employee_id, name, phone, email, relationship, is_primary)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('name'), d.get('phone'), d.get('email'),
         d.get('relationship'), d.get('is_primary', 0)), returning=True)
    return created({'id': result['id']})

@people_bp.route('/employees/<int:eid>/leaves', methods=['GET'])
@require_auth
def emp_leaves(eid):
    return ok(db_rows("""SELECT l.*, a.first_name||' '||a.last_name as approved_by_name
        FROM employee_leaves l
        LEFT JOIN employees a ON a.id=l.approved_by
        WHERE l.employee_id=%s ORDER BY l.from_date DESC""", (eid,)))

# ── Users ─────────────────────────────────────────────────────
@people_bp.route('/users', methods=['GET'])
@require_auth
@require_role('Admin')
def list_users():
    rows = db_rows("""SELECT u.id, u.username, u.email, u.full_name, u.is_active,
        u.last_login, u.employee_id, r.name as role,
        e.first_name||' '||e.last_name as employee_name
        FROM users u
        JOIN master_user_roles r ON r.id=u.role_id
        LEFT JOIN employees e ON e.id=u.employee_id
        WHERE u.is_active=1
        ORDER BY u.username""")
    return ok(rows)

@people_bp.route('/users', methods=['POST'])
@require_auth
@require_role('Admin')
def create_user():
    d = request.get_json() or {}
    try:
        validate(d, {'username':['required','min:3'], 'email':['required','email'],
                     'password':['required','min:8'], 'role_id':['required']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)

    existing = db_row1("SELECT id FROM users WHERE username=%s OR email=%s", (d['username'], d['email']))
    if existing: return err("Username or email already exists")

    pw_hash = hash_password(d['password'])
    result = db_execute("""INSERT INTO users
        (username, email, password_hash, role_id, full_name, employee_id, is_active, must_change_pwd)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['username'], d['email'], pw_hash, d['role_id'], d.get('full_name'),
         d.get('employee_id'), 1, 1), returning=True)
    write_audit_log('admin', 'CREATE', 'user', result['id'], f"User created: {d['username']}")
    return created({'id': result['id']})

@people_bp.route('/users/<int:uid>', methods=['GET','PUT','DELETE'])
@require_auth
@require_role('Admin')
def user_detail(uid):
    user = db_row1("""SELECT u.*, r.name as role FROM users u
        JOIN master_user_roles r ON r.id=u.role_id WHERE u.id=%s""", (uid,))
    if not user: return not_found("User")
    if request.method == 'GET': return ok(user)
    if request.method == 'PUT':
        d = request.get_json() or {}
        updates = {}
        if 'role_id'    in d: updates['role_id']    = d['role_id']
        if 'employee_id'in d: updates['employee_id']= d['employee_id']
        if 'full_name'  in d: updates['full_name']  = d['full_name']
        if 'is_active'  in d: updates['is_active']  = 1 if d['is_active'] else 0
        if d.get('password'):
            updates['password_hash'] = hash_password(d['password'])
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE users SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [uid])
        write_audit_log('admin', 'UPDATE', 'user', uid, f"User updated: {user['username']}")
        return ok(message="Updated")
    db_execute("UPDATE users SET is_active=0 WHERE id=%s", (uid,))
    return ok(message="Deactivated")

# ── Roles ─────────────────────────────────────────────────────
@people_bp.route('/roles', methods=['GET'])
@require_auth
def list_roles():
    return ok(db_rows("SELECT * FROM master_user_roles WHERE is_active=1 ORDER BY name"))

@people_bp.route('/roles', methods=['POST'])
@require_auth
@require_role('Admin')
def create_role():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("INSERT INTO master_user_roles (name, description) VALUES (%s,%s) RETURNING id",
        (d['name'], d.get('description')), returning=True)
    return created({'id': result['id']})

# ── Masters ────────────────────────────────────────────────────
@people_bp.route('/masters/all')
@require_auth
def masters_all():
    return ok({
        'user-roles':          db_rows("SELECT id, name FROM master_user_roles WHERE is_active=1 ORDER BY name"),
        'employment-types':    db_rows("SELECT id, name FROM master_employment_types WHERE is_active=1"),
        'contract-types':      db_rows("SELECT id, name FROM master_contract_types WHERE is_active=1"),
        'timesheet-statuses':  db_rows("SELECT id, name FROM master_timesheet_statuses"),
        'invoice-statuses':    db_rows("SELECT id, name FROM master_invoice_statuses WHERE is_active=1"),
        'candidate-sources':   db_rows("SELECT id, name FROM master_candidate_sources WHERE is_active=1"),
        'application-stages':  db_rows("SELECT id, name FROM master_application_stages WHERE is_active=1 ORDER BY sort_order"),
        'interview-formats':   db_rows("SELECT id, name FROM master_interview_formats WHERE is_active=1"),
        'payment-terms':       db_rows("SELECT id, name, days FROM master_payment_terms WHERE is_active=1"),
        'priority-levels':     db_rows("SELECT id, name FROM master_priority_levels WHERE is_active=1 ORDER BY sort_order"),
        'vendor-categories':   db_rows("SELECT id, name FROM master_vendor_categories WHERE is_active=1"),
        'business-units':      db_rows("SELECT id, name FROM business_units WHERE is_active=1 ORDER BY name"),
        'departments':         db_rows("SELECT id, name, business_unit_id FROM departments WHERE is_active=1 ORDER BY name"),
        'cost-centres':        db_rows("SELECT id, name, code FROM cost_centres WHERE is_active=1 ORDER BY name"),
        'locations':           db_rows("SELECT id, name, city FROM office_locations WHERE is_active=1 ORDER BY name"),
        'employees-lookup':    db_rows("SELECT id, emp_id, first_name||' '||last_name as name FROM employees WHERE is_active=1 ORDER BY first_name"),
        'clients-lookup':      db_rows("SELECT id, name FROM clients WHERE is_active=1 ORDER BY name"),
    })

@people_bp.route('/lookup/employees')
@require_auth
def lookup_employees():
    return ok(db_rows("""SELECT id, emp_id, first_name||' '||last_name as name, job_title, email
        FROM employees WHERE is_active=1 ORDER BY first_name"""))


@people_bp.route('/roles/<int:rid>/permissions', methods=['GET','POST'])
@require_auth
def role_permissions(rid):
    """Get or set permissions for a role."""
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS role_permissions (
            id SERIAL PRIMARY KEY, role_id INTEGER NOT NULL,
            module TEXT NOT NULL, can_view INTEGER DEFAULT 0,
            can_create INTEGER DEFAULT 0, can_edit INTEGER DEFAULT 0,
            can_delete INTEGER DEFAULT 0,
            UNIQUE(role_id, module))""")
        conn.close()
    except Exception: pass

    if request.method == 'GET':
        perms = db_rows("SELECT * FROM role_permissions WHERE role_id=%s", (rid,))
        return ok(perms)

    # POST: save permission matrix
    d = request.get_json() or {}
    permissions = d.get('permissions', [])
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    for perm in permissions:
        cur.execute("""INSERT INTO role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (role_id, module) DO UPDATE SET
            can_view=%s, can_create=%s, can_edit=%s, can_delete=%s""",
            (rid, perm['module'],
             perm.get('can_view',0), perm.get('can_create',0), perm.get('can_edit',0), perm.get('can_delete',0),
             perm.get('can_view',0), perm.get('can_create',0), perm.get('can_edit',0), perm.get('can_delete',0)))
    conn.close()
    write_audit_log('admin', 'UPDATE', 'role_permissions', rid, f"Permissions updated for role {rid}")
    return ok(message="Permissions saved")


@people_bp.route('/employees/documents', methods=['GET','POST'])
@require_auth
def my_employee_documents():
    """Employee self-service: list/upload own documents."""
    emp_id = g.user.get('employee_id')
    if not emp_id:
        emp = db_row1("SELECT id FROM employees WHERE email=%s LIMIT 1", (g.user.get('email',''),))
        if emp: emp_id = emp['id']
    if not emp_id: return err("No employee profile linked")

    if request.method == 'GET':
        try:
            docs = db_rows("""SELECT id, doc_type, doc_name, file_size, mime_type, uploaded_at
                FROM employee_documents WHERE employee_id=%s AND is_active=1
                ORDER BY uploaded_at DESC""", (emp_id,))
            return ok(docs)
        except Exception: return ok([])

    d = request.get_json() or {}
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS employee_documents (
            id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
            doc_type TEXT, doc_name TEXT NOT NULL, file_data TEXT, file_size TEXT,
            mime_type TEXT, is_active INTEGER DEFAULT 1,
            uploaded_at TIMESTAMP DEFAULT NOW())""")
        cur.execute("""INSERT INTO employee_documents (employee_id, doc_type, doc_name, file_data, file_size, mime_type)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
            (emp_id, d.get('doc_type'), d.get('doc_name'), d.get('file_data'),
             d.get('file_size'), d.get('mime_type')))
        doc_id = cur.fetchone()['id']; conn.close()
        return created({'id': doc_id})
    except Exception as e: return err(str(e))

@people_bp.route('/employees/documents/<int:did>', methods=['GET','PUT','DELETE'])
@require_auth
def employee_document(did):
    doc = db_row1("SELECT * FROM employee_documents WHERE id=%s", (did,))
    if not doc: return not_found("Document")
    if request.method == 'GET': return ok(doc)
    if request.method == 'DELETE':
        db_execute("UPDATE employee_documents SET is_active=0 WHERE id=%s", (did,))
        return ok(message="Removed")
    d = request.get_json() or {}
    if 'is_active' in d:
        db_execute("UPDATE employee_documents SET is_active=%s WHERE id=%s", (d['is_active'], did))
    return ok(message="Updated")

@people_bp.route('/employees/<int:eid>/documents', methods=['GET','POST'])
@require_auth
def employee_documents_admin(eid):
    """Admin view of employee documents."""
    if request.method == 'GET':
        try:
            docs = db_rows("SELECT id, doc_type, doc_name, file_size, mime_type, file_data, notes, uploaded_at FROM employee_documents WHERE employee_id=%s AND is_active=1 ORDER BY uploaded_at DESC", (eid,))
            return ok(docs)
        except Exception: return ok([])
    d = request.get_json() or {}
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS employee_documents (
            id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
            doc_type TEXT, doc_name TEXT NOT NULL, file_data TEXT, file_size TEXT,
            mime_type TEXT, is_active INTEGER DEFAULT 1, uploaded_at TIMESTAMP DEFAULT NOW())""")
        cur.execute("INSERT INTO employee_documents (employee_id, doc_type, doc_name, file_data, file_size, mime_type) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
            (eid, d.get('doc_type'), d.get('doc_name'), d.get('file_data'), d.get('file_size'), d.get('mime_type')))
        doc_id = cur.fetchone()['id']; conn.close()
        return created({'id': doc_id})
    except Exception as e: return err(str(e))


@people_bp.route('/employees/<int:eid>/documents/<int:did>', methods=['GET','PUT','DELETE'])
@require_auth
def employee_doc_admin(eid, did):
    if request.method == 'GET':
        doc = db_row1("SELECT * FROM employee_documents WHERE id=%s AND employee_id=%s", (did, eid))
        return ok(doc) if doc else not_found("Document")
    d = request.get_json() or {}
    if 'is_active' in d:
        db_execute("UPDATE employee_documents SET is_active=%s WHERE id=%s AND employee_id=%s",
                  (d['is_active'], did, eid))
    return ok(message="Updated")
