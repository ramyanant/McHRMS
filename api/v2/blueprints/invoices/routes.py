"""Invoices Blueprint — v1 schema compatible
v1 invoices: amount + tax_amount, total_amount GENERATED, NO GST breakdown columns
"""
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

inv_bp = Blueprint('invoices', __name__, url_prefix='/api/v2')

def _next_invoice_number():
    from datetime import datetime
    year = datetime.now().year
    last = db_row1("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1")
    if last and last['invoice_number']:
        try: return f"INV-{year}-{int(last['invoice_number'].split('-')[-1])+1:04d}"
        except: pass
    return f"INV-{year}-0001"

@inv_bp.route('/invoices', methods=['GET'])
@require_auth
def list_invoices():
    page, per_page = get_page_params()
    client_id = request.args.get('client_id')
    status    = request.args.get('status')
    where, params = ["1=1"], []
    if client_id: where.append("i.client_id=%s"); params.append(client_id)
    if status:    where.append("s.name=%s");       params.append(status)
    clause = " AND ".join(where)
    total  = db_row1(f"""SELECT COUNT(*) as n FROM invoices i
        LEFT JOIN master_invoice_statuses s ON s.id=i.status_id WHERE {clause}""", params)['n']
    rows   = db_rows(f"""SELECT i.*, s.name as status_name, c.name as client_name
        FROM invoices i
        LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
        LEFT JOIN clients c ON c.id=i.client_id
        WHERE {clause} ORDER BY i.created_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@inv_bp.route('/invoices', methods=['POST'])
@require_auth
@require_role('Admin', 'Finance Manager')
def create_invoice():
    d = request.get_json() or {}
    try: validate(d, {'client_id': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    # Manual invoice number — use provided or auto-generate as fallback
    inv_no = d.get('invoice_number') or _next_invoice_number()

    subtotal   = float(d.get('amount', 0))
    tax_pct    = float(d.get('tax_pct', 18))
    tax_amount = round(float(d.get('tax_amount', subtotal * tax_pct / 100)), 2)
    total      = round(subtotal + tax_amount, 2)

    status_id = db_row1("SELECT id FROM master_invoice_statuses WHERE name='Draft' LIMIT 1")
    status_id = status_id['id'] if status_id else None

    conn = get_pg_conn()
    conn.autocommit = True
    cur = conn.cursor()
    # The new-invoice form on the frontend (static/js/pages/invoices.js)
    # base64-encodes an attached PDF and sends invoice_file_data +
    # invoice_file_name. Persist them here so /invoices/<id> can render
    # the Download button. Columns are added by migrations in api/v2/__init__.py.
    cur.execute("""INSERT INTO invoices
        (invoice_number, client_id, contract_type_id, period_start, period_end,
         amount, tax_amount, due_date, notes, po_number,
         cost_centre_id, description, status_id,
         invoice_file_data, invoice_file_name)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (inv_no, d['client_id'], d.get('contract_type_id'),
         d.get('period_start'), d.get('period_end'),
         subtotal, tax_amount, d.get('due_date'), d.get('notes'),
         d.get('po_number'), _int(d.get('cost_centre_id')), d.get('description'), status_id,
         d.get('invoice_file_data'), d.get('invoice_file_name')))
    iid = cur.fetchone()['id']
    conn.close()

    write_audit_log('invoices', 'CREATE', 'invoice', iid, "Invoice created: " + inv_no)
    return created({'id': iid, 'invoice_number': inv_no})

@inv_bp.route('/invoices/<int:iid>', methods=['GET','PUT'])
@require_auth
def invoice_detail(iid):
    inv = db_row1("""SELECT i.*, s.name as status_name, c.name as client_name
        FROM invoices i
        LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
        LEFT JOIN clients c ON c.id=i.client_id
        WHERE i.id=%s""", (iid,))
    if not inv: return not_found("Invoice")
    if request.method == 'GET':
        import datetime
        # Convert date objects to ISO strings for JSON serialization
        for date_field in ['period_start', 'period_end', 'due_date', 'paid_date', 'invoice_date']:
            if inv.get(date_field) and not isinstance(inv[date_field], str):
                inv[date_field] = inv[date_field].isoformat()
        inv['line_items'] = db_rows(
            "SELECT *, hours as quantity, hours * rate as amount FROM invoice_line_items WHERE invoice_id=%s ORDER BY id", (iid,))
        return ok(inv)
    d = request.get_json() or {}
    # Handle is_active (delete/restore)
    if 'is_active' in d:
        db_execute("UPDATE invoices SET is_active=%s, updated_at=NOW() WHERE id=%s",
                   (d['is_active'], iid))
        write_audit_log('invoices', 'DELETE' if not d['is_active'] else 'UPDATE', 'invoice', iid, "Invoice deleted")
        return ok(message="Updated")
    # Handle status update
    new_status = d.get('status_name')
    if new_status:
        s = db_row1("SELECT id FROM master_invoice_statuses WHERE name=%s", (new_status,))
        if s:
            updates = {'status_id': s['id']}
            if new_status == 'Paid':
                updates['paid_date']    = d.get('payment_date')
                updates['payment_ref']  = d.get('payment_reference')
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE invoices SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [iid])
    # Invoice number is immutable after creation (audit / accounting
    # integrity). Reject an attempt to change it, but allow resubmitting
    # the same value (idempotent edits don't break).
    if 'invoice_number' in d and str(d.get('invoice_number') or '') != str(inv.get('invoice_number') or ''):
        return err("Invoice number cannot be changed after creation.", 400)
    # Handle general field updates (invoice_number intentionally excluded)
    allowed = ['description','period_start','period_end',
               'due_date','po_number','notes','invoice_file_data','invoice_file_name']
    gen_updates = {k: d[k] for k in allowed if k in d}
    if gen_updates:
        sc = ', '.join(f"{k}=%s" for k in gen_updates)
        db_execute(f"UPDATE invoices SET {sc}, updated_at=NOW() WHERE id=%s",
                  list(gen_updates.values()) + [iid])
    write_audit_log('invoices', 'UPDATE', 'invoice', iid,
                    f"Invoice updated: status={new_status}")
    return ok(message="Updated")

@inv_bp.route('/invoices/summary')
@require_auth
def invoice_summary():
    return ok({
        'total_invoiced': db_row1("SELECT COALESCE(SUM(amount),0) as v FROM invoices")['v'],
        'total_paid':     db_row1("""SELECT COALESCE(SUM(total_amount),0) as v FROM invoices i
            JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Paid'""")['v'],
        'total_overdue':  db_row1("""SELECT COALESCE(SUM(total_amount),0) as v FROM invoices i
            JOIN master_invoice_statuses s ON s.id=i.status_id
            WHERE s.name NOT IN ('Paid','Cancelled') AND i.due_date < CURRENT_DATE""")['v'],
        'by_status': db_rows("""SELECT s.name as status, COUNT(i.id) as count,
            COALESCE(SUM(i.total_amount),0) as amount
            FROM master_invoice_statuses s
            LEFT JOIN invoices i ON i.status_id=s.id
            GROUP BY s.name ORDER BY s.name"""),
    })

@inv_bp.route('/invoices/<int:iid>/documents', methods=['GET','POST'])
@require_auth
def invoice_docs(iid):
    if request.method == 'GET':
        try:
            docs = db_rows("""SELECT id, doc_type, doc_name, file_size, mime_type, file_data,
                uploaded_at, notes FROM invoice_documents
                WHERE invoice_id=%s AND is_active=1 ORDER BY uploaded_at DESC""", (iid,))
            return ok(docs)
        except Exception: return ok([])
    d = request.get_json() or {}
    try:
        db_execute("""INSERT INTO invoice_documents
            (invoice_id, doc_type, doc_name, file_size, mime_type, file_data, notes, uploaded_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (iid, d.get('doc_type','Invoice'), d.get('doc_name','Document'),
             d.get('file_size'), d.get('mime_type'), d.get('file_data'),
             d.get('notes'), g.user.get('id')))
        return created(message="Document uploaded")
    except Exception as ex: return err(str(ex))

@inv_bp.route('/invoices/<int:iid>/documents/<int:did>', methods=['DELETE'])
@require_auth
def invoice_doc_detail(iid, did):
    db_execute("UPDATE invoice_documents SET is_active=0 WHERE id=%s AND invoice_id=%s", (did, iid))
    return ok(message="Deleted")
