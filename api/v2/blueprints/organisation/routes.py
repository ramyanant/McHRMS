"""
Organisation Profile Blueprint
===================================================
Business Analyst Requirements Addressed:
  a. Company: Entity type, legal name, brand name, logo, email, phone, website,
     multiple PoCs, multiple addresses, currency, timezone, FY period
  b. Identity: CIN, PAN, TAN, IEC, MSME, Startup India + dynamic additions
  c. Registrations: GST (multi-state), Prof Tax, PF, ESI, Labour Certs, etc.
  d. Finance: Multiple bank accounts
  e. Documents: Multi-document upload (base64)
  f. Change Password, Logout handled by auth blueprint
"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role

def _int(v):
    try: return int(v) if v not in (None,"","null","undefined") else None
    except: return None
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError

org_bp = Blueprint('organisation', __name__, url_prefix='/api/v2')


# ═══════════════════════════════════════════════════════════════
# ORGANISATION PROFILE — Core
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/organisation', methods=['GET'])
@require_auth
def get_organisation():
    """Full org profile with completion score."""
    org = db_row1("""SELECT o.*,
        s1.name as reg_state_name, c1.name as reg_country_name
        FROM organisation o
        LEFT JOIN master_states s1 ON s1.id=o.reg_state_id
        LEFT JOIN master_countries c1 ON c1.id=o.reg_country_id
        LIMIT 1""")
    # Don't include raw binary in response - just flag if logo exists
    if org:
        has_logo = bool(org.get('logo_data'))
        org.pop('logo_data', None)
        org['has_logo'] = has_logo
    if not org:
        return ok({"_exists": False, "completion": 0})

    oid = org['id']
    org['contacts']       = db_rows("SELECT * FROM organisation_contacts WHERE organisation_id=%s AND is_active=1 ORDER BY is_primary DESC, sort_order", (oid,))
    org['addresses']      = db_rows("SELECT * FROM organisation_addresses WHERE organisation_id=%s AND is_active=1 ORDER BY is_primary DESC", (oid,))
    org['identity']       = db_rows("SELECT * FROM organisation_identity WHERE organisation_id=%s AND is_active=1 ORDER BY id_type", (oid,))
    org['registrations']  = db_rows("SELECT * FROM organisation_registrations WHERE organisation_id=%s AND is_active=1 ORDER BY reg_type, state", (oid,))
    org['banks']          = db_rows("SELECT * FROM organisation_bank_accounts WHERE organisation_id=%s AND is_active=1 ORDER BY is_primary DESC", (oid,))
    org['gst']            = db_rows("SELECT g.*, s.name as state_name FROM organisation_gst g LEFT JOIN master_states s ON s.id=g.state_id WHERE g.organisation_id=%s AND g.is_active=1", (oid,))
    org['labour_certs']   = db_rows("SELECT lc.*, s.name as state_name FROM organisation_labour_certs lc LEFT JOIN master_states s ON s.id=lc.state_id WHERE lc.organisation_id=%s AND lc.is_active=1", (oid,))
    org['documents']      = db_rows("SELECT id, doc_type, doc_name, file_size, mime_type, uploaded_at, expiry_date, notes FROM organisation_documents WHERE organisation_id=%s AND is_active=1 ORDER BY uploaded_at DESC", (oid,))

    # Completion score calculation (Business Analyst: % complete like LinkedIn)
    org['completion'] = _calc_completion(org)
    org['_exists'] = True
    return ok(org)


def _calc_completion(org):
    """Calculate profile completion percentage across all sections."""
    checks = {
        # Company (30 pts)
        'legal_name':         5, 'trade_name':       3, 'type_of_entity':  3,
        'email':              3, 'phone':             3, 'website':         2,
        'logo_url':           3, 'industry':          3, 'brand_name':      2,
        '_has_contact':       3,
        # Identity (20 pts)
        'pan':                5, 'tan':               4, 'cin':             4,
        'iec_code':           3, 'msme_number':       4,
        # Address (10 pts)
        '_has_address':       10,
        # Registrations (15 pts)
        '_has_gst':           8, '_has_registration': 7,
        # Finance (15 pts)
        '_has_bank':          15,
        # Documents (10 pts)
        '_has_document':      10,
    }
    total_weight = sum(checks.values())
    score = 0
    for key, weight in checks.items():
        if key.startswith('_has_'):
            sub = key[5:]
            has_it = bool(org.get(sub) if sub in org else
                         org.get('contacts') if sub == 'contact' else
                         org.get('addresses') if sub == 'address' else
                         org.get('gst') if sub == 'gst' else
                         org.get('banks') if sub == 'bank' else
                         org.get('documents') if sub == 'document' else
                         org.get('registrations') if sub == 'registration' else False)
            if has_it: score += weight
        elif org.get(key):
            score += weight
    return round((score / total_weight) * 100)


@org_bp.route('/organisation', methods=['POST', 'PUT'])
@require_auth
@require_role('Admin')
def save_organisation():
    d = request.get_json() or {}
    try:
        validate(d, {'legal_name': ['required']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)

    org = db_row1("SELECT id FROM organisation LIMIT 1")
    fields = ['legal_name','trade_name','brand_name','type_of_entity','legal_structure',
              'industry','sub_domain','logo_url','timezone','base_currency',
              'email','phone','website','linkedin_url','hours_of_operation',
              'employee_count_range','financial_year_start',
              'reg_address_line1','reg_address_line2','reg_city','reg_state_id',
              'reg_pincode','reg_country_id',
              'biz_address_line1','biz_address_line2','biz_city','biz_state_id',
              'biz_pincode','biz_country_id',
              'poc_name','poc_email','poc_phone',
              'pan','cin','tan','msme_number','iec_code',
              'profession_tax_number','pf_number','esi_number',
              'incorporation_date']
    updates = {k: d[k] for k in fields if k in d}

    if org:
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE organisation SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [org['id']])
        oid = org['id']
        write_audit_log('organisation', 'UPDATE', 'organisation', oid, 'Organisation profile updated')
    else:
        cols   = list(updates.keys()) or ['legal_name']
        vals   = list(updates.values()) or [d.get('legal_name', 'Company')]
        ph     = ','.join(['%s']*len(cols))
        result = db_execute(f"INSERT INTO organisation ({','.join(cols)}) VALUES ({ph}) RETURNING id",
                           vals, returning=True)
        oid = result['id']
        write_audit_log('organisation', 'CREATE', 'organisation', oid, 'Organisation created')

    return ok({'id': oid}, message="Saved")


# ═══════════════════════════════════════════════════════════════
# POINTS OF CONTACT
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/organisation/contacts', methods=['GET'])
@require_auth
def list_contacts():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return ok([])
    return ok(db_rows("SELECT * FROM organisation_contacts WHERE organisation_id=%s AND is_active=1 ORDER BY is_primary DESC, sort_order", (org['id'],)))

@org_bp.route('/organisation/contacts', methods=['POST'])
@require_auth
@require_role('Admin')
def add_contact():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up yet")
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    result = db_execute("""INSERT INTO organisation_contacts
        (organisation_id, name, designation, department, email, phone, is_primary, sort_order)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'], d['name'], d.get('designation'), d.get('department'),
         d.get('email'), d.get('phone'), d.get('is_primary', 0),
         d.get('sort_order', 0)), returning=True)
    write_audit_log('organisation', 'CREATE', 'org_contact', result['id'], f"Contact added: {d['name']}")
    return created({'id': result['id']})

@org_bp.route('/organisation/contacts/<int:cid>', methods=['PUT','DELETE'])
@require_auth
@require_role('Admin')
def manage_contact(cid):
    if request.method == 'DELETE':
        db_execute("UPDATE organisation_contacts SET is_active=0 WHERE id=%s", (cid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("""UPDATE organisation_contacts SET name=%s, designation=%s, department=%s,
        email=%s, phone=%s, is_primary=%s WHERE id=%s""",
        (d.get('name'), d.get('designation'), d.get('department'),
         d.get('email'), d.get('phone'), d.get('is_primary', 0), cid))
    return ok(message="Updated")


# ═══════════════════════════════════════════════════════════════
# ADDRESSES (multiple — Registered, Operational, Branch, etc.)
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/organisation/addresses', methods=['GET'])
@require_auth
def list_addresses():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return ok([])
    return ok(db_rows("SELECT * FROM organisation_addresses WHERE organisation_id=%s AND is_active=1 ORDER BY is_primary DESC", (org['id'],)))

@org_bp.route('/organisation/addresses', methods=['POST'])
@require_auth
@require_role('Admin')
def add_address():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up yet")
    d = request.get_json() or {}
    try: validate(d, {'address_type': ['required', 'in:Registered,Operational,Branch,Warehouse,Billing,Other']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO organisation_addresses
        (organisation_id, address_type, line1, line2, city, state, pincode, country,
         currency, timezone, hours_of_operation, is_primary)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'], d['address_type'], d.get('line1'), d.get('line2'),
         d.get('city'), d.get('state'), d.get('pincode'), d.get('country','India'),
         d.get('currency','INR'), d.get('timezone','Asia/Kolkata'),
         d.get('hours_of_operation'), d.get('is_primary', 0)), returning=True)
    return created({'id': result['id']})

@org_bp.route('/organisation/addresses/<int:aid>', methods=['PUT','DELETE'])
@require_auth
@require_role('Admin')
def manage_address(aid):
    if request.method == 'DELETE':
        db_execute("UPDATE organisation_addresses SET is_active=0 WHERE id=%s", (aid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("""UPDATE organisation_addresses SET address_type=%s, line1=%s, line2=%s,
        city=%s, state=%s, pincode=%s, country=%s, currency=%s,
        timezone=%s, hours_of_operation=%s, is_primary=%s WHERE id=%s""",
        (d.get('address_type'), d.get('line1'), d.get('line2'),
         d.get('city'), d.get('state'), d.get('pincode'), d.get('country','India'),
         d.get('currency','INR'), d.get('timezone','Asia/Kolkata'),
         d.get('hours_of_operation'), d.get('is_primary',0), aid))
    return ok(message="Updated")


# ═══════════════════════════════════════════════════════════════
# IDENTITY NUMBERS (CIN, PAN, TAN, IEC, MSME, etc. — dynamic)
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/organisation/identity', methods=['GET'])
@require_auth
def list_identity():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return ok([])
    return ok(db_rows("SELECT * FROM organisation_identity WHERE organisation_id=%s AND is_active=1 ORDER BY id_type", (org['id'],)))

@org_bp.route('/organisation/identity', methods=['POST'])
@require_auth
@require_role('Admin')
def add_identity():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up yet")
    d = request.get_json() or {}
    try: validate(d, {'id_type': ['required'], 'id_number': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO organisation_identity
        (organisation_id, id_type, id_number, issue_date, expiry_date, issuing_authority, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'], d['id_type'], d['id_number'], d.get('issue_date'),
         d.get('expiry_date'), d.get('issuing_authority'), d.get('notes')), returning=True)
    write_audit_log('organisation', 'CREATE', 'org_identity', result['id'], f"{d['id_type']}: {d['id_number']}")
    return created({'id': result['id']})

@org_bp.route('/organisation/identity/<int:iid>', methods=['PUT','DELETE'])
@require_auth
@require_role('Admin')
def manage_identity(iid):
    if request.method == 'DELETE':
        db_execute("UPDATE organisation_identity SET is_active=0 WHERE id=%s", (iid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("""UPDATE organisation_identity SET id_type=%s, id_number=%s,
        issue_date=%s, expiry_date=%s, issuing_authority=%s, notes=%s WHERE id=%s""",
        (d.get('id_type'), d.get('id_number'), d.get('issue_date'),
         d.get('expiry_date'), d.get('issuing_authority'), d.get('notes'), iid))
    return ok(message="Updated")


# ═══════════════════════════════════════════════════════════════
# REGISTRATIONS — GST, Prof Tax, PF, ESI, Labour Cert, etc.
# Multi-entry, state-wise, with start/expiry dates
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/organisation/registrations', methods=['GET'])
@require_auth
def list_registrations():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return ok([])
    return ok(db_rows("""SELECT * FROM organisation_registrations
        WHERE organisation_id=%s AND is_active=1 ORDER BY reg_type, state""", (org['id'],)))

@org_bp.route('/organisation/registrations', methods=['POST'])
@require_auth
@require_role('Admin')
def add_registration():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up yet")
    d = request.get_json() or {}
    try: validate(d, {'reg_type': ['required'], 'reg_number': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO organisation_registrations
        (organisation_id, reg_type, reg_number, state, jurisdiction,
         issuing_authority, trade_name, start_date, expiry_date, is_primary, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'], d['reg_type'], d['reg_number'], d.get('state'),
         d.get('jurisdiction','National'), d.get('issuing_authority'),
         d.get('trade_name'), d.get('start_date'), d.get('expiry_date'),
         d.get('is_primary',0), d.get('notes')), returning=True)
    write_audit_log('organisation', 'CREATE', 'org_registration', result['id'],
                    f"Registration added: {d['reg_type']} {d['reg_number']}")
    return created({'id': result['id']})

@org_bp.route('/organisation/registrations/<int:rid>', methods=['PUT','DELETE'])
@require_auth
@require_role('Admin')
def manage_registration(rid):
    if request.method == 'DELETE':
        db_execute("UPDATE organisation_registrations SET is_active=0 WHERE id=%s", (rid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("""UPDATE organisation_registrations SET reg_type=%s, reg_number=%s,
        state=%s, jurisdiction=%s, issuing_authority=%s, trade_name=%s,
        start_date=%s, expiry_date=%s, is_primary=%s, notes=%s, updated_at=NOW()
        WHERE id=%s""",
        (d.get('reg_type'), d.get('reg_number'), d.get('state'),
         d.get('jurisdiction','National'), d.get('issuing_authority'),
         d.get('trade_name'), d.get('start_date'), d.get('expiry_date'),
         d.get('is_primary',0), d.get('notes'), rid))
    return ok(message="Updated")

# Legacy GST endpoints (v1 compatible)
@org_bp.route('/organisation/gst', methods=['GET'])
@require_auth
def list_gst():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return ok([])
    return ok(db_rows("""SELECT g.*, s.name as state_name FROM organisation_gst g
        LEFT JOIN master_states s ON s.id=g.state_id
        WHERE g.organisation_id=%s AND g.is_active=1 ORDER BY g.is_primary DESC""", (org['id'],)))

@org_bp.route('/organisation/gst', methods=['POST'])
@require_auth
@require_role('Admin')
def add_gst():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up yet")
    d = request.get_json() or {}
    try: validate(d, {'gstin': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("""INSERT INTO organisation_gst
        (organisation_id, gstin, state_id, trade_name, registration_date, is_primary)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'], d['gstin'], d.get('state_id'), d.get('trade_name'),
         d.get('registration_date'), d.get('is_primary',0)))
    gid = cur.fetchone()['id']
    conn.close()
    write_audit_log('organisation', 'CREATE', 'org_gst', gid, f"GST added: {d['gstin']}")
    return created({'id': gid})

@org_bp.route('/organisation/gst/<int:gid>', methods=['PUT','DELETE'])
@require_auth
@require_role('Admin')
def manage_gst(gid):
    if request.method == 'DELETE':
        db_execute("UPDATE organisation_gst SET is_active=0 WHERE id=%s", (gid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("""UPDATE organisation_gst SET gstin=%s, state_id=%s, trade_name=%s,
        registration_date=%s, is_primary=%s WHERE id=%s""",
        (d.get('gstin'), d.get('state_id'), d.get('trade_name'),
         d.get('registration_date'), d.get('is_primary',0), gid))
    return ok(message="Updated")


# ═══════════════════════════════════════════════════════════════
# BANKING — Multiple accounts
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/organisation/banks', methods=['GET'])
@require_auth
def list_banks():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return ok([])
    return ok(db_rows("SELECT * FROM organisation_bank_accounts WHERE organisation_id=%s AND is_active=1 ORDER BY is_primary DESC", (org['id'],)))

@org_bp.route('/organisation/banks', methods=['POST'])
@require_auth
@require_role('Admin')
def add_bank():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up yet")
    d = request.get_json() or {}
    try:
        validate(d, {'account_name': ['required'], 'bank_name': ['required'],
                     'account_number': ['required']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO organisation_bank_accounts
        (organisation_id, account_name, bank_name, branch, account_number,
         ifsc_code, swift_code, account_type, currency, purpose, is_primary)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'], d['account_name'], d['bank_name'], d.get('branch'),
         d['account_number'], d.get('ifsc_code'), d.get('swift_code'),
         d.get('account_type','Current'), d.get('currency','INR'),
         d.get('purpose'), d.get('is_primary',0)), returning=True)
    write_audit_log('organisation', 'CREATE', 'org_bank', result['id'], f"Bank added: {d['bank_name']}")
    return created({'id': result['id']})

@org_bp.route('/organisation/banks/<int:bid>', methods=['PUT','DELETE'])
@require_auth
@require_role('Admin')
def manage_bank(bid):
    if request.method == 'DELETE':
        db_execute("UPDATE organisation_bank_accounts SET is_active=0 WHERE id=%s", (bid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("""UPDATE organisation_bank_accounts SET account_name=%s, bank_name=%s, branch=%s,
        account_number=%s, ifsc_code=%s, swift_code=%s, account_type=%s,
        currency=%s, purpose=%s, is_primary=%s, updated_at=NOW() WHERE id=%s""",
        (d.get('account_name'), d.get('bank_name'), d.get('branch'),
         d.get('account_number'), d.get('ifsc_code'), d.get('swift_code'),
         d.get('account_type','Current'), d.get('currency','INR'),
         d.get('purpose'), d.get('is_primary',0), bid))
    return ok(message="Updated")


# ═══════════════════════════════════════════════════════════════
# DOCUMENTS — Multi-document upload (base64 stored)
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/organisation/documents', methods=['GET'])
@require_auth
def list_documents():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return ok([])
    return ok(db_rows("""SELECT id, doc_type, doc_name, file_size, mime_type,
        uploaded_at, expiry_date, notes FROM organisation_documents
        WHERE organisation_id=%s AND is_active=1 ORDER BY uploaded_at DESC""", (org['id'],)))

@org_bp.route('/organisation/documents', methods=['POST'])
@require_auth
@require_role('Admin')
def upload_document():
    org = db_row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up yet")
    d = request.get_json() or {}
    try:
        validate(d, {'doc_name': ['required'], 'doc_type': ['required']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO organisation_documents
        (organisation_id, doc_type, doc_name, file_data, file_size, mime_type,
         expiry_date, notes, uploaded_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'], d['doc_type'], d['doc_name'],
         d.get('file_data'),   # base64 string
         d.get('file_size'), d.get('mime_type'),
         d.get('expiry_date'), d.get('notes'), g.user['id']), returning=True)
    write_audit_log('organisation', 'CREATE', 'org_document', result['id'],
                    f"Document uploaded: {d['doc_name']}")
    return created({'id': result['id']})

@org_bp.route('/organisation/documents/<int:did>', methods=['GET','PUT','DELETE'])
@require_auth
def manage_document(did):
    if request.method == 'DELETE':
        db_execute("UPDATE organisation_documents SET is_active=0 WHERE id=%s", (did,))
        return ok(message="Removed")
    if request.method == 'GET':
        doc = db_row1("SELECT * FROM organisation_documents WHERE id=%s", (did,))
        return ok(doc) if doc else not_found("Document")
    d = request.get_json() or {}
    db_execute("UPDATE organisation_documents SET doc_name=%s, doc_type=%s, expiry_date=%s, notes=%s WHERE id=%s",
              (d.get('doc_name'), d.get('doc_type'), d.get('expiry_date'), d.get('notes'), did))
    return ok(message="Updated")


# ═══════════════════════════════════════════════════════════════
# LOOKUPS (for dropdowns in org module)
# ═══════════════════════════════════════════════════════════════

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

@org_bp.route('/lookup/states')
@require_auth
def lookup_states():
    return ok(db_rows("""SELECT s.id, s.name, s.code, c.name as country_name
        FROM master_states s JOIN master_countries c ON c.id=s.country_id
        WHERE c.code='IN' ORDER BY s.name"""))


# ═══════════════════════════════════════════════════════════════
# BUSINESS UNITS
# ═══════════════════════════════════════════════════════════════

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
    # Sync head_name from employee if head_emp_id given
    head_name = d.get('head_name')
    if d.get('head_emp_id'):
        emp = db_row1("SELECT first_name||' '||last_name as name FROM employees WHERE id=%s", (d['head_emp_id'],))
        if emp: head_name = emp['name']
    result = db_execute("""INSERT INTO business_units (name, description, head_name, code, head_emp_id, location_id)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('description'), head_name,
         d.get('code'), d.get('head_emp_id'), d.get('location_id')), returning=True)
    write_audit_log('organisation', 'CREATE', 'business_unit', result['id'], f"BU: {d['name']}")
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
        updates = {
            'name':        d.get('name', bu['name']),
            'description': d.get('description', bu.get('description')),
            'head_name':   d.get('head_name', bu.get('head_name')),
        }
        if 'code'        in d: updates['code']        = d['code']
        if 'is_active'   in d: updates['is_active']   = d['is_active']
        if 'head_emp_id' in d: updates['head_emp_id'] = d['head_emp_id']
        if 'location_id' in d: updates['location_id'] = d['location_id']
        # Sync head_name from employee if head_emp_id given
        if d.get('head_emp_id'):
            emp = db_row1("SELECT first_name||' '||last_name as name FROM employees WHERE id=%s", (d['head_emp_id'],))
            if emp: updates['head_name'] = emp['name']
        set_clause = ', '.join(f"{k}=%s" for k in updates)
        db_execute(f"UPDATE business_units SET {set_clause}, updated_at=NOW() WHERE id=%s",
                  list(updates.values()) + [bid])
        return ok(message="Updated")
    db_execute("UPDATE business_units SET is_active=0 WHERE id=%s", (bid,))
    return ok(message="Deleted")


# ═══════════════════════════════════════════════════════════════
# DEPARTMENTS
# ═══════════════════════════════════════════════════════════════

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
    # Try with all v2 columns first, fall back to v1 columns if migration not run yet
    try:
        result = db_execute("""INSERT INTO departments
            (name, business_unit_id, cost_centre_id, head_name, location,
             budget, manager_id, location_id, parent_dept_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (d['name'], d.get('business_unit_id'), d.get('cost_centre_id'),
             d.get('head_name'), d.get('location'), d.get('budget', 0),
             d.get('manager_id'), d.get('location_id'), d.get('parent_dept_id')), returning=True)
    except Exception:
        result = db_execute("""INSERT INTO departments
            (name, business_unit_id, cost_centre_id, head_name, location, budget)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
            (d['name'], d.get('business_unit_id'), d.get('cost_centre_id'),
             d.get('head_name'), d.get('location'), d.get('budget', 0)), returning=True)
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
        db_execute("""UPDATE departments SET name=%s, business_unit_id=%s, cost_centre_id=%s, head_name=%s, location=%s, budget=%s, updated_at=NOW() WHERE id=%s""",
            (d.get('name',dept['name']), d.get('business_unit_id',dept['business_unit_id']), d.get('cost_centre_id',dept['cost_centre_id']), d.get('head_name',dept.get('head_name')), d.get('location',dept.get('location')), d.get('budget',dept.get('budget',0)), did))
        return ok(message="Updated")
    db_execute("UPDATE departments SET is_active=0 WHERE id=%s", (did,))
    return ok(message="Deleted")


# ═══════════════════════════════════════════════════════════════
# COST CENTRES
# ═══════════════════════════════════════════════════════════════

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
        result = db_execute("""INSERT INTO cost_centres (name, code, business_unit_id, budget)
            VALUES (%s,%s,%s,%s) RETURNING id""",
            (d['name'], d['code'], d.get('business_unit_id'), d.get('budget',0)), returning=True)
    except Exception as ex:
        if 'unique' in str(ex).lower(): return err(f"Code '{d['code']}' already exists")
        raise
    return created({'id': result['id']})

@org_bp.route('/cost-centres/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def cc_detail(cid):
    cc = db_row1("SELECT * FROM cost_centres WHERE id=%s AND is_active=1", (cid,))
    if not cc: return not_found("Cost Centre")
    if request.method == 'GET': return ok(cc)
    if request.method == 'PUT':
        d = request.get_json() or {}
        updates = {
            'name':           d.get('name', cc['name']),
            'business_unit_id':d.get('business_unit_id', cc['business_unit_id']),
            'budget':         d.get('budget', cc['budget']),
        }
        if 'is_active' in d:
            updates['is_active'] = d['is_active']
        if 'manager_id' in d: updates['manager_id'] = d['manager_id']
        if 'currency'   in d: updates['currency']   = d['currency']
        set_clause = ', '.join(f"{k}=%s" for k in updates)
        db_execute(f"UPDATE cost_centres SET {set_clause}, updated_at=NOW() WHERE id=%s",
                  list(updates.values()) + [cid])
        return ok(message="Updated")
    db_execute("UPDATE cost_centres SET is_active=0 WHERE id=%s", (cid,))
    return ok(message="Deleted")


# ═══════════════════════════════════════════════════════════════
# LOCATIONS
# ═══════════════════════════════════════════════════════════════

@org_bp.route('/locations', methods=['GET'])
@require_auth
def list_locations():
    return ok(db_rows("SELECT * FROM office_locations WHERE is_active=1 ORDER BY name"))

@org_bp.route('/locations', methods=['POST'])
@require_auth
@require_role('Admin')
def create_location():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required'], 'city': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO office_locations
        (name, city, state, country, address_line1, pincode, type, headcount, phone, email, business_unit_id, manager_id, is_hq)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('city'), d.get('state'), d.get('country','India'),
         d.get('address_line1') or d.get('address'), d.get('pincode'),
         d.get('type','Regional'), d.get('headcount',0) or 0,
         d.get('phone') or None, d.get('email') or None,
         _int(d.get('business_unit_id')), _int(d.get('manager_id')),
         int(d.get('is_hq',0) or 0)), returning=True)
    return created({'id': result['id']})

@org_bp.route('/locations/<int:lid>', methods=['GET','PUT','DELETE'])
@require_auth
def location_detail(lid):
    loc = db_row1("SELECT * FROM office_locations WHERE id=%s AND is_active=1", (lid,))
    if not loc: return not_found("Location")
    if request.method == 'GET': return ok(loc)
    if request.method == 'PUT':
        d = request.get_json() or {}
        updates = {
            'name':         d.get('name', loc['name']),
            'city':         d.get('city', loc.get('city')),
            'address_line1':d.get('address_line1') or d.get('address', loc.get('address_line1')),
            'pincode':      d.get('pincode', loc.get('pincode')),
            'type':         d.get('type', loc.get('type','Regional')),
            'headcount':    d.get('headcount', loc.get('headcount', 0)),
        }
        if 'phone'           in d: updates['phone']           = d['phone']
        if 'email'           in d: updates['email']           = d['email']
        if 'manager_id'      in d: updates['manager_id']      = d['manager_id']
        if 'business_unit_id'in d: updates['business_unit_id']= d['business_unit_id']
        if 'is_hq'           in d: updates['is_hq']           = d['is_hq']
        if 'is_active'       in d: updates['is_active']       = d['is_active']
        if 'state_id'        in d: updates['state_id']        = d['state_id']
        set_clause = ', '.join(f"{k}=%s" for k in updates)
        db_execute(f"UPDATE office_locations SET {set_clause}, updated_at=NOW() WHERE id=%s",
                  list(updates.values()) + [lid])
        return ok(message="Updated")
    db_execute("UPDATE office_locations SET is_active=0 WHERE id=%s", (lid,))
    return ok(message="Deleted")


@org_bp.route('/organisation/logo', methods=['POST'])
@require_auth
@require_role('Admin')
def upload_logo():
    """Upload company logo as base64."""
    d = request.get_json() or {}
    logo_data = d.get('file_data')
    mime_type  = d.get('mime_type', 'image/png')
    if not logo_data:
        return err("No file data provided")
    try:
        db_execute("UPDATE organisation SET logo_data=%s, logo_mime=%s WHERE id=(SELECT id FROM organisation LIMIT 1)",
                  (logo_data, mime_type))
    except Exception:
        # logo_data column may not exist yet — migration pending
        db_execute("UPDATE organisation SET logo_url=%s WHERE id=(SELECT id FROM organisation LIMIT 1)",
                  ("data:" + mime_type + ";base64," + logo_data[:100] + "...",))
    return ok(message="Logo uploaded")

@org_bp.route('/organisation/logo', methods=['GET'])
def get_logo():
    """Return logo as image."""
    from flask import make_response
    try:
        org = db_row1("SELECT logo_data, logo_mime FROM organisation LIMIT 1")
    except Exception:
        return err("No logo", 404)
    if not org or not org.get('logo_data'):
        return err("No logo", 404)
    import base64
    data = base64.b64decode(org['logo_data'])
    resp = make_response(data)
    resp.headers['Content-Type'] = org.get('logo_mime', 'image/png')
    resp.headers['Cache-Control'] = 'public, max-age=86400'
    return resp
