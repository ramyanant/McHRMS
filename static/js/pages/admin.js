/**
 * Admin — Users, Roles, RBAC, Settings, Audit Logs
 * Issue #18: Admin can grant access, manage roles and permissions
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable } from '../ui.js';
import { navigate } from '../router.js';

function v(val,fb){if(val===null||val===undefined)return fb!==undefined?fb:'';return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fd(id){const d=Object.fromEntries(new FormData(document.getElementById(id)));Object.keys(d).forEach(k=>{if(d[k]==='')d[k]=null;});return d;}
function opts(arr,sel,vk,lk){return arr.map(i=>{const val=typeof i==='string'?i:i[vk||'id'];const lbl=typeof i==='string'?i:i[lk||'name'];return '<option value="'+v(val)+'"'+(String(val)===String(sel)?' selected':'')+'>'+v(lbl)+'</option>';}).join('');}

// ═══════════════════════════════════════════════════════════════
// USERS — Full RBAC management
// ═══════════════════════════════════════════════════════════════
export async function renderUsers() {
  setPageTitle('Users & Access', 'Role-Based Access Control');
  setBreadcrumb([{ label:'Admin' }, { label:'Users' }]);
  showLoader();
  try {
    const [users, masters] = await Promise.all([get('/users'), get('/masters/all')]);
    const rows = Array.isArray(users) ? users : [];

    let uQ='', uSortCol='full_name', uSortDir=1, uPage=1;
    const U_PER=25;

    function getU() {
      let d=[...rows];
      if(uQ) d=d.filter(r=>(r.full_name+' '+r.username+' '+r.email+' '+(r.role||'')).toLowerCase().includes(uQ.toLowerCase()));
      return d.slice().sort((a,b)=>String(a[uSortCol]||'').localeCompare(String(b[uSortCol]||''))*uSortDir);
    }
    function thU(col,label){const arr=uSortCol===col?(uSortDir===1?' ↑':' ↓'):'';return '<th class="sortable" onclick="window._uSort(\''+col+'\')" style="cursor:pointer">'+label+arr+'</th>';}
    function renderU() {
      const all=getU(), total=all.length, pages=Math.max(1,Math.ceil(total/U_PER));
      uPage=Math.min(Math.max(1,uPage),pages);
      const d=all.slice((uPage-1)*U_PER,uPage*U_PER);
      let pgBar=''; if(pages>1){let bts=[];if(uPage>1)bts.push('<button class="pg-btn" onclick="window._uPg('+(uPage-1)+')">‹</button>');for(let p=Math.max(1,uPage-2);p<=Math.min(pages,uPage+2);p++)bts.push('<button class="pg-btn'+(p===uPage?' active':'')+'" onclick="window._uPg('+p+')">'+p+'</button>');if(uPage<pages)bts.push('<button class="pg-btn" onclick="window._uPg('+(uPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' users</span></div>';}
      document.getElementById('users-table').innerHTML =
        '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>'+
          thU('full_name','User')+thU('email','Email')+thU('role','Role')+
          '<th>Linked Employee</th>'+thU('last_login','Last Login')+thU('is_active','Status')+'<th>Actions</th>'+
        '</tr></thead><tbody>'+
        d.map(u=>'<tr class="tbl-clickable" onclick="navigateTo(\'/admin/users/'+u.id+'\')">' +
        '<td><div class="cell-person">'+
          fmt.avatar(u.full_name||u.username, u.employee_photo_url, 'av-sm')+
          '<div><div class="cell-name">'+v(u.full_name||u.username)+'</div>'+
          '<div class="cell-sub mono">'+v(u.username)+'</div></div>'+
        '</div></td>'+
        '<td>'+v(u.email,'—')+'</td>'+
        '<td><span class="badge badge-'+(u.role==='Admin'?'red':'blue')+'">'+v(u.role,'—')+'</span></td>'+
        '<td>'+v(u.employee_name,'None')+'</td>'+
        '<td class="text-muted">'+fmt.date(u.last_login)+'</td>'+
        '<td>'+badge(u.is_active==1?'Active':'Inactive')+'</td>'+
        '<td class="tbl-actions" onclick="event.stopPropagation()">'+
          '<button class="btn btn-ghost btn-xs" onclick="window._editUser('+u.id+')">✏ Edit</button>'+
          '<button class="btn btn-ghost btn-xs" onclick="window._resetPwd('+u.id+')">🔑 Reset</button>'+
          (u.is_active==1
            ? '<button class="btn btn-danger btn-xs" onclick="window._deactivate('+u.id+')">Deactivate</button>'
            : '<button class="btn btn-ghost btn-xs" onclick="window._activate('+u.id+')">Activate</button>')+
        '</td></tr>'
      ).join('')+'</tbody></table></div>'+pgBar+'</div>';
    }

    setContent(
      '<div class="page-body">'+
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">'+
        kpi('Total Users',   rows.length,                          '👤','blue')+
        kpi('Active',        rows.filter(r=>r.is_active==1).length,'✅','green')+
        kpi('Admins',        rows.filter(r=>r.role==='Admin').length,'🔐','purple')+
        kpi('Locked',        rows.filter(r=>r.is_active==0).length, '🔒','amber')+
      '</div>'+
      '<div class="struct-toolbar">'+
        '<input class="search-input" placeholder="Search users…" oninput="window._uQ(this.value)" style="width:220px">'+
        '<button class="btn btn-primary" onclick="window._addUser()">+ Create User</button>'+
      '</div>'+
      '<div id="users-table"></div>'+
      '</div>'
    );
    renderU();
    window._uQ     = val=>{uQ=val;uPage=1;renderU();};
    window._uSort  = col=>{uSortCol===col?uSortDir*=-1:(uSortCol=col,uSortDir=1);renderU();};
    window._uPg    = p=>{uPage=p;renderU();};
    window._addUser    = () => userModal(null, masters);
    window._editUser   = id => userModal(rows.find(r=>r.id===id), masters);
    window._resetPwd   = id => resetPwdModal(id, masters);
    window._deactivate = async id => {
      if (!confirm('Deactivate this user? They will lose access immediately.')) return;
      await put('/users/'+id, { is_active: 0 });
      toast('User deactivated', 'info');
      renderUsers();
    };
    window._activate = async id => {
      await put('/users/'+id, { is_active: 1 });
      toast('User activated', 'success');
      renderUsers();
    };
  } catch(e) { showError(e.message); }
}

function kpi(l,val,icon,c) { return '<div class="kpi-card kpi-'+c+'"><div class="kpi-icon">'+icon+'</div><div class="kpi-body"><div class="kpi-value">'+val+'</div><div class="kpi-label">'+l+'</div></div></div>'; }

function userModal(existing, masters) {
  const isEdit = !!existing;
  const roles  = masters['user-roles'] || [];
  const emps   = masters['employees-lookup'] || [];

  openModal({
    title: isEdit ? '✏ Edit User: '+v(existing.username) : '+ Create New User', size: 'lg',
    body:
      '<form id="user-form" class="form-grid-sm">'+
      '<div class="fg"><label class="flabel">Username *</label><input class="finput" name="username" value="'+v((existing && existing.username))+'" required placeholder="lowercase_username"></div>'+
      '<div class="fg"><label class="flabel">Full Name *</label><input class="finput" name="full_name" value="'+v((existing && existing.full_name))+'" required></div>'+
      '<div class="fg"><label class="flabel">Email *</label><input class="finput" type="email" name="email" value="'+v((existing && existing.email))+'" required></div>'+
      (isEdit ? '' : '<div class="fg"><label class="flabel">Password *</label><input class="finput" type="password" name="password" required minlength="8" placeholder="Min 8 characters"></div>')+
      '<div class="fg"><label class="flabel">Role *</label><select class="fselect" name="role_id" required>'+
        '<option value="">Select role…</option>'+opts(roles,(existing && existing.role_id))+'</select>'+
        '<div class="field-hint">Determines what this user can access</div></div>'+
      '<div class="fg"><label class="flabel">Link to Employee</label><select class="fselect" name="employee_id">'+
        '<option value="">None (standalone user)</option>'+opts(emps,(existing && existing.employee_id))+'</select>'+
        '<div class="field-hint">Links this login to an employee record (enables self-service portal)</div></div>'+
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="is_active">'+
        '<option value="1"'+((existing && existing.is_active)!=0?' selected':'') +'>Active</option>'+
        '<option value="0"'+((existing && existing.is_active)==0?' selected':'')+'>Inactive</option>'+
      '</select></div>'+
      '</form>',
    submitLabel: isEdit ? 'Save Changes' : 'Create User',
    onSubmit: async () => {
      const data = fd('user-form');
      data.is_active = parseInt(data.is_active);
      try {
        if (isEdit) await put('/users/'+existing.id, data);
        else await post('/users', data);
        toast(isEdit ? 'User updated' : 'User created', 'success');
        renderUsers();
      } catch(e) { toast(e.message, 'error'); }
    }
  });
}

function resetPwdModal(userId, masters) {
  openModal({
    title: '🔑 Reset Password',
    body: '<form id="pwd-form" class="form-grid-sm">'+
      '<div class="fg full"><label class="flabel">New Password *</label><input class="finput" type="password" name="password" required minlength="8" placeholder="Min 8 characters"></div>'+
      '<div class="fg full"><label class="flabel">Confirm Password *</label><input class="finput" type="password" name="confirm" required placeholder="Repeat new password"></div>'+
      '<div class="fg full" style="background:var(--amber-l);padding:10px;border-radius:6px;font-size:12px;color:#92400e">'+
        '⚠️ This will immediately reset the password. The user must change it on next login.'+
      '</div>'+
    '</form>',
    submitLabel: 'Reset Password',
    onSubmit: async () => {
      const data = fd('pwd-form');
      if (data.password !== data.confirm) { toast('Passwords do not match', 'error'); return false; }
      await put('/users/'+userId, { password: data.password, must_change_pwd: 1 });
      toast('Password reset. User must change on next login.', 'success');
    }
  });
}

export async function renderUserDetail({ id }) {
  showLoader();
  try {
    const [user, masters] = await Promise.all([get('/users/'+id), get('/masters/all')]);
    setPageTitle(user.full_name||user.username, user.role||'User');
    setBreadcrumb([{ label:'Users', url:'/admin/users' }, { label: user.username }]);
    setContent(
      '<div class="detail-layout">'+
      '<div class="detail-sidebar"><div class="card">'+
        '<div class="profile-hero" style="background:linear-gradient(135deg,#7c3aed,#5b21b6)">'+
          (user.employee_photo_url
            ? '<img src="'+user.employee_photo_url+'" alt="Photo" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.5);margin:0 auto 10px;display:block" onerror="this.onerror=null;this.outerHTML=\'<div class=&quot;av av-xl&quot; style=&quot;background:#fff;color:#7c3aed;margin:0 auto 10px&quot;>'+fmt.ini(user.full_name||user.username)+'</div>\'">'
            : '<div class="av av-xl" style="background:#fff;color:#7c3aed;margin:0 auto 10px">'+fmt.ini(user.full_name||user.username)+'</div>')+
          '<div class="profile-name">'+v(user.full_name||user.username)+'</div>'+
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(user.username)+'</div>'+
          '<div style="margin-top:8px"><span class="badge badge-'+(user.role==='Admin'?'red':'blue')+'">'+v(user.role)+'</span></div>'+
        '</div>'+
        '<div class="profile-meta">'+
          '<div class="meta-row"><span>Email</span><strong>'+v(user.email,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Status</span>'+badge(user.is_active==1?'Active':'Inactive')+'</div>'+
          '<div class="meta-row"><span>Last Login</span><strong>'+fmt.date(user.last_login)+'</strong></div>'+
          '<div class="meta-row"><span>Employee</span><strong>'+v(user.employee_name,'Not linked')+'</strong></div>'+
        '</div>'+
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
          '<button class="btn btn-primary btn-full" onclick="window._editU()">✏ Edit User</button>'+
          '<button class="btn btn-ghost btn-full" onclick="window._resetP()">🔑 Reset Password</button>'+
          (user.is_active==1
            ? '<button class="btn btn-danger btn-full" onclick="window._deactU()">Deactivate</button>'
            : '<button class="btn btn-ghost btn-full" onclick="window._actU()">Activate</button>')+
        '</div>'+
      '</div></div>'+
      '<div class="detail-main">'+
        '<div class="card"><div class="card-header"><h3 class="card-title">Access Details</h3></div>'+
        '<div class="card-body"><div class="field-grid">'+
          '<div class="field-item"><div class="field-label">Role</div><div class="field-value">'+v(user.role,'—')+'</div></div>'+
          '<div class="field-item"><div class="field-label">Must Change Password</div><div class="field-value">'+( user.must_change_pwd?'Yes':'No')+'</div></div>'+
        '</div></div></div>'+
      '</div></div>'
    );
    window._editU  = () => userModal(user, masters);
    window._resetP = () => resetPwdModal(user.id, masters);
    window._deactU = async () => { await put('/users/'+user.id,{is_active:0}); toast('Deactivated','info'); navigate('/admin/users'); };
    window._actU   = async () => { await put('/users/'+user.id,{is_active:1}); toast('Activated','success'); navigate('/admin/users'); };
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════════════
export async function renderRoles() {
  setPageTitle('Roles & Permissions', 'Define access levels');
  setBreadcrumb([{ label:'Admin' }, { label:'Roles' }]);
  showLoader();
  try {
    var roles  = await get('/roles');
    var rows   = Array.isArray(roles) ? roles : [];
    var modules = ['Organisation','Employees','Timesheets','Recruitment','Clients','Vendors','Projects','Invoices','Bills','Reports','Admin'];

    function renderMatrix() {
      return '<div class="card" style="margin-top:16px">' +
        '<div class="card-header"><h3 class="card-title">Permission Matrix</h3>' +
          '<div class="text-muted" style="font-size:12px">Check boxes to grant access. Save per role.</div>' +
        '</div>' +
        '<div class="tbl-wrap"><table class="data-table" id="perm-matrix"><thead><tr>' +
          '<th>Module</th>' +
          rows.map(function(r) {
            return '<th style="text-align:center;min-width:120px">' + v(r.name) +
              '<br><button class="btn btn-primary btn-xs" style="margin-top:4px" onclick="window._savePerms(' + r.id + ',\'' + v(r.name) + '\')">Save</button></th>';
          }).join('') +
        '</tr></thead><tbody>' +
        modules.map(function(mod) {
          return '<tr><td><strong>' + mod + '</strong></td>' +
            rows.map(function(r) {
              var pid = 'perm_' + r.id + '_' + mod.replace(/[^a-zA-Z]/g,'_');
              return '<td style="text-align:center">' +
                '<div style="display:flex;flex-direction:column;gap:2px;align-items:center;font-size:10px">' +
                  '<label><input type="checkbox" id="' + pid + '_view" data-role="' + r.id + '" data-mod="' + mod + '" data-perm="view"> View</label>' +
                  '<label><input type="checkbox" id="' + pid + '_create" data-role="' + r.id + '" data-mod="' + mod + '" data-perm="create"> Create</label>' +
                  '<label><input type="checkbox" id="' + pid + '" data-role="' + r.id + '" data-mod="' + mod + '" data-perm="edit"> Edit</label>' +
                  '<label><input type="checkbox" id="' + pid + '_delete" data-role="' + r.id + '" data-mod="' + mod + '" data-perm="delete"> Delete</label>' +
                '</div></td>';
            }).join('') +
          '</tr>';
        }).join('') +
        '</tbody></table></div></div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="list-toolbar"><div></div>' +
        '<button class="btn btn-primary" onclick="window._addRole()">+ New Role</button>' +
      '</div>' +
      '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        '<th>Role</th><th>Description</th><th>System</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      rows.map(function(r) {
        return '<tr><td><strong>' + v(r.name) + '</strong></td>' +
          '<td class="text-muted">' + v(r.description,'—') + '</td>' +
          '<td>' + badge(r.is_system ? 'System' : 'Custom') + '</td>' +
          '<td class="tbl-actions">' +
            (!r.is_system ? '<button class="btn btn-ghost btn-xs" onclick="window._editRole(' + r.id + ')">✏ Edit</button>' : '') +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div></div>' +
      renderMatrix() +
      '</div>'
    );

    // Load existing permissions into checkboxes
    rows.forEach(function(r) {
      get('/roles/' + r.id + '/permissions').then(function(perms) {
        var permList = Array.isArray(perms) ? perms : [];
        permList.forEach(function(p) {
          var base = 'perm_' + r.id + '_' + p.module.replace(/[^a-zA-Z]/g,'_');
          ['view','create','edit','delete'].forEach(function(perm) {
            var el = document.getElementById(base + '_' + perm);
            if (el && p['can_' + perm]) el.checked = true;
          });
        });
      }).catch(function(){});
    });

    window._addRole = function() { roleModal(null); };
    window._editRole = function(id) { roleModal(rows.find(function(r){return r.id===id;})); };

    window._savePerms = async function(roleId, roleName) {
      var permissions = [];
      modules.forEach(function(mod) {
        var base = 'perm_' + roleId + '_' + mod.replace(/[^a-zA-Z]/g,'_');
        var view   = document.getElementById(base + '_view');
        var create = document.getElementById(base + '_create');
        var edit   = document.getElementById(base);
        var del    = document.getElementById(base + '_delete');
        permissions.push({
          module: mod,
          can_view:   view && view.checked ? 1 : 0,
          can_create: create && create.checked ? 1 : 0,
          can_edit:   edit && edit.checked ? 1 : 0,
          can_delete: del && del.checked ? 1 : 0,
        });
      });
      try {
        await post('/roles/' + roleId + '/permissions', { permissions: permissions });
        toast('Permissions saved for ' + roleName, 'success');
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { showError(e.message); }
}

function roleModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Role' : '+ New Role',
    body: '<form id="role-form" class="form-grid-sm">'+
      '<div class="fg full"><label class="flabel">Role Name *</label><input class="finput" name="name" value="'+v((existing && existing.name))+'" required placeholder="e.g. Finance Manager"></div>'+
      '<div class="fg full"><label class="flabel">Description</label><textarea class="finput" name="description" rows="2">'+v((existing && existing.description))+'</textarea></div>'+
    '</form>',
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('role-form');
      try {
        if (isEdit) await put('/roles/'+existing.id, data).catch(()=>post('/roles', data));
        else await post('/roles', data);
        toast(isEdit?'Updated':'Created', 'success');
        renderRoles();
      } catch(e) { toast(e.message, 'error'); }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════
export async function renderAuditLogs() {
  setPageTitle('Audit Logs', 'System activity');
  setBreadcrumb([{ label:'Admin' }, { label:'Audit Logs' }]);
  showLoader();
  try {
    const data = await get('/admin/audit-logs');
    const rows = data.items || [];
    setContent(
      '<div class="page-body">'+
      '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>'+
        '<th>Time</th><th>User</th><th>Module</th><th>Action</th><th>Entity</th><th>Description</th><th>IP</th>'+
      '</tr></thead><tbody>'+
      rows.map(r=>'<tr>'+
        '<td class="mono text-muted">'+fmt.date(r.created_at)+'</td>'+
        '<td>'+v(r.username,'—')+'</td>'+
        '<td><span class="badge badge-gray">'+v(r.module,'—')+'</span></td>'+
        '<td>'+badge(r.action)+'</td>'+
        '<td class="text-muted">'+v(r.entity_type,'—')+'</td>'+
        '<td class="text-muted">'+v(r.description,'—')+'</td>'+
        '<td class="mono text-muted">'+v(r.ip_address,'—')+'</td>'+
      '</tr>').join('')+'</tbody></table></div></div>'+
      '</div>'
    );
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════
export async function renderSettings() {
  setPageTitle('Settings', 'System administration');
  setBreadcrumb([{ label:'Settings' }]);

  const sections = [
    { icon:'🏛', label:'Organisation Profile',  desc:'Company info, logo, statutory details', href:'/organisation/profile' },
    { icon:'🏢', label:'Business Units',         desc:'Manage top-level divisions', href:'/organisation/business-units' },
    { icon:'📂', label:'Departments',            desc:'Departments and structure', href:'/organisation/departments' },
    { icon:'💰', label:'Cost Centres',           desc:'Budget tracking and GL codes', href:'/organisation/cost-centres' },
    { icon:'📍', label:'Locations',              desc:'Office and site management', href:'/organisation/locations' },
    { icon:'👤', label:'Users & Access',         desc:'User accounts and login management', href:'/admin/users' },
    { icon:'🔐', label:'Roles & Permissions',    desc:'Role-based access control', href:'/admin/roles' },
    { icon:'🔍', label:'Audit Logs',             desc:'System activity and change history', href:'/audit-logs' },
  ];

  var html = '<div class="page-body"><div class="reports-grid">';
  sections.forEach(function(s) {
    html += '<div class="report-card" onclick="navigateTo(\'' + s.href + '\')">' +
      '<div class="report-icon">' + s.icon + '</div>' +
      '<div class="report-title">' + s.label + '</div>' +
      '<div class="report-desc">' + s.desc + '</div>' +
      '<div class="report-arrow">Go to →</div>' +
      '</div>';
  });
  html += '</div></div>';
  setContent(html);
}


export async function renderOrganisation() {
  navigate('/organisation/profile');
}
