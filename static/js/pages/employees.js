import { get, post, put, del }    from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, confirm, renderTable, badge, fmt, renderPagination } from '../ui.js';
import { navigate }               from '../router.js';

let _page = 1;

export async function renderList(params, page = 1) {
  _page = page;
  setPageTitle('Employees', 'All staff members');
  setBreadcrumb([{ label: 'Employees' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([
      get(`/employees?page=${page}&per_page=25`),
      get('/masters/all'),
    ]);
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <input class="search-input" id="emp-search" placeholder="Search employees…" type="search">
          <button class="btn btn-primary" onclick="window._addEmployee()">+ Add Employee</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Employee',    key: 'id',   render: r => `
              <div class="cell-person">
                <div class="av av-sm ${fmt.avColor(r.first_name+' '+r.last_name)}">${fmt.ini(r.first_name+' '+r.last_name)}</div>
                <div><div class="cell-name">${r.first_name} ${r.last_name}</div>
                <div class="cell-sub">${r.emp_id||'—'}</div></div>
              </div>` },
            { label: 'Title',       key: 'job_title',       render: r => r.job_title || '—' },
            { label: 'Department',  key: 'department_name', render: r => r.department_name || '—' },
            { label: 'Type',        key: 'employment_type', render: r => r.employment_type || '—' },
            { label: 'Status',      key: 'status',          render: r => badge(r.status) },
            { label: 'Joined',      key: 'start_date',      render: r => fmt.date(r.start_date) },
          ],
          rows,
          onRowClick: r => navigate(`/employees/${r.id}`),
          emptyMessage: 'No employees found',
        })}
        ${renderPagination(data, `window._empPage`)}
      </div>`);

    window._empPage = (p) => renderList({}, p);
    window._addEmployee = () => renderNew();

    // Search
    const searchEl = document.getElementById('emp-search');
    let st;
    searchEl.oninput = () => {
      clearTimeout(st);
      st = setTimeout(async () => {
        const q = searchEl.value.trim();
        const res = await get(`/employees?q=${encodeURIComponent(q)}`);
        document.querySelector('.tbl-wrap').outerHTML = renderTable({
          columns: [
            { label: 'Employee', key: 'id', render: r => `<div class="cell-person"><div class="av av-sm ${fmt.avColor(r.first_name+' '+r.last_name)}">${fmt.ini(r.first_name+' '+r.last_name)}</div><div><div class="cell-name">${r.first_name} ${r.last_name}</div><div class="cell-sub">${r.emp_id||'—'}</div></div></div>` },
            { label: 'Title',      key: 'job_title',       render: r => r.job_title||'—' },
            { label: 'Department', key: 'department_name', render: r => r.department_name||'—' },
            { label: 'Status',     key: 'status',          render: r => badge(r.status) },
          ],
          rows: res.items || [],
          onRowClick: r => navigate(`/employees/${r.id}`),
        });
      }, 350);
    };
  } catch (e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [emp, masters] = await Promise.all([
      get(`/employees/${id}`),
      get('/masters/all'),
    ]);
    const name = `${emp.first_name} ${emp.last_name}`;
    setPageTitle(name, emp.job_title || 'Employee');
    setBreadcrumb([{ label: 'Employees', url: '/employees' }, { label: name }]);

    setContent(`
      <div class="detail-layout">
        <!-- Left sidebar -->
        <div class="detail-sidebar">
          <div class="card profile-card">
            <div class="profile-hero">
              <div class="av av-lg ${fmt.avColor(name)}">${fmt.ini(name)}</div>
              <div class="profile-name">${name}</div>
              <div class="profile-title">${emp.job_title || '—'}</div>
              <div class="profile-badge">${badge(emp.status)}</div>
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>EMP ID</span><strong>${emp.emp_id||'—'}</strong></div>
              <div class="meta-row"><span>Email</span><strong>${emp.email||'—'}</strong></div>
              <div class="meta-row"><span>Phone</span><strong>${emp.phone||'—'}</strong></div>
              <div class="meta-row"><span>Dept</span><strong>${emp.department_name||'—'}</strong></div>
              <div class="meta-row"><span>Joined</span><strong>${fmt.date(emp.start_date)}</strong></div>
            </div>
            <div class="profile-actions">
              <button class="btn btn-primary btn-full" onclick="window._editEmp()">✏ Edit</button>
            </div>
          </div>
        </div>
        <!-- Main content tabs -->
        <div class="detail-main">
          <div class="tab-bar">
            <button class="tab active" data-tab="personal">Personal</button>
            <button class="tab" data-tab="employment">Employment</button>
            <button class="tab" data-tab="identity">Identity</button>
            <button class="tab" data-tab="finance">Finance</button>
            <button class="tab" data-tab="documents">Documents</button>
          </div>
          <div id="tab-content">
            ${renderPersonalTab(emp)}
          </div>
        </div>
      </div>`);

    // Tab switching
    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const tab = t.dataset.tab;
        const content = {
          personal:   renderPersonalTab(emp),
          employment: renderEmploymentTab(emp),
          identity:   renderIdentityTab(emp),
          finance:    renderFinanceTab(emp),
          documents:  '<div class="card p-lg"><div class="empty-mini">Documents coming soon</div></div>',
        };
        document.getElementById('tab-content').innerHTML = content[tab] || '';
      };
    });

    window._editEmp = () => openEditModal(emp, masters, id);
  } catch (e) { showError(e.message); }
}

export async function renderNew() {
  navigate('/employees/new');
  setPageTitle('New Employee', 'Add a new employee');
  setBreadcrumb([{ label: 'Employees', url: '/employees' }, { label: 'New' }]);
  const masters = await get('/masters/all');
  setContent(`
    <div class="page-body">
      <div class="card form-card">
        <div class="card-header"><h3 class="card-title">New Employee</h3></div>
        <form id="emp-form" class="form-grid">
          <div class="form-section-title">Personal</div>
          <div class="fg"><label class="flabel">First Name *</label><input class="finput" name="first_name" required></div>
          <div class="fg"><label class="flabel">Last Name *</label><input class="finput" name="last_name" required></div>
          <div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="email"></div>
          <div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone"></div>
          <div class="form-section-title">Employment</div>
          <div class="fg"><label class="flabel">Job Title</label><input class="finput" name="job_title"></div>
          <div class="fg"><label class="flabel">Department</label>
            <select class="fselect" name="department_id">
              <option value="">Select…</option>
              ${(masters['departments']||[]).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            </select></div>
          <div class="fg"><label class="flabel">Employment Type</label>
            <select class="fselect" name="employment_type_id">
              <option value="">Select…</option>
              ${(masters['employment-types']||[]).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select></div>
          <div class="fg"><label class="flabel">Start Date</label><input class="finput" type="date" name="start_date"></div>
          <div class="fg"><label class="flabel">Reporting Manager</label>
            <select class="fselect" name="reporting_manager_id">
              <option value="">Select…</option>
              ${(masters['employees-lookup']||[]).map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
            </select></div>
          <div class="fg"><label class="flabel">Location</label><input class="finput" name="location"></div>
          <div class="form-section-title">Salary</div>
          <div class="fg"><label class="flabel">Monthly Salary (₹)</label><input class="finput" type="number" name="salary"></div>
          <div class="fg"><label class="flabel">Bill Rate (₹/hr)</label><input class="finput" type="number" name="bill_rate"></div>
        </form>
        <div class="form-actions">
          <button class="btn btn-ghost" onclick="navigateTo('/employees')">Cancel</button>
          <button class="btn btn-primary" onclick="window._saveNewEmp()">Save Employee</button>
        </div>
      </div>
    </div>`);

  window._saveNewEmp = async () => {
    const form = document.getElementById('emp-form');
    const data = Object.fromEntries(new FormData(form));
    // clean empty strings
    Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
    try {
      const res = await post('/employees', data);
      toast('Employee created', 'success');
      navigate(`/employees/${res.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };
}

function openEditModal(emp, masters, id) {
  openModal({
    title: 'Edit Employee',
    size: 'lg',
    submitLabel: 'Save Changes',
    body: `<form id="edit-emp-form" class="form-grid-sm">
      <div class="fg"><label class="flabel">First Name</label><input class="finput" name="first_name" value="${emp.first_name||''}"></div>
      <div class="fg"><label class="flabel">Last Name</label><input class="finput" name="last_name" value="${emp.last_name||''}"></div>
      <div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="email" value="${emp.email||''}"></div>
      <div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone" value="${emp.phone||''}"></div>
      <div class="fg"><label class="flabel">Job Title</label><input class="finput" name="job_title" value="${emp.job_title||''}"></div>
      <div class="fg"><label class="flabel">Status</label>
        <select class="fselect" name="status">
          ${['Active','Inactive','On Leave','Terminated'].map(s => `<option ${emp.status===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Department</label>
        <select class="fselect" name="department_id">
          <option value="">Select…</option>
          ${(masters['departments']||[]).map(d => `<option value="${d.id}" ${emp.department_id==d.id?'selected':''}>${d.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Reporting Manager</label>
        <select class="fselect" name="reporting_manager_id">
          <option value="">None</option>
          ${(masters['employees-lookup']||[]).filter(e=>e.id!=id).map(e => `<option value="${e.id}" ${emp.reporting_manager_id==e.id?'selected':''}>${e.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Salary (₹)</label><input class="finput" type="number" name="salary" value="${emp.salary||''}"></div>
      <div class="fg"><label class="flabel">Location</label><input class="finput" name="location" value="${emp.location||''}"></div>
    </form>`,
    onSubmit: async () => {
      const data = Object.fromEntries(new FormData(document.getElementById('edit-emp-form')));
      Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
      await put(`/employees/${id}`, data);
      toast('Saved', 'success');
      renderDetail({ id });
    }
  });
}

function renderPersonalTab(e) {
  return `<div class="card"><div class="card-body">
    <div class="field-grid">
      ${field('First Name',    e.first_name)}${field('Last Name',     e.last_name)}
      ${field('Middle Name',   e.middle_name)}${field('Date of Birth', fmt.date(e.dob))}
      ${field('Gender',        e.gender)}${field('Marital Status',  e.marital_status)}
      ${field('Nationality',   e.nationality)}${field('Blood Group',   e.blood_group)}
      ${field('Personal Email',e.personal_email)}${field('Personal Phone',e.personal_phone)}
    </div>
  </div></div>`;
}

function renderEmploymentTab(e) {
  return `<div class="card"><div class="card-body">
    <div class="field-grid">
      ${field('Job Title',        e.job_title)}${field('Department',     e.department_name)}
      ${field('Business Unit',    e.business_unit_name)}${field('Employment Type',e.employment_type)}
      ${field('Client',           e.client_name)}${field('Location',      e.location)}
      ${field('Start Date',       fmt.date(e.start_date))}${field('End Date',   fmt.date(e.end_date))}
      ${field('Reporting Manager',e.reporting_manager_name)}${field('Notice Period',e.notice_period ? e.notice_period+' days' : null)}
      ${field('Status',           e.status)}${field('EMP ID', e.emp_id)}
    </div>
  </div></div>`;
}

function renderIdentityTab(e) {
  return `<div class="card"><div class="card-body">
    <div class="field-grid">
      ${field('PAN',         e.pan,            true)}${field('Aadhaar',    e.aadhaar,       true)}
      ${field('Passport',    e.passport_number,true)}${field('PF Number',  e.pf_number,     true)}
      ${field('ESI Number',  e.esi_number,     true)}${field('UAN',        e.uan,           true)}
    </div>
  </div></div>`;
}

function renderFinanceTab(e) {
  return `<div class="card"><div class="card-body">
    <div class="field-grid">
      ${field('Salary',         e.salary ? '₹'+Number(e.salary).toLocaleString('en-IN') : null)}
      ${field('Bill Rate',      e.bill_rate ? '₹'+e.bill_rate+'/hr' : null)}
      ${field('Bank Name',      e.bank_name)}
      ${field('Account Number', e.bank_account_number, true)}
      ${field('IFSC Code',      e.bank_ifsc, true)}
    </div>
  </div></div>`;
}

function field(label, value, mono = false) {
  return `<div class="field-item">
    <div class="field-label">${label}</div>
    <div class="field-value ${mono?'mono':''}${!value?' empty':''}">${value||'—'}</div>
  </div>`;
}
