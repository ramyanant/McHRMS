"""Clients Blueprint — v1 schema compatible"""
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

clients_bp = Blueprint('clients', __name__, url_prefix='/api/v2')

@clients_bp.route('/clients', methods=['GET'])
@require_auth
def list_clients():
    page, per_page = get_page_params()
    search = request.args.get('q', '')
    where, params = ["c.is_active=1"], []
    if search:
        where.append("(c.name ILIKE %s OR c.contact_email ILIKE %s OR c.gstin ILIKE %s)")
        params += [f'%{search}%'] * 3
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM clients c WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT c.id, c.name, c.industry, c.status, c.rating,
        c.contact_email, c.contact_phone, c.city, c.gstin, c.pan, c.is_active,
        c.health_score, c.account_manager_id,
        (c.logo_data IS NOT NULL) as has_logo,
        e.first_name||' '||e.last_name as account_manager_name,
        e.photo_url as account_manager_photo_url,
        ct.name as contract_type,
        (SELECT COUNT(*) FROM invoices i WHERE i.client_id=c.id) as invoice_count
        FROM clients c
        LEFT JOIN employees e ON e.id=c.account_manager_id
        LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
        WHERE {clause} ORDER BY c.name LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@clients_bp.route('/clients', methods=['POST'])
@require_auth
@require_role('Admin', 'Account Manager')
def create_client():
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    conn = get_pg_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""INSERT INTO clients
        (name, industry, contract_type_id, currency, payment_terms_id,
         status, rating, referred_by, primary_contact, primary_contact_designation,
         contact_email, contact_phone,
         billing_contact_name, billing_contact_email, billing_contact_phone,
         address_line1, address_line2, city, state_id, pincode, country_id,
         gstin, pan, account_manager_id, health_score)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id""",
        (d['name'], d.get('industry'), d.get('contract_type_id'), d.get('currency','INR'),
         d.get('payment_terms_id'), d.get('status','Active'), d.get('rating',0),
         d.get('referred_by'), d.get('primary_contact'), d.get('primary_contact_designation'),
         d.get('contact_email') or d.get('email'), d.get('contact_phone') or d.get('phone'),
         d.get('billing_contact_name'), d.get('billing_contact_email'), d.get('billing_contact_phone'),
         d.get('address'), d.get('address_line2'), d.get('city'), d.get('state_id'),
         d.get('pincode'), d.get('country_id'), d.get('gstin'), d.get('pan'),
         _int(d.get('account_manager_id')), d.get('health_score', 80)))
    cid = cur.fetchone()['id']
    conn.close()
    write_audit_log('clients', 'CREATE', 'client', cid, f"Client created: {d['name']}")
    return created({'id': cid})

@clients_bp.route('/clients/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
@require_role('Admin', 'Account Manager')
def client_detail(cid):
    client = db_row1("""SELECT c.*,
        e.first_name||' '||e.last_name as account_manager_name,
        e.photo_url as account_manager_photo_url,
        ct.name as contract_type, pt.name as payment_terms
        FROM clients c
        LEFT JOIN employees e ON e.id=c.account_manager_id
        LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
        LEFT JOIN master_payment_terms pt ON pt.id=c.payment_terms_id
        WHERE c.id=%s""", (cid,))
    if not client: return not_found("Client")

    if request.method == 'GET':
        client['invoices'] = db_rows("""SELECT i.id, i.invoice_number, i.amount, i.total_amount,
            i.due_date, s.name as status FROM invoices i
            LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
            WHERE i.client_id=%s ORDER BY i.created_at DESC LIMIT 10""", (cid,))
        return ok(client)

    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['name','legal_name','industry','website','contract_type_id','currency',
                  'payment_terms_id','status','rating','primary_contact','primary_contact_designation',
                  'contact_email','contact_phone','billing_contact_name','billing_contact_email',
                  'billing_contact_phone','address_line1','address_line2','city','state','state_id',
                  'pincode','country','gstin','pan','account_manager_id','health_score','is_active',
                  'notes','referred_by','credit_limit']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE clients SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [cid])
        write_audit_log('clients', 'UPDATE', 'client', cid, f"Client updated: {client['name']}")
        return ok(message="Updated")

    # Guard: refuse to soft-delete a client that still has active invoices
    # — would orphan financial records. Fail-open if the count query errors
    # (e.g. invoices table shape differs) so we never turn a delete into a 500.
    try:
        n = db_row1("SELECT COUNT(*) AS n FROM invoices WHERE client_id=%s AND is_active=1", (cid,))['n']
    except Exception:
        n = 0
    if n:
        return err(f"Cannot delete: client has {n} active invoice(s). Deactivate or reassign them first.", 409)
    db_execute("UPDATE clients SET is_active=0, updated_at=NOW() WHERE id=%s", (cid,))
    return ok(message="Deleted")

@clients_bp.route('/lookup/clients')
@require_auth
def lookup_clients():
    return ok(db_rows("SELECT id, name FROM clients WHERE is_active=1 ORDER BY name"))


@clients_bp.route('/clients/<int:cid>/documents', methods=['GET','POST'])
@require_auth
def client_documents(cid):
    if request.method == 'GET':
        try:
            docs = db_rows("""SELECT id, doc_type, doc_name, file_size, mime_type, file_data,
                uploaded_at, expiry_date, notes FROM client_documents
                WHERE client_id=%s AND is_active=1 ORDER BY uploaded_at DESC""", (cid,))
            return ok(docs)
        except Exception:
            return ok([])
    d = request.get_json() or {}
    try:
        db_execute("""INSERT INTO client_documents
            (client_id, doc_type, doc_name, file_size, mime_type, file_data, notes, uploaded_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (cid, d.get('doc_type','Other'), d.get('doc_name','Document'),
             d.get('file_size'), d.get('mime_type'), d.get('file_data'),
             d.get('notes'), g.user.get('id')))
        return created(message="Document uploaded")
    except Exception as ex:
        return err(str(ex))


@clients_bp.route('/clients/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
def client_document_detail(did):
    if request.method == 'DELETE':
        db_execute("UPDATE client_documents SET is_active=0 WHERE id=%s", (did,))
        return ok(message="Deleted")
    doc = db_row1("SELECT * FROM client_documents WHERE id=%s", (did,))
    return ok(doc) if doc else not_found("Document")


# -- Logo upload / serve (base64) --------------------------------
@clients_bp.route('/clients/<int:cid>/logo', methods=['POST'])
@require_auth
def upload_clients_logo(cid):
    d = request.get_json() or {}
    if not d.get('file_data'):
        return err("No file data provided")
    db_execute("UPDATE clients SET logo_data=%s, logo_mime=%s WHERE id=%s",
               (d['file_data'], d.get('mime_type', 'image/png'), cid))
    return ok(message="Logo uploaded")

@clients_bp.route('/clients/<int:cid>/logo', methods=['GET'])
def get_clients_logo(cid):
    from flask import make_response
    import base64
    row = db_row1("SELECT logo_data, logo_mime FROM clients WHERE id=%s", (cid,))
    if not row or not row.get('logo_data'):
        return err("No logo", 404)
    resp = make_response(base64.b64decode(row['logo_data']))
    resp.headers['Content-Type'] = row.get('logo_mime') or 'image/png'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp
