import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

export async function renderTimesheets(mode='timesheets') {
  if (mode === 'leaves') return renderLeaves();

  const data = await API.timesheets({ per_page:50 });
  const rows = Array.isArray(data) ? data : (data?.items || []);

  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Timesheets</div>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr>
          <th>Employee</th><th>Week Ending</th><th>Project</th>
          <th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th>
          <th>Total</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${rows.map(t=>`<tr>
            <td>${t.employee_name||'—'}<br><small class="td-mono" style="color:var(--txt3)">${t.emp_id||''}</small></td>
            <td class="td-mono">${fmt.date(t.week_ending)}</td>
            <td>${t.project_name||t.client_name||'—'}</td>
            <td class="td-mono">${t.mon||0}</td><td class="td-mono">${t.tue||0}</td>
            <td class="td-mono">${t.wed||0}</td><td class="td-mono">${t.thu||0}</td>
            <td class="td-mono">${t.fri||0}</td>
            <td class="td-mono" style="font-weight:700">${t.total_hours||0}h</td>
            <td>${pillStatus(t.status||'Pending')}</td>
          </tr>`).join('')}
          ${!rows.length?'<tr><td colspan="10"><div class="empty-state"><div class="empty-state-title">No timesheets</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
}

async function renderLeaves() {
  const data = await API.rptLeaves().catch(()=>({pending:[]}));
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Leave Management</div>
    </div>
    <div class="kpi-grid">
      ${(data.by_type||[]).map(l=>`
        <div class="kpi-card">
          <div class="kpi-label">${l.leave_type}</div>
          <div class="kpi-value">${l.requests}</div>
          <div class="kpi-sub">${l.total_days} days total</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Pending Leave Requests</div></div>
      <div class="table-container"><table>
        <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Actions</th></tr></thead>
        <tbody>
          ${(data.pending||[]).map(l=>`<tr>
            <td>${l.employee_name}<br><small class="td-mono" style="color:var(--txt3)">${l.emp_id||''}</small></td>
            <td>${l.leave_type}</td>
            <td class="td-mono">${fmt.date(l.from_date)}</td>
            <td class="td-mono">${fmt.date(l.to_date)}</td>
            <td class="td-mono" style="font-weight:700">${l.days}</td>
            <td>${l.reason||'—'}</td>
            <td>
              <button class="btn btn-primary btn-xs" onclick="window._approveLeave(${l.id})">✓ Approve</button>
              <button class="btn btn-danger btn-xs" onclick="window._rejectLeave(${l.id})">✗ Reject</button>
            </td>
          </tr>`).join('')}
          ${!data.pending?.length?'<tr><td colspan="7" style="text-align:center;color:var(--txt3)">No pending requests</td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);

  window._approveLeave = async (id) => {
    try { await API.updateLeave(id,{action:'approve'}); toast('Approved','success'); renderLeaves(); }
    catch(e) { toast(e.message,'error'); }
  };
  window._rejectLeave = async (id) => {
    const reason = prompt('Reason for rejection:');
    if (reason===null) return;
    try { await API.updateLeave(id,{action:'reject',reason}); toast('Rejected','info'); renderLeaves(); }
    catch(e) { toast(e.message,'error'); }
  };
}
