/**
 * Clients — full enterprise client management
 * List → Detail (with projects, invoices, timesheets, contacts)
 * New / Edit form with full v1 schema fields
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable, renderPagination } from '../ui.js';
import { navigate } from '../router.js';

const INDUSTRIES = ['IT & Technology','Staffing & Recruitment','BFSI','Banking','Insurance',
  'Healthcare','Manufacturing','Retail & FMCG','E-commerce','Logistics','Education',
  'Real Estate','Media','Telecom','Government','Other'];
const CLIENT_TYPES = ['Direct','MSP','VMS','Referral','Channel Partner','Sub-contractor'];

function v(val, fb='') { return val == null ? fb : String(val).replace(/"/g,'&quot;'); }
function fd(id) {
  const d = Object.fromEntries(new FormData(document.getElementById(id)));
  Object.keys(d).forEach(k => { if(d[k]==='') d[k]=null; });
  return d;
}

export async function renderList() {
  setPageTitle('Clients', 'Client accounts & engagements');
  setBreadcrumb([{ label: 'Clients' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([get('/clients'), get('/masters/all')]);
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <div style="display:flex;gap:8px;align-items:center">
            <input class="search-input" id="client-search" placeholder="Search by name, GSTIN, email…" type="search" style="width:280px">
            <select class="fselect" id="status-filter" style="width:120px">
              <option value="">All Status</option>
              ${['Active','Inactive','On Hold','Prospect'].map(s=>`<option>${s}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" onclick="window._addClient()">+ New Client</button>
        </div>

        <!-- Summary KPIs -->
        <div class="kpi-grid kpi-4" style="margin-bottom:16px">
          ${kpi('Total Clients',  rows.length,                         '🤝','blue')}
          ${kpi('Active',         rows.filter(r=>r.status==='Active').length,'✅','green')}
          ${kpi('Total Billed',   fmt.money(rows.reduce((s,r)=>s+(parseFloat(r.total_billed||r.invoice_count||0)),0)),'🧾','purple')}
          ${kpi('Avg Health',     Math.round(rows.reduce((s,r)=>s+(r.health_score||80),0)/(rows.length||1))+'%','💪','amber')}
        </div>

        <div class="card" id="clients-table">
          ${renderClientTable(rows, masters)}
        </div>
      </div>`);

    window._addClient = () => clientModal(null, masters);
    // Search
    const si = document.getElementById('client-search');
    let st;
    si.oninput = async () => {
      clearTimeout(st);
      st = setTimeout(async () => {
        const res = await get(`/clients?q=${encodeURIComponent(si.value)}`);
        document.getElementById('clients-table').innerHTML = renderClientTable(res.items||[], masters);
      }, 350);
    };
  } catch(e) { showError(e.message); }
}

function renderClientTable(rows, masters) {
  if (!rows.length) return '<div class="empty-state"><div class="empty-icon">🤝</div><div class="empty-title">No clients found</div></div>';
  return `<div class="tbl-wrap"><table class="data-table">
    <thead><tr>
      <th>Client</th><th>Industry</th><th>Primary Contact</th>
      <th>Account Manager</th><th>Health</th><th>Status</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows.map(c=>`<tr>
      <td>
        <div class="cell-person">
          <div class="av av-sm av-blue">${fmt.ini(c.name)}</div>
          <div>
            <div class="cell-name">${c.name}</div>
            ${c.gstin ? `<div class="cell-sub mono">${c.gstin}</div>` : `<div class="cell-sub">${c.city||''}</div>`}
          </div>
        </div>
      </td>
      <td class="text-muted">${c.industry||'—'}</td>
      <td>
        ${c.primary_contact ? `<div>${c.primary_contact}</div>` : ''}
        ${c.contact_email ? `<div class="cell-sub">${c.contact_email}</div>` : '—'}
      </td>
      <td>${c.account_manager_name||'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:50px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
            <div style="width:${c.health_score||80}%;height:100%;background:${(c.health_score||80)>=70?'var(--green)':'var(--amber)'};border-radius:3px"></div>
          </div>
          <span style="font-size:11px">${c.health_score||80}%</span>
        </div>
      </td>
      <td>${badge(c.status||'Active')}</td>
      <td class="tbl-actions">
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('/clients/${c.id}')">View</button>
        <button class="btn btn-ghost btn-sm" onclick="window._editClientFromList(${c.id})">✏</button>
      </td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

function kpi(l,v,icon,c) {
  return `<div class="kpi-card kpi-${c}"><div class="kpi-icon">${icon}</div>
    <div class="kpi-body"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div></div>`;
}

export async function renderNew() { navigate('/clients/new'); renderList(); }

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [client, masters] = await Promise.all([get(`/clients/${id}`), get('/masters/all')]);
    setPageTitle(client.name, 'Client Profile');
    setBreadcrumb([{ label: 'Clients', url: '/clients' }, { label: client.name }]);

    setContent(`
      <div class="detail-layout">
        <!-- Sidebar -->
        <div class="detail-sidebar">
          <div class="card">
            <div class="profile-hero" style="background:linear-gradient(135deg,#1d4ed8,#1e40af)">
              <div class="av av-xl av-blue" style="margin:0 auto 10px">${fmt.ini(client.name)}</div>
              <div class="profile-name">${client.name}</div>
              <div class="profile-title" style="color:rgba(255,255,255,.75)">${client.industry||'—'}</div>
              <div style="margin-top:8px">${badge(client.status||'Active')}</div>
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>Type</span><strong>${client.client_type||client.contract_type||'Direct'}</strong></div>
              <div class="meta-row"><span>PAN</span><strong class="mono">${client.pan||'—'}</strong></div>
              <div class="meta-row"><span>GSTIN</span><strong class="mono">${client.gstin||'—'}</strong></div>
              <div class="meta-row"><span>Email</span><strong>${client.contact_email||'—'}</strong></div>
              <div class="meta-row"><span>Phone</span><strong>${client.contact_phone||'—'}</strong></div>
              <div class="meta-row"><span>City</span><strong>${client.city||'—'}</strong></div>
              <div class="meta-row"><span>Health Score</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="width:60px;height:8px;background:var(--bg);border-radius:4px;overflow:hidden">
                    <div style="width:${client.health_score||80}%;height:100%;background:var(--green);border-radius:4px"></div>
                  </div>
                  <strong>${client.health_score||80}%</strong>
                </div>
              </div>
            </div>
            <div style="padding:0 16px 16px">
              <button class="btn btn-primary btn-full" onclick="window._editClient()">✏ Edit Client</button>
              <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="navigateTo('/invoices/new')">+ Create Invoice</button>
            </div>
          </div>
        </div>

        <!-- Main -->
        <div class="detail-main">
          <!-- Tab Bar -->
          <div class="tab-bar" style="margin-bottom:16px">
            ${['overview','contacts','projects','invoices','timesheets'].map((t,i)=>
              `<button class="tab ${i===0?'active':''}" onclick="window._switchTab('${t}',this)">${
                {overview:'📋 Overview',contacts:'👥 Contacts',projects:'🗂 Projects',
                 invoices:'🧾 Invoices',timesheets:'⏱ Timesheets'}[t]}</button>`).join('')}
          </div>

          <div id="client-tab-content">
            ${renderClientOverview(client)}
          </div>
        </div>
      </div>`);

    window._editClient       = () => clientModal(client, masters);
    window._editClientFromList = async (cid) => {
      const c = await get(`/clients/${cid}`); clientModal(c, masters);
    };
    window._switchTab = (tab, el) => {
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      el.classList.add('active');
      const tc = document.getElementById('client-tab-content');
      tc.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
      switch(tab) {
        case 'overview':   tc.innerHTML = renderClientOverview(client); break;
        case 'contacts':   tc.innerHTML = renderContacts(client); break;
        case 'projects':   loadProjects(client, tc); break;
        case 'invoices':   loadInvoices(client, tc); break;
        case 'timesheets': loadClientTS(client, tc); break;
      }
    };
  } catch(e) { showError(e.message); }
}

function renderClientOverview(c) {
  function f(l,v,mono=false) {
    return `<div class="field-item"><div class="field-label">${l}</div>
      <div class="field-value${!v?' empty':''}${mono?' mono':''}">${v||'—'}</div></div>`;
  }
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3 class="card-title">🏢 Company Information</h3></div>
      <div class="card-body"><div class="field-grid">
        ${f('Legal/Trade Name', c.name)}
        ${f('Industry',     c.industry)}
        ${f('Client Type',  c.client_type||c.contract_type||'Direct')}
        ${f('Currency',     c.currency,'INR')}
        ${f('Website',      c.website)}
        ${f('Rating',       c.rating ? '⭐'.repeat(Math.min(c.rating,5)) : null)}
      </div></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3 class="card-title">📍 Address & Contact</h3></div>
      <div class="card-body"><div class="field-grid">
        ${f('Address',      [c.address_line1, c.address_line2].filter(Boolean).join(', '))}
        ${f('City',         c.city)}${f('Pincode', c.pincode, true)}
        ${f('Primary Contact',  c.primary_contact)}
        ${f('Designation',      c.primary_contact_designation)}
        ${f('Email',            c.contact_email)}
        ${f('Phone',            c.contact_phone)}
      </div></div>
    </div>
    <div class="card">
      <div class="card-header"><h3 class="card-title">💼 Commercial</h3></div>
      <div class="card-body"><div class="field-grid">
        ${f('PAN',          c.pan,   true)}
        ${f('GSTIN',        c.gstin, true)}
        ${f('Payment Terms',c.payment_terms)}
        ${f('Account Mgr',  c.account_manager_name)}
        ${f('Referred By',  c.referred_by)}
      </div></div>
    </div>`;
}

function renderContacts(c) {
  const contacts = [
    { label:'Primary', name:c.primary_contact, desig:c.primary_contact_designation, email:c.contact_email, phone:c.contact_phone },
    { label:'Billing', name:c.billing_contact_name, desig:c.billing_contact_designation, email:c.billing_contact_email, phone:c.billing_contact_phone },
    { label:'SPOC 2',  name:c.spoc2_name, desig:c.spoc2_designation, email:c.spoc2_email, phone:c.spoc2_phone },
    { label:'SPOC 3',  name:c.spoc3_name, desig:c.spoc3_designation, email:c.spoc3_email, phone:c.spoc3_phone },
  ].filter(ct => ct.name);
  if (!contacts.length) return '<div class="empty-mini">No contact details added yet</div>';
  return `<div class="multi-grid">${contacts.map(ct=>`
    <div class="multi-card">
      <div class="multi-card-header">
        <span class="badge badge-blue">${ct.label}</span>
      </div>
      <div class="contact-av-row" style="margin-top:8px">
        <div class="av av-sm av-blue">${fmt.ini(ct.name)}</div>
        <div>
          <div class="fw-bold">${ct.name}</div>
          <div class="text-muted" style="font-size:11px">${ct.desig||''}</div>
        </div>
      </div>
      ${ct.email ? `<a href="mailto:${ct.email}" class="contact-link" style="margin-top:6px">✉ ${ct.email}</a>` : ''}
      ${ct.phone ? `<a href="tel:${ct.phone}" class="contact-link">📞 ${ct.phone}</a>` : ''}
    </div>`).join('')}</div>`;
}

async function loadProjects(client, tc) {
  try {
    const data = await get(`/projects?client_id=${client.id}`);
    const rows = data.items || [];
    tc.innerHTML = rows.length ? `<div class="card"><div class="tbl-wrap"><table class="data-table">
      <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th><th>PM</th><th>Start</th><th>Budget</th></tr></thead>
      <tbody>${rows.map(p=>`<tr class="tbl-clickable" onclick="navigateTo('/projects/${p.id}')">
        <td class="mono">${p.project_code||'—'}</td>
        <td><strong>${p.name}</strong></td>
        <td>${p.project_type||'—'}</td>
        <td>${badge(p.status||'Active')}</td>
        <td>${p.pm_name||'—'}</td>
        <td class="mono">${fmt.date(p.start_date)}</td>
        <td class="mono">${fmt.money(p.budget)}</td>
      </tr>`).join('')}</tbody></table></div></div>` :
      `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No projects</div>
       <button class="btn btn-primary" onclick="navigateTo('/projects/new')">+ New Project</button></div>`;
  } catch(e) { tc.innerHTML = `<div class="error-state"><div class="error-title">${e.message}</div></div>`; }
}

async function loadInvoices(client, tc) {
  try {
    const data = await get(`/invoices?client_id=${client.id}`);
    const rows = data.items || [];
    tc.innerHTML = rows.length ? `<div class="card"><div class="tbl-wrap"><table class="data-table">
      <thead><tr><th>Invoice #</th><th>Date</th><th>Period</th><th>Amount</th><th>Tax</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>${rows.map(i=>`<tr class="tbl-clickable" onclick="navigateTo('/invoices/${i.id}')">
        <td class="mono fw-bold">${i.invoice_number}</td>
        <td>${fmt.date(i.created_at)}</td>
        <td class="text-muted">${fmt.date(i.period_start)||''} – ${fmt.date(i.period_end)||''}</td>
        <td class="mono">${fmt.money(i.amount)}</td>
        <td class="mono">${fmt.money(i.tax_amount)}</td>
        <td class="mono fw-bold">${fmt.money(i.total_amount)}</td>
        <td>${badge(i.status_name||'Draft')}</td>
      </tr>`).join('')}</tbody></table></div></div>` :
      '<div class="empty-mini">No invoices yet</div>';
  } catch(e) { tc.innerHTML = `<div class="error-state">${e.message}</div>`; }
}

async function loadClientTS(client, tc) {
  try {
    const data = await get(`/timesheets?client_id=${client.id}&per_page=50`);
    const rows = data.items || [];
    tc.innerHTML = rows.length ? `<div class="card"><div class="tbl-wrap"><table class="data-table">
      <thead><tr><th>Employee</th><th>Week Ending</th><th>Project</th><th>Hours</th><th>Status</th></tr></thead>
      <tbody>${rows.map(t=>`<tr>
        <td><strong>${t.employee_name}</strong></td>
        <td class="mono">${fmt.date(t.week_ending)}</td>
        <td>${t.project||'—'}</td>
        <td class="mono fw-bold">${t.total_hours||0}h</td>
        <td>${badge(t.status||'Pending')}</td>
      </tr>`).join('')}</tbody></table></div></div>` :
      '<div class="empty-mini">No timesheets for this client</div>';
  } catch(e) { tc.innerHTML = `<div class="error-state">${e.message}</div>`; }
}

function clientModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? `✏ Edit: ${existing.name}` : '+ New Client',
    size: 'lg',
    body: `<form id="client-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="fg full"><label class="flabel">Client Name *</label>
          <input class="finput" name="name" value="${v(existing?.name)}" required></div>
        <div class="fg"><label class="flabel">Industry</label>
          <select class="fselect" name="industry">
            <option value="">Select…</option>
            ${INDUSTRIES.map(i=>`<option ${existing?.industry===i?'selected':''}>${i}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Client Type</label>
          <select class="fselect" name="client_type">
            ${CLIENT_TYPES.map(t=>`<option ${(existing?.client_type||'Direct')===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Status</label>
          <select class="fselect" name="status">
            ${['Active','Inactive','On Hold','Prospect'].map(s=>`<option ${(existing?.status||'Active')===s?'selected':''}>${s}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Currency</label>
          <select class="fselect" name="currency">
            ${['INR','USD','EUR','GBP'].map(c=>`<option ${(existing?.currency||'INR')===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Payment Terms</label>
          <select class="fselect" name="payment_terms_id">
            <option value="">Select…</option>
            ${(masters['payment-terms']||[]).map(t=>`<option value="${t.id}" ${existing?.payment_terms_id==t.id?'selected':''}>${t.name}</option>`).join('')}
          </select></div>

        <div style="grid-column:1/-1;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);padding-top:8px;border-top:1px solid var(--border)">Primary Contact</div>
        <div class="fg"><label class="flabel">Name</label>
          <input class="finput" name="primary_contact" value="${v(existing?.primary_contact)}"></div>
        <div class="fg"><label class="flabel">Designation</label>
          <input class="finput" name="primary_contact_designation" value="${v(existing?.primary_contact_designation)}"></div>
        <div class="fg"><label class="flabel">Email</label>
          <input class="finput" type="email" name="contact_email" value="${v(existing?.contact_email)}"></div>
        <div class="fg"><label class="flabel">Phone</label>
          <input class="finput" name="contact_phone" value="${v(existing?.contact_phone)}"></div>

        <div style="grid-column:1/-1;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);padding-top:8px;border-top:1px solid var(--border)">Address & Compliance</div>
        <div class="fg full"><label class="flabel">Address</label>
          <input class="finput" name="address_line1" value="${v(existing?.address_line1)}"></div>
        <div class="fg"><label class="flabel">City</label>
          <input class="finput" name="city" value="${v(existing?.city)}"></div>
        <div class="fg"><label class="flabel">Pincode</label>
          <input class="finput mono" name="pincode" value="${v(existing?.pincode)}"></div>
        <div class="fg"><label class="flabel">PAN</label>
          <input class="finput mono" name="pan" value="${v(existing?.pan)}"></div>
        <div class="fg"><label class="flabel">GSTIN</label>
          <input class="finput mono" name="gstin" value="${v(existing?.gstin)}"></div>
        <div class="fg"><label class="flabel">Account Manager</label>
          <select class="fselect" name="account_manager_id">
            <option value="">None</option>
            ${(masters['employees-lookup']||[]).map(e=>`<option value="${e.id}" ${existing?.account_manager_id==e.id?'selected':''}>${e.name}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Health Score</label>
          <input class="finput" type="number" name="health_score" min="0" max="100" value="${v(existing?.health_score,80)}"></div>
      </div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Create Client',
    onSubmit: async () => {
      const data = fd('client-form');
      if (isEdit) await put(`/clients/${existing.id}`, data);
      else        await post('/clients', data);
      toast(isEdit ? 'Client updated' : 'Client created', 'success');
      if (isEdit) renderDetail({ id: existing.id });
      else        renderList();
    }
  });
}

window._editClientFromList = async (id) => {
  const [c, m] = await Promise.all([get(`/clients/${id}`), get('/masters/all')]);
  clientModal(c, m);
};
