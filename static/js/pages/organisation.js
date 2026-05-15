import { get, post, put, del } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable } from '../ui.js';
import { navigate }            from '../router.js';

export async function renderProfile() {
  setPageTitle('Organisation Profile', 'Company information');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Profile' }]);
  showLoader();
  try {
    const org = await get('/organisation');
    setContent(`
      <div class="page-body"><div class="card form-card">
        <div class="card-header">
          <h3 class="card-title">Organisation Profile</h3>
          <button class="btn btn-primary btn-sm" onclick="window._editOrg()">✏ Edit</button>
        </div>
        <div class="card-body">
          <div class="field-grid">
            ${f('Legal Name',  org.legal_name||org.name)}${f('Type',       org.type)}
            ${f('PAN',         org.pan,          true)}${f('TAN',          org.tan,          true)}
            ${f('CIN',         org.cin,          true)}${f('GSTIN',        org.gstin,        true)}
            ${f('Email',       org.email)}${f('Phone',       org.phone)}
            ${f('Website',     org.website)}${f('City',         org.city)}
          </div>
        </div>
      </div></div>`);

    window._editOrg = () => openModal({
      title: 'Edit Organisation',
      size: 'lg',
      body: `<form id="org-form" class="form-grid-sm">
        <div class="fg"><label class="flabel">Name</label><input class="finput" name="name" value="${org.name||''}"></div>
        <div class="fg"><label class="flabel">Legal Name</label><input class="finput" name="legal_name" value="${org.legal_name||''}"></div>
        <div class="fg"><label class="flabel">PAN</label><input class="finput" name="pan" value="${org.pan||''}"></div>
        <div class="fg"><label class="flabel">TAN</label><input class="finput" name="tan" value="${org.tan||''}"></div>
        <div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="email" value="${org.email||''}"></div>
        <div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone" value="${org.phone||''}"></div>
        <div class="fg"><label class="flabel">Website</label><input class="finput" name="website" value="${org.website||''}"></div>
        <div class="fg"><label class="flabel">City</label><input class="finput" name="city" value="${org.city||''}"></div>
      </form>`,
      submitLabel: 'Save',
      onSubmit: async () => {
        const data = Object.fromEntries(new FormData(document.getElementById('org-form')));
        await put('/organisation', data);
        toast('Saved', 'success');
        renderProfile();
      }
    });
  } catch (e) { showError(e.message); }
}

async function listPage(title, bc, apiPath, cols, addFn, rowClick) {
  setPageTitle(title, '');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: bc }]);
  showLoader();
  try {
    const rows = await get(apiPath);
    setContent(`<div class="page-body">
      <div class="list-toolbar"><div></div><button class="btn btn-primary" onclick="window._addItem()">+ Add</button></div>
      ${renderTable({ columns: cols, rows: Array.isArray(rows)?rows:[], emptyMessage:`No ${title.toLowerCase()} found`, onRowClick: rowClick })}
    </div>`);
    window._addItem = addFn;
  } catch (e) { showError(e.message); }
}

export async function renderBUs() {
  await listPage('Business Units', 'Business Units', '/business-units',
    [{ label:'Name', key:'name', render:r=>`<strong>${r.name}</strong>` },
     { label:'Code', key:'code' },
     { label:'Departments', key:'dept_count' },
     { label:'Headcount', key:'headcount' },
     { label:'Status', key:'is_active', render:r=>badge(r.is_active?'Active':'Inactive') }],
    () => openAddModal('Business Unit', [['Name','name',true],['Code','code']], '/business-units', renderBUs),
    r => navigate(`/organisation/business-units/${r.id}`)
  );
}

export async function renderBUDetail({ id }) {
  showLoader();
  const bu = await get(`/business-units/${id}`);
  setPageTitle(bu.name, 'Business Unit');
  setBreadcrumb([{ label:'Business Units', url:'/organisation/business-units' }, { label:bu.name }]);
  setContent(`<div class="page-body"><div class="card"><div class="card-body">
    <div class="field-grid">
      ${f('Name', bu.name)}${f('Code', bu.code)}${f('Status', bu.is_active?'Active':'Inactive')}
    </div>
  </div></div></div>`);
}

export async function renderDepts() {
  await listPage('Departments', 'Departments', '/departments',
    [{ label:'Name', key:'name', render:r=>`<strong>${r.name}</strong>` },
     { label:'Business Unit', key:'bu_name' },
     { label:'Cost Centre', key:'cc_name' },
     { label:'Headcount', key:'headcount' },
     { label:'Status', key:'is_active', render:r=>badge(r.is_active?'Active':'Inactive') }],
    async () => {
      const bus = await get('/lookup/business-units');
      openAddModal('Department',
        [['Name','name',true],['Code','code'],['Business Unit','business_unit_id',false,'select',bus]],
        '/departments', renderDepts);
    },
    r => navigate(`/organisation/departments/${r.id}`)
  );
}

export async function renderDeptDetail({ id }) {
  const dept = await get(`/departments/${id}`);
  setPageTitle(dept.name, 'Department');
  setBreadcrumb([{ label:'Departments', url:'/organisation/departments' }, { label:dept.name }]);
  setContent(`<div class="page-body"><div class="card"><div class="card-body">
    <div class="field-grid">${f('Name',dept.name)}${f('Business Unit',dept.bu_name)}${f('Code',dept.code)}</div>
  </div></div></div>`);
}

export async function renderCostCentres() {
  await listPage('Cost Centres', 'Cost Centres', '/cost-centres',
    [{ label:'Name', key:'name', render:r=>`<strong>${r.name}</strong>` },
     { label:'Code', key:'code' }, { label:'Business Unit', key:'bu_name' }],
    () => openAddModal('Cost Centre', [['Name','name',true],['Code','code']], '/cost-centres', renderCostCentres),
    null);
}

export async function renderLocations() {
  await listPage('Locations', 'Locations', '/locations',
    [{ label:'Name', key:'name', render:r=>`<strong>${r.name}</strong>` },
     { label:'City', key:'city' }, { label:'State', key:'state' },
     { label:'HQ', key:'is_hq', render:r=>r.is_hq?'★ HQ':'' }],
    () => openAddModal('Location',
      [['Name','name',true],['City','city'],['State','state'],['Address','address'],['Pincode','pincode']],
      '/locations', renderLocations),
    null);
}

function openAddModal(entity, fields, apiPath, reloadFn) {
  openModal({
    title: `Add ${entity}`,
    body: `<form id="add-form" class="form-grid-sm">
      ${fields.map(([label, name, req, type, opts]) => {
        if (type === 'select' && opts) {
          return `<div class="fg"><label class="flabel">${label}${req?' *':''}</label>
            <select class="fselect" name="${name}" ${req?'required':''}>
              <option value="">Select…</option>
              ${opts.map(o=>`<option value="${o.id}">${o.name}</option>`).join('')}
            </select></div>`;
        }
        return `<div class="fg"><label class="flabel">${label}${req?' *':''}</label>
          <input class="finput" name="${name}" ${req?'required':''}></div>`;
      }).join('')}
    </form>`,
    submitLabel: `Add ${entity}`,
    onSubmit: async () => {
      const data = Object.fromEntries(new FormData(document.getElementById('add-form')));
      Object.keys(data).forEach(k => { if (data[k]==='') data[k]=null; });
      await post(apiPath, data);
      toast(`${entity} added`, 'success');
      reloadFn();
    }
  });
}

function f(l, v, mono=false) {
  return `<div class="field-item"><div class="field-label">${l}</div>
    <div class="field-value${!v?' empty':''}${mono?' mono':''}">${v||'—'}</div></div>`;
}
