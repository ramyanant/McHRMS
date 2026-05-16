/**
 * Timesheets & Leaves — No template literals, no optional chaining
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
function opts(arr, sel) {
  return arr.map(function(i) {
    var val = typeof i === 'string' ? i : i.id;
    var lbl = typeof i === 'string' ? i : i.name;
    return '<option value="' + v(val) + '"' + (String(val) === String(sel) ? ' selected' : '') + '>' + v(lbl) + '</option>';
  }).join('');
}

export async function renderList() {
  setPageTitle('Timesheets', 'Time tracking');
  setBreadcrumb([{ label: 'Timesheets' }]);
  showLoader();
  try {
    var data = await get('/timesheets?per_page=100');
    var rows = data.items || [];
    var filterStatus = '';

    function getF() {
      return filterStatus ? rows.filter(function(r) { return r.status === filterStatus; }) : rows;
    }

    function renderRows() {
      var d = getF();
      if (!d.length) return '<div class="empty-state"><div class="empty-icon">⏱</div><div class="empty-title">No timesheets found</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        '<th>Employee</th><th>Project/Client</th><th>Week Ending</th><th>Hours</th><th>Status</th>' +
        '</tr></thead><tbody>' +
        d.map(function(t) {
          return '<tr>' +
            '<td><strong>' + v(t.employee_name, '—') + '</strong></td>' +
            '<td>' + v(t.project || t.client_name, '—') + '</td>' +
            '<td class="mono">' + fmt.date(t.week_ending) + '</td>' +
            '<td class="mono fw-bold">' + (t.total_hours || 0) + 'h</td>' +
            '<td>' + badge(t.status || 'Pending') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div></div>';
    }

    var statusBtns = ['All', 'Pending', 'Approved', 'Rejected'].map(function(s) {
      return '<button class="filter-btn' + (s === 'All' ? ' active' : '') + '" onclick="window._tsFilter(\'' + s + '\',this)">' + s + '</button>';
    }).join('');

    setContent(
      '<div class="page-body">' +
      '<div class="struct-toolbar">' +
        '<div class="filter-group">' + statusBtns + '</div>' +
        '<button class="btn btn-primary" onclick="window._submitTS()">+ Submit Timesheet</button>' +
      '</div>' +
      '<div id="ts-content">' + renderRows() + '</div>' +
      '</div>'
    );

    window._tsFilter = function(status, el) {
      filterStatus = status === 'All' ? '' : status;
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      el.classList.add('active');
      document.getElementById('ts-content').innerHTML = renderRows();
    };

    window._submitTS = async function() {
      var masters = await get('/masters/all');
      openModal({
        title: '+ Submit Timesheet', size: 'md',
        body: '<form id="ts-form" class="form-grid-sm">' +
          '<div class="fg"><label class="flabel">Week Ending *</label><input class="finput" type="date" name="week_ending" required></div>' +
          '<div class="fg"><label class="flabel">Project</label><input class="finput" name="project" placeholder="Project name"></div>' +
          '<div class="fg"><label class="flabel">Client</label>' +
            '<select class="fselect" name="client_id"><option value="">Select client…</option>' +
            opts(masters['clients-lookup'] || [], null) + '</select></div>' +
          '<div class="fg"><label class="flabel">Regular Hours *</label><input class="finput" type="number" name="regular_hours" value="0" min="0" max="80" step="0.5" required></div>' +
          '<div class="fg"><label class="flabel">Overtime Hours</label><input class="finput" type="number" name="overtime_hours" value="0" min="0" step="0.5"></div>' +
          '<div class="fg"><label class="flabel">Bill Rate (₹/hr)</label><input class="finput" type="number" name="bill_rate" value="0"></div>' +
          '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2"></textarea></div>' +
          '</form>',
        submitLabel: 'Submit for Approval',
        onSubmit: async function() {
          var data = fd('ts-form');
          try {
            await post('/my/timesheets', data);
            toast('Timesheet submitted for approval', 'success');
            navigate('/timesheets');
          } catch(e) { toast(e.message, 'error'); }
        }
      });
    };
  } catch(e) { showError(e.message); }
}

export async function renderApproval() {
  setPageTitle('Approval Queue', 'Pending approvals');
  setBreadcrumb([{ label: 'Timesheets', url: '/timesheets' }, { label: 'Approvals' }]);
  showLoader();
  try {
    var data = await get('/timesheets/pending-approvals');
    var ts    = data.timesheets || [];
    var leaves= data.leaves     || [];

    function tsRows() {
      if (!ts.length) return '<div class="empty-mini">No timesheets pending</div>';
      return '<div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        '<th>Employee</th><th>Project</th><th>Week Ending</th><th>Hours</th><th>Actions</th>' +
        '</tr></thead><tbody>' +
        ts.map(function(t) {
          return '<tr>' +
            '<td><strong>' + v(t.employee_name, '—') + '</strong></td>' +
            '<td>' + v(t.project || t.client_name, '—') + '</td>' +
            '<td class="mono">' + fmt.date(t.week_ending) + '</td>' +
            '<td class="mono fw-bold">' + (t.total_hours || 0) + 'h</td>' +
            '<td class="tbl-actions">' +
              '<button class="btn btn-primary btn-sm" onclick="window._approve(' + t.id + ')">✓ Approve</button>' +
              '<button class="btn btn-danger btn-sm" onclick="window._reject(' + t.id + ')">✗ Reject</button>' +
            '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    function leaveRows() {
      if (!leaves.length) return '<div class="empty-mini">No leave requests pending</div>';
      return '<div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        '<th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Actions</th>' +
        '</tr></thead><tbody>' +
        leaves.map(function(l) {
          return '<tr>' +
            '<td><strong>' + v(l.employee_name, '—') + '</strong></td>' +
            '<td>' + v(l.leave_type, '—') + '</td>' +
            '<td class="mono">' + fmt.date(l.from_date) + '</td>' +
            '<td class="mono">' + fmt.date(l.to_date) + '</td>' +
            '<td>' + (l.days || 1) + '</td>' +
            '<td class="tbl-actions">' +
              '<button class="btn btn-primary btn-sm" onclick="window._approveLeave(' + l.id + ')">✓ Approve</button>' +
              '<button class="btn btn-danger btn-sm" onclick="window._rejectLeave(' + l.id + ')">✗ Reject</button>' +
            '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-header"><h3 class="card-title">⏱ Timesheets (' + ts.length + ')</h3></div>' +
        tsRows() +
      '</div>' +
      '<div class="card">' +
        '<div class="card-header"><h3 class="card-title">🌴 Leave Requests (' + leaves.length + ')</h3></div>' +
        leaveRows() +
      '</div></div>'
    );

    window._approve = async function(id) {
      try {
        await put('/timesheets/' + id, { status: 'Approved' });
        toast('Timesheet approved', 'success');
        await renderApproval();
      } catch(e) { toast(e.message, 'error'); }
    };
    window._reject = async function(id) {
      var reason = prompt('Rejection reason (required):');
      if (!reason || !reason.trim()) return;
      try {
        await put('/timesheets/' + id, { status: 'Rejected', rejection_reason: reason });
        toast('Timesheet rejected', 'info');
        await renderApproval();
      } catch(e) { toast(e.message, 'error'); }
    };
    window._approveLeave = async function(id) {
      await put('/my/leaves/' + id, { action: 'approve' });
      toast('Leave approved', 'success');
      await renderApproval();
    };
    window._rejectLeave = async function(id) {
      var reason = prompt('Rejection reason:');
      await put('/my/leaves/' + id, { action: 'reject', reason: reason });
      toast('Leave rejected', 'info');
      await renderApproval();
    };
  } catch(e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    var ts = await get('/timesheets/' + id);
    setPageTitle('Timesheet #' + id, ts.employee_name || '');
    setBreadcrumb([{ label: 'Timesheets', url: '/timesheets' }, { label: '#' + id }]);
    setContent(
      '<div class="page-body"><div class="card" style="max-width:600px;margin:0 auto">' +
      '<div class="card-header"><h3 class="card-title">Timesheet Details</h3></div>' +
      '<div class="card-body"><div class="field-grid">' +
        '<div class="field-item"><div class="field-label">Employee</div><div class="field-value">' + v(ts.employee_name,'—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Week Ending</div><div class="field-value mono">' + fmt.date(ts.week_ending) + '</div></div>' +
        '<div class="field-item"><div class="field-label">Project</div><div class="field-value">' + v(ts.project,'—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Hours</div><div class="field-value fw-bold">' + (ts.total_hours || 0) + 'h</div></div>' +
        '<div class="field-item"><div class="field-label">Status</div><div class="field-value">' + badge(ts.status || 'Pending') + '</div></div>' +
      '</div></div></div></div>'
    );
  } catch(e) { showError(e.message); }
}
