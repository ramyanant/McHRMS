import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData, debounce } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

let _page = 1, _search = '', _dept = '';

export async function renderEmployees() {
  const data = await API.employees({ page:_page, per_page:25, q:_search, department_id:_dept });
  if (!data) return;
  const depts = getMaster('departments');

  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Employees <span style="font-size:14px;font-weight:400;color:var(--txt2)">(${data.total})</span></div>
      <button class="btn btn-primary" onclick="window.go('/employees/new')">+ Add Employee</button>
    </div>
    <div class="filter-bar">
      <input class="input search-input" placeholder="Search by name, ID, email…" value="${_search}"
        oninput="window._empSearch(this.value)">
      <select class="select" style="width:200px" onchange="window._empDept(this.value)">
        <option value="">All Departments</option>
        ${depts.map(d=>`<option value="${d.id}" ${_dept==d.id?'selected':''}>${d.name}</option>`).join('')}
      </select>
    </div>
    <div class="card">
      <div class="table-container">
        <table>
          <thead><tr><th>Emp ID</th><th>Name</th><th>Title</th><th>Department</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            ${(data.items||[]).map(e=>`<tr style="cursor:pointer" onclick="window.go('/employees/${e.id}')">
              <td class="td-mono">${e.emp_id||'—'}</td>
              <td><strong>${e.first_name} ${e.last_name}</strong><br><small style="color:var(--txt3)">${e.email||''}</small></td>
              <td>${e.job_title||'—'}</td>
              <td>${e.department_name||'—'}</td>
              <td>${e.employment_type||'—'}</td>
              <td>${pillStatus(e.status)}</td>
            </tr>`).join('')}
            ${!data.items?.length?'<tr><td colspan="6"><div class="empty-state"><div class="empty-state-title">No employees found</div></div></td></tr>':''}
          </tbody>
        </table>
      </div>
      ${renderPagination(data)}
    </div>
  `);

  window._empSearch = debounce(v => { _search=v; _page=1; renderEmployees(); }, 300);
  window._empDept   = v => { _dept=v; _page=1; renderEmployees(); };
}

function renderPagination(data) {
  if (data.pages <= 1) return '';
  const btns = [];
  for (let i=1; i<=data.pages; i++) {
    if (i===1||i===data.pages||Math.abs(i-_page)<=2) {
      btns.push(`<button class="page-btn ${i===_page?'active':''}" onclick="window._empPage(${i})">${i}</button>`);
    } else if (btns[btns.length-1]!=='…') btns.push('…');
  }
  return `<div class="pagination">${btns.join('')}</div>`;
}
window._empPage = p => { _page=p; renderEmployees(); };

export async function renderEmployeeNew() {
  const masters = getMaster.bind(null);
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">New Employee</div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Personal & Employment Details</div></div>
      <div class="card-body">
        <form id="emp-form">
          <div class="form-grid">
            <div class="field"><label class="label">First Name <span class="req">*</span></label>
              <input class="input" name="first_name" required></div>
            <div class="field"><label class="label">Last Name <span class="req">*</span></label>
              <input class="input" name="last_name" required></div>
            <div class="field"><label class="label">Work Email</label>
              <input class="input" type="email" name="email"></div>
            <div class="field"><label class="label">Phone</label>
              <input class="input" name="phone"></div>
            <div class="field"><label class="label">Job Title</label>
              <input class="input" name="job_title"></div>
            <div class="field"><label class="label">Department</label>
              <select class="select" name="department_id">
                ${buildOptions(getMaster('departments'),'id','name','','Select Department')}
              </select></div>
            <div class="field"><label class="label">Employment Type</label>
              <select class="select" name="employment_type_id">
                ${buildOptions(getMaster('employment-types'),'id','name','','Select Type')}
              </select></div>
            <div class="field"><label class="label">Reporting Manager</label>
              <select class="select" name="reporting_manager_id">
                ${buildOptions(getMaster('employees-lookup'),'id','name','','None')}
              </select></div>
            <div class="field"><label class="label">Client</label>
              <select class="select" name="client_id">
                ${buildOptions(getMaster('clients-lookup'),'id','name','','None')}
              </select></div>
            <div class="field"><label class="label">Start Date</label>
              <input class="input" type="date" name="start_date"></div>
            <div class="field"><label class="label">Status</label>
              <select class="select" name="status">
                <option>Active</option><option>On Leave</option><option>Inactive</option>
              </select></div>
            <div class="field"><label class="label">Location</label>
              <input class="input" name="location"></div>
          </div>
          <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
            <button type="button" class="btn btn-secondary" onclick="window.go('/employees')">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="window._saveEmp()">Create Employee</button>
          </div>
        </form>
      </div>
    </div>
  `);

  window._saveEmp = async () => {
    const data = getFormData(document.getElementById('emp-form'));
    try {
      const res = await API.empCreate(data);
      toast('Employee created', 'success');
      window.go(`/employees/${res.id}`);
    } catch(e) { toast(e.message, 'error'); }
  };
}

export async function renderEmployeeDetail(id) {
  const emp = await API.employee(id);
  if (!emp) return;
  const name = `${emp.first_name} ${emp.last_name}`;
  const av = fmt.avColor(name);
  const ini = fmt.ini(name);

  const fld = (l,v,mono=false) => `
    <div>
      <div class="org-field-label">${l}</div>
      <div class="org-field-value ${!v?'empty':''} ${mono?'td-mono':''}">${v||'—'}</div>
    </div>`;

  setContent(`
    <div class="detail-layout">
      <div class="detail-sidebar">
        <div class="card" style="overflow:hidden">
          <div style="background:linear-gradient(135deg,#1a5c2e,#0f3d1e);padding:24px;text-align:center;color:#fff">
            <div class="av av-xl ${av}" style="margin:0 auto 12px">${ini}</div>
            <div style="font-size:16px;font-weight:700">${name}</div>
            <div style="opacity:.8;font-size:12px;margin-top:4px">${emp.job_title||'—'}</div>
            <div style="opacity:.6;font-size:11px;margin-top:4px">${emp.emp_id||''}</div>
          </div>
          <div class="sidebar-nav-links">
            ${[['personal','👤 Personal'],['role','🏢 Role & Org'],['identity','🪪 Identity'],['finance','💰 Finance']].map(([id,lbl])=>`
              <a class="sidebar-nav-link" onclick="document.getElementById('sec-${id}')?.scrollIntoView({behavior:'smooth'})">
                ${lbl}</a>`).join('')}
          </div>
          <div style="padding:12px 16px;border-top:1px solid var(--bdr)">
            <button class="btn btn-ghost btn-sm" style="width:100%" onclick="window.go('/employees')">← Back to list</button>
          </div>
        </div>
      </div>

      <div>
        <div class="card section-card" id="sec-personal">
          <div class="card-header">
            <div class="card-title">👤 Personal Information</div>
            <button class="btn btn-ghost btn-sm" onclick="window._editEmp('personal')">✏ Edit</button>
          </div>
          <div class="section-fields">
            ${fld('First Name', emp.first_name)}
            ${fld('Last Name', emp.last_name)}
            ${fld('Middle Name', emp.middle_name)}
            ${fld('Date of Birth', fmt.date(emp.dob))}
            ${fld('Gender', emp.gender)}
            ${fld('Marital Status', emp.marital_status)}
            ${fld('Nationality', emp.nationality)}
            ${fld('Blood Group', emp.blood_group)}
            ${fld('Personal Email', emp.personal_email)}
            ${fld('Personal Phone', emp.personal_phone)}
          </div>
        </div>

        <div class="card section-card" id="sec-role">
          <div class="card-header">
            <div class="card-title">🏢 Role & Organisation</div>
            <button class="btn btn-ghost btn-sm" onclick="window._editEmp('role')">✏ Edit</button>
          </div>
          <div class="section-fields">
            ${fld('Job Title', emp.job_title)}
            ${fld('Department', emp.department_name)}
            ${fld('Business Unit', emp.business_unit_name)}
            ${fld('Employment Type', emp.employment_type)}
            ${fld('Client', emp.client_name)}
            ${fld('Location', emp.location)}
            ${fld('Start Date', fmt.date(emp.start_date))}
            ${fld('Reporting Manager', emp.reporting_manager_name)}
            ${fld('Notice Period', emp.notice_period ? emp.notice_period+' days' : null)}
            ${fld('Status', emp.status)}
          </div>
        </div>

        <div class="card section-card" id="sec-identity">
          <div class="card-header">
            <div class="card-title">🪪 Identity & Compliance</div>
            <button class="btn btn-ghost btn-sm" onclick="window._editEmp('identity')">✏ Edit</button>
          </div>
          <div class="section-fields">
            ${fld('PAN', emp.pan, true)}
            ${fld('Aadhaar', emp.aadhaar, true)}
            ${fld('Passport', emp.passport_number, true)}
            ${fld('PF Number', emp.pf_number, true)}
            ${fld('ESI Number', emp.esi_number, true)}
            ${fld('UAN', emp.uan, true)}
          </div>
        </div>

        <div class="card section-card" id="sec-finance">
          <div class="card-header">
            <div class="card-title">💰 Finance & Banking</div>
            <button class="btn btn-ghost btn-sm" onclick="window._editEmp('finance')">✏ Edit</button>
          </div>
          <div class="section-fields">
            ${fld('Salary', fmt.inr(emp.salary))}
            ${fld('Bill Rate', emp.bill_rate ? fmt.inr(emp.bill_rate)+'/hr' : null)}
            ${fld('Bank Name', emp.bank_name)}
            ${fld('Account Number', emp.bank_account_number, true)}
            ${fld('IFSC', emp.bank_ifsc, true)}
          </div>
        </div>
      </div>
    </div>
  `);

  const sectionForms = {
    personal: ['first_name','middle_name','last_name','dob','gender','marital_status','nationality','blood_group','personal_email','personal_phone'],
    role: ['job_title','department_id','business_unit_id','employment_type_id','reporting_manager_id','client_id','office_location_id','start_date','end_date','status','notice_period','location'],
    identity: ['pan','aadhaar','passport_number','pf_number','esi_number','uan'],
    finance: ['salary','bill_rate','bank_name','bank_account_number','bank_ifsc'],
  };

  window._editEmp = (section) => {
    const fields = sectionForms[section] || [];
    const labels = {
      first_name:'First Name', middle_name:'Middle Name', last_name:'Last Name',
      dob:'Date of Birth|date', gender:'Gender|select|Male,Female,Non-binary',
      marital_status:'Marital Status|select|Single,Married,Divorced',
      nationality:'Nationality', blood_group:'Blood Group',
      personal_email:'Personal Email|email', personal_phone:'Personal Phone',
      job_title:'Job Title', department_id:'Department|dept', business_unit_id:'Business Unit|bu',
      employment_type_id:'Employment Type|et', reporting_manager_id:'Reporting Manager|emp',
      client_id:'Client|client', start_date:'Start Date|date', end_date:'End Date|date',
      status:'Status|select|Active,On Leave,Resigned,Terminated', notice_period:'Notice Period (days)|number',
      location:'Location', pan:'PAN', aadhaar:'Aadhaar', passport_number:'Passport',
      pf_number:'PF Number', esi_number:'ESI Number', uan:'UAN',
      salary:'Salary|number', bill_rate:'Bill Rate|number',
      bank_name:'Bank Name', bank_account_number:'Account Number', bank_ifsc:'IFSC',
    };
    const rows = fields.map(f => {
      const parts = (labels[f]||f).split('|');
      const label = parts[0], type = parts[1]||'text', opts = parts[2]||'';
      let input = '';
      if (type==='select') {
        input = `<select class="select" name="${f}"><option value="">Select</option>${opts.split(',').map(o=>`<option ${emp[f]===o?'selected':''}>${o}</option>`).join('')}</select>`;
      } else if (type==='dept') {
        input = `<select class="select" name="${f}">${buildOptions(getMaster('departments'),'id','name',emp[f],'Select')}</select>`;
      } else if (type==='bu') {
        input = `<select class="select" name="${f}">${buildOptions(getMaster('business-units'),'id','name',emp[f],'Select')}</select>`;
      } else if (type==='et') {
        input = `<select class="select" name="${f}">${buildOptions(getMaster('employment-types'),'id','name',emp[f],'Select')}</select>`;
      } else if (type==='emp') {
        input = `<select class="select" name="${f}">${buildOptions(getMaster('employees-lookup'),'id','name',emp[f],'None')}</select>`;
      } else if (type==='client') {
        input = `<select class="select" name="${f}">${buildOptions(getMaster('clients-lookup'),'id','name',emp[f],'None')}</select>`;
      } else {
        input = `<input class="input" type="${type}" name="${f}" value="${emp[f]||''}">`;
      }
      return `<div class="field" style="grid-column:1/-1"><label class="label">${label}</label>${input}</div>`;
    }).join('');

    showModal({
      title: `Edit ${section.charAt(0).toUpperCase()+section.slice(1)}`,
      body: `<form id="edit-form"><div class="form-grid">${rows}</div></form>`,
      footer: `<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
               <button class="btn btn-primary" onclick="window._saveEmpEdit(${id})">Save Changes</button>`,
    });

    window._saveEmpEdit = async (eid) => {
      const data = getFormData(document.getElementById('edit-form'));
      try {
        await API.empUpdate(eid, data);
        toast('Updated', 'success');
        closeModal();
        renderEmployeeDetail(eid);
      } catch(e) { toast(e.message, 'error'); }
    };
  };
}
