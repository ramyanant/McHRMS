"""Invoices & Billing Blueprint — GST-ready invoicing"""
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
    year  = datetime.now().year
    last  = db_row1("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1")
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
    rows   = db_rows(f"""SELECT i.*, s.name as status_name, c.name as client_name, p.name as project_name
        FROM invoices i
        LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
        LEFT JOIN clients c ON c.id=i.client_id
        LEFT JOIN projects p ON p.id=i.project_id
        WHERE {clause} ORDER BY i.invoice_date DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@inv_bp.route('/invoices', methods=['POST'])
@require_auth
@require_role('Admin', 'Finance Manager', 'Finance')
def create_invoice():
    d = request.get_json() or {}
    try: validate(d, {'client_id':['required'], 'invoice_date':['required','date']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    inv_no = _next_invoice_number()
    # Calculate GST amounts
    subtotal = float(d.get('subtotal', 0))
    disc_pct = float(d.get('discount_pct', 0))
    disc_amt = round(subtotal * disc_pct / 100, 2)
    taxable  = round(subtotal - disc_amt, 2)
    cgst_pct = float(d.get('cgst_pct', 0)); cgst_amt = round(taxable * cgst_pct / 100, 2)
    sgst_pct = float(d.get('sgst_pct', 0)); sgst_amt = round(taxable * sgst_pct / 100, 2)
    igst_pct = float(d.get('igst_pct', 0)); igst_amt = round(taxable * igst_pct / 100, 2)
    total    = round(taxable + cgst_amt + sgst_amt + igst_amt, 2)

    status_id = db_row1("SELECT id FROM master_invoice_statuses WHERE name='Draft' LIMIT 1")
    status_id = status_id['id'] if status_id else None

    conn = get_pg_conn()
    try:
        conn.autocommit = False
        cur = conn.cursor()
        cur.execute("""INSERT INTO invoices
            (invoice_number, client_id, project_id, status_id, invoice_date, due_date,
             billing_period_from, billing_period_to, subtotal, discount_pct, discount_amount,
             taxable_amount, cgst_pct, sgst_pct, igst_pct, cgst_amount, sgst_amount, igst_amount,
             total_amount, balance_due, payment_terms_id, notes, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (inv_no, d['client_id'], d.get('project_id'), status_id, d['invoice_date'],
             d.get('due_date'), d.get('billing_period_from'), d.get('billing_period_to'),
             subtotal, disc_pct, disc_amt, taxable, cgst_pct, sgst_pct, igst_pct,
             cgst_amt, sgst_amt, igst_amt, total, total,
             d.get('payment_terms_id'), d.get('notes'), g.user['id']))
        iid = cur.fetchone()['id']

        for item in d.get('line_items', []):
            qty  = float(item.get('quantity', 1))
            rate = float(item.get('rate', 0))
            amt  = round(qty * rate, 2)
            cur.execute("""INSERT INTO invoice_line_items
                (invoice_id, description, resource_name, employee_id, quantity, unit, rate, amount, order_seq)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (iid, item.get('description'), item.get('resource_name'),
                 item.get('employee_id'), qty, item.get('unit','Hours'), rate, amt,
                 item.get('order_seq', 0)))
        conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

    write_audit_log('invoices', 'CREATE', 'invoice', iid, f"Invoice created: {inv_no}")
    return created({'id': iid, 'invoice_number': inv_no})

@inv_bp.route('/invoices/<int:iid>', methods=['GET','PUT'])
@require_auth
def invoice_detail(iid):
    inv = db_row1("""SELECT i.*, s.name as status_name, c.name as client_name,
        p.name as project_name FROM invoices i
        LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
        LEFT JOIN clients c ON c.id=i.client_id
        LEFT JOIN projects p ON p.id=i.project_id
        WHERE i.id=%s""", (iid,))
    if not inv: return not_found("Invoice")
    if request.method == 'GET':
        inv['line_items'] = db_rows(
            "SELECT * FROM invoice_line_items WHERE invoice_id=%s ORDER BY order_seq", (iid,))
        return ok(inv)

    d = request.get_json() or {}
    new_status = d.get('status_name')
    if new_status:
        s = db_row1("SELECT id FROM master_invoice_statuses WHERE name=%s", (new_status,))
        if s:
            updates = {'status_id': s['id']}
            if new_status == 'Paid':
                updates['payment_date']      = d.get('payment_date')
                updates['payment_reference'] = d.get('payment_reference')
                updates['amount_paid']       = inv['total_amount']
                updates['balance_due']       = 0
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE invoices SET {set_clause}, updated_at=NOW(), updated_by=%s WHERE id=%s",
                      list(updates.values()) + [g.user['id'], iid])
    write_audit_log('invoices', 'UPDATE', 'invoice', iid,
                    f"Invoice updated: {inv['invoice_number']} -> {new_status or 'edited'}")
    return ok(message="Updated")

@inv_bp.route('/invoices/summary')
@require_auth
def invoice_summary():
    return ok({
        'total_invoiced':   db_row1("SELECT COALESCE(SUM(total_amount),0) as v FROM invoices")['v'],
        'total_paid':       db_row1("SELECT COALESCE(SUM(amount_paid),0) as v FROM invoices")['v'],
        'total_overdue':    db_row1("""SELECT COALESCE(SUM(balance_due),0) as v FROM invoices i
            JOIN master_invoice_statuses s ON s.id=i.status_id
            WHERE s.name NOT IN ('Paid','Cancelled') AND i.due_date < CURRENT_DATE""")['v'],
        'by_status': db_rows("""SELECT s.name as status, COUNT(i.id) as count,
            COALESCE(SUM(i.total_amount),0) as amount
            FROM master_invoice_statuses s
            LEFT JOIN invoices i ON i.status_id=s.id
            GROUP BY s.name ORDER BY s.name"""),
    })
