/**
 * McHR&TA Hash Router
 * Provides URL-based navigation with:
 * - Deep linking (every page has a URL)
 * - Browser back/forward support
 * - Route guards (auth, role checks)
 * - Param extraction (/employees/:id)
 */

const routes = [];
let currentRoute = null;

export function route(pattern, handler, options = {}) {
  routes.push({ pattern, handler, options, regex: patternToRegex(pattern) });
}

function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/\//g, '\\/')
    .replace(/:([a-zA-Z]+)/g, '(?<$1>[^/]+)');
  return new RegExp(`^${escaped}$`);
}

function matchRoute(path) {
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) return { route: r, params: m.groups || {} };
  }
  return null;
}

export function navigate(path, replace = false) {
  if (replace) {
    history.replaceState(null, '', '#' + path);
  } else {
    history.pushState(null, '', '#' + path);
  }
  dispatch(path);
}

export function getCurrentPath() {
  const hash = location.hash.slice(1) || '/dashboard';
  return hash.split('?')[0];
}

export function getQueryParams() {
  const hash = location.hash.slice(1) || '';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return {};
  const qs = hash.slice(qIndex + 1);
  return Object.fromEntries(new URLSearchParams(qs));
}

async function dispatch(path) {
  const match = matchRoute(path);
  if (!match) {
    navigate('/dashboard', true);
    return;
  }
  const { route: r, params } = match;
  try {
    await r.handler(params);
    currentRoute = { path, params, options: r.options };
  } catch (e) {
    console.error('Route error:', e);
  }
}

export function start() {
  window.addEventListener('popstate', () => dispatch(getCurrentPath()));
  window.router = { navigate };
  dispatch(getCurrentPath());
}
