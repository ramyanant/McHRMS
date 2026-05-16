/**
 * Invoices — Full module with filter, PO Number, Cost Centre
 * Zero backticks, zero optional chaining
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fd(id) {
  var d = Object.fromEntries(new FormData(document.getElementById(id)));
  Object.keys(d).forEach(function(k) { if (d[k] === '') d[k] = null; });
  return d;
}
function opts(arr, sel, vk, lk) {
  return arr.map(function(i) {
    var val = typeof i === 'string' ? i : i[vk || 'id'];
    var lbl = typeof i === 'string' ? i : i[lk || 'name'];
    return '<option value="' + v(val) + '"' + (String(val) === String(sel) ? ' selected' : '') + '>' + v(lbl) + '</option>';
  }).join('');
}
function fld(l, val, mono) {
  return '<div class="field-item"><div class="field-label">' + l + '</div>' +
    '<div class="field-value' + (val ? '' : ' empty') + (mono ? ' mono' : '') + '">' + v(val, '—') + '</div></div>';
}

var STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];
var CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export async function renderList() {
  setPageTitle('Invoices', 'Client invoices & billing');
  setBreadcrumb([{ label: 'Invoices' }]);
  showLoader();
  try {
    var data = await get('/invoices');
    var rows = data.items || [];
    var q = '', filterStatus = '', filterClient = '';
    var clientNames = [...new Set(rows.map(function(r) { return r.client_name; }).filter(Boolean))];

    function getF() {
      var d = rows.slice();
      if (q) d = d.filter(function(r) {
        return (r.invoice_number + ' ' + (r.client_name || '')).toLowerCase().includes(q.toLowerCase());
      });
      if (filterStatus) d = d.filter(function(r) { return (r.status_name || r.status) === filterStatus; });
      if (filterClient) d = d.filter(function(r) { return r.client_name === filterClient; });
      return d;
    }

    function kpi(l, val, icon, c) {
      return '<div class="kpi-card kpi-' + c + '"><div class="kpi-icon">' + icon + '</div>' +
        '<div class="kpi-body"><div class="kpi-value">' + val + '</div><div class="kpi-label">' + l + '</div></div></div>';
    }

    var totalAmt  = rows.reduce(function(s, r) { return s + parseFloat(r.total_amount || 0); }, 0);
    var paidAmt   = rows.filter(function(r) { return r.status_name === 'Paid' || r.status === 'Paid'; })
                       .reduce(function(s, r) { return s + parseFloat(r.total_amount || 0); }, 0);
    var overdueN  = rows.filter(function(r) { return r.status_name === 'Overdue' || r.status === 'Overdue'; }).length;

    function render() {
      var d = getF();
      var tableHTML = '';
      if (!d.length) {
        tableHTML = '<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No invoices found</div>' +
          '<button class="btn btn-primary" onclick="navigateTo(\'/invoices/new\')">+ Create Invoice</button></div>';
      } else {
        var rows_html = d.map(function(inv) {
          return '<tr class="tbl-clickable" onclick="navigateTo(\'/invoices/' + inv.id + '\')">' +
            '<td class="mono fw-bold">' + v(inv.invoice_number) + '</td>' +
            '<td>' + v(inv.client_name, '—') + '</td>' +
            '<td class="text-muted">' + fmt.date(inv.created_at) + '</td>' +
            '<td class="text-muted">' + v(inv.po_number || '—') + '</td>' +
            '<td class="mono">' + fmt.money(inv.amount) + '</td>' +
            '<td class="mono">' + fmt.money(inv.tax_amount) + '</td>' +
            '<td class="mono fw-bold">' + fmt.money(inv.total_amount) + '</td>' +
            '<td>' + badge(inv.status_name || inv.status || 'Draft') + '</td>' +
            '<td class="tbl-actions" onclick="event.stopPropagation()">' +
              '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/invoices/' + inv.id + '\')">View</button>' +
              '<button class="btn btn-danger btn-xs" onclick="window._deleteInv(' + inv.id + ')">Delete</button>' +
            '</td></tr>';
        }).join('');
        tableHTML = '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
          '<th>Invoice #</th><th>Client</th><th>Date</th><th>PO #</th>' +
          '<th>Amount</th><th>Tax</th><th>Total</th><th>Status</th><th>Actions</th>' +
          '</tr></thead><tbody>' + rows_html + '</tbody></table></div></div>';
      }
      document.getElementById('inv-content').innerHTML = tableHTML;
    }

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Total Invoices', rows.length, '🧾', 'blue') +
        kpi('Total Billed', fmt.money(totalAmt), '💰', 'purple') +
        kpi('Collected', fmt.money(paidAmt), '✅', 'green') +
        kpi('Overdue', overdueN, '⚠️', 'amber') +
      '</div>' +
      '<div class="struct-toolbar">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input class="search-input" placeholder="Search invoices…" oninput="window._invQ(this.value)" style="width:220px">' +
          '<select class="fselect" style="width:130px" onchange="window._invStatus(this.value)">' +
            '<option value="">All Status</option>' + STATUSES.map(function(s) { return '<option>' + s + '</option>'; }).join('') +
          '</select>' +
          '<select class="fselect" style="width:160px" onchange="window._invClient(this.value)">' +
            '<option value="">All Clients</option>' + clientNames.map(function(c) { return '<option>' + v(c) + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="navigateTo(\'/invoices/new\')">+ New Invoice</button>' +
      '</div>' +
      '<div id="inv-content"></div></div>'
    );

    render();
    window._invQ      = function(val) { q = val; render(); };
    window._invStatus = function(val) { filterStatus = val; render(); };
    window._invClient = function(val) { filterClient = val; render(); };
    window._deleteInv = async function(id) {
      if (!confirm('Delete this invoice?')) return;
      await put('/invoices/' + id, { status_id: 99 }).catch(function() {});
      toast('Invoice deleted', 'info');
      renderList();
    };
  } catch(e) { showError(e.message); }
}

export async function renderNew() {
  showLoader();
  try {
    var masters = await get('/masters/all');
    setPageTitle('New Invoice', '');
    setBreadcrumb([{ label: 'Invoices', url: '/invoices' }, { label: 'New' }]);
    renderInvoiceForm(null, masters);
  } catch(e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    var inv = await get('/invoices/' + id);
    var masters = await get('/masters/all');
    setPageTitle(inv.invoice_number || 'Invoice', inv.client_name || '');
    setBreadcrumb([{ label: 'Invoices', url: '/invoices' }, { label: inv.invoice_number || 'Invoice' }]);

    setContent(
      '<div class="detail-layout">' +
      '<div class="detail-sidebar"><div class="card">' +
        '<div class="profile-hero" style="background:linear-gradient(135deg,#059669,#047857)">' +
          '<div style="font-size:40px;margin-bottom:8px">🧾</div>' +
          '<div class="profile-name">' + v(inv.invoice_number) + '</div>' +
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">' + v(inv.client_name || '') + '</div>' +
          '<div style="margin-top:8px">' + badge(inv.status_name || inv.status || 'Draft') + '</div>' +
        '</div>' +
        '<div class="profile-meta">' +
          '<div class="meta-row"><span>Amount</span><strong>' + fmt.money(inv.amount) + '</strong></div>' +
          '<div class="meta-row"><span>Tax</span><strong>' + fmt.money(inv.tax_amount) + '</strong></div>' +
          '<div class="meta-row"><span>Total</span><strong class="text-lg">' + fmt.money(inv.total_amount) + '</strong></div>' +
          '<div class="meta-row"><span>PO Number</span><strong class="mono">' + v(inv.po_number, '—') + '</strong></div>' +
          '<div class="meta-row"><span>Cost Centre</span><strong>' + v(inv.cost_centre_name, '—') + '</strong></div>' +
        '</div>' +
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">' +
          '<button class="btn btn-primary btn-full" onclick="window._editInv()">✏ Edit</button>' +
          '<button class="btn btn-ghost btn-full" onclick="window._markPaid()">✓ Mark Paid</button>' +
        '</div>' +
      '</div></div>' +
      '<div class="detail-main"><div class="card"><div class="card-header"><h3 class="card-title">Invoice Details</h3></div>' +
      '<div class="card-body"><div class="field-grid">' +
        fld('Client', inv.client_name) +
        fld('Period', fmt.date(inv.period_start) + ' – ' + fmt.date(inv.period_end)) +
        fld('PO Number', inv.po_number, true) +
        fld('Cost Centre', inv.cost_centre_name) +
        fld('Currency', inv.currency || 'INR') +
        fld('Notes', inv.notes) +
      '</div></div></div></div></div>'
    );

    window._editInv  = function() { renderInvoiceForm(inv, masters); };
    window._markPaid = async function() {
      var paidStatus = (masters['invoice-statuses'] || []).find(function(s) { return s.name === 'Paid'; });
      if (paidStatus) {
        await put('/invoices/' + id, { status_id: paidStatus.id });
        toast('Invoice marked as paid', 'success');
        renderDetail({ id: id });
      }
    };
  } catch(e) { showError(e.message); }
}

function renderInvoiceForm(existing, masters) {
  var isEdit = !!existing;
  if (isEdit) {
    setPageTitle('Edit Invoice', '');
    setBreadcrumb([{ label: 'Invoices', url: '/invoices' }, { label: existing.invoice_number || 'Edit' }]);
  }
  setContent(
    '<div class="page-body"><div class="card" style="max-width:900px;margin:0 auto">' +
    '<div class="card-header"><h3 class="card-title">' + (isEdit ? 'Edit Invoice: ' + v(existing.invoice_number) : 'New Invoice') + '</h3></div>' +
    '<form id="inv-form"><div class="form-grid">' +
      '<div class="fg"><label class="flabel">Client *</label>' +
        '<select class="fselect" name="client_id" required><option value="">Select client…</option>' +
        opts(masters['clients-lookup'] || [], existing && existing.client_id) + '</select></div>' +
      '<div class="fg"><label class="flabel">Invoice Status</label>' +
        '<select class="fselect" name="status_id">' +
        opts(masters['invoice-statuses'] || [], existing && existing.status_id) + '</select></div>' +
      '<div class="fg"><label class="flabel">Currency</label>' +
        '<select class="fselect" name="currency">' +
        opts(CURRENCIES, (existing && existing.currency) || 'INR') + '</select></div>' +
      '<div class="fg"><label class="flabel">Bill Rate (₹/hr)</label>' +
        '<input class="finput" type="number" name="bill_rate" value="' + v(existing && existing.bill_rate, 0) + '" step="0.01"></div>' +
      '<div class="fg"><label class="flabel">Hours</label>' +
        '<input class="finput" type="number" name="hours" value="' + v(existing && existing.hours, 0) + '" step="0.5"></div>' +
      '<div class="fg"><label class="flabel">Amount (₹)</label>' +
        '<input class="finput" type="number" name="amount" value="' + v(existing && existing.amount, 0) + '" step="0.01"></div>' +
      '<div class="fg"><label class="flabel">Tax Amount (₹)</label>' +
        '<input class="finput" type="number" name="tax_amount" value="' + v(existing && existing.tax_amount, 0) + '" step="0.01"></div>' +
      '<div class="fg"><label class="flabel">Period Start</label>' +
        '<input class="finput" type="date" name="period_start" value="' + v(existing && existing.period_start ? String(existing.period_start).split('T')[0] : '') + '"></div>' +
      '<div class="fg"><label class="flabel">Period End</label>' +
        '<input class="finput" type="date" name="period_end" value="' + v(existing && existing.period_end ? String(existing.period_end).split('T')[0] : '') + '"></div>' +
      '<div class="fg"><label class="flabel">PO Number</label>' +
        '<input class="finput" name="po_number" value="' + v(existing && existing.po_number) + '" placeholder="Purchase Order reference"></div>' +
      '<div class="fg"><label class="flabel">Cost Centre</label>' +
        '<select class="fselect" name="cost_centre_id"><option value="">Select cost centre…</option>' +
        opts(masters['cost-centres'] || [], existing && existing.cost_centre_id) + '</select></div>' +
      '<div class="fg full"><label class="flabel">Notes</label>' +
        '<textarea class="finput" name="notes" rows="3">' + v(existing && existing.notes) + '</textarea></div>' +
    '</div></form>' +
    '<div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="navigateTo(\'' + (isEdit ? '/invoices/' + existing.id : '/invoices') + '\')">Cancel</button>' +
      '<button type="button" class="btn btn-primary" onclick="window._saveInv()">' + (isEdit ? 'Save Changes' : 'Create Invoice') + '</button>' +
    '</div></div></div>'
  );

  window._saveInv = async function() {
    var data = fd('inv-form');
    try {
      if (isEdit) {
        await put('/invoices/' + existing.id, data);
        toast('Invoice updated', 'success');
        navigate('/invoices/' + existing.id);
      } else {
        var r = await post('/invoices', data);
        toast('Invoice created', 'success');
        navigate('/invoices/' + r.id);
      }
    } catch(e) { toast(e.message, 'error'); }
  };
}
