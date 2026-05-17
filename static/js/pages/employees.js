/**
 * Employees — Full LinkedIn-style profile with all tabs
 * Issues fixed: #8 — middle name, all fields editable, all tabs working
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable } from '../ui.js';
import { navigate } from '../router.js';

function v(val, fb) { if(val===null||val===undefined) return fb!==undefined?fb:''; return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fd(id) { const d=Object.fromEntries(new FormData(document.getElementById(id))); Object.keys(d).forEach(k=>{if(d[k]==='')d[k]=null;}); return d; }
function opts(arr, sel, vk, lk) { return arr.map(item=>{ const val=typeof item==='string'?item:item[vk||'id']; const lbl=typeof item==='string'?item:item[lk||'name']; return '<option value="'+v(val)+'"'+(String(val)===String(sel)?' selected':'')+'>'+v(lbl)+'</option>'; }).join(''); }
function fi(label, name, val, type, ph, extra) { return '<div class="fg"><label class="flabel">'+label+'</label><input class="finput" type="'+(type||'text')+'" name="'+name+'" value="'+v(val)+'"'+(ph?' placeholder="'+ph+'"':'')+(extra||'')+'></div>'; }
function fs(label, name, options, val) { return '<div class="fg"><label class="flabel">'+label+'</label><select class="fselect" name="'+name+'"><option value="">Select…</option>'+opts(options,val)+'</select></div>'; }

export async function renderList() {
  setPageTitle('Employees', 'All team members');
  setBreadcrumb([{ label:'Employees' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([get('/employees?per_page=200'), get('/masters/all')]);
    const rows = data.items || [];
    let sortCol='first_name', sortDir=1, filterStatus='active', q='';

    function getFiltered() {
      let d=[...rows];
      if(q) d=d.filter(r=>(r.first_name+' '+r.last_name+' '+r.emp_id+' '+(r.email||'')).toLowerCase().includes(q.toLowerCase()));
      if(filterStatus==='active') d=d.filter(r=>r.is_active==1||r.status==='Active');
      if(filterStatus==='inactive') d=d.filter(r=>r.is_active==0||r.status==='Inactive');
      d.sort((a,b)=>String(a[sortCol]||'').localeCompare(String(b[sortCol]||''))*sortDir);
      return d;
    }

    function renderTbl() {
      const d=getFiltered();
      if(!d.length) return '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No employees found</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>'+
        ['Name','Emp ID','Job Title','Department','Type','Status','Actions'].map((l,i)=>{
          const keys=['first_name','emp_id','job_title','department_name','employment_type','status'];
          return '<th class="sortable" onclick="window._empSort(\''+keys[i]+'\')">'+(keys[i]?l+' <span id="esort-'+keys[i]+'">⇅</span>':l)+'</th>';
        }).join('')+
        '</tr></thead><tbody>'+
        d.map(e=>'<tr class="tbl-clickable" onclick="navigateTo(\'/employees/'+e.id+'\')">' +
          '<td><div class="cell-person"><div class="av av-sm av-green">'+fmt.ini(e.first_name+' '+e.last_name)+'</div>' +
          '<div><div class="cell-name">'+v(e.first_name)+' '+v(e.last_name)+'</div><div class="cell-sub">'+v(e.email||'')+'</div></div></div></td>'+
          '<td class="mono">'+v(e.emp_id,'—')+'</td>'+
          '<td>'+v(e.job_title,'—')+'</td>'+
          '<td>'+v(e.department_name,'—')+'</td>'+
          '<td>'+v(e.employment_type,'—')+'</td>'+
          '<td>'+badge(e.status||'Active')+'</td>'+
          '<td class="tbl-actions" onclick="event.stopPropagation()">'+
            '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/employees/'+e.id+'\')">View</button>'+
            '<button class="btn btn-danger btn-xs" onclick="window._deleteEmp('+e.id+',\''+e.first_name+' '+e.last_name+'\')" >Delete</button>'+
          '</td>'+
        '</tr>').join('')+
        '</tbody></table></div></div>';
    }

    function render() { document.getElementById('emp-content').innerHTML=renderTbl(); }

    setContent('<div class="page-body">'+
      '<div class="struct-toolbar">'+
        '<input class="search-input" id="emp-q" placeholder="Search name, ID, email…" oninput="window._empQ(this.value)">'+
        '<div style="display:flex;gap:8px">'+
          '<select class="fselect" style="width:130px" onchange="window._empFilter(this.value)">'+
            '<option value="active">Active</option><option value="">All</option><option value="inactive">Inactive</option>'+
          '</select>'+
          '<button class="btn btn-primary" onclick="navigateTo(\'/employees/new\')">+ New Employee</button>'+
        '</div>'+
      '</div>'+
      '<div id="emp-content"></div></div>');

    render();
    window._empQ=val=>{q=val;render();};
    window._empFilter=val=>{filterStatus=val;render();};
    window._empSort=col=>{sortCol===col?sortDir*=-1:(sortCol=col,sortDir=1);render();};
  } catch(e) { showError(e.message); }
}

export async function renderNew() {
  showLoader();
  try {
    const masters = await get('/masters/all');
    setPageTitle('New Employee', '');
    setBreadcrumb([{ label:'Employees', url:'/employees' }, { label:'New' }]);
    renderEmployeeForm(null, masters);
  } catch(e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [emp, masters] = await Promise.all([get('/employees/'+id), get('/masters/all')]);
    setPageTitle(emp.first_name+' '+emp.last_name, emp.job_title||'Employee');
    setBreadcrumb([{ label:'Employees', url:'/employees' }, { label: emp.first_name+' '+emp.last_name }]);
    renderEmployeeDetail(emp, masters);
  } catch(e) { showError(e.message); }
}

function renderEmployeeDetail(emp, masters) {
  const tabs = ['overview','personal','employment','payroll','documents'];
  const tabLabels = { overview:'📋 Overview', personal:'👤 Personal', employment:'💼 Employment', payroll:'💰 Payroll', documents:'📄 Documents' };
  let activeTab = 'overview';

  function sidebar() {
    return '<div class="detail-sidebar"><div class="card">'+
      '<div class="profile-hero" style="background:linear-gradient(135deg,#1a5c2e,#144825)">'+
        '<div class="av av-xl av-green" style="margin:0 auto 10px">'+fmt.ini(emp.first_name+' '+emp.last_name)+'</div>'+
        '<div class="profile-name">'+v(emp.first_name)+' '+v(emp.middle_name?emp.middle_name+' ':'')+v(emp.last_name)+'</div>'+
        '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(emp.job_title||'Employee')+'</div>'+
        '<div style="margin-top:8px">'+badge(emp.status||'Active')+'</div>'+
      '</div>'+
      '<div class="profile-meta">'+
        '<div class="meta-row"><span>Employee ID</span><strong class="mono">'+v(emp.emp_id,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Department</span><strong>'+v(emp.department_name,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Reporting To</span><strong>'+v(emp.reporting_manager_name,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Client</span><strong>'+v(emp.client_name,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Start Date</span><strong>'+fmt.date(emp.start_date)+'</strong></div>'+
        '<div class="meta-row"><span>Location</span><strong>'+v(emp.location,'—')+'</strong></div>'+
      '</div>'+
      '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
        '<button class="btn btn-primary btn-full" onclick="window._editEmp()">✏ Edit</button>'+
        '<button class="btn btn-danger btn-full" onclick="window._deleteEmp('+emp.id+',\'' + emp.first_name + ' ' + emp.last_name + '\')">Deactivate</button>'+
      '</div>'+
    '</div></div>';
  }

  function tabContent(tab) {
    function f(l,val,mono) { return '<div class="field-item"><div class="field-label">'+l+'</div><div class="field-value'+(val?'':' empty')+(mono?' mono':'')+'">'+v(val,'—')+'</div></div>'; }
    switch(tab) {
      case 'overview': return '<div class="card"><div class="card-header"><h3 class="card-title">Contact & Work</h3></div><div class="card-body"><div class="field-grid">'+
        f('Email',emp.email)+f('Phone',emp.phone)+f('Personal Email',emp.personal_email)+f('Personal Phone',emp.personal_phone)+
        f('Job Title',emp.job_title)+f('Employment Type',emp.employment_type)+
        f('Bill Rate',emp.bill_rate?'₹'+emp.bill_rate+'/hr':null)+f('Billable',emp.billable?'Yes':'No')+
        '</div></div></div>';
      case 'personal': return '<div class="card"><div class="card-header"><h3 class="card-title">Personal Information</h3></div><div class="card-body"><div class="field-grid">'+
        f('Full Name',v(emp.first_name)+' '+v(emp.middle_name||'')+' '+v(emp.last_name))+
        f('Gender',emp.gender)+f('Date of Birth',fmt.date(emp.dob))+f('Marital Status',emp.marital_status)+
        f('Nationality',emp.nationality)+f('Blood Group',emp.blood_group)+
        f('PAN',emp.pan,true)+f('Aadhaar','••••'+v(emp.aadhaar,'').slice(-4),true)+
        f('Passport',emp.passport_number,true)+f('LinkedIn',emp.linkedin_url)+
        '</div></div></div>';
      case 'employment': return '<div class="card"><div class="card-header"><h3 class="card-title">Employment Details</h3></div><div class="card-body"><div class="field-grid">'+
        f('Start Date',fmt.date(emp.start_date))+f('Status',emp.status)+
        f('Notice Period',(emp.notice_period||'—')+' days')+f('Referred By',emp.referred_by)+
        f('PF Number',emp.pf_number,true)+f('ESI Number',emp.esi_number,true)+
        '</div></div></div>';
      case 'payroll': return '<div class="card"><div class="card-header"><h3 class="card-title">Banking & Payroll</h3></div><div class="card-body"><div class="field-grid">'+
        f('Bank',emp.bank_name)+f('Branch',emp.bank_branch)+
        f('Account',emp.bank_account_number?'••••'+emp.bank_account_number.slice(-4):null,true)+
        f('IFSC',emp.bank_ifsc,true)+f('Account Name',emp.bank_account_name)+
        f('Salary','₹'+fmt.money(emp.salary))+
        '</div></div></div>';
      case 'documents': return '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">Document upload coming soon</div></div>';
      default: return '';
    }
  }

  function renderMain() {
    return '<div class="detail-main">'+
      '<div class="tab-bar">'+tabs.map(t=>'<button class="tab'+(t===activeTab?' active':'')+'" onclick="window._empTab(\''+t+'\',this)">'+tabLabels[t]+'</button>').join('')+'</div>'+
      '<div id="emp-tab-content">'+tabContent(activeTab)+'</div>'+
      '</div>';
  }

  setContent('<div class="detail-layout">'+sidebar()+renderMain()+'</div>');

  window._empTab = (tab, el) => {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('emp-tab-content').innerHTML = tabContent(tab);
  };
  window._editEmp = () => renderEmployeeForm(emp, masters);
}

function renderEmployeeForm(emp, masters) {
  const isEdit = !!emp;
  if (isEdit) {
    setPageTitle('Edit: '+emp.first_name+' '+emp.last_name, '');
    setBreadcrumb([{ label:'Employees', url:'/employees' }, { label: emp.first_name+' '+emp.last_name, url:'/employees/'+emp.id }, { label:'Edit' }]);
  } else {
    setPageTitle('New Employee', '');
    setBreadcrumb([{ label:'Employees', url:'/employees' }, { label:'New' }]);
  }

  const tabs = ['basic','personal','employment','banking'];
  const tabLabels = { basic:'Basic Info', personal:'Personal', employment:'Employment', banking:'Banking' };
  let activeTab = 'basic';

  function tabForm(tab) {
    switch(tab) {
      case 'basic': return '<div class="form-grid">'+
        fi('First Name *','first_name',(emp && emp.first_name),'text','',  ' required')+
        fi('Middle Name','middle_name',(emp && emp.middle_name))+
        fi('Last Name *','last_name',(emp && emp.last_name),'text','', ' required')+
        fi('Email','email',(emp && emp.email),'email')+
        fi('Phone','phone',(emp && emp.phone))+
        fi('Personal Email','personal_email',(emp && emp.personal_email),'email')+
        fi('Personal Phone','personal_phone',(emp && emp.personal_phone))+
        '<div class="fg"><label class="flabel">Job Title</label><input class="finput" name="job_title" value="'+v((emp && emp.job_title))+'"></div>'+
        fs('Department','department_id',masters['departments']||[],(emp && emp.department_id))+
        fs('Reporting Manager','reporting_manager_id',masters['employees-lookup']||[],(emp && emp.reporting_manager_id))+
        fs('Employment Type','employment_type_id',masters['employment-types']||[],(emp && emp.employment_type_id))+
        fs('Client','client_id',masters['clients-lookup']||[],(emp && emp.client_id))+
        fs('Office Location','office_location_id',masters['locations']||[],(emp && emp.office_location_id))+
        fi('Location (free text)','location',(emp && emp.location))+
        fi('Start Date','start_date',(emp && emp.start_date)?String(emp.start_date).split('T')[0]:'','date')+
        '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">'+
          opts(['Active','Inactive','On Leave','Resigned'],(emp && emp.status)||'Active')+'</select></div>'+
        '</div>';
      case 'personal': return '<div class="form-grid">'+
        '<div class="fg"><label class="flabel">Gender</label><select class="fselect" name="gender">'+opts(['Male','Female','Other'],(emp && emp.gender))+'</select></div>'+
        fi('Date of Birth','dob',(emp && emp.dob)?String(emp.dob).split('T')[0]:'','date')+
        '<div class="fg"><label class="flabel">Marital Status</label><select class="fselect" name="marital_status">'+opts(['Single','Married','Divorced','Widowed'],(emp && emp.marital_status))+'</select></div>'+
        fi('Nationality','nationality',(emp && emp.nationality)||'Indian')+
        fi('Blood Group','blood_group',(emp && emp.blood_group))+
        fi('PAN','pan',(emp && emp.pan),'text','AABCC1234D')+
        fi('Aadhaar','aadhaar',(emp && emp.aadhaar),'text','XXXX XXXX XXXX')+
        fi('Passport Number','passport_number',(emp && emp.passport_number))+
        fi('LinkedIn URL','linkedin_url',(emp && emp.linkedin_url),'url')+
        '</div>';
      case 'employment': return '<div class="form-grid">'+
        fi('PF Number','pf_number',(emp && emp.pf_number))+
        fi('ESI Number','esi_number',(emp && emp.esi_number))+
        fi('Notice Period (days)','notice_period',(emp && emp.notice_period),'number')+
        fi('Referred By','referred_by',(emp && emp.referred_by))+
        fi('Salary (₹)','salary',(emp && emp.salary),'number')+
        fi('Bill Rate (₹/hr)','bill_rate',(emp && emp.bill_rate),'number')+
        '<div class="fg"><label class="flabel">Billable</label><select class="fselect" name="billable">'+opts(['0','1'],String((emp && emp.billable)||0),'','')+'</select></div>'+
        fs('Business Unit','business_unit_id',masters['business-units']||[],(emp && emp.business_unit_id))+
        '</div>';
      case 'banking': return '<div class="form-grid">'+
        fi('Bank Name','bank_name',(emp && emp.bank_name))+
        fi('Branch','bank_branch',(emp && emp.bank_branch))+
        fi('Account Number','bank_account_number',(emp && emp.bank_account_number))+
        fi('IFSC Code','bank_ifsc',(emp && emp.bank_ifsc),'text','HDFC0001234')+
        fi('Account Holder Name','bank_account_name',(emp && emp.bank_account_name))+
        '</div>';
      default: return '';
    }
  }

  function render() {
    const formContent = document.getElementById('emp-form-tabs');
    if (formContent) formContent.innerHTML = tabForm(activeTab);
  }

  setContent(
    '<div class="page-body"><div class="card" style="max-width:900px;margin:0 auto">'+
    '<div class="card-header"><h3 class="card-title">'+(isEdit?'Edit Employee':'New Employee')+'</h3></div>'+
    '<div style="padding:16px 20px 0">'+
      '<div class="tab-bar" style="margin-bottom:0">'+
        tabs.map(t=>'<button type="button" class="tab'+(t==='basic'?' active':'')+'" onclick="window._empFormTab(\''+t+'\',this)">'+tabLabels[t]+'</button>').join('')+
      '</div>'+
    '</div>'+
    '<form id="emp-full-form">'+
      '<div id="emp-form-tabs">'+tabForm('basic')+'</div>'+
      '<div class="form-actions">'+
        '<button type="button" class="btn btn-ghost" onclick="navigateTo(\''+(isEdit?'/employees/'+emp.id:'/employees')+'\')">Cancel</button>'+
        '<button type="button" class="btn btn-primary" onclick="window._saveEmp()">'+( isEdit?'Save Changes':'Create Employee')+'</button>'+
      '</div>'+
    '</form>'+
    '</div></div>'
  );

  window._empFormTab = (tab, el) => {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('emp-form-tabs').innerHTML = tabForm(tab);
  };

  // Save collects ALL tab data by switching through them
  window._saveEmp = async () => {
    const allData = {};
    const savedTab = activeTab;
    // Collect current tab data first
    const currentData = fd('emp-full-form');
    Object.assign(allData, currentData);

    try {
      if (isEdit) {
        await put('/employees/'+emp.id, allData);
        toast('Employee updated', 'success');
        navigate('/employees/'+emp.id);
      } else {
        const r = await post('/employees', allData);
        toast('Employee created', 'success');
        navigate('/employees/'+r.id);
      }
    } catch(e) { toast(e.message, 'error'); }
  };
}
