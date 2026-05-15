/**
 * McHR&TA v2 — Main Application Entry Point
 * Boots the router, handles auth state, builds sidebar.
 */

import * as API    from './api.js';
import * as Router from './router.js';
import { toast, setSidebarActive, setContent, showLoader, showError } from './ui.js';

// ── Auth state ─────────────────────────────────────────────────
let _user = null;

export function getUser() { return _user; }

async function tryAutoLogin() {
  const token = API.getToken();
  if (!token) {
    showLogin();
    return;
  }
  try {
    const user = await API.me();
    _user = user;
    API.setAuth(token, user);
    showApp();
  } catch {
    API.clearAuth();
    showLogin();
  }
}

// ── Login page ─────────────────────────────────────────────────
function showLogin() {
  document.getElementById('app-shell').style.display = 'none';
  const login = document.getElementById('login-screen');
  login.style.display = 'flex';
  login.innerHTML = `
    <div class="login-card">
      <div class="login-logo">
        <div class="login-logo-text">McHR<span>&</span>TA</div>
        <div class="login-tagline">Human Resources & Talent Acquisition</div>
      </div>
      <div class="login-form">
        <div class="fg">
          <label class="flabel">Username or Email</label>
          <input class="finput" id="lu" type="text" placeholder="admin" autocomplete="username">
        </div>
        <div class="fg">
          <label class="flabel">Password</label>
          <input class="finput" id="lp" type="password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <div id="login-error" class="login-error" style="display:none"></div>
        <button class="btn btn-primary btn-full" id="login-btn">Sign In →</button>
      </div>
      <div class="login-footer">McRaaN Human Resources & Talent Acquisition</div>
    </div>`;

  const doLogin = async () => {
    const u = document.getElementById('lu').value.trim();
    const p = document.getElementById('lp').value;
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    if (!u || !p) { errEl.textContent = 'Please enter username and password'; errEl.style.display=''; return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const data = await API.login(u, p);
      API.setAuth(data.token, data.user);
      _user = data.user;
      showApp();
    } catch (e) {
      errEl.textContent = e.message || 'Login failed';
      errEl.style.display = '';
      btn.disabled = false; btn.textContent = 'Sign In →';
    }
  };

  document.getElementById('login-btn').onclick = doLogin;
  document.getElementById('lp').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  document.getElementById('lu').onkeydown = e => { if (e.key === 'Enter') document.getElementById('lp').focus(); };
  setTimeout(() => document.getElementById('lu').focus(), 100);
}

// ── App shell ─────────────────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  const shell = document.getElementById('app-shell');
  shell.style.display = 'flex';
  buildSidebar();
  buildTopbar();
  Router.start();
}

// ── Sidebar ───────────────────────────────────────────────────
const NAV = {
  Admin: [
    { section: 'Overview', items: [
      { label: 'Dashboard', icon: '⊞', path: '/dashboard' },
    ]},
    { section: 'Organisation', items: [
      { label: 'Org Profile',     icon: '🏛', path: '/organisation/profile' },
      { label: 'Business Units',  icon: '🏢', path: '/organisation/business-units' },
      { label: 'Departments',     icon: '🗂', path: '/organisation/departments' },
      { label: 'Cost Centres',    icon: '💹', path: '/organisation/cost-centres' },
      { label: 'Locations',       icon: '📍', path: '/organisation/locations' },
    ]},
    { section: 'People', items: [
      { label: 'Employees',       icon: '👥', path: '/employees' },
      { label: 'Timesheets',      icon: '⏱', path: '/timesheets' },
      { label: 'Payroll',         icon: '💰', path: '/payroll' },
    ]},
    { section: 'Clients & Vendors', items: [
      { label: 'Clients',         icon: '🤝', path: '/clients' },
      { label: 'Vendors',         icon: '🏪', path: '/vendors' },
      { label: 'Projects',        icon: '📋', path: '/projects' },
    ]},
    { section: 'Talent Acquisition', items: [
      { label: 'Dashboard',       icon: '📊', path: '/recruitment' },
      { label: 'Job Requisitions',icon: '📝', path: '/recruitment/jobs' },
      { label: 'Candidates',      icon: '🎯', path: '/candidates' },
      { label: 'Pipeline',        icon: '🔄', path: '/recruitment/pipeline' },
      { label: 'Interviews',      icon: '🎙', path: '/recruitment/interviews' },
      { label: 'Offers',          icon: '📨', path: '/recruitment/offers' },
      { label: 'Onboarding',      icon: '🚀', path: '/recruitment/onboarding' },
    ]},
    { section: 'Finance', items: [
    ]},
    { section: 'Finance', items: [
      { label: 'Invoices',        icon: '🧾', path: '/invoices' },
      { label: 'Bills & Expenses',icon: '💸', path: '/bills' },
    ]},
    { section: 'Insights', items: [
      { label: 'Reports',         icon: '📈', path: '/reports' },
      { label: 'Audit Logs',      icon: '🔍', path: '/audit-logs' },
    ]},
    { section: 'Settings', items: [
      { label: 'Users',           icon: '👤', path: '/admin/users' },
      { label: 'Roles',           icon: '🔐', path: '/admin/roles' },
      { label: 'Settings',        icon: '⚙️', path: '/settings' },
    ]},
  ],
  Employee: [
    { section: 'My Portal', items: [
      { label: 'Dashboard',       icon: '⊞', path: '/portal' },
      { label: 'My Profile',      icon: '👤', path: '/portal/profile' },
      { label: 'Timesheets',      icon: '⏱', path: '/portal/timesheets' },
      { label: 'Leave',           icon: '🏖', path: '/portal/leaves' },
      { label: 'Payslips',        icon: '💰', path: '/portal/payslips' },
      { label: 'My Team',         icon: '👥', path: '/portal/team' },
    ]},
  ],
};

// Role → nav map (non-admin roles)
const ROLE_NAV = {
  'Recruiter':          ['Overview','Talent Acquisition'],
  'Recruiting Manager': ['Overview','Talent Acquisition','Clients & Vendors'],
  'Account Manager':    ['Overview','Clients & Vendors','Talent Acquisition'],
  'HR Manager':         ['Overview','People','Talent Acquisition'],
  'Finance Manager':    ['Overview','Finance','People'],
  'Finance':            ['Overview','Finance'],
};

function buildSidebar() {
  const role   = _user?.role || 'Employee';
  const navDef = NAV['Admin']; // Use admin nav as base, filter by role
  const allowed = ROLE_NAV[role] || null; // null = all sections (Admin)

  const sidebar = document.getElementById('sidebar');
  const sections = navDef.filter(s => !allowed || allowed.includes(s.section));

  // If employee with employee_id → show portal section
  const isEmployee = _user?.employee_id;
  let extraSections = [];
  if (isEmployee && role !== 'Admin') {
    extraSections = NAV['Employee'];
  }

  const allSections = role === 'Employee' ? NAV['Employee'] : [...sections, ...extraSections];

  sidebar.innerHTML = `
    <div class="sidebar-logo" onclick="navigateTo('/dashboard')">
      <div class="logo-mark">Mc</div>
      <div class="logo-text"><strong>HR&TA</strong><div class="logo-sub">McRaaN</div></div>
    </div>
    <nav class="sidebar-nav">
      ${allSections.map(s => `
        <div class="nav-section-label">${s.section}</div>
        ${s.items.map(item => `
          <a class="nav-item" data-path="${item.path}" href="#${item.path}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </a>`).join('')}
      `).join('')}
    </nav>
    <div class="sidebar-user">
      <div class="user-av ${getUserAvColor()}">${fmtIni(_user?.full_name || _user?.username)}</div>
      <div class="user-info">
        <div class="user-name">${_user?.full_name || _user?.username}</div>
        <div class="user-role">${role}</div>
      </div>
      <button class="btn-icon" id="logout-btn" title="Sign out">⏻</button>
    </div>`;

  document.getElementById('logout-btn').onclick = async () => {
    await API.logout();
    API.clearAuth();
    _user = null;
    showLogin();
  };

  // Active state on navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

function buildTopbar() {
  const topbar = document.getElementById('topbar');
  topbar.innerHTML = `
    <div class="topbar-left">
      <div id="breadcrumb" class="breadcrumb"></div>
    </div>
    <div class="topbar-right">
      <div class="search-wrap">
        <input class="topbar-search" id="global-search" placeholder="Search…" type="search">
      </div>
      <button class="btn-icon notif-btn" id="notif-btn" title="Notifications">
        🔔<span class="notif-badge" id="notif-badge" style="display:none">0</span>
      </button>
      <button class="btn btn-primary" id="primary-action-btn" style="display:none">+ Add New</button>
    </div>`;
}

// ── Global navigation helper ───────────────────────────────────
window.navigateTo = (path) => Router.navigate(path);

function fmtIni(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function getUserAvColor() {
  const colors = ['av-green','av-blue','av-purple','av-amber'];
  const name = _user?.full_name || _user?.username || '';
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

// ── Register all page routes ───────────────────────────────────
async function registerRoutes() {
  // Lazy-load page modules
  const load = (mod, fn) => async (params) => {
    const m = await import(`./pages/${mod}.js`);
    await m[fn](params);
    // Update sidebar active
    const path = Router.getCurrentPath();
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', path.startsWith(el.dataset.path));
    });
  };

  Router.route('/dashboard',                          load('dashboard',       'render'));
  Router.route('/organisation/profile',               load('organisation',    'renderProfile'));
  Router.route('/organisation/business-units',        load('orgstructure',    'renderBUs'));
  Router.route('/organisation/business-units/:id',    load('orgstructure',    'renderBUDetail'));
  Router.route('/organisation/departments',           load('orgstructure',    'renderDepts'));
  Router.route('/organisation/departments/:id',       load('orgstructure',    'renderDeptDetail'));
  Router.route('/organisation/cost-centres',          load('orgstructure',    'renderCostCentres'));
  Router.route('/organisation/locations',             load('orgstructure',    'renderLocations'));
  Router.route('/organisation/locations/:id',         load('orgstructure',    'renderLocationDetail'));
  Router.route('/employees',                          load('employees',       'renderList'));
  Router.route('/employees/new',                      load('employees',       'renderNew'));
  Router.route('/employees/:id',                      load('employees',       'renderDetail'));
  Router.route('/clients',                            load('clients',         'renderList'));
  Router.route('/clients/new',                        load('clients',         'renderNew'));
  Router.route('/clients/:id',                        load('clients',         'renderDetail'));
  Router.route('/vendors',                            load('vendors',         'renderList'));
  Router.route('/vendors/:id',                        load('vendors',         'renderDetail'));
  Router.route('/projects',                           load('projects',        'renderList'));
  Router.route('/projects/:id',                       load('projects',        'renderDetail'));
  Router.route('/timesheets',                         load('timesheets',      'renderList'));
  Router.route('/timesheets/approval',                load('timesheets',      'renderApproval'));
  Router.route('/timesheets/:id',                     load('timesheets',      'renderDetail'));
  Router.route('/payroll',                            load('payroll',         'renderList'));
  Router.route('/payroll/:id',                        load('payroll',         'renderDetail'));
  Router.route('/recruitment',                        load('recruitment',     'renderDashboard'));
  Router.route('/recruitment/jobs',                   load('recruitment',     'renderJobs'));
  Router.route('/recruitment/jobs/new',               load('recruitment',     'renderJobNew'));
  Router.route('/recruitment/jobs/:id',               load('recruitment',     'renderJobDetail'));
  Router.route('/candidates',                         load('recruitment',     'renderCandidates'));
  Router.route('/candidates/new',                     load('recruitment',     'renderCandidateNew'));
  Router.route('/candidates/:id',                     load('recruitment',     'renderCandidateDetail'));
  Router.route('/recruitment/pipeline',               load('recruitment',     'renderPipeline'));
  Router.route('/recruitment/interviews',             load('recruitment',     'renderInterviews'));
  Router.route('/recruitment/interviews/:id',         load('recruitment',     'renderInterviewDetail'));
  Router.route('/recruitment/offers',                 load('recruitment',     'renderOffers'));
  Router.route('/recruitment/offers/:id',             load('recruitment',     'renderOfferDetail'));
  Router.route('/recruitment/onboarding',             load('recruitment',     'renderOnboarding'));
  Router.route('/recruitment/onboarding/:id',         load('recruitment',     'renderOnboardingDetail'));
  Router.route('/invoices',                           load('invoices',        'renderList'));
  Router.route('/invoices/new',                       load('invoices',        'renderNew'));
  Router.route('/invoices/:id',                       load('invoices',        'renderDetail'));
  Router.route('/reports',                            load('reports',         'renderHome'));
  Router.route('/reports/:type',                      load('reports',         'renderReport'));
  Router.route('/bills',                              load('bills',           'renderList'));
  Router.route('/bills/:id',                           load('bills',           'renderDetail'));
  Router.route('/audit-logs',                         load('auditlogs',       'renderList'));
  Router.route('/admin/users',                        load('admin',           'renderUsers'));
  Router.route('/admin/users/:id',                    load('admin',           'renderUserDetail'));
  Router.route('/admin/roles',                        load('admin',           'renderRoles'));
  Router.route('/settings',                           load('admin',           'renderSettings'));
  Router.route('/portal',                             load('portal',          'renderDashboard'));
  Router.route('/portal/profile',                     load('portal',          'renderProfile'));
  Router.route('/portal/timesheets',                  load('portal',          'renderTimesheets'));
  Router.route('/portal/leaves',                      load('portal',          'renderLeaves'));
  Router.route('/portal/payslips',                    load('portal',          'renderPayslips'));
  Router.route('/portal/team',                        load('portal',          'renderTeam'));
  Router.route('/portal/approvals',                   load('portal',          'renderApprovals'));
  Router.route('/login',  () => showLogin());
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await registerRoutes();
  await tryAutoLogin();
});
