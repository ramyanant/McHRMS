import { get }             from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         badge, fmt, renderTable, renderPagination } from '../ui.js';

export async function renderList() {
  setPageTitle('Audit Logs', 'System activity log');
  setBreadcrumb([{ label: 'Audit Logs' }]);
  showLoader();
  try {
    const data = await get('/admin/audit-logs');
    const rows = data.items || [];
    setContent('
      <div class="page-body">
        ${renderTable({
          columns: [
            { label: 'Time',    key: 'created_at',  render: r => '<span class="mono">${fmt.date(r.created_at)}</span>' },
            { label: 'User',    key: 'username' },
            { label: 'Module',  key: 'module',      render: r => '<span class="badge badge-gray">${r.module}</span>' },
            { label: 'Action',  key: 'action',      render: r => badge(r.action) },
            { label: 'Entity',  key: 'entity_type' },
            { label: 'Details', key: 'description', render: r => '<span class="text-muted">${r.description||'—'}</span>' },
            { label: 'IP',      key: 'ip_address',  render: r => '<span class="mono">${r.ip_address||'—'}</span>' },
          ],
          rows,
          emptyMessage: 'No audit entries found',
        })}
        ${renderPagination(data, 'window._auditPage')}
      </div>');
    window._auditPage = (p) => window.location.hash = '/audit-logs?page='+p+'';
  } catch (e) { showError(e.message); }
}
