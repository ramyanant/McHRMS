/**
 * McHR&TA UI Component Library
 * Reusable components: Table, Modal, Toast, Breadcrumb, Sidebar, Loader
 */

// ── Toast Notifications ───────────────────────────────────────
let _toastContainer = null;
function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'toast-container';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

export function toast(message, type = 'info', duration = 3500) {
  const tc   = getToastContainer();
  const el   = document.createElement('div');
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span>${message}</span>`;
  tc.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration);
}

// ── Modal ─────────────────────────────────────────────────────
export function openModal({ title, body, onSubmit, submitLabel = 'Save', size = 'md' }) {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-${size}">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body" id="modal-body">${typeof body === 'string' ? body : ''}</div>
      <div class="modal-footer" id="modal-footer">
        <button class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
        ${onSubmit ? `<button class="btn btn-primary" id="modal-submit-btn">${submitLabel}</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  if (typeof body === 'function') body(document.getElementById('modal-body'));

  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); };
  document.getElementById('modal-close-btn').onclick  = close;
  document.getElementById('modal-cancel-btn').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };

  if (onSubmit) {
    document.getElementById('modal-submit-btn').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const result = await onSubmit(document.getElementById('modal-body'));
        if (result !== false) close();
      } catch (err) {
        toast(err.message || 'Error saving', 'error');
      } finally {
        btn.disabled = false; btn.textContent = submitLabel;
      }
    };
  }

  requestAnimationFrame(() => overlay.classList.add('open'));
  return { close };
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); }
}

// ── Confirm Dialog ─────────────────────────────────────────────
export function confirm(message, title = 'Confirm') {
  return new Promise(resolve => {
    openModal({
      title,
      body: `<p style="padding:8px 0">${message}</p>`,
      submitLabel: 'Confirm',
      onSubmit: () => { resolve(true); return true; }
    });
    // Override cancel to resolve false
    setTimeout(() => {
      const btn = document.getElementById('modal-cancel-btn');
      if (btn) btn.onclick = () => { closeModal(); resolve(false); };
    }, 10);
  });
}

// ── Breadcrumb ─────────────────────────────────────────────────
export function setBreadcrumb(crumbs) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  el.innerHTML = crumbs.map((c, i) =>
    i < crumbs.length - 1
      ? `<a class="bc-link" href="#${c.url || '#'}">${c.label}</a><span class="bc-sep">›</span>`
      : `<span class="bc-current">${c.label}</span>`
  ).join('');
}

// ── Page Title ─────────────────────────────────────────────────
export function setPageTitle(title, subtitle = '') {
  const t = document.getElementById('page-title');
  const s = document.getElementById('page-subtitle');
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
  document.title = `${title} — McHR&TA`;
}

// ── Loading States ─────────────────────────────────────────────
export function setContent(html) {
  const el = document.getElementById('page-content');
  if (el) el.innerHTML = html;
}

export function showLoader() {
  setContent(`<div class="page-loader">
    <div class="spinner"></div>
    <div class="loader-text">Loading…</div>
  </div>`);
}

export function showEmpty(icon, title, subtitle = '', action = '') {
  setContent(`<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <div class="empty-title">${title}</div>
    ${subtitle ? `<div class="empty-sub">${subtitle}</div>` : ''}
    ${action}
  </div>`);
}

export function showError(message) {
  setContent(`<div class="error-state">
    <div class="error-icon">⚠️</div>
    <div class="error-title">Something went wrong</div>
    <div class="error-sub">${message}</div>
  </div>`);
}

// ── Data Table ─────────────────────────────────────────────────
export function renderTable({ columns, rows, onRowClick, emptyMessage = 'No records found', actions }) {
  if (!rows || rows.length === 0) {
    return `<div class="empty-state"><div class="empty-title">${emptyMessage}</div></div>`;
  }
  const thead = `<tr>${columns.map(c => `<th>${c.label}</th>`).join('')}${actions ? '<th>Actions</th>' : ''}</tr>`;
  const tbody = rows.map((row, i) => {
    const cells = columns.map(c => {
      const val = c.render ? c.render(row) : (row[c.key] ?? '—');
      return `<td>${val}</td>`;
    }).join('');
    const actionCells = actions ? `<td class="tbl-actions">${actions(row)}</td>` : '';
    return `<tr class="${onRowClick ? 'tbl-clickable' : ''}" data-row="${i}">${cells}${actionCells}</tr>`;
  }).join('');

  const html = `<div class="tbl-wrap"><table class="data-table">
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table></div>`;

  if (onRowClick) {
    setTimeout(() => {
      document.querySelectorAll('.tbl-clickable').forEach((tr, i) => {
        tr.onclick = () => onRowClick(rows[i]);
      });
    }, 0);
  }
  return html;
}

// ── Status Badge ───────────────────────────────────────────────
export function badge(text, type = 'gray') {
  const map = {
    Active: 'green', Approved: 'green', Paid: 'green', Placed: 'green', Accepted: 'green',
    Pending: 'amber', Draft: 'gray', Sent: 'blue', Open: 'blue', Scheduled: 'blue',
    Rejected: 'red', Inactive: 'red', Cancelled: 'red', Closed: 'gray',
    'In Progress': 'purple', Contract: 'purple',
  };
  const color = map[text] || type;
  return `<span class="badge badge-${color}">${text}</span>`;
}

// ── Format helpers ─────────────────────────────────────────────
export const fmt = {
  date: (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—',
  money: (n) => n != null ? '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—',
  ini: (name) => (name||'').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  avColor: (name) => {
    const colors = ['av-green','av-blue','av-purple','av-amber','av-rose','av-teal'];
    let h = 0; for (const c of (name||'')) h = c.charCodeAt(0) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  },
};

// ── Sidebar active state ───────────────────────────────────────
export function setSidebarActive(path) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.path && path.startsWith(el.dataset.path)) {
      el.classList.add('active');
    }
  });
}

// ── Pagination controls ────────────────────────────────────────
export function renderPagination(data, onPage) {
  if (!data || data.pages <= 1) return '';
  const { page, pages } = data;
  const prev = page > 1 ? `<button class="pg-btn" onclick="${onPage}(${page-1})">‹ Prev</button>` : '';
  const next = page < pages ? `<button class="pg-btn" onclick="${onPage}(${page+1})">Next ›</button>` : '';
  return `<div class="pagination">${prev}
    <span class="pg-info">Page ${page} of ${pages}</span>
    ${next}</div>`;
}
