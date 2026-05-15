import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

export async function renderUsers() {
  const [users, roles] = await Promise.all([API.users(), API.roles()]);
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Users & Access</div>
      <button class="btn btn-primary" onclick="window._newUser()">+ Add User</button>
    </div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Employee</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${(users||[]).map(u=>`<tr>
          <td class="td-mono">${u.username}</td>
          <td>${u.full_name||'—'}</td>
          <td><span class="pill pill-blue">${u.role}</span></td>
          <td>${u.employee_name||'—'}</td>
          <td style="color:var(--txt3);font-size:12px">${u.last_login?fmt.date(u.last_login):'Never'}</td>
          <td>${pillStatus(u.is_active?'Active':'Inactive')}</td>
          <td><button class="btn btn-ghost btn-xs" onclick="window._editUser(${u.id},'${u.username}','${u.role}',${u.role_id},${u.employee_id||'null'})">Edit</button></td>
        </tr>`).join('')}
        ${!(users||[]).length?'<tr><td colspan="7"><div class="empty-state"><div class="empty-state-title">No users</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
  window._newUser = () => {
    showModal({ title:'Add User',
      body:`<form id="uf"><div class="form-grid">
        <div class="field"><label class="label">Username *</label><input class="input" name="username" required></div>
        <div class="field"><label class="label">Email *</label><input class="input" type="email" name="email" required></div>
        <div class="field"><label class="label">Full Name</label><input class="input" name="full_name"></div>
        <div class="field"><label class="label">Password *</label><input class="input" type="password" name="password" required></div>
        <div class="field"><label class="label">Role *</label>
          <select class="select" name="role_id">${buildOptions(roles||[],'id','name','','Select Role')}</select></div>
        <div class="field"><label class="label">Link Employee</label>
          <select class="select" name="employee_id">${buildOptions(getMaster('employees-lookup'),'id','name','','None')}</select></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveUser()">Create User</button>`,
    });
    window._saveUser = async () => {
      try { await API.userCreate(getFormData(document.getElementById('uf')));
        toast('User created','success'); closeModal(); renderUsers();
      } catch(e) { toast(e.message,'error'); }
    };
  };
  window._editUser = (id, username, role, role_id, emp_id) => {
    showModal({ title:`Edit User: ${username}`,
      body:`<form id="uf2"><div class="form-grid">
        <div class="field"><label class="label">Role *</label>
          <select class="select" name="role_id">${buildOptions(roles||[],'id','name',role_id,'Select Role')}</select></div>
        <div class="field"><label class="label">Link Employee</label>
          <select class="select" name="employee_id">${buildOptions(getMaster('employees-lookup'),'id','name',emp_id,'None')}</select></div>
        <div class="field"><label class="label">New Password (blank=keep)</label>
          <input class="input" type="password" name="password" placeholder="Leave blank to keep"></div>
        <div class="field"><label class="label">Status</label>
          <select class="select" name="is_active"><option value="true">Active</option><option value="false">Inactive</option></select></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._updateUser(${id})">Save</button>`,
    });
    window._updateUser = async (uid) => {
      const d = getFormData(document.getElementById('uf2'));
      if (!d.password) delete d.password;
      d.is_active = d.is_active === 'true';
      d.role_id   = parseInt(d.role_id);
      d.employee_id = d.employee_id ? parseInt(d.employee_id) : null;
      try { await API.userUpdate(uid, d);
        toast('Updated','success'); closeModal(); renderUsers();
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderAuditLogs() {
  const data = await API.auditLogs({ per_page:50 });
  const rows = data?.items || [];
  setContent(`
    <div class="toolbar"><div class="toolbar-title">Audit Logs</div></div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Time</th><th>User</th><th>Module</th><th>Action</th><th>Entity</th><th>Description</th><th>IP</th></tr></thead>
      <tbody>
        ${rows.map(l=>`<tr>
          <td class="td-mono" style="font-size:11px;white-space:nowrap">${fmt.date(l.created_at)}</td>
          <td>${l.username||'—'}</td>
          <td><span class="pill pill-gray">${l.module||'—'}</span></td>
          <td><span class="pill ${l.action==='CREATE'?'pill-green':l.action==='DELETE'?'pill-red':l.action==='LOGIN'?'pill-blue':'pill-amber'}">${l.action}</span></td>
          <td style="font-size:12px">${l.entity_type||'—'} ${l.entity_id?'#'+l.entity_id:''}</td>
          <td style="font-size:12px;color:var(--txt2)">${l.description||'—'}</td>
          <td class="td-mono" style="font-size:11px">${l.ip_address||'—'}</td>
        </tr>`).join('')}
        ${!rows.length?'<tr><td colspan="7"><div class="empty-state"><div class="empty-state-title">No audit logs</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
}
