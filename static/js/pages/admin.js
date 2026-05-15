import { get, post, put }  from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable } from '../ui.js';
import { navigate }        from '../router.js';

export async function renderUsers() {
  setPageTitle('Users', 'User accounts');
  setBreadcrumb([{ label: 'Users' }]);
  showLoader();
  try {
    const [users, masters] = await Promise.all([get('/users'), get('/masters/all')]);
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <div></div>
          <button class="btn btn-primary" onclick="window._addUser()">+ New User</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Username', key: 'username',      render: r => `<strong>${r.username}</strong>` },
            { label: 'Name',     key: 'full_name' },
            { label: 'Email',    key: 'email' },
            { label: 'Role',     key: 'role',          render: r => `<span class="badge badge-blue">${r.role}</span>` },
            { label: 'Employee', key: 'employee_name', render: r => r.employee_name||'—' },
            { label: 'Last Login',key:'last_login',    render: r => fmt.date(r.last_login) },
            { label: 'Status',   key: 'is_active',    render: r => badge(r.is_active?'Active':'Inactive') },
          ],
          rows: Array.isArray(users) ? users : [],
          onRowClick: r => navigate(`/admin/users/${r.id}`),
          emptyMessage: 'No users found',
        })}
      </div>`);

    window._addUser = () => {
      openModal({
        title: 'New User',
        size: 'md',
        body: `<form id="user-form" class="form-grid-sm">
          <div class="fg"><label class="flabel">Username *</label><input class="finput" name="username" required></div>
          <div class="fg"><label class="flabel">Email *</label><input class="finput" type="email" name="email" required></div>
          <div class="fg"><label class="flabel">Full Name</label><input class="finput" name="full_name"></div>
          <div class="fg"><label class="flabel">Password *</label><input class="finput" type="password" name="password" required minlength="8"></div>
          <div class="fg"><label class="flabel">Role *</label>
            <select class="fselect" name="role_id" required>
              ${(masters['user-roles']||[]).map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}
            </select></div>
          <div class="fg"><label class="flabel">Link to Employee</label>
            <select class="fselect" name="employee_id">
              <option value="">None</option>
              ${(masters['employees-lookup']||[]).map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}
            </select></div>
        </form>`,
        submitLabel: 'Create User',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('user-form')));
          Object.keys(data).forEach(k => { if (data[k]==='') data[k]=null; });
          await post('/users', data);
          toast('User created', 'success');
          renderUsers();
        }
      });
    };
  } catch (e) { showError(e.message); }
}

export async function renderUserDetail({ id }) {
  showLoader();
  try {
    const user = await get(`/users/${id}`);
    setPageTitle(user.username, user.role);
    setBreadcrumb([{ label: 'Users', url: '/admin/users' }, { label: user.username }]);
    setContent(`<div class="page-body"><div class="card form-card">
      <div class="card-body">
        <div class="field-grid">
          ${f('Username',  user.username)}${f('Email',    user.email)}
          ${f('Full Name', user.full_name)}${f('Role',   user.role)}
          ${f('Last Login',fmt.date(user.last_login))}${f('Status', user.is_active?'Active':'Inactive')}
        </div>
      </div>
    </div></div>`);
  } catch (e) { showError(e.message); }
}

export async function renderRoles() {
  setPageTitle('Roles', 'User roles');
  setBreadcrumb([{ label: 'Roles' }]);
  showLoader();
  try {
    const roles = await get('/roles');
    setContent(`<div class="page-body">
      ${renderTable({
        columns: [
          { label: 'Role',        key: 'name',        render: r => `<strong>${r.name}</strong>` },
          { label: 'Description', key: 'description', render: r => r.description||'—' },
        ],
        rows: Array.isArray(roles) ? roles : [],
        emptyMessage: 'No roles found',
      })}
    </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderSettings() {
  setPageTitle('Settings', 'System configuration');
  setBreadcrumb([{ label: 'Settings' }]);
  setContent(`<div class="page-body">
    <div class="reports-grid">
      ${[
        ['🏛','Organisation',  '/organisation/profile'],
        ['🔐','Security',      '#'],
        ['📧','Email',         '#'],
        ['⚙️','General',       '#'],
      ].map(([icon, label, href]) => `
        <div class="report-card" onclick="navigateTo('${href}')">
          <div class="report-icon">${icon}</div>
          <div class="report-title">${label}</div>
        </div>`).join('')}
    </div>
  </div>`);
}

export async function renderOrganisation() {}

function f(l, v) { return `<div class="field-item"><div class="field-label">${l}</div><div class="field-value${!v?' empty':''}">${v||'—'}</div></div>`; }
