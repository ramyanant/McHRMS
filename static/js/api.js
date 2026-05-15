/**
 * McHR&TA Centralised API Layer
 * All API calls go through here. Single place for auth headers,
 * error handling, and base URL.
 */

const API_BASE = '/api/v1';

let _authToken = null;
let _authUser  = null;

export function setAuth(token, user) {
  _authToken = token;
  _authUser  = user;
  if (token) localStorage.setItem('mch_token', token);
  else       localStorage.removeItem('mch_token');
}

export function getUser()  { return _authUser; }
export function getToken() { return _authToken || localStorage.getItem('mch_token'); }
export function isLoggedIn() { return !!getToken(); }

export function clearAuth() {
  _authToken = null;
  _authUser  = null;
  localStorage.removeItem('mch_token');
}

/**
 * Core fetch wrapper
 * Returns parsed data on success, throws Error on failure.
 */
export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Auth-Token': token } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 401 → force logout
  if (res.status === 401) {
    clearAuth();
    window.router?.navigate('/login');
    throw new Error('Session expired. Please log in again.');
  }

  const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));

  if (!json.success) {
    const error = new Error(json.message || 'Request failed');
    error.status = res.status;
    error.errors = json.errors;
    throw error;
  }

  return json.data;
}

export const get    = (path)           => api(path);
export const post   = (path, body)     => api(path, { method: 'POST',   body: JSON.stringify(body) });
export const put    = (path, body)     => api(path, { method: 'PUT',    body: JSON.stringify(body) });
export const patch  = (path, body)     => api(path, { method: 'PATCH',  body: JSON.stringify(body) });
export const del    = (path)           => api(path, { method: 'DELETE' });

// Auth-specific
export const login  = (u, p)          => post('/auth/login', { username: u, password: p });
export const logout = ()               => post('/auth/logout', {}).catch(() => {});
export const me     = ()               => get('/auth/me');

// Masters (cached)
let _mastersCache = null;
export async function masters() {
  if (_mastersCache) return _mastersCache;
  _mastersCache = await get('/masters/all');
  return _mastersCache;
}
export function clearMastersCache() { _mastersCache = null; }
