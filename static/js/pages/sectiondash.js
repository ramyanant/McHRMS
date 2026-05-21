/**
 * Section Dashboards — one per sidebar parent item
 * Each shows key metrics + quick links for that section
 */
import { get } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError, fmt, badge } from '../ui.js';
import { navigate } from '../router.js';

function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function kpi(label, value, icon, color, href) {
  return '<div class="kpi-card kpi-' + color + '"' + (href ? ' onclick="navigateTo(\'' + href + '\')" style="cursor:pointer"' : '') + '>' +
    '<div class="kpi-icon">' + icon + '</div>' +
    '<div class="kpi-body"><div class="kpi-value">' + v(value, '…') + '</div>' +
    '<div class="kpi-label">' + label + '</div></div></div>';
}
function quickLink(icon, label, path) {
  return '<div class="quick-link-card" onclick="navigateTo(\'' + path + '\')">' +
    '<div class="quick-link-icon">' + icon + '</div>' +
    '<div class="quick-link-label">' + label + '</div>' +
    '<div class="quick-link-arrow">→</div>' +
  '</div>';
}
function section(title, content) {
  return '<div class="card" style="margin-bottom:16px">' +
    '<div class="card-header"><h3 class="card-title">' + title + '</h3></div>' +
    '<div class="card-body">' + content + '</div></div>';
}

// ── Organisation Dashboard ───────────────────────────────────
export async function renderOrgDash() {
  setPageTitle('Organisation', 'Overview & structure');
  setBreadcrumb([{ label: 'Organisation' }]);
  showLoader();
  try {
    var org  = await get('/organisation').catch(function() { return {}; });
    var bus  = await get('/business-units').catch(function() { return []; });
    var depts= await get('/departments').catch(function() { return []; });
    var locs = await get('/locations').catch(function() { return []; });
    var emps = await get('/employees').catch(function() { return { items:[] }; });

    var buCount  = Array.isArray(bus) ? bus.filter(function(b){return b.is_active;}).length : 0;
    var deptCount= Array.isArray(depts) ? depts.filter(function(d){return d.is_active;}).length : 0;
    var locCount = Array.isArray(locs) ? locs.filter(function(l){return l.is_active;}).length : 0;
    var empCount = (emps.items || []).filter(function(e){return e.status !== 'Inactive';}).length;

    setContent(
      '<div class="page-body">' +
      '<div class="dash-hero">' +
        '<div class="dash-hero-logo">' +
          (org.has_logo ? '<img src="/api/v2/organisation/logo" style="height:60px;border-radius:8px">' :
           '<div style="font-size:48px">🏛</div>') +
        '</div>' +
        '<div class="dash-hero-info">' +
          '<div class="dash-hero-name">' + v(org.name || org.brand_name || 'Organisation') + '</div>' +
          '<div class="dash-hero-sub">' + v(org.type_of_entity || '') + (org.city ? ' · ' + v(org.city) : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="kpi-grid kpi-4" style="margin:16px 0">' +
        kpi('Business Units',   buCount,   '🏢', 'blue',   '/organisation/business-units') +
        kpi('Departments',      deptCount, '🗂', 'purple', '/organisation/departments') +
        kpi('Locations',        locCount,  '📍', 'amber',  '/organisation/locations') +
        kpi('Total Employees',  empCount,  '👥', 'green',  '/employees') +
      '</div>' +
      '<div class="quick-links-grid">' +
        quickLink('🏛', 'Org Profile',    '/organisation/profile') +
        quickLink('🏢', 'Business Units', '/organisation/business-units') +
        quickLink('🗂', 'Departments',    '/organisation/departments') +
        quickLink('💹', 'Cost Centres',   '/organisation/cost-centres') +
        quickLink('📍', 'Locations',      '/organisation/locations') +
      '</div>' +
      '</div>'
    );
  } catch(e) { showError(e.message); }
}

// ── People Dashboard ─────────────────────────────────────────
export async function renderPeopleDash() {
  setPageTitle('People', 'Workforce overview');
  setBreadcrumb([{ label: 'People' }]);
  showLoader();
  try {
    var emps = await get('/employees').catch(function() { return { items:[] }; });
    var rows = emps.items || [];
    var active   = rows.filter(function(e){ return e.status !== 'Inactive' && e.is_active != 0; });
    var byDept   = {};
    active.forEach(function(e) {
      var d = e.department_name || 'Unassigned';
      byDept[d] = (byDept[d] || 0) + 1;
    });
    var topDepts = Object.entries(byDept).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);
    var newJoins = rows.filter(function(e) {
      if (!e.start_date) return false;
      var d = new Date(e.start_date);
      var now = new Date();
      return (now - d) / (1000*60*60*24*30) <= 3;
    }).slice(0,5);

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Total Employees', active.length,  '👥', 'green',  '/employees') +
        kpi('New (90 days)',   newJoins.length, '🆕', 'blue',   '/employees') +
        kpi('Departments',     Object.keys(byDept).length, '🗂', 'purple', '/organisation/departments') +
        kpi('Approval Queue',  '–',             '✅', 'amber',  '/timesheets/approval') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
        section('Department Headcount',
          topDepts.map(function(d) {
            var pct = Math.round(d[1] / active.length * 100);
            return '<div style="margin-bottom:8px">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:3px">' +
                '<span>' + v(d[0]) + '</span><span class="fw-bold">' + d[1] + '</span>' +
              '</div>' +
              '<div style="height:6px;background:var(--border);border-radius:3px">' +
                '<div style="height:100%;width:' + pct + '%;background:var(--brand);border-radius:3px"></div>' +
              '</div></div>';
          }).join('') || '<div class="empty-mini">No data</div>'
        ) +
        section('Recent Joiners',
          newJoins.length
            ? '<div style="display:flex;flex-direction:column;gap:8px">' +
              newJoins.map(function(e) {
                return '<div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="navigateTo(\'/employees/'+e.id+'\')">' +
                  fmt.avatar((e.first_name||'') + ' ' + (e.last_name||''), e.photo_url, 'av-sm') +
                  '<div><div class="fw-bold">' + v(e.first_name) + ' ' + v(e.last_name) + '</div>' +
                  '<div class="text-muted" style="font-size:11px">' + v(e.job_title||'—') + '</div></div>' +
                  '</div>';
              }).join('') + '</div>'
            : '<div class="empty-mini">No recent joiners</div>'
        ) +
      '</div>' +
      '<div class="quick-links-grid">' +
        quickLink('👥', 'All Employees',   '/employees') +
        quickLink('➕', 'Add Employee',    '/employees/new') +
        quickLink('⏱', 'Timesheets',      '/timesheets') +
        quickLink('✅', 'Approval Queue',  '/timesheets/approval') +
        quickLink('💰', 'Payroll',         '/payroll') +
      '</div>' +
      '</div>'
    );
  } catch(e) { showError(e.message); }
}

// ── Clients & Vendors Dashboard ──────────────────────────────
export async function renderClientsDash() {
  setPageTitle('Clients & Vendors', 'Overview');
  setBreadcrumb([{ label: 'Clients & Vendors' }]);
  showLoader();
  try {
    var cliRes  = await get('/clients').catch(function() { return { items:[] }; });
    var vendRes = await get('/vendors').catch(function() { return { items:[] }; });
    var projRes = await get('/projects').catch(function() { return { items:[] }; });
    var clients  = cliRes.items  || [];
    var vendors  = vendRes.items || [];
    var projects = projRes.items || [];

    var activeClients  = clients.filter(function(c)  { return c.status === 'Active'; }).length;
    var activeVendors  = vendors.filter(function(v2) { return v2.status === 'Active'; }).length;
    var activeProjects = projects.filter(function(p) { return p.status === 'Active'; }).length;

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Active Clients',  activeClients,  '🤝', 'blue',   '/clients') +
        kpi('Total Vendors',   activeVendors,  '🏪', 'purple', '/vendors') +
        kpi('Active Projects', activeProjects, '📋', 'green',  '/projects') +
        kpi('Total Revenue',   '–',            '💰', 'amber',  '/invoices') +
      '</div>' +
      section('Recent Clients',
        clients.slice(0,5).map(function(c) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigateTo(\'/clients/'+c.id+'\')">' +
            '<div style="display:flex;align-items:center;gap:10px">' +
              '<div class="av av-sm av-blue">' + fmt.ini(c.name) + '</div>' +
              '<div><div class="fw-bold">' + v(c.name) + '</div><div class="text-muted" style="font-size:11px">' + v(c.industry||'—') + '</div></div>' +
            '</div>' + badge(c.status||'Active') + '</div>';
        }).join('') || '<div class="empty-mini">No clients yet</div>'
      ) +
      '<div class="quick-links-grid" style="margin-top:16px">' +
        quickLink('🤝', 'Clients',       '/clients') +
        quickLink('➕', 'New Client',    '/clients/new') +
        quickLink('🏪', 'Vendors',       '/vendors') +
        quickLink('📋', 'Projects',      '/projects') +
        quickLink('🧾', 'Invoices',      '/invoices') +
      '</div>' +
      '</div>'
    );
  } catch(e) { showError(e.message); }
}

// ── Finance Dashboard ────────────────────────────────────────
export async function renderFinanceDash() {
  setPageTitle('Finance', 'Revenue & expenses');
  setBreadcrumb([{ label: 'Finance' }]);
  showLoader();
  try {
    var invRes  = await get('/invoices').catch(function() { return { items:[] }; });
    var billRes = await get('/bills').catch(function() { return { items:[] }; });
    var invoices = invRes.items  || [];
    var bills    = billRes.items || [];

    var totalBilled   = invoices.reduce(function(s,i){ return s + parseFloat(i.total_amount||0); }, 0);
    var totalCollected= invoices.filter(function(i){ return i.status_name==='Paid'||i.status==='Paid'; })
                                .reduce(function(s,i){ return s + parseFloat(i.total_amount||0); }, 0);
    var totalExpenses = bills.reduce(function(s,b){ return s + parseFloat(b.total_amount||0); }, 0);
    var overdue       = invoices.filter(function(i){ return i.status_name==='Overdue'||i.status==='Overdue'; }).length;

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Total Billed',    fmt.money(totalBilled),     '🧾', 'blue',   '/invoices') +
        kpi('Collected',       fmt.money(totalCollected),  '✅', 'green',  '/invoices') +
        kpi('Total Expenses',  fmt.money(totalExpenses),   '💸', 'purple', '/bills') +
        kpi('Overdue Invoices',overdue,                    '⚠️', 'amber',  '/invoices') +
      '</div>' +
      section('Recent Invoices',
        invoices.slice(0,5).map(function(inv) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigateTo(\'/invoices/'+inv.id+'\')">' +
            '<div><div class="fw-bold mono">' + v(inv.invoice_number) + '</div>' +
            '<div class="text-muted" style="font-size:11px">' + v(inv.client_name||'—') + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:12px">' +
              '<span class="mono fw-bold">' + fmt.money(inv.total_amount) + '</span>' +
              badge(inv.status_name||inv.status||'Draft') +
            '</div></div>';
        }).join('') || '<div class="empty-mini">No invoices yet</div>'
      ) +
      '<div class="quick-links-grid" style="margin-top:16px">' +
        quickLink('🧾', 'Invoices',          '/invoices') +
        quickLink('➕', 'New Invoice',       '/invoices/new') +
        quickLink('💸', 'Bills & Expenses',  '/bills') +
      '</div>' +
      '</div>'
    );
  } catch(e) { showError(e.message); }
}

// ── Insights Dashboard ───────────────────────────────────────
export async function renderInsightsDash() {
  setPageTitle('Insights', 'Reports & analytics');
  setBreadcrumb([{ label: 'Insights' }]);
  setContent(
    '<div class="page-body">' +
    '<div class="quick-links-grid">' +
      quickLink('👥', 'Workforce Report',    '/reports/workforce') +
      quickLink('📋', 'Recruitment Report',  '/reports/recruitment') +
      quickLink('⏱', 'Timesheet Report',    '/reports/timesheets') +
      quickLink('🧾', 'Invoice Report',      '/reports/invoices') +
      quickLink('🌴', 'Leave Report',        '/reports/leaves') +
      quickLink('🔍', 'Audit Logs',          '/audit-logs') +
    '</div>' +
    '</div>'
  );
}

// ── Settings Dashboard ───────────────────────────────────────
export async function renderSettingsDash() {
  setPageTitle('Settings', 'System administration');
  setBreadcrumb([{ label: 'Settings' }]);
  setContent(
    '<div class="page-body">' +
    '<div class="quick-links-grid">' +
      quickLink('👤', 'Users & Access',       '/admin/users') +
      quickLink('🔐', 'Roles & Permissions',  '/admin/roles') +
      quickLink('🏛', 'Organisation Profile', '/organisation/profile') +
      quickLink('🏢', 'Business Units',       '/organisation/business-units') +
      quickLink('🗂', 'Departments',          '/organisation/departments') +
    '</div>' +
    '<div class="card" style="margin-top:24px;border:2px solid var(--danger-light,#fecaca)">' +
      '<div class="card-header" style="background:var(--danger-light,#fff5f5)">' +
        '<h3 class="card-title" style="color:var(--danger,#dc2626)">⚠️ Danger Zone</h3>' +
      '</div>' +
      '<div class="card-body">' +
        '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<div style="display:flex;align-items:center;justify-content:space-between">' +
            '<div>' +
              '<div class="fw-bold">1. Reset Transactional Data</div>' +
              '<div class="text-muted" style="font-size:12px">Deletes employees, clients, vendors, projects, candidates, invoices, bills, payroll, timesheets and all documents.<br>Keeps: Org Profile, Business Units, Departments, Cost Centres, Locations, Admin user.</div>' +
            '</div>' +
            '<button class="btn btn-danger" onclick="window._resetData()" style="white-space:nowrap;margin-left:16px;min-width:160px">🗑 Reset Transactions</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:8px 0;margin-top:8px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between">' +
            '<div>' +
              '<div class="fw-bold" style="color:var(--danger)">2. Full Factory Reset</div>' +
              '<div class="text-muted" style="font-size:12px">Deletes EVERYTHING including Org Profile, Business Units, Departments, Cost Centres, Locations.<br>Only master lookup tables and Admin user are kept. Use this for a completely clean slate.</div>' +
            '</div>' +
            '<button class="btn btn-danger" onclick="window._fullReset()" style="white-space:nowrap;margin-left:16px;min-width:160px;background:var(--danger)">💥 Full Factory Reset</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>'
  );

  window._resetData = async function() {
    if (!confirm('⚠️ WARNING: This will delete ALL employees, candidates, clients, vendors, projects, invoices, timesheets and payroll data.\n\nThis action CANNOT be undone.\n\nAre you absolutely sure?')) return;
    var confirm2 = prompt('Type RESET to confirm:');
    if (confirm2 !== 'RESET') { alert('Reset cancelled.'); return; }
    try {
      var token = localStorage.getItem('mch_token') || '';
      var res = await fetch('/api/v2/admin/flush-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ confirm: 'FLUSH-ALL-DATA' })
      });
      var json = await res.json();
      if (!json.success) throw new Error(json.message || 'Reset failed');
      alert('✅ All data has been reset. The system is ready for a fresh start.');
      window.location.reload();
    } catch(e) { alert('Error: ' + e.message); }
  }

  window._fullReset = async function() {
    if (!confirm('⚠️ FULL FACTORY RESET\n\nThis will delete EVERYTHING:\n• All employees, clients, vendors, projects\n• All org structure (Business Units, Departments, Cost Centres, Locations, Org Profile)\n• All invoices, bills, payroll, timesheets\n• All candidates, jobs, documents\n\nOnly master lookup tables and Admin user will remain.\n\nThis CANNOT be undone. Are you absolutely sure?')) return;
    var confirmed = prompt('Type FULL-RESET to confirm complete factory reset:');
    if (confirmed !== 'FULL-RESET') { alert('Factory reset cancelled.'); return; }
    try {
      var token = localStorage.getItem('mch_token') || '';
      var res = await fetch('/api/v2/admin/full-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ confirm: 'FULL-FACTORY-RESET' })
      });
      var json = await res.json();
      if (!json.success) throw new Error(json.message || 'Reset failed');
      alert('✅ Full factory reset complete. All data cleared.\n\nLogin with: admin / Admin@123');
      window.location.reload();
    } catch(e) { alert('Error: ' + e.message); }
  };;
}
