/**
 * Dashboard — No template literals, no optional chaining
 */
import { get } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError, fmt, badge } from '../ui.js';

function kpi(label, value, icon, color, href) {
  var safe_val = (value === null || value === undefined) ? '0' : String(value);
  return '<div class="kpi-card kpi-' + color + '" onclick="navigateTo(\'' + href + '\')" style="cursor:pointer">' +
    '<div class="kpi-icon">' + icon + '</div>' +
    '<div class="kpi-body"><div class="kpi-value">' + safe_val + '</div>' +
    '<div class="kpi-label">' + label + '</div></div></div>';
}

export async function render() {
  // Employee role should use the portal, not admin dashboard
  const { getUser } = await import('../app.js');
  const u = getUser && getUser();
  if (u && u.role === 'Employee') {
    const { navigate } = await import('../router.js');
    navigate('/portal');
    return;
  }
  setPageTitle('Dashboard', 'Welcome back');
  setBreadcrumb([{ label: 'Dashboard' }]);
  showLoader();
  try {
    var d = await get('/reports/dashboard');

    var pipeline = d.pipeline || [];
    var maxCount = pipeline.reduce(function(m, s) { return Math.max(m, s.count || 0); }, 1);

    var pipelineHTML = pipeline.map(function(s) {
      var pct = Math.min(100, Math.round((s.count || 0) / maxCount * 100));
      return '<div class="pipeline-row">' +
        '<div class="pipeline-label">' + (s.stage || s.name || '') + '</div>' +
        '<div class="pipeline-bar-wrap">' +
          '<div class="pipeline-bar" style="width:' + pct + '%;background:var(--brand)"></div>' +
        '</div>' +
        '<div class="pipeline-count">' + (s.count || 0) + '</div>' +
      '</div>';
    }).join('');

    var hires = d.recent_hires || [];
    var hiresHTML = hires.length
      ? hires.map(function(e) {
          var fullName  = e.name || ((e.first_name || '') + ' ' + (e.last_name || '')).trim() || 'Unknown';
          var initials  = fullName.split(' ').filter(Boolean).map(function(w){ return w[0].toUpperCase(); }).slice(0,2).join('');
          var startDate = e.start_date ? new Date(e.start_date).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '';
          return '<div class="hire-row" onclick="navigateTo(\'/employees/'+e.id+'\')" style="cursor:pointer">' +
            fmt.avatar(fullName, e.photo_url, 'av-sm') +
            '<div class="hire-info"><div class="hire-name">' + fullName + '</div>' +
            '<div class="hire-title">' + (e.job_title || '—') + '</div></div>' +
            '<div class="hire-date">' + startDate + '</div>' +
            '</div>';
        }).join('')
      : '<div class="empty-mini">No recent hires</div>';

    var alerts = d.alerts || [];
    var alertsHTML = alerts.length
      ? alerts.map(function(a) {
          return '<div class="alert-row alert-' + (a.type || 'info') + '">' +
            '<span>' + (a.icon || 'ℹ') + '</span>' +
            '<span>' + (a.message || '') + '</span>' +
          '</div>';
        }).join('')
      : '<div class="empty-mini">No pending alerts</div>';

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid">' +
        kpi('Employees',          d.employees,          '👥', 'green',  '/employees') +
        kpi('Open Jobs',          d.open_jobs,          '📝', 'blue',   '/recruitment/jobs') +
        kpi('Pending Timesheets', d.pending_ts,         '⏱', 'amber',  '/timesheets') +
        kpi('Overdue Invoices',   d.pending_invoices,   '🧾', 'red',    '/invoices') +
      '</div>' +
      '<div class="dashboard-grid">' +
        '<div class="card">' +
          '<div class="card-header"><h3 class="card-title">Recruitment Pipeline</h3>' +
            '<a href="#/recruitment/pipeline" class="card-link">View all →</a></div>' +
          '<div class="pipeline-bars">' + (pipelineHTML || '<div class="empty-mini">No pipeline data</div>') + '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><h3 class="card-title">Recent Hires</h3>' +
            '<a href="#/employees" class="card-link">View all →</a></div>' +
          '<div class="hire-list">' + hiresHTML + '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><h3 class="card-title">Pending Actions</h3></div>' +
          '<div class="alert-list">' + alertsHTML + '</div>' +
        '</div>' +
      '</div>' +
      '</div>'
    );
  } catch(e) { showError(e.message); }
}
