import { get }                    from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError, fmt, badge } from '../ui.js';

export async function render() {
  setPageTitle('Dashboard', 'Welcome back');
  setBreadcrumb([{ label: 'Dashboard' }]);
  showLoader();
  try {
    const d = await get('/reports/dashboard');
    setContent('
      <div class="page-body">
        <!-- KPI Row -->
        <div class="kpi-grid">
          '+kpi('Employees',          d.employees,          '👥', 'green',  '/employees')+'
          '+kpi('Open Jobs',          d.open_jobs,          '📝', 'blue',   '/recruitment/jobs')+'
          '+kpi('Pending Timesheets', d.pending_ts,         '⏱', 'amber',  '/timesheets')+'
          '+kpi('Overdue Invoices',   d.pending_invoices,   '🧾', 'red',    '/invoices')+'
        </div>

        <div class="dashboard-grid">
          <!-- Recruitment Pipeline -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Recruitment Pipeline</h3>
              <a href="#/recruitment/pipeline" class="card-link">View all →</a>
            </div>
            <div class="pipeline-bars">
              ${(d.pipeline || []).map(s => '
                <div class="pipeline-row">
                  <div class="pipeline-label">${s.stage}</div>
                  <div class="pipeline-bar-wrap">
                    <div class="pipeline-bar" style="width:${Math.min(100, s.count * 10)}%;background:${s.color}"></div>
                  </div>
                  <div class="pipeline-count">${s.count}</div>
                </div>').join('')}
            </div>
          </div>

          <!-- Recent Hires -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Recent Hires</h3>
              <a href="#/employees" class="card-link">View all →</a>
            </div>
            ${(d.recent_hires || []).length ? '
              <div class="recent-list">
                ${d.recent_hires.map(e => '
                  <a class="recent-item" href="#/employees/'+e.id+'">
                    <div class="av av-sm av-green">'+fmt.ini(e.name)+'</div>
                    <div class="recent-info">
                      <div class="recent-name">'+e.name+'</div>
                      <div class="recent-sub">'+e.job_title || '—'+'</div>
                    </div>
                    <div class="recent-date">'+fmt.date(e.start_date)+'</div>
                  </a>').join('')}
              </div>' : '<div class="empty-mini">No recent hires</div>'}
          </div>

          <!-- Overdue Invoices -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Overdue Invoices</h3>
              <a href="#/invoices" class="card-link">View all →</a>
            </div>
            ${(d.overdue_invoices || []).length ? '
              <div class="recent-list">
                ${d.overdue_invoices.map(i => '
                  <div class="recent-item">
                    <div class="recent-info">
                      <div class="recent-name">'+i.invoice_number+'</div>
                      <div class="recent-sub">'+i.client+'</div>
                    </div>
                    <div style="text-align:right">
                      <div class="amount-red">'+fmt.money(i.total_amount)+'</div>
                      <div class="recent-sub">Due '+fmt.date(i.due_date)+'</div>
                    </div>
                  </div>').join('')}
              </div>' : '<div class="empty-mini">No overdue invoices ✓</div>'}
          </div>
        </div>
      </div>');
  } catch (e) { showError(e.message); }
}

function kpi(label, value, icon, color, link) {
  return '<a class="kpi-card kpi-'+color+'" href="#'+link+'">
    <div class="kpi-icon">'+icon+'</div>
    <div class="kpi-body">
      <div class="kpi-value">'+value ?? 0+'</div>
      <div class="kpi-label">'+label+'</div>
    </div>
  </a>';
}
