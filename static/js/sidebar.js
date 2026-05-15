/**
 * Sidebar navigation — role-aware, highlights active route.
 */
import { getUser, getRole, canAccess, isAdmin } from './auth.js';
import { navigate } from './router.js';

const NAV = [
  { section: 'OVERVIEW' },
  { id:'dashboard', label:'Dashboard', icon:'📊', path:'/dashboard', module:'dashboard' },

  { section: 'ORGANISATION' },
  { id:'org-profile',   label:'Profile',          icon:'🏢', path:'/organisation/profile',       module:'organisation' },
  { id:'business-units',label:'Business Units',   icon:'🏗', path:'/organisation/business-units', module:'organisation' },
  { id:'departments',   label:'Departments',      icon:'🏛', path:'/organisation/departments',     module:'organisation' },
  { id:'cost-centres',  label:'Cost Centres',     icon:'💰', path:'/organisation/cost-centres',    module:'organisation' },
  { id:'locations',     label:'Locations',        icon:'📍', path:'/organisation/locations',       module:'organisation' },

  { section: 'PEOPLE' },
  { id:'employees', label:'Employees',   icon:'👥', path:'/employees',     module:'employees' },
  { id:'timesheets',label:'Timesheets',  icon:'⏱', path:'/timesheets',    module:'timesheets' },
  { id:'payroll',   label:'Payroll',     icon:'💵', path:'/payroll',       module:'payroll',    roles:['Admin','Finance Manager','Finance'] },
  { id:'leaves',    label:'Leave Mgmt', icon:'🏖', path:'/leaves',        module:'leaves' },

  { section: 'CLIENTS & VENDORS' },
  { id:'clients',  label:'Clients',  icon:'🤝', path:'/clients',  module:'clients' },
  { id:'vendors',  label:'Vendors',  icon:'🏪', path:'/vendors',  module:'vendors' },
  { id:'projects', label:'Projects', icon:'📁', path:'/projects', module:'projects' },

  { section: 'TALENT ACQUISITION' },
  { id:'rec-dashboard', label:'TA Dashboard',   icon:'🎯', path:'/recruitment',             module:'recruitment' },
  { id:'jobs',          label:'Job Requisitions',icon:'📋', path:'/recruitment/jobs',        module:'recruitment' },
  { id:'candidates',    label:'Candidates',     icon:'👤', path:'/recruitment/candidates',   module:'recruitment' },
  { id:'pipeline',      label:'ATS Pipeline',   icon:'🔄', path:'/recruitment/pipeline',     module:'recruitment' },
  { id:'interviews',    label:'Interviews',     icon:'🗓', path:'/recruitment/interviews',   module:'recruitment' },
  { id:'offers',        label:'Offers',         icon:'📄', path:'/recruitment/offers',       module:'recruitment' },
  { id:'onboarding',    label:'Onboarding',     icon:'🚀', path:'/recruitment/onboarding',   module:'recruitment' },

  { section: 'FINANCE' },
  { id:'invoices', label:'Invoices', icon:'🧾', path:'/invoices', module:'invoices' },

  { section: 'ANALYTICS' },
  { id:'reports', label:'Reports', icon:'📈', path:'/reports', module:'reports' },

  { section: 'SETTINGS' },
  { id:'users',      label:'Users & Access', icon:'🔐', path:'/admin/users', module:'admin', roles:['Admin'] },
  { id:'audit-logs', label:'Audit Logs',     icon:'📜', path:'/audit-logs',  module:'admin', roles:['Admin'] },
  { id:'settings',   label:'Settings',       icon:'⚙', path:'/settings',    module:'admin', roles:['Admin'] },
];

const PORTAL_NAV = [
  { section: 'MY PORTAL' },
  { id:'portal-home',      label:'Home',       icon:'🏠', path:'/portal' },
  { id:'portal-profile',   label:'My Profile', icon:'👤', path:'/portal/profile' },
  { id:'portal-timesheets',label:'Timesheets', icon:'⏱', path:'/portal/timesheets' },
  { id:'portal-leaves',    label:'Leave',      icon:'🏖', path:'/portal/leaves' },
  { id:'portal-payslips',  label:'Payslips',   icon:'💰', path:'/portal/payslips' },
  { id:'portal-team',      label:'My Team',    icon:'👥', path:'/portal/team' },
  { id:'portal-approvals', label:'Approvals',  icon:'✅', path:'/portal/approvals', badge:'approval-badge' },
];

export function renderSidebar() {
  const role = getRole();
  const isEmp = role === 'Employee';
  const nav   = isEmp ? PORTAL_NAV : NAV;
  const user  = getUser();

  const items = nav.map(item => {
    if (item.section !== undefined) {
      return `<div class="nav-section">${item.section}</div>`;
    }
    // Role filter
    if (item.roles && !item.roles.includes(role)) return '';
    if (!isEmp && item.module && !canAccess(item.module) && !isAdmin()) return '';

    const badge = item.badge ? `<span class="nav-badge" id="${item.badge}" style="display:none">0</span>` : '';
    return `<a class="nav-item" id="nav-${item.id}" href="#${item.path}">${item.icon ? `<span class="ni-icon">${item.icon}</span>` : ''}<span>${item.label}</span>${badge}</a>`;
  }).join('');

  const initials = (user?.full_name || user?.username || 'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const avColors = ['av-green','av-blue','av-purple','av-amber','av-teal'];
  const avColor  = avColors[(initials.charCodeAt(0)||0) % avColors.length];

  document.getElementById('sidebar-nav').innerHTML = items;
  document.getElementById('sidebar-user-name').textContent = user?.full_name || user?.username || '';
  document.getElementById('sidebar-user-role').textContent = user?.role || '';
  document.getElementById('sidebar-user-av').className = `av av-sm ${avColor}`;
  document.getElementById('sidebar-user-av').textContent = initials;

  // If employee and has reportees, show approval count
  if (isEmp) loadApprovalBadge();
}

async function loadApprovalBadge() {
  try {
    const { API } = await import('./api.js');
    const data = await API.pendingApprovals();
    if (data) {
      const count = (data.timesheets?.length||0) + (data.leaves?.length||0);
      const badge = document.getElementById('approval-badge');
      if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
    }
  } catch {}
}

export function setActiveNav(path) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  // Match by href
  const link = document.querySelector(`.nav-item[href="#${path}"]`);
  if (link) { link.classList.add('active'); return; }
  // Partial match (for sub-pages)
  const all = Array.from(document.querySelectorAll('.nav-item[href]'));
  const match = all.filter(el => {
    const hp = el.getAttribute('href').slice(1);
    return path.startsWith(hp) && hp !== '/';
  }).sort((a,b) => b.getAttribute('href').length - a.getAttribute('href').length)[0];
  if (match) match.classList.add('active');
}
