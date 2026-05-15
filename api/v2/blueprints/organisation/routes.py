"""Organisation Blueprint — profile, BUs, departments, cost centres, locations"""
from flask import Blueprint, request
from ...extensions import db_rows, db_row1, db_execute, get_db
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError

org_bp = Blueprint('organisation', __name__, url_prefix='/api/v1')

# ── Organisation Profile ──────────────────────────────────────
@org_bp.route('/organisation', methods=['GET'])
@require_auth
def get_organisation():
    org = db_row1("SELECT * FROM organisation LIMIT 1")
    if not org:
        return ok({})
    org['gst']   = db_rows("SELECT * FROM organisation_gst WHERE org_id=%s", (org['id'],))
    org['banks'] = db_rows("SELECT * FROM organisation_bank_accounts WHERE org_id=%s", (org['id'],))
    org['labour_certs'] = db_rows("SELECT * FROM organisation_labour_certs WHERE org_id=%s", (org['id'],))
    return ok(org)

@org_bp.route('/organisation', methods=['PUT'])
@require_auth
@require_role('Admin')
def update_organisation():
    d = request.get_json() or {}
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if org:
        fields = ['name','legal_name','type','pan','tan','cin','website','email','phone',
                  'address_line1','address_line2','city','state','pincode','country','logo_url']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE organisation SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [org['id']])
        write_audit_log('organisation', 'UPDATE', 'organisation', org['id'], 'Organisation profile updated')
    else:
        result = db_execute("""INSERT INTO organisation (name, legal_name, pan, tan, email, phone)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
            (d.get('name'), d.get('legal_name'), d.get('pan'), d.get('tan'),
             d.get('email'), d.get('phone')), returning=True)
        write_audit_log('organisation', 'CREATE', 'organisation', result['id'], 'Organisation created')
    return ok(message="Saved")

# ── Business Units ────────────────────────────────────────────
@org_bp.route('/business-units', methods=['GET'])
@require_auth
def list_business_units():
    rows = db_rows("""SELECT b.*, COUNT(d.id) as dept_count,
        COUNT(e.id) as headcount
        FROM business_units b
        LEFT JOIN departments d ON d.business_unit_id=b.id AND d.deleted_at IS NULL
        LEFT JOIN employees e ON e.business_unit_id=b.id AND e.is_active=TRUE
        WHERE b.deleted_at IS NULL
        GROUP BY b.id ORDER BY b.name""")
    return ok(rows)

@org_bp.route('/business-units', methods=['POST'])
@require_auth
@require_role('Admin', 'HR Manager')
def create_business_unit():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required', 'max:200']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute(
        "INSERT INTO business_units (name, code, created_by) VALUES (%s,%s,%s) RETURNING id",
        (d['name'], d.get('code'), request.environ.get('user_id')), returning=True)
    write_audit_log('organisation', 'CREATE', 'business_unit', result['id'], f"BU created: {d['name']}")
    return created({'id': result['id']})

@org_bp.route('/business-units/<int:bid>', methods=['GET','PUT','DELETE'])
@require_auth
def business_unit_detail(bid):
    bu = db_row1("SELECT * FROM business_units WHERE id=%s AND deleted_at IS NULL", (bid,))
    if not bu: return not_found("Business Unit")
    if request.method == 'GET':
        bu['departments'] = db_rows("SELECT * FROM departments WHERE business_unit_id=%s AND deleted_at IS NULL", (bid,))
        return ok(bu)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("UPDATE business_units SET name=%s, code=%s, is_active=%s, updated_at=NOW() WHERE id=%s",
                  (d.get('name', bu['name']), d.get('code', bu['code']), d.get('is_active', bu['is_active']), bid))
        write_audit_log('organisation', 'UPDATE', 'business_unit', bid, f"BU updated: {bu['name']}")
        return ok(message="Updated")
    # DELETE — soft delete
    db_execute("UPDATE business_units SET deleted_at=NOW() WHERE id=%s", (bid,))
    write_audit_log('organisation', 'DELETE', 'business_unit', bid, f"BU deleted: {bu['name']}")
    return ok(message="Deleted")

# ── Departments ───────────────────────────────────────────────
@org_bp.route('/departments', methods=['GET'])
@require_auth
def list_departments():
    rows = db_rows("""SELECT d.*, b.name as bu_name, c.name as cc_name,
        COUNT(e.id) as headcount
        FROM departments d
        LEFT JOIN business_units b ON b.id=d.business_unit_id
        LEFT JOIN cost_centres c ON c.id=d.cost_centre_id
        LEFT JOIN employees e ON e.department_id=d.id AND e.is_active=TRUE
        WHERE d.deleted_at IS NULL
        GROUP BY d.id, b.name, c.name ORDER BY d.name""")
    return ok(rows)

@org_bp.route('/departments', methods=['POST'])
@require_auth
@require_role('Admin', 'HR Manager')
def create_department():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required'], 'business_unit_id': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO departments (name, code, business_unit_id, cost_centre_id, created_by)
        VALUES (%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('code'), d['business_unit_id'], d.get('cost_centre_id'), request.environ.get('user_id')),
        returning=True)
    write_audit_log('organisation', 'CREATE', 'department', result['id'], f"Dept created: {d['name']}")
    return created({'id': result['id']})

@org_bp.route('/departments/<int:did>', methods=['GET','PUT','DELETE'])
@require_auth
def dept_detail(did):
    dept = db_row1("""SELECT d.*, b.name as bu_name FROM departments d
        LEFT JOIN business_units b ON b.id=d.business_unit_id
        WHERE d.id=%s AND d.deleted_at IS NULL""", (did,))
    if not dept: return not_found("Department")
    if request.method == 'GET': return ok(dept)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("""UPDATE departments SET name=%s, code=%s, business_unit_id=%s,
            cost_centre_id=%s, is_active=%s, updated_at=NOW() WHERE id=%s""",
            (d.get('name',dept['name']), d.get('code',dept['code']),
             d.get('business_unit_id',dept['business_unit_id']),
             d.get('cost_centre_id',dept['cost_centre_id']),
             d.get('is_active',dept['is_active']), did))
        write_audit_log('organisation', 'UPDATE', 'department', did, f"Dept updated: {dept['name']}")
        return ok(message="Updated")
    db_execute("UPDATE departments SET deleted_at=NOW() WHERE id=%s", (did,))
    write_audit_log('organisation', 'DELETE', 'department', did, f"Dept deleted: {dept['name']}")
    return ok(message="Deleted")

# ── Cost Centres ──────────────────────────────────────────────
@org_bp.route('/cost-centres', methods=['GET'])
@require_auth
def list_cost_centres():
    return ok(db_rows("SELECT c.*, b.name as bu_name FROM cost_centres c LEFT JOIN business_units b ON b.id=c.bu_id WHERE c.deleted_at IS NULL ORDER BY c.name"))

@org_bp.route('/cost-centres', methods=['POST'])
@require_auth
@require_role('Admin', 'Finance Manager')
def create_cost_centre():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("INSERT INTO cost_centres (name, code, bu_id, created_by) VALUES (%s,%s,%s,%s) RETURNING id",
        (d['name'], d.get('code'), d.get('bu_id'), request.environ.get('user_id')), returning=True)
    write_audit_log('organisation', 'CREATE', 'cost_centre', result['id'], f"CC created: {d['name']}")
    return created({'id': result['id']})

@org_bp.route('/cost-centres/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def cc_detail(cid):
    cc = db_row1("SELECT * FROM cost_centres WHERE id=%s", (cid,))
    if not cc: return not_found("Cost Centre")
    if request.method == 'GET': return ok(cc)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("UPDATE cost_centres SET name=%s, code=%s, bu_id=%s, is_active=%s, updated_at=NOW() WHERE id=%s",
            (d.get('name',cc['name']), d.get('code',cc['code']), d.get('bu_id',cc['bu_id']), d.get('is_active',cc['is_active']), cid))
        return ok(message="Updated")
    db_execute("UPDATE cost_centres SET deleted_at=NOW() WHERE id=%s", (cid,))
    return ok(message="Deleted")

# ── Locations ─────────────────────────────────────────────────
@org_bp.route('/locations', methods=['GET'])
@require_auth
def list_locations():
    return ok(db_rows("SELECT * FROM office_locations WHERE deleted_at IS NULL ORDER BY name"))

@org_bp.route('/locations', methods=['POST'])
@require_auth
@require_role('Admin')
def create_location():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO office_locations (name, code, address, city, state, pincode, country, is_hq, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('code'), d.get('address'), d.get('city'), d.get('state'),
         d.get('pincode'), d.get('country','India'), d.get('is_hq', False), request.environ.get('user_id')),
        returning=True)
    return created({'id': result['id']})

@org_bp.route('/locations/<int:lid>', methods=['GET','PUT','DELETE'])
@require_auth
def location_detail(lid):
    loc = db_row1("SELECT * FROM office_locations WHERE id=%s AND deleted_at IS NULL", (lid,))
    if not loc: return not_found("Location")
    if request.method == 'GET': return ok(loc)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("""UPDATE office_locations SET name=%s, code=%s, address=%s, city=%s,
            state=%s, pincode=%s, country=%s, is_hq=%s, is_active=%s, updated_at=NOW() WHERE id=%s""",
            (d.get('name',loc['name']), d.get('code',loc['code']), d.get('address',loc['address']),
             d.get('city',loc['city']), d.get('state',loc['state']), d.get('pincode',loc['pincode']),
             d.get('country',loc['country']), d.get('is_hq',loc['is_hq']), d.get('is_active',loc['is_active']), lid))
        return ok(message="Updated")
    db_execute("UPDATE office_locations SET deleted_at=NOW() WHERE id=%s", (lid,))
    return ok(message="Deleted")

# ── Master lookup endpoints (for dropdowns) ────────────────────
@org_bp.route('/lookup/business-units')
@require_auth
def lookup_bus():
    return ok(db_rows("SELECT id, name, code FROM business_units WHERE deleted_at IS NULL AND is_active=TRUE ORDER BY name"))

@org_bp.route('/lookup/departments')
@require_auth
def lookup_depts():
    return ok(db_rows("SELECT d.id, d.name, d.code, b.name as bu_name FROM departments d LEFT JOIN business_units b ON b.id=d.business_unit_id WHERE d.deleted_at IS NULL AND d.is_active=TRUE ORDER BY d.name"))

@org_bp.route('/lookup/cost-centres')
@require_auth
def lookup_ccs():
    return ok(db_rows("SELECT id, name, code FROM cost_centres WHERE deleted_at IS NULL AND is_active=TRUE ORDER BY name"))

@org_bp.route('/lookup/locations')
@require_auth
def lookup_locations():
    return ok(db_rows("SELECT id, name, city FROM office_locations WHERE deleted_at IS NULL AND is_active=TRUE ORDER BY name"))
