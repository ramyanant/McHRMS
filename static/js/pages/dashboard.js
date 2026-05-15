import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt } from '../utils.js';
import { pillStatus } from '../components/table.js';

export async function renderDashboard() {
  const d = await API.dashboard();
  if (!d) return;

  setContent(`
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top-color:var(--green)">
        <div class="kpi-label">Active Employees</div>
        <div class="kpi-value">${d.employees||0}</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--blue)">
        <div class="kpi-label">Open Jobs</div>
        <div class="kpi-value">${d.open_jobs||0}</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--amber)">
        <div class="kpi-label">Pending Timesheets</div>
        <div class="kpi-value">${d.pending_ts||0}</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--red)">
        <div class="kpi-label">Overdue Invoices</div>
        <div class="kpi-value">${d.pending_invoices||0}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header"><div class="card-title">Recruitment Pipeline</div></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
          ${(d.pipeline||[]).map(s => `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:10px;height:10px;border-radius:50%;background:${s.color||'#6b7280'};flex-shrink:0"></div>
              <div style="flex:1;font-size:13px">${s.stage}</div>
              <div style="font-weight:700;font-size:14px">${s.count}</div>
            </div>`).join('')}
          ${!(d.pipeline||[]).length ? '<div style="color:var(--txt3);font-size:13px">No pipeline data</div>' : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Overdue Invoices</div>
          <a href="#/invoices" class="btn btn-ghost btn-sm">View all</a>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Due</th></tr></thead>
            <tbody>
              ${(d.overdue_invoices||[]).map(i=>`<tr>
                <td><a href="#/invoices/${i.id}" class="td-mono">${i.invoice_number}</a></td>
                <td>${i.client}</td>
                <td>${fmt.inr(i.total_amount)}</td>
                <td style="color:var(--red)">${fmt.date(i.due_date)}</td>
              </tr>`).join('')}
              ${!(d.overdue_invoices||[]).length?'<tr><td colspan="4" style="text-align:center;color:var(--txt3)">None overdue</td></tr>':''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <div class="card-title">Recent Hires</div>
        <a href="#/employees" class="btn btn-ghost btn-sm">View all</a>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Emp ID</th><th>Name</th><th>Title</th><th>Start Date</th></tr></thead>
          <tbody>
            ${(d.recent_hires||[]).map(e=>`<tr>
              <td><a href="#/employees/${e.id}" class="td-mono">${e.emp_id||'—'}</a></td>
              <td><a href="#/employees/${e.id}">${e.name}</a></td>
              <td style="color:var(--txt2)">${e.job_title||'—'}</td>
              <td>${fmt.date(e.start_date)}</td>
            </tr>`).join('')}
            ${!(d.recent_hires||[]).length?'<tr><td colspan="4" style="text-align:center;color:var(--txt3)">No recent hires</td></tr>':''}
          </tbody>
        </table>
      </div>
    </div>
  `);
}
