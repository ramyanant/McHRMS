/**
 * Org Structure — Business Units, Departments, Cost Centres, Locations
 * ALL pages have: Grid view | Table view | Sort by column | Filter by status | Row click → detail
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

let _masters = null;
async function getMasters() {
  if (!_masters) _masters = await get('/masters/all');
  return _masters;
}

function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fd(id) {
  const d = Object.fromEntries(new FormData(document.getElementById(id)));
  Object.keys(d).forEach(k => { if (d[k] === '') d[k] = null; });
  return d;
}
function opts(arr, selected) {
  return arr.map(item => {
    const val = typeof item === 'string' ? item : item.id;
    const lbl = typeof item === 'string' ? item : item.name;
    return '<option value="' + v(val) + '"' + (String(val) === String(selected) ? ' selected' : '') + '>' + v(lbl) + '</option>';
  }).join('');
}

// ── Reusable list page builder ──────────────────────────────────────────────
function buildListPage({ title, subtitle, breadcrumb, rows, columns, cardRender,
                          onAdd, addLabel, statusField = 'is_active', entityName }) {
  setPageTitle(title, subtitle);
  setBreadcrumb(breadcrumb);

  let sortCol = null, sortDir = 1, filterStatus = '', searchQ = '';
  let view = 'table'; let page = 1; const PER = 25;

  function getFiltered() {
    let data = [...rows];
    if (searchQ) {
      const q = searchQ.toLowerCase();
      data = data.filter(r =>
        Object.values(r).some(v => v && String(v).toLowerCase().includes(q))
      );
    }
    if (filterStatus !== '') {
      data = data.filter(r => {
        const val = r[statusField];
        if (filterStatus === 'active')   return val == 1 || val === true || val === 'Active';
        if (filterStatus === 'inactive') return val == 0 || val === false || val === 'Inactive';
        return true;
      });
    }
    if (sortCol) {
      data.sort((a, b) => {
        const av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
        return String(av).localeCompare(String(bv)) * sortDir;
      });
    }
    return data;
  }

  function renderGrid(data) {
    if (!data.length) return '<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">No ' + entityName + ' found</div></div>';
    return '<div class="struct-grid">' +
      data.map(r => cardRender(r)).join('') +
      '<div class="struct-add-card" onclick="' + onAdd + '">' +
        '<div class="struct-add-icon">+</div>' +
        '<div class="struct-add-label">' + addLabel + '</div>' +
      '</div>' +
      '</div>';
  }

  function renderTable(allData) {
    if (!allData.length) return '<div class="empty-mini">No ' + entityName + ' found</div>';
    const pages = Math.max(1, Math.ceil(allData.length / PER));
    page = Math.min(Math.max(1, page), pages);
    const data = allData.slice((page-1)*PER, page*PER);
    let pgBar = '';
    if (pages > 1) {
      pgBar = '<div class="pagination" style="padding:8px 0">';
      for (let p = 1; p <= pages; p++) pgBar += '<button class="pg-btn' + (p===page?' active':'') + '" onclick="window._orgPage(' + p + ')">' + p + '</button>';
      pgBar += '<span class="pg-info">' + allData.length + ' total</span></div>';
    }
    const tbl = '<div class="tbl-wrap"><table class="data-table"><thead><tr>' +
      columns.map(c =>
        '<th class="sortable" onclick="window._orgSort(\'' + c.key + '\')">' +
        c.label + '<span class="sort-icon" id="sort-' + c.key + '"></span></th>'
      ).join('') +
      '<th>Actions</th></tr></thead><tbody>' +
      data.map(r =>
        '<tr class="tbl-clickable" onclick="window._orgRowClick(\'' + entityName + '\',' + r.id + ')">' +
        columns.map(c => '<td>' + (c.render ? c.render(r) : v(r[c.key], '—')) + '</td>').join('') +
        '<td class="tbl-actions" onclick="event.stopPropagation()">' +
          '<button class="btn btn-ghost btn-xs" onclick="window._orgEdit(\'' + entityName + '\',' + r.id + ')">✏ Edit</button>' +
          '<button class="btn btn-danger btn-xs" onclick="window._orgDelete(\'' + entityName + '\',' + r.id + ',\'' + v(r.name,'') + '\')">Delete</button>' +
        '</td></tr>'
      ).join('') +
      '</tbody></table></div>';
    return tbl + pgBar;
  }

  function render() {
    const data = getFiltered();
    const content = view === 'grid' ? renderGrid(data) : renderTable(data);
    document.getElementById('struct-content').innerHTML = content;
    // Update sort icons
    columns.forEach(c => {
      const el = document.getElementById('sort-' + c.key);
      if (el) el.textContent = sortCol === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ' ⇅';
    });
  }

  const statsHtml = '<div class="struct-summary">' +
    '<div class="struct-stat">' + rows.length + ' <span>' + title + '</span></div>' +
    '<div class="struct-stat">' + rows.filter(r => r[statusField] == 1 || r[statusField] === 'Active').length + ' <span>Active</span></div>' +
    '</div>';

  setContent(
    '<div class="page-body">' +
    '<div class="struct-toolbar">' +
      statsHtml +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<input class="finput" style="width:200px" placeholder="Search..." oninput="window._orgSearch(this.value)" id="org-search-input">' +
        '<select class="fselect" style="width:130px" onchange="window._orgFilter(this.value)">' +
          '<option value="">All Status</option>' +
          '<option value="active">Active</option>' +
          '<option value="inactive">Inactive</option>' +
        '</select>' +
        '<div class="view-toggle">' +
          '<button class="view-toggle-btn active" id="btn-grid" onclick="window._orgView(\'grid\')">⊞ Grid</button>' +
          '<button class="view-toggle-btn" id="btn-table" onclick="window._orgView(\'table\')">☰ Table</button>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="' + onAdd + '">' + addLabel + '</button>' +
      '</div>' +
    '</div>' +
    '<div id="struct-content"></div>' +
    '</div>'
  );

  render();

  window._orgDelete = async function(entity, id, name) {
    var entityUrls = {
      'Business Units': '/business-units/',
      'Departments':    '/departments/',
      'Cost Centres':   '/cost-centres/',
      'Locations':      '/locations/',
    };
    var url = entityUrls[entity];
    if (!url) { toast('Delete not configured for ' + entity, 'error'); return; }
    if (!confirm('Delete "' + (name || entity) + '"? This cannot be undone.')) return;
    try {
      await del(url + id);
      toast('Deleted', 'info');
      if (entity === 'Business Units') { renderBUs(); }
      else if (entity === 'Departments') { renderDepts(); }
      else if (entity === 'Cost Centres') { renderCostCentres(); }
      else if (entity === 'Locations') { renderLocations(); }
    } catch(e) { toast(e.message || 'Delete failed', 'error'); }
  };
  window._orgView = function(v2) {
    view = v2;
    document.getElementById('btn-grid').classList.toggle('active', v2 === 'grid');
    document.getElementById('btn-table').classList.toggle('active', v2 === 'table');
    render();
  };
  window._orgFilter = function(val) { filterStatus = val; render(); };
  window._orgSort   = function(col) {
    if (sortCol === col) sortDir *= -1;
    else { sortCol = col; sortDir = 1; }
    render();
  };
}

// ═══════════════════════════════════════════════════════════════
// BUSINESS UNITS
// ═══════════════════════════════════════════════════════════════
export async function renderBUs() {
  showLoader();
  try {
    const [rows, masters] = await Promise.all([get('/business-units'), getMasters()]);

    window._orgRowClick = (entity, id) => navigate('/organisation/business-units/' + id);
    window._orgEdit     = (entity, id) => buModal(rows.find(r => r.id === id), masters);
    window._addBU       = () => buModal(null, masters);
    window._deleteBU    = async (id, name) => {
      if (!confirm('Delete Business Unit "' + name + '"? This cannot be undone.')) return;
      await del('/business-units/' + id);
      toast('Business Unit deleted', 'info');
      renderBUs();
    };

    buildListPage({
      title: 'Business Units', subtitle: 'Top-level organisational divisions',
      breadcrumb: [{ label:'Organisation', url:'/organisation/profile' }, { label:'Business Units' }],
      rows, entityName: 'Business Units', statusField: 'is_active', addLabel: '+ Business Unit',
      onAdd: 'window._addBU()',
      columns: [
        { label:'Name',       key:'name',      render: r => '<strong>' + v(r.name) + '</strong>' + (r.code ? '<div class="cell-sub mono">' + v(r.code) + '</div>' : '') },
        { label:'Description',key:'description',render: r => v(r.description,'—') },
        { label:'Head',       key:'head_name', render: r => v(r.head_name,'—') },
        { label:'Departments',key:'dept_count', render: r => r.dept_count || 0 },
        { label:'Headcount',  key:'headcount',  render: r => r.headcount || 0 },
        { label:'Status',     key:'is_active',  render: r => badge(r.is_active ? 'Active' : 'Inactive') },
      ],
      cardRender: r =>
        '<div class="struct-card" onclick="navigate(\'/organisation/business-units/' + r.id + '\')">' +
        '<div class="struct-card-header"><div class="struct-card-icon">🏢</div>' +
        '<div class="multi-card-actions" onclick="event.stopPropagation()">' +
          '<button class="btn btn-ghost btn-xs" onclick="window._orgEdit(\'\','+ r.id+')">✏</button>' +
        '</div></div>' +
        '<div class="struct-card-title">' + v(r.name) + '</div>' +
        (r.code ? '<div class="struct-card-code">' + v(r.code) + '</div>' : '') +
        (r.description ? '<div class="struct-card-desc">' + v(r.description) + '</div>' : '') +
        (r.head_name   ? '<div class="struct-card-meta">👤 ' + v(r.head_name) + '</div>' : '') +
        '<div class="struct-card-stats">' +
          '<div class="struct-mini-stat"><span class="struct-mini-val">' + (r.dept_count||0) + '</span><span class="struct-mini-label">Depts</span></div>' +
          '<div class="struct-mini-stat"><span class="struct-mini-val">' + (r.headcount||0) + '</span><span class="struct-mini-label">People</span></div>' +
        '</div>' +
        '<div class="struct-card-footer">' + badge(r.is_active ? 'Active' : 'Inactive') + '</div>' +
        '</div>',
    });
  } catch(e) { showError(e.message); }
}

function buModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Business Unit' : '+ New Business Unit', size: 'md',
    body: '<form id="bu-form" class="form-grid-sm">' +
      '<div class="fg full"><label class="flabel">Name *</label><input class="finput" name="name" value="' + v((existing && existing.name)) + '" required></div>' +
      '<div class="fg"><label class="flabel">Code</label><input class="finput mono" name="code" value="' + v((existing && existing.code)) + '" placeholder="e.g. TECH"></div>' +
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="is_active">' +
        '<option value="1"' + ((existing && existing.is_active) != 0 ? ' selected' : '') + '>Active</option>' +
        '<option value="0"' + ((existing && existing.is_active) == 0 ? ' selected' : '') + '>Inactive</option>' +
      '</select></div>' +
      '<div class="fg full"><label class="flabel">Description</label><input class="finput" name="description" value="' + v((existing && existing.description)) + '"></div>' +
      '<div class="fg full"><label class="flabel">Head / Leader</label><select class="fselect" name="head_emp_id"><option value="">Select…</option>' + opts(masters['employees-lookup']||[], (existing && existing.head_emp_id)) + '</select></div>' +
      '</form>',
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('bu-form'); data.is_active = parseInt(data.is_active);
      if (!data.name || !data.name.trim()) { toast('Name is required', 'error'); return; }
      if (isEdit) await put('/business-units/' + existing.id, data);
      else await post('/business-units', data);
      toast(isEdit ? 'Updated' : 'Created', 'success');
      _masters = null; renderBUs();
    }
  });
}

export async function renderBUDetail({ id }) {
  showLoader();
  try {
    const [bu, depts] = await Promise.all([get('/business-units/' + id), get('/departments')]);
    const masters = await getMasters();
    setPageTitle(bu.name, 'Business Unit');
    setBreadcrumb([{ label:'Business Units', url:'/organisation/business-units' }, { label: bu.name }]);
    const myDepts = depts.filter(d => d.business_unit_id == id);
    setContent(
      '<div class="detail-layout">' +
      '<div class="detail-sidebar"><div class="card">' +
        '<div class="profile-hero" style="background:linear-gradient(135deg,#1a5c2e,#144825)">' +
          '<div style="font-size:48px;margin-bottom:8px">🏢</div>' +
          '<div class="profile-name">' + v(bu.name) + '</div>' +
          (bu.code ? '<div class="profile-title" style="color:rgba(255,255,255,.7)">' + v(bu.code) + '</div>' : '') +
          '<div style="margin-top:8px">' + badge(bu.is_active ? 'Active' : 'Inactive') + '</div>' +
        '</div>' +
        '<div class="profile-meta">' +
          '<div class="meta-row"><span>Departments</span><strong>' + myDepts.length + '</strong></div>' +
          '<div class="meta-row"><span>Headcount</span><strong>' + (bu.headcount||0) + '</strong></div>' +
          (bu.head_name ? '<div class="meta-row"><span>Head</span><strong>' + v(bu.head_name) + '</strong></div>' : '') +
        '</div>' +
        '<div style="padding:0 16px 16px"><button class="btn btn-primary btn-full" onclick="window._editBU()">✏ Edit</button></div>' +
      '</div></div>' +
      '<div class="detail-main"><div class="card">' +
        '<div class="card-header"><h3 class="card-title">Departments (' + myDepts.length + ')</h3>' +
          '<button class="btn btn-ghost btn-sm" onclick="navigateTo(\'/organisation/departments\')">+ Add Department</button></div>' +
        (myDepts.length ?
          '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Department</th><th>Manager</th><th>Headcount</th><th>Status</th></tr></thead><tbody>' +
          myDepts.map(d =>
            '<tr class="tbl-clickable" onclick="navigateTo(\'/organisation/departments/' + d.id + '\')">' +
            '<td><strong>' + v(d.name) + '</strong></td><td>' + v(d.head_name,'—') + '</td><td>' + (d.headcount||0) + '</td>' +
            '<td>' + badge(d.is_active ? 'Active' : 'Inactive') + '</td></tr>'
          ).join('') +
          '</tbody></table></div>' : '<div class="empty-mini">No departments yet</div>'
        ) +
      '</div></div></div>'
    );
    window._editBU = () => buModal(bu, masters);
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// DEPARTMENTS — Tree + Table
// ═══════════════════════════════════════════════════════════════
export async function renderDepts() {
  setPageTitle('Departments', 'Functional divisions within Business Units');
  setBreadcrumb([{ label:'Organisation', url:'/organisation/profile' }, { label:'Departments' }]);
  showLoader();
  try {
    const [rows, masters] = await Promise.all([get('/departments'), getMasters()]);
    let view = 'table', filterStatus = '', sortCol = null, sortDir = 1;

    // Group by BU for tree
    const byBU = {};
    rows.forEach(d => {
      const key = d.business_unit_id || 0;
      const lbl = d.bu_name || d.business_unit || 'Unassigned';
      if (!byBU[key]) byBU[key] = { label: lbl, depts: [] };
      byBU[key].depts.push(d);
    });

    function getFiltered() {
      let data = [...rows];
      if (filterStatus === 'active')   data = data.filter(d => d.is_active == 1);
      if (filterStatus === 'inactive') data = data.filter(d => d.is_active == 0);
      if (sortCol) data.sort((a, b) => String(a[sortCol]||'').localeCompare(String(b[sortCol]||'')) * sortDir);
      return data;
    }

    function renderTree() {
      const data = getFiltered();
      const grouped = {};
      data.forEach(d => {
        const key = d.business_unit_id || 0;
        const lbl = d.bu_name || d.business_unit || 'Unassigned';
        if (!grouped[key]) grouped[key] = { label: lbl, depts: [] };
        grouped[key].depts.push(d);
      });
      if (!data.length) return '<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-title">No departments found</div></div>';
      return Object.entries(grouped).map(([buId, g]) =>
        '<div class="bu-tree-group">' +
          '<div class="bu-tree-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
            '<span class="bu-tree-toggle">▾</span><span class="bu-tree-icon">🏢</span>' +
            '<strong>' + v(g.label) + '</strong>' +
            '<span class="bu-tree-count">' + g.depts.length + ' dept' + (g.depts.length!==1?'s':'') + '</span>' +
          '</div>' +
          '<div class="bu-tree-children">' +
            g.depts.map(d =>
              '<div class="dept-tree-card">' +
                '<div class="dept-tree-left">' +
                  '<div class="dept-tree-icon">📂</div>' +
                  '<div><div class="dept-tree-name">' + v(d.name) + '</div>' +
                  '<div class="dept-tree-meta">' +
                    (d.head_name ? '👤 ' + v(d.head_name) : '') +
                    (d.cost_centre_name ? ' · 💰 ' + v(d.cost_centre_name) : '') +
                    (d.location ? ' · 📍 ' + v(d.location) : '') +
                  '</div></div>' +
                '</div>' +
                '<div class="dept-tree-right">' +
                  '<span class="dept-headcount">' + (d.headcount||0) + ' people</span>' +
                  badge(d.is_active ? 'Active' : 'Inactive') +
                  '<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();navigateTo(\'/organisation/departments/' + d.id + '\')">View</button>' +
                  '<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();window._editDept(' + d.id + ')">✏</button>' +
                '</div>' +
              '</div>'
            ).join('') +
          '</div>' +
        '</div>'
      ).join('');
    }

    function renderTable() {
      const data = getFiltered();
      if (!data.length) return '<div class="empty-mini">No departments found</div>';
      const cols = ['name','bu_name','head_name','cost_centre_name','location','headcount','is_active'];
      const labels = ['Department','Business Unit','Manager','Cost Centre','Location','Headcount','Status'];
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        labels.map((l,i) => '<th class="sortable" onclick="window._deptSort(\'' + cols[i] + '\')">' + l + '<span id="dsort-' + cols[i] + '"> ⇅</span></th>').join('') +
        '<th>Actions</th></tr></thead><tbody>' +
        data.map(d =>
          '<tr class="tbl-clickable" onclick="navigateTo(\'/organisation/departments/' + d.id + '\')">' +
          '<td><strong>' + v(d.name) + '</strong></td>' +
          '<td>' + v(d.bu_name||d.business_unit,'—') + '</td>' +
          '<td>' + v(d.head_name,'—') + '</td>' +
          '<td>' + v(d.cost_centre_name,'—') + '</td>' +
          '<td>' + v(d.location,'—') + '</td>' +
          '<td>' + (d.headcount||0) + '</td>' +
          '<td>' + badge(d.is_active ? 'Active' : 'Inactive') + '</td>' +
          '<td class="tbl-actions" onclick="event.stopPropagation()">' +
            '<button class="btn btn-ghost btn-xs" onclick="window._editDept(' + d.id + ')">✏ Edit</button>' +
            '<button class="btn btn-danger btn-xs" onclick="window._deleteDept(' + d.id + ',\'' + v(d.name,'') + '\')">Delete</button>' +
          '</td></tr>'
        ).join('') +
        '</tbody></table></div></div>';
    }

    function render() {
      document.getElementById('dept-content').innerHTML = view === 'tree' ? renderTree() : renderTable();
      document.getElementById('dept-count').textContent = getFiltered().length + ' departments';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="struct-toolbar">' +
        '<div class="struct-summary">' +
          '<div class="struct-stat">' + rows.length + ' <span>Departments</span></div>' +
          '<div class="struct-stat" id="dept-count">' + rows.length + ' <span>Showing</span></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<select class="fselect" style="width:130px" onchange="window._deptFilter(this.value)">' +
            '<option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>' +
          '</select>' +
          '<div class="view-toggle">' +
            '<button class="view-toggle-btn active" id="btn-tree" onclick="window._deptView(\'tree\')">🌳 Tree</button>' +
            '<button class="view-toggle-btn" id="btn-table" onclick="window._deptView(\'table\')">☰ Table</button>' +
          '</div>' +
          '<button class="btn btn-primary" onclick="window._addDept()">+ Department</button>' +
        '</div>' +
      '</div>' +
      '<div id="dept-content"></div></div>'
    );

    render();
    window._deptView   = v2 => { view = v2; document.getElementById('btn-tree').classList.toggle('active',v2==='tree'); document.getElementById('btn-table').classList.toggle('active',v2==='table'); render(); };
    window._deptFilter = val => { filterStatus = val; render(); };
    window._deptSort   = col => { sortCol===col?sortDir*=-1:(sortCol=col,sortDir=1); render(); };
    window._addDept    = () => deptModal(null, masters);
    window._deleteDept = async (id, name) => {
      if (!confirm('Delete department "' + (name||'this department') + '"? This cannot be undone.')) return;
      try {
        await del('/departments/' + id);
        toast('Department deleted', 'info');
        renderDepts();
      } catch(e) { toast(e.message || 'Delete failed', 'error'); }
    };
    window._editDept   = id => deptModal(rows.find(r => r.id===id), masters);
  } catch(e) { showError(e.message); }
}

function deptModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit: ' + ((existing && existing.name)||'') : '+ New Department', size: 'lg',
    body: '<form id="dept-form" class="form-grid-sm">' +
      '<div class="fg full"><label class="flabel">Name *</label><input class="finput" name="name" value="' + v((existing && existing.name)) + '" required></div>' +
      '<div class="fg"><label class="flabel">Business Unit *</label><select class="fselect" name="business_unit_id" required><option value="">Select BU…</option>' + opts(masters['business-units']||[], (existing && existing.business_unit_id)) + '</select></div>' +
      '<div class="fg"><label class="flabel">Cost Centre</label><select class="fselect" name="cost_centre_id"><option value="">None</option>' + opts(masters['cost-centres']||[], (existing && existing.cost_centre_id)) + '</select></div>' +
      '<div class="fg"><label class="flabel">Manager</label><select class="fselect" name="manager_id"><option value="">None</option>' + opts(masters['employees-lookup']||[], (existing && existing.manager_id)) + '</select></div>' +
      '<div class="fg"><label class="flabel">Location</label><select class="fselect" name="location_id"><option value="">None</option>' + opts(masters['locations']||[], (existing && existing.location_id)) + '</select></div>' +
      '<div class="fg"><label class="flabel">Budget (₹)</label><input class="finput" type="number" name="budget" value="' + v((existing && existing.budget),0) + '"></div>' +
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="is_active"><option value="1"' + ((existing && existing.is_active)!=0?' selected':'') + '>Active</option><option value="0"' + ((existing && existing.is_active)==0?' selected':'') + '>Inactive</option></select></div>' +
      '<div class="fg full"><label class="flabel">Location / Floor</label><input class="finput" name="location" value="' + v((existing && existing.location)) + '" placeholder="Floor, wing, city"></div>' +
      '</form>',
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('dept-form');
      data.is_active = parseInt(data.is_active);
      if (!data.name || !data.name.trim()) { toast('Name is required', 'error'); return; }
      const mgr = (masters['employees-lookup']||[]).find(e => e.id == data.manager_id);
      if (mgr) data.head_name = mgr.name;
      if (isEdit) await put('/departments/' + existing.id, data);
      else await post('/departments', data);
      toast(isEdit ? 'Updated' : 'Created', 'success');
      _masters = null; renderDepts();
    }
  });
}

export async function renderDeptDetail({ id }) {
  showLoader();
  try {
    const [dept, masters] = await Promise.all([get('/departments/' + id).catch(()=>null), getMasters()]);
    if (!dept) { showError('Department not found'); return; }
    setPageTitle(dept.name, dept.bu_name || 'Department');
    setBreadcrumb([{ label:'Departments', url:'/organisation/departments' }, { label: dept.name }]);
    setContent(
      '<div class="detail-layout">' +
      '<div class="detail-sidebar"><div class="card">' +
        '<div class="profile-hero" style="background:linear-gradient(135deg,#2563eb,#1d4ed8)">' +
          '<div style="font-size:48px;margin-bottom:8px">📂</div>' +
          '<div class="profile-name">' + v(dept.name) + '</div>' +
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">' + v(dept.bu_name||'') + '</div>' +
          '<div style="margin-top:8px">' + badge(dept.is_active ? 'Active' : 'Inactive') + '</div>' +
        '</div>' +
        '<div class="profile-meta">' +
          '<div class="meta-row"><span>Manager</span><strong>' + v(dept.head_name,'—') + '</strong></div>' +
          '<div class="meta-row"><span>Budget</span><strong>' + fmt.money(dept.budget) + '</strong></div>' +
          '<div class="meta-row"><span>Cost Centre</span><strong>' + v(dept.cost_centre_name,'—') + '</strong></div>' +
          '<div class="meta-row"><span>Location</span><strong>' + v(dept.location,'—') + '</strong></div>' +
        '</div>' +
        '<div style="padding:0 16px 16px"><button class="btn btn-primary btn-full" onclick="window._editD()">✏ Edit</button></div>' +
      '</div></div>' +
      '<div class="detail-main"><div class="card"><div class="card-header"><h3 class="card-title">Team Members</h3></div><div class="empty-mini">Loading…</div></div></div>' +
      '</div>'
    );
    window._editD = () => deptModal(dept, masters);
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// COST CENTRES
// ═══════════════════════════════════════════════════════════════
export async function renderCostCentres() {
  showLoader();
  try {
    const [rows, masters, depts] = await Promise.all([get('/cost-centres'), getMasters(), get('/departments')]);
    const ccDeptCount = {};
    depts.forEach(d => { if (d.cost_centre_id) ccDeptCount[d.cost_centre_id] = (ccDeptCount[d.cost_centre_id]||0)+1; });

    window._orgRowClick = (entity, id) => navigate('/organisation/cost-centres/' + id);
    window._orgEdit = (entity, id) => { const cc = rows.find(r=>r.id===id); if(cc) ccModal(cc,masters); };
    window._addCC   = () => ccModal(null, masters);

    buildListPage({
      title:'Cost Centres', subtitle:'Budget tracking and GL codes',
      breadcrumb:[{ label:'Organisation', url:'/organisation/profile' }, { label:'Cost Centres' }],
      rows, entityName:'Cost Centres', statusField:'is_active', addLabel:'+ Cost Centre', onAdd:'window._addCC()',
      columns:[
        { label:'Code', key:'code', render: r=>'<span class="badge badge-purple mono">' + v(r.code) + '</span>' },
        { label:'Name', key:'name', render: r=>'<strong>' + v(r.name) + '</strong>' },
        { label:'Business Unit', key:'bu_name', render: r=>v(r.bu_name||r.business_unit,'—') },
        { label:'Budget', key:'budget', render: r=>fmt.money(r.budget) },
        { label:'Departments', key:'id', render: r=>(ccDeptCount[r.id]||0) + ' dept(s)' },
        { label:'Currency', key:'currency', render: r=>v(r.currency,'INR') },
        { label:'Status', key:'is_active', render: r=>badge(r.is_active?'Active':'Inactive') },
      ],
      cardRender: r =>
        '<div class="struct-card" onclick="navigateTo(\'/organisation/cost-centres/'+r.id+'\')">' +
        '<div class="struct-card-header"><div class="struct-card-icon">💰</div>' +
        '<div class="multi-card-actions"><button class="btn btn-ghost btn-xs" onclick="window._orgEdit(\'\','+r.id+')">✏</button></div></div>' +
        '<div class="struct-card-title">' + v(r.name) + '</div>' +
        '<div class="struct-card-code">' + v(r.code) + '</div>' +
        (r.bu_name ? '<div class="struct-card-meta">' + v(r.bu_name) + '</div>' : '') +
        '<div class="struct-card-stats">' +
          '<div class="struct-mini-stat"><span class="struct-mini-val">' + fmt.money(r.budget).replace('₹','') + '</span><span class="struct-mini-label">Budget</span></div>' +
          '<div class="struct-mini-stat"><span class="struct-mini-val">' + (ccDeptCount[r.id]||0) + '</span><span class="struct-mini-label">Depts</span></div>' +
        '</div>' +
        '<div class="struct-card-footer">' + badge(r.is_active?'Active':'Inactive') + '</div>' +
        '</div>',
    });
  } catch(e) { showError(e.message); }
}

function ccModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Cost Centre' : '+ New Cost Centre',
    body: '<form id="cc-form" class="form-grid-sm">' +
      '<div class="fg"><label class="flabel">Code *</label><input class="finput mono" name="code" value="' + v((existing && existing.code)) + '" required placeholder="CC-IT-001"' + (isEdit?' readonly':'') + '></div>' +
      '<div class="fg"><label class="flabel">Name *</label><input class="finput" name="name" value="' + v((existing && existing.name)) + '" required></div>' +
      '<div class="fg"><label class="flabel">Business Unit</label><select class="fselect" name="business_unit_id"><option value="">Cross-BU</option>' + opts(masters['business-units']||[],(existing && existing.business_unit_id)) + '</select></div>' +
      '<div class="fg"><label class="flabel">Budget (₹)</label><input class="finput" type="number" name="budget" value="' + v((existing && existing.budget),0) + '"></div>' +
      '<div class="fg"><label class="flabel">Currency</label><select class="fselect" name="currency">' + opts(['INR','USD','EUR','GBP'],(existing && existing.currency)||'INR') + '</select></div>' +
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="is_active"><option value="1"' + ((existing && existing.is_active)!=0?' selected':'') + '>Active</option><option value="0"' + ((existing && existing.is_active)==0?' selected':'') + '>Inactive</option></select></div>' +
      '</form>',
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('cc-form'); data.is_active = parseInt(data.is_active);
      if (!data.name || !data.name.trim()) { toast('Name is required', 'error'); return; }
      try {
        if (isEdit) await put('/cost-centres/' + existing.id, data);
        else await post('/cost-centres', data);
        toast(isEdit ? 'Updated' : 'Created', 'success');
        _masters = null; renderCostCentres();
      } catch(e) { toast(e.message, 'error'); }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// LOCATIONS
// ═══════════════════════════════════════════════════════════════
const LOC_TYPES = ['HQ','Regional','Branch','Delivery Centre','WFH Hub','Data Centre','Registered Office','Other'];
const LOC_ICONS = { HQ:'🏛', Regional:'🏢', Branch:'🏬', 'Delivery Centre':'💻', 'WFH Hub':'🏠', 'Data Centre':'🖥', 'Registered Office':'📋', Other:'📍' };

export async function renderLocations() {
  showLoader();
  try {
    const [rows, masters] = await Promise.all([get('/locations'), getMasters()]);

    window._orgRowClick = (entity, id) => navigate('/organisation/locations/' + id);
    window._orgEdit     = (entity, id) => locModal(rows.find(r=>r.id===id), masters);
    window._addLoc      = () => locModal(null, masters);
    window._deleteLoc   = async (id) => {
      if (!confirm('Delete this location?')) return;
      await del('/locations/' + id);
      toast('Location deleted', 'info');
      renderLocations();
    };

    buildListPage({
      title:'Locations', subtitle:'Offices and sites',
      breadcrumb:[{ label:'Organisation', url:'/organisation/profile' }, { label:'Locations' }],
      rows, entityName:'Locations', statusField:'is_active', addLabel:'+ Location', onAdd:'window._addLoc()',
      columns:[
        { label:'Name',      key:'name',     render: r=>'<strong>' + v(r.name) + '</strong>' + (r.is_hq?' <span class="badge badge-green">HQ</span>':'') },
        { label:'Type',      key:'type',     render: r=>(LOC_ICONS[r.type]||'📍') + ' ' + v(r.type,'—') },
        { label:'City',      key:'city',     render: r=>v(r.city,'—') },
        { label:'State',     key:'state',    render: r=>v(r.state,'—') },
        { label:'Country',   key:'country',  render: r=>v(r.country,'India') },
        { label:'Phone',     key:'phone',    render: r=>v(r.phone,'—') },
        { label:'Headcount', key:'headcount',render: r=>r.headcount||0 },
        { label:'Status',    key:'is_active',render: r=>badge(r.is_active?'Active':'Inactive') },
      ],
      cardRender: r =>
        '<div class="struct-card loc-card' + (r.is_hq||r.type==='HQ'?' struct-card-hq':'') + '" onclick="navigateTo(\'/organisation/locations/' + r.id + '\')">' +
        '<div class="struct-card-header"><div style="font-size:28px">' + (LOC_ICONS[r.type]||'📍') + '</div>' +
        '<div class="multi-card-actions" onclick="event.stopPropagation()">' +
          '<button class="btn btn-ghost btn-xs" onclick="window._orgEdit(\'\','+r.id+')">✏</button>' +
        '</div></div>' +
        '<div class="struct-card-title">' + v(r.name) + (r.is_hq?' <span class="badge badge-green" style="font-size:10px">HQ</span>':'') + '</div>' +
        '<div class="loc-address">' + (r.city?'📍 '+v(r.city):'') + '</div>' +
        (r.phone ? '<div class="text-muted" style="font-size:11px">📞 ' + v(r.phone) + '</div>' : '') +
        '<div class="struct-card-stats">' +
          '<div class="struct-mini-stat"><span class="struct-mini-val">' + (r.headcount||0) + '</span><span class="struct-mini-label">People</span></div>' +
        '</div>' +
        '<div class="struct-card-footer">' + badge(r.is_active?'Active':'Inactive') + '</div>' +
        '</div>',
    });
  } catch(e) { showError(e.message); }
}

function locModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Location' : '+ New Location', size: 'lg',
    body: '<form id="loc-form" class="form-grid-sm">' +
      '<div class="fg full"><label class="flabel">Name *</label><input class="finput" name="name" value="' + v((existing && existing.name)) + '" required></div>' +
      '<div class="fg"><label class="flabel">Type</label><select class="fselect" name="type">' + opts(LOC_TYPES,(existing && existing.type)||'Regional') + '</select></div>' +
      '<div class="fg"><label class="flabel">Business Unit</label><select class="fselect" name="business_unit_id"><option value="">Shared</option>' + opts(masters['business-units']||[],(existing && existing.business_unit_id)) + '</select></div>' +
      '<div class="fg full"><label class="flabel">Address</label><input class="finput" name="address_line1" value="' + v((existing && existing.address_line1)) + '"></div>' +
      '<div class="fg"><label class="flabel">City *</label><input class="finput" name="city" value="' + v((existing && existing.city)) + '" required></div>' +
      '<div class="fg"><label class="flabel">State</label><input class="finput" name="state" value="' + v((existing && existing.state)) + '" placeholder="e.g. Telangana"></div>' +
      '<div class="fg"><label class="flabel">Country</label><input class="finput" name="country" value="' + v((existing && existing.country),'India') + '"></div>' +
      '<div class="fg"><label class="flabel">Pincode</label><input class="finput mono" name="pincode" value="' + v((existing && existing.pincode)) + '"></div>' +
      '<div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone" value="' + v((existing && existing.phone)) + '"></div>' +
      '<div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="email" value="' + v((existing && existing.email)) + '"></div>' +
      '<div class="fg"><label class="flabel">Headcount</label><input class="finput" type="number" name="headcount" value="' + v((existing && existing.headcount),0) + '"></div>' +
      '<div class="fg"><label class="flabel">Headquarters?</label><select class="fselect" name="is_hq"><option value="0"' + (!(existing && existing.is_hq)?' selected':'') + '>No</option><option value="1"' + ((existing && existing.is_hq)?' selected':'') + '>Yes — HQ</option></select></div>' +
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="is_active"><option value="1"' + ((existing && existing.is_active)!=0?' selected':'') + '>Active</option><option value="0"' + ((existing && existing.is_active)==0?' selected':'') + '>Inactive</option></select></div>' +
      '</form>',
    submitLabel: isEdit ? 'Save' : 'Add',
    onSubmit: async () => {
      const data = fd('loc-form');
      data.is_active = parseInt(data.is_active); data.is_hq = parseInt(data.is_hq||0);
      data.headcount = parseInt(data.headcount||0);
      if (isEdit) await put('/locations/' + existing.id, data);
      else await post('/locations', data);
      toast(isEdit ? 'Updated' : 'Added', 'success');
      _masters = null; renderLocations();
    }
  });
}

export async function renderLocationDetail({ id }) {
  showLoader();
  try {
    const [loc, masters] = await Promise.all([get('/locations/' + id).catch(()=>null), getMasters()]);
    if (!loc) { showError('Location not found'); return; }
    setPageTitle(loc.name, loc.type||'Office');
    setBreadcrumb([{ label:'Locations', url:'/organisation/locations' }, { label:loc.name }]);
    setContent(
      '<div class="detail-layout">' +
      '<div class="detail-sidebar"><div class="card">' +
        '<div class="profile-hero" style="background:linear-gradient(135deg,#0f766e,#0d5c56)">' +
          '<div style="font-size:48px;margin-bottom:8px">' + (LOC_ICONS[loc.type]||'📍') + '</div>' +
          '<div class="profile-name">' + v(loc.name) + '</div>' +
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">' + v(loc.type||'Office') + '</div>' +
          (loc.is_hq ? '<div style="margin-top:8px"><span class="badge badge-green">🏛 Headquarters</span></div>' : '') +
        '</div>' +
        '<div class="profile-meta">' +
          '<div class="meta-row"><span>City</span><strong>' + v(loc.city,'—') + '</strong></div>' +
          '<div class="meta-row"><span>Pincode</span><strong class="mono">' + v(loc.pincode,'—') + '</strong></div>' +
          (loc.phone ? '<div class="meta-row"><span>Phone</span><strong>' + v(loc.phone) + '</strong></div>' : '') +
          (loc.email ? '<div class="meta-row"><span>Email</span><strong>' + v(loc.email) + '</strong></div>' : '') +
          '<div class="meta-row"><span>Headcount</span><strong>' + (loc.headcount||0) + '</strong></div>' +
        '</div>' +
        '<div style="padding:0 16px 16px"><button class="btn btn-primary btn-full" onclick="window._editL()">✏ Edit</button></div>' +
      '</div></div>' +
      '<div class="detail-main"><div class="card"><div class="card-header"><h3 class="card-title">Address</h3></div>' +
        '<div class="card-body">' + v(loc.address_line1,'No address on file') + '</div>' +
      '</div></div></div>'
    );
    window._editL = () => locModal(loc, masters);
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// COST CENTRE DETAIL
// ═══════════════════════════════════════════════════════════════
export async function renderCostCentreDetail({ id }) {
  showLoader();
  try {
    const [cc, masters, depts] = await Promise.all([
      get('/cost-centres/' + id).catch(() => null),
      getMasters(),
      get('/departments'),
    ]);
    if (!cc) { showError('Cost Centre not found'); return; }
    setPageTitle(cc.name, 'Cost Centre — ' + v(cc.code));
    setBreadcrumb([{ label:'Cost Centres', url:'/organisation/cost-centres' }, { label: cc.name }]);

    const linkedDepts = depts.filter(d => d.cost_centre_id == id);

    setContent(
      '<div class="detail-layout">' +
      '<div class="detail-sidebar"><div class="card">' +
        '<div class="profile-hero" style="background:linear-gradient(135deg,#7c3aed,#5b21b6)">' +
          '<div style="font-size:48px;margin-bottom:8px">💰</div>' +
          '<div class="profile-name">' + v(cc.name) + '</div>' +
          '<div class="profile-title" style="color:rgba(255,255,255,.7)">' + v(cc.code) + '</div>' +
          '<div style="margin-top:8px">' + badge(cc.is_active ? 'Active' : 'Inactive') + '</div>' +
        '</div>' +
        '<div class="profile-meta">' +
          '<div class="meta-row"><span>Code</span><strong class="mono">' + v(cc.code) + '</strong></div>' +
          '<div class="meta-row"><span>Business Unit</span><strong>' + v(cc.bu_name || cc.business_unit, '—') + '</strong></div>' +
          '<div class="meta-row"><span>Budget</span><strong>' + fmt.money(cc.budget) + '</strong></div>' +
          '<div class="meta-row"><span>Currency</span><strong>' + v(cc.currency, 'INR') + '</strong></div>' +
          '<div class="meta-row"><span>Departments</span><strong>' + linkedDepts.length + '</strong></div>' +
        '</div>' +
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">' +
          '<button class="btn btn-primary btn-full" onclick="window._editCC()">✏ Edit</button>' +
          '<button class="btn btn-danger btn-full" onclick="window._deleteCC()">Delete</button>' +
        '</div>' +
      '</div></div>' +
      '<div class="detail-main">' +
        '<div class="card">' +
          '<div class="card-header"><h3 class="card-title">Departments using this Cost Centre (' + linkedDepts.length + ')</h3></div>' +
          (linkedDepts.length
            ? '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Department</th><th>Business Unit</th><th>Headcount</th></tr></thead><tbody>' +
              linkedDepts.map(d =>
                '<tr class="tbl-clickable" onclick="navigateTo(\'/organisation/departments/\' + ' + d.id + ' + \'\')">'+
                '<td><strong>' + v(d.name) + '</strong></td>' +
                '<td>' + v(d.bu_name || d.business_unit, '—') + '</td>' +
                '<td>' + (d.headcount || 0) + '</td>' +
                '</tr>'
              ).join('') +
              '</tbody></table></div>'
            : '<div class="empty-mini">No departments linked to this cost centre</div>'
          ) +
        '</div>' +
      '</div></div>'
    );

    window._editCC   = () => ccModal(cc, masters);
    window._deleteCC = async () => {
      if (!confirm('Deactivate this cost centre?')) return;
      await put('/cost-centres/' + id, { is_active: 0 });
      toast('Cost centre deactivated', 'info');
      navigate('/organisation/cost-centres');
    };
  } catch(e) { showError(e.message); }
}
