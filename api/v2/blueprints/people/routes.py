"""People Blueprint — employees, users, roles, permissions"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute
from ...middleware.auth import require_auth, require_role, hash_password
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found, forbidden
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

people_bp = Blueprint('people', __name__, url_prefix='/api/v1')

# ── Employee List & Create ────────────────────────────────────
@people_bp.route('/employees', methods=['GET'])
@require_auth
def list_employees():
    page, per_page = get_page_params()
    search  = request.args.get('q', '').strip()
    dept_id = request.args.get('department_id')
    status  = request.args.get('status', '')
    
    where = ["e.deleted_at IS NULL"]
    params = []
    
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
        e.job_title, e.status, e.start_date, e.location,
        d.name as department_name, et.name as employment_type
        FROM employees e
        LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        WHERE {clause} ORDER BY e.first_name, e.last_name
        LIMIT %s OFFSET %s""", params + [per_page, (page-1)*per_page])
    
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total + per_page - 1) // per_page})

@people_bp.route('/employees', methods=['POST'])
@require_auth
@require_role('Admin', 'HR Manager')
def create_employee():
    d = request.get_json() or {}
    try:
        validate(d, {'first_name': ['required'], 'last_name': ['required']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)
    
    # Generate emp_id
    last = db_row1("SELECT emp_id FROM employees WHERE emp_id LIKE 'EMP-%' ORDER BY id DESC LIMIT 1")
    if last and last['emp_id']:
        try: next_n = int(last['emp_id'].split('-')[1]) + 1
        except: next_n = 1001
    else:
        next_n = 1001
    emp_id = f"EMP-{next_n}"
    
    result = db_execute("""
        INSERT INTO employees (emp_id, first_name, middle_name, last_name, email, phone,
            job_title, department_id, business_unit_id, employment_type_id,
            reporting_manager_id, office_location_id, client_id, cost_centre_id,
            start_date, status, pan, aadhaar, pf_number, uan,
            salary, bill_rate, location, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id""",
        (emp_id, d['first_name'], d.get('middle_name'), d['last_name'],
         d.get('email'), d.get('phone'), d.get('job_title'),
         d.get('department_id'), d.get('business_unit_id'), d.get('employment_type_id'),
         d.get('reporting_manager_id'), d.get('office_location_id'), d.get('client_id'),
         d.get('cost_centre_id'), d.get('start_date'), d.get('status','Active'),
         d.get('pan'), d.get('aadhaar'), d.get('pf_number'), d.get('uan'),
         d.get('salary'), d.get('bill_rate'), d.get('location'),
         g.user['id']), returning=True)
    
    write_audit_log('employees', 'CREATE', 'employee', result['id'],
                    f"Employee created: {d['first_name']} {d['last_name']} ({emp_id})",
                    after_value=d)
    return created({'id': result['id'], 'emp_id': emp_id})

# ── Employee Detail ───────────────────────────────────────────
@people_bp.route('/employees/<int:eid>', methods=['GET','PUT','DELETE'])
@require_auth
def employee_detail(eid):
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
        WHERE e.id=%s AND e.deleted_at IS NULL""", (eid,))
    if not emp: return not_found("Employee")
    
    # Self-service: employees can only view their own profile
    if g.user['role'] == 'Employee' and g.user.get('employee_id') != eid:
        return forbidden()
    
    if request.method == 'GET':
        return ok(emp)
    
    if request.method == 'PUT':
        d = request.get_json() or {}
        before = dict(emp)
        updatable = ['first_name','middle_name','last_name','email','phone','job_title',
                     'department_id','business_unit_id','employment_type_id','reporting_manager_id',
                     'office_location_id','client_id','cost_centre_id','start_date','end_date',
                     'status','pan','aadhaar','passport_number','pf_number','esi_number','uan',
                     'salary','bill_rate','bank_name','bank_account_number','bank_ifsc',
                     'location','nationality','gender','marital_status','dob','blood_group',
                     'personal_email','personal_phone','notice_period','notes']
        updates = {k: d[k] for k in updatable if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE employees SET {set_clause}, updated_at=NOW(), updated_by=%s WHERE id=%s",
                      list(updates.values()) + [g.user['id'], eid])
        write_audit_log('employees', 'UPDATE', 'employee', eid,
                        f"Employee updated: {emp['first_name']} {emp['last_name']}",
                        before_value=before, after_value=updates)
        return ok(message="Updated")
    
    # Soft delete
    db_execute("UPDATE employees SET deleted_at=NOW(), is_active=FALSE WHERE id=%s", (eid,))
    write_audit_log('employees', 'DELETE', 'employee', eid,
                    f"Employee deleted: {emp['first_name']} {emp['last_name']}")
    return ok(message="Deleted")

# ── Employee Sub-resources ────────────────────────────────────
@people_bp.route('/employees/<int:eid>/addresses', methods=['GET','POST'])
@require_auth
def emp_addresses(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_addresses WHERE employee_id=%s", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_addresses (employee_id,address_type,line1,line2,city,state,pincode,country)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('address_type','Current'), d.get('line1'), d.get('line2'),
         d.get('city'), d.get('state'), d.get('pincode'), d.get('country','India')), returning=True)
    return created({'id': result['id']})

@people_bp.route('/employees/<int:eid>/education', methods=['GET','POST'])
@require_auth
def emp_education(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_education WHERE employee_id=%s ORDER BY end_year DESC", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_education (employee_id,degree,institution,field_of_study,start_year,end_year,grade)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('degree'), d.get('institution'), d.get('field_of_study'),
         d.get('start_year'), d.get('end_year'), d.get('grade')), returning=True)
    return created({'id': result['id']})

@people_bp.route('/employees/<int:eid>/experience', methods=['GET','POST'])
@require_auth
def emp_experience(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_experience WHERE employee_id=%s ORDER BY start_date DESC", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_experience (employee_id,company,designation,start_date,end_date,description)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('company'), d.get('designation'), d.get('start_date'),
         d.get('end_date'), d.get('description')), returning=True)
    return created({'id': result['id']})

@people_bp.route('/employees/<int:eid>/emergency-contacts', methods=['GET','POST'])
@require_auth
def emp_emergency(eid):
    if request.method == 'GET':
        return ok(db_rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=%s", (eid,)))
    d = request.get_json() or {}
    result = db_execute("""INSERT INTO employee_emergency_contacts (employee_id,name,relationship,phone,email)
        VALUES (%s,%s,%s,%s,%s) RETURNING id""",
        (eid, d.get('name'), d.get('relationship'), d.get('phone'), d.get('email')), returning=True)
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
    if existing:
        return err("Username or email already exists")
    
    pw_hash = hash_password(d['password'])
    result  = db_execute("""INSERT INTO users (username, email, password_hash, role_id, full_name,
        employee_id, is_active, must_change_pwd, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['username'], d['email'], pw_hash, d['role_id'], d.get('full_name'),
         d.get('employee_id'), d.get('is_active', True),
         d.get('must_change_pwd', True), g.user['id']), returning=True)
    
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
        if 'role_id'      in d: updates['role_id']      = d['role_id']
        if 'employee_id'  in d: updates['employee_id']  = d['employee_id']
        if 'full_name'    in d: updates['full_name']     = d['full_name']
        if 'is_active'    in d: updates['is_active']     = d['is_active']
        if d.get('password'):
            updates['password_hash'] = hash_password(d['password'])
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE users SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [uid])
        write_audit_log('admin', 'UPDATE', 'user', uid, f"User updated: {user['username']}")
        return ok(message="Updated")
    db_execute("UPDATE users SET is_active=FALSE WHERE id=%s", (uid,))
    write_audit_log('admin', 'DELETE', 'user', uid, f"User deactivated: {user['username']}")
    return ok(message="Deactivated")

# ── Roles ─────────────────────────────────────────────────────
@people_bp.route('/roles', methods=['GET'])
@require_auth
def list_roles():
    return ok(db_rows("SELECT * FROM master_user_roles ORDER BY name"))

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
    """Load all master data needed for dropdowns in one call."""
    return ok({
        'user-roles':          db_rows("SELECT id, name FROM master_user_roles ORDER BY name"),
        'employment-types':    db_rows("SELECT id, name FROM master_employment_types WHERE is_active=TRUE"),
        'contract-types':      db_rows("SELECT id, name FROM master_contract_types WHERE is_active=TRUE"),
        'timesheet-statuses':  db_rows("SELECT id, name FROM master_timesheet_statuses"),
        'invoice-statuses':    db_rows("SELECT id, name FROM master_invoice_statuses"),
        'candidate-sources':   db_rows("SELECT id, name FROM master_candidate_sources WHERE is_active=TRUE"),
        'application-stages':  db_rows("SELECT id, name, color FROM master_application_stages ORDER BY order_seq"),
        'interview-formats':   db_rows("SELECT id, name FROM master_interview_formats"),
        'payment-terms':       db_rows("SELECT id, name, days FROM master_payment_terms"),
        'priority-levels':     db_rows("SELECT id, name, color FROM master_priority_levels"),
        'vendor-categories':   db_rows("SELECT id, name FROM master_vendor_categories WHERE is_active=TRUE"),
        'business-units':      db_rows("SELECT id, name, code FROM business_units WHERE deleted_at IS NULL AND is_active=TRUE ORDER BY name"),
        'departments':         db_rows("SELECT id, name, code, business_unit_id FROM departments WHERE deleted_at IS NULL AND is_active=TRUE ORDER BY name"),
        'cost-centres':        db_rows("SELECT id, name, code FROM cost_centres WHERE deleted_at IS NULL AND is_active=TRUE ORDER BY name"),
        'locations':           db_rows("SELECT id, name, city FROM office_locations WHERE deleted_at IS NULL AND is_active=TRUE ORDER BY name"),
        'employees-lookup':    db_rows("SELECT id, emp_id, first_name||' '||last_name as name FROM employees WHERE is_active=TRUE ORDER BY first_name"),
        'clients-lookup':      db_rows("SELECT id, name FROM clients WHERE deleted_at IS NULL ORDER BY name"),
    })

# ── Employee lookup ────────────────────────────────────────────
@people_bp.route('/lookup/employees')
@require_auth
def lookup_employees():
    return ok(db_rows("""SELECT id, emp_id, first_name||' '||last_name as name, job_title, email
        FROM employees WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY first_name"""))
