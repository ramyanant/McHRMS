"""Organisation Blueprint — fully compatible with v1 schema"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError

org_bp = Blueprint('organisation', __name__, url_prefix='/api/v1')

# ── Organisation Profile ──────────────────────────────────────
@org_bp.route('/organisation', methods=['GET'])
@require_auth
def get_organisation():
    org = db_row1("""SELECT o.*,
        c1.name as reg_country_name, s1.name as reg_state_name,
        c2.name as biz_country_name
        FROM organisation o
        LEFT JOIN master_countries c1 ON c1.id=o.reg_country_id
        LEFT JOIN master_states s1 ON s1.id=o.reg_state_id
        LEFT JOIN master_countries c2 ON c2.id=o.biz_country_id
        LIMIT 1""")
    if not org:
        return ok({})
    org['gst']   = db_rows("SELECT * FROM organisation_gst WHERE organisation_id=%s", (org['id'],))
    org['banks'] = db_rows("SELECT * FROM organisation_bank_accounts WHERE organisation_id=%s", (org['id'],))
    org['labour_certs'] = db_rows("SELECT * FROM organisation_labour_certs WHERE organisation_id=%s", (org['id'],))
    return ok(org)

@org_bp.route('/organisation', methods=['PUT'])
@require_auth
@require_role('Admin')
def update_organisation():
    d = request.get_json() or {}
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    fields = ['legal_name','trade_name','legal_structure','industry','sub_domain','logo_url',
              'timezone','base_currency','email','phone','website',
              'reg_address_line1','reg_address_line2','reg_city','reg_state_id','reg_pincode','reg_country_id',
              'biz_address_line1','biz_address_line2','biz_city','biz_state_id','biz_pincode','biz_country_id',
              'poc_name','poc_email','poc_phone','pan','cin','tan','msme_number',
              'iec_code','profession_tax_number','pf_number','esi_number','incorporation_date','financial_year_start']
    updates = {k: d[k] for k in fields if k in d}
    if org:
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE organisation SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [org['id']])
        write_audit_log('organisation', 'UPDATE', 'organisation', org['id'], 'Organisation updated')
    else:
        result = db_execute("INSERT INTO organisation (legal_name, email, phone) VALUES (%s,%s,%s) RETURNING id",
            (d.get('legal_name','McRaaN'), d.get('email'), d.get('phone')), returning=True)
        write_audit_log('organisation', 'CREATE', 'organisation', result['id'], 'Organisation created')
    return ok(message="Saved")

# ── Business Units ────────────────────────────────────────────
@org_bp.route('/business-units', methods=['GET'])
@require_auth
def list_business_units():
    rows = db_rows("""SELECT b.*,
        COUNT(DISTINCT d.id) as dept_count,
        COUNT(DISTINCT e.id) as headcount
        FROM business_units b
        LEFT JOIN departments d ON d.business_unit_id=b.id AND d.is_active=1
        LEFT JOIN employees e ON e.business_unit_id=b.id AND e.is_active=1
        WHERE b.is_active=1
        GROUP BY b.id ORDER BY b.name""")
    return ok(rows)

@org_bp.route('/business-units', methods=['POST'])
@require_auth
@require_role('Admin', 'HR Manager')
def create_business_unit():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required', 'max:200']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("INSERT INTO business_units (name, description, head_name) VALUES (%s,%s,%s) RETURNING id",
        (d['name'], d.get('description'), d.get('head_name')), returning=True)
    write_audit_log('organisation', 'CREATE', 'business_unit', result['id'], f"BU created: {d['name']}")
    return created({'id': result['id']})

@org_bp.route('/business-units/<int:bid>', methods=['GET','PUT','DELETE'])
@require_auth
def business_unit_detail(bid):
    bu = db_row1("SELECT * FROM business_units WHERE id=%s AND is_active=1", (bid,))
    if not bu: return not_found("Business Unit")
    if request.method == 'GET':
        bu['departments'] = db_rows("SELECT * FROM departments WHERE business_unit_id=%s AND is_active=1", (bid,))
        return ok(bu)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("UPDATE business_units SET name=%s, description=%s, head_name=%s, is_active=%s WHERE id=%s",
                  (d.get('name', bu['name']), d.get('description', bu.get('description')),
                   d.get('head_name', bu.get('head_name')), d.get('is_active', bu['is_active']), bid))
        return ok(message="Updated")
    db_execute("UPDATE business_units SET is_active=0 WHERE id=%s", (bid,))
    return ok(message="Deleted")

# ── Departments ───────────────────────────────────────────────
@org_bp.route('/departments', methods=['GET'])
@require_auth
def list_departments():
    rows = db_rows("""SELECT d.*, b.name as bu_name,
        COUNT(e.id) as headcount
        FROM departments d
        LEFT JOIN business_units b ON b.id=d.business_unit_id
        LEFT JOIN employees e ON e.department_id=d.id AND e.is_active=1
        WHERE d.is_active=1
        GROUP BY d.id, b.name ORDER BY d.name""")
    return ok(rows)

@org_bp.route('/departments', methods=['POST'])
@require_auth
@require_role('Admin', 'HR Manager')
def create_department():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO departments (name, business_unit_id, cost_centre_id, head_name, location)
        VALUES (%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('business_unit_id'), d.get('cost_centre_id'),
         d.get('head_name'), d.get('location')), returning=True)
    write_audit_log('organisation', 'CREATE', 'department', result['id'], f"Dept created: {d['name']}")
    return created({'id': result['id']})

@org_bp.route('/departments/<int:did>', methods=['GET','PUT','DELETE'])
@require_auth
def dept_detail(did):
    dept = db_row1("""SELECT d.*, b.name as bu_name FROM departments d
        LEFT JOIN business_units b ON b.id=d.business_unit_id
        WHERE d.id=%s AND d.is_active=1""", (did,))
    if not dept: return not_found("Department")
    if request.method == 'GET': return ok(dept)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("""UPDATE departments SET name=%s, business_unit_id=%s,
            cost_centre_id=%s, head_name=%s, location=%s, is_active=%s WHERE id=%s""",
            (d.get('name', dept['name']), d.get('business_unit_id', dept['business_unit_id']),
             d.get('cost_centre_id', dept['cost_centre_id']),
             d.get('head_name', dept.get('head_name')),
             d.get('location', dept.get('location')),
             d.get('is_active', dept['is_active']), did))
        return ok(message="Updated")
    db_execute("UPDATE departments SET is_active=0 WHERE id=%s", (did,))
    return ok(message="Deleted")

# ── Cost Centres ──────────────────────────────────────────────
@org_bp.route('/cost-centres', methods=['GET'])
@require_auth
def list_cost_centres():
    return ok(db_rows("""SELECT c.*, b.name as bu_name FROM cost_centres c
        LEFT JOIN business_units b ON b.id=c.business_unit_id
        WHERE c.is_active=1 ORDER BY c.name"""))

@org_bp.route('/cost-centres', methods=['POST'])
@require_auth
@require_role('Admin', 'Finance Manager')
def create_cost_centre():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required'], 'code': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    try:
        result = db_execute("INSERT INTO cost_centres (name, code, business_unit_id, budget) VALUES (%s,%s,%s,%s) RETURNING id",
            (d['name'], d['code'], d.get('business_unit_id'), d.get('budget', 0)), returning=True)
    except Exception as ex:
        if 'unique' in str(ex).lower():
            return err(f"Code '{d['code']}' already exists")
        raise
    write_audit_log('organisation', 'CREATE', 'cost_centre', result['id'], f"CC created: {d['name']}")
    return created({'id': result['id']})

@org_bp.route('/cost-centres/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def cc_detail(cid):
    cc = db_row1("SELECT * FROM cost_centres WHERE id=%s AND is_active=1", (cid,))
    if not cc: return not_found("Cost Centre")
    if request.method == 'GET': return ok(cc)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("UPDATE cost_centres SET name=%s, code=%s, business_unit_id=%s, budget=%s, is_active=%s WHERE id=%s",
            (d.get('name', cc['name']), d.get('code', cc['code']),
             d.get('business_unit_id', cc['business_unit_id']),
             d.get('budget', cc['budget']), d.get('is_active', cc['is_active']), cid))
        return ok(message="Updated")
    db_execute("UPDATE cost_centres SET is_active=0 WHERE id=%s", (cid,))
    return ok(message="Deleted")

# ── Locations ─────────────────────────────────────────────────
@org_bp.route('/locations', methods=['GET'])
@require_auth
def list_locations():
    return ok(db_rows("SELECT * FROM office_locations WHERE is_active=1 ORDER BY name"))

@org_bp.route('/locations', methods=['POST'])
@require_auth
@require_role('Admin')
def create_location():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO office_locations (name, city, address_line1, pincode, type)
        VALUES (%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('city'), d.get('address'), d.get('pincode'),
         d.get('type', 'Regional')), returning=True)
    return created({'id': result['id']})

@org_bp.route('/locations/<int:lid>', methods=['GET','PUT','DELETE'])
@require_auth
def location_detail(lid):
    loc = db_row1("SELECT * FROM office_locations WHERE id=%s AND is_active=1", (lid,))
    if not loc: return not_found("Location")
    if request.method == 'GET': return ok(loc)
    if request.method == 'PUT':
        d = request.get_json() or {}
        db_execute("UPDATE office_locations SET name=%s, city=%s, address_line1=%s, pincode=%s, type=%s, is_active=%s WHERE id=%s",
            (d.get('name', loc['name']), d.get('city', loc.get('city')),
             d.get('address', loc.get('address_line1')), d.get('pincode', loc.get('pincode')),
             d.get('type', loc.get('type','Regional')), d.get('is_active', loc['is_active']), lid))
        return ok(message="Updated")
    db_execute("UPDATE office_locations SET is_active=0 WHERE id=%s", (lid,))
    return ok(message="Deleted")

# ── Lookups ───────────────────────────────────────────────────
@org_bp.route('/lookup/business-units')
@require_auth
def lookup_bus():
    return ok(db_rows("SELECT id, name FROM business_units WHERE is_active=1 ORDER BY name"))

@org_bp.route('/lookup/departments')
@require_auth
def lookup_depts():
    return ok(db_rows("""SELECT d.id, d.name, b.name as bu_name FROM departments d
        LEFT JOIN business_units b ON b.id=d.business_unit_id
        WHERE d.is_active=1 ORDER BY d.name"""))

@org_bp.route('/lookup/cost-centres')
@require_auth
def lookup_ccs():
    return ok(db_rows("SELECT id, name, code FROM cost_centres WHERE is_active=1 ORDER BY name"))

@org_bp.route('/lookup/locations')
@require_auth
def lookup_locations():
    return ok(db_rows("SELECT id, name, city FROM office_locations WHERE is_active=1 ORDER BY name"))
