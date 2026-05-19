/**
 * Audit Logs — sortable, filterable, paginated
 */
import { get } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError, badge, fmt } from '../ui.js';

function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtDT(d) {
  if (!d) return '—';
  var dt = new Date(d);
  return ('0'+dt.getDate()).slice(-2)+'-'+('0'+(dt.getMonth()+1)).slice(-2)+'-'+dt.getFullYear()+
         ' '+('0'+dt.getHours()).slice(-2)+':'+('0'+dt.getMinutes()).slice(-2);
}
const PER_PAGE = 50;

export async function renderHome() {
  setPageTitle('Audit Logs', 'System activity trail');
  setBreadcrumb([{ label:'Audit Logs' }]);
  showLoader();
  try {
    var data = await get('/admin/audit-logs?per_page=500');
    var rows = data.items || data || [];

    var q = '', filterModule = '', filterAction = '', filterUser = '';
    var sortCol = 'created_at', sortDir = -1, page = 1;

    var modules = [...new Set(rows.map(function(r){ return r.module; }).filter(Boolean))].sort();
    var actions = [...new Set(rows.map(function(r){ return r.action; }).filter(Boolean))].sort();
    var users   = [...new Set(rows.map(function(r){ return r.username; }).filter(Boolean))].sort();

    function sorted(arr) {
      return arr.slice().sort(function(a,b) {
        var av = a[sortCol] || '', bv = b[sortCol] || '';
        return String(av).localeCompare(String(bv)) * sortDir;
      });
    }
    function getF() {
      var d = rows.slice();
      if (q)            d = d.filter(function(r){ return (r.username+' '+r.module+' '+r.entity_type+' '+(r.description||'')).toLowerCase().includes(q.toLowerCase()); });
      if (filterModule) d = d.filter(function(r){ return r.module === filterModule; });
      if (filterAction) d = d.filter(function(r){ return r.action === filterAction; });
      if (filterUser)   d = d.filter(function(r){ return r.username === filterUser; });
      return sorted(d);
    }
    function thSort(col, label) {
      var arr = sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ' ⇅';
      return '<th class="sortable" onclick="window._alSort(\'' + col + '\')" style="cursor:pointer">' + label + arr + '</th>';
    }
    function actionColor(a) {
      return { CREATE:'green', UPDATE:'blue', DELETE:'red', READ:'gray', LOGIN:'purple', EXPORT:'amber' }[a] || 'gray';
    }

    function renderTable() {
      var filtered = getF();
      var total = filtered.length;
      var pages = Math.max(1, Math.ceil(total / PER_PAGE));
      page = Math.min(Math.max(1, page), pages);
      var slice = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

      var pgBar = '';
      if (pages > 1) {
        var btns = [];
        if (page > 1) btns.push('<button class="pg-btn" onclick="window._alPage(' + (page-1) + ')">‹</button>');
        for (var p2 = Math.max(1,page-2); p2 <= Math.min(pages,page+2); p2++) {
          btns.push('<button class="pg-btn' + (p2===page?' active':'') + '" onclick="window._alPage(' + p2 + ')">' + p2 + '</button>');
        }
        if (page < pages) btns.push('<button class="pg-btn" onclick="window._alPage(' + (page+1) + ')">›</button>');
        pgBar = '<div class="pg-bar">' + btns.join('') + '<span class="pg-info"> ' + total + ' records</span></div>';
      }

      if (!slice.length) return '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No audit logs match this filter</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thSort('created_at','Time') +
        thSort('username','User') +
        thSort('module','Module') +
        thSort('action','Action') +
        thSort('entity_type','Entity') +
        '<th>Description</th>' +
      '</tr></thead><tbody>' +
      slice.map(function(r) {
        return '<tr>' +
          '<td class="mono" style="white-space:nowrap;font-size:11px">' + fmtDT(r.created_at) + '</td>' +
          '<td><strong>' + v(r.username,'—') + '</strong></td>' +
          '<td><span class="badge badge-gray">' + v(r.module,'—') + '</span></td>' +
          '<td><span class="badge badge-' + actionColor(r.action) + '">' + v(r.action,'—') + '</span></td>' +
          '<td>' + v(r.entity_type,'—') + (r.entity_id ? ' #' + r.entity_id : '') + '</td>' +
          '<td style="max-width:300px;font-size:12px;color:var(--txt2)">' + v(r.description,'—') + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>' + pgBar + '</div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="struct-toolbar" style="flex-wrap:wrap;gap:8px">' +
        '<input class="search-input" placeholder="Search logs…" oninput="window._alQ(this.value)" style="width:220px">' +
        '<select class="fselect" style="width:130px" onchange="window._alModule(this.value)">' +
          '<option value="">All Modules</option>' + modules.map(function(m){ return '<option>' + v(m) + '</option>'; }).join('') +
        '</select>' +
        '<select class="fselect" style="width:120px" onchange="window._alAction(this.value)">' +
          '<option value="">All Actions</option>' + actions.map(function(a){ return '<option>' + v(a) + '</option>'; }).join('') +
        '</select>' +
        '<select class="fselect" style="width:150px" onchange="window._alUser(this.value)">' +
          '<option value="">All Users</option>' + users.map(function(u){ return '<option>' + v(u) + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div id="al-content">' + renderTable() + '</div></div>'
    );

    function refresh() { document.getElementById('al-content').innerHTML = renderTable(); }
    window._alQ      = function(val) { q = val; page = 1; refresh(); };
    window._alModule = function(val) { filterModule = val; page = 1; refresh(); };
    window._alAction = function(val) { filterAction = val; page = 1; refresh(); };
    window._alUser   = function(val) { filterUser = val; page = 1; refresh(); };
    window._alSort   = function(col) { sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1); refresh(); };
    window._alPage   = function(p) { page = p; refresh(); };

  } catch(e) { showError(e.message); }
}
