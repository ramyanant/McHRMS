"""Invoices Blueprint — v1 schema compatible
v1 invoices: amount + tax_amount, total_amount GENERATED, NO GST breakdown columns
"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

inv_bp = Blueprint('invoices', __name__, url_prefix='/api/v1')

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
    cur.execute("""INSERT INTO invoices
        (invoice_number, client_id, contract_type_id, period_start, period_end,
         amount, tax_amount, due_date, notes, po_number,
         cost_centre_id, description, status_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (inv_no, d['client_id'], d.get('contract_type_id'),
         d.get('period_start'), d.get('period_end'),
         subtotal, tax_amount, d.get('due_date'), d.get('notes'),
         d.get('po_number'), d.get('cost_centre_id'), d.get('description'), status_id))
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
