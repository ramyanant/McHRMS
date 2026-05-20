/**
 * Employee Self-Service Portal
 * LinkedIn-style profile, document upload, change password, photo upload
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

function v(val,fb){if(val===null||val===undefined)return fb!==undefined?fb:'';return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fd(id){var d=Object.fromEntries(new FormData(document.getElementById(id)));Object.keys(d).forEach(function(k){if(d[k]==='')d[k]=null;});return d;}
function opts(arr,sel){return arr.map(function(i){var val=typeof i==='string'?i:i.id;var lbl=typeof i==='string'?i:i.name;return '<option value="'+v(val)+'"'+(String(val)===String(sel)?' selected':'')+'>'+v(lbl)+'</option>';}).join('');}
function fld(l,val,mono){return '<div class="field-item"><div class="field-label">'+l+'</div><div class="field-value'+(val?'':' empty')+(mono?' mono':'')+'">'+v(val,'—')+'</div></div>';}
function kpi(l,val,icon,c){return '<div class="kpi-card kpi-'+c+'"><div class="kpi-icon">'+icon+'</div><div class="kpi-body"><div class="kpi-value">'+val+'</div><div class="kpi-label">'+l+'</div></div></div>';}

export async function renderDashboard() {
  setPageTitle('My Dashboard','Employee self-service');
  setBreadcrumb([{label:'My Portal'}]);
  showLoader();
  try {
    var e = await get('/portal/dashboard');
    var bal = await get('/my/leave-balance').catch(function(){return{total:18,taken:0,balance:18,pending:0};});
    var name = (e.first_name||'') + ' ' + (e.last_name||'');
    var photo = e.photo_url ? '<img src="'+v(e.photo_url)+'" style="width:80px;height:80px;border-radius:50%;object-fit:cover">' :
      '<div class="av av-xl av-green" style="margin:0 auto">'+fmt.ini(name)+'</div>';
    setContent(
      '<div class="page-body">'+
      '<div class="detail-layout">'+
      '<div class="detail-sidebar"><div class="card">'+
        '<div class="profile-hero" style="background:linear-gradient(135deg,#1a5c2e,#144825);text-align:center">'+
          photo +
          '<div class="profile-name" style="margin-top:10px">'+v(name)+'</div>'+
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(e.job_title||'Employee')+'</div>'+
          '<div style="margin-top:8px">'+badge(e.status||'Active')+'</div>'+
        '</div>'+
        '<div class="profile-meta">'+
          '<div class="meta-row"><span>Employee ID</span><strong class="mono">'+v(e.emp_id,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Department</span><strong>'+v(e.department_name,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Manager</span><strong>'+v(e.reporting_manager_name,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Start Date</span><strong>'+fmt.date(e.start_date)+'</strong></div>'+
          '<div class="meta-row"><span>Email</span><strong>'+v(e.email,'—')+'</strong></div>'+
        '</div>'+
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
          '<button class="btn btn-primary btn-full" onclick="navigateTo(\'/portal/profile\')">✏ View / Edit Profile</button>'+
          '<button class="btn btn-ghost btn-full" onclick="navigateTo(\'/portal/timesheets\')">📋 My Timesheets</button>'+
          '<button class="btn btn-ghost btn-full" onclick="navigateTo(\'/portal/leaves\')">🌴 Apply Leave</button>'+
        '</div>'+
      '</div></div>'+
      '<div class="detail-main">'+
        '<div class="kpi-grid kpi-4" style="margin-bottom:16px">'+
          kpi('Leave Balance',(bal.balance||0)+' days','🌴','green')+
          kpi('Taken',(bal.taken||0)+' days','✅','blue')+
          kpi('Pending',(bal.pending||0)+' days','⏳','amber')+
          kpi('Total Entitlement',(bal.total||18)+' days','📅','purple')+
        '</div>'+
        '<div class="card">'+
          '<div class="card-header"><h3 class="card-title">Quick Actions</h3></div>'+
          '<div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
            '<button class="btn btn-primary" onclick="navigateTo(\'/portal/timesheets\')">+ Submit Timesheet</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/portal/leaves\')">+ Apply Leave</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/portal/team\')">👥 View My Team</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/portal/payslips\')">💰 My Payslips</button>'+
          '</div>'+
        '</div>'+
      '</div></div></div>'
    );
  } catch(e2){showError(e2.message);}
}

export async function renderProfile() {
  setPageTitle('My Profile','');
  setBreadcrumb([{label:'My Portal',url:'/portal'},{label:'Profile'}]);
  showLoader();
  try {
    var e = await get('/portal/dashboard');
    var name = (e.first_name||'') + ' ' + (e.last_name||'');
    var tabs = ['overview','personal','employment','documents','security'];
    var tabLabels = {overview:'📋 Overview',personal:'👤 Personal',employment:'💼 Employment',documents:'📄 Documents',security:'🔐 Security'};
    var activeTab = 'overview';
    var photo = e.photo_url ? '<img src="'+v(e.photo_url)+'" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.3)">' :
      '<div class="av av-xl av-green" style="margin:0 auto">'+fmt.ini(name)+'</div>';

    function tabContent(tab) {
      switch(tab) {
        case 'overview': return (
          '<div class="card" style="margin-bottom:12px"><div class="card-header"><h3 class="card-title">Contact Information</h3>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._editBasic()">✏ Edit</button></div>' +
          '<div class="card-body"><div class="field-grid">' +
          fld('Full Name',name)+fld('Work Email',e.email)+fld('Phone',e.phone)+
          fld('Personal Email',e.personal_email)+fld('Location',e.location)+
          '</div></div></div>'+
          '<div class="card"><div class="card-header"><h3 class="card-title">Work Details</h3></div>' +
          '<div class="card-body"><div class="field-grid">' +
          fld('Employee ID',e.emp_id,true)+fld('Job Title',e.job_title)+
          fld('Department',e.department_name)+fld('Reporting Manager',e.reporting_manager_name)+
          fld('Start Date',fmt.date(e.start_date))+fld('Employment Type',e.employment_type)+
          '</div></div></div>'
        );
        case 'personal': return (
          '<div class="card"><div class="card-header"><h3 class="card-title">Personal Information</h3>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._editPersonal()">✏ Edit</button></div>' +
          '<div class="card-body"><div class="field-grid">' +
          fld('Gender',e.gender)+fld('Date of Birth',fmt.date(e.dob))+
          fld('Marital Status',e.marital_status)+fld('Nationality',e.nationality)+
          fld('Blood Group',e.blood_group)+
          '</div></div></div>'+
          '<div class="card" style="margin-top:12px"><div class="card-header"><h3 class="card-title">ID Documents</h3>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._editIds()">✏ Edit</button></div>' +
          '<div class="card-body"><div class="field-grid">' +
          fld('PAN',e.pan,true)+fld('Aadhaar',e.aadhaar?'••••'+e.aadhaar.slice(-4):null,true)+
          fld('Passport',e.passport_number,true)+
          fld('LinkedIn',e.linkedin_url)+
          '</div></div></div>'+
          '<div class="card" style="margin-top:12px"><div class="card-header"><h3 class="card-title">Profile Photo</h3></div>' +
          '<div class="card-body" style="display:flex;align-items:center;gap:20px">' +
          photo +
          '<div><p class="text-muted" style="margin-bottom:12px">Upload a professional photo (JPG, PNG, max 2MB)</p>' +
          '<button class="btn btn-primary" onclick="window._uploadPhoto()">📷 Upload Photo</button></div>' +
          '</div></div>'
        );
        case 'employment': return (
          '<div class="card"><div class="card-header"><h3 class="card-title">Employment Details</h3></div>' +
          '<div class="card-body"><div class="field-grid">' +
          fld('PF Number',e.pf_number,true)+fld('ESI Number',e.esi_number,true)+
          fld('Notice Period',(e.notice_period||'—')+' days')+fld('Referred By',e.referred_by)+
          '</div></div></div>'+
          '<div class="card" style="margin-top:12px"><div class="card-header"><h3 class="card-title">Banking Details</h3>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._editBanking()">✏ Edit</button></div>' +
          '<div class="card-body"><div class="field-grid">' +
          fld('Bank',e.bank_name)+fld('Branch',e.bank_branch)+
          fld('Account',e.bank_account_number?'••••'+e.bank_account_number.slice(-4):null,true)+
          fld('IFSC',e.bank_ifsc,true)+
          '</div></div></div>'
        );
        case 'documents': return docTab(e.id);
        case 'security': return securityTab();
        default: return '';
      }
    }

    function sidebar() {
      return '<div class="detail-sidebar"><div class="card">'+
        '<div class="profile-hero" style="background:linear-gradient(135deg,#1a5c2e,#144825);text-align:center">'+
          photo +
          '<div class="profile-name" style="margin-top:10px">'+v(name)+'</div>'+
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(e.job_title||'Employee')+'</div>'+
          '<div style="margin-top:8px">'+badge(e.status||'Active')+'</div>'+
        '</div>'+
        '<div class="profile-meta">'+
          '<div class="meta-row"><span>Employee ID</span><strong class="mono">'+v(e.emp_id,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Department</span><strong>'+v(e.department_name,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Manager</span><strong>'+v(e.reporting_manager_name,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Start Date</span><strong>'+fmt.date(e.start_date)+'</strong></div>'+
        '</div>'+
      '</div></div>';
    }

    setContent(
      '<div class="detail-layout">'+sidebar()+
      '<div class="detail-main">'+
        '<div class="tab-bar">'+tabs.map(function(t){return '<button class="tab'+(t===activeTab?' active':'')+'" onclick="window._pTab(\''+t+'\',this)">'+tabLabels[t]+'</button>';}).join('')+'</div>'+
        '<div id="portal-tab-content">'+tabContent(activeTab)+'</div>'+
      '</div></div>'
    );

    window._pTab = function(tab, el) {
      activeTab=tab;
      document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
      el.classList.add('active');
      document.getElementById('portal-tab-content').innerHTML = tabContent(tab);
    };

    window._editBasic = function() {
      openModal({
        title:'✏ Edit Contact Information', size:'md',
        body:'<form id="basic-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone" value="'+v(e.phone)+'"></div>'+
          '<div class="fg"><label class="flabel">Personal Email</label><input class="finput" type="email" name="personal_email" value="'+v(e.personal_email)+'"></div>'+
          '<div class="fg"><label class="flabel">Location</label><input class="finput" name="location" value="'+v(e.location)+'"></div>'+
          '<div class="fg"><label class="flabel">LinkedIn URL</label><input class="finput" type="url" name="linkedin_url" value="'+v(e.linkedin_url)+'"></div>'+
          '</form>',
        submitLabel:'Save',
        onSubmit: async function() {
          await put('/employees/'+e.id, fd('basic-form'));
          toast('Updated','success'); navigate('/portal/profile');
        }
      });
    };

    window._editPersonal = function() {
      openModal({
        title:'✏ Edit Personal Information', size:'md',
        body:'<form id="personal-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">Gender</label><select class="fselect" name="gender"><option value="">Select…</option>'+opts(['Male','Female','Other'],e.gender)+'</select></div>'+
          '<div class="fg"><label class="flabel">Date of Birth</label><input class="finput" type="date" name="dob" value="'+v(e.dob?String(e.dob).split('T')[0]:'')+'"></div>'+
          '<div class="fg"><label class="flabel">Marital Status</label><select class="fselect" name="marital_status"><option value="">Select…</option>'+opts(['Single','Married','Divorced','Widowed'],e.marital_status)+'</select></div>'+
          '<div class="fg"><label class="flabel">Blood Group</label><select class="fselect" name="blood_group"><option value="">Select…</option>'+opts(['A+','A-','B+','B-','O+','O-','AB+','AB-'],e.blood_group)+'</select></div>'+
          '<div class="fg"><label class="flabel">Nationality</label><input class="finput" name="nationality" value="'+v(e.nationality||'Indian')+'"></div>'+
          '</form>',
        submitLabel:'Save',
        onSubmit: async function() {
          await put('/employees/'+e.id, fd('personal-form'));
          toast('Updated','success'); navigate('/portal/profile');
        }
      });
    };

    window._editIds = function() {
      openModal({
        title:'✏ Edit ID Documents', size:'md',
        body:'<form id="ids-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">PAN</label><input class="finput mono" name="pan" value="'+v(e.pan)+'"></div>'+
          '<div class="fg"><label class="flabel">Aadhaar</label><input class="finput mono" name="aadhaar" value="'+v(e.aadhaar)+'"></div>'+
          '<div class="fg"><label class="flabel">Passport Number</label><input class="finput mono" name="passport_number" value="'+v(e.passport_number)+'"></div>'+
          '</form>',
        submitLabel:'Save',
        onSubmit: async function() {
          await put('/employees/'+e.id, fd('ids-form'));
          toast('Updated','success'); navigate('/portal/profile');
        }
      });
    };

    window._editBanking = function() {
      openModal({
        title:'✏ Edit Banking Details', size:'md',
        body:'<form id="bank-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">Bank Name</label><input class="finput" name="bank_name" value="'+v(e.bank_name)+'"></div>'+
          '<div class="fg"><label class="flabel">Branch</label><input class="finput" name="bank_branch" value="'+v(e.bank_branch)+'"></div>'+
          '<div class="fg"><label class="flabel">Account Number</label><input class="finput mono" name="bank_account_number" value="'+v(e.bank_account_number)+'"></div>'+
          '<div class="fg"><label class="flabel">IFSC Code</label><input class="finput mono" name="bank_ifsc" value="'+v(e.bank_ifsc)+'"></div>'+
          '<div class="fg"><label class="flabel">Account Holder Name</label><input class="finput" name="bank_account_name" value="'+v(e.bank_account_name)+'"></div>'+
          '</form>',
        submitLabel:'Save',
        onSubmit: async function() {
          await put('/employees/'+e.id, fd('bank-form'));
          toast('Updated','success'); navigate('/portal/profile');
        }
      });
    };

    window._uploadPhoto = function() {
      openModal({
        title:'📷 Upload Profile Photo',
        body:'<div class="fg full" style="text-align:center">'+
          '<label class="flabel">Select Photo (JPG or PNG, max 2MB)</label>'+
          '<input type="file" class="finput" id="photo-file" accept="image/jpeg,image/png,image/webp">'+
          '</div>',
        submitLabel:'Upload',
        onSubmit: async function() {
          var fi = document.getElementById('photo-file');
          if (!fi||!fi.files||!fi.files[0]) { toast('Select a photo','error'); return false; }
          var file=fi.files[0];
          if (file.size > 2*1024*1024) { toast('Max 2MB','error'); return false; }
          var b64 = await new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});
          await put('/employees/'+e.id, { photo_url: 'data:'+file.type+';base64,'+b64 });
          toast('Photo updated','success'); navigate('/portal/profile');
        }
      });
    };
  } catch(e2){showError(e2.message);}
}

function docTab(empId) {
  var html = '<div class="card"><div class="card-header"><h3 class="card-title">📄 My Documents</h3>' +
    '<button class="btn btn-ghost btn-sm" onclick="window._uploadEmpDoc()">+ Upload</button>' +
    '</div><div id="emp-doc-list"><div class="empty-mini">Loading…</div></div></div>';

  var DOC_TYPES = ['Resume','ID Proof','Address Proof','Education Certificate','Experience Letter','Offer Letter','Other'];

  setTimeout(function() {
    get('/employees/documents').then(function(docs) {
      var el = document.getElementById('emp-doc-list'); if (!el) return;
      if (!docs||!docs.length) { el.innerHTML='<div class="empty-mini">No documents uploaded yet</div>'; return; }
      el.innerHTML = '<div class="doc-grid">' + docs.map(function(d) {
        return '<div class="doc-card">' +
          '<div class="doc-icon">📄</div>' +
          '<div class="doc-info"><div class="doc-name">'+v(d.doc_name)+'</div>' +
          '<div class="doc-meta"><span class="badge badge-gray">'+v(d.doc_type||'Doc')+'</span>' +
          (d.file_size?'<span class="text-muted">'+v(d.file_size)+'</span>':'')+
          '</div></div>' +
          '<button class="btn btn-danger btn-xs" onclick="window._delEmpDoc('+d.id+')">✕</button>' +
        '</div>';
      }).join('') + '</div>';
    }).catch(function(){var el=document.getElementById('emp-doc-list');if(el)el.innerHTML='<div class="empty-mini">No documents yet</div>';});

    window._uploadEmpDoc = function() {
      openModal({
        title:'📎 Upload Document',
        body:'<form id="edoc-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">Document Type *</label>' +
          '<select class="fselect" name="doc_type" required>'+DOC_TYPES.map(function(t){return '<option>'+t+'</option>';}).join('')+'</select></div>' +
          '<div class="fg"><label class="flabel">Document Name *</label><input class="finput" name="doc_name" required placeholder="e.g. Degree Certificate 2020"></div>' +
          '<div class="fg full"><label class="flabel">File *</label><input type="file" class="finput" id="edoc-file" accept=".pdf,.doc,.docx,.png,.jpg"></div>' +
          '</form>',
        submitLabel:'Upload',
        onSubmit: async function() {
          var data=Object.fromEntries(new FormData(document.getElementById('edoc-form')));
          var fi=document.getElementById('edoc-file');
          if(!fi||!fi.files||!fi.files[0]){toast('Select file','error');return false;}
          var file=fi.files[0];
          if(file.size>5*1024*1024){toast('Max 5MB','error');return false;}
          var b64=await new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});
          data.file_data=b64; data.file_size=(file.size/1024).toFixed(1)+' KB'; data.mime_type=file.type;
          await post('/employees/documents', data);
          toast('Uploaded!','success');
          var el=document.getElementById('emp-doc-list');
          if(el) el.innerHTML='<div class="empty-mini">Reload tab to see documents</div>';
        }
      });
    };

    window._delEmpDoc = async function(docId) {
      if(!confirm('Remove document?')) return;
      await put('/employees/documents/'+docId,{is_active:0}).catch(function(){});
      toast('Removed','info');
    };
  }, 100);

  return html;
}

function securityTab() {
  setTimeout(registerPwdHandler, 50);
  return '<div class="card"><div class="card-header"><h3 class="card-title">🔐 Change Password</h3></div>' +
    '<div class="card-body"><form id="pwd-form" class="form-grid-sm" style="max-width:400px">' +
    '<div class="fg full"><label class="flabel">Current Password *</label><input class="finput" type="password" name="current_password" required></div>' +
    '<div class="fg full"><label class="flabel">New Password *</label><input class="finput" type="password" name="new_password" required minlength="8" placeholder="Min 8 characters"></div>' +
    '<div class="fg full"><label class="flabel">Confirm New Password *</label><input class="finput" type="password" name="confirm_password" required></div>' +
    '<div class="fg full"><button type="button" class="btn btn-primary" onclick="window._changePwd()">Change Password</button></div>' +
    '</form></div></div>';
}

export async function renderTimesheets() {
  setPageTitle('My Timesheets','');
  setBreadcrumb([{label:'My Portal',url:'/portal'},{label:'Timesheets'}]);
  showLoader();
  try {
    var rows = await get('/my/timesheets');
    var data = Array.isArray(rows)?rows:[];
    var masters = await get('/masters/all');
    setContent(
      '<div class="page-body">'+
      '<div class="list-toolbar"><div></div><button class="btn btn-primary" onclick="window._newTS()">+ Submit Timesheet</button></div>'+
      (data.length
        ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr><th>Week Ending</th><th>Project/Client</th><th>Hours</th><th>Status</th></tr></thead><tbody>'+
          data.map(function(t){return '<tr><td class="mono">'+fmt.date(t.week_ending)+'</td><td>'+v(t.project||t.client_name,'—')+'</td><td class="mono fw-bold">'+(t.total_hours||0)+'h</td><td>'+badge(t.status||'Pending')+'</td></tr>';}).join('')+
          '</tbody></table></div></div>'
        : '<div class="empty-state"><div class="empty-icon">⏱</div><div class="empty-title">No timesheets yet</div></div>'
      )+'</div>'
    );
    window._newTS = function() {
      openModal({
        title:'+ Submit Timesheet', size:'md',
        body:'<form id="ts-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">Week Ending *</label><input class="finput" type="date" name="week_ending" required></div>'+
          '<div class="fg"><label class="flabel">Regular Hours *</label><input class="finput" type="number" name="regular_hours" value="40" min="0" max="80" step="0.5" required></div>'+
          '<div class="fg"><label class="flabel">Overtime Hours</label><input class="finput" type="number" name="overtime_hours" value="0" min="0" step="0.5"></div>'+
          '<div class="fg"><label class="flabel">Project</label><input class="finput" name="project" placeholder="Project name"></div>'+
          '<div class="fg"><label class="flabel">Client</label><select class="fselect" name="client_id"><option value="">None</option>'+opts(masters['clients-lookup']||[],null)+'</select></div>'+
          '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2"></textarea></div>'+
          '</form>',
        submitLabel:'Submit for Approval',
        onSubmit: async function() {
          try{await post('/my/timesheets',fd('ts-form'));toast('Submitted for approval','success');renderTimesheets();}
          catch(e){toast(e.message,'error');}
        }
      });
    };
  } catch(e){showError(e.message);}
}

export async function renderLeaves() {
  setPageTitle('My Leaves','');
  setBreadcrumb([{label:'My Portal',url:'/portal'},{label:'Leaves'}]);
  showLoader();
  try {
    var rows = await get('/my/leaves');
    var data = Array.isArray(rows)?rows:[];
    var bal  = await get('/my/leave-balance').catch(function(){return{total:18,taken:0,balance:18,pending:0};});
    setContent(
      '<div class="page-body">'+
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">'+
        kpi('Total',(bal.total||18)+' days','📅','blue')+
        kpi('Taken',(bal.taken||0)+' days','✅','green')+
        kpi('Pending',(bal.pending||0)+' days','⏳','amber')+
        kpi('Balance',(bal.balance||18)+' days','💚','purple')+
      '</div>'+
      '<div class="list-toolbar"><div></div><button class="btn btn-primary" onclick="window._applyLeave()">+ Apply Leave</button></div>'+
      (data.length
        ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead><tbody>'+
          data.map(function(l){return '<tr><td>'+v(l.leave_type,'—')+'</td><td class="mono">'+fmt.date(l.from_date)+'</td><td class="mono">'+fmt.date(l.to_date)+'</td><td>'+(l.days||1)+'</td><td class="text-muted">'+v(l.reason,'—')+'</td><td>'+badge(l.status||'Pending')+'</td></tr>';}).join('')+
          '</tbody></table></div></div>'
        : '<div class="empty-state"><div class="empty-icon">🌴</div><div class="empty-title">No leave requests</div></div>'
      )+'</div>'
    );
    window._applyLeave = function() {
      openModal({
        title:'+ Apply Leave', size:'md',
        body:'<form id="leave-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">Leave Type *</label><select class="fselect" name="leave_type" required>'+opts(['Annual Leave','Sick Leave','Casual Leave','Maternity','Paternity','Compensatory','Unpaid'],null)+'</select></div>'+
          '<div class="fg"><label class="flabel">From Date *</label><input class="finput" type="date" name="from_date" required></div>'+
          '<div class="fg"><label class="flabel">To Date *</label><input class="finput" type="date" name="to_date" required></div>'+
          '<div class="fg full"><label class="flabel">Reason</label><textarea class="finput" name="reason" rows="2"></textarea></div>'+
          '</form>',
        submitLabel:'Apply',
        onSubmit: async function() {
          try{await post('/my/leaves',fd('leave-form'));toast('Leave applied','success');renderLeaves();}
          catch(e){toast(e.message,'error');}
        }
      });
    };
  } catch(e){showError(e.message);}
}

export async function renderTeam() {
  setPageTitle('My Team','');
  setBreadcrumb([{label:'My Portal',url:'/portal'},{label:'My Team'}]);
  showLoader();
  try {
    var res      = await get('/portal/team');
    var manager  = res.manager  || null;
    var reportees= res.reportees|| [];
    var peers    = res.peers    || [];

    function memberCard(m, role_label, color) {
      var name = (m.first_name||'') + ' ' + (m.last_name||'');
      return '<div class="struct-card" onclick="navigateTo(&apos;/employees/&apos;+' + m.id + '+&apos;&apos;)" style="cursor:pointer">' +
        '<div class="av av-lg av-'+color+'" style="margin:0 auto 8px">'+fmt.ini(name)+'</div>' +
        '<div class="struct-card-title">'+v(name)+'</div>' +
        '<div class="struct-card-desc">'+v(m.job_title,'—')+'</div>' +
        '<div style="margin-top:4px"><span class="badge badge-gray">'+role_label+'</span></div>' +
      '</div>';
    }

    var html = '<div class="page-body">';

    if (manager) {
      html += '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-header"><h3 class="card-title">📊 Reporting To</h3></div>' +
        '<div class="card-body"><div class="struct-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">' +
        memberCard(manager, 'Manager', 'purple') +
        '</div></div></div>';
    }

    if (reportees.length) {
      html += '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-header"><h3 class="card-title">👥 Direct Reports (' + reportees.length + ')</h3></div>' +
        '<div class="card-body"><div class="struct-grid">' +
        reportees.map(function(m) { return memberCard(m, 'Direct Report', 'green'); }).join('') +
        '</div></div></div>';
    }

    if (peers.length) {
      html += '<div class="card">' +
        '<div class="card-header"><h3 class="card-title">🤝 Colleagues (' + peers.length + ')</h3></div>' +
        '<div class="card-body"><div class="struct-grid">' +
        peers.map(function(m) { return memberCard(m, 'Colleague', 'blue'); }).join('') +
        '</div></div></div>';
    }

    if (!manager && !reportees.length && !peers.length) {
      html += '<div class="empty-state"><div class="empty-icon">👥</div>' +
        '<div class="empty-title">No team members found</div>' +
        '<div class="empty-sub">Your team will appear here once your manager and colleagues are set up in the system</div>' +
        '</div>';
    }

    html += '</div>';
    setContent(html);
  } catch(e){showError(e.message);}
}

export async function renderPayslips() {
  setPageTitle('My Payslips','');
  setBreadcrumb([{label:'My Portal',url:'/portal'},{label:'Payslips'}]);
  showLoader();
  try {
    var resp = await get('/payslips/list');
    var items = (resp && resp.items) || [];

    // Year filter options from the data
    var years = {};
    items.forEach(function(r){ if (r.year) years[r.year] = true; });
    var yearOpts = '<option value="">All Years</option>' +
      Object.keys(years).sort().reverse().map(function(y){
        return '<option value="'+v(y)+'">'+v(y)+'</option>';
      }).join('');
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var monthOpts = '<option value="">All Months</option>' +
      monthNames.map(function(n,i){ return '<option value="'+(i+1)+'">'+n+'</option>'; }).join('');

    function rowsHtml(list) {
      if (!list.length) {
        return '<tr><td colspan="5" class="empty-row">No payslips yet. They will appear here once a payroll run is processed.</td></tr>';
      }
      return list.map(function(r){
        var lop = parseFloat(r.lop_days || 0);
        return '<tr>' +
          '<td class="mono">'+v(r.ym)+'</td>' +
          '<td>'+fmt.date(r.run_date)+'</td>' +
          '<td>'+(lop ? lop : '0')+' Day(s)</td>' +
          '<td class="mono" style="text-align:right">'+fmt.money(r.net_salary)+'</td>' +
          '<td style="text-align:right">' +
            '<button class="btn btn-ghost btn-sm" onclick="window._viewPayslip('+r.entry_id+')">👁 View</button> ' +
            '<button class="btn btn-primary btn-sm" onclick="window._downloadPayslip('+r.entry_id+')">⬇ PDF</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function render(list) {
      setContent(
        '<div class="page-body">' +
        '<div class="card">' +
          '<div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px">' +
            '<h3 class="card-title">Payslip History</h3>' +
            '<div style="display:flex;gap:8px">' +
              '<select id="ps-year" class="form-control" onchange="window._filterPayslips()" style="width:auto">'+yearOpts+'</select>' +
              '<select id="ps-month" class="form-control" onchange="window._filterPayslips()" style="width:auto">'+monthOpts+'</select>' +
            '</div>' +
          '</div>' +
          '<div class="card-body">' +
            '<div class="tbl-wrap"><table class="tbl">' +
              '<thead><tr>' +
                '<th>Period</th><th>Date of Salary</th><th>LOP</th>' +
                '<th style="text-align:right">Net Salary</th>' +
                '<th style="text-align:right">Actions</th>' +
              '</tr></thead>' +
              '<tbody id="ps-tbody">'+rowsHtml(list)+'</tbody>' +
            '</table></div>' +
          '</div>' +
        '</div></div>'
      );
    }

    render(items);

    window._filterPayslips = function() {
      var y = document.getElementById('ps-year').value;
      var m = document.getElementById('ps-month').value;
      var filtered = items.filter(function(r){
        if (y && String(r.year) !== String(y)) return false;
        if (m && String(r.month) !== String(m)) return false;
        return true;
      });
      document.getElementById('ps-tbody').innerHTML = rowsHtml(filtered);
    };

    window._viewPayslip = function(eid) {
      var token = localStorage.getItem('mch_token') || '';
      window.open('/api/v2/payslips/'+eid+'/html?token='+encodeURIComponent(token), '_blank');
    };

    window._downloadPayslip = function(eid) {
      var token = localStorage.getItem('mch_token') || '';
      var link = document.createElement('a');
      link.href = '/api/v2/payslips/'+eid+'/pdf?token='+encodeURIComponent(token);
      link.download = '';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };
  } catch(e) { showError(e.message); }
}

export async function renderApprovals() {
  navigate('/timesheets/approval');
}

// Password change handler - registered when security tab is shown
function registerPwdHandler() {
  window._changePwd = async function() {
  var form = document.getElementById('pwd-form');
  if (!form) return;
  var data = Object.fromEntries(new FormData(form));
  if (!data.new_password || data.new_password.length < 8) { toast('Password must be at least 8 characters','error'); return; }
  if (data.new_password !== data.confirm_password) { toast('Passwords do not match','error'); return; }
  try {
    await post('/auth/change-password', { current_password: data.current_password, new_password: data.new_password });
    toast('Password changed successfully. Please log in again.','success');
    setTimeout(function(){ window.location.reload(); }, 2000);
  } catch(e) { toast(e.message,'error'); }
  };
}
