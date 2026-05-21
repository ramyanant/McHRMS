"""Vendors Blueprint — v1 schema compatible"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role

def _int(v):
    try: return int(v) if v not in (None,'','null','undefined') else None
    except: return None

def _float(v, d=0):
    try: return float(v) if v not in (None,'','null','undefined') else d
    except: return d
from ...middleware.auth import require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

vendors_bp = Blueprint('vendors', __name__, url_prefix='/api/v2')

@vendors_bp.route('/vendors', methods=['GET'])
@require_auth
def list_vendors():
    page, per_page = get_page_params()
    search = request.args.get('q','')
    where, params = ["v.is_active=1"], []
    if search:
        where.append("(v.name ILIKE %s OR COALESCE(v.contact_email, v.email) ILIKE %s OR v.city ILIKE %s)")
        params += [f'%{search}%'] * 3
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM vendors v WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT v.*, vc.name as category_name FROM vendors v
        LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
        WHERE {clause} ORDER BY v.name LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@vendors_bp.route('/vendors', methods=['POST'])
@require_auth
@require_role('Admin')
def create_vendor():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    conn = get_pg_conn()
    conn.autocommit = True
    cur = conn.cursor()
    # Lookup or create category
    cat_name = d.get('category') or d.get('category_name')
    cat_id   = _int(d.get('category_id'))
    if not cat_id and cat_name:
        cat = db_row1("SELECT id FROM master_vendor_categories WHERE name ILIKE %s", (cat_name,))
        if cat: cat_id = cat['id']
    cur.execute("""INSERT INTO vendors
        (name, category_id, status, primary_contact, primary_contact_designation,
         contact_email, contact_phone, address_line1, city, pincode,
         gstin, pan, account_manager_id, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], cat_id, d.get('status','Active'),
         d.get('primary_contact'), d.get('primary_contact_designation'),
         d.get('contact_email') or d.get('email'),
         d.get('contact_phone') or d.get('phone'),
         d.get('address') or d.get('address_line1'), d.get('city'), d.get('pincode'),
         d.get('gstin'), d.get('pan'), d.get('account_manager_id'), d.get('notes')))
    row = cur.fetchone()
    vid = row['id'] if row else None
    if not vid: raise Exception("Failed to create vendor")
    conn.close()
    write_audit_log('vendors', 'CREATE', 'vendor', vid, f"Vendor created: {d['name']}")
    return created({'id': vid})

@vendors_bp.route('/vendors/<int:vid>', methods=['GET','PUT','DELETE'])
@require_auth
@require_role('Admin')
def vendor_detail(vid):
    vendor = db_row1("""SELECT v.*, vc.name as category_name
        FROM vendors v
        LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
        WHERE v.id=%s""", (vid,))
    if vendor and vendor.get('account_manager_id'):
        am = db_row1("SELECT first_name||' '||last_name as name FROM employees WHERE id=%s",
                     (vendor['account_manager_id'],))
        if am: vendor['account_manager_name'] = am['name']
    if not vendor: return not_found("Vendor")
    if request.method == 'GET':
        vendor['documents'] = db_rows("SELECT id, doc_type, doc_name, file_size, mime_type, file_data, notes, uploaded_at FROM vendor_documents WHERE vendor_id=%s", (vid,))
        return ok(vendor)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['name','category_id','is_active','status','rating','primary_contact',
                  'primary_contact_designation','contact_email','contact_phone',
                  'address_line1','city','state','gstin','pan','notes','website',
                  'payment_terms_id','account_manager_id','sla_score','state_id']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE vendors SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [vid])
        return ok(message="Updated")
    # Guard: refuse to soft-delete a vendor that still has active
    # bills/expenses pointing at it. Fail-open if the count query errors.
    try:
        n = db_row1("SELECT COUNT(*) AS n FROM bills_expenses WHERE vendor_id=%s AND is_active=1", (vid,))['n']
    except Exception:
        n = 0
    if n:
        return err(f"Cannot delete: vendor has {n} active bill(s)/expense(s). Deactivate them first.", 409)
    db_execute("UPDATE vendors SET is_active=0, updated_at=NOW() WHERE id=%s", (vid,))
    return ok(message="Deleted")


@vendors_bp.route('/vendors/<int:vid>/documents', methods=['GET','POST'])
@require_auth
def vendor_documents(vid):
    if request.method == 'GET':
        try:
            docs = db_rows("""SELECT id, doc_type, doc_name, file_size, mime_type,
                uploaded_at, notes FROM vendor_documents
                WHERE vendor_id=%s AND is_active=1 ORDER BY uploaded_at DESC""", (vid,))
            return ok(docs)
        except Exception: return ok([])
    d = request.get_json() or {}
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS vendor_documents (
            id SERIAL PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id),
            doc_type TEXT, doc_name TEXT, file_name TEXT, file_url TEXT,
            file_data TEXT, file_size TEXT, mime_type TEXT,
            notes TEXT, uploaded_by INTEGER,
            is_active INTEGER DEFAULT 1,
            uploaded_at TIMESTAMP DEFAULT NOW())""")
        cur.execute("""INSERT INTO vendor_documents (vendor_id, doc_type, doc_name, file_data, file_size, mime_type, notes, uploaded_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (vid, d.get('doc_type'), d.get('doc_name'), d.get('file_data'),
             d.get('file_size'), d.get('mime_type'), d.get('notes'), g.user.get('id')))
        doc_id = cur.fetchone()['id']; conn.close()
        return created({'id': doc_id})
    except Exception as e: return err(str(e))

@vendors_bp.route('/vendors/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
@require_role('Admin', 'Finance Manager')
def vendor_doc_detail(did):
    if request.method == 'DELETE':
        db_execute("UPDATE vendor_documents SET is_active=0 WHERE id=%s",(did,))
        return ok(message="Deleted")
    doc = db_row1("SELECT * FROM vendor_documents WHERE id=%s",(did,))
    return ok(doc) if doc else not_found("Document")


@vendors_bp.route('/lookup/vendors')
@require_auth
def lookup_vendors():
    return ok(db_rows("SELECT id, name FROM vendors WHERE is_active=1 ORDER BY name"))


# -- Logo upload / serve (base64) --------------------------------
@vendors_bp.route('/vendors/<int:vid>/logo', methods=['POST'])
@require_auth
def upload_vendors_logo(vid):
    d = request.get_json() or {}
    if not d.get('file_data'):
        return err("No file data provided")
    db_execute("UPDATE vendors SET logo_data=%s, logo_mime=%s WHERE id=%s",
               (d['file_data'], d.get('mime_type', 'image/png'), vid))
    return ok(message="Logo uploaded")

@vendors_bp.route('/vendors/<int:vid>/logo', methods=['GET'])
def get_vendors_logo(vid):
    from flask import make_response
    import base64
    row = db_row1("SELECT logo_data, logo_mime FROM vendors WHERE id=%s", (vid,))
    if not row or not row.get('logo_data'):
        return err("No logo", 404)
    resp = make_response(base64.b64decode(row['logo_data']))
    resp.headers['Content-Type'] = row.get('logo_mime') or 'image/png'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp
