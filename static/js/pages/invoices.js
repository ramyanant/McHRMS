import { get, post, put }  from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable, renderPagination } from '../ui.js';
import { navigate }        from '../router.js';

export async function renderList() {
  setPageTitle('Invoices', 'Billing & receivables');
  setBreadcrumb([{ label: 'Invoices' }]);
  showLoader();
  try {
    const [data, summary] = await Promise.all([
      get('/invoices'), get('/invoices/summary')
    ]);
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="kpi-grid kpi-3">
          ${kpi('Total Invoiced', fmt.money(summary.total_invoiced), '🧾', 'blue')}
          ${kpi('Collected',      fmt.money(summary.total_paid),     '✅', 'green')}
          ${kpi('Overdue',        fmt.money(summary.total_overdue),  '⚠️', 'red')}
        </div>
        <div class="list-toolbar">
          <div class="status-filters">
            ${['All','Draft','Sent','Paid','Overdue'].map(s =>
              `<button class="filter-btn ${s==='All'?'active':''}" onclick="window._filterInv('${s}')">${s}</button>`
            ).join('')}
          </div>
          <button class="btn btn-primary" onclick="navigateTo('/invoices/new')">+ New Invoice</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Invoice #', key: 'invoice_number', render: r => `<strong class="mono">${r.invoice_number}</strong>` },
            { label: 'Client',    key: 'client_name' },
            { label: 'Date',      key: 'invoice_date', render: r => fmt.date(r.invoice_date) },
            { label: 'Due Date',  key: 'due_date',     render: r => {
              const overdue = r.due_date && new Date(r.due_date) < new Date() && r.status_name !== 'Paid';
              return `<span class="${overdue?'text-red':''}">${fmt.date(r.due_date)}</span>`;
            }},
            { label: 'Amount',    key: 'total_amount', render: r => `<strong>${fmt.money(r.total_amount)}</strong>` },
            { label: 'Balance',   key: 'balance_due',  render: r => fmt.money(r.balance_due) },
            { label: 'Status',    key: 'status_name',  render: r => badge(r.status_name||'Draft') },
          ],
          rows,
          onRowClick: r => navigate(`/invoices/${r.id}`),
          emptyMessage: 'No invoices found',
        })}
      </div>`);
    window._filterInv = async (status) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.textContent===status));
      const url = status==='All' ? '/invoices' : `/invoices?status=${encodeURIComponent(status)}`;
      const res = await get(url);
      // re-render table area only
    };
  } catch (e) { showError(e.message); }
}

function kpi(label, value, icon, color) {
  return `<div class="kpi-card kpi-${color}"><div class="kpi-icon">${icon}</div>
    <div class="kpi-body"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div></div>`;
}

export async function renderNew() {
  setPageTitle('New Invoice', 'Create invoice');
  setBreadcrumb([{ label: 'Invoices', url: '/invoices' }, { label: 'New' }]);
  const masters = await get('/masters/all');
  setContent(`
    <div class="page-body"><div class="card form-card">
      <div class="card-header"><h3 class="card-title">New Invoice</h3></div>
      <form id="inv-form" class="form-grid">
        <div class="fg"><label class="flabel">Client *</label>
          <select class="fselect" name="client_id" required>
            <option value="">Select client…</option>
            ${(masters['clients-lookup']||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Invoice Date *</label>
          <input class="finput" type="date" name="invoice_date" value="${new Date().toISOString().split('T')[0]}" required></div>
        <div class="fg"><label class="flabel">Due Date</label>
          <input class="finput" type="date" name="due_date"></div>
        <div class="fg"><label class="flabel">Billing Period From</label>
          <input class="finput" type="date" name="billing_period_from"></div>
        <div class="fg"><label class="flabel">Billing Period To</label>
          <input class="finput" type="date" name="billing_period_to"></div>
        <div class="fg"><label class="flabel">Payment Terms</label>
          <select class="fselect" name="payment_terms_id">
            <option value="">Select…</option>
            ${(masters['payment-terms']||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          </select></div>
        <!-- GST -->
        <div class="form-section-title">GST</div>
        <div class="fg"><label class="flabel">CGST %</label><input class="finput" type="number" name="cgst_pct" value="0" step="0.01" onchange="window._calcTotals()"></div>
        <div class="fg"><label class="flabel">SGST %</label><input class="finput" type="number" name="sgst_pct" value="0" step="0.01" onchange="window._calcTotals()"></div>
        <div class="fg"><label class="flabel">IGST %</label><input class="finput" type="number" name="igst_pct" value="0" step="0.01" onchange="window._calcTotals()"></div>
        <div class="fg"><label class="flabel">Notes</label>
          <textarea class="finput" name="notes" rows="2"></textarea></div>
      </form>
      <!-- Line Items -->
      <div class="form-section-title" style="padding:0 24px">Line Items</div>
      <div id="line-items" style="padding:0 24px 16px"></div>
      <div style="padding:0 24px 16px">
        <button class="btn btn-ghost btn-sm" onclick="window._addLine()">+ Add Line Item</button>
      </div>
      <!-- Totals -->
      <div id="inv-totals" class="inv-totals"></div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="navigateTo('/invoices')">Cancel</button>
        <button class="btn btn-primary" onclick="window._saveInvoice()">Create Invoice</button>
      </div>
    </div></div>`);

  let lines = [];
  window._addLine = () => {
    lines.push({ description: '', quantity: 1, unit: 'Hours', rate: 0 });
    renderLines();
  };
  window._removeLine = (i) => { lines.splice(i, 1); renderLines(); };
  window._calcTotals = () => {
    const cgst = parseFloat(document.querySelector('[name=cgst_pct]')?.value || 0);
    const sgst = parseFloat(document.querySelector('[name=sgst_pct]')?.value || 0);
    const igst = parseFloat(document.querySelector('[name=igst_pct]')?.value || 0);
    const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity||1) * parseFloat(l.rate||0)), 0);
    const taxable  = subtotal;
    const total    = taxable + taxable*cgst/100 + taxable*sgst/100 + taxable*igst/100;
    document.getElementById('inv-totals').innerHTML = `
      <div class="totals-box">
        <div class="total-row"><span>Subtotal</span><strong>${fmt.money(subtotal)}</strong></div>
        ${cgst?`<div class="total-row"><span>CGST (${cgst}%)</span><strong>${fmt.money(subtotal*cgst/100)}</strong></div>`:''}
        ${sgst?`<div class="total-row"><span>SGST (${sgst}%)</span><strong>${fmt.money(subtotal*sgst/100)}</strong></div>`:''}
        ${igst?`<div class="total-row"><span>IGST (${igst}%)</span><strong>${fmt.money(subtotal*igst/100)}</strong></div>`:''}
        <div class="total-row total-final"><span>Total</span><strong>${fmt.money(total)}</strong></div>
      </div>`;
  };

  function renderLines() {
    document.getElementById('line-items').innerHTML = lines.map((l, i) => `
      <div class="line-item-row">
        <input class="finput li-desc" placeholder="Description" value="${l.description||''}"
          oninput="window._linesData[${i}].description=this.value">
        <input class="finput li-num" type="number" placeholder="Qty" value="${l.quantity||1}" style="width:70px"
          oninput="window._linesData[${i}].quantity=this.value;window._calcTotals()">
        <select class="fselect" style="width:90px" onchange="window._linesData[${i}].unit=this.value">
          ${['Hours','Days','Units','Fixed'].map(u=>`<option ${l.unit===u?'selected':''}>${u}</option>`).join('')}
        </select>
        <input class="finput li-num" type="number" placeholder="Rate ₹" value="${l.rate||0}" style="width:100px"
          oninput="window._linesData[${i}].rate=this.value;window._calcTotals()">
        <span class="li-amount">${fmt.money((l.quantity||1)*(l.rate||0))}</span>
        <button class="btn-icon" onclick="window._removeLine(${i})">✕</button>
      </div>`).join('');
    window._calcTotals();
  }
  window._linesData = lines;

  window._saveInvoice = async () => {
    const data = Object.fromEntries(new FormData(document.getElementById('inv-form')));
    Object.keys(data).forEach(k => { if (data[k]==='') data[k]=null; });
    const subtotal = lines.reduce((s,l)=>s+(parseFloat(l.quantity||1)*parseFloat(l.rate||0)),0);
    data.subtotal   = subtotal;
    data.line_items = lines;
    try {
      const res = await post('/invoices', data);
      toast('Invoice created', 'success');
      navigate(`/invoices/${res.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };
  window._addLine(); // Start with one line
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const inv = await get(`/invoices/${id}`);
    setPageTitle(inv.invoice_number, inv.client_name);
    setBreadcrumb([{ label: 'Invoices', url: '/invoices' }, { label: inv.invoice_number }]);
    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card">
            <div class="card-body">
              <div class="meta-row"><span>Status</span>${badge(inv.status_name||'Draft')}</div>
              <div class="meta-row"><span>Client</span><strong>${inv.client_name}</strong></div>
              <div class="meta-row"><span>Invoice Date</span><strong>${fmt.date(inv.invoice_date)}</strong></div>
              <div class="meta-row"><span>Due Date</span><strong class="${new Date(inv.due_date)<new Date()&&inv.status_name!=='Paid'?'text-red':''}">${fmt.date(inv.due_date)}</strong></div>
              <div class="meta-row"><span>Total</span><strong class="text-lg">${fmt.money(inv.total_amount)}</strong></div>
              <div class="meta-row"><span>Balance</span><strong>${fmt.money(inv.balance_due)}</strong></div>
            </div>
          </div>
          <div class="card" style="margin-top:12px">
            <div class="card-body">
              ${inv.status_name === 'Draft' ? `<button class="btn btn-primary btn-full" onclick="window._updateStatus('Sent')">📤 Mark Sent</button>` : ''}
              ${inv.status_name === 'Sent' || inv.status_name === 'Overdue' ? `<button class="btn btn-primary btn-full" onclick="window._markPaid()">✓ Mark Paid</button>` : ''}
            </div>
          </div>
        </div>
        <div class="detail-main">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Line Items</h3></div>
            <div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>${(inv.line_items||[]).map(li=>`<tr>
                <td>${li.description}</td>
                <td class="mono">${li.quantity}</td>
                <td>${li.unit||'Hours'}</td>
                <td class="mono">${fmt.money(li.rate)}</td>
                <td class="mono fw-bold">${fmt.money(li.amount)}</td>
              </tr>`).join('')}</tbody>
            </table></div>
            <div class="totals-box">
              <div class="total-row"><span>Subtotal</span><strong>${fmt.money(inv.subtotal)}</strong></div>
              ${inv.cgst_amount ? `<div class="total-row"><span>CGST (${inv.cgst_pct}%)</span><strong>${fmt.money(inv.cgst_amount)}</strong></div>` : ''}
              ${inv.sgst_amount ? `<div class="total-row"><span>SGST (${inv.sgst_pct}%)</span><strong>${fmt.money(inv.sgst_amount)}</strong></div>` : ''}
              ${inv.igst_amount ? `<div class="total-row"><span>IGST (${inv.igst_pct}%)</span><strong>${fmt.money(inv.igst_amount)}</strong></div>` : ''}
              <div class="total-row total-final"><span>Total</span><strong>${fmt.money(inv.total_amount)}</strong></div>
            </div>
          </div>
          ${inv.notes ? `<div class="card" style="margin-top:12px"><div class="card-body"><strong>Notes:</strong><p>${inv.notes}</p></div></div>` : ''}
        </div>
      </div>`);

    window._updateStatus = async (status) => {
      await put(`/invoices/${id}`, { status_name: status });
      toast(`Invoice marked as ${status}`, 'success');
      renderDetail({ id });
    };
    window._markPaid = () => {
      openModal({
        title: 'Mark as Paid',
        body: `<form id="pay-form" class="form-grid-sm">
          <div class="fg"><label class="flabel">Payment Date *</label><input class="finput" type="date" name="payment_date" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="fg"><label class="flabel">Reference / UTR</label><input class="finput" name="payment_reference" placeholder="Transaction ID…"></div>
        </form>`,
        submitLabel: 'Confirm Payment',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('pay-form')));
          data.status_name = 'Paid';
          await put(`/invoices/${id}`, data);
          toast('Invoice marked as paid ✓', 'success');
          renderDetail({ id });
        }
      });
    };
  } catch (e) { showError(e.message); }
}
