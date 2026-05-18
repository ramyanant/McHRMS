"""Bills & Expenses Blueprint"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

bills_bp = Blueprint('bills', __name__, url_prefix='/api/v2')

@bills_bp.route('/bills', methods=['GET'])
@require_auth
def list_bills():
    page, per_page = get_page_params()
    status   = request.args.get('status','')
    where, params = ["b.is_active=1"], []
    if status: where.append("b.status=%s"); params.append(status)
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM bills_expenses b WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT b.*, v.name as vendor_name, c.name as client_name,
        cc.name as cost_centre_name,
        e.first_name||' '||e.last_name as submitted_by_name
        FROM bills_expenses b
        LEFT JOIN vendors v ON v.id=b.vendor_id
        LEFT JOIN clients c ON c.id=b.client_id
        LEFT JOIN cost_centres cc ON cc.id=b.cost_centre_id
        LEFT JOIN employees e ON e.id=b.submitted_by
        WHERE {clause} ORDER BY b.expense_date DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@bills_bp.route('/bills', methods=['POST'])
@require_auth
def create_bill():
    d = request.get_json() or {}
    try: validate(d, {'expense_type':['required'],'amount':['required'],'expense_date':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    amount = float(d.get('amount',0)); tax = float(d.get('tax_amount',0))
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("""INSERT INTO bills_expenses
        (expense_type,vendor_id,project_id,client_id,cost_centre_id,
         amount,tax_amount,total_amount,currency,expense_date,due_date,
         payment_mode,status,description,bill_number,po_number,
         receipt_data,receipt_name,submitted_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['expense_type'],d.get('vendor_id'),d.get('project_id'),d.get('client_id'),
         d.get('cost_centre_id'),amount,tax,amount+tax,
         d.get('currency','INR'),d['expense_date'],d.get('due_date'),
         d.get('payment_mode','Bank Transfer'),d.get('status','Draft'),
         d.get('description'),d.get('bill_number'),d.get('po_number'),
         d.get('receipt_data'),d.get('receipt_name'),g.user.get('employee_id')))
    bid = cur.fetchone()['id']; conn.close()
    write_audit_log('bills','CREATE','bill',bid,f"Bill: {d['expense_type']}")
    return created({'id': bid})

@bills_bp.route('/bills/<int:bid>', methods=['GET','PUT','DELETE'])
@require_auth
def bill_detail(bid):
    bill = db_row1("""SELECT b.*, v.name as vendor_name
        FROM bills_expenses b LEFT JOIN vendors v ON v.id=b.vendor_id
        WHERE b.id=%s""", (bid,))
    if not bill: return not_found("Bill/Expense")
    if request.method=='GET': return ok(bill)
    if request.method=='DELETE':
        db_execute("UPDATE bills_expenses SET is_active=0 WHERE id=%s",(bid,)); return ok(message="Deleted")
    d = request.get_json() or {}
    # Handle is_active (delete via PUT)
    if 'is_active' in d:
        db_execute("UPDATE bills_expenses SET is_active=%s WHERE id=%s", (d['is_active'], bid))
        return ok(message="Updated")
    fields=['expense_type','vendor_id','project_id','client_id','cost_centre_id',
            'amount','tax_amount','expense_date','due_date','payment_date',
            'payment_ref','payment_mode','status','description','bill_number','po_number']
    updates={k:d[k] for k in fields if k in d}
    if 'amount' in updates or 'tax_amount' in updates:
        updates['total_amount']=float(updates.get('amount',bill['amount']))+float(updates.get('tax_amount',bill['tax_amount']))
    if updates:
        sc=', '.join(f"{k}=%s" for k in updates)
        db_execute(f"UPDATE bills_expenses SET {sc},updated_at=NOW() WHERE id=%s",list(updates.values())+[bid])
    return ok(message="Updated")

@bills_bp.route('/bills/summary')
@require_auth
def bills_summary():
    return ok({
        'total':     db_row1("SELECT COUNT(*) as n FROM bills_expenses WHERE is_active=1")['n'],
        'amount':    db_row1("SELECT COALESCE(SUM(total_amount),0) as n FROM bills_expenses WHERE is_active=1")['n'],
        'pending':   db_row1("SELECT COUNT(*) as n FROM bills_expenses WHERE status='Draft' AND is_active=1")['n'],
        'by_type':   db_rows("SELECT expense_type, COUNT(*) as count, COALESCE(SUM(total_amount),0) as amount FROM bills_expenses WHERE is_active=1 GROUP BY expense_type ORDER BY amount DESC"),
    })

@bills_bp.route('/bills/<int:bid>/documents', methods=['GET','POST'])
@require_auth
def bill_docs(bid):
    if request.method == 'GET':
        try:
            docs = db_rows("""SELECT id, doc_type, doc_name, file_size, mime_type,
                uploaded_at, notes FROM bill_documents
                WHERE bill_id=%s AND is_active=1 ORDER BY uploaded_at DESC""", (bid,))
            return ok(docs)
        except Exception: return ok([])
    d = request.get_json() or {}
    try:
        db_execute("""INSERT INTO bill_documents
            (bill_id, doc_type, doc_name, file_size, mime_type, file_data, notes, uploaded_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (bid, d.get('doc_type','Bill'), d.get('doc_name','Document'),
             d.get('file_size'), d.get('mime_type'), d.get('file_data'),
             d.get('notes'), g.user.get('id')))
        return created(message="Document uploaded")
    except Exception as ex: return err(str(ex))

@bills_bp.route('/bills/<int:bid>/documents/<int:did>', methods=['DELETE'])
@require_auth
def bill_doc_detail(bid, did):
    db_execute("UPDATE bill_documents SET is_active=0 WHERE id=%s AND bill_id=%s", (did, bid))
    return ok(message="Deleted")
