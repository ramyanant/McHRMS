/**
 * Bills & Expenses — Zero backticks, zero optional chaining
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

var EXPENSE_TYPES = ['Travel','Accommodation','Meals','Office Supplies','Software/Subscriptions',
  'Equipment','Marketing','Training','Utilities','Professional Services','Contractor Invoice','Vendor Bill','Miscellaneous'];
var PAYMENT_MODES = ['Bank Transfer','Cheque','Cash','UPI','Credit Card','Debit Card'];
var STATUSES      = ['Draft','Submitted','Approved','Paid','Rejected'];

function kpi(l, val, icon, c) {
  return '<div class="kpi-card kpi-' + c + '"><div class="kpi-icon">' + icon + '</div>' +
    '<div class="kpi-body"><div class="kpi-value">' + val + '</div><div class="kpi-label">' + l + '</div></div></div>';
}

export async function renderList() {
  setPageTitle('Bills & Expenses', 'Track money spent');
  setBreadcrumb([{ label: 'Bills & Expenses' }]);
  showLoader();
  try {
    var data = await get('/bills');
    var rows = data.items || [];
    var filterStatus = '', filterType = '', filterQ = '', billSort = 'expense_date', billDir = -1, billPage = 1;
    var BILL_PER = 25;

    function getF() {
      var d = rows.slice();
      if (filterQ)      d = d.filter(function(r) { return ((r.bill_number||'') + ' ' + (r.description||'') + ' ' + (r.vendor_name||'')).toLowerCase().includes(filterQ.toLowerCase()); });
      if (filterStatus) d = d.filter(function(r) { return r.status === filterStatus; });
      if (filterType)   d = d.filter(function(r) { return r.expense_type === filterType; });
      return d.slice().sort(function(a,b){ return String(a[billSort]||'').localeCompare(String(b[billSort]||''))*billDir; });
    }

    var totalAmt = rows.reduce(function(s, r) { return s + parseFloat(r.total_amount || 0); }, 0);
    var pending  = rows.filter(function(r) { return r.status === 'Draft' || r.status === 'Submitted'; }).length;
    var paid     = rows.filter(function(r) { return r.status === 'Paid'; }).length;

    function render() {
      var all = getF(), total = all.length, pages = Math.max(1, Math.ceil(total/BILL_PER));
      billPage = Math.min(Math.max(1,billPage), pages);
      var d = all.slice((billPage-1)*BILL_PER, billPage*BILL_PER);
      var pgBar=''; if(pages>1){var bts=[];if(billPage>1)bts.push('<button class="pg-btn" onclick="window._billPg('+(billPage-1)+')">‹</button>');for(var p=Math.max(1,billPage-2);p<=Math.min(pages,billPage+2);p++)bts.push('<button class="pg-btn'+(p===billPage?' active':'')+'" onclick="window._billPg('+p+')">'+p+'</button>');if(billPage<pages)bts.push('<button class="pg-btn" onclick="window._billPg('+(billPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' bills</span></div>';}
      var tableHTML = '';
      if (!d.length) {
        tableHTML = '<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">No bills or expenses</div>' +
          '<button class="btn btn-primary" onclick="window._addBill()">+ Add Bill/Expense</button></div>';
      } else {
        tableHTML = '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
          (function(){
            function th(col,label){var arr=billSort===col?(billDir===1?' ↑':' ↓'):'';return '<th class="sortable" onclick="window._billSort(\''+col+'\')" style="cursor:pointer">'+label+arr+'</th>';}
            return th('expense_type','Type')+th('bill_number','Bill #')+th('description','Description')+th('vendor_name','Vendor')+th('expense_date','Date')+th('total_amount','Amount')+th('status','Status')+'<th>Actions</th>';
          })() +
          '</tr></thead><tbody>' +
          d.map(function(b) {
            return '<tr class="tbl-clickable" onclick="navigateTo(\'/bills/' + b.id + '\')">' +
              '<td><span class="badge badge-purple">' + v(b.expense_type) + '</span></td>' +
              '<td class="mono">' + v(b.bill_number || '—') + '</td>' +
              '<td>' + v(b.description || '—') + '</td>' +
              '<td>' + v(b.vendor_name || '—') + '</td>' +
              '<td class="mono">' + fmt.date(b.expense_date) + '</td>' +
              '<td class="mono fw-bold">' + fmt.money(b.total_amount) + '</td>' +
              '<td>' + badge(b.status || 'Draft') + '</td>' +
              '<td class="tbl-actions" onclick="event.stopPropagation()">' +
                '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/bills/' + b.id + '\')" >View</button>' +
                '<button class="btn btn-ghost btn-xs" onclick="window._editBillRow(' + b.id + ')">✏ Edit</button>' +
                '<button class="btn btn-danger btn-xs" onclick="window._deleteBill(' + b.id + ')">Delete</button>' +
              '</td></tr>';
          }).join('') +
          '</tbody></table></div></div>';
      }
      document.getElementById('bills-content').innerHTML = tableHTML + pgBar;
    }

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Total Bills', rows.length, '📋', 'blue') +
        kpi('Total Amount', fmt.money(totalAmt), '💰', 'purple') +
        kpi('Pending', pending, '⏳', 'amber') +
        kpi('Paid', paid, '✅', 'green') +
      '</div>' +
      '<div class="struct-toolbar">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input class="search-input" placeholder="Search bills…" oninput="window._billQ(this.value)" style="width:180px">' +
          '<select class="fselect" style="width:170px" onchange="window._billType(this.value)">' +
            '<option value="">All Types</option>' + EXPENSE_TYPES.map(function(t) { return '<option>' + t + '</option>'; }).join('') +
          '</select>' +
          '<select class="fselect" style="width:130px" onchange="window._billStatus(this.value)">' +
            '<option value="">All Status</option>' + STATUSES.map(function(s) { return '<option>' + s + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="window._addBill()">+ Add Bill / Expense</button>' +
      '</div>' +
      '<div id="bills-content"></div></div>'
    );

    render();
    window._billQ      = function(val) { filterQ = val; billPage=1; render(); };
    window._billPg     = function(p) { billPage=p; render(); };
    window._deleteBill = async function(id) {
      if(!confirm('Delete this bill/expense?')) return;
      try {
        await put('/bills/'+id, {is_active:0});
        toast('Bill deleted','info');
        rows = rows.filter(function(r){ return r.id !== id; });
        render();
      } catch(ex){ toast(ex.message||'Failed','error'); }
    };
    window._billType   = function(val) { filterType = val; render(); };
    window._billSort   = function(col) { billSort === col ? billDir *= -1 : (billSort = col, billDir = 1); render(); };
    window._billStatus = function(val) { filterStatus = val; render(); };
    window._addBill    = async function() {
      var masters = await get('/masters/all');
      billModal(null, masters);
    };
    window._editBillRow = async function(id) {
      var b = await get('/bills/' + id);
      var masters = await get('/masters/all');
      billModal(b, masters);
    };
    window._deleteBill = async function(id) {
      if (!confirm('Delete this bill/expense?')) return;
      await put('/bills/' + id, { is_active: 0 });
      toast('Deleted', 'info');
      renderList();
    };
  } catch(e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    var bill = await get('/bills/' + id);
    var masters = await get('/masters/all');
    setPageTitle(bill.expense_type, bill.description || 'Bill/Expense');
    setBreadcrumb([{ label: 'Bills & Expenses', url: '/bills' }, { label: bill.expense_type }]);

    setContent(
      '<div class="detail-layout">' +
      '<div class="detail-sidebar"><div class="card">' +
        '<div class="profile-hero" style="background:linear-gradient(135deg,#6d28d9,#4c1d95)">' +
          '<div style="font-size:40px;margin-bottom:8px">💸</div>' +
          '<div class="profile-name">' + v(bill.expense_type) + '</div>' +
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">' + v(bill.description || '—') + '</div>' +
          '<div style="margin-top:8px">' + badge(bill.status || 'Draft') + '</div>' +
        '</div>' +
        '<div class="profile-meta">' +
          '<div class="meta-row"><span>Amount</span><strong>' + fmt.money(bill.amount) + '</strong></div>' +
          '<div class="meta-row"><span>Tax</span><strong>' + fmt.money(bill.tax_amount) + '</strong></div>' +
          '<div class="meta-row"><span>Total</span><strong>' + fmt.money(bill.total_amount) + '</strong></div>' +
          '<div class="meta-row"><span>Date</span><strong>' + fmt.date(bill.expense_date) + '</strong></div>' +
          '<div class="meta-row"><span>Vendor</span><strong>' + v(bill.vendor_name, '—') + '</strong></div>' +
          '<div class="meta-row"><span>Payment</span><strong>' + v(bill.payment_mode, '—') + '</strong></div>' +
          (bill.bill_number ? '<div class="meta-row"><span>Bill #</span><strong class="mono">' + v(bill.bill_number) + '</strong></div>' : '') +
          (bill.po_number   ? '<div class="meta-row"><span>PO #</span><strong class="mono">' + v(bill.po_number) + '</strong></div>' : '') +
        '</div>' +
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">' +
          '<button class="btn btn-primary btn-full" onclick="window._editBill()">✏ Edit</button>' +
          (bill.status === 'Draft' ? '<button class="btn btn-ghost btn-full" onclick="window._updateStatus(\'Submitted\')">📤 Submit</button>' : '') +
          (bill.status === 'Submitted' ? '<button class="btn btn-primary btn-full" onclick="window._updateStatus(\'Approved\')">✓ Approve</button>' : '') +
          (bill.status === 'Approved' ? '<button class="btn btn-ghost btn-full" onclick="window._updateStatus(\'Paid\')">✓ Mark Paid</button>' : '') +
          '<button class="btn btn-danger btn-full" onclick="window._deleteBillDetail()">Delete</button>' +
        '</div>' +
      '</div></div>' +
      '<div class="detail-main"><div class="card"><div class="card-header"><h3 class="card-title">Details</h3></div>' +
      '<div class="card-body"><div class="field-grid">' +
        '<div class="field-item"><div class="field-label">Expense Type</div><div class="field-value">' + v(bill.expense_type) + '</div></div>' +
        '<div class="field-item"><div class="field-label">Vendor</div><div class="field-value">' + v(bill.vendor_name, '—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Cost Centre</div><div class="field-value">' + v(bill.cost_centre_name, '—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Submitted By</div><div class="field-value">' + v(bill.submitted_by_name, '—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Description</div><div class="field-value">' + v(bill.description, '—') + '</div></div>' +
      '</div></div></div>' +
      // Documents tab — container needs to exist before renderDocsTab
      // populates it; mirrors the pattern used in invoices.js detail.
      '<div class="card" style="margin-top:16px">' +
        '<div class="card-header"><h3 class="card-title">📄 Documents</h3></div>' +
        '<div class="card-body">' + docsTabHtml('bill-docs-' + id) + '</div>' +
      '</div>' +
      '</div></div>'
    );

    window._editBill = async function() {
      billModal(bill, masters);
    };
    setTimeout(function() { renderDocsTab('bill-docs-' + id, '/bills/' + id + '/documents', ['Bill','Receipt','Invoice','Contract','Other']); }, 100);
    window._updateStatus = async function(status) {
      await put('/bills/' + id, { status: status });
      toast(bill.expense_type + ' ' + status.toLowerCase(), 'success');
      renderDetail({ id: id });
    };
    window._deleteBillDetail = async function() {
      if (!confirm('Delete this bill?')) return;
      await put('/bills/' + id, { is_active: 0 });
      toast('Deleted', 'info');
      navigate('/bills');
    };
  } catch(e) { showError(e.message); }
}

function billModal(existing, masters) {
  var isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Bill/Expense' : '+ New Bill / Expense',
    size: 'lg',
    body: '<form id="bill-form" class="form-grid-sm">' +
      '<div class="fg"><label class="flabel">Expense Type *</label>' +
        '<select class="fselect" name="expense_type" required>' +
        EXPENSE_TYPES.map(function(t) { return '<option' + (existing && existing.expense_type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="fg"><label class="flabel">Status</label>' +
        '<select class="fselect" name="status">' +
        STATUSES.map(function(s) { return '<option' + ((existing && existing.status || 'Draft') === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="fg"><label class="flabel">Amount (₹) *</label>' +
        '<input class="finput" type="number" name="amount" value="' + v(existing && existing.amount, 0) + '" step="0.01" required></div>' +
      '<div class="fg"><label class="flabel">Tax Amount (₹)</label>' +
        '<input class="finput" type="number" name="tax_amount" value="' + v(existing && existing.tax_amount, 0) + '" step="0.01"></div>' +
      '<div class="fg"><label class="flabel">Expense Date *</label>' +
        '<input class="finput" type="date" name="expense_date" value="' + v(existing && existing.expense_date ? String(existing.expense_date).split('T')[0] : new Date().toISOString().split('T')[0]) + '" required></div>' +
      '<div class="fg"><label class="flabel">Due Date</label>' +
        '<input class="finput" type="date" name="due_date" value="' + v(existing && existing.due_date ? String(existing.due_date).split('T')[0] : '') + '"></div>' +
      '<div class="fg"><label class="flabel">Vendor</label>' +
        '<select class="fselect" name="vendor_id"><option value="">None</option>' +
        opts(masters['vendors-lookup'] || [], existing && existing.vendor_id) + '</select></div>' +
      '<div class="fg"><label class="flabel">Cost Centre</label>' +
        '<select class="fselect" name="cost_centre_id"><option value="">None</option>' +
        opts(masters['cost-centres'] || [], existing && existing.cost_centre_id) + '</select></div>' +
      '<div class="fg"><label class="flabel">Currency</label>' +
        '<select class="fselect" name="currency">' +
        ['INR','USD','EUR','GBP'].map(function(c) { return '<option' + ((existing && existing.currency || 'INR') === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="fg"><label class="flabel">Payment Mode</label>' +
        '<select class="fselect" name="payment_mode">' +
        PAYMENT_MODES.map(function(m) { return '<option' + ((existing && existing.payment_mode || 'Bank Transfer') === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="fg"><label class="flabel">Bill Number</label>' +
        '<input class="finput mono" name="bill_number" value="' + v(existing && existing.bill_number) + '"></div>' +
      '<div class="fg"><label class="flabel">PO Number</label>' +
        '<input class="finput mono" name="po_number" value="' + v(existing && existing.po_number) + '"></div>' +
      '<div class="fg full"><label class="flabel">Description</label>' +
        '<input class="finput" name="description" value="' + v(existing && existing.description) + '"></div>' +
      '<div class="fg full"><label class="flabel">Receipt File</label>' +
        '<input type="file" class="finput" id="receipt-file" accept=".pdf,.png,.jpg,.jpeg">' +
        '<div class="field-hint">PDF or image. Max 5MB.</div></div>' +
    '</form>',
    submitLabel: isEdit ? 'Save Changes' : 'Create',
    onSubmit: async function() {
      var data = fd('bill-form');
      var fi = document.getElementById('receipt-file');
      if (fi && fi.files && fi.files[0]) {
        var file = fi.files[0];
        if (file.size < 5 * 1024 * 1024) {
          var base64 = await new Promise(function(res, rej) {
            var reader = new FileReader();
            reader.onload = function() { res(reader.result.split(',')[1]); };
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          data.receipt_data = base64;
          data.receipt_name = file.name;
        }
      }
      if (isEdit) {
        await put('/bills/' + existing.id, data);
        toast('Updated', 'success');
        renderDetail({ id: existing.id });
      } else {
        var r = await post('/bills', data);
        toast('Created', 'success');
        navigate('/bills/' + r.id);
      }
    }
  });
}
