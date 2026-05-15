import { get, post, put }  from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         badge, fmt, renderTable } from '../ui.js';
import { navigate }        from '../router.js';

export async function renderList() {
  setPageTitle('Projects', 'Active engagements');
  setBreadcrumb([{ label: 'Projects' }]);
  showLoader();
  try {
    const rows = await get('/projects').catch(() => ({ items: [] }));
    const items = rows.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <div></div>
          <button class="btn btn-primary">+ New Project</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Code',    key: 'code' },
            { label: 'Name',    key: 'name',        render: r => `<strong>${r.name}</strong>` },
            { label: 'Client',  key: 'client_name' },
            { label: 'Type',    key: 'billing_type' },
            { label: 'Status',  key: 'status',      render: r => badge(r.status) },
            { label: 'Start',   key: 'start_date',  render: r => fmt.date(r.start_date) },
            { label: 'End',     key: 'end_date',    render: r => fmt.date(r.end_date) },
          ],
          rows: items,
          onRowClick: r => navigate(`/projects/${r.id}`),
          emptyMessage: 'No projects found',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const p = await get(`/projects/${id}`).catch(() => null);
    if (!p) { showError('Project not found'); return; }
    setPageTitle(p.name, p.code);
    setBreadcrumb([{ label: 'Projects', url: '/projects' }, { label: p.name }]);
    setContent(`<div class="page-body"><div class="card"><div class="card-body">
      <div class="field-grid">
        ${fld('Client', p.client_name)}${fld('Status', p.status)}
        ${fld('Start', fmt.date(p.start_date))}${fld('End', fmt.date(p.end_date))}
        ${fld('Budget', fmt.money(p.budget))}${fld('Billing', p.billing_type)}
      </div>
      ${p.description?`<p style="margin-top:12px">${p.description}</p>`:''}
    </div></div></div>`);
  } catch (e) { showError(e.message); }
}
function fld(l, v) { return `<div class="field-item"><div class="field-label">${l}</div><div class="field-value${!v?' empty':''}">${v||'—'}</div></div>`; }
