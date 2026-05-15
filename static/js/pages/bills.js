/**
 * Bills & Expenses — Issue #20
 * Track vendor bills, employee expenses, project costs
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable } from '../ui.js';
import { navigate } from '../router.js';

const EXPENSE_TYPES = ['Travel','Accommodation','Meals','Office Supplies','Software/Subscriptions',
  'Equipment','Marketing','Training','Utilities','Professional Services',
  'Contractor Invoice','Vendor Bill','Miscellaneous'];
const PAYMENT_MODES = ['Bank Transfer','Cheque','Cash','UPI','Credit Card','Debit Card','Online'];
const STATUSES      = ['Draft','Submitted','Approved','Paid','Rejected'];

function v(val, fb='') { return val==null ? fb : String(val).replace(/"/g,'&quot;'); }
function fd(id) {
  const d = Object.fromEntries(new FormData(document.getElementById(id)));
  Object.keys(d).forEach(k => { if(d[k]==='') d[k]=null; });
  return d;
}

export async function renderList() {
  setPageTitle('Bills & Expenses', 'Track money spent');
  setBreadcrumb([{ label: 'Bills & Expenses' }]);
  showLoader();
  try {
    const [data, summary, masters] = await Promise.all([
      get('/bills'), get('/bills/summary'), get('/masters/all')
    ]);
    const rows = data.items || [];

    setContent(`
      <div class="page-body">
        <!-- KPIs -->
        <div class="kpi-grid kpi-4" style="margin-bottom:16px">
          ${kpi('Total Bills',     summary.total||0,                     '📋','blue')}
          ${kpi('Total Amount',    fmt.money(summary.amount||0),         '💰','purple')}
          ${kpi('Pending Approval',summary.pending||0,                   '⏳','amber')}
          ${kpi('Paid',           (summary.by_type||[]).filter(t=>t).length,'✅','green')}
        </div>

        <div class="list-toolbar">
          <div style="display:flex;gap:8px;align-items:center">
            <select class="fselect" id="type-filter" style="width:160px" onchange="window._filterBills()">
              <option value="">All Types</option>
              ${EXPENSE_TYPES.map(t=>`<option>${t}</option>`).join('')}
            </select>
            <select class="fselect" id="status-filter" style="width:120px" onchange="window._filterBills()">
              <option value="">All Status</option>
              ${STATUSES.map(s=>`<option>${s}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" onclick="window._addBill()">+ Add Bill / Expense</button>
        </div>

        <div class="card" id="bills-table">
          ${renderBillsTable(rows)}
        </div>

        <!-- Spend by Type -->
        ${(summary.by_type||[]).length ? `
          <div class="card" style="margin-top:16px">
            <div class="card-header"><h3 class="card-title">📊 Spend by Category</h3></div>
            <div class="card-body">
              <div class="report-chart">
                ${(summary.by_type||[]).slice(0,10).map(t => {
                  const max = Math.max(...(summary.by_type||[]).map(x=>parseFloat(x.amount)||0),1);
                  const pct = Math.round((parseFloat(t.amount)||0)/max*100);
                  return `<div class="report-row">
                    <div class="report-label">${t.expense_type}</div>
                    <div class="report-bar-wrap">
                      <div class="report-bar report-bar-blue" style="width:${pct}%"></div>
                    </div>
                    <div class="report-val">${fmt.money(t.amount)}</div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>` : ''}
      </div>`);

    window._addBill = () => billModal(null, masters);
    window._filterBills = async () => {
      const type   = document.getElementById('type-filter').value;
      const status = document.getElementById('status-filter').value;
      let url = '/bills?';
      if (type)   url += `expense_type=${encodeURIComponent(type)}&`;
      if (status) url += `status=${encodeURIComponent(status)}`;
      const res = await get(url);
      document.getElementById('bills-table').innerHTML = renderBillsTable(res.items||[]);
    };
  } catch(e) { showError(e.message); }
}

function renderBillsTable(rows) {
  if (!rows.length) return '<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">No bills or expenses found</div></div>';
  return `<div class="tbl-wrap"><table class="data-table">
    <thead><tr>
      <th>Type</th><th>Description</th><th>Vendor</th><th>Date</th>
      <th>Amount</th><th>Tax</th><th>Total</th><th>Status</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows.map(b=>`<tr class="tbl-clickable" onclick="navigateTo('/bills/${b.id}')">
      <td><span class="badge badge-purple">${b.expense_type}</span></td>
      <td>
        <div class="cell-name">${b.description||b.bill_number||'—'}</div>
        ${b.vendor_name ? `<div class="cell-sub">${b.vendor_name}</div>` : ''}
      </td>
      <td>${b.vendor_name||b.cost_centre_name||'—'}</td>
      <td class="mono">${fmt.date(b.expense_date)}</td>
      <td class="mono">${fmt.money(b.amount)}</td>
      <td class="mono">${fmt.money(b.tax_amount)}</td>
      <td class="mono fw-bold">${fmt.money(b.total_amount)}</td>
      <td>${badge(b.status||'Draft')}</td>
      <td class="tbl-actions">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window._editBillRow(${b.id})">✏</button>
      </td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

function kpi(l, v2, icon, color) {
  return `<div class="kpi-card kpi-${color}"><div class="kpi-icon">${icon}</div>
    <div class="kpi-body"><div class="kpi-value">${v2}</div><div class="kpi-label">${l}</div></div></div>`;
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [bill, masters] = await Promise.all([get(`/bills/${id}`), get('/masters/all')]);
    setPageTitle(bill.expense_type, bill.description||'Bill/Expense');
    setBreadcrumb([{ label: 'Bills & Expenses', url: '/bills' }, { label: bill.expense_type }]);
    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card">
            <div class="profile-hero" style="background:linear-gradient(135deg,#6d28d9,#4c1d95)">
              <div style="font-size:40px;margin-bottom:8px">💸</div>
              <div class="profile-name">${bill.expense_type}</div>
              <div class="profile-title" style="color:rgba(255,255,255,.75)">${bill.description||'—'}</div>
              <div style="margin-top:8px">${badge(bill.status||'Draft')}</div>
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>Amount</span><strong>${fmt.money(bill.amount)}</strong></div>
              <div class="meta-row"><span>Tax</span><strong>${fmt.money(bill.tax_amount)}</strong></div>
              <div class="meta-row"><span>Total</span><strong class="text-lg">${fmt.money(bill.total_amount)}</strong></div>
              <div class="meta-row"><span>Date</span><strong>${fmt.date(bill.expense_date)}</strong></div>
              <div class="meta-row"><span>Vendor</span><strong>${bill.vendor_name||'—'}</strong></div>
              <div class="meta-row"><span>Payment</span><strong>${bill.payment_mode||'—'}</strong></div>
              ${bill.bill_number ? `<div class="meta-row"><span>Bill #</span><strong class="mono">${bill.bill_number}</strong></div>` : ''}
              ${bill.po_number   ? `<div class="meta-row"><span>PO #</span><strong class="mono">${bill.po_number}</strong></div>` : ''}
            </div>
            <div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-primary btn-full" onclick="window._editBill()">✏ Edit</button>
              ${bill.status==='Draft' ? `<button class="btn btn-ghost btn-full" onclick="window._updateStatus('Submitted')">📤 Submit for Approval</button>` : ''}
              ${bill.status==='Submitted' ? `<button class="btn btn-primary btn-full" onclick="window._updateStatus('Approved')">✓ Approve</button>` : ''}
              ${bill.status==='Approved' ? `<button class="btn btn-ghost btn-full" onclick="window._markPaid()">✓ Mark Paid</button>` : ''}
            </div>
          </div>
        </div>
        <div class="detail-main">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Details</h3></div>
            <div class="card-body"><div class="field-grid">
              ${f('Expense Type',   bill.expense_type)}
              ${f('Vendor',         bill.vendor_name)}
              ${f('Client',         bill.client_name)}
              ${f('Cost Centre',    bill.cost_centre_name)}
              ${f('Currency',       bill.currency||'INR')}
              ${f('Expense Date',   fmt.date(bill.expense_date))}
              ${f('Due Date',       fmt.date(bill.due_date))}
              ${f('Payment Date',   fmt.date(bill.payment_date))}
              ${f('Payment Ref',    bill.payment_ref, true)}
              ${f('Submitted By',   bill.submitted_by_name)}
              ${f('Description',    bill.description)}
            </div></div>
          </div>
          ${bill.receipt_data ? `<div class="card" style="margin-top:12px">
            <div class="card-header"><h3 class="card-title">📎 Receipt</h3></div>
            <div class="card-body">
              <button class="btn btn-ghost" onclick="window._downloadReceipt()">⬇ Download ${bill.receipt_name||'Receipt'}</button>
            </div>
          </div>` : ''}
        </div>
      </div>`);

    window._editBill     = () => billModal(bill, masters);
    window._updateStatus = async (status) => {
      await put(`/bills/${id}`, { status });
      toast(`Bill ${status.toLowerCase()}`, 'success');
      renderDetail({ id });
    };
    window._markPaid = () => openModal({
      title: 'Mark as Paid',
      body: `<form id="pay-form" class="form-grid-sm">
        <div class="fg"><label class="flabel">Payment Date</label>
          <input class="finput" type="date" name="payment_date" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="fg"><label class="flabel">Payment Reference</label>
          <input class="finput" name="payment_ref" placeholder="UTR / Transaction ID"></div>
        <div class="fg"><label class="flabel">Payment Mode</label>
          <select class="fselect" name="payment_mode">
            ${PAYMENT_MODES.map(m=>`<option>${m}</option>`).join('')}
          </select></div>
      </form>`,
      submitLabel: 'Confirm Payment',
      onSubmit: async () => {
        const data = fd('pay-form');
        data.status = 'Paid';
        await put(`/bills/${id}`, data);
        toast('Bill marked as paid', 'success');
        renderDetail({ id });
      }
    });
    window._downloadReceipt = () => {
      const link = document.createElement('a');
      link.href  = `data:${bill.receipt_mime||'application/octet-stream'};base64,${bill.receipt_data}`;
      link.download = bill.receipt_name || 'receipt';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };
  } catch(e) { showError(e.message); }
}

function f(l, val, mono=false) {
  return `<div class="field-item"><div class="field-label">${l}</div>
    <div class="field-value${!val?' empty':''}${mono?' mono':''}">${val||'—'}</div></div>`;
}

function billModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Bill/Expense' : '+ New Bill / Expense',
    size: 'lg',
    body: `<form id="bill-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="fg"><label class="flabel">Expense Type *</label>
        <select class="fselect" name="expense_type" required>
          ${EXPENSE_TYPES.map(t=>`<option ${existing?.expense_type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Status</label>
        <select class="fselect" name="status">
          ${STATUSES.map(s=>`<option ${(existing?.status||'Draft')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Amount (₹) *</label>
        <input class="finput" type="number" name="amount" value="${v(existing?.amount,0)}" step="0.01" required></div>
      <div class="fg"><label class="flabel">Tax Amount (₹)</label>
        <input class="finput" type="number" name="tax_amount" value="${v(existing?.tax_amount,0)}" step="0.01"></div>
      <div class="fg"><label class="flabel">Expense Date *</label>
        <input class="finput" type="date" name="expense_date" value="${v(existing?.expense_date||new Date().toISOString().split('T')[0])}" required></div>
      <div class="fg"><label class="flabel">Due Date</label>
        <input class="finput" type="date" name="due_date" value="${v(existing?.due_date||'').split('T')[0]}"></div>
      <div class="fg"><label class="flabel">Vendor</label>
        <select class="fselect" name="vendor_id">
          <option value="">None</option>
          ${/* vendors from lookup */''}
        </select></div>
      <div class="fg"><label class="flabel">Cost Centre</label>
        <select class="fselect" name="cost_centre_id">
          <option value="">None</option>
          ${(masters['cost-centres']||[]).map(c=>`<option value="${c.id}" ${existing?.cost_centre_id==c.id?'selected':''}>${c.name} (${c.code})</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Currency</label>
        <select class="fselect" name="currency">
          ${['INR','USD','EUR','GBP'].map(c=>`<option ${(existing?.currency||'INR')===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Payment Mode</label>
        <select class="fselect" name="payment_mode">
          ${PAYMENT_MODES.map(m=>`<option ${(existing?.payment_mode||'Bank Transfer')===m?'selected':''}>${m}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Bill Number</label>
        <input class="finput mono" name="bill_number" value="${v(existing?.bill_number)}"></div>
      <div class="fg"><label class="flabel">PO Number</label>
        <input class="finput mono" name="po_number" value="${v(existing?.po_number)}"></div>
      <div class="fg full"><label class="flabel">Description</label>
        <input class="finput" name="description" value="${v(existing?.description)}"></div>
      <div class="fg full"><label class="flabel">Receipt / Invoice File</label>
        <input type="file" class="finput" id="receipt-file" accept=".pdf,.png,.jpg,.jpeg">
        <div class="field-hint">PDF or image. Max 5MB.</div>
      </div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Create',
    onSubmit: async () => {
      const data = fd('bill-form');
      const fileInput = document.getElementById('receipt-file');
      if (fileInput?.files?.[0]) {
        const file = fileInput.files[0];
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        data.receipt_data = base64;
        data.receipt_name = file.name;
        data.receipt_mime = file.type;
      }
      if (isEdit) { await put(`/bills/${existing.id}`, data); toast('Updated','success'); renderDetail({id:existing.id}); }
      else { const r = await post('/bills', data); toast('Created','success'); navigate(`/bills/${r.id}`); }
    }
  });
}

window._editBillRow = async (id) => {
  const [bill, masters] = await Promise.all([get(`/bills/${id}`), get('/masters/all')]);
  billModal(bill, masters);
};
