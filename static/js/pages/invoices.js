/**
 * Invoices — Manual invoice number, description, file upload, Edit button, filters
 */
import { get, post, put } from '../api.js';
import { renderDocsTab, docsTabHtml } from '../docs.js?v=20260521a';
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

var STATUSES   = ['Draft','Sent','Partially Paid','Paid','Overdue','Cancelled'];
var CURRENCIES = ['INR','USD','EUR','GBP'];

export async function renderList() {
  setPageTitle('Invoices', 'Client invoices & billing');
  setBreadcrumb([{ label: 'Invoices' }]);
  showLoader();
  try {
    var data = await get('/invoices');
    var rows = data.items || [];
    var q = '', filterStatus = '', filterClient = '';
    var sortCol = 'created_at', sortDir = -1, invPage = 1;
    var INV_PER = 25;

    var clientNames = [...new Set(rows.map(function(r) { return r.client_name; }).filter(Boolean))];

    function sorted(arr) {
      return arr.slice().sort(function(a,b) {
        return String(a[sortCol]||'').localeCompare(String(b[sortCol]||'')) * sortDir;
      });
    }
    function getF() {
      var d = rows.slice();
      if (q)            d = d.filter(function(r) { return (r.invoice_number + ' ' + (r.client_name||'') + ' ' + (r.description||'')).toLowerCase().includes(q.toLowerCase()); });
      if (filterStatus) d = d.filter(function(r) { return (r.status_name || r.status) === filterStatus; });
      if (filterClient) d = d.filter(function(r) { return r.client_name === filterClient; });
      return sorted(d);
    }
    function thSort(col, label) {
      var arr = sortCol === col ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
      return '<th class="sortable" onclick="window._invSort(\'' + col + '\')" style="cursor:pointer">' + label + arr + '</th>';
    }

    var totalAmt  = rows.reduce(function(s,r) { return s + parseFloat(r.total_amount||0); }, 0);
    var paidAmt   = rows.filter(function(r) { return (r.status_name||r.status) === 'Paid'; })
                       .reduce(function(s,r) { return s + parseFloat(r.total_amount||0); }, 0);
    var overdueN  = rows.filter(function(r) { return (r.status_name||r.status) === 'Overdue'; }).length;

    function kpi(l,val,icon,c) {
      return '<div class="kpi-card kpi-'+c+'"><div class="kpi-icon">'+icon+'</div>' +
        '<div class="kpi-body"><div class="kpi-value">'+val+'</div><div class="kpi-label">'+l+'</div></div></div>';
    }

    function render() {
      var all=getF(), total=all.length, pages=Math.max(1,Math.ceil(total/INV_PER));
      invPage=Math.min(Math.max(1,invPage),pages);
      var d=all.slice((invPage-1)*INV_PER, invPage*INV_PER);
      if(!total) return '<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No invoices found</div></div>';
      var pgBar=''; if(pages>1){var bts=[];if(invPage>1)bts.push('<button class="pg-btn" onclick="window._invPg('+(invPage-1)+')">‹</button>');for(var p=Math.max(1,invPage-2);p<=Math.min(pages,invPage+2);p++)bts.push('<button class="pg-btn'+(p===invPage?' active':'')+'" onclick="window._invPg('+p+')">'+p+'</button>');if(invPage<pages)bts.push('<button class="pg-btn" onclick="window._invPg('+(invPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' invoices</span></div>';}
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thSort('invoice_number','Invoice #') +
        thSort('client_name','Client') +
        thSort('description','Description') +
        thSort('period_start','Period') +
        thSort('po_number','PO #') +
        thSort('total_amount','Amount') +
        thSort('status_name','Status') +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(function(inv) {
        return '<tr class="tbl-clickable" onclick="navigateTo(\'/invoices/' + inv.id + '\')">' +
          '<td class="mono fw-bold">' + v(inv.invoice_number) + '</td>' +
          '<td>' + v(inv.client_name,'—') + '</td>' +
          '<td class="text-muted">' + v(inv.description,'—') + '</td>' +
          '<td class="mono text-muted">' + (inv.period_start ? fmt.date(inv.period_start).substring(3) : '—') + '</td>' +
          '<td class="mono">' + v(inv.po_number,'—') + '</td>' +
          '<td class="mono fw-bold">' + fmt.money(inv.total_amount) + '</td>' +
          '<td>' + badge(inv.status_name || inv.status || 'Draft') + '</td>' +
          '<td class="tbl-actions" onclick="event.stopPropagation()">' +
            '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/invoices/' + inv.id + '\')">View</button>' +
            '<button class="btn btn-ghost btn-xs" onclick="window._editInvRow(' + inv.id + ')">✏ Edit</button>' +
            '<button class="btn btn-danger btn-xs" onclick="window._deleteInv(' + inv.id + ')">Del</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table></div>'+pgBar+'</div>';
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
      '<div id="inv-content">' + render() + '</div></div>'
    );

    window._invQ      = function(val) { q = val; invPage=1; document.getElementById('inv-content').innerHTML = render(); };
    window._invPg     = function(p) { invPage=p; document.getElementById('inv-content').innerHTML = render(); };
    window._invStatus = function(val) { filterStatus = val; document.getElementById('inv-content').innerHTML = render(); };
    window._invClient = function(val) { filterClient = val; document.getElementById('inv-content').innerHTML = render(); };
    window._invSort   = function(col) { sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1); document.getElementById('inv-content').innerHTML = render(); };

    window._deleteInv = async function(id) {
      if (!confirm('Delete this invoice?')) return;
      try {
        await put('/invoices/' + id, { is_active: 0 });
        toast('Invoice deleted', 'info');
        rows.splice(rows.findIndex(function(r) { return r.id === id; }), 1);
        document.getElementById('inv-content').innerHTML = render();
      } catch(e) { toast(e.message || 'Delete failed', 'error'); }
    };

    window._editInvRow = async function(id) {
      var masters = await get('/masters/all');
      var inv = rows.find(function(r) { return r.id === id; });
      renderInvoiceForm(inv, masters);
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
          '<div class="meta-row"><span>Amount</span><strong class="mono">' + fmt.money(inv.total_amount || inv.amount) + '</strong></div>' +
          '<div class="meta-row"><span>PO Number</span><strong class="mono">' + v(inv.po_number, '—') + '</strong></div>' +
          '<div class="meta-row"><span>Cost Centre</span><strong>' + v(inv.cost_centre_name, '—') + '</strong></div>' +
          '<div class="meta-row"><span>Period</span><strong>' + fmt.date(inv.period_start) + ' – ' + fmt.date(inv.period_end) + '</strong></div>' +
        '</div>' +
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">' +
          '<button class="btn btn-primary btn-full" onclick="window._editInv()">✏ Edit</button>' +
          (inv.invoice_file_name ? '<button class="btn btn-ghost btn-full" onclick="window._downloadInv()">⬇ Download</button>' : '') +
          '<button class="btn btn-ghost btn-full" onclick="window._markPaid()">✓ Mark Paid</button>' +
        '</div>' +
      '</div></div>' +
      '<div class="detail-main"><div class="card"><div class="card-header"><h3 class="card-title">Invoice Details</h3></div>' +
      '<div class="card-body"><div class="field-grid">' +
        '<div class="field-item"><div class="field-label">Client</div><div class="field-value">' + v(inv.client_name) + '</div></div>' +
        '<div class="field-item"><div class="field-label">Description</div><div class="field-value">' + v(inv.description, '—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Period</div><div class="field-value">' + fmt.date(inv.period_start) + ' – ' + fmt.date(inv.period_end) + '</div></div>' +
        '<div class="field-item"><div class="field-label">Currency</div><div class="field-value">' + v(inv.currency, 'INR') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Notes</div><div class="field-value">' + v(inv.notes, '—') + '</div></div>' +
      '</div></div></div>' +
      '<div class="card" style="margin-top:16px">' +
        '<div class="card-header"><h3 class="card-title">📄 Documents</h3></div>' +
        '<div class="card-body">' + docsTabHtml('inv-docs-' + id) + '</div>' +
      '</div>' +
      '</div></div>'
    );
    setTimeout(function() { renderDocsTab('inv-docs-' + id, '/invoices/' + id + '/documents', ['Invoice','PO','Delivery Note','Agreement','Other']); }, 100);

    window._editInv = async function() {
      var masters = await get('/masters/all');
      renderInvoiceForm(inv, masters);
    };
    window._markPaid = async function() {
      var paidStatus = (masters && masters['invoice-statuses'] || []).find(function(s) { return s.name === 'Paid'; });
      await put('/invoices/' + id, { status_id: paidStatus ? paidStatus.id : null, status: 'Paid' });
      toast('Invoice marked as paid', 'success');
      navigate('/invoices');
    };
    window._downloadInv = async function() {
      if (!inv.invoice_file_data) { toast('No file attached', 'error'); return; }
      var link = document.createElement('a');
      link.href = 'data:' + (inv.invoice_mime || 'application/pdf') + ';base64,' + inv.invoice_file_data;
      link.download = inv.invoice_file_name || 'invoice.pdf';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
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
      '<div class="fg"><label class="flabel">Invoice Number *</label>' +
        '<input class="finput mono" name="invoice_number" value="' + v(existing && existing.invoice_number) + '" required placeholder="e.g. INV-2024-001"></div>' +
      '<div class="fg"><label class="flabel">Client *</label>' +
        '<select class="fselect" name="client_id" required><option value="">Select client…</option>' +
        opts(masters['clients-lookup'] || [], existing && existing.client_id) + '</select></div>' +
      '<div class="fg full"><label class="flabel">Description</label>' +
        '<input class="finput" name="description" value="' + v(existing && existing.description) + '" placeholder="e.g. Staffing services for March 2024"></div>' +
      '<div class="fg"><label class="flabel">Invoice Status</label>' +
        '<select class="fselect" name="status_id">' +
        opts(masters['invoice-statuses'] || [], existing && existing.status_id) + '</select></div>' +
      '<div class="fg"><label class="flabel">Currency</label>' +
        '<select class="fselect" name="currency">' + opts(CURRENCIES, (existing && existing.currency) || 'INR') + '</select></div>' +
      '<div class="fg"><label class="flabel">Amount (₹)</label>' +
        '<input class="finput" type="number" name="amount" value="' + v(existing && existing.amount, 0) + '" step="0.01" oninput="window._calcInvTotal()"></div>' +
      '<div class="fg"><label class="flabel">Tax Amount (₹)</label>' +
        '<input class="finput" type="number" name="tax_amount" id="inv-tax" value="' + v(existing && existing.tax_amount, 0) + '" step="0.01" oninput="window._calcInvTotal()"></div>' +
      '<div class="fg"><label class="flabel">Total Amount</label>' +
        '<input class="finput mono fw-bold" id="inv-total" value="' + v(existing && existing.total_amount, 0) + '" readonly style="background:var(--bg)"></div>' +
      '<div class="fg"><label class="flabel">Period Start</label>' +
        '<input class="finput" type="date" name="period_start" value="' + v(existing && existing.period_start ? String(existing.period_start).split('T')[0] : '') + '"></div>' +
      '<div class="fg"><label class="flabel">Period End</label>' +
        '<input class="finput" type="date" name="period_end" value="' + v(existing && existing.period_end ? String(existing.period_end).split('T')[0] : '') + '"></div>' +
      '<div class="fg"><label class="flabel">PO Number</label>' +
        '<input class="finput" name="po_number" value="' + v(existing && existing.po_number) + '" placeholder="Purchase order reference"></div>' +
      '<div class="fg"><label class="flabel">Cost Centre</label>' +
        '<select class="fselect" name="cost_centre_id"><option value="">None</option>' +
        opts(masters['cost-centres'] || [], existing && existing.cost_centre_id) + '</select></div>' +
      '<div class="fg full"><label class="flabel">Notes</label>' +
        '<textarea class="finput" name="notes" rows="2">' + v(existing && existing.notes) + '</textarea></div>' +
      '<div class="fg full"><label class="flabel">Upload Invoice File (PDF/Image)</label>' +
        '<input type="file" class="finput" id="inv-file" accept=".pdf,.png,.jpg,.jpeg">' +
        '<div class="field-hint">' + (existing && existing.invoice_file_name ? '✅ File attached: ' + v(existing.invoice_file_name) + '. Upload new to replace.' : 'Optional: attach the signed invoice PDF') + '</div></div>' +
    '</div></form>' +
    '<div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="navigateTo(\'' + (isEdit ? '/invoices/' + existing.id : '/invoices') + '\')">Cancel</button>' +
      '<button type="button" class="btn btn-primary" onclick="window._saveInv()">' + (isEdit ? 'Save Changes' : 'Create Invoice') + '</button>' +
    '</div></div></div>'
  );

  window._calcInvTotal = function() {
    var amt = parseFloat(document.querySelector('#inv-form [name=amount]').value) || 0;
    var tax = parseFloat(document.getElementById('inv-tax').value) || 0;
    document.getElementById('inv-total').value = (amt + tax).toFixed(2);
  };

  window._saveInv = async function() {
    var data = fd('inv-form');
    data.total_amount = parseFloat(document.getElementById('inv-total').value) || 0;
    // Handle file upload
    var fi = document.getElementById('inv-file');
    if (fi && fi.files && fi.files[0]) {
      var file = fi.files[0];
      var b64 = await new Promise(function(res, rej) {
        var r = new FileReader(); r.onload = function() { res(r.result.split(',')[1]); }; r.onerror = rej; r.readAsDataURL(file);
      });
      data.invoice_file_data = b64;
      data.invoice_file_name = file.name;
      data.invoice_mime      = file.type;
    }
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
