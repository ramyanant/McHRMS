/**
 * Employee Self-Service Portal — No template literals, no optional chaining
 */
import { get, post } from '../api.js';
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
function fld(l, val, mono) {
  return '<div class="field-item"><div class="field-label">' + l + '</div>' +
    '<div class="field-value' + (val ? '' : ' empty') + (mono ? ' mono' : '') + '">' + v(val, '—') + '</div></div>';
}

export async function renderDashboard() {
  setPageTitle('My Dashboard', 'Employee self-service');
  setBreadcrumb([{ label: 'My Portal' }]);
  showLoader();
  try {
    var emp = await get('/portal/dashboard');
    var e = emp || {};
    var name = (e.first_name || '') + ' ' + (e.last_name || '');

    setContent(
      '<div class="page-body">' +
      '<div class="detail-layout">' +
        '<div class="detail-sidebar"><div class="card">' +
          '<div class="profile-hero" style="background:linear-gradient(135deg,#1a5c2e,#144825)">' +
            '<div class="av av-xl av-green" style="margin:0 auto 10px">' + fmt.ini(name) + '</div>' +
            '<div class="profile-name">' + v(name) + '</div>' +
            '<div class="profile-title" style="color:rgba(255,255,255,.75)">' + v(e.job_title || 'Employee') + '</div>' +
            '<div style="margin-top:8px">' + badge(e.status || 'Active') + '</div>' +
          '</div>' +
          '<div class="profile-meta">' +
            '<div class="meta-row"><span>Employee ID</span><strong class="mono">' + v(e.emp_id, '—') + '</strong></div>' +
            '<div class="meta-row"><span>Department</span><strong>' + v(e.department_name, '—') + '</strong></div>' +
            '<div class="meta-row"><span>Manager</span><strong>' + v(e.reporting_manager_name, '—') + '</strong></div>' +
            '<div class="meta-row"><span>Start Date</span><strong>' + fmt.date(e.start_date) + '</strong></div>' +
          '</div>' +
          '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">' +
            '<button class="btn btn-primary btn-full" onclick="navigateTo(\'/portal/timesheets\')">📋 My Timesheets</button>' +
            '<button class="btn btn-ghost btn-full" onclick="navigateTo(\'/portal/leaves\')">🌴 My Leaves</button>' +
            '<button class="btn btn-ghost btn-full" onclick="navigateTo(\'/portal/payslips\')">💰 My Payslips</button>' +
          '</div>' +
        '</div></div>' +
        '<div class="detail-main">' +
          '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
            kpi('Leave Balance', (e.leave_balance || 0) + ' days', '🌴', 'green') +
            kpi('Pending TSs', e.pending_ts || 0, '⏱', 'amber') +
            kpi('Approved TSs', e.approved_ts || 0, '✅', 'blue') +
            kpi('Notifications', e.notifications || 0, '🔔', 'purple') +
          '</div>' +
          '<div class="card">' +
            '<div class="card-header"><h3 class="card-title">Quick Actions</h3></div>' +
            '<div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap">' +
              '<button class="btn btn-primary" onclick="navigateTo(\'/portal/timesheets\')">+ Submit Timesheet</button>' +
              '<button class="btn btn-ghost" onclick="navigateTo(\'/portal/leaves\')">+ Apply Leave</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div></div>'
    );
  } catch(e) { showError(e.message); }
}

function kpi(l, val, icon, c) {
  return '<div class="kpi-card kpi-' + c + '"><div class="kpi-icon">' + icon + '</div>' +
    '<div class="kpi-body"><div class="kpi-value">' + val + '</div><div class="kpi-label">' + l + '</div></div></div>';
}

export async function renderProfile() {
  setPageTitle('My Profile', 'Personal information');
  setBreadcrumb([{ label: 'My Portal' }, { label: 'Profile' }]);
  showLoader();
  try {
    var e = await get('/portal/dashboard');
    setContent(
      '<div class="page-body"><div class="card" style="max-width:700px;margin:0 auto">' +
      '<div class="card-header"><h3 class="card-title">My Profile</h3></div>' +
      '<div class="card-body"><div class="field-grid">' +
        fld('Full Name', (e.first_name || '') + ' ' + (e.last_name || '')) +
        fld('Employee ID', e.emp_id, true) +
        fld('Email', e.email) + fld('Phone', e.phone) +
        fld('Department', e.department_name) + fld('Job Title', e.job_title) +
        fld('Manager', e.reporting_manager_name) + fld('Start Date', fmt.date(e.start_date)) +
      '</div></div></div></div>'
    );
  } catch(e) { showError(e.message); }
}

export async function renderTimesheets() {
  setPageTitle('My Timesheets', '');
  setBreadcrumb([{ label: 'My Portal' }, { label: 'Timesheets' }]);
  showLoader();
  try {
    var data = await get('/my/timesheets');
    var rows = Array.isArray(data) ? data : [];
    var masters = await get('/masters/all');

    setContent(
      '<div class="page-body">' +
      '<div class="list-toolbar"><div></div>' +
        '<button class="btn btn-primary" onclick="window._newTS()">+ Submit Timesheet</button>' +
      '</div>' +
      (rows.length
        ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
          '<th>Week Ending</th><th>Project/Client</th><th>Hours</th><th>Status</th>' +
          '</tr></thead><tbody>' +
          rows.map(function(t) {
            return '<tr>' +
              '<td class="mono">' + fmt.date(t.week_ending) + '</td>' +
              '<td>' + v(t.project || t.client_name, '—') + '</td>' +
              '<td class="mono fw-bold">' + (t.total_hours || 0) + 'h</td>' +
              '<td>' + badge(t.status || 'Pending') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table></div></div>'
        : '<div class="empty-state"><div class="empty-icon">⏱</div><div class="empty-title">No timesheets yet</div></div>'
      ) +
      '</div>'
    );

    window._newTS = function() {
      openModal({
        title: '+ Submit Timesheet', size: 'md',
        body: '<form id="my-ts-form" class="form-grid-sm">' +
          '<div class="fg"><label class="flabel">Week Ending *</label><input class="finput" type="date" name="week_ending" required></div>' +
          '<div class="fg"><label class="flabel">Regular Hours *</label><input class="finput" type="number" name="regular_hours" value="40" min="0" max="80" step="0.5" required></div>' +
          '<div class="fg"><label class="flabel">Overtime Hours</label><input class="finput" type="number" name="overtime_hours" value="0" min="0" step="0.5"></div>' +
          '<div class="fg"><label class="flabel">Project</label><input class="finput" name="project" placeholder="Project name"></div>' +
          '<div class="fg"><label class="flabel">Client</label><select class="fselect" name="client_id"><option value="">None</option>' +
            opts(masters['clients-lookup'] || [], null) + '</select></div>' +
          '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2"></textarea></div>' +
          '</form>',
        submitLabel: 'Submit for Approval',
        onSubmit: async function() {
          try {
            await post('/my/timesheets', fd('my-ts-form'));
            toast('Submitted for manager approval', 'success');
            renderTimesheets();
          } catch(e) { toast(e.message, 'error'); }
        }
      });
    };
  } catch(e) { showError(e.message); }
}

export async function renderLeaves() {
  setPageTitle('My Leaves', '');
  setBreadcrumb([{ label: 'My Portal' }, { label: 'Leaves' }]);
  showLoader();
  try {
    var data = await get('/my/leaves');
    var rows = Array.isArray(data) ? data : [];
    var bal  = await get('/my/leave-balance');

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Total Days',  bal.total || 18, '📅', 'blue') +
        kpi('Taken',       bal.taken || 0,  '✅', 'green') +
        kpi('Pending',     bal.pending || 0,'⏳', 'amber') +
        kpi('Balance',     bal.balance || 18,'💚','purple') +
      '</div>' +
      '<div class="list-toolbar"><div></div>' +
        '<button class="btn btn-primary" onclick="window._applyLeave()">+ Apply Leave</button>' +
      '</div>' +
      (rows.length
        ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
          '<th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th>' +
          '</tr></thead><tbody>' +
          rows.map(function(l) {
            return '<tr>' +
              '<td>' + v(l.leave_type, '—') + '</td>' +
              '<td class="mono">' + fmt.date(l.from_date) + '</td>' +
              '<td class="mono">' + fmt.date(l.to_date) + '</td>' +
              '<td>' + (l.days || 1) + '</td>' +
              '<td class="text-muted">' + v(l.reason, '—') + '</td>' +
              '<td>' + badge(l.status || 'Pending') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table></div></div>'
        : '<div class="empty-state"><div class="empty-icon">🌴</div><div class="empty-title">No leave requests</div></div>'
      ) +
      '</div>'
    );

    window._applyLeave = function() {
      openModal({
        title: '+ Apply Leave', size: 'md',
        body: '<form id="leave-form" class="form-grid-sm">' +
          '<div class="fg"><label class="flabel">Leave Type *</label>' +
            '<select class="fselect" name="leave_type" required>' +
            opts(['Annual Leave','Sick Leave','Casual Leave','Maternity','Paternity','Compensatory','Unpaid'], null) +
            '</select></div>' +
          '<div class="fg"><label class="flabel">From Date *</label><input class="finput" type="date" name="from_date" required></div>' +
          '<div class="fg"><label class="flabel">To Date *</label><input class="finput" type="date" name="to_date" required></div>' +
          '<div class="fg full"><label class="flabel">Reason</label><textarea class="finput" name="reason" rows="2"></textarea></div>' +
          '</form>',
        submitLabel: 'Apply',
        onSubmit: async function() {
          try {
            await post('/my/leaves', fd('leave-form'));
            toast('Leave application submitted', 'success');
            renderLeaves();
          } catch(e) { toast(e.message, 'error'); }
        }
      });
    };
  } catch(e) { showError(e.message); }
}

export async function renderPayslips() {
  setPageTitle('My Payslips', '');
  setBreadcrumb([{ label: 'My Portal' }, { label: 'Payslips' }]);
  setContent('<div class="page-body"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">Payslip module coming soon</div></div></div>');
}

export async function renderTeam() {
  setPageTitle('My Team', '');
  setBreadcrumb([{ label: 'My Portal' }, { label: 'Team' }]);
  showLoader();
  try {
    var data = await get('/portal/team');
    var members = Array.isArray(data) ? data : [];
    setContent(
      '<div class="page-body">' +
      (members.length
        ? '<div class="struct-grid">' +
          members.map(function(m) {
            var name = (m.first_name || '') + ' ' + (m.last_name || '');
            return '<div class="struct-card">' +
              '<div class="av av-lg av-green" style="margin:0 auto 8px">' + fmt.ini(name) + '</div>' +
              '<div class="struct-card-title">' + v(name) + '</div>' +
              '<div class="struct-card-desc">' + v(m.job_title, '—') + '</div>' +
              badge(m.status || 'Active') +
            '</div>';
          }).join('') +
          '</div>'
        : '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No team members</div></div>'
      ) +
      '</div>'
    );
  } catch(e) { showError(e.message); }
}

export async function renderApprovals() {
  navigate('/timesheets/approvals');
}
