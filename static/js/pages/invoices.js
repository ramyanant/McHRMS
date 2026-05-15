import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData, debounce } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

let _page=1, _search='', _status='';
export async function renderInvoices() {
  const [data, summary] = await Promise.all([
    API.invoices({ page:_page, per_page:25, status:_status }),
    API.invoiceSummary(),
  ]);
  if (!data) return;

  setContent(`
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card" style="border-top-color:var(--blue)">
        <div class="kpi-label">Total Invoiced</div>
        <div class="kpi-value" style="font-size:22px">${fmt.inr(summary?.total_invoiced)}</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--green)">
        <div class="kpi-label">Collected</div>
        <div class="kpi-value" style="font-size:22px;color:var(--green)">${fmt.inr(summary?.total_paid)}</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--red)">
        <div class="kpi-label">Outstanding</div>
        <div class="kpi-value" style="font-size:22px;color:var(--red)">${fmt.inr(summary?.total_overdue)}</div>
      </div>
    </div>
    <div class="toolbar">
      <div class="toolbar-title">Invoices <span style="font-size:14px;font-weight:400;color:var(--txt2)">(${data.total})</span></div>
      <button class="btn btn-primary" onclick="window._newInvoice()">+ Create Invoice</button>
    </div>
    <div class="filter-bar">
      <select class="select" style="width:160px" onchange="window._invStatus(this.value)">
        <option value="">All Status</option>
        ${['Draft','Sent','Partially Paid','Paid','Overdue','Cancelled'].map(s=>`<option ${_status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Invoice #</th><th>Client</th><th>Date</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>
          ${(data.items||[]).map(i=>`<tr style="cursor:pointer" onclick="window.go('/invoices/${i.id}')">
            <td class="td-mono">${i.invoice_number}</td>
            <td>${i.client_name}</td>
            <td>${fmt.date(i.invoice_date)}</td>
            <td style="${i.balance_due>0&&new Date(i.due_date)<new Date()?'color:var(--red)':''}">${fmt.date(i.due_date)}</td>
            <td class="td-mono">${fmt.inr(i.total_amount)}</td>
            <td class="td-mono" style="color:var(--green)">${fmt.inr(i.amount_paid)}</td>
            <td class="td-mono" style="${i.balance_due>0?'color:var(--red)':'color:var(--green)';font-weight:700}">${fmt.inr(i.balance_due)}</td>
            <td>${pillStatus(i.status_name)}</td>
          </tr>`).join('')}
          ${!data.items?.length?'<tr><td colspan="8"><div class="empty-state"><div class="empty-state-title">No invoices</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
  window._invStatus = v=>{_status=v;_page=1;renderInvoices();};
  window._newInvoice = () => {
    showModal({ title:'New Invoice', size:'modal-lg',
      body:`<form id="if"><div class="form-grid">
        <div class="field"><label class="label">Client *</label>
          <select class="select" name="client_id">${buildOptions(getMaster('clients-lookup'),'id','name','','Select Client')}</select></div>
        <div class="field"><label class="label">Invoice Date *</label>
          <input class="input" type="date" name="invoice_date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="field"><label class="label">Due Date</label>
          <input class="input" type="date" name="due_date"></div>
        <div class="field"><label class="label">Billing Period From</label>
          <input class="input" type="date" name="billing_period_from"></div>
        <div class="field"><label class="label">Billing Period To</label>
          <input class="input" type="date" name="billing_period_to"></div>
        <div class="field"><label class="label">Subtotal (₹)</label>
          <input class="input" type="number" name="subtotal" step="0.01" onchange="window._calcGST()"></div>
        <div class="field"><label class="label">CGST %</label>
          <input class="input" type="number" name="cgst_pct" step="0.01" value="9" onchange="window._calcGST()"></div>
        <div class="field"><label class="label">SGST %</label>
          <input class="input" type="number" name="sgst_pct" step="0.01" value="9" onchange="window._calcGST()"></div>
        <div class="field"><label class="label">IGST %</label>
          <input class="input" type="number" name="igst_pct" step="0.01" value="0" onchange="window._calcGST()"></div>
        <div class="field"><label class="label">Total (auto-calculated)</label>
          <input class="input td-mono" id="calc-total" readonly style="background:var(--s2)"></div>
        <div class="field form-full"><label class="label">Notes</label>
          <textarea class="textarea" name="notes"></textarea></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveInvoice()">Create Invoice</button>`,
    });
    window._calcGST = () => {
      const f = document.getElementById('if');
      const sub = parseFloat(f.elements.subtotal?.value||0);
      const cgst = parseFloat(f.elements.cgst_pct?.value||0);
      const sgst = parseFloat(f.elements.sgst_pct?.value||0);
      const igst = parseFloat(f.elements.igst_pct?.value||0);
      const total = sub + sub*cgst/100 + sub*sgst/100 + sub*igst/100;
      const el = document.getElementById('calc-total');
      if (el) el.value = '₹' + total.toFixed(2);
    };
    window._saveInvoice = async () => {
      try { const r=await API.invoiceCreate(getFormData(document.getElementById('if')));
        toast('Invoice created','success'); closeModal(); window.go(`/invoices/${r.id}`);
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderInvoiceDetail(id) {
  const inv = await API.invoice(id);
  if (!inv) return;
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">${inv.invoice_number}</div>
      <div style="display:flex;gap:8px">
        ${pillStatus(inv.status_name)}
        ${inv.status_name!=='Paid'?`<button class="btn btn-primary btn-sm" onclick="window._markPaid(${id})">Mark as Paid</button>`:''}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
      <div>
        <div class="card" style="margin-bottom:16px;padding:20px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><div class="org-field-label">Client</div><div class="org-field-value">${inv.client_name}</div></div>
            <div><div class="org-field-label">Invoice Date</div><div class="org-field-value">${fmt.date(inv.invoice_date)}</div></div>
            <div><div class="org-field-label">Due Date</div><div class="org-field-value">${fmt.date(inv.due_date)}</div></div>
            <div><div class="org-field-label">Billing Period</div><div class="org-field-value">${fmt.date(inv.billing_period_from)} – ${fmt.date(inv.billing_period_to)}</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Line Items</div></div>
          <div class="table-container"><table>
            <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>
              ${(inv.line_items||[]).map(li=>`<tr>
                <td>${li.description}${li.resource_name?`<br><small style="color:var(--txt3)">${li.resource_name}</small>`:''}</td>
                <td class="td-mono">${li.quantity}</td>
                <td>${li.unit||'Hours'}</td>
                <td class="td-mono">${fmt.inr(li.rate)}</td>
                <td class="td-mono" style="font-weight:600">${fmt.inr(li.amount)}</td>
              </tr>`).join('')}
              ${!inv.line_items?.length?'<tr><td colspan="5" style="color:var(--txt3);text-align:center">No line items</td></tr>':''}
            </tbody>
          </table></div>
        </div>
      </div>
      <div class="card" style="padding:20px;align-self:start">
        <div style="display:flex;flex-direction:column;gap:10px">
          ${[
            ['Subtotal', inv.subtotal],
            ['CGST '+inv.cgst_pct+'%', inv.cgst_amount],
            ['SGST '+inv.sgst_pct+'%', inv.sgst_amount],
            ['IGST '+inv.igst_pct+'%', inv.igst_amount],
          ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;font-size:13px">
            <span style="color:var(--txt2)">${l}</span>
            <span class="td-mono">${fmt.inr(v)}</span>
          </div>`).join('')}
          <div style="border-top:2px solid var(--bdr);padding-top:10px;display:flex;justify-content:space-between;font-size:16px;font-weight:700">
            <span>Total</span><span class="td-mono">${fmt.inr(inv.total_amount)}</span>
          </div>
          ${inv.amount_paid>0?`<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--green)">
            <span>Paid</span><span class="td-mono">${fmt.inr(inv.amount_paid)}</span>
          </div>`:''}
          ${inv.balance_due>0?`<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:var(--red)">
            <span>Balance Due</span><span class="td-mono">${fmt.inr(inv.balance_due)}</span>
          </div>`:''}
        </div>
      </div>
    </div>
  `);
  window._markPaid = async (iid) => {
    const ref = prompt('Payment reference (e.g. UTR/Cheque number):');
    if (ref===null) return;
    try { await API.invoiceUpdate(iid,{status_name:'Paid',payment_reference:ref,payment_date:new Date().toISOString().slice(0,10)});
      toast('Marked as paid','success'); renderInvoiceDetail(iid);
    } catch(e) { toast(e.message,'error'); }
  };
}
