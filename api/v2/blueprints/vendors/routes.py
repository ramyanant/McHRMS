"""Vendors Blueprint — v1 schema compatible"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

vendors_bp = Blueprint('vendors', __name__, url_prefix='/api/v1')

@vendors_bp.route('/vendors', methods=['GET'])
@require_auth
def list_vendors():
    page, per_page = get_page_params()
    search = request.args.get('q','')
    where, params = ["v.is_active=1"], []
    if search:
        where.append("(v.name ILIKE %s OR v.contact_email ILIKE %s)")
        params += [f'%{search}%'] * 2
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
    cur.execute("""INSERT INTO vendors
        (name, category_id, status, rating, primary_contact, primary_contact_designation,
         contact_email, contact_phone, address_line1, city, state_id, pincode, country_id,
         gstin, pan, account_manager_id, sla_score)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('category_id'), d.get('status','Active'), d.get('rating',0),
         d.get('primary_contact'), d.get('primary_contact_designation'),
         d.get('contact_email') or d.get('email'),
         d.get('contact_phone') or d.get('phone'),
         d.get('address'), d.get('city'), d.get('state_id'), d.get('pincode'), d.get('country_id'),
         d.get('gstin'), d.get('pan'), d.get('account_manager_id'), d.get('sla_score', 90)))
    vid = cur.fetchone()['id']
    conn.close()
    write_audit_log('vendors', 'CREATE', 'vendor', vid, f"Vendor created: {d['name']}")
    return created({'id': vid})

@vendors_bp.route('/vendors/<int:vid>', methods=['GET','PUT','DELETE'])
@require_auth
def vendor_detail(vid):
    vendor = db_row1("""SELECT v.*, vc.name as category_name,
        e.first_name||' '||e.last_name as account_manager_name
        FROM vendors v
        LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
        LEFT JOIN employees e ON e.id=v.account_manager_id
        WHERE v.id=%s AND v.is_active=1""", (vid,))
    if not vendor: return not_found("Vendor")
    if request.method == 'GET':
        vendor['documents'] = db_rows("SELECT id, doc_type, doc_name, uploaded_at FROM vendor_documents WHERE vendor_id=%s", (vid,))
        return ok(vendor)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['name','category_id','status','rating','primary_contact','contact_email',
                  'contact_phone','address_line1','city','state_id','gstin','pan','sla_score']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE vendors SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [vid])
        return ok(message="Updated")
    db_execute("UPDATE vendors SET is_active=0, updated_at=NOW() WHERE id=%s", (vid,))
    return ok(message="Deleted")
