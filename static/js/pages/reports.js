import { get }             from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         fmt, badge } from '../ui.js';
import { navigate }        from '../router.js';

const REPORTS = [
  { key: 'workforce',   icon: '👥', label: 'Workforce Report',      desc: 'Headcount by department, type, status' },
  { key: 'recruitment', icon: '🎯', label: 'Recruitment Funnel',    desc: 'Pipeline stages, source mix, offer stats' },
  { key: 'timesheets',  icon: '⏱', label: 'Timesheet Utilization', desc: 'Hours by employee, project, status' },
  { key: 'invoices',    icon: '🧾', label: 'Invoice & AR Report',   desc: 'Aging, by-client, outstanding' },
  { key: 'leaves',      icon: '🏖', label: 'Leave Summary',         desc: 'Leave requests by type and status' },
];

export async function renderHome() {
  setPageTitle('Reports', 'Analytics & insights');
  setBreadcrumb([{ label: 'Reports' }]);
  setContent(`
    <div class="page-body">
      <div class="reports-grid">
        ${REPORTS.map(r => `
          <div class="report-card" onclick="navigateTo('/reports/${r.key}')">
            <div class="report-icon">${r.icon}</div>
            <div class="report-title">${r.label}</div>
            <div class="report-desc">${r.desc}</div>
            <div class="report-arrow">View Report →</div>
          </div>`).join('')}
      </div>
    </div>`);
}

export async function renderReport({ type }) {
  const def = REPORTS.find(r => r.key === type) || { label: type, icon: '📊' };
  setPageTitle(def.label, '');
  setBreadcrumb([{ label: 'Reports', url: '/reports' }, { label: def.label }]);
  showLoader();
  try {
    const data = await get(`/reports/${type}`);
    renderReportData(type, data);
  } catch (e) { showError(e.message); }
}

function renderReportData(type, d) {
  if (type === 'workforce') {
    setContent(`<div class="page-body">
      <div class="report-grid-2">
        ${chart('By Department', d.by_department, 'department', 'count', 'green')}
        ${chart('By Status',     d.by_status,     'status',     'count', 'blue')}
        ${chart('By Employment Type', d.by_employment_type, 'type', 'count', 'purple')}
        ${chart('By Location',   d.by_location,   'location',   'count', 'amber')}
      </div>
    </div>`);
  } else if (type === 'invoices') {
    const s = d.summary || {};
    setContent(`<div class="page-body">
      <div class="kpi-grid kpi-3">
        ${kpi('Total Invoiced',   fmt.money(s.total_invoiced), '🧾','blue')}
        ${kpi('Collected',        fmt.money(s.total_collected),'✅','green')}
        ${kpi('Outstanding',      fmt.money(s.total_outstanding),'⚠️','red')}
      </div>
      ${chart('By Client (Top 20)', d.by_client, 'client', 'total_amount', 'blue')}
    </div>`);
  } else if (type === 'recruitment') {
    setContent(`<div class="page-body">
      <div class="report-grid-2">
        ${chart('Pipeline by Stage',  d.by_stage,  'name',   'count',   'blue')}
        ${chart('By Source',          d.by_source, 'source', 'count',   'green')}
        ${chart('Open Jobs by Client',d.open_jobs_by_client,'client','open_jobs','purple')}
      </div>
    </div>`);
  } else if (type === 'timesheets') {
    setContent(`<div class="page-body">
      ${chart('By Status',  d.by_status,  'status',  'total_hours', 'amber')}
      ${chart('By Project', d.by_project, 'project', 'total_hours', 'blue')}
    </div>`);
  } else if (type === 'leaves') {
    setContent(`<div class="page-body">
      <div class="report-grid-2">
        ${chart('By Type',   d.by_type,   'leave_type','total_days','green')}
        ${chart('By Status', d.by_status, 'status',    'count',    'amber')}
      </div>
    </div>`);
  }
}

function chart(title, rows, labelKey, valueKey, color) {
  if (!rows?.length) return `<div class="card"><div class="card-header"><h3 class="card-title">${title}</h3></div><div class="empty-mini">No data</div></div>`;
  const max = Math.max(...rows.map(r => parseFloat(r[valueKey])||0), 1);
  return `<div class="card">
    <div class="card-header"><h3 class="card-title">${title}</h3></div>
    <div class="card-body report-chart">
      ${rows.slice(0,15).map(r => {
        const v = parseFloat(r[valueKey])||0;
        const pct = Math.round(v/max*100);
        return `<div class="report-row">
          <div class="report-label">${r[labelKey]||'—'}</div>
          <div class="report-bar-wrap">
            <div class="report-bar report-bar-${color}" style="width:${pct}%"></div>
          </div>
          <div class="report-val">${typeof v === 'number' && v > 1000 ? fmt.money(v) : v}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}
function kpi(l,v,icon,c) { return `<div class="kpi-card kpi-${c}"><div class="kpi-icon">${icon}</div><div class="kpi-body"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div></div>`; }
