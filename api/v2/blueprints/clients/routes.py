"""Clients Blueprint"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

clients_bp = Blueprint('clients', __name__, url_prefix='/api/v1')

@clients_bp.route('/clients', methods=['GET'])
@require_auth
def list_clients():
    page, per_page = get_page_params()
    search = request.args.get('q','')
    where, params = ["c.deleted_at IS NULL"], []
    if search:
        where.append("(c.name ILIKE %s OR c.pan ILIKE %s OR c.email ILIKE %s)")
        params += [f'%{search}%']*3
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM clients c WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT c.*, COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT i.id) as invoice_count,
        COALESCE(SUM(i.total_amount),0) as total_billed
        FROM clients c
        LEFT JOIN projects p ON p.client_id=c.id AND p.deleted_at IS NULL
        LEFT JOIN invoices i ON i.client_id=c.id
        WHERE {clause} GROUP BY c.id ORDER BY c.name LIMIT %s OFFSET %s""",
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
    result = db_execute("""INSERT INTO clients
        (name, legal_name, type, industry, website, email, phone, pan, gstin,
         address, city, state, pincode, country, payment_terms_id, credit_limit,
         account_manager_id, status, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'], d.get('legal_name'), d.get('type','Direct'), d.get('industry'),
         d.get('website'), d.get('email'), d.get('phone'), d.get('pan'), d.get('gstin'),
         d.get('address'), d.get('city'), d.get('state'), d.get('pincode'),
         d.get('country','India'), d.get('payment_terms_id'), d.get('credit_limit'),
         d.get('account_manager_id'), d.get('status','Active'), g.user['id']), returning=True)
    write_audit_log('clients', 'CREATE', 'client', result['id'], f"Client created: {d['name']}")
    return created({'id': result['id']})

@clients_bp.route('/clients/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def client_detail(cid):
    client = db_row1("SELECT * FROM clients WHERE id=%s AND deleted_at IS NULL", (cid,))
    if not client: return not_found("Client")
    if request.method == 'GET':
        client['projects']  = db_rows("SELECT id, code, name, status FROM projects WHERE client_id=%s AND deleted_at IS NULL", (cid,))
        client['invoices']  = db_rows("""SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount, s.name as status
            FROM invoices i LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
            WHERE i.client_id=%s ORDER BY i.invoice_date DESC LIMIT 10""", (cid,))
        return ok(client)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['name','legal_name','type','industry','website','email','phone','pan','gstin',
                  'address','city','state','pincode','country','payment_terms_id',
                  'credit_limit','account_manager_id','status','rating','notes']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE clients SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [cid])
        write_audit_log('clients', 'UPDATE', 'client', cid, f"Client updated: {client['name']}")
        return ok(message="Updated")
    db_execute("UPDATE clients SET deleted_at=NOW() WHERE id=%s", (cid,))
    write_audit_log('clients', 'DELETE', 'client', cid, f"Client deleted: {client['name']}")
    return ok(message="Deleted")

@clients_bp.route('/lookup/clients')
@require_auth
def lookup_clients():
    return ok(db_rows("SELECT id, name FROM clients WHERE deleted_at IS NULL ORDER BY name"))
