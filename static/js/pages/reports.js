/**
 * Reports — No template literals
 */
import { get } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError, fmt } from '../ui.js';

var REPORTS = [
  { key: 'workforce',    label: 'Workforce',    icon: '👥', desc: 'Employee headcount, tenure, department breakdown' },
  { key: 'recruitment',  label: 'Recruitment',  icon: '📋', desc: 'Hiring funnel, time-to-fill, sources' },
  { key: 'timesheets',   label: 'Timesheets',   icon: '⏱', desc: 'Hours logged, utilisation, billing' },
  { key: 'invoices',     label: 'Invoices',     icon: '🧾', desc: 'Revenue, outstanding, collection rate' },
  { key: 'leaves',       label: 'Leave',        icon: '🌴', desc: 'Leave balance, approvals, trends' },
];

export async function renderHome() {
  setPageTitle('Reports', 'Business insights');
  setBreadcrumb([{ label: 'Reports' }]);
  setContent(
    '<div class="page-body"><div class="reports-grid">' +
    REPORTS.map(function(r) {
      return '<div class="report-card" onclick="navigateTo(\'/reports/' + r.key + '\')">' +
        '<div class="report-icon">' + r.icon + '</div>' +
        '<div class="report-title">' + r.label + '</div>' +
        '<div class="report-desc">' + r.desc + '</div>' +
        '<div class="report-arrow">View report →</div>' +
      '</div>';
    }).join('') +
    '</div></div>'
  );
}

export async function renderReport({ key }) {
  var report = REPORTS.find(function(r) { return r.key === key; });
  var label = report ? report.label : key;
  setPageTitle(label + ' Report', 'Analytics');
  setBreadcrumb([{ label: 'Reports', url: '/reports' }, { label: label }]);
  showLoader();
  try {
    var data = await get('/reports/' + key);
    var rows = data.items || data || [];
    setContent(
      '<div class="page-body"><div class="card">' +
      '<div class="card-header"><h3 class="card-title">' + label + ' Report</h3></div>' +
      '<div class="card-body">' +
      (rows.length
        ? '<div class="tbl-wrap"><table class="data-table"><thead><tr>' +
          Object.keys(rows[0] || {}).slice(0, 6).map(function(k) {
            return '<th>' + k.replace(/_/g, ' ') + '</th>';
          }).join('') +
          '</tr></thead><tbody>' +
          rows.slice(0, 50).map(function(row) {
            return '<tr>' + Object.keys(rows[0]).slice(0, 6).map(function(k) {
              return '<td>' + (row[k] !== null && row[k] !== undefined ? String(row[k]) : '—') + '</td>';
            }).join('') + '</tr>';
          }).join('') +
          '</tbody></table></div>'
        : '<div class="empty-mini">No data available for this report</div>'
      ) +
      '</div></div></div>'
    );
  } catch(e) { showError(e.message); }
}
