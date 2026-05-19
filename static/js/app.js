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
  login.innerHTML =
    '<div class="login-card">' +
      '<div class="login-logo">' +
        '<div class="login-logo-text">McHR<span>&amp;</span>TA</div>' +
        '<div class="login-tagline">Human Resources &amp; Talent Acquisition</div>' +
      '</div>' +
      '<div class="login-form">' +
        '<div class="fg">' +
          '<label class="flabel">Username or Email</label>' +
          '<input class="finput" id="lu" type="text" placeholder="admin" autocomplete="username">' +
        '</div>' +
        '<div class="fg">' +
          '<label class="flabel">Password</label>' +
          '<input class="finput" id="lp" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password">' +
        '</div>' +
        '<div id="login-error" class="login-error" style="display:none"></div>' +
        '<button class="btn btn-primary btn-full" id="login-btn">Sign In \u2192</button>' +
      '</div>' +
      '<div class="login-footer">McRaaN Human Resources &amp; Talent Acquisition</div>' +
    '</div>';

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

// ── Sidebar ────────────────────────────────────────────────────
const NAV = {
  Admin: [
    { section: 'Organisation', icon: '🏛', dashboard: '/org-dashboard', items: [
      { label: 'Org Profile',     icon: '🏛', path: '/organisation/profile' },
      { label: 'Business Units',  icon: '🏢', path: '/organisation/business-units' },
      { label: 'Departments',     icon: '🗂', path: '/organisation/departments' },
      { label: 'Cost Centres',    icon: '💹', path: '/organisation/cost-centres' },
      { label: 'Locations',       icon: '📍', path: '/organisation/locations' },
    ]},
    { section: 'People', icon: '👥', dashboard: '/people-dashboard', items: [
      { label: 'Employees',       icon: '👥', path: '/employees' },
      { label: 'Timesheets',      icon: '⏱', path: '/timesheets' },
      { label: 'Approval Queue',  icon: '✅', path: '/timesheets/approval' },
      { label: 'Payroll',         icon: '💰', path: '/payroll' },
    ]},
    { section: 'Clients & Vendors', icon: '🤝', dashboard: '/clients-dashboard', items: [
      { label: 'Clients',         icon: '🤝', path: '/clients' },
      { label: 'Vendors',         icon: '🏪', path: '/vendors' },
      { label: 'Projects',        icon: '📋', path: '/projects' },
    ]},
    { section: 'Talent Acquisition', icon: '🎯', dashboard: '/recruitment', items: [
      { label: 'Job Requisitions',icon: '📝', path: '/recruitment/jobs' },
      { label: 'Candidates',      icon: '🎯', path: '/candidates' },
      { label: 'Pipeline',        icon: '🔄', path: '/recruitment/pipeline' },
      { label: 'Interviews',      icon: '🎙', path: '/recruitment/interviews' },
      { label: 'Offers',          icon: '📨', path: '/recruitment/offers' },
      { label: 'Onboarding',      icon: '🚀', path: '/recruitment/onboarding' },
    ]},
    { section: 'Finance', icon: '💰', dashboard: '/finance-dashboard', items: [
      { label: 'Invoices',        icon: '🧾', path: '/invoices' },
      { label: 'Bills & Expenses',icon: '💸', path: '/bills' },
    ]},
    { section: 'Insights', icon: '📈', dashboard: '/insights-dashboard', items: [
      { label: 'Reports',         icon: '📈', path: '/reports' },
      { label: 'Audit Logs',      icon: '🔍', path: '/audit-logs' },
    ]},
    { section: 'Settings', icon: '⚙️', dashboard: '/settings-dashboard', items: [
      { label: 'Users',           icon: '👤', path: '/admin/users' },
      { label: 'Roles',           icon: '🔐', path: '/admin/roles' },
      { label: 'Settings',        icon: '⚙️', path: '/settings' },
    ]},
  ],
  Employee: [
    { section: 'My Portal', icon: '🏠', dashboard: '/portal', items: [
      { label: 'My Dashboard',    icon: '⊞', path: '/portal' },
      { label: 'My Profile',      icon: '👤', path: '/portal/profile' },
      { label: 'Timesheets',      icon: '⏱', path: '/portal/timesheets' },
      { label: 'Leave',           icon: '🏖', path: '/portal/leaves' },
      { label: 'Payslips',        icon: '💰', path: '/portal/payslips' },
      { label: 'My Team',         icon: '👥', path: '/portal/team' },
      { label: 'Approval Queue',  icon: '✅', path: '/timesheets/approval' },
    ]},
  ],
};

// Role → nav map (non-admin roles)
const ROLE_NAV = {
  'Recruiter':          ['Talent Acquisition'],
  'Recruiting Manager': ['Talent Acquisition','Clients & Vendors'],
  'Account Manager':    ['Clients & Vendors','Talent Acquisition'],
  'HR Manager':         ['People','Talent Acquisition'],
  'Finance Manager':    ['Finance','People'],
  'Finance':            ['Finance'],
};

// Track collapsed sections
const _collapsedSections = new Set();

function buildSidebar() {
  const role    = (_user && _user.role) || 'Employee';
  const navDef  = NAV['Admin'];
  const allowed = ROLE_NAV[role] || null;
  const sections = navDef.filter(function(s) { return !allowed || allowed.includes(s.section); });
  const isEmployee = _user && _user.employee_id;
  var allSections = role === 'Employee' ? NAV['Employee'] :
    (isEmployee ? [...sections, ...NAV['Employee']] : sections);

  var ini = _user ? fmtIni(_user.full_name || _user.username) : 'SA';
  var uname = _user ? (_user.full_name || _user.username) : '';
  var urole = role;

  var sectionsHtml = allSections.map(function(s) {
    var collapsed = _collapsedSections.has(s.section);
    var itemsHtml = s.items.map(function(item) {
      return '<a class="nav-item" data-path="' + item.path + '" href="#' + item.path + '">' +
        '<span class="nav-icon">' + item.icon + '</span>' +
        '<span class="nav-label">' + item.label + '</span>' +
        '</a>';
    }).join('');
    var secKey = s.section.replace(/[^a-zA-Z]/g,'_');
    return '<div class="nav-section' + (collapsed ? ' nav-section-collapsed' : '') + '" id="sec-' + secKey + '">' +
      '<div class="nav-section-header" onclick="window._navSection(&apos;' + secKey + '&apos;,&apos;' + (s.dashboard||'/dashboard') + '&apos;)">' +
        '<span class="nav-section-icon">' + (s.icon || '') + '</span>' +
        '<span class="nav-section-label">' + s.section + '</span>' +
        '<span class="nav-section-arrow">' + (collapsed ? '▶' : '▾') + '</span>' +
      '</div>' +
      '<div class="nav-section-items">' + itemsHtml + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('sidebar').innerHTML =
    '<div class="sidebar-logo" onclick="navigateTo(&apos;/dashboard&apos;)">' +
      '<div class="logo-mark">Mc</div>' +
      '<div class="logo-text"><strong>HR&amp;TA</strong><div class="logo-sub">McRaaN</div></div>' +
    '</div>' +
    '<div class="sidebar-dashboard-btn" onclick="navigateTo(&apos;/dashboard&apos;)">' +
      '<span class="nav-icon">⊞</span><span class="nav-label">Dashboard</span>' +
    '</div>' +
    '<nav class="sidebar-nav">' + sectionsHtml + '</nav>' +
    '<div class="sidebar-user">' +
      '<div class="user-av ' + getUserAvColor() + '">' + ini + '</div>' +
      '<div class="user-info">' +
        '<div class="user-name">' + uname + '</div>' +
        '<div class="user-role">' + urole + '</div>' +
      '</div>' +
      '<button class="btn-icon" id="logout-btn" title="Sign out">&#9211;</button>' +
    '</div>';

  document.getElementById('logout-btn').onclick = async function() {
    await API.logout(); API.clearAuth(); _user = null; showLogin();
  };

  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
      el.classList.add('active');
    });
  });
}

window._toggleSection = function(key) {
  var allNav = [...NAV['Admin'], ...NAV['Employee']];
  var found = allNav.find(function(s) { return s.section.replace(/[^a-zA-Z]/g,'_') === key; });
  if (!found) return;
  var sec = found.section;
  var isCurrentlyOpen = !_collapsedSections.has(sec);
  allNav.forEach(function(s) { _collapsedSections.add(s.section); });
  if (!isCurrentlyOpen) { _collapsedSections.delete(sec); }
  buildSidebar();
  var cur = Router.getCurrentPath();
  document.querySelectorAll('.nav-item').forEach(function(el) {
    if (el.dataset.path && cur.startsWith(el.dataset.path)) el.classList.add('active');
  });
};

window._navSection = function(key, dashPath) {
  var allNav = [...NAV['Admin'], ...NAV['Employee']];
  var found = allNav.find(function(s) { return s.section.replace(/[^a-zA-Z]/g,'_') === key; });
  if (!found) return;
  var sec = found.section;
  var isOpen = !_collapsedSections.has(sec);
  // Accordion: collapse all sections first
  allNav.forEach(function(s) { _collapsedSections.add(s.section); });
  // If it was closed, open it and navigate to its dashboard
  if (!isOpen) {
    _collapsedSections.delete(sec);
    buildSidebar();
    Router.navigate(dashPath);
  } else {
    // If already open, just collapse it
    buildSidebar();
  }
};

// Returns which section owns the given path
function _sectionForPath(path) {
  var allSections = (NAV['Admin'] || []).concat(NAV['Employee'] || []);
  for (var i = 0; i < allSections.length; i++) {
    var s = allSections[i];
    if (s.items) {
      for (var j = 0; j < s.items.length; j++) {
        if (path === s.items[j].path || path.startsWith(s.items[j].path + '/')) {
          return s.section;
        }
      }
    }
  }
  return null;
}

// Called after every route change to sync sidebar highlight
function updateSidebarActive() {
  var cur = (Router.getCurrentPath ? Router.getCurrentPath() : '') || '/';
  var activeSection = _sectionForPath(cur);
  if (activeSection) {
    // Auto-expand the active section
    _collapsedSections.delete(activeSection);
  }
  buildSidebar();
}


function buildTopbar() {
  document.getElementById('topbar').innerHTML =
    '<div class="topbar-left">' +
      '<button class="hamburger-btn" id="hamburger-btn" onclick="window._toggleSidebar()" aria-label="Toggle menu">'+
        '<span></span><span></span><span></span>'+
      '</button>' +
      '<div id="breadcrumb" class="breadcrumb"></div>' +
    '</div>' +
    '<div class="topbar-right">' +
      '<div class="search-wrap"><input class="topbar-search" id="global-search" placeholder="Search…" type="search"></div>' +
      '<button class="btn-icon notif-btn" id="notif-btn" title="Notifications">&#128276;<span class="notif-badge" id="notif-badge" style="display:none">0</span></button>' +
    '</div>';
  // Overlay for mobile drawer
  if (!document.getElementById('sidebar-overlay')) {
    var ov = document.createElement('div');
    ov.id = 'sidebar-overlay';
    ov.className = 'sidebar-overlay';
    ov.onclick = function() { window._closeSidebar(); };
    document.body.appendChild(ov);
  }
}

// ── Global navigation helper ──────────────────────────────────
window.navigateTo = (path) => Router.navigate(path);

// ── Mobile sidebar toggle ──────────────────────────────────────
window._toggleSidebar = function() {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebar-overlay');
  var isOpen = sb && sb.classList.contains('sidebar-open');
  if (isOpen) { window._closeSidebar(); }
  else {
    if (sb) sb.classList.add('sidebar-open');
    if (ov) ov.classList.add('active');
    document.body.classList.add('sidebar-is-open');
  }
};
window._closeSidebar = function() {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('sidebar-open');
  if (ov) ov.classList.remove('active');
  document.body.classList.remove('sidebar-is-open');
};
// Close sidebar on navigation (mobile)
var _origNavigate = window.navigateTo;
window.navigateTo = function(path) {
  window._closeSidebar();
  _origNavigate(path);
};

function fmtIni(name) {
  return (name || '').split(' ').map(function(w) { return w[0]; }).join('').slice(0,2).toUpperCase();
}
function getUserAvColor() {
  var colors = ['av-green','av-blue','av-purple','av-amber'];
  var name = (_user && (_user.full_name || _user.username)) || '';
  var h = 0; for (var i=0; i<name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

// ── Register all page routes ───────────────────────────────────
async function registerRoutes() {
  // Lazy-load page modules
  const load = (mod, fn) => async (params) => {
    const m = await import('./pages/' + mod + '.js?v=1779227745');
    await m[fn](params);
    if (typeof updateSidebarActive === 'function') { try { updateSidebarActive(); } catch(e){} }
    // Update sidebar active
    const path = Router.getCurrentPath();
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', path.startsWith(el.dataset.path));
    });
  };

  Router.route('/dashboard',                          load('dashboard',       'render'));
  Router.route('/org-dashboard',                      load('sectiondash',     'renderOrgDash'));
  Router.route('/people-dashboard',                   load('sectiondash',     'renderPeopleDash'));
  Router.route('/clients-dashboard',                  load('sectiondash',     'renderClientsDash'));
  Router.route('/finance-dashboard',                  load('sectiondash',     'renderFinanceDash'));
  Router.route('/insights-dashboard',                 load('sectiondash',     'renderInsightsDash'));
  Router.route('/settings-dashboard',                 load('sectiondash',     'renderSettingsDash'));
  Router.route('/organisation/profile',               load('organisation',    'renderProfile'));
  Router.route('/organisation/business-units',        load('orgstructure',    'renderBUs'));
  Router.route('/organisation/business-units/:id',    load('orgstructure',    'renderBUDetail'));
  Router.route('/organisation/departments',           load('orgstructure',    'renderDepts'));
  Router.route('/organisation/departments/:id',       load('orgstructure',    'renderDeptDetail'));
  Router.route('/organisation/cost-centres',          load('orgstructure',    'renderCostCentres'));
  Router.route('/organisation/cost-centres/:id',       load('orgstructure',    'renderCostCentreDetail'));
  Router.route('/organisation/locations',             load('orgstructure',    'renderLocations'));
  Router.route('/organisation/locations/:id',         load('orgstructure',    'renderLocationDetail'));
  Router.route('/employees',                          load('employees',       'renderList'));
  Router.route('/employees/new',                      load('employees',       'renderNew'));
  Router.route('/employees/:id',                      load('employees',       'renderDetail'));
  Router.route('/clients',                            load('clients',         'renderList'));
  Router.route('/clients/new',                        load('clients',         'renderNew'));
  Router.route('/clients/:id',                        load('clients',         'renderDetail'));
  Router.route('/vendors',                            load('vendors',         'renderList'));
  Router.route('/vendors/new',                        load('vendors',         'renderNew'));
  Router.route('/vendors/:id',                        load('vendors',         'renderDetail'));
  Router.route('/projects',                           load('projects',        'renderList'));
  Router.route('/projects/new',                        load('projects',        'renderNew'));
  Router.route('/projects/:id',                       load('projects',        'renderDetail'));
  Router.route('/timesheets',                         load('timesheets',      'renderList'));
  Router.route('/timesheets/new',                      load('timesheets',      'renderNew'));
  Router.route('/timesheets/approval',                load('timesheets',      'renderApproval'));
  Router.route('/timesheets/:id',                     load('timesheets',      'renderDetail'));
  Router.route('/timesheets/:id/edit',                 load('timesheets',      'renderNew'));
  Router.route('/payroll',                            load('payroll',         'renderList'));
  Router.route('/payroll/new',                        load('payroll',         'renderNew'));
  Router.route('/payroll/:id',                        load('payroll',         'renderDetail'));
  Router.route('/payroll/:id',                        load('payroll',         'renderDetail'));
  Router.route('/recruitment',                        load('recruitment',     'renderDashboard'));
  Router.route('/recruitment/jobs',                   load('recruitment',     'renderJobs'));
  Router.route('/recruitment/jobs/new',               load('recruitment',     'renderNewJob'));
  Router.route('/recruitment/jobs/:id',               load('recruitment',     'renderJobDetail'));
  Router.route('/candidates',                         load('recruitment',     'renderCandidates'));
  Router.route('/candidates/new',                     load('recruitment',     'renderNewCandidate'));
  Router.route('/candidates/:id',                     load('recruitment',     'renderCandidateDetail'));
  Router.route('/recruitment/pipeline',               load('recruitment',     'renderPipeline'));
  Router.route('/interviews',                         load('recruitment',     'renderInterviews'));
  Router.route('/recruitment/interviews',             load('recruitment',     'renderInterviews'));
  Router.route('/recruitment/interviews/:id',         load('recruitment',     'renderInterviews'));
  Router.route('/offers',                             load('recruitment',     'renderOffers'));
  Router.route('/recruitment/offers',                 load('recruitment',     'renderOffers'));
  Router.route('/recruitment/offers/:id',             load('recruitment',     'renderOffers'));
  Router.route('/onboarding',                         load('recruitment',     'renderOnboarding'));
  Router.route('/recruitment/onboarding',             load('recruitment',     'renderOnboarding'));
  Router.route('/recruitment/onboarding/:id',         load('recruitment',     'renderOnboardingDetail'));
  Router.route('/invoices',                           load('invoices',        'renderList'));
  Router.route('/invoices/new',                       load('invoices',        'renderNew'));
  Router.route('/invoices/:id',                       load('invoices',        'renderDetail'));
  Router.route('/reports',                            load('reports',         'renderHome'));
  Router.route('/reports/:type',                      load('reports',         'renderReport'));
  Router.route('/bills',                              load('bills',           'renderList'));
  Router.route('/bills/:id',                           load('bills',           'renderDetail'));
  Router.route('/audit-logs',                         load('auditlogs',       'renderHome'));
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
