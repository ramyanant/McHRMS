/**
 * Auth state management.
 * Single source of truth for current user, role, permissions.
 */

let _user   = null;
let _masters = null;

export function setUser(user)     { _user = user; localStorage.setItem('mch_user', JSON.stringify(user)); }
export function getUser()         { return _user || JSON.parse(localStorage.getItem('mch_user') || 'null'); }
export function setToken(token)   { localStorage.setItem('mch_token', token); }
export function getToken()        { return localStorage.getItem('mch_token'); }
export function clearAuth()       { _user=null; localStorage.removeItem('mch_token'); localStorage.removeItem('mch_user'); }
export function isLoggedIn()      { return !!getToken(); }
export function getRole()         { return getUser()?.role || ''; }
export function hasRole(...roles) { return roles.includes(getRole()); }
export function isAdmin()         { return getRole() === 'Admin'; }
export function isEmployee()      { return getRole() === 'Employee'; }

export function setMasters(m)  { _masters = m; }
export function getMasters()   { return _masters; }
export function getMaster(key) { return (_masters || {})[key] || []; }

export function canAccess(module) {
  const role = getRole();
  const ACCESS = {
    'Admin':             ['all'],
    'HR Manager':        ['dashboard','employees','organisation','reports','timesheets','leaves'],
    'Recruiting Manager':['dashboard','recruitment','candidates','interviews','offers','onboarding'],
    'Account Manager':   ['dashboard','recruitment','clients','invoices'],
    'Recruiter':         ['dashboard','recruitment','candidates'],
    'Recruiter Manager': ['dashboard','recruitment','candidates','interviews'],
    'Finance Manager':   ['dashboard','invoices','payroll','onboarding'],
    'Finance':           ['dashboard','invoices','payroll'],
    'Employee':          ['portal'],
  };
  const allowed = ACCESS[role] || [];
  return allowed.includes('all') || allowed.includes(module);
}

/** Returns the initial route for this user after login */
export function homeRoute() {
  const role = getRole();
  if (role === 'Employee') return '/portal';
  return '/dashboard';
}
