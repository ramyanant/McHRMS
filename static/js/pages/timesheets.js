import { get, put }        from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         toast, badge, fmt, renderTable, renderPagination } from '../ui.js';
import { navigate }        from '../router.js';

export async function renderList() {
  setPageTitle('Timesheets', 'All timesheet records');
  setBreadcrumb([{ label: 'Timesheets' }]);
  showLoader();
  try {
    const data = await get('/timesheets');
    const rows = data.items || [];
    setContent('
      <div class="page-body">
        <div class="list-toolbar">
          <div class="status-filters">
            ${['All','Pending','Approved','Rejected'].map(s =>
              '<button class="filter-btn ${s==='All'?'active':''}">${s}</button>').join('')}
          </div>
          <a href="#/timesheets/approval" class="btn btn-ghost">My Approval Queue</a>
        </div>
        ${renderTable({
          columns: [
            { label: 'Employee',    key: 'employee_name', render: r => '<strong>${r.employee_name}</strong><div class="cell-sub">${r.emp_id||''}</div>' },
            { label: 'Week Ending', key: 'week_ending',   render: r => '<span class="mono">${fmt.date(r.week_ending)}</span>' },
            { label: 'Project',     key: 'project_name',  render: r => r.project_name||r.client_name||'—' },
            { label: 'Mon',  key: 'mon', render: r => r.mon||0 },
            { label: 'Tue',  key: 'tue', render: r => r.tue||0 },
            { label: 'Wed',  key: 'wed', render: r => r.wed||0 },
            { label: 'Thu',  key: 'thu', render: r => r.thu||0 },
            { label: 'Fri',  key: 'fri', render: r => r.fri||0 },
            { label: 'Total', key: 'total_hours', render: r => '<strong class="mono">${r.total_hours||0}h</strong>' },
            { label: 'Status', key: 'status',     render: r => badge(r.status||'Pending') },
          ],
          rows,
          onRowClick: r => navigate('/timesheets/${r.id}'),
          emptyMessage: 'No timesheets found',
        })}
      </div>');
  } catch (e) { showError(e.message); }
}

export async function renderApproval() {
  setPageTitle('Timesheet Approvals', 'Pending review');
  setBreadcrumb([{ label: 'Timesheets', url: '/timesheets' }, { label: 'Approvals' }]);
  showLoader();
  try {
    const d = await get('/timesheets/pending-approvals');
    const ts = d.timesheets || [];
    setContent('
      <div class="page-body">
        <div class="page-lead">'+ts.length+' pending timesheet'+ts.length!==1?'s':''+'</div>
        ${ts.length ? '<div class="card"><div class="tbl-wrap"><table class="data-table">
          <thead><tr><th>Employee</th><th>Week Ending</th><th>Total</th><th>Project</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>${ts.map(t=>'<tr>
            <td><strong>'+t.employee_name+'</strong><div class="cell-sub">'+t.emp_id+'</div></td>
            <td class="mono">'+fmt.date(t.week_ending)+'</td>
            <td class="mono fw-bold">'+t.total_hours||0+'h</td>
            <td>'+t.project_name||'—'+'</td>
            <td class="text-muted">'+t.notes||'—'+'</td>
            <td class="tbl-actions">
              <button class="btn btn-sm btn-primary" onclick="window._approve('+t.id+')">✓ Approve</button>
              <button class="btn btn-sm btn-danger"  onclick="window._reject('+t.id+')">✗ Reject</button>
            </td>
          </tr>').join('')}</tbody></table></div></div>'
        : '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">All clear!</div><div class="empty-sub">No pending timesheets</div></div>'}
      </div>');

    window._approve = async (id) => {
      try {
        await put('/timesheets/' + id, { status: 'Approved' });
        toast('Timesheet approved', 'success');
        await renderApproval();
      } catch(e) { toast(e.message, 'error'); }
    };
    window._reject = async (id) => {
      const r = prompt('Rejection reason (required):');
      if (r === null || r.trim() === '') return;
      try {
        await put('/timesheets/' + id, { status: 'Rejected', rejection_reason: r });
        toast('Timesheet rejected', 'info');
        await renderApproval();
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch (e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const t = await get('/timesheets/'+id+'');
    setPageTitle('Timesheet — '+t.employee_name+'', fmt.date(t.week_ending));
    setBreadcrumb([{ label: 'Timesheets', url: '/timesheets' }, { label: t.employee_name }]);
    setContent('<div class="page-body"><div class="card form-card">
      <div class="card-header">
        <h3 class="card-title">'+t.employee_name+' — Week of '+fmt.date(t.week_ending)+'</h3>
        '+badge(t.status||'Pending')+'
      </div>
      <div class="card-body">
        <div class="ts-days-grid">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'
            <div class="ts-day"><div class="ts-day-label">${d}</div>
            <div class="ts-day-hours">${t[d.toLowerCase()]||0}h</div></div>').join('')}
        </div>
        <div class="ts-total">Total: <strong>'+t.total_hours||0+'h</strong></div>
        ${t.notes?'<p><strong>Notes:</strong> ${t.notes}</p>':''}
        ${t.rejection_reason?'<p class="text-red"><strong>Rejection reason:</strong> ${t.rejection_reason}</p>':''}
      </div>
    </div></div>');
  } catch (e) { showError(e.message); }
}
