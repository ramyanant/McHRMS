/**
 * Reusable logo uploader for entity detail pages (clients/vendors/projects).
 * Usage: insert logoUploaderHtml(entity, id) into the page HTML; the global
 * window.__uploadLogo handler (defined once below) does the upload.
 * entity/id are passed as call args, so the global handler name is fixed —
 * no hyphen-in-identifier problem like the docs widget had.
 */
import { post } from './api.js';
import { toast } from './ui.js';

export function logoUploaderHtml(entity, id) {
  var bust = Date.now();
  return '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
    '<img id="logoimg-' + entity + '-' + id + '" src="/api/v2/' + entity + '/' + id + '/logo?t=' + bust + '" alt="Logo" ' +
      'style="width:88px;height:88px;object-fit:contain;border:1px solid var(--border);border-radius:10px;padding:6px;background:#fff" ' +
      'onerror="this.onerror=null;this.style.display=\'none\';var ph=document.getElementById(\'logoph-' + entity + '-' + id + '\');if(ph)ph.style.display=\'flex\'">' +
    '<div id="logoph-' + entity + '-' + id + '" style="display:none;width:88px;height:88px;align-items:center;justify-content:center;border:1px dashed var(--border);border-radius:10px;color:var(--txt4);font-size:11px;background:var(--bg)">No Logo</div>' +
    '<div>' +
      '<div style="font-size:12px;color:var(--txt3);margin-bottom:6px">Logo (PNG/JPG, max 2 MB)</div>' +
      '<input type="file" accept="image/*" id="logofile-' + entity + '-' + id + '" style="font-size:12px;margin-bottom:6px;display:block">' +
      '<button class="btn btn-ghost btn-sm" onclick="window.__uploadLogo(\'' + entity + '\',' + id + ')">⬆ Upload Logo</button>' +
    '</div>' +
  '</div>';
}

window.__uploadLogo = async function(entity, id) {
  var fileEl = document.getElementById('logofile-' + entity + '-' + id);
  if (!fileEl || !fileEl.files || !fileEl.files[0]) { toast('Choose an image first', 'error'); return; }
  var f = fileEl.files[0];
  if (f.size > 2 * 1024 * 1024) { toast('Image too large (max 2 MB)', 'error'); return; }
  try {
    var b64 = await new Promise(function(res, rej) {
      var r = new FileReader();
      r.onload = function() { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    await post('/' + entity + '/' + id + '/logo', { file_data: b64, mime_type: f.type });
    toast('Logo uploaded', 'success');
    var img = document.getElementById('logoimg-' + entity + '-' + id);
    var ph  = document.getElementById('logoph-' + entity + '-' + id);
    if (img) { img.src = '/api/v2/' + entity + '/' + id + '/logo?t=' + Date.now(); img.style.display = ''; }
    if (ph) ph.style.display = 'none';
  } catch (e) { toast(e.message || 'Upload failed', 'error'); }
};
