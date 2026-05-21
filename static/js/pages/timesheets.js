/**
 * Timesheets — List, Approval Queue (tabs, filters, sort, row-click), Detail
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
function opts(arr, sel) {
  return arr.map(function(i) {
    var val = typeof i === 'string' ? i : i.id;
    var lbl = typeof i === 'string' ? i : i.name;
    return '<option value="' + v(val) + '"' + (String(val) === String(sel) ? ' selected' : '') + '>' + v(lbl) + '</option>';
  }).join('');
}

// ── Timesheet List ───────────────────────────────────────────
export async function renderList() {
  setPageTitle('Timesheets', 'Time tracking');
  setBreadcrumb([{ label: 'Timesheets' }]);
  showLoader();
  try {
    var data = await get('/timesheets?per_page=100');
    var rows = data.items || [];
    var filterStatus = '', sortCol = 'week_ending', sortDir = -1, tsPage = 1;
    var TS_PER = 25;

    function sorted(arr) {
      return arr.slice().sort(function(a, b) {
        var av = a[sortCol] || '', bv = b[sortCol] || '';
        return String(av).localeCompare(String(bv)) * sortDir;
      });
    }
    function getF() {
      var d = rows;
      if (filterStatus) d = d.filter(function(r) { return r.status === filterStatus; });
      return sorted(d);
    }

    function thSort(col, label) {
      var arrow = sortCol === col ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
      return '<th class="sortable" onclick="window._tsSort(\'' + col + '\')" style="cursor:pointer">' + label + arrow + '</th>';
    }

    function renderRows() {
      var all=getF(), total=all.length, pages=Math.max(1,Math.ceil(total/TS_PER));
      tsPage=Math.min(Math.max(1,tsPage),pages);
      var d=all.slice((tsPage-1)*TS_PER,tsPage*TS_PER);
      var pgBar=''; if(pages>1){var bts=[];if(tsPage>1)bts.push('<button class="pg-btn" onclick="window._tsPg('+(tsPage-1)+')">‹</button>');for(var p=Math.max(1,tsPage-2);p<=Math.min(pages,tsPage+2);p++)bts.push('<button class="pg-btn'+(p===tsPage?' active':'')+'" onclick="window._tsPg('+p+')">'+p+'</button>');if(tsPage<pages)bts.push('<button class="pg-btn" onclick="window._tsPg('+(tsPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' timesheets</span></div>';}
      if (!total) return '<div class="empty-state"><div class="empty-icon">⏱</div><div class="empty-title">No timesheets found</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thSort('employee_name', 'Employee') +
        thSort('project', 'Project / Client') +
        thSort('week_ending', 'Week Ending') +
        thSort('total_hours', 'Hours') +
        thSort('status', 'Status') +
        '</tr></thead><tbody>' +
        d.map(function(t) {
          var status = t.status || 'Pending';
          var canEdit = status === 'In Progress' || status === 'Draft';
          return '<tr class="tbl-clickable" onclick="navigateTo(\'/timesheets/' + t.id + '\')">' +
            '<td><strong>' + v(t.employee_name, '—') + '</strong></td>' +
            '<td>' + v(t.project || t.client_name, '—') + '</td>' +
            '<td class="mono">' + fmt.date(t.week_ending) + '</td>' +
            '<td class="mono fw-bold">' + (t.total_hours || 0) + 'h</td>' +
            '<td>' + badge(status) + '</td>' +
            '<td class="tbl-actions" onclick="event.stopPropagation()">' +
              (canEdit ? '<button class="btn btn-primary btn-xs" onclick="navigateTo(\'/timesheets/' + t.id + '/edit\')" >✏ Edit</button>' : '') +
              '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/timesheets/' + t.id + '\')" >View</button>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>'+pgBar+'</div>';
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
      '<div id="ts-list">' + renderRows() + '</div>' +
      '</div>'
    );

    window._tsPg = function(p) { tsPage=p; document.getElementById('ts-list').innerHTML = renderRows(); };
    window._tsFilter = function(status, el) {
      filterStatus = status === 'All' ? '' : status;
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      el.classList.add('active');
      document.getElementById('ts-list').innerHTML = renderRows();
    };
    window._tsSort = function(col) {
      if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }
      document.getElementById('ts-list').innerHTML = renderRows();
    };

    window._submitTS = function() { navigate('/timesheets/new'); };
  } catch(e) { showError(e.message); }
}

// ── Approval Queue ───────────────────────────────────────────
export async function renderApproval() {
  setPageTitle('Approval Queue', 'Team timesheets & leave requests');
  setBreadcrumb([{ label: 'Timesheets', url: '/timesheets' }, { label: 'Approval Queue' }]);
  showLoader();
  try {
    var data   = await get('/timesheets/pending-approvals');
    var allTS  = data.timesheets || [];
    var allLV  = data.leaves     || [];

    var activeTab  = 'timesheets';
    var tsFilter   = 'Pending';
    var lvFilter   = 'Pending';
    var tsSortCol  = 'week_ending';
    var tsSortDir  = -1;
    var lvSortCol  = 'from_date';
    var lvSortDir  = -1;

    // ── Status badges colour map ──
    var statusColors = { Pending: 'amber', Approved: 'green', Rejected: 'red', Submitted: 'blue' };

    function filteredTS() {
      var d = tsFilter === 'All' ? allTS : allTS.filter(function(t) { return (t.status || 'Pending') === tsFilter; });
      return d.slice().sort(function(a, b) {
        return String(a[tsSortCol] || '').localeCompare(String(b[tsSortCol] || '')) * tsSortDir;
      });
    }
    function filteredLV() {
      var d = lvFilter === 'All' ? allLV : allLV.filter(function(l) { return (l.status || 'Pending') === lvFilter; });
      return d.slice().sort(function(a, b) {
        return String(a[lvSortCol] || '').localeCompare(String(b[lvSortCol] || '')) * lvSortDir;
      });
    }

    function thTs(col, label) {
      var arr = tsSortCol === col ? (tsSortDir === 1 ? ' ↑' : ' ↓') : '';
      return '<th class="sortable" onclick="window._tqSort(\'' + col + '\')" style="cursor:pointer">' + label + arr + '</th>';
    }
    function thLv(col, label) {
      var arr = lvSortCol === col ? (lvSortDir === 1 ? ' ↑' : ' ↓') : '';
      return '<th class="sortable" onclick="window._lqSort(\'' + col + '\')" style="cursor:pointer">' + label + arr + '</th>';
    }

    function statusFilterBar(current, setter) {
      return '<div class="filter-group" style="margin-bottom:12px">' +
        ['All', 'Pending', 'Approved', 'Rejected'].map(function(s) {
          return '<button class="filter-btn' + (current === s ? ' active' : '') + '" onclick="' + setter + '(\'' + s + '\',this)">' + s + '</button>';
        }).join('') +
      '</div>';
    }

    function tsTable() {
      var d = filteredTS();
      if (!d.length) return '<div class="empty-state"><div class="empty-icon">⏱</div><div class="empty-title">No timesheets match this filter</div></div>';
      return '<div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thTs('employee_name','Employee') + thTs('project','Project') +
        thTs('week_ending','Week Ending') + thTs('total_hours','Hours') +
        thTs('status','Status') + '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(function(t) {
        var status = t.status || 'Pending';
        return '<tr class="tbl-clickable" onclick="window._openTS(' + t.id + ')">' +
          '<td><div class="cell-person">' +
            '<div class="av av-sm av-blue">' + fmt.ini(t.employee_name || '?') + '</div>' +
            '<div><div class="fw-bold">' + v(t.employee_name, '—') + '</div>' +
            '<div class="cell-sub mono">' + v(t.emp_id, '') + '</div></div>' +
          '</div></td>' +
          '<td>' + v(t.project || t.client_name, '—') + '</td>' +
          '<td class="mono">' + fmt.date(t.week_ending) + '</td>' +
          '<td class="mono fw-bold">' + (t.total_hours || 0) + 'h</td>' +
          '<td>' + badge(status) + '</td>' +
          '<td class="tbl-actions" onclick="event.stopPropagation()">' +
            (status === 'Pending' || status === 'Submitted'
              ? '<button class="btn btn-primary btn-xs" onclick="window._approve(' + t.id + ')">✓ Approve</button>' +
                '<button class="btn btn-danger btn-xs" onclick="window._reject(' + t.id + ')">✗ Reject</button>'
              : '<button class="btn btn-ghost btn-xs" onclick="window._openTS(' + t.id + ')">View</button>') +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
    }

    function lvTable() {
      var d = filteredLV();
      if (!d.length) return '<div class="empty-state"><div class="empty-icon">🌴</div><div class="empty-title">No leave requests match this filter</div></div>';
      return '<div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thLv('employee_name','Employee') + thLv('leave_type','Type') +
        thLv('from_date','From') + thLv('to_date','To') + thLv('days','Days') +
        thLv('status','Status') + '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(function(l) {
        var status = l.status || 'Pending';
        return '<tr class="tbl-clickable" onclick="window._openLV(' + l.id + ')">' +
          '<td><div class="cell-person">' +
            '<div class="av av-sm av-green">' + fmt.ini(l.employee_name || '?') + '</div>' +
            '<div class="fw-bold">' + v(l.employee_name, '—') + '</div>' +
          '</div></td>' +
          '<td><span class="badge badge-purple">' + v(l.leave_type, '—') + '</span></td>' +
          '<td class="mono">' + fmt.date(l.from_date) + '</td>' +
          '<td class="mono">' + fmt.date(l.to_date) + '</td>' +
          '<td class="fw-bold">' + (l.days || 1) + ' day' + (l.days > 1 ? 's' : '') + '</td>' +
          '<td>' + badge(status) + '</td>' +
          '<td class="tbl-actions" onclick="event.stopPropagation()">' +
            (status === 'Pending'
              ? '<button class="btn btn-primary btn-xs" onclick="window._approveLeave(' + l.id + ')">✓ Approve</button>' +
                '<button class="btn btn-danger btn-xs" onclick="window._rejectLeave(' + l.id + ')">✗ Reject</button>'
              : '<button class="btn btn-ghost btn-xs" onclick="window._openLV(' + l.id + ')">View</button>') +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
    }

    function kpi(l, val, icon, c) {
      return '<div class="kpi-card kpi-' + c + '"><div class="kpi-icon">' + icon + '</div>' +
        '<div class="kpi-body"><div class="kpi-value">' + val + '</div><div class="kpi-label">' + l + '</div></div></div>';
    }

    function renderContent() {
      var pendTS = allTS.filter(function(t) { return (t.status||'Pending') === 'Pending' || t.status === 'Submitted'; }).length;
      var pendLV = allLV.filter(function(l) { return l.status === 'Pending'; }).length;

      return '<div class="page-body">' +
        '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
          kpi('Pending Timesheets', pendTS,       '⏱', 'amber') +
          kpi('Pending Leaves',     pendLV,       '🌴', 'blue') +
          kpi('Total Timesheets',   allTS.length, '📋', 'purple') +
          kpi('Total Leave Req.',   allLV.length, '📊', 'green') +
        '</div>' +
        '<div class="tab-bar">' +
          '<button class="tab' + (activeTab === 'timesheets' ? ' active' : '') + '" onclick="window._aqTab(\'timesheets\',this)">⏱ Timesheets (' + allTS.length + ')</button>' +
          '<button class="tab' + (activeTab === 'leaves' ? ' active' : '') + '" onclick="window._aqTab(\'leaves\',this)">🌴 Leave Requests (' + allLV.length + ')</button>' +
        '</div>' +
        '<div class="card">' +
          '<div id="aq-filter">' +
            (activeTab === 'timesheets'
              ? statusFilterBar(tsFilter, 'window._tsStatusFilter')
              : statusFilterBar(lvFilter, 'window._lvStatusFilter')) +
          '</div>' +
          '<div id="aq-table">' +
            (activeTab === 'timesheets' ? tsTable() : lvTable()) +
          '</div>' +
        '</div>' +
        '</div>';
    }

    setContent(renderContent());

    // ── Tab switching ──
    window._aqTab = function(tab, el) {
      activeTab = tab;
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      el.classList.add('active');
      document.getElementById('aq-filter').innerHTML = tab === 'timesheets'
        ? statusFilterBar(tsFilter, 'window._tsStatusFilter')
        : statusFilterBar(lvFilter, 'window._lvStatusFilter');
      document.getElementById('aq-table').innerHTML = tab === 'timesheets' ? tsTable() : lvTable();
    };

    // ── Filters ──
    window._tsStatusFilter = function(status, el) {
      tsFilter = status;
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      el.classList.add('active');
      document.getElementById('aq-table').innerHTML = tsTable();
    };
    window._lvStatusFilter = function(status, el) {
      lvFilter = status;
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      el.classList.add('active');
      document.getElementById('aq-table').innerHTML = lvTable();
    };

    // ── Sort ──
    window._tqSort = function(col) {
      if (tsSortCol === col) { tsSortDir *= -1; } else { tsSortCol = col; tsSortDir = 1; }
      document.getElementById('aq-table').innerHTML = tsTable();
    };
    window._lqSort = function(col) {
      if (lvSortCol === col) { lvSortDir *= -1; } else { lvSortCol = col; lvSortDir = 1; }
      document.getElementById('aq-table').innerHTML = lvTable();
    };

    // ── Row click: open detail modal ──
    window._openTS = function(id) {
      var ts = allTS.find(function(t) { return t.id === id; });
      if (!ts) return;
      var status = ts.status || 'Pending';
      var isPending = status === 'Pending' || status === 'Submitted';
      openModal({
        title: 'Timesheet — ' + v(ts.employee_name || ''),
        size: 'md',
        body: '<div class="field-grid">' +
          '<div class="field-item"><div class="field-label">Employee</div><div class="field-value fw-bold">' + v(ts.employee_name) + '</div></div>' +
          '<div class="field-item"><div class="field-label">Week Ending</div><div class="field-value mono">' + fmt.date(ts.week_ending) + '</div></div>' +
          '<div class="field-item"><div class="field-label">Project</div><div class="field-value">' + v(ts.project || ts.client_name, '—') + '</div></div>' +
          '<div class="field-item"><div class="field-label">Regular Hours</div><div class="field-value mono fw-bold">' + (ts.regular_hours || 0) + 'h</div></div>' +
          '<div class="field-item"><div class="field-label">Overtime Hours</div><div class="field-value mono">' + (ts.overtime_hours || 0) + 'h</div></div>' +
          '<div class="field-item"><div class="field-label">Total Hours</div><div class="field-value mono fw-bold">' + (ts.total_hours || 0) + 'h</div></div>' +
          '<div class="field-item"><div class="field-label">Status</div><div class="field-value">' + badge(status) + '</div></div>' +
          (ts.notes ? '<div class="field-item" style="grid-column:1/-1"><div class="field-label">Notes</div><div class="field-value">' + v(ts.notes) + '</div></div>' : '') +
          (ts.rejection_reason ? '<div class="field-item" style="grid-column:1/-1"><div class="field-label">Rejection Reason</div><div class="field-value" style="color:var(--danger)">' + v(ts.rejection_reason) + '</div></div>' : '') +
        '</div>' +
        (isPending ? '<div style="display:flex;gap:8px;margin-top:16px">' +
          '<button class="btn btn-primary" onclick="window._approveFromModal(' + id + ')">✓ Approve</button>' +
          '<button class="btn btn-danger" onclick="window._rejectFromModal(' + id + ')">✗ Reject</button>' +
          '</div>' : ''),
        submitLabel: null
      });
    };

    window._openLV = function(id) {
      var lv = allLV.find(function(l) { return l.id === id; });
      if (!lv) return;
      var status = lv.status || 'Pending';
      var isPending = status === 'Pending';
      openModal({
        title: 'Leave Request — ' + v(lv.employee_name || ''),
        size: 'md',
        body: '<div class="field-grid">' +
          '<div class="field-item"><div class="field-label">Employee</div><div class="field-value fw-bold">' + v(lv.employee_name) + '</div></div>' +
          '<div class="field-item"><div class="field-label">Leave Type</div><div class="field-value">' + badge(lv.leave_type || '—') + '</div></div>' +
          '<div class="field-item"><div class="field-label">From</div><div class="field-value mono">' + fmt.date(lv.from_date) + '</div></div>' +
          '<div class="field-item"><div class="field-label">To</div><div class="field-value mono">' + fmt.date(lv.to_date) + '</div></div>' +
          '<div class="field-item"><div class="field-label">Days</div><div class="field-value fw-bold">' + (lv.days || 1) + '</div></div>' +
          '<div class="field-item"><div class="field-label">Status</div><div class="field-value">' + badge(status) + '</div></div>' +
          (lv.reason ? '<div class="field-item" style="grid-column:1/-1"><div class="field-label">Reason</div><div class="field-value">' + v(lv.reason) + '</div></div>' : '') +
        '</div>' +
        (isPending ? '<div style="display:flex;gap:8px;margin-top:16px">' +
          '<button class="btn btn-primary" onclick="window._approveLeaveModal(' + id + ')">✓ Approve</button>' +
          '<button class="btn btn-danger" onclick="window._rejectLeaveModal(' + id + ')">✗ Reject</button>' +
          '</div>' : ''),
        submitLabel: null
      });
    };

    // ── Actions ──
    async function doApproveTS(id) {
      await put('/timesheets/' + id, { status: 'Approved' });
      allTS = allTS.map(function(t) { return t.id === id ? Object.assign({}, t, { status: 'Approved' }) : t; });
      toast('Timesheet approved', 'success');
      document.getElementById('aq-table').innerHTML = tsTable();
    }
    async function doRejectTS(id) {
      var reason = prompt('Rejection reason (required):');
      if (!reason || !reason.trim()) return;
      await put('/timesheets/' + id, { status: 'Rejected', rejection_reason: reason });
      allTS = allTS.map(function(t) { return t.id === id ? Object.assign({}, t, { status: 'Rejected' }) : t; });
      toast('Timesheet rejected', 'info');
      document.getElementById('aq-table').innerHTML = tsTable();
    }

    window._approve           = function(id) { doApproveTS(id); };
    window._reject            = function(id) { doRejectTS(id); };
    window._approveFromModal  = function(id) { document.querySelector('.modal-close') && document.querySelector('.modal-close').click(); doApproveTS(id); };
    window._rejectFromModal   = function(id) { document.querySelector('.modal-close') && document.querySelector('.modal-close').click(); doRejectTS(id); };

    window._approveLeave = async function(id) {
      await put('/my/leaves/' + id, { action: 'approve' });
      allLV = allLV.map(function(l) { return l.id === id ? Object.assign({}, l, { status: 'Approved' }) : l; });
      toast('Leave approved', 'success');
      document.getElementById('aq-table').innerHTML = lvTable();
    };
    window._rejectLeave = async function(id) {
      var reason = prompt('Rejection reason:');
      // Cancel on the prompt returns null — bail out instead of POSTing
      // a null reason (which silently rejected the leave with no message).
      if (!reason || !reason.trim()) return;
      await put('/my/leaves/' + id, { action: 'reject', reason: reason });
      allLV = allLV.map(function(l) { return l.id === id ? Object.assign({}, l, { status: 'Rejected' }) : l; });
      toast('Leave rejected', 'info');
      document.getElementById('aq-table').innerHTML = lvTable();
    };
    window._approveLeaveModal = function(id) { document.querySelector('.modal-close') && document.querySelector('.modal-close').click(); window._approveLeave(id); };
    window._rejectLeaveModal  = function(id) { document.querySelector('.modal-close') && document.querySelector('.modal-close').click(); window._rejectLeave(id); };

  } catch(e) { showError(e.message); }
}

// ── Timesheet Detail ─────────────────────────────────────────
export async function renderDetail({ id }) {
  showLoader();
  try {
    var ts = await get('/timesheets/' + id);
    var status = ts.status || 'Pending';
    var isDraft = status === 'In Progress' || status === 'Draft';
    setPageTitle('Timesheet #' + id, ts.employee_name || '');
    setBreadcrumb([{ label: 'Timesheets', url: '/timesheets' }, { label: '#' + id }]);
    setContent(
      '<div class="page-body"><div class="card" style="max-width:640px;margin:0 auto">' +
      '<div class="card-header"><h3 class="card-title">Timesheet Details</h3>' +
        (isDraft ? '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-primary btn-sm" onclick="window._submitDraft(' + id + ')">📤 Submit for Approval</button>' +
          '</div>' : '') +
      '</div>' +
      '<div class="card-body"><div class="field-grid">' +
        '<div class="field-item"><div class="field-label">Employee</div><div class="field-value fw-bold">' + v(ts.employee_name, '—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Week Ending</div><div class="field-value mono">' + fmt.date(ts.week_ending) + '</div></div>' +
        '<div class="field-item"><div class="field-label">Project / Client</div><div class="field-value">' + v(ts.project || ts.client_name, '—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Regular Hours</div><div class="field-value mono fw-bold">' + (ts.regular_hours || 0) + 'h</div></div>' +
        '<div class="field-item"><div class="field-label">Overtime Hours</div><div class="field-value mono">' + (ts.overtime_hours || 0) + 'h</div></div>' +
        '<div class="field-item"><div class="field-label">Total Hours</div><div class="field-value mono fw-bold">' + (ts.total_hours || 0) + 'h</div></div>' +
        '<div class="field-item"><div class="field-label">Bill Rate</div><div class="field-value mono">' + (ts.bill_rate ? '₹' + ts.bill_rate + '/hr' : '—') + '</div></div>' +
        '<div class="field-item"><div class="field-label">Status</div><div class="field-value">' + badge(status) + '</div></div>' +
        (ts.notes ? '<div class="field-item" style="grid-column:1/-1"><div class="field-label">Notes</div><div class="field-value">' + v(ts.notes) + '</div></div>' : '') +
        (ts.rejection_reason ? '<div class="field-item" style="grid-column:1/-1"><div class="field-label">Rejection Reason</div><div class="field-value" style="color:var(--danger)">' + v(ts.rejection_reason) + '</div></div>' : '') +
      '</div></div></div></div>'
    );
    if (isDraft) {
      window._submitDraft = async function(tsId) {
        if (!confirm('Submit this timesheet for approval?')) return;
        await put('/timesheets/' + tsId, { status: 'Submitted' });
        toast('Submitted for approval!', 'success');
        navigate('/timesheets/' + tsId);
      };
    }
  } catch(e) { showError(e.message); }
}


export async function renderNew() {
  setPageTitle('New Timesheet', 'Log your hours');
  setBreadcrumb([{ label:'Timesheets', url:'/timesheets' }, { label:'New' }]);
  showLoader();
  try {
    var masters = await get('/masters/all');
    var today = new Date().toISOString().split('T')[0];

    setContent(
      '<div class="page-body"><div class="card" style="max-width:760px;margin:0 auto">' +
      '<div class="card-header"><h3 class="card-title">Log Timesheet</h3></div>' +
      '<form id="ts-full-form"><div class="form-grid">' +
        '<div class="fg"><label class="flabel">Week Ending *</label>' +
          '<input class="finput" type="date" id="ts-week" name="week_ending" value="' + today + '" required></div>' +
        '<div class="fg"><label class="flabel">Client</label>' +
          '<select class="fselect" name="client_id"><option value="">None</option>' +
          (masters['clients-lookup'] || []).map(function(c){ return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="fg"><label class="flabel">Project</label>' +
          '<input class="finput" name="project" placeholder="Project name"></div>' +
        '<div class="fg"><label class="flabel">Regular Hours *</label>' +
          '<input class="finput" type="number" id="ts-reg" name="regular_hours" value="40" min="0" max="80" step="0.5" required oninput="window._calcTS()"></div>' +
        '<div class="fg"><label class="flabel">Overtime Hours</label>' +
          '<input class="finput" type="number" id="ts-ot" name="overtime_hours" value="0" min="0" step="0.5" oninput="window._calcTS()"></div>' +
        '<div class="fg"><label class="flabel">Total Hours</label>' +
          '<input class="finput mono fw-bold" id="ts-total" value="40" readonly style="background:var(--bg)"></div>' +
        '<div class="fg"><label class="flabel">Bill Rate (₹/hr)</label>' +
          '<input class="finput" type="number" name="bill_rate" value="0" min="0"></div>' +
        '<div class="fg full"><label class="flabel">Notes</label>' +
          '<textarea class="finput" name="notes" rows="3" placeholder="Work done this week…"></textarea></div>' +
      '</div></form>' +
      '<div class="form-actions">' +
        '<button class="btn btn-ghost" onclick="navigateTo(&apos;/timesheets&apos;)">Cancel</button>' +
        '<button class="btn btn-secondary" onclick="window._saveTS(&apos;In Progress&apos;)">💾 Save Draft</button>' +
        '<button class="btn btn-primary" onclick="window._saveTS(&apos;Submitted&apos;)">📤 Submit for Approval</button>' +
      '</div></div></div>'
    );

    window._calcTS = function() {
      var reg = parseFloat(document.getElementById('ts-reg').value) || 0;
      var ot  = parseFloat(document.getElementById('ts-ot').value) || 0;
      document.getElementById('ts-total').value = (reg + ot).toFixed(1);
    };

    window._saveTS = async function(status) {
      var data = Object.fromEntries(new FormData(document.getElementById('ts-full-form')));
      data.status = status;
      data.total_hours = parseFloat(document.getElementById('ts-total').value) || 0;
      try {
        await post('/my/timesheets', data);
        toast(status === 'In Progress' ? 'Draft saved!' : 'Submitted for approval!', 'success');
        navigate('/timesheets');
      } catch(e) { toast(e.message || 'Error saving timesheet', 'error'); }
    };
  } catch(e) { showError(e.message); }
}
