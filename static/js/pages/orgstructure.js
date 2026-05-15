/**
 * Org Structure — Business Units, Departments, Cost Centres, Locations
 * 
 * Industry Standard Relationships:
 *   Business Unit (top-level division)
 *     ↳ Has many Departments
 *     ↳ Has many Cost Centres
 *     ↳ Has many Locations
 *     ↳ Has a Head (Employee)
 *
 *   Department
 *     ↳ Belongs to Business Unit (required)
 *     ↳ Uses a Cost Centre (optional)
 *     ↳ Located at a Location (optional)
 *     ↳ Has a Manager (Employee)
 *     ↳ Has parent Department (for nested orgs)
 *
 *   Cost Centre
 *     ↳ Belongs to Business Unit (optional)
 *     ↳ Used by many Departments
 *     ↳ Has budget, spend tracking
 *
 *   Location (Office)
 *     ↳ Belongs to Business Unit (optional)
 *     ↳ Has many Departments
 *     ↳ Has many Employees
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable } from '../ui.js';
import { navigate } from '../router.js';

// ─── shared state ──────────────────────────────────────────────
let _masters = null;
async function getMasters() {
  if (_masters) return _masters;
  _masters = await get('/masters/all');
  return _masters;
}

function empOpts(masters, selectedId) {
  return (masters['employees-lookup'] || []).map(e =>
    `<option value="${e.id}" ${e.id == selectedId ? 'selected' : ''}>${e.name}</option>`
  ).join('');
}
function buOpts(bus, selectedId) {
  return bus.map(b =>
    `<option value="${b.id}" ${b.id == selectedId ? 'selected' : ''}>${b.name}</option>`
  ).join('');
}
function ccOpts(ccs, selectedId) {
  return ccs.map(c =>
    `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.name} (${c.code})</option>`
  ).join('');
}
function locOpts(locs, selectedId) {
  return locs.map(l =>
    `<option value="${l.id}" ${l.id == selectedId ? 'selected' : ''}>${l.name}${l.city ? ' — ' + l.city : ''}</option>`
  ).join('');
}
function deptOpts(depts, selectedId, excludeId) {
  return depts.filter(d => d.id != excludeId).map(d =>
    `<option value="${d.id}" ${d.id == selectedId ? 'selected' : ''}>${d.name}</option>`
  ).join('');
}
function v(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  return String(val).replace(/"/g, '&quot;');
}
function fd(formId) {
  const form = document.getElementById(formId);
  const data = Object.fromEntries(new FormData(form));
  Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
  return data;
}

// ═══════════════════════════════════════════════════════════════
// BUSINESS UNITS
// ═══════════════════════════════════════════════════════════════
export async function renderBUs() {
  setPageTitle('Business Units', 'Top-level organisational divisions');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Business Units' }]);
  showLoader();
  try {
    const [rows, masters] = await Promise.all([get('/business-units'), getMasters()]);
    setContent(`
      <div class="page-body">
        <div class="struct-toolbar">
          <div class="struct-summary">
            <div class="struct-stat">${rows.length} <span>Business Units</span></div>
            <div class="struct-stat">${rows.reduce((s,b)=>s+(b.dept_count||0),0)} <span>Departments</span></div>
            <div class="struct-stat">${rows.reduce((s,b)=>s+(b.headcount||0),0)} <span>Total Employees</span></div>
          </div>
          <button class="btn btn-primary" onclick="window._addBU()">+ Add Business Unit</button>
        </div>

        <div class="struct-grid">
          ${rows.map(b => `
            <div class="struct-card ${!b.is_active ? 'struct-card-inactive' : ''}">
              <div class="struct-card-header">
                <div class="struct-card-icon bu-icon">🏢</div>
                <div class="struct-card-actions">
                  <button class="btn btn-ghost btn-xs" onclick="navigateTo('/organisation/business-units/${b.id}')">View</button>
                  <button class="btn btn-ghost btn-xs" onclick="window._editBU(${b.id})">✏</button>
                </div>
              </div>
              <div class="struct-card-title">${b.name}</div>
              ${b.code ? `<div class="struct-card-code">${b.code}</div>` : ''}
              ${b.description ? `<div class="struct-card-desc">${b.description}</div>` : ''}
              ${b.head_name ? `<div class="struct-card-meta">👤 ${b.head_name}</div>` : ''}
              <div class="struct-card-stats">
                <div class="struct-mini-stat"><span class="struct-mini-val">${b.dept_count || 0}</span><span class="struct-mini-label">Depts</span></div>
                <div class="struct-mini-stat"><span class="struct-mini-val">${b.headcount || 0}</span><span class="struct-mini-label">People</span></div>
              </div>
              <div class="struct-card-footer">
                ${badge(b.is_active ? 'Active' : 'Inactive')}
              </div>
            </div>`).join('')}

          <div class="struct-add-card" onclick="window._addBU()">
            <div class="struct-add-icon">+</div>
            <div class="struct-add-label">Add Business Unit</div>
          </div>
        </div>
      </div>`);

    window._addBU  = () => buModal(null, masters);
    window._editBU = (id) => {
      const bu = rows.find(r => r.id === id);
      if (bu) buModal(bu, masters);
    };
  } catch (e) { showError(e.message); }
}

function buModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? `✏ Edit: ${existing.name}` : '+ New Business Unit',
    size: 'lg',
    body: `<form id="bu-form" class="form-grid-sm">
      <div class="fg full">
        <label class="flabel">Business Unit Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required placeholder="e.g. Technology Services, People Operations">
      </div>
      <div class="fg">
        <label class="flabel">Short Code</label>
        <input class="finput mono" name="code" value="${v(existing?.code)}" placeholder="e.g. TECH, HR, FIN">
      </div>
      <div class="fg">
        <label class="flabel">Status</label>
        <select class="fselect" name="is_active">
          <option value="1" ${existing?.is_active != 0 ? 'selected' : ''}>Active</option>
          <option value="0" ${existing?.is_active == 0 ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
      <div class="fg full">
        <label class="flabel">Description</label>
        <input class="finput" name="description" value="${v(existing?.description)}" placeholder="What does this BU do?">
      </div>
      <div class="fg">
        <label class="flabel">Head / Leader</label>
        <select class="fselect" name="head_emp_id">
          <option value="">Select employee…</option>
          ${empOpts(masters, existing?.head_emp_id)}
        </select>
        <div class="field-hint">Will appear in org chart as BU head</div>
      </div>
      <div class="fg">
        <label class="flabel">Primary Office Location</label>
        <select class="fselect" name="location_id">
          <option value="">Select location…</option>
          ${locOpts(masters['locations'] || [], existing?.location_id)}
        </select>
      </div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Create Business Unit',
    onSubmit: async () => {
      const data = fd('bu-form');
      data.is_active = parseInt(data.is_active);
      if (isEdit) await put(`/business-units/${existing.id}`, data);
      else        await post('/business-units', data);
      toast(isEdit ? 'Business unit updated' : 'Business unit created', 'success');
      _masters = null;
      renderBUs();
    }
  });
}

export async function renderBUDetail({ id }) {
  showLoader();
  try {
    const [bu, allDepts, allCCs, allLocs, masters] = await Promise.all([
      get(`/business-units/${id}`),
      get('/departments'),
      get('/cost-centres'),
      get('/locations'),
      getMasters(),
    ]);
    setPageTitle(bu.name, 'Business Unit');
    setBreadcrumb([{ label: 'Business Units', url: '/organisation/business-units' }, { label: bu.name }]);

    const myDepts = allDepts.filter(d => d.business_unit_id == id);
    const myCCs   = allCCs.filter(c => c.business_unit_id == id);
    const myLocs  = allLocs.filter(l => l.business_unit_id == id);

    setContent(`
      <div class="detail-layout">
        <!-- Sidebar -->
        <div class="detail-sidebar">
          <div class="card">
            <div class="profile-hero" style="background:linear-gradient(135deg,#1a5c2e,#144825)">
              <div style="font-size:48px;margin-bottom:8px">🏢</div>
              <div class="profile-name">${bu.name}</div>
              ${bu.code ? `<div class="profile-title" style="color:rgba(255,255,255,.7)">${bu.code}</div>` : ''}
              <div style="margin-top:8px">${badge(bu.is_active ? 'Active' : 'Inactive')}</div>
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>Departments</span><strong>${myDepts.length}</strong></div>
              <div class="meta-row"><span>Cost Centres</span><strong>${myCCs.length}</strong></div>
              <div class="meta-row"><span>Offices</span><strong>${myLocs.length}</strong></div>
              <div class="meta-row"><span>Headcount</span><strong>${bu.headcount || 0}</strong></div>
              ${bu.head_name ? `<div class="meta-row"><span>Head</span><strong>${bu.head_name}</strong></div>` : ''}
            </div>
            <div style="padding:0 16px 16px">
              <button class="btn btn-primary btn-full" onclick="window._editBUFromDetail()">✏ Edit</button>
            </div>
          </div>
        </div>

        <!-- Main -->
        <div class="detail-main">
          ${bu.description ? `<div class="card" style="margin-bottom:16px"><div class="card-body">${bu.description}</div></div>` : ''}

          <!-- Departments -->
          <div class="card" style="margin-bottom:16px">
            <div class="card-header">
              <h3 class="card-title">📂 Departments (${myDepts.length})</h3>
              <button class="btn btn-ghost btn-sm" onclick="window._addDeptForBU(${id})">+ Add</button>
            </div>
            ${myDepts.length ? `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Department</th><th>Manager</th><th>Cost Centre</th><th>Headcount</th><th>Status</th></tr></thead>
              <tbody>${myDepts.map(d => `<tr class="tbl-clickable" onclick="navigateTo('/organisation/departments/${d.id}')">
                <td><strong>${d.name}</strong></td>
                <td>${d.head_name || '—'}</td>
                <td>${d.cost_centre_name || '—'}</td>
                <td class="mono">${d.headcount || 0}</td>
                <td>${badge(d.is_active ? 'Active' : 'Inactive')}</td>
              </tr>`).join('')}</tbody></table></div>` :
              `<div class="empty-mini">No departments in this BU yet</div>`}
          </div>

          <!-- Cost Centres -->
          <div class="card" style="margin-bottom:16px">
            <div class="card-header">
              <h3 class="card-title">💰 Cost Centres (${myCCs.length})</h3>
              <button class="btn btn-ghost btn-sm" onclick="navigateTo('/organisation/cost-centres')">Manage</button>
            </div>
            ${myCCs.length ? `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Budget</th></tr></thead>
              <tbody>${myCCs.map(c => `<tr>
                <td class="mono">${c.code}</td>
                <td><strong>${c.name}</strong></td>
                <td class="mono">${fmt.money(c.budget)}</td>
              </tr>`).join('')}</tbody></table></div>` :
              `<div class="empty-mini">No cost centres linked to this BU</div>`}
          </div>

          <!-- Locations -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">📍 Locations (${myLocs.length})</h3>
              <button class="btn btn-ghost btn-sm" onclick="navigateTo('/organisation/locations')">Manage</button>
            </div>
            ${myLocs.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:16px">
              ${myLocs.map(l => `<div class="multi-card">
                <div class="fw-bold">${l.name}</div>
                <div class="text-muted" style="font-size:12px">${l.city || ''} · ${l.type || ''}</div>
                <div class="text-muted" style="font-size:11px">${l.headcount || 0} people</div>
              </div>`).join('')}
            </div>` : `<div class="empty-mini">No offices linked to this BU</div>`}
          </div>
        </div>
      </div>`);

    window._editBUFromDetail = () => buModal(bu, masters);
    window._addDeptForBU = (buId) => {
      get('/departments').then(allD => {
        get('/cost-centres').then(allCC => {
          get('/locations').then(allL => {
            deptModal(null, { 'business-units': [bu], 'cost-centres': allCC.map ? allCC : [], 'locations': allL, 'employees-lookup': masters['employees-lookup'] || [] }, true);
          });
        });
      });
    };
  } catch (e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════════════
export async function renderDepts() {
  setPageTitle('Departments', 'Functional divisions within Business Units');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Departments' }]);
  showLoader();
  try {
    const [rows, masters] = await Promise.all([get('/departments'), getMasters()]);

    // Group by Business Unit for tree view
    const byBU = {};
    rows.forEach(d => {
      const key = d.business_unit_id || 0;
      const label = d.business_unit || d.bu_name || 'Unassigned';
      if (!byBU[key]) byBU[key] = { label, depts: [] };
      byBU[key].depts.push(d);
    });

    setContent(`
      <div class="page-body">
        <div class="struct-toolbar">
          <div class="struct-summary">
            <div class="struct-stat">${rows.length} <span>Departments</span></div>
            <div class="struct-stat">${rows.reduce((s,d)=>s+(d.headcount||0),0)} <span>Total Employees</span></div>
            <div class="struct-stat">${Object.keys(byBU).length} <span>Business Units</span></div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" id="view-tree-btn" onclick="window._switchView('tree')">🌳 Tree</button>
            <button class="btn btn-ghost" id="view-table-btn" onclick="window._switchView('table')">📋 Table</button>
            <button class="btn btn-primary" onclick="window._addDept()">+ Add Department</button>
          </div>
        </div>

        <!-- Tree View (default) -->
        <div id="view-tree">
          ${Object.entries(byBU).map(([buId, group]) => `
            <div class="bu-tree-group">
              <div class="bu-tree-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <span class="bu-tree-toggle">▾</span>
                <span class="bu-tree-icon">🏢</span>
                <strong>${group.label}</strong>
                <span class="bu-tree-count">${group.depts.length} dept${group.depts.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="bu-tree-children">
                ${group.depts.map(d => `
                  <div class="dept-tree-card">
                    <div class="dept-tree-left">
                      <div class="dept-tree-icon">📂</div>
                      <div>
                        <div class="dept-tree-name">${d.name}</div>
                        <div class="dept-tree-meta">
                          ${d.head_name ? `👤 ${d.head_name}` : ''}
                          ${d.cost_centre_name ? ` · 💰 ${d.cost_centre_name}` : ''}
                          ${d.location ? ` · 📍 ${d.location}` : ''}
                        </div>
                      </div>
                    </div>
                    <div class="dept-tree-right">
                      <span class="dept-headcount">${d.headcount || 0} people</span>
                      ${badge(d.is_active ? 'Active' : 'Inactive')}
                      <button class="btn btn-ghost btn-xs" onclick="navigateTo('/organisation/departments/${d.id}')">View</button>
                      <button class="btn btn-ghost btn-xs" onclick="window._editDept(${d.id})">✏</button>
                    </div>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>

        <!-- Table View (hidden by default) -->
        <div id="view-table" style="display:none">
          <div class="card"><div class="tbl-wrap"><table class="data-table">
            <thead><tr>
              <th>Department</th><th>Business Unit</th><th>Manager</th>
              <th>Cost Centre</th><th>Location</th><th>Headcount</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>${rows.map(d => `<tr>
              <td><strong>${d.name}</strong></td>
              <td>${d.business_unit || d.bu_name || '—'}</td>
              <td>${d.head_name || '—'}</td>
              <td class="mono">${d.cost_centre_name || '—'}</td>
              <td>${d.location || '—'}</td>
              <td class="mono">${d.headcount || 0}</td>
              <td>${badge(d.is_active ? 'Active' : 'Inactive')}</td>
              <td class="tbl-actions">
                <button class="btn btn-ghost btn-xs" onclick="navigateTo('/organisation/departments/${d.id}')">View</button>
                <button class="btn btn-ghost btn-xs" onclick="window._editDept(${d.id})">✏</button>
              </td>
            </tr>`).join('')}</tbody>
          </table></div></div>
        </div>
      </div>`);

    window._switchView = (mode) => {
      document.getElementById('view-tree').style.display  = mode === 'tree'  ? '' : 'none';
      document.getElementById('view-table').style.display = mode === 'table' ? '' : 'none';
    };
    window._addDept  = () => deptModal(null, masters, false);
    window._editDept = (id) => {
      const dept = rows.find(r => r.id === id);
      if (dept) deptModal(dept, masters, false);
    };
  } catch (e) { showError(e.message); }
}

function deptModal(existing, masters, preFillBU) {
  const isEdit = !!existing;
  const bus    = masters['business-units'] || [];
  const ccs    = masters['cost-centres'] || [];
  const locs   = masters['locations'] || [];
  openModal({
    title: isEdit ? `✏ Edit: ${existing.name}` : '+ New Department',
    size: 'lg',
    body: `<form id="dept-form" class="form-grid-sm">
      <div class="fg full">
        <label class="flabel">Department Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required placeholder="e.g. Engineering, Finance, HR">
      </div>
      <div class="fg">
        <label class="flabel">Business Unit *</label>
        <select class="fselect" name="business_unit_id" required>
          <option value="">Select BU…</option>
          ${buOpts(bus, existing?.business_unit_id || (preFillBU ? bus[0]?.id : null))}
        </select>
        <div class="field-hint">Required — every department belongs to a BU</div>
      </div>
      <div class="fg">
        <label class="flabel">Cost Centre</label>
        <select class="fselect" name="cost_centre_id">
          <option value="">None</option>
          ${ccOpts(ccs, existing?.cost_centre_id)}
        </select>
        <div class="field-hint">For budget tracking and GL coding</div>
      </div>
      <div class="fg">
        <label class="flabel">Department Head / Manager</label>
        <select class="fselect" name="manager_id">
          <option value="">Select employee…</option>
          ${empOpts(masters, existing?.manager_id)}
        </select>
      </div>
      <div class="fg">
        <label class="flabel">Office Location</label>
        <select class="fselect" name="location_id">
          <option value="">Select location…</option>
          ${locOpts(locs, existing?.location_id)}
        </select>
        <div class="field-hint">Primary physical location</div>
      </div>
      <div class="fg">
        <label class="flabel">Parent Department</label>
        <select class="fselect" name="parent_dept_id">
          <option value="">None (top-level)</option>
          ${deptOpts(masters['departments'] || [], existing?.parent_dept_id, existing?.id)}
        </select>
        <div class="field-hint">For nested org structures (sub-departments)</div>
      </div>
      <div class="fg">
        <label class="flabel">Annual Budget (₹)</label>
        <input class="finput" type="number" name="budget" value="${v(existing?.budget, 0)}" min="0">
      </div>
      <div class="fg">
        <label class="flabel">Status</label>
        <select class="fselect" name="is_active">
          <option value="1" ${existing?.is_active != 0 ? 'selected' : ''}>Active</option>
          <option value="0" ${existing?.is_active == 0 ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
      <div class="fg full">
        <label class="flabel">Location / Description</label>
        <input class="finput" name="location" value="${v(existing?.location)}" placeholder="Floor / wing / city (free text)">
      </div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Create Department',
    onSubmit: async () => {
      const data = fd('dept-form');
      data.is_active = parseInt(data.is_active);
      // Also set head_name from manager lookup for v1 compatibility
      const mgr = (masters['employees-lookup'] || []).find(e => e.id == data.manager_id);
      if (mgr) data.head_name = mgr.name;
      if (isEdit) await put(`/departments/${existing.id}`, data);
      else        await post('/departments', data);
      toast(isEdit ? 'Department updated' : 'Department created', 'success');
      _masters = null;
      renderDepts();
    }
  });
}

export async function renderDeptDetail({ id }) {
  showLoader();
  try {
    const [dept, allEmps, masters] = await Promise.all([
      get(`/departments/${id}`).catch(() => null),
      get('/employees?per_page=200').catch(() => ({ items: [] })),
      getMasters(),
    ]);
    if (!dept) { showError('Department not found'); return; }
    setPageTitle(dept.name, dept.business_unit || dept.bu_name || 'Department');
    setBreadcrumb([{ label: 'Departments', url: '/organisation/departments' }, { label: dept.name }]);

    const deptEmps = (allEmps.items || []).filter(e => e.department_id == id || e.department_name === dept.name);

    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card">
            <div class="profile-hero" style="background:linear-gradient(135deg,#2563eb,#1d4ed8)">
              <div style="font-size:48px;margin-bottom:8px">📂</div>
              <div class="profile-name">${dept.name}</div>
              <div class="profile-title" style="color:rgba(255,255,255,.75)">${dept.business_unit || dept.bu_name || ''}</div>
              <div style="margin-top:8px">${badge(dept.is_active ? 'Active' : 'Inactive')}</div>
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>Headcount</span><strong>${deptEmps.length}</strong></div>
              <div class="meta-row"><span>Manager</span><strong>${dept.head_name || '—'}</strong></div>
              <div class="meta-row"><span>Cost Centre</span><strong>${dept.cost_centre_name || '—'}</strong></div>
              <div class="meta-row"><span>Budget</span><strong>${fmt.money(dept.budget)}</strong></div>
              ${dept.location ? `<div class="meta-row"><span>Location</span><strong>${dept.location}</strong></div>` : ''}
            </div>
            <div style="padding:0 16px 16px">
              <button class="btn btn-primary btn-full" onclick="window._editDeptDetail()">✏ Edit</button>
              <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="navigateTo('/employees?department_id=${id}')">View Employees →</button>
            </div>
          </div>
        </div>
        <div class="detail-main">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">👥 Team Members (${deptEmps.length})</h3>
              <a href="#/employees/new" class="btn btn-ghost btn-sm">+ Add Employee</a>
            </div>
            ${deptEmps.length ? `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Employee</th><th>Title</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>${deptEmps.map(e => `<tr class="tbl-clickable" onclick="navigateTo('/employees/${e.id}')">
                <td><div class="cell-person">
                  <div class="av av-sm av-green">${fmt.ini(e.first_name + ' ' + e.last_name)}</div>
                  <div><div class="cell-name">${e.first_name} ${e.last_name}</div>
                  <div class="cell-sub">${e.emp_id || ''}</div></div>
                </div></td>
                <td>${e.job_title || '—'}</td>
                <td>${e.employment_type || '—'}</td>
                <td>${badge(e.status)}</td>
              </tr>`).join('')}</tbody>
            </table></div>` : `<div class="empty-mini">No employees in this department yet</div>`}
          </div>
        </div>
      </div>`);

    window._editDeptDetail = () => deptModal(dept, masters, false);
  } catch (e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// COST CENTRES
// ═══════════════════════════════════════════════════════════════
export async function renderCostCentres() {
  setPageTitle('Cost Centres', 'Budget tracking and GL codes');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Cost Centres' }]);
  showLoader();
  try {
    const [rows, masters, depts] = await Promise.all([
      get('/cost-centres'), getMasters(), get('/departments')
    ]);

    // Add dept count to each CC
    const ccDeptCount = {};
    depts.forEach(d => {
      if (d.cost_centre_id) ccDeptCount[d.cost_centre_id] = (ccDeptCount[d.cost_centre_id] || 0) + 1;
    });

    const totalBudget = rows.reduce((s, c) => s + (parseFloat(c.budget) || 0), 0);

    setContent(`
      <div class="page-body">
        <div class="struct-toolbar">
          <div class="struct-summary">
            <div class="struct-stat">${rows.length} <span>Cost Centres</span></div>
            <div class="struct-stat">${fmt.money(totalBudget)} <span>Total Budget</span></div>
          </div>
          <button class="btn btn-primary" onclick="window._addCC()">+ Add Cost Centre</button>
        </div>

        <div class="card">
          <div class="tbl-wrap"><table class="data-table">
            <thead><tr>
              <th>Code</th><th>Name</th><th>Business Unit</th>
              <th>Budget</th><th>Departments</th><th>Currency</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${rows.map(c => `<tr>
                <td><span class="badge badge-purple mono">${c.code}</span></td>
                <td><strong>${c.name}</strong></td>
                <td>${c.bu_name || c.business_unit || '—'}</td>
                <td class="mono">${fmt.money(c.budget)}</td>
                <td class="mono">${ccDeptCount[c.id] || 0} dept${ccDeptCount[c.id] !== 1 ? 's' : ''}</td>
                <td>${c.currency || 'INR'}</td>
                <td>${badge(c.is_active ? 'Active' : 'Inactive')}</td>
                <td class="tbl-actions">
                  <button class="btn btn-ghost btn-xs" onclick="window._editCC(${c.id})">✏ Edit</button>
                  <button class="btn btn-danger btn-xs" onclick="window._deleteCC(${c.id}, '${c.name}', ${ccDeptCount[c.id] || 0})">Delete</button>
                </td>
              </tr>`).join('') || `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:32px">
                No cost centres found. <button class="btn btn-ghost btn-sm" onclick="window._addCC()">Add one</button>
              </td></tr>`}
            </tbody>
          </table></div>
        </div>

        <!-- Dependency Warning -->
        <div class="dep-note">
          <span>💡</span>
          <span>Cost Centres are assigned to Departments for budget tracking. Deleting a Cost Centre that has departments assigned will not delete those departments — they will simply become unlinked.</span>
        </div>
      </div>`);

    window._addCC  = () => ccModal(null, masters);
    window._editCC = (id) => {
      const cc = rows.find(r => r.id === id);
      if (cc) ccModal(cc, masters);
    };
    window._deleteCC = async (id, name, deptCount) => {
      const msg = deptCount > 0
        ? `"${name}" is used by ${deptCount} department(s). Deleting it will unlink those departments. Continue?`
        : `Delete cost centre "${name}"?`;
      if (!confirm(msg)) return;
      await put(`/cost-centres/${id}`, { is_active: 0 });
      toast('Cost centre deactivated', 'info');
      _masters = null;
      renderCostCentres();
    };
  } catch (e) { showError(e.message); }
}

function ccModal(existing, masters) {
  const isEdit = !!existing;
  const bus    = masters['business-units'] || [];
  openModal({
    title: isEdit ? `✏ Edit: ${existing.name}` : '+ New Cost Centre',
    body: `<form id="cc-form" class="form-grid-sm">
      <div class="fg">
        <label class="flabel">Code * <span class="field-hint-inline">(unique GL code)</span></label>
        <input class="finput mono" name="code" value="${v(existing?.code)}" required
          placeholder="e.g. CC-IT-001, CC-HR-02" ${isEdit ? 'readonly' : ''}>
        <div class="field-hint">Used as GL code — cannot be changed after creation</div>
      </div>
      <div class="fg">
        <label class="flabel">Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required
          placeholder="e.g. IT Infrastructure, People & Culture">
      </div>
      <div class="fg">
        <label class="flabel">Business Unit</label>
        <select class="fselect" name="business_unit_id">
          <option value="">Unassigned / Cross-BU</option>
          ${buOpts(bus, existing?.business_unit_id)}
        </select>
        <div class="field-hint">Leave blank if this CC spans multiple BUs</div>
      </div>
      <div class="fg">
        <label class="flabel">Annual Budget</label>
        <input class="finput" type="number" name="budget" value="${v(existing?.budget, 0)}" min="0" step="1000">
      </div>
      <div class="fg">
        <label class="flabel">Currency</label>
        <select class="fselect" name="currency">
          ${['INR','USD','EUR','GBP','SGD','AED'].map(c =>
            `<option ${(existing?.currency||'INR')===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="fg">
        <label class="flabel">Manager / Owner</label>
        <select class="fselect" name="manager_id">
          <option value="">None</option>
          ${empOpts(masters, existing?.manager_id)}
        </select>
      </div>
      <div class="fg">
        <label class="flabel">Status</label>
        <select class="fselect" name="is_active">
          <option value="1" ${existing?.is_active != 0 ? 'selected' : ''}>Active</option>
          <option value="0" ${existing?.is_active == 0 ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Create Cost Centre',
    onSubmit: async () => {
      const data = fd('cc-form');
      data.is_active = parseInt(data.is_active);
      if (isEdit) await put(`/cost-centres/${existing.id}`, data);
      else        await post('/cost-centres', data);
      toast(isEdit ? 'Updated' : 'Created', 'success');
      _masters = null;
      renderCostCentres();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// LOCATIONS
// ═══════════════════════════════════════════════════════════════
export async function renderLocations() {
  setPageTitle('Locations', 'Office & site locations');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Locations' }]);
  showLoader();
  try {
    const [rows, masters, depts] = await Promise.all([
      get('/locations'), getMasters(), get('/departments')
    ]);

    const locDeptCount = {};
    depts.forEach(d => {
      if (d.location_id) locDeptCount[d.location_id] = (locDeptCount[d.location_id] || 0) + 1;
    });

    const LOC_TYPES = ['HQ', 'Regional', 'Branch', 'Delivery Centre', 'WFH Hub', 'Data Centre', 'Registered Office', 'Other'];

    setContent(`
      <div class="page-body">
        <div class="struct-toolbar">
          <div class="struct-summary">
            <div class="struct-stat">${rows.length} <span>Locations</span></div>
            <div class="struct-stat">${rows.filter(l=>l.is_hq||l.type==='HQ').length} <span>HQ</span></div>
            <div class="struct-stat">${rows.reduce((s,l)=>s+(l.headcount||0),0)} <span>Total Headcount</span></div>
          </div>
          <button class="btn btn-primary" onclick="window._addLoc()">+ Add Location</button>
        </div>

        <div class="struct-grid">
          ${rows.map(l => `
            <div class="struct-card loc-card ${l.is_hq||l.type==='HQ' ? 'struct-card-hq' : ''}">
              <div class="struct-card-header">
                <div class="loc-type-badge">${locTypeBadge(l.type)}</div>
                <div class="multi-card-actions">
                  <button class="btn btn-ghost btn-xs" onclick="navigateTo('/organisation/locations/${l.id}')">View</button>
                  <button class="btn btn-ghost btn-xs" onclick="window._editLoc(${l.id})">✏</button>
                </div>
              </div>
              <div class="struct-card-title">${l.name}</div>
              ${(l.is_hq||l.type==='HQ') ? '<span class="badge badge-green" style="margin-bottom:6px">🏛 Headquarters</span>' : ''}
              <div class="loc-address">
                ${l.city ? `📍 ${l.city}` : ''}
                ${l.state_name ? `, ${l.state_name}` : ''}
                ${l.country_name ? ` · ${l.country_name}` : ''}
              </div>
              ${l.address_line1 ? `<div class="text-muted" style="font-size:11px;margin-top:2px">${l.address_line1}${l.pincode ? ' — '+l.pincode : ''}</div>` : ''}
              ${l.phone ? `<div class="text-muted" style="font-size:11px;margin-top:2px">📞 ${l.phone}</div>` : ''}
              <div class="struct-card-stats">
                <div class="struct-mini-stat">
                  <span class="struct-mini-val">${l.headcount || 0}</span>
                  <span class="struct-mini-label">People</span>
                </div>
                <div class="struct-mini-stat">
                  <span class="struct-mini-val">${locDeptCount[l.id] || 0}</span>
                  <span class="struct-mini-label">Depts</span>
                </div>
              </div>
            </div>`).join('')}

          <div class="struct-add-card" onclick="window._addLoc()">
            <div class="struct-add-icon">+</div>
            <div class="struct-add-label">Add Location</div>
          </div>
        </div>
      </div>`);

    window._addLoc  = () => locModal(null, masters, LOC_TYPES);
    window._editLoc = (id) => {
      const loc = rows.find(r => r.id === id);
      if (loc) locModal(loc, masters, LOC_TYPES);
    };
  } catch (e) { showError(e.message); }
}

function locTypeBadge(type) {
  const icons = { HQ:'🏛', Regional:'🏢', Branch:'🏬', 'Delivery Centre':'💻',
                  'WFH Hub':'🏠', 'Data Centre':'🖥', 'Registered Office':'📋', Other:'📍' };
  return `<span style="font-size:18px">${icons[type] || '📍'}</span>`;
}

function locModal(existing, masters, LOC_TYPES) {
  const isEdit = !!existing;
  const bus    = masters['business-units'] || [];
  openModal({
    title: isEdit ? `✏ Edit: ${existing.name}` : '+ New Location',
    size: 'lg',
    body: `<form id="loc-form" class="form-grid-sm">
      <div class="fg full">
        <label class="flabel">Location Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required placeholder="e.g. Hyderabad HQ, Bengaluru Development Centre">
      </div>
      <div class="fg">
        <label class="flabel">Type</label>
        <select class="fselect" name="type">
          ${LOC_TYPES.map(t => `<option ${(existing?.type||'Regional')===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="fg">
        <label class="flabel">Business Unit</label>
        <select class="fselect" name="business_unit_id">
          <option value="">Shared / All BUs</option>
          ${buOpts(bus, existing?.business_unit_id)}
        </select>
      </div>
      <div class="fg full">
        <label class="flabel">Address Line 1</label>
        <input class="finput" name="address_line1" value="${v(existing?.address_line1)}" placeholder="Building, Street">
      </div>
      <div class="fg">
        <label class="flabel">City *</label>
        <input class="finput" name="city" value="${v(existing?.city)}" required placeholder="e.g. Hyderabad">
      </div>
      <div class="fg">
        <label class="flabel">State</label>
        <select class="fselect" name="state_id">
          <option value="">Select state…</option>
          ${(masters['locations'] || []).length === 0 ? '' : ''}
          ${/* Use static Indian states for now */
          ['Andhra Pradesh','Telangana','Karnataka','Tamil Nadu','Maharashtra','Delhi','Gujarat',
           'Rajasthan','Uttar Pradesh','West Bengal','Madhya Pradesh','Punjab','Haryana','Kerala',
           'Bihar','Odisha','Assam','Jharkhand','Uttarakhand','Goa','Other'].map(s =>
            `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div class="fg">
        <label class="flabel">Pincode</label>
        <input class="finput mono" name="pincode" value="${v(existing?.pincode)}" placeholder="500001">
      </div>
      <div class="fg">
        <label class="flabel">Phone</label>
        <input class="finput" name="phone" value="${v(existing?.phone)}" placeholder="+91 40 XXXXXXXX">
      </div>
      <div class="fg">
        <label class="flabel">Email</label>
        <input class="finput" type="email" name="email" value="${v(existing?.email)}" placeholder="hyderabad@company.com">
      </div>
      <div class="fg">
        <label class="flabel">Location Manager</label>
        <select class="fselect" name="manager_id">
          <option value="">None</option>
          ${empOpts(masters, existing?.manager_id)}
        </select>
      </div>
      <div class="fg">
        <label class="flabel">Headcount</label>
        <input class="finput" type="number" name="headcount" value="${v(existing?.headcount, 0)}" min="0">
      </div>
      <div class="fg">
        <label class="flabel">Mark as HQ?</label>
        <select class="fselect" name="is_hq">
          <option value="0" ${!existing?.is_hq ? 'selected' : ''}>No</option>
          <option value="1" ${existing?.is_hq ? 'selected' : ''}>Yes — Headquarters</option>
        </select>
      </div>
      <div class="fg">
        <label class="flabel">Status</label>
        <select class="fselect" name="is_active">
          <option value="1" ${existing?.is_active != 0 ? 'selected' : ''}>Active</option>
          <option value="0" ${existing?.is_active == 0 ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Add Location',
    onSubmit: async () => {
      const data = fd('loc-form');
      data.is_active = parseInt(data.is_active);
      data.is_hq     = parseInt(data.is_hq);
      data.headcount = parseInt(data.headcount || 0);
      if (isEdit) await put(`/locations/${existing.id}`, data);
      else        await post('/locations', data);
      toast(isEdit ? 'Location updated' : 'Location added', 'success');
      _masters = null;
      renderLocations();
    }
  });
}

export async function renderLocationDetail({ id }) {
  showLoader();
  try {
    const [loc, masters, depts] = await Promise.all([
      get(`/locations/${id}`).catch(() => null),
      getMasters(),
      get('/departments'),
    ]);
    if (!loc) { showError('Location not found'); return; }
    setPageTitle(loc.name, loc.type || 'Office');
    setBreadcrumb([{ label: 'Locations', url: '/organisation/locations' }, { label: loc.name }]);

    const locDepts = depts.filter(d => d.location_id == id || d.location === loc.name);

    setContent(`<div class="detail-layout">
      <div class="detail-sidebar">
        <div class="card">
          <div class="profile-hero" style="background:linear-gradient(135deg,#0f766e,#0d5c56)">
            <div style="font-size:48px;margin-bottom:8px">${locTypeBadge(loc.type)}</div>
            <div class="profile-name">${loc.name}</div>
            <div class="profile-title" style="color:rgba(255,255,255,.75)">${loc.type || 'Office'}</div>
            ${loc.is_hq ? '<div style="margin-top:8px"><span class="badge badge-green">🏛 Headquarters</span></div>' : ''}
          </div>
          <div class="profile-meta">
            <div class="meta-row"><span>City</span><strong>${loc.city || '—'}</strong></div>
            <div class="meta-row"><span>State</span><strong>${loc.state_name || '—'}</strong></div>
            <div class="meta-row"><span>Pincode</span><strong class="mono">${loc.pincode || '—'}</strong></div>
            ${loc.phone ? `<div class="meta-row"><span>Phone</span><strong>${loc.phone}</strong></div>` : ''}
            ${loc.email ? `<div class="meta-row"><span>Email</span><strong>${loc.email}</strong></div>` : ''}
            <div class="meta-row"><span>Headcount</span><strong>${loc.headcount || 0}</strong></div>
          </div>
          <div style="padding:0 16px 16px">
            <button class="btn btn-primary btn-full" onclick="window._editLocDetail()">✏ Edit</button>
          </div>
        </div>
      </div>
      <div class="detail-main">
        <div class="card">
          <div class="card-header"><h3 class="card-title">📂 Departments at this Location (${locDepts.length})</h3></div>
          ${locDepts.length ? `<div class="tbl-wrap"><table class="data-table">
            <thead><tr><th>Department</th><th>Business Unit</th><th>Manager</th><th>Headcount</th></tr></thead>
            <tbody>${locDepts.map(d => `<tr class="tbl-clickable" onclick="navigateTo('/organisation/departments/${d.id}')">
              <td><strong>${d.name}</strong></td>
              <td>${d.business_unit || d.bu_name || '—'}</td>
              <td>${d.head_name || '—'}</td>
              <td class="mono">${d.headcount || 0}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : '<div class="empty-mini">No departments assigned to this location</div>'}
        </div>
      </div>
    </div>`);

    const LOC_TYPES = ['HQ','Regional','Branch','Delivery Centre','WFH Hub','Data Centre','Registered Office','Other'];
    window._editLocDetail = () => locModal(loc, masters, LOC_TYPES);
  } catch (e) { showError(e.message); }
}
