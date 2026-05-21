// deploy-1779270191
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
    // If Employee lands on /dashboard, redirect to /portal
    var curHash = location.hash.slice(1) || '/dashboard';
    if (_user && _user.role === 'Employee' && (curHash === '/dashboard' || curHash === '/login' || curHash === '')) {
      location.hash = '/portal';
    }
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
        '<img src="/static/img/logo.png?v=20260521g" alt="McHR&amp;TA" ' +
          'style="max-width:280px;width:100%;height:auto;display:block;margin:0 auto" ' +
          'onerror="this.style.display=\'none\';document.getElementById(\'login-logo-fallback\').style.display=\'block\'">' +
        '<div id="login-logo-fallback" style="display:none">' +
          '<div class="login-logo-text">McHR<span>&amp;</span>TA</div>' +
          '<div class="login-tagline">Human Resources &amp; Talent Acquisition</div>' +
        '</div>' +
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
        '<div style="text-align:center;margin-top:12px">' +
          '<a href="#" id="forgot-link" style="font-size:13px;color:var(--primary);text-decoration:none">Forgot Password?</a>' +
        '</div>' +
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
      // Route Employee role to portal, all others to dashboard
      var defaultPath = (_user && _user.role === 'Employee') ? '/portal' : '/dashboard';
      location.hash = defaultPath;
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

  // ── Forgot Password flow ────────────────────────────────────────
  const forgotLink = document.getElementById('forgot-link');
  if (forgotLink) forgotLink.onclick = (e) => {
    e.preventDefault();
    showForgotPassword();
  };
}


// ── Forgot Password ────────────────────────────────────────────
function showForgotPassword() {
  const login = document.getElementById('login-screen');
  login.style.display = 'flex';
  login.innerHTML =
    '<div class="login-card">' +
      '<div class="login-logo">' +
        '<div class="login-logo-text">McHR<span>&amp;</span>TA</div>' +
        '<div class="login-tagline">Password Reset</div>' +
      '</div>' +
      '<div class="login-form" id="forgot-step-1">' +
        '<p style="font-size:14px;color:var(--text-muted);margin-bottom:16px;line-height:1.5">' +
          'Enter your username or email address. A reset code will be generated for you.' +
        '</p>' +
        '<div class="fg">' +
          '<label class="flabel">Username or Email</label>' +
          '<input class="finput" id="fp-identifier" type="text" placeholder="Enter username or email" autocomplete="username">' +
        '</div>' +
        '<div id="forgot-error" class="login-error" style="display:none"></div>' +
        '<button class="btn btn-primary btn-full" id="forgot-btn">Send Reset Code →</button>' +
        '<div style="text-align:center;margin-top:12px">' +
          '<a href="#" id="back-to-login" style="font-size:13px;color:var(--text-muted);text-decoration:none">← Back to Sign In</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Step 1 — request reset code
  document.getElementById('forgot-btn').onclick = async () => {
    const identifier = document.getElementById('fp-identifier').value.trim();
    const errEl = document.getElementById('forgot-error');
    const btn   = document.getElementById('forgot-btn');
    if (!identifier) {
      errEl.textContent = 'Please enter your username or email';
      errEl.style.display = ''; return;
    }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/v2/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      // Show step 2 — enter reset code + new password
      showResetCode(identifier, data.reset_code);
    } catch (e) {
      errEl.textContent = e.message || 'Failed. Try again.';
      errEl.style.display = '';
      btn.disabled = false; btn.textContent = 'Send Reset Code →';
    }
  };

  document.getElementById('fp-identifier').onkeydown = e => {
    if (e.key === 'Enter') document.getElementById('forgot-btn').click();
  };
  document.getElementById('back-to-login').onclick = e => {
    e.preventDefault(); showLogin();
  };
  setTimeout(() => document.getElementById('fp-identifier').focus(), 100);
}

function showResetCode(identifier, resetCode) {
  const login = document.getElementById('login-screen');
  login.innerHTML =
    '<div class="login-card">' +
      '<div class="login-logo">' +
        '<div class="login-logo-text">McHR<span>&amp;</span>TA</div>' +
        '<div class="login-tagline">Set New Password</div>' +
      '</div>' +
      '<div class="login-form">' +
        (resetCode
          ? '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:16px;text-align:center">' +
              '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Your Reset Code</div>' +
              '<div style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace;color:var(--primary)">' + resetCode + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Valid for 15 minutes</div>' +
            '</div>'
          : '') +
        '<div class="fg">' +
          '<label class="flabel">Reset Code</label>' +
          '<input class="finput" id="rp-code" type="text" placeholder="6-digit code" maxlength="6" style="letter-spacing:4px;font-size:20px;text-align:center" autocomplete="off">' +
        '</div>' +
        '<div class="fg">' +
          '<label class="flabel">New Password</label>' +
          '<input class="finput" id="rp-pass" type="password" placeholder="Minimum 8 characters" autocomplete="new-password">' +
        '</div>' +
        '<div class="fg">' +
          '<label class="flabel">Confirm Password</label>' +
          '<input class="finput" id="rp-pass2" type="password" placeholder="Repeat new password" autocomplete="new-password">' +
        '</div>' +
        '<div id="reset-error" class="login-error" style="display:none"></div>' +
        '<button class="btn btn-primary btn-full" id="reset-btn">Reset Password →</button>' +
        '<div style="text-align:center;margin-top:12px">' +
          '<a href="#" id="back-to-login2" style="font-size:13px;color:var(--text-muted);text-decoration:none">← Back to Sign In</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Pre-fill the code if server returned it
  if (resetCode) document.getElementById('rp-code').value = resetCode;

  document.getElementById('reset-btn').onclick = async () => {
    const code  = document.getElementById('rp-code').value.trim();
    const pass  = document.getElementById('rp-pass').value;
    const pass2 = document.getElementById('rp-pass2').value;
    const errEl = document.getElementById('reset-error');
    const btn   = document.getElementById('reset-btn');
    errEl.style.display = 'none';
    if (!code)       { errEl.textContent = 'Enter the reset code'; errEl.style.display=''; return; }
    if (pass.length < 8) { errEl.textContent = 'Password must be at least 8 characters'; errEl.style.display=''; return; }
    if (pass !== pass2)  { errEl.textContent = 'Passwords do not match'; errEl.style.display=''; return; }
    btn.disabled = true; btn.textContent = 'Resetting…';
    try {
      const res = await fetch('/api/v2/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, reset_code: code, new_password: pass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Reset failed');
      // Success — show confirmation then go to login
      login.innerHTML =
        '<div class="login-card">' +
          '<div class="login-logo">' +
            '<div class="login-logo-text">McHR<span>&amp;</span>TA</div>' +
          '</div>' +
          '<div class="login-form" style="text-align:center">' +
            '<div style="font-size:48px;margin-bottom:12px">✅</div>' +
            '<h3 style="color:var(--text);margin-bottom:8px">Password Reset!</h3>' +
            '<p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">Your password has been updated successfully.</p>' +
            '<button class="btn btn-primary btn-full" id="go-login-btn">Sign In →</button>' +
          '</div>' +
        '</div>';
      document.getElementById('go-login-btn').onclick = () => showLogin();
    } catch (e) {
      errEl.textContent = e.message || 'Reset failed. Try again.';
      errEl.style.display = '';
      btn.disabled = false; btn.textContent = 'Reset Password →';
    }
  };

  document.getElementById('back-to-login2').onclick = e => {
    e.preventDefault(); showLogin();
  };
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
  // Bail early when _user isn't set yet — prevents a transient "Employee"
  // fallback render flashing the wrong role/items during navigation races.
  if (!_user) return;
  const role    = _user.role || 'Admin';
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
      '<img src="/static/img/logo.png?v=20260521g" alt="McHR&amp;TA" ' +
        'style="width:100%;max-width:180px;height:auto;background:#fff;border-radius:8px;padding:6px;box-sizing:border-box" ' +
        'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div style="display:none;align-items:center;gap:8px">' +
        '<div class="logo-mark">Mc</div>' +
        '<div class="logo-text"><strong>HR&amp;TA</strong><div class="logo-sub">McRaaN</div></div>' +
      '</div>' +
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

// Section-header click: toggle the clicked section's collapsed state via
// a class flip on the existing DOM. No full innerHTML rebuild (which was
// causing the visible "Employee items" flicker during the brief
// between-renders window) and no navigation. The dashPath argument is
// kept for signature compatibility with the inline onclick but ignored;
// users navigate via the items underneath the section header.
window._navSection = function(key, _dashPath) {
  var allNav = [...NAV['Admin'], ...NAV['Employee']];
  var found = allNav.find(function(s) { return s.section.replace(/[^a-zA-Z]/g,'_') === key; });
  if (!found) return;
  var sec = found.section;
  var willCollapse = !_collapsedSections.has(sec);
  if (willCollapse) {
    _collapsedSections.add(sec);
  } else {
    _collapsedSections.delete(sec);
  }
  // Targeted DOM update — no rebuild, no flicker.
  var secEl = document.getElementById('sec-' + key);
  if (secEl) {
    secEl.classList.toggle('nav-section-collapsed', willCollapse);
    var arrow = secEl.querySelector('.nav-section-arrow');
    if (arrow) arrow.textContent = willCollapse ? '▶' : '▾';
  }
};

// Legacy alias kept for any cached HTML still wired to _toggleSection.
window._toggleSection = window._navSection;

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

// Called after every route change to sync sidebar highlight. Only does
// a full rebuild when the collapsed-state needs to change — otherwise
// just flips classes on the existing DOM to avoid the flicker that a
// full innerHTML replacement caused.
function updateSidebarActive() {
  var cur = (Router.getCurrentPath ? Router.getCurrentPath() : '') || '/';
  var activeSection = _sectionForPath(cur);
  if (activeSection && _collapsedSections.has(activeSection)) {
    _collapsedSections.delete(activeSection);
    // The section we just auto-expanded already exists in the DOM —
    // flip its collapsed class instead of rebuilding the whole sidebar.
    var key = activeSection.replace(/[^a-zA-Z]/g,'_');
    var secEl = document.getElementById('sec-' + key);
    if (secEl) {
      secEl.classList.remove('nav-section-collapsed');
      var arrow = secEl.querySelector('.nav-section-arrow');
      if (arrow) arrow.textContent = '▾';
    } else {
      buildSidebar();
    }
  }
  // Update the active highlight on individual nav items.
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.path && cur.startsWith(el.dataset.path));
  });
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
    const m = await import('./pages/' + mod + '.js?v=20260521g');
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
