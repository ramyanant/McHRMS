/**
 * Reusable data table renderer.
 * Handles empty state, loading, pagination.
 */
export function renderTable({ columns, rows, emptyMsg = 'No records found', onRowClick }) {
  if (!rows || !rows.length) {
    return `<div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <div class="empty-state-title">${emptyMsg}</div>
    </div>`;
  }
  const thead = columns.map(c => `<th>${c.label}</th>`).join('');
  const tbody = rows.map((row, i) => {
    const tds = columns.map(c => {
      const val = c.render ? c.render(row) : (row[c.key] ?? '—');
      return `<td class="${c.cls||''}">${val}</td>`;
    }).join('');
    return `<tr ${onRowClick ? `style="cursor:pointer" onclick="window._tableRowClick(${i})"` : ''}>${tds}</tr>`;
  }).join('');
  if (onRowClick) {
    window._tableRowClick = (i) => onRowClick(rows[i]);
  }
  return `<div class="table-container"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

export function pillStatus(status) {
  const map = {
    'Active':'pill-green','Approved':'pill-green','Paid':'pill-green','Accepted':'pill-green','Completed':'pill-green',
    'Inactive':'pill-red','Rejected':'pill-red','Cancelled':'pill-red','Overdue':'pill-red',
    'Pending':'pill-amber','Draft':'pill-amber','Sent':'pill-amber','Scheduled':'pill-amber',
    'Open':'pill-blue','In Progress':'pill-blue','Screening':'pill-blue',
  };
  const cls = map[status] || 'pill-gray';
  return `<span class="pill ${cls}">${status||'—'}</span>`;
}
