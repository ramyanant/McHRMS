/**
 * Shared Document Upload Widget
 * Use: renderDocsTab(containerId, apiPath, docTypes)
 * e.g. renderDocsTab('my-docs', '/candidates/41/documents', ['Resume','Cover Letter','Other'])
 */
import { get, post } from './api.js';
import { toast } from './ui.js';

var DEFAULT_TYPES = ['Contract','NDA','ID Proof','Certificate','Report','Correspondence','Other'];

function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fileIcon(mime) {
  if (!mime) return '📄';
  if (mime.indexOf('pdf') >= 0) return '📕';
  if (mime.indexOf('image') >= 0) return '🖼';
  if (mime.indexOf('word') >= 0 || mime.indexOf('document') >= 0) return '📝';
  if (mime.indexOf('sheet') >= 0 || mime.indexOf('excel') >= 0) return '📊';
  return '📄';
}

export function renderDocsTab(containerId, apiPath, docTypes) {
  var types = docTypes || DEFAULT_TYPES;

  function refresh() {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div class="empty-mini" style="padding:12px">Loading…</div>';
    get(apiPath).then(function(docs) {
      if (!el) return;
      var items = Array.isArray(docs) ? docs : [];
      el.innerHTML =
        '<div class="card"><div class="card-header">' +
          '<h3 class="card-title">📄 Documents</h3>' +
          '<button class="btn btn-primary btn-sm" onclick="window._docsUpload_' + containerId + '()">+ Upload</button>' +
        '</div>' +
        (items.length
          ? '<div class="card-body"><div class="doc-grid">' +
            items.map(function(d) {
              return '<div class="doc-card">' +
                '<div class="doc-icon">' + fileIcon(d.mime_type) + '</div>' +
                '<div class="doc-info">' +
                  '<div class="doc-name fw-bold">' + v(d.doc_name) + '</div>' +
                  '<div class="doc-meta">' +
                    '<span class="badge badge-gray">' + v(d.doc_type || 'Doc') + '</span>' +
                    (d.file_size ? '<span class="text-muted" style="font-size:11px"> ' + v(d.file_size) + '</span>' : '') +
                  '</div>' +
                  (d.uploaded_at ? '<div class="text-muted" style="font-size:11px">' + new Date(d.uploaded_at).toLocaleDateString('en-IN') + '</div>' : '') +
                '</div>' +
                (d.file_data
                  ? '<button class="btn btn-ghost btn-xs" onclick="window._docsDownload(\'' + d.id + '\',\'' + v(d.doc_name) + '\',\'' + v(d.mime_type) + '\',\'' + containerId + '\')" title="Download">⬇</button>'
                  : '') +
                '<button class="btn btn-danger btn-xs" onclick="window._docsDelete(\'' + d.id + '\',\'' + apiPath + '\',\'' + containerId + '\')" title="Remove">✕</button>' +
              '</div>';
            }).join('') +
            '</div></div>'
          : '<div class="card-body"><div class="empty-mini">No documents uploaded yet.<br><span class="text-muted" style="font-size:12px">Upload contracts, certificates, correspondence and other files.</span></div></div>'
        ) +
        '</div>';
      // Store docs for download
      window['_docsData_' + containerId] = items;
    }).catch(function() {
      var el2 = document.getElementById(containerId);
      if (el2) el2.innerHTML = '<div class="empty-mini text-muted">Could not load documents</div>';
    });
  }

  // Upload handler
  window['_docsUpload_' + containerId] = function() {
    // Create inline upload form
    var el = document.getElementById(containerId);
    if (!el) return;
    var existingForm = document.getElementById('docs-upload-form-' + containerId);
    if (existingForm) { existingForm.remove(); return; }

    var form = document.createElement('div');
    form.id = 'docs-upload-form-' + containerId;
    form.className = 'card';
    form.style.marginTop = '12px';
    form.innerHTML =
      '<div class="card-header"><h3 class="card-title">Upload Document</h3>' +
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'docs-upload-form-' + containerId + '\').remove()">✕</button>' +
      '</div>' +
      '<div class="card-body"><div class="form-grid">' +
        '<div class="fg"><label class="flabel">Document Type *</label>' +
          '<select class="fselect" id="dupl-type-' + containerId + '">' +
          types.map(function(t) { return '<option>' + t + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="fg"><label class="flabel">Document Name *</label>' +
          '<input class="finput" id="dupl-name-' + containerId + '" placeholder="e.g. Employment Contract 2024"></div>' +
        '<div class="fg full"><label class="flabel">File *</label>' +
          '<input type="file" class="finput" id="dupl-file-' + containerId + '" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls,.txt"></div>' +
        '<div class="fg full"><label class="flabel">Notes</label>' +
          '<input class="finput" id="dupl-notes-' + containerId + '" placeholder="Optional notes about this document"></div>' +
      '</div>' +
      '<div class="form-actions" style="padding-top:8px">' +
        '<button class="btn btn-ghost" onclick="document.getElementById(\'docs-upload-form-' + containerId + '\').remove()">Cancel</button>' +
        '<button class="btn btn-primary" id="dupl-submit-' + containerId + '" onclick="window._docsSubmit_' + containerId + '()">Upload</button>' +
      '</div></div>';

    el.parentNode.insertBefore(form, el.nextSibling);
  };

  window['_docsSubmit_' + containerId] = async function() {
    var typeEl  = document.getElementById('dupl-type-' + containerId);
    var nameEl  = document.getElementById('dupl-name-' + containerId);
    var fileEl  = document.getElementById('dupl-file-' + containerId);
    var notesEl = document.getElementById('dupl-notes-' + containerId);
    var submitEl = document.getElementById('dupl-submit-' + containerId);

    if (!fileEl || !fileEl.files || !fileEl.files[0]) { toast('Please select a file', 'error'); return; }
    if (!nameEl || !nameEl.value.trim()) { toast('Please enter a document name', 'error'); return; }

    var file = fileEl.files[0];
    if (file.size > 10 * 1024 * 1024) { toast('File too large (max 10MB)', 'error'); return; }

    submitEl.disabled = true;
    submitEl.textContent = 'Uploading…';

    try {
      var b64 = await new Promise(function(res, rej) {
        var reader = new FileReader();
        reader.onload = function() { res(reader.result.split(',')[1]); };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      await post(apiPath, {
        doc_type:  typeEl ? typeEl.value : 'Other',
        doc_name:  nameEl.value.trim(),
        file_size: (file.size / 1024).toFixed(1) + ' KB',
        mime_type: file.type,
        file_data: b64,
        notes:     notesEl ? notesEl.value.trim() : '',
      });

      toast('Document uploaded successfully!', 'success');
      var formEl = document.getElementById('docs-upload-form-' + containerId);
      if (formEl) formEl.remove();
      refresh();
    } catch(e) {
      toast(e.message || 'Upload failed', 'error');
      submitEl.disabled = false;
      submitEl.textContent = 'Upload';
    }
  };

  // Download handler (global, shared)
  window._docsDownload = function(docId, name, mime, cid) {
    var allDocs = window['_docsData_' + cid] || [];
    var doc = allDocs.find(function(d) { return String(d.id) === String(docId); });
    if (!doc || !doc.file_data) { toast('No file data available', 'error'); return; }
    var link = document.createElement('a');
    link.href = 'data:' + (mime || 'application/octet-stream') + ';base64,' + doc.file_data;
    link.download = name || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Delete handler (global, shared)
  window._docsDelete = async function(docId, path, cid) {
    if (!confirm('Remove this document? This cannot be undone.')) return;
    try {
      await fetch('/api/v1' + path.replace('/api/v1','') + '/' + docId, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': localStorage.getItem('auth_token') || '' }
      });
      toast('Document removed', 'info');
      window['_docsData_' + cid] = (window['_docsData_' + cid] || []).filter(function(d) { return String(d.id) !== String(docId); });
      renderDocsTab(cid, path);
    } catch(e) { toast('Failed to remove', 'error'); }
  };

  // Initial load
  refresh();
}

export function docsTabHtml(containerId) {
  return '<div id="' + containerId + '" class="docs-container"><div class="empty-mini" style="padding:12px">Loading documents…</div></div>';
}
