/** Reusable modal system */
let _currentModal = null;

export function showModal({ title, body, footer, size = '', onClose }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${size}" id="active-modal">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="modal-close" onclick="window._closeModal()">✕</button>
      </div>
      <div class="modal-body" id="modal-body">${body || ''}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>`;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
  _currentModal = backdrop;
  window._closeModal = closeModal;
  // Focus first input
  setTimeout(() => {
    const first = backdrop.querySelector('input,select,textarea');
    if (first) first.focus();
  }, 100);
  return backdrop;
}

export function closeModal() {
  if (_currentModal) { _currentModal.remove(); _currentModal = null; }
}

export function modalBody(html) {
  const el = document.getElementById('modal-body');
  if (el) el.innerHTML = html;
}
