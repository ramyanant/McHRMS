/**
 * Audit Logs — No template literals
 */
import { get } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError, fmt, badge } from '../ui.js';

function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export async function renderList() {
  setPageTitle('Audit Logs', 'System activity');
  setBreadcrumb([{ label: 'Admin' }, { label: 'Audit Logs' }]);
  showLoader();
  try {
    var data = await get('/admin/audit-logs');
    var rows = data.items || data || [];

    var tableHTML = rows.length
      ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
          '<th>Time</th><th>User</th><th>Module</th><th>Action</th><th>Description</th>' +
        '</tr></thead><tbody>' +
        rows.map(function(r) {
          return '<tr>' +
            '<td class="mono text-muted">' + fmt.date(r.created_at) + '</td>' +
            '<td>' + v(r.username, '—') + '</td>' +
            '<td><span class="badge badge-gray">' + v(r.module, '—') + '</span></td>' +
            '<td>' + badge(r.action || 'INFO') + '</td>' +
            '<td class="text-muted">' + v(r.description, '—') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div></div>'
      : '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No audit logs yet</div></div>';

    setContent('<div class="page-body">' + tableHTML + '</div>');
  } catch(e) { showError(e.message); }
}
