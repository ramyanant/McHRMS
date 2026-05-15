/**
 * McHR&TA v2 — Application Entry Point
 * Boots the app, sets up routing, handles auth guard.
 */
import { API } from './api.js';
import { isLoggedIn, setUser, setToken, setMasters, clearAuth, homeRoute, getUser, setMasters as _sm } from './auth.js';
import { addRoute, startRouter, navigate, onBeforeEach, setContent, setBreadcrumb } from './router.js';
import { renderSidebar, setActiveNav } from './sidebar.js';
import { toast } from './components/toast.js';

// ── Page imports ──────────────────────────────────────────────
import { renderDashboard }          from './pages/dashboard.js';
import { renderEmployees, renderEmployeeDetail, renderEmployeeNew } from './pages/employees.js';
import { renderClients, renderClientDetail }   from './pages/clients.js';
import { renderVendors }            from './pages/vendors.js';
import { renderTimesheets }         from './pages/timesheets.js';
import { renderRecruitment, renderJobs, renderJobDetail,
         renderCandidates, renderCandidateDetail,
         renderPipeline, renderInterviews,
         renderOffers, renderOnboarding }      from './pages/recruitment.js';
import { renderInvoices, renderInvoiceDetail } from './pages/invoices.js';
import { renderReports }            from './pages/reports.js';
import { renderOrganisation }       from './pages/organisation.js';
import { renderUsers, renderAuditLogs } from './pages/admin.js';
import { renderPortal, renderPortalProfile, renderPortalTimesheets,
         renderPortalLeaves, renderPortalPayslips,
         renderPortalTeam, renderPortalApprovals } from './pages/portal.js';

// ── Bootstrap ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Load masters once if logged in
  if (isLoggedIn()) {
    try {
      const m = await API.masters();
      if (m) setMasters(m);
    } catch {}
  }

  // Auth guard
  onBeforeEach(path => {
    if (path === '/login') return true;
    if (!isLoggedIn()) return '/login';
    return true;
  });

  // ── Routes ─────────────────────────────────────────────────
  addRoute('/login',            () => renderLogin());
  addRoute('/dashboard',        () => page(renderDashboard,         [{label:'Dashboard', path:'/dashboard'}]));

  // Organisation
  addRoute('/organisation/profile',        () => page(renderOrganisation,      [{label:'Organisation',path:'/organisation/profile'},{label:'Profile'}], 'organisation'));
  addRoute('/organisation/business-units', () => page(()=>renderOrganisation('business-units'), [{label:'Organisation'},{label:'Business Units'}],'organisation'));
  addRoute('/organisation/departments',    () => page(()=>renderOrganisation('departments'),    [{label:'Organisation'},{label:'Departments'}],'organisation'));
  addRoute('/organisation/cost-centres',   () => page(()=>renderOrganisation('cost-centres'),  [{label:'Organisation'},{label:'Cost Centres'}],'organisation'));
  addRoute('/organisation/locations',      () => page(()=>renderOrganisation('locations'),      [{label:'Organisation'},{label:'Locations'}],'organisation'));

  // Employees
  addRoute('/employees',          () => page(renderEmployees,     [{label:'Employees'}],'employees'));
  addRoute('/employees/new',      () => page(renderEmployeeNew,   [{label:'Employees',path:'/employees'},{label:'New Employee'}],'employees'));
  addRoute('/employees/:id',      p  => page(()=>renderEmployeeDetail(p.id), [{label:'Employees',path:'/employees'},{label:'Profile'}],'employees'));

  // Clients & Vendors
  addRoute('/clients',      () => page(renderClients,               [{label:'Clients'}],'clients'));
  addRoute('/clients/:id',  p  => page(()=>renderClientDetail(p.id),[{label:'Clients',path:'/clients'},{label:'Detail'}],'clients'));
  addRoute('/vendors',      () => page(renderVendors,               [{label:'Vendors'}],'vendors'));

  // Timesheets & Leaves
  addRoute('/timesheets',      () => page(renderTimesheets,          [{label:'Timesheets'}],'timesheets'));
  addRoute('/leaves',          () => page(()=>renderTimesheets('leaves'),[{label:'Leave Management'}],'timesheets'));

  // Recruitment
  addRoute('/recruitment',                  () => page(renderRecruitment,            [{label:'Talent Acquisition'}],'recruitment'));
  addRoute('/recruitment/jobs',             () => page(renderJobs,                   [{label:'TA',path:'/recruitment'},{label:'Job Requisitions'}],'recruitment'));
  addRoute('/recruitment/jobs/:id',         p  => page(()=>renderJobDetail(p.id),    [{label:'Jobs',path:'/recruitment/jobs'},{label:'Detail'}],'recruitment'));
  addRoute('/recruitment/candidates',       () => page(renderCandidates,             [{label:'TA',path:'/recruitment'},{label:'Candidates'}],'recruitment'));
  addRoute('/recruitment/candidates/:id',   p  => page(()=>renderCandidateDetail(p.id),[{label:'Candidates',path:'/recruitment/candidates'},{label:'Profile'}],'recruitment'));
  addRoute('/recruitment/pipeline',         () => page(renderPipeline,               [{label:'TA',path:'/recruitment'},{label:'ATS Pipeline'}],'recruitment'));
  addRoute('/recruitment/interviews',       () => page(renderInterviews,             [{label:'TA',path:'/recruitment'},{label:'Interviews'}],'recruitment'));
  addRoute('/recruitment/offers',           () => page(renderOffers,                 [{label:'TA',path:'/recruitment'},{label:'Offers'}],'recruitment'));
  addRoute('/recruitment/onboarding',       () => page(renderOnboarding,             [{label:'TA',path:'/recruitment'},{label:'Onboarding'}],'recruitment'));

  // Invoices
  addRoute('/invoices',     () => page(renderInvoices,              [{label:'Invoices'}],'invoices'));
  addRoute('/invoices/:id', p  => page(()=>renderInvoiceDetail(p.id),[{label:'Invoices',path:'/invoices'},{label:'Detail'}],'invoices'));

  // Reports & Admin
  addRoute('/reports',     () => page(renderReports,    [{label:'Reports'}],'reports'));
  addRoute('/admin/users', () => page(renderUsers,      [{label:'Settings'},{label:'Users & Access'}],'admin'));
  addRoute('/audit-logs',  () => page(renderAuditLogs,  [{label:'Audit Logs'}],'admin'));
  addRoute('/settings',    () => page(()=>renderUsers('settings'),[{label:'Settings'}],'admin'));

  // Portal
  addRoute('/portal',            () => page(renderPortal,            [{label:'My Portal'}],'portal'));
  addRoute('/portal/profile',    () => page(renderPortalProfile,     [{label:'My Portal',path:'/portal'},{label:'My Profile'}],'portal'));
  addRoute('/portal/timesheets', () => page(renderPortalTimesheets,  [{label:'My Portal',path:'/portal'},{label:'Timesheets'}],'portal'));
  addRoute('/portal/leaves',     () => page(renderPortalLeaves,      [{label:'My Portal',path:'/portal'},{label:'Leave'}],'portal'));
  addRoute('/portal/payslips',   () => page(renderPortalPayslips,    [{label:'My Portal',path:'/portal'},{label:'Payslips'}],'portal'));
  addRoute('/portal/team',       () => page(renderPortalTeam,        [{label:'My Portal',path:'/portal'},{label:'My Team'}],'portal'));
  addRoute('/portal/approvals',  () => page(renderPortalApprovals,   [{label:'My Portal',path:'/portal'},{label:'Approvals'}],'portal'));

  // Default
  addRoute('/',  () => navigate(isLoggedIn() ? homeRoute() : '/login'));

  startRouter();
});

// ── Page wrapper ──────────────────────────────────────────────
async function page(renderFn, crumbs=[], activeNav='') {
  showLayout();
  setActiveNav(window.location.hash.slice(1));
  setBreadcrumb(crumbs);
  setContent('<div class="page-loader"><div class="spinner"></div></div>');
  try {
    await renderFn();
  } catch (e) {
    console.error(e);
    setContent(`<div class="empty-state"><div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Error loading page</div>
      <div class="empty-state-sub">${e.message}</div></div>`);
  }
}

// ── Login page ────────────────────────────────────────────────
function renderLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-layout').style.display  = 'none';

  const ls = document.getElementById('login-screen');
  ls.innerHTML = `
    <div class="login-box">
      <div class="login-logo">
        <img src="/static/logo.png" onerror="this.style.display='none'" alt="">
        <h1>McHR&TA</h1>
        <p>Human Resources & Talent Acquisition</p>
      </div>
      <div class="login-fields">
        <div class="field">
          <label class="label">Username or Email</label>
          <input class="input" id="l-user" type="text" placeholder="admin" autocomplete="username">
        </div>
        <div class="field">
          <label class="label">Password</label>
          <input class="input" id="l-pass" type="password" placeholder="••••••••" autocomplete="current-password"
            onkeydown="if(event.key==='Enter')window.doLogin()">
        </div>
      </div>
      <div id="login-error" style="display:none" class="login-error"></div>
      <button class="btn btn-primary btn-lg" style="width:100%" onclick="window.doLogin()">Sign In →</button>
      <p style="text-align:center;margin-top:16px;color:var(--txt3);font-size:11px">Default: admin / Admin@123</p>
    </div>`;

  window.doLogin = async () => {
    const btn = ls.querySelector('.btn-primary');
    const errEl = document.getElementById('login-error');
    const user = document.getElementById('l-user')?.value?.trim();
    const pass = document.getElementById('l-pass')?.value;
    if (!user || !pass) { showErr('Enter username and password'); return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await API.login({ username: user, password: pass });
      if (res?.token) {
        setToken(res.token);
        setUser(res.user);
        const m = await API.masters().catch(()=>null);
        if (m) setMasters(m);
        renderSidebar();
        navigate(homeRoute());
      }
    } catch(e) { showErr(e.message); }
    finally { btn.disabled=false; btn.textContent='Sign In →'; }
  };

  function showErr(msg) {
    const el = document.getElementById('login-error');
    if (el) { el.textContent=msg; el.style.display='block'; }
  }
}

function showLayout() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-layout').style.display  = 'flex';
  const user = getUser();
  if (user && !document.getElementById('sidebar-user-name').textContent) {
    renderSidebar();
  }
}

// ── Logout ────────────────────────────────────────────────────
window.logout = async () => {
  try { await API.logout(); } catch {}
  clearAuth();
  navigate('/login');
};

// ── Global toast ──────────────────────────────────────────────
window.toast = toast;

// Make navigate global for inline onclick handlers
window.go = navigate;
