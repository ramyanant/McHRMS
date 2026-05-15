/**
 * Organisation Profile — LinkedIn-style enterprise profile page
 * Sections: Company | Addresses | Contacts | Identity | Registrations | Banking | Documents
 * Features: Completion bar, multi-entry sections, inline edit, add/remove rows
 */
import { get, post, put, del } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const ENTITY_TYPES = ['Private Limited','Public Limited','LLP','OPC','Sole Proprietorship','Partnership','Section 8','Trust','Other'];
const INDUSTRIES   = ['IT & Technology','Staffing & Recruitment','BFSI','Healthcare','Manufacturing','Retail','Education','Logistics','Real Estate','Other'];
const CURRENCIES   = ['INR','USD','EUR','GBP','SGD','AED','AUD'];
const TIMEZONES    = ['Asia/Kolkata','Asia/Dubai','America/New_York','Europe/London','Asia/Singapore','Australia/Sydney'];
const FY_STARTS    = [['04-01','April 1 (Indian FY)'],['01-01','January 1'],['07-01','July 1'],['10-01','October 1']];
const ADDR_TYPES   = ['Registered','Operational','Branch','Billing','Warehouse','Other'];
const ID_TYPES     = ['PAN','TAN','CIN','IEC','MSME Udyam','Startup India','DPIIT','GST State HQ','Profession Tax','Professional Tax','Other'];
const REG_TYPES    = ['GST','Professional Tax','Provident Fund (PF)','ESI','Labour Licence','FSSAI','ISO Certification','MSME','Shops & Establishment','Trade Licence','Factory Licence','Drug Licence','Fire NOC','Other'];
const JURISDICTIONS= ['National','State','Municipal'];
const ACC_TYPES    = ['Current','Savings','Cash Credit','Overdraft'];
const DOC_TYPES    = ['Certificate of Incorporation','MOA/AOA','PAN Card','TAN Card','MSME Certificate','GST Certificate','PF Registration','ESI Registration','Labour Licence','ISO Certificate','Bank Statement','Audit Report','ITR','Other'];
const EMP_RANGES   = ['1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+'];

let _orgData = null;
let _states  = [];

// ═══════════════════════════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════════════════════════
export async function renderProfile() {
  setPageTitle('Organisation Profile', 'Company information');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Profile' }]);
  showLoader();
  try {
    const [org, states] = await Promise.all([
      get('/organisation'),
      get('/lookup/states').catch(() => []),
    ]);
    _orgData = org;
    _states  = states || [];
    renderPage(org);
  } catch (e) { showError(e.message); }
}

function renderPage(org) {
  const pct = org.completion || 0;
  const pctColor = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red';

  setContent(`
    <div class="org-profile-layout">

      <!-- ── LEFT: Completion + Navigation ── -->
      <div class="org-sidebar">
        <!-- Completion Card -->
        <div class="card org-complete-card">
          <div class="org-logo-wrap">
            ${org.logo_url
              ? `<img src="${org.logo_url}" class="org-logo-img" alt="Logo">`
              : `<div class="org-logo-placeholder"><span>🏛</span></div>`}
            <button class="btn btn-ghost btn-sm" onclick="window._editLogo()" style="margin-top:8px;width:100%">Change Logo</button>
          </div>
          <div class="org-name">${org.legal_name || '—'}</div>
          <div class="org-brand">${org.brand_name || org.trade_name || ''}</div>
          <div class="org-type-badge">${org.type_of_entity || 'Company'}</div>

          <div class="completion-section">
            <div class="completion-header">
              <span class="completion-label">Profile Completeness</span>
              <span class="completion-pct completion-pct-${pctColor}">${pct}%</span>
            </div>
            <div class="completion-bar-track">
              <div class="completion-bar-fill completion-fill-${pctColor}" style="width:${pct}%"></div>
            </div>
            <div class="completion-hint">${pct < 100 ? completionHint(org) : '✓ Profile complete!'}</div>
          </div>

          <!-- Section nav -->
          <nav class="org-section-nav">
            ${[
              ['company','🏢','Company'],
              ['addresses','📍','Addresses'],
              ['contacts','👥','Contacts'],
              ['identity','🪪','Identity & Statutory'],
              ['registrations','📋','Registrations & Licences'],
              ['banking','🏦','Banking'],
              ['documents','📄','Documents'],
            ].map(([id, icon, label]) => `
              <a class="org-nav-item" href="#org-sec-${id}" onclick="scrollToSec('${id}')">
                <span>${icon}</span><span>${label}</span>
              </a>`).join('')}
          </nav>
        </div>
      </div>

      <!-- ── RIGHT: Sections ── -->
      <div class="org-main" id="org-main-content">

        <!-- ① COMPANY -->
        ${section('company', '🏢', 'Company Information', `
          <div class="field-grid field-grid-3">
            ${f('Legal Name',      org.legal_name)}
            ${f('Brand Name',      org.brand_name || org.trade_name)}
            ${f('Entity Type',     org.type_of_entity || org.legal_structure)}
            ${f('Industry',        org.industry)}
            ${f('Email',           org.email)}
            ${f('Phone',           org.phone)}
            ${f('Website',         org.website, true, 'link')}
            ${f('LinkedIn',        org.linkedin_url, true, 'link')}
            ${f('Timezone',        org.timezone)}
            ${f('Base Currency',   org.base_currency)}
            ${f('Financial Year',  org.financial_year_start ? fyLabel(org.financial_year_start) : null)}
            ${f('Working Hours',   org.hours_of_operation)}
            ${f('Employee Range',  org.employee_count_range)}
            ${f('Incorporation',   fmt.date(org.incorporation_date))}
          </div>
        `, 'window._editCompany()')}

        <!-- ② ADDRESSES -->
        ${section('addresses', '📍', 'Addresses', `
          ${multiSection(
            (org.addresses || []),
            a => `
              <div class="multi-card ${a.is_primary ? 'multi-card-primary' : ''}">
                <div class="multi-card-header">
                  <div><span class="badge badge-blue">${a.address_type}</span>
                    ${a.is_primary ? '<span class="badge badge-green" style="margin-left:4px">Primary</span>' : ''}</div>
                  <div class="multi-card-actions">
                    <button class="btn btn-ghost btn-xs" onclick="window._editAddress(${a.id})">✏</button>
                    <button class="btn btn-danger btn-xs" onclick="window._deleteAddress(${a.id})">✕</button>
                  </div>
                </div>
                <div class="addr-body">
                  <div>${[a.line1, a.line2].filter(Boolean).join(', ')}</div>
                  <div>${[a.city, a.state, a.pincode].filter(Boolean).join(', ')}</div>
                  <div class="addr-meta">${a.country || ''} · ${a.currency || 'INR'} · ${a.timezone || ''}</div>
                  ${a.hours_of_operation ? `<div class="addr-meta">⏱ ${a.hours_of_operation}</div>` : ''}
                </div>
              </div>`,
            'window._addAddress()',
            '+ Add Address'
          )}
        `, null)}

        <!-- ③ POINTS OF CONTACT -->
        ${section('contacts', '👥', 'Points of Contact', `
          ${multiSection(
            (org.contacts || []),
            c => `
              <div class="multi-card ${c.is_primary ? 'multi-card-primary' : ''}">
                <div class="multi-card-header">
                  <div class="contact-av-row">
                    <div class="av av-sm av-green">${fmt.ini(c.name)}</div>
                    <div>
                      <div class="fw-bold">${c.name}
                        ${c.is_primary ? '<span class="badge badge-green" style="margin-left:4px;font-size:9px">Primary</span>' : ''}
                      </div>
                      <div class="text-muted" style="font-size:11px">${c.designation || ''}${c.department ? ' · ' + c.department : ''}</div>
                    </div>
                  </div>
                  <div class="multi-card-actions">
                    <button class="btn btn-ghost btn-xs" onclick="window._editContact(${c.id})">✏</button>
                    <button class="btn btn-danger btn-xs" onclick="window._deleteContact(${c.id})">✕</button>
                  </div>
                </div>
                <div class="contact-links">
                  ${c.email ? `<a href="mailto:${c.email}" class="contact-link">✉ ${c.email}</a>` : ''}
                  ${c.phone ? `<a href="tel:${c.phone}" class="contact-link">📞 ${c.phone}</a>` : ''}
                </div>
              </div>`,
            'window._addContact()',
            '+ Add Contact'
          )}
        `, null)}

        <!-- ④ IDENTITY -->
        ${section('identity', '🪪', 'Identity & Statutory Numbers', `
          ${multiSection(
            (org.identity || []),
            i => `
              <div class="multi-card">
                <div class="multi-card-header">
                  <span class="badge badge-purple">${i.id_type}</span>
                  <div class="multi-card-actions">
                    <button class="btn btn-ghost btn-xs" onclick="window._editIdentity(${i.id})">✏</button>
                    <button class="btn btn-danger btn-xs" onclick="window._deleteIdentity(${i.id})">✕</button>
                  </div>
                </div>
                <div class="identity-number">${i.id_number}</div>
                ${i.issue_date ? `<div class="text-muted" style="font-size:11px">Issued: ${fmt.date(i.issue_date)}</div>` : ''}
                ${i.expiry_date ? `<div class="${isExpiringSoon(i.expiry_date) ? 'text-red' : 'text-muted'}" style="font-size:11px">Expires: ${fmt.date(i.expiry_date)} ${isExpiringSoon(i.expiry_date) ? '⚠' : ''}</div>` : ''}
                ${i.issuing_authority ? `<div class="text-muted" style="font-size:11px">${i.issuing_authority}</div>` : ''}
              </div>`,
            'window._addIdentity()',
            '+ Add Identity'
          )}
          <!-- Also show core PAN/TAN/CIN inline if not in identity table -->
          ${renderCoreLegacyIdentity(org)}
        `, null)}

        <!-- ⑤ REGISTRATIONS & LICENCES -->
        ${section('registrations', '📋', 'Registrations, Licences & Certifications', `
          ${multiSection(
            [...(org.gst || []).map(g => ({...g, reg_type:'GST', reg_number:g.gstin, start_date:g.registration_date, _gst:true})),
             ...(org.registrations || [])],
            r => `
              <div class="multi-card ${r.is_primary ? 'multi-card-primary' : ''} ${isExpiringSoon(r.expiry_date) ? 'multi-card-expiring' : ''}">
                <div class="multi-card-header">
                  <div>
                    <span class="badge badge-amber">${r.reg_type}</span>
                    ${r.state ? `<span class="badge badge-gray" style="margin-left:4px">${r.state}</span>` : ''}
                    ${r.is_primary ? `<span class="badge badge-green" style="margin-left:4px">Primary</span>` : ''}
                  </div>
                  <div class="multi-card-actions">
                    <button class="btn btn-ghost btn-xs" onclick="window._editReg(${r._gst?'gst':''}, ${r.id})">✏</button>
                    <button class="btn btn-danger btn-xs" onclick="window._deleteReg(${r._gst?'gst':''}, ${r.id})">✕</button>
                  </div>
                </div>
                <div class="identity-number">${r.reg_number}</div>
                ${r.trade_name ? `<div class="text-muted" style="font-size:11px">${r.trade_name}</div>` : ''}
                <div style="display:flex;gap:12px;margin-top:6px">
                  ${r.start_date   ? `<div class="text-muted" style="font-size:11px">From: ${fmt.date(r.start_date)}</div>` : ''}
                  ${r.expiry_date  ? `<div class="${isExpiringSoon(r.expiry_date) ? 'text-red fw-bold' : 'text-muted'}" style="font-size:11px">Expires: ${fmt.date(r.expiry_date)} ${isExpiringSoon(r.expiry_date) ? '⚠ Expiring Soon' : ''}</div>` : ''}
                </div>
                ${r.issuing_authority ? `<div class="text-muted" style="font-size:11px">${r.issuing_authority}</div>` : ''}
              </div>`,
            'window._addReg()',
            '+ Add Registration / Licence'
          )}
        `, null)}

        <!-- ⑥ BANKING -->
        ${section('banking', '🏦', 'Bank Accounts', `
          ${multiSection(
            (org.banks || []),
            b => `
              <div class="multi-card ${b.is_primary ? 'multi-card-primary' : ''}">
                <div class="multi-card-header">
                  <div>
                    <div class="fw-bold">${b.bank_name}</div>
                    <div class="text-muted" style="font-size:11px">${b.account_type} · ${b.currency || 'INR'}
                      ${b.purpose ? ' · ' + b.purpose : ''}
                      ${b.is_primary ? ' · <span class="text-green">Primary</span>' : ''}
                    </div>
                  </div>
                  <div class="multi-card-actions">
                    <button class="btn btn-ghost btn-xs" onclick="window._editBank(${b.id})">✏</button>
                    <button class="btn btn-danger btn-xs" onclick="window._deleteBank(${b.id})">✕</button>
                  </div>
                </div>
                <div style="margin-top:8px">
                  <div class="bank-acno">${maskAccount(b.account_number)}</div>
                  <div class="text-muted" style="font-size:11px">${b.account_name} ${b.branch ? '· ' + b.branch : ''}</div>
                  ${b.ifsc_code ? `<div class="text-muted" style="font-size:11px">IFSC: <span class="mono">${b.ifsc_code}</span></div>` : ''}
                </div>
              </div>`,
            'window._addBank()',
            '+ Add Bank Account'
          )}
        `, null)}

        <!-- ⑦ DOCUMENTS -->
        ${section('documents', '📄', 'Documents', `
          <div class="doc-upload-zone" onclick="window._uploadDoc()" id="doc-drop-zone">
            <div class="doc-upload-icon">📎</div>
            <div class="doc-upload-text">Click to upload a document</div>
            <div class="doc-upload-sub">PDF, Word, Excel, JPG, PNG up to 10MB</div>
          </div>
          <div class="doc-grid" id="doc-grid">
            ${(org.documents || []).map(d => `
              <div class="doc-card">
                <div class="doc-icon">${docIcon(d.mime_type)}</div>
                <div class="doc-info">
                  <div class="doc-name">${d.doc_name}</div>
                  <div class="doc-meta">
                    <span class="badge badge-gray">${d.doc_type}</span>
                    ${d.file_size ? `<span class="text-muted">${d.file_size}</span>` : ''}
                    <span class="text-muted">${fmt.date(d.uploaded_at)}</span>
                    ${d.expiry_date ? `<span class="${isExpiringSoon(d.expiry_date) ? 'text-red' : 'text-muted'}">Exp: ${fmt.date(d.expiry_date)}</span>` : ''}
                  </div>
                </div>
                <button class="btn btn-danger btn-xs" onclick="window._deleteDoc(${d.id})">✕</button>
              </div>`).join('') || '<div class="empty-mini">No documents uploaded yet</div>'}
          </div>
        `, null)}

      </div>
    </div>`);

  _bindActions();
}

// ── Section builder ─────────────────────────────────────────────
function section(id, icon, title, body, editFn) {
  return `
    <div class="org-section card" id="org-sec-${id}">
      <div class="org-section-header">
        <div class="org-section-title"><span class="org-sec-icon">${icon}</span>${title}</div>
        ${editFn ? `<button class="btn btn-ghost btn-sm" onclick="${editFn}">✏ Edit</button>` : ''}
      </div>
      <div class="org-section-body">${body}</div>
    </div>`;
}

function multiSection(items, renderItem, addFn, addLabel) {
  const cards = items.length
    ? `<div class="multi-grid">${items.map(renderItem).join('')}</div>`
    : `<div class="empty-mini">None added yet</div>`;
  return `${cards}
    <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="${addFn}">${addLabel}</button>`;
}

function f(label, value, mono = false, type = '') {
  let display = value || '—';
  if (type === 'link' && value)
    display = `<a href="${value}" target="_blank" class="link">${value.replace(/^https?:\/\//,'')}</a>`;
  return `<div class="field-item">
    <div class="field-label">${label}</div>
    <div class="field-value ${!value ? 'empty' : ''} ${mono ? 'mono' : ''}">${display}</div>
  </div>`;
}

function renderCoreLegacyIdentity(org) {
  const coreIds = [
    ['PAN', org.pan], ['TAN', org.tan], ['CIN', org.cin],
    ['MSME', org.msme_number], ['IEC', org.iec_code],
    ['PF', org.pf_number], ['ESI', org.esi_number],
  ].filter(([, v]) => v);
  if (!coreIds.length) return '';
  return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
    <div class="field-label" style="margin-bottom:8px">Legacy / Core Numbers</div>
    <div class="multi-grid">${coreIds.map(([type, num]) =>
      `<div class="multi-card"><span class="badge badge-gray">${type}</span>
       <div class="identity-number mono">${num}</div></div>`).join('')}
    </div>
  </div>`;
}

function completionHint(org) {
  if (!org.pan)          return 'Add PAN number to improve profile';
  if (!org.email)        return 'Add company email address';
  if (!org.addresses?.length) return 'Add at least one address';
  if (!org.banks?.length)     return 'Add a bank account';
  if (!org.contacts?.length)  return 'Add a point of contact';
  return 'Add more details to complete your profile';
}

function fyLabel(fy) {
  const map = { '04-01':'April 1 – March 31 (Indian FY)', '01-01':'January – December', '07-01':'July – June', '10-01':'October – September' };
  return map[fy] || fy;
}

function maskAccount(num) {
  if (!num) return '—';
  return '•••• •••• ' + num.slice(-4);
}

function isExpiringSoon(date) {
  if (!date) return false;
  const days = (new Date(date) - new Date()) / 86400000;
  return days >= 0 && days <= 90;
}

function docIcon(mime) {
  if (!mime) return '📄';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('image')) return '🖼';
  if (mime.includes('word') || mime.includes('document')) return '📘';
  if (mime.includes('sheet') || mime.includes('excel')) return '📗';
  return '📄';
}

// ═══════════════════════════════════════════════════════════════
// ACTION BINDINGS
// ═══════════════════════════════════════════════════════════════
function _bindActions() {
  // ── Company Edit ───────────────────────────────────────────
  window._editCompany = () => openModal({
    title: '✏ Edit Company Information',
    size: 'lg',
    body: `<form id="co-form" class="form-grid-sm">
      <div class="fg full"><label class="flabel">Legal Name *</label>
        <input class="finput" name="legal_name" value="${v(_orgData.legal_name)}" required></div>
      <div class="fg"><label class="flabel">Brand / Trade Name</label>
        <input class="finput" name="brand_name" value="${v(_orgData.brand_name || _orgData.trade_name)}"></div>
      <div class="fg"><label class="flabel">Entity Type</label>
        <select class="fselect" name="type_of_entity">
          ${ENTITY_TYPES.map(t=>`<option ${_orgData.type_of_entity===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Industry</label>
        <select class="fselect" name="industry">
          ${INDUSTRIES.map(t=>`<option ${_orgData.industry===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Email</label>
        <input class="finput" type="email" name="email" value="${v(_orgData.email)}"></div>
      <div class="fg"><label class="flabel">Phone</label>
        <input class="finput" name="phone" value="${v(_orgData.phone)}"></div>
      <div class="fg"><label class="flabel">Website</label>
        <input class="finput" type="url" name="website" value="${v(_orgData.website)}"></div>
      <div class="fg"><label class="flabel">LinkedIn URL</label>
        <input class="finput" type="url" name="linkedin_url" value="${v(_orgData.linkedin_url)}"></div>
      <div class="fg"><label class="flabel">Timezone</label>
        <select class="fselect" name="timezone">
          ${TIMEZONES.map(t=>`<option ${_orgData.timezone===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Base Currency</label>
        <select class="fselect" name="base_currency">
          ${CURRENCIES.map(c=>`<option ${_orgData.base_currency===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Financial Year Start</label>
        <select class="fselect" name="financial_year_start">
          ${FY_STARTS.map(([val,lbl])=>`<option value="${val}" ${_orgData.financial_year_start===val?'selected':''}>${lbl}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Working Hours</label>
        <input class="finput" name="hours_of_operation" value="${v(_orgData.hours_of_operation)}" placeholder="e.g. Mon-Fri 9am-6pm IST"></div>
      <div class="fg"><label class="flabel">Employee Strength</label>
        <select class="fselect" name="employee_count_range">
          <option value="">Select…</option>
          ${EMP_RANGES.map(r=>`<option ${_orgData.employee_count_range===r?'selected':''}>${r}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Date of Incorporation</label>
        <input class="finput" type="date" name="incorporation_date" value="${v(_orgData.incorporation_date,'').split('T')[0]}"></div>
      <div class="fg"><label class="flabel">PAN</label>
        <input class="finput" name="pan" value="${v(_orgData.pan)}" class="mono" placeholder="AABCC1234D"></div>
      <div class="fg"><label class="flabel">TAN</label>
        <input class="finput" name="tan" value="${v(_orgData.tan)}" class="mono" placeholder="ABCD01234A"></div>
      <div class="fg"><label class="flabel">CIN</label>
        <input class="finput" name="cin" value="${v(_orgData.cin)}" class="mono"></div>
      <div class="fg"><label class="flabel">MSME / Udyam No.</label>
        <input class="finput" name="msme_number" value="${v(_orgData.msme_number)}" class="mono"></div>
      <div class="fg"><label class="flabel">IEC Code</label>
        <input class="finput" name="iec_code" value="${v(_orgData.iec_code)}" class="mono"></div>
    </form>`,
    submitLabel: 'Save',
    onSubmit: async () => {
      const data = fd('co-form');
      if (_orgData._exists) await put('/organisation', data);
      else await post('/organisation', data);
      toast('Company profile saved', 'success');
      reloadProfile();
    }
  });

  // ── Logo Edit ──────────────────────────────────────────────
  window._editLogo = () => openModal({
    title: 'Company Logo',
    body: `<div class="form-grid-sm">
      <div class="fg full"><label class="flabel">Logo URL</label>
        <input class="finput" id="logo-url" placeholder="https://..." value="${v(_orgData.logo_url)}">
        <div class="text-muted" style="font-size:11px;margin-top:4px">Enter a public image URL (recommended: square, min 200×200px)</div></div>
    </div>`,
    submitLabel: 'Save Logo',
    onSubmit: async () => {
      const url = document.getElementById('logo-url').value.trim();
      await put('/organisation', { logo_url: url });
      toast('Logo updated', 'success');
      reloadProfile();
    }
  });

  // ── Address ────────────────────────────────────────────────
  window._addAddress = () => addressModal(null);
  window._editAddress = (id) => {
    const a = (_orgData.addresses||[]).find(x=>x.id===id);
    if (a) addressModal(a);
  };
  window._deleteAddress = async (id) => {
    if (!confirm('Remove this address?')) return;
    await del(`/organisation/addresses/${id}`);
    toast('Address removed', 'info');
    reloadProfile();
  };

  // ── Contact ────────────────────────────────────────────────
  window._addContact = () => contactModal(null);
  window._editContact = (id) => {
    const c = (_orgData.contacts||[]).find(x=>x.id===id);
    if (c) contactModal(c);
  };
  window._deleteContact = async (id) => {
    if (!confirm('Remove this contact?')) return;
    await del(`/organisation/contacts/${id}`);
    toast('Contact removed', 'info');
    reloadProfile();
  };

  // ── Identity ───────────────────────────────────────────────
  window._addIdentity = () => identityModal(null);
  window._editIdentity = (id) => {
    const i = (_orgData.identity||[]).find(x=>x.id===id);
    if (i) identityModal(i);
  };
  window._deleteIdentity = async (id) => {
    if (!confirm('Remove this identity record?')) return;
    await del(`/organisation/identity/${id}`);
    toast('Removed', 'info');
    reloadProfile();
  };

  // ── Registration ───────────────────────────────────────────
  window._addReg = () => regModal(null, false);
  window._editReg = (type, id) => {
    if (type === 'gst') {
      const r = (_orgData.gst||[]).find(x=>x.id===id);
      if (r) regModal({...r, reg_type:'GST', reg_number:r.gstin, start_date:r.registration_date, _gst:true}, true);
    } else {
      const r = (_orgData.registrations||[]).find(x=>x.id===id);
      if (r) regModal(r, false);
    }
  };
  window._deleteReg = async (type, id) => {
    if (!confirm('Remove this registration?')) return;
    const url = type === 'gst' ? `/organisation/gst/${id}` : `/organisation/registrations/${id}`;
    await del(url).catch(() => put(url, {is_active:0}));
    toast('Removed', 'info');
    reloadProfile();
  };

  // ── Bank ───────────────────────────────────────────────────
  window._addBank = () => bankModal(null);
  window._editBank = (id) => {
    const b = (_orgData.banks||[]).find(x=>x.id===id);
    if (b) bankModal(b);
  };
  window._deleteBank = async (id) => {
    if (!confirm('Remove this bank account?')) return;
    await del(`/organisation/banks/${id}`).catch(() => put(`/organisation/banks/${id}`, {is_active:0}));
    toast('Removed', 'info');
    reloadProfile();
  };

  // ── Document ───────────────────────────────────────────────
  window._uploadDoc = () => docModal();
  window._deleteDoc = async (id) => {
    if (!confirm('Remove this document?')) return;
    await del(`/organisation/documents/${id}`).catch(() => put(`/organisation/documents/${id}`, {is_active:0}));
    toast('Removed', 'info');
    reloadProfile();
  };
}

// ═══════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════

function addressModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Address' : '+ Add Address',
    size: 'lg',
    body: `<form id="addr-form" class="form-grid-sm">
      <div class="fg"><label class="flabel">Address Type *</label>
        <select class="fselect" name="address_type" required>
          ${ADDR_TYPES.map(t=>`<option ${existing?.address_type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Mark as Primary</label>
        <select class="fselect" name="is_primary">
          <option value="0" ${!existing?.is_primary?'selected':''}>No</option>
          <option value="1" ${existing?.is_primary?'selected':''}>Yes</option>
        </select></div>
      <div class="fg full"><label class="flabel">Address Line 1</label>
        <input class="finput" name="line1" value="${v(existing?.line1)}"></div>
      <div class="fg full"><label class="flabel">Address Line 2</label>
        <input class="finput" name="line2" value="${v(existing?.line2)}"></div>
      <div class="fg"><label class="flabel">City</label>
        <input class="finput" name="city" value="${v(existing?.city)}"></div>
      <div class="fg"><label class="flabel">State</label>
        <input class="finput" name="state" value="${v(existing?.state)}" placeholder="e.g. Telangana"></div>
      <div class="fg"><label class="flabel">Pincode</label>
        <input class="finput" name="pincode" value="${v(existing?.pincode)}"></div>
      <div class="fg"><label class="flabel">Country</label>
        <input class="finput" name="country" value="${v(existing?.country,'India')}"></div>
      <div class="fg"><label class="flabel">Currency</label>
        <select class="fselect" name="currency">
          ${CURRENCIES.map(c=>`<option ${(existing?.currency||'INR')===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Timezone</label>
        <select class="fselect" name="timezone">
          ${TIMEZONES.map(t=>`<option ${(existing?.timezone||'Asia/Kolkata')===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg full"><label class="flabel">Hours of Operation</label>
        <input class="finput" name="hours_of_operation" value="${v(existing?.hours_of_operation)}" placeholder="Mon-Fri 9am-6pm IST"></div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Add Address',
    onSubmit: async () => {
      const data = fd('addr-form');
      data.is_primary = parseInt(data.is_primary);
      if (isEdit) await put(`/organisation/addresses/${existing.id}`, data);
      else        await post('/organisation/addresses', data);
      toast(isEdit ? 'Address updated' : 'Address added', 'success');
      reloadProfile();
    }
  });
}

function contactModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Contact' : '+ Add Point of Contact',
    body: `<form id="contact-form" class="form-grid-sm">
      <div class="fg full"><label class="flabel">Full Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required></div>
      <div class="fg"><label class="flabel">Designation</label>
        <input class="finput" name="designation" value="${v(existing?.designation)}" placeholder="e.g. CEO, CFO, HR Head"></div>
      <div class="fg"><label class="flabel">Department</label>
        <input class="finput" name="department" value="${v(existing?.department)}" placeholder="e.g. Finance, HR"></div>
      <div class="fg"><label class="flabel">Email</label>
        <input class="finput" type="email" name="email" value="${v(existing?.email)}"></div>
      <div class="fg"><label class="flabel">Phone</label>
        <input class="finput" name="phone" value="${v(existing?.phone)}"></div>
      <div class="fg"><label class="flabel">Primary Contact?</label>
        <select class="fselect" name="is_primary">
          <option value="0" ${!existing?.is_primary?'selected':''}>No</option>
          <option value="1" ${existing?.is_primary?'selected':''}>Yes – Primary</option>
        </select></div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Add Contact',
    onSubmit: async () => {
      const data = fd('contact-form');
      data.is_primary = parseInt(data.is_primary);
      if (isEdit) await put(`/organisation/contacts/${existing.id}`, data);
      else        await post('/organisation/contacts', data);
      toast(isEdit ? 'Contact updated' : 'Contact added', 'success');
      reloadProfile();
    }
  });
}

function identityModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Identity Record' : '+ Add Identity / Statutory Number',
    body: `<form id="id-form" class="form-grid-sm">
      <div class="fg"><label class="flabel">ID Type *</label>
        <select class="fselect" name="id_type" required>
          ${ID_TYPES.map(t=>`<option ${existing?.id_type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Number *</label>
        <input class="finput mono" name="id_number" value="${v(existing?.id_number)}" required></div>
      <div class="fg"><label class="flabel">Issue Date</label>
        <input class="finput" type="date" name="issue_date" value="${v(existing?.issue_date,'').split('T')[0]}"></div>
      <div class="fg"><label class="flabel">Expiry Date</label>
        <input class="finput" type="date" name="expiry_date" value="${v(existing?.expiry_date,'').split('T')[0]}"></div>
      <div class="fg full"><label class="flabel">Issuing Authority</label>
        <input class="finput" name="issuing_authority" value="${v(existing?.issuing_authority)}" placeholder="e.g. Ministry of Corporate Affairs"></div>
      <div class="fg full"><label class="flabel">Notes</label>
        <textarea class="finput" name="notes" rows="2">${v(existing?.notes)}</textarea></div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Add',
    onSubmit: async () => {
      const data = fd('id-form');
      if (isEdit) await put(`/organisation/identity/${existing.id}`, data);
      else        await post('/organisation/identity', data);
      toast(isEdit ? 'Updated' : 'Added', 'success');
      reloadProfile();
    }
  });
}

function regModal(existing, isGst) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Registration' : '+ Add Registration / Licence / Certification',
    size: 'lg',
    body: `<form id="reg-form" class="form-grid-sm">
      <div class="fg"><label class="flabel">Registration Type *</label>
        <select class="fselect" name="reg_type" required>
          ${REG_TYPES.map(t=>`<option ${existing?.reg_type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Registration Number *</label>
        <input class="finput mono" name="reg_number" value="${v(existing?.reg_number || existing?.gstin)}" required></div>
      <div class="fg"><label class="flabel">State</label>
        <input class="finput" name="state" value="${v(existing?.state)}" placeholder="e.g. Telangana, Karnataka"></div>
      <div class="fg"><label class="flabel">Jurisdiction</label>
        <select class="fselect" name="jurisdiction">
          ${JURISDICTIONS.map(j=>`<option ${(existing?.jurisdiction||'National')===j?'selected':''}>${j}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Trade / Business Name</label>
        <input class="finput" name="trade_name" value="${v(existing?.trade_name)}"></div>
      <div class="fg"><label class="flabel">Issuing Authority</label>
        <input class="finput" name="issuing_authority" value="${v(existing?.issuing_authority)}" placeholder="e.g. GST Council, EPFO"></div>
      <div class="fg"><label class="flabel">Start / Registration Date</label>
        <input class="finput" type="date" name="start_date" value="${v(existing?.start_date||existing?.registration_date,'').split('T')[0]}"></div>
      <div class="fg"><label class="flabel">Expiry Date</label>
        <input class="finput" type="date" name="expiry_date" value="${v(existing?.expiry_date,'').split('T')[0]}"></div>
      <div class="fg"><label class="flabel">Primary?</label>
        <select class="fselect" name="is_primary">
          <option value="0" ${!existing?.is_primary?'selected':''}>No</option>
          <option value="1" ${existing?.is_primary?'selected':''}>Yes</option>
        </select></div>
      <div class="fg full"><label class="flabel">Notes</label>
        <textarea class="finput" name="notes" rows="2">${v(existing?.notes)}</textarea></div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Add Registration',
    onSubmit: async () => {
      const data = fd('reg-form');
      data.is_primary = parseInt(data.is_primary);
      if (isEdit) {
        if (existing._gst) await put(`/organisation/gst/${existing.id}`, { gstin: data.reg_number, trade_name: data.trade_name, registration_date: data.start_date, is_primary: data.is_primary });
        else                await put(`/organisation/registrations/${existing.id}`, data);
      } else {
        if (data.reg_type === 'GST') await post('/organisation/gst', { gstin: data.reg_number, trade_name: data.trade_name, registration_date: data.start_date, is_primary: data.is_primary });
        else                          await post('/organisation/registrations', data);
      }
      toast(isEdit ? 'Updated' : 'Added', 'success');
      reloadProfile();
    }
  });
}

function bankModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Bank Account' : '+ Add Bank Account',
    size: 'lg',
    body: `<form id="bank-form" class="form-grid-sm">
      <div class="fg full"><label class="flabel">Account Name *</label>
        <input class="finput" name="account_name" value="${v(existing?.account_name)}" required placeholder="Name on account"></div>
      <div class="fg"><label class="flabel">Bank Name *</label>
        <input class="finput" name="bank_name" value="${v(existing?.bank_name)}" required></div>
      <div class="fg"><label class="flabel">Branch</label>
        <input class="finput" name="branch" value="${v(existing?.branch)}"></div>
      <div class="fg"><label class="flabel">Account Number *</label>
        <input class="finput mono" name="account_number" value="${v(existing?.account_number)}" required></div>
      <div class="fg"><label class="flabel">IFSC Code</label>
        <input class="finput mono" name="ifsc_code" value="${v(existing?.ifsc_code)}" placeholder="HDFC0001234"></div>
      <div class="fg"><label class="flabel">SWIFT / BIC</label>
        <input class="finput mono" name="swift_code" value="${v(existing?.swift_code)}"></div>
      <div class="fg"><label class="flabel">Account Type</label>
        <select class="fselect" name="account_type">
          ${ACC_TYPES.map(t=>`<option ${(existing?.account_type||'Current')===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Currency</label>
        <select class="fselect" name="currency">
          ${CURRENCIES.map(c=>`<option ${(existing?.currency||'INR')===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Purpose</label>
        <input class="finput" name="purpose" value="${v(existing?.purpose)}" placeholder="e.g. Payroll, Operations, Tax"></div>
      <div class="fg"><label class="flabel">Primary Account?</label>
        <select class="fselect" name="is_primary">
          <option value="0" ${!existing?.is_primary?'selected':''}>No</option>
          <option value="1" ${existing?.is_primary?'selected':''}>Yes – Primary</option>
        </select></div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Add Bank Account',
    onSubmit: async () => {
      const data = fd('bank-form');
      data.is_primary = parseInt(data.is_primary);
      if (isEdit) await put(`/organisation/banks/${existing.id}`, data);
      else        await post('/organisation/banks', data);
      toast(isEdit ? 'Bank account updated' : 'Bank account added', 'success');
      reloadProfile();
    }
  });
}

function docModal() {
  openModal({
    title: '📎 Upload Document',
    body: `<form id="doc-form" class="form-grid-sm">
      <div class="fg"><label class="flabel">Document Type *</label>
        <select class="fselect" name="doc_type" required>
          ${DOC_TYPES.map(t=>`<option>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Document Name *</label>
        <input class="finput" name="doc_name" required placeholder="e.g. GST Certificate 2024-25"></div>
      <div class="fg full">
        <label class="flabel">Select File *</label>
        <input type="file" class="finput" id="doc-file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx">
        <div class="text-muted" style="font-size:11px;margin-top:4px">Max 5MB. PDF, Word, Excel, Images.</div>
      </div>
      <div class="fg"><label class="flabel">Expiry Date</label>
        <input class="finput" type="date" name="expiry_date"></div>
      <div class="fg"><label class="flabel">Notes</label>
        <input class="finput" name="notes" placeholder="Optional notes"></div>
    </form>`,
    submitLabel: 'Upload',
    onSubmit: async () => {
      const data = fd('doc-form');
      const fileInput = document.getElementById('doc-file');
      const file = fileInput?.files?.[0];
      if (!file) { toast('Please select a file', 'error'); return false; }
      if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5MB)', 'error'); return false; }

      // Read as base64
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      data.file_data = base64;
      data.file_size = (file.size / 1024).toFixed(1) + ' KB';
      data.mime_type = file.type;
      if (!data.doc_name) data.doc_name = file.name;

      await post('/organisation/documents', data);
      toast('Document uploaded', 'success');
      reloadProfile();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function v(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  return String(val).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fd(formId) {
  const form = document.getElementById(formId);
  const data = Object.fromEntries(new FormData(form));
  Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
  return data;
}

async function reloadProfile() {
  const org = await get('/organisation');
  _orgData = org;
  renderPage(org);
}

window.scrollToSec = (id) => {
  const el = document.getElementById('org-sec-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ═══════════════════════════════════════════════════════════════
// OTHER ORG PAGES
// ═══════════════════════════════════════════════════════════════

export async function renderBUs() {
  setPageTitle('Business Units', '');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Business Units' }]);
  showLoader();
  try {
    const rows = await get('/business-units');
    setContent(`<div class="page-body">
      <div class="list-toolbar"><div></div>
        <button class="btn btn-primary" onclick="window._addBU()">+ Add Business Unit</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>Name</th><th>Description</th><th>Head</th><th>Departments</th><th>Headcount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(b=>`<tr>
          <td><strong>${b.name}</strong></td>
          <td class="text-muted">${b.description||'—'}</td>
          <td>${b.head_name||'—'}</td>
          <td class="mono">${b.dept_count||0}</td>
          <td class="mono">${b.headcount||0}</td>
          <td>${badge(b.is_active?'Active':'Inactive')}</td>
          <td class="tbl-actions">
            <button class="btn btn-ghost btn-sm" onclick="window._editBU(${b.id})">✏ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="window._deleteBU(${b.id})">Delete</button>
          </td>
        </tr>`).join('')||'<tr><td colspan="7" class="text-muted" style="padding:24px;text-align:center">No business units found</td></tr>'}
        </tbody></table></div></div>
    </div>`);

    window._addBU = () => buModal(null, rows);
    window._editBU = (id) => {
      const bu = rows.find(r=>r.id===id);
      if (bu) buModal(bu, rows);
    };
    window._deleteBU = async (id) => {
      if (!confirm('Delete this business unit?')) return;
      await put(`/business-units/${id}`, { is_active: 0 });
      toast('Deleted', 'info');
      renderBUs();
    };
  } catch (e) { showError(e.message); }
}

function buModal(existing, rows) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Business Unit' : '+ New Business Unit',
    body: `<form id="bu-form" class="form-grid-sm">
      <div class="fg full"><label class="flabel">Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required></div>
      <div class="fg full"><label class="flabel">Description</label>
        <input class="finput" name="description" value="${v(existing?.description)}"></div>
      <div class="fg full"><label class="flabel">Head / Leader</label>
        <input class="finput" name="head_name" value="${v(existing?.head_name)}" placeholder="Name of BU head"></div>
    </form>`,
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('bu-form');
      if (isEdit) await put(`/business-units/${existing.id}`, data);
      else        await post('/business-units', data);
      toast(isEdit ? 'Updated' : 'Created', 'success');
      renderBUs();
    }
  });
}

export async function renderBUDetail({ id }) {
  showLoader();
  const bu = await get(`/business-units/${id}`);
  setPageTitle(bu.name, 'Business Unit');
  setBreadcrumb([{ label: 'Business Units', url: '/organisation/business-units' }, { label: bu.name }]);
  setContent(`<div class="page-body"><div class="card"><div class="card-body">
    <div class="field-grid">
      <div class="field-item"><div class="field-label">Name</div><div class="field-value">${bu.name}</div></div>
      <div class="field-item"><div class="field-label">Head</div><div class="field-value">${bu.head_name||'—'}</div></div>
      <div class="field-item"><div class="field-label">Status</div><div class="field-value">${badge(bu.is_active?'Active':'Inactive')}</div></div>
    </div>
    ${bu.departments?.length ? `<div style="margin-top:20px"><h4>Departments</h4><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${bu.departments.map(d=>`<span class="badge badge-blue">${d.name}</span>`).join('')}</div></div>` : ''}
  </div></div></div>`);
}

export async function renderDepts() {
  setPageTitle('Departments', '');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Departments' }]);
  showLoader();
  try {
    const [rows, masters] = await Promise.all([get('/departments'), get('/masters/all')]);
    setContent(`<div class="page-body">
      <div class="list-toolbar"><div></div>
        <button class="btn btn-primary" onclick="window._addDept()">+ Add Department</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>Department</th><th>Business Unit</th><th>Head</th><th>Location</th><th>Headcount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(d=>`<tr>
          <td><strong>${d.name}</strong></td>
          <td>${d.bu_name||'—'}</td>
          <td>${d.head_name||'—'}</td>
          <td class="text-muted">${d.location||'—'}</td>
          <td class="mono">${d.headcount||0}</td>
          <td>${badge(d.is_active?'Active':'Inactive')}</td>
          <td class="tbl-actions">
            <button class="btn btn-ghost btn-sm" onclick="window._editDept(${d.id})">✏ Edit</button>
          </td>
        </tr>`).join('')||'<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px">No departments</td></tr>'}
        </tbody></table></div></div>
    </div>`);

    window._addDept = () => deptModal(null, masters);
    window._editDept = (id) => {
      const dept = rows.find(r=>r.id===id);
      if (dept) deptModal(dept, masters);
    };
  } catch(e) { showError(e.message); }
}

function deptModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Department' : '+ New Department',
    body: `<form id="dept-form" class="form-grid-sm">
      <div class="fg full"><label class="flabel">Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required></div>
      <div class="fg"><label class="flabel">Business Unit</label>
        <select class="fselect" name="business_unit_id">
          <option value="">Select…</option>
          ${(masters['business-units']||[]).map(b=>`<option value="${b.id}" ${existing?.business_unit_id==b.id?'selected':''}>${b.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Cost Centre</label>
        <select class="fselect" name="cost_centre_id">
          <option value="">Select…</option>
          ${(masters['cost-centres']||[]).map(c=>`<option value="${c.id}" ${existing?.cost_centre_id==c.id?'selected':''}>${c.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Head</label>
        <input class="finput" name="head_name" value="${v(existing?.head_name)}"></div>
      <div class="fg"><label class="flabel">Location</label>
        <input class="finput" name="location" value="${v(existing?.location)}"></div>
    </form>`,
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('dept-form');
      if (isEdit) await put(`/departments/${existing.id}`, data);
      else        await post('/departments', data);
      toast(isEdit ? 'Updated' : 'Created', 'success');
      renderDepts();
    }
  });
}

export async function renderDeptDetail({ id }) {
  const dept = await get(`/departments/${id}`);
  setPageTitle(dept.name, 'Department');
  setBreadcrumb([{ label: 'Departments', url: '/organisation/departments' }, { label: dept.name }]);
  setContent(`<div class="page-body"><div class="card"><div class="card-body">
    <div class="field-grid">
      <div class="field-item"><div class="field-label">Name</div><div class="field-value">${dept.name}</div></div>
      <div class="field-item"><div class="field-label">Business Unit</div><div class="field-value">${dept.bu_name||'—'}</div></div>
      <div class="field-item"><div class="field-label">Head</div><div class="field-value">${dept.head_name||'—'}</div></div>
      <div class="field-item"><div class="field-label">Location</div><div class="field-value">${dept.location||'—'}</div></div>
    </div>
  </div></div></div>`);
}

export async function renderCostCentres() {
  setPageTitle('Cost Centres', '');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Cost Centres' }]);
  showLoader();
  try {
    const [rows, masters] = await Promise.all([get('/cost-centres'), get('/masters/all')]);
    setContent(`<div class="page-body">
      <div class="list-toolbar"><div></div>
        <button class="btn btn-primary" onclick="window._addCC()">+ Add Cost Centre</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>Code</th><th>Name</th><th>Business Unit</th><th>Budget</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(c=>`<tr>
          <td class="mono">${c.code}</td>
          <td><strong>${c.name}</strong></td>
          <td>${c.bu_name||'—'}</td>
          <td class="mono">${fmt.money(c.budget)}</td>
          <td>${badge(c.is_active?'Active':'Inactive')}</td>
          <td class="tbl-actions">
            <button class="btn btn-ghost btn-sm" onclick="window._editCC(${c.id})">✏ Edit</button>
          </td>
        </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px" class="text-muted">No cost centres</td></tr>'}
        </tbody></table></div></div>
    </div>`);

    window._addCC = () => ccModal(null, masters);
    window._editCC = (id) => {
      const cc = rows.find(r=>r.id===id);
      if (cc) ccModal(cc, masters);
    };
  } catch(e) { showError(e.message); }
}

function ccModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Cost Centre' : '+ New Cost Centre',
    body: `<form id="cc-form" class="form-grid-sm">
      <div class="fg"><label class="flabel">Code *</label>
        <input class="finput mono" name="code" value="${v(existing?.code)}" required placeholder="e.g. CC-IT-001"></div>
      <div class="fg"><label class="flabel">Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required></div>
      <div class="fg"><label class="flabel">Business Unit</label>
        <select class="fselect" name="business_unit_id">
          <option value="">Select…</option>
          ${(masters['business-units']||[]).map(b=>`<option value="${b.id}" ${existing?.business_unit_id==b.id?'selected':''}>${b.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Budget (₹)</label>
        <input class="finput" type="number" name="budget" value="${v(existing?.budget,0)}"></div>
    </form>`,
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('cc-form');
      if (isEdit) await put(`/cost-centres/${existing.id}`, data);
      else        await post('/cost-centres', data);
      toast(isEdit ? 'Updated' : 'Created', 'success');
      renderCostCentres();
    }
  });
}

export async function renderLocations() {
  setPageTitle('Locations', '');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Locations' }]);
  showLoader();
  try {
    const rows = await get('/locations');
    setContent(`<div class="page-body">
      <div class="list-toolbar"><div></div>
        <button class="btn btn-primary" onclick="window._addLoc()">+ Add Location</button>
      </div>
      <div class="card"><div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>Name</th><th>City</th><th>Type</th><th>Headcount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(l=>`<tr>
          <td><strong>${l.name}</strong></td>
          <td>${l.city||'—'}</td>
          <td>${l.type||'—'}</td>
          <td class="mono">${l.headcount||0}</td>
          <td>${badge(l.is_active?'Active':'Inactive')}</td>
          <td class="tbl-actions">
            <button class="btn btn-ghost btn-sm" onclick="window._editLoc(${l.id})">✏ Edit</button>
          </td>
        </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px" class="text-muted">No locations</td></tr>'}
        </tbody></table></div></div>
    </div>`);

    window._addLoc = () => locModal(null);
    window._editLoc = (id) => {
      const loc = rows.find(r=>r.id===id);
      if (loc) locModal(loc);
    };
  } catch(e) { showError(e.message); }
}

function locModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Location' : '+ New Location',
    body: `<form id="loc-form" class="form-grid-sm">
      <div class="fg full"><label class="flabel">Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required placeholder="e.g. Hyderabad HQ"></div>
      <div class="fg"><label class="flabel">Type</label>
        <select class="fselect" name="type">
          ${['HQ','Regional','Branch','Delivery Centre','Data Centre','Other'].map(t=>`<option ${existing?.type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">City</label>
        <input class="finput" name="city" value="${v(existing?.city)}"></div>
      <div class="fg full"><label class="flabel">Address</label>
        <input class="finput" name="address" value="${v(existing?.address_line1)}"></div>
      <div class="fg"><label class="flabel">Pincode</label>
        <input class="finput" name="pincode" value="${v(existing?.pincode)}"></div>
      <div class="fg"><label class="flabel">Headcount</label>
        <input class="finput" type="number" name="headcount" value="${v(existing?.headcount,0)}"></div>
    </form>`,
    submitLabel: isEdit ? 'Save' : 'Create',
    onSubmit: async () => {
      const data = fd('loc-form');
      if (isEdit) await put(`/locations/${existing.id}`, data);
      else        await post('/locations', data);
      toast(isEdit ? 'Updated' : 'Created', 'success');
      renderLocations();
    }
  });
}
