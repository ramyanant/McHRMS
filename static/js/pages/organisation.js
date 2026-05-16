/**
 * Organisation Profile — LinkedIn-style
 * Clean implementation with no nested template literal syntax issues
 */
import { get, post, put, del } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

const ENTITY_TYPES = ['Private Limited','Public Limited','LLP','OPC',
  'Sole Proprietorship','Partnership','Section 8','Trust','Other'];
const INDUSTRIES = ['IT & Technology','Staffing & Recruitment','BFSI','Healthcare',
  'Manufacturing','Retail','Education','Logistics','Real Estate','Other'];
const CURRENCIES  = ['INR','USD','EUR','GBP','SGD','AED','AUD'];
const TIMEZONES   = ['Asia/Kolkata','Asia/Dubai','America/New_York','Europe/London','Asia/Singapore'];
const FY_STARTS   = [['04-01','April 1 (Indian FY)'],['01-01','Jan 1'],['07-01','Jul 1']];
const ADDR_TYPES  = ['Registered','Operational','Branch','Billing','Warehouse','Other'];
const ID_TYPES    = ['PAN','TAN','CIN','IEC','MSME Udyam','Startup India','DPIIT','Other'];
const REG_TYPES   = ['GST','Professional Tax','Provident Fund (PF)','ESI','Labour Licence',
  'FSSAI','ISO Certification','Shops & Establishment','Trade Licence','Factory Licence','Other'];
const ACC_TYPES   = ['Current','Savings','Cash Credit','Overdraft'];
const DOC_TYPES   = ['Certificate of Incorporation','MOA/AOA','PAN Card','TAN Card',
  'MSME Certificate','GST Certificate','PF Registration','ESI Registration',
  'Labour Licence','ISO Certificate','Bank Statement','Audit Report','ITR','Other'];
const EMP_RANGES  = ['1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+'];

let _org = null;

// ─── Safe value escaper ─────────────────────────────────────────
function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Form data extractor ────────────────────────────────────────
function fd(id) {
  const d = Object.fromEntries(new FormData(document.getElementById(id)));
  Object.keys(d).forEach(k => { if (d[k] === '') d[k] = null; });
  return d;
}

// ─── Select options builder ─────────────────────────────────────
function opts(arr, selected, valKey, labelKey) {
  return arr.map(function(item) {
    const val   = typeof item === 'string' ? item : item[valKey || 'id'];
    const label = typeof item === 'string' ? item : item[labelKey || 'name'];
    const sel   = String(val) === String(selected) ? ' selected' : '';
    return '<option value="' + v(val) + '"' + sel + '>' + v(label) + '</option>';
  }).join('');
}

// ─── Expiry warning ─────────────────────────────────────────────
function expirySoon(date) {
  if (!date) return false;
  return (new Date(date) - new Date()) / 86400000 <= 90;
}

function docIcon(mime) {
  if (!mime) return '📄';
  if (mime.includes('pdf'))   return '📕';
  if (mime.includes('image')) return '🖼';
  if (mime.includes('word'))  return '📘';
  if (mime.includes('sheet') || mime.includes('excel')) return '📗';
  return '📄';
}

// ─── Completion score ───────────────────────────────────────────
function calcCompletion(org) {
  const checks = {
    legal_name:5, email:3, phone:3, website:2, type_of_entity:3,
    industry:3, brand_name:2, pan:5, timezone:2, financial_year_start:2,
    _contacts:3, _addresses:10, _banks:15, _documents:10,
    _gst:8, _identity:7,
  };
  const total = Object.values(checks).reduce((a,b) => a+b, 0);
  let score = 0;
  Object.entries(checks).forEach(function([k, w]) {
    if (k.startsWith('_')) {
      const key = k.slice(1);
      const map = {contacts:'contacts',addresses:'addresses',banks:'banks',
                   documents:'documents',gst:'gst',identity:'identity'};
      if ((org[map[key]] || []).length > 0) score += w;
    } else if (org[k]) {
      score += w;
    }
  });
  return Math.round(score / total * 100);
}

// ═══════════════════════════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════════════════════════
export async function renderProfile() {
  setPageTitle('Organisation Profile', 'Company information');
  setBreadcrumb([{ label: 'Organisation', url: '/organisation/profile' }, { label: 'Profile' }]);
  showLoader();
  try {
    const org = await get('/organisation');
    _org = org;
    renderPage(org);
  } catch (e) {
    showError(e.message);
  }
}

function renderPage(org) {
  const pct      = calcCompletion(org);
  const pctColor = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red';
  const contacts = org.contacts || [];
  const addresses= org.addresses || [];
  const identity = org.identity || [];
  const regs     = org.registrations || [];
  const gsts     = org.gst || [];
  const banks    = org.banks || [];
  const docs     = org.documents || [];

  // Build sidebar nav
  const navSections = [
    ['company','🏢','Company'],
    ['addresses','📍','Addresses'],
    ['contacts','👥','Contacts'],
    ['identity','🪪','Identity & Statutory'],
    ['registrations','📋','Registrations & Licences'],
    ['banking','🏦','Banking'],
    ['documents','📄','Documents'],
  ];
  const navHTML = navSections.map(function(s) {
    return '<div class="org-nav-item" onclick="window.orgScrollTo(\'' + s[0] + '\')">'
         + '<span>' + s[1] + '</span><span>' + s[2] + '</span></div>';
  }).join('');

  // Build sidebar
  const logoHTML = org.logo_data
    ? '<img src="/api/v1/organisation/logo" class="org-logo-img" alt="Logo">'
    : '<div class="org-logo-placeholder"><span>🏛</span></div>';

  const sidebar = '<div class="org-complete-card card">'
    + '<div class="org-logo-wrap">' + logoHTML
    + '<button class="btn btn-ghost btn-sm" onclick="window.orgEditLogo()" style="margin-top:8px;width:100%">Change Logo</button>'
    + '</div>'
    + '<div class="org-name">' + v(org.legal_name, '—') + '</div>'
    + '<div class="org-brand">' + v(org.brand_name || org.trade_name, '') + '</div>'
    + '<div class="org-type-badge">' + v(org.type_of_entity, 'Company') + '</div>'
    + '<div class="completion-section">'
    + '<div class="completion-header">'
    + '<span class="completion-label">Profile Completeness</span>'
    + '<span class="completion-pct completion-pct-' + pctColor + '">' + pct + '%</span>'
    + '</div>'
    + '<div class="completion-bar-track">'
    + '<div class="completion-bar-fill completion-fill-' + pctColor + '" style="width:' + pct + '%"></div>'
    + '</div>'
    + '</div>'
    + '<nav class="org-section-nav">' + navHTML + '</nav>'
    + '</div>';

  // Build sections
  const companyFields = [
    ['Legal Name', org.legal_name], ['Brand / Trade Name', org.brand_name || org.trade_name],
    ['Entity Type', org.type_of_entity || org.legal_structure], ['Industry', org.industry],
    ['Email', org.email], ['Phone', org.phone], ['Website', org.website],
    ['Timezone', org.timezone], ['Base Currency', org.base_currency],
    ['Financial Year', org.financial_year_start],
    ['Working Hours', org.hours_of_operation], ['Employee Range', org.employee_count_range],
    ['Incorporation Date', fmt.date(org.incorporation_date)],
    ['PAN', org.pan],
  ];
  const companyHTML = '<div class="field-grid field-grid-3">'
    + companyFields.map(function(cf) { return fieldItem(cf[0], cf[1]); }).join('')
    + '</div>';

  // Addresses
  const addrsHTML = multiGrid(addresses, function(a) {
    return '<div class="multi-card' + (a.is_primary ? ' multi-card-primary' : '') + '">'
      + '<div class="multi-card-header">'
      + '<div><span class="badge badge-blue">' + v(a.address_type) + '</span>'
      + (a.is_primary ? '<span class="badge badge-green" style="margin-left:4px">Primary</span>' : '')
      + '</div>'
      + '<div class="multi-card-actions">'
      + '<button class="btn btn-ghost btn-xs" onclick="window.orgEditAddress(' + a.id + ')">✏</button>'
      + '<button class="btn btn-danger btn-xs" onclick="window.orgDelAddress(' + a.id + ')">✕</button>'
      + '</div></div>'
      + '<div class="addr-body">'
      + '<div>' + v([a.line1, a.line2].filter(Boolean).join(', ')) + '</div>'
      + '<div>' + v([a.city, a.state, a.pincode].filter(Boolean).join(', ')) + '</div>'
      + '<div class="addr-meta">' + v(a.country || '') + ' · ' + v(a.currency || 'INR') + ' · ' + v(a.timezone || '') + '</div>'
      + (a.hours_of_operation ? '<div class="addr-meta">⏱ ' + v(a.hours_of_operation) + '</div>' : '')
      + '</div></div>';
  }, 'window.orgAddAddress()', '+ Add Address');

  // Contacts
  const contactsHTML = multiGrid(contacts, function(c) {
    return '<div class="multi-card' + (c.is_primary ? ' multi-card-primary' : '') + '">'
      + '<div class="multi-card-header">'
      + '<div class="contact-av-row">'
      + '<div class="av av-sm av-green">' + fmt.ini(c.name) + '</div>'
      + '<div><div class="fw-bold">' + v(c.name)
      + (c.is_primary ? '<span class="badge badge-green" style="margin-left:4px;font-size:9px">Primary</span>' : '')
      + '</div><div class="text-muted" style="font-size:11px">' + v(c.designation || '') + (c.department ? ' · ' + v(c.department) : '') + '</div>'
      + '</div></div>'
      + '<div class="multi-card-actions">'
      + '<button class="btn btn-ghost btn-xs" onclick="window.orgEditContact(' + c.id + ')">✏</button>'
      + '<button class="btn btn-danger btn-xs" onclick="window.orgDelContact(' + c.id + ')">✕</button>'
      + '</div></div>'
      + (c.email ? '<a href="mailto:' + v(c.email) + '" class="contact-link">✉ ' + v(c.email) + '</a>' : '')
      + (c.phone ? '<a href="tel:' + v(c.phone) + '" class="contact-link">📞 ' + v(c.phone) + '</a>' : '')
      + '</div>';
  }, 'window.orgAddContact()', '+ Add Contact');

  // Identity
  // Build "pinned" identity entries from org table (TAN, CIN, PAN, MSME, IEC)
  const pinnedIds = [
    {id_type:'PAN', id_number:org.pan}, {id_type:'TAN', id_number:org.tan},
    {id_type:'CIN', id_number:org.cin}, {id_type:'MSME', id_number:org.msme_number},
    {id_type:'IEC', id_number:org.iec_code}, {id_type:'PF', id_number:org.pf_number},
    {id_type:'ESI', id_number:org.esi_number},
  ].filter(function(x) { return x.id_number; });
  const allIdentity = pinnedIds.map(function(p) {
    return Object.assign({}, p, {id:'pinned_'+p.id_type, _pinned:true});
  }).concat(identity);

  const identityHTML = multiGrid(allIdentity, function(item) {
    const expiring = expirySoon(item.expiry_date);
    const isPinned = item._pinned;
    return '<div class="multi-card' + (isPinned ? ' multi-card-pinned' : '') + '">'
      + '<div class="multi-card-header"><span class="badge badge-purple">' + v(item.id_type) + '</span>'
      + (isPinned ? '<span class="badge badge-gray" style="font-size:9px">From Company</span>' : '')
      + '<div class="multi-card-actions">'
      + (isPinned
        ? '<button class="btn btn-ghost btn-xs" onclick="window.orgEditCompany()" title="Edit in Company">✏</button>'
        : '<button class="btn btn-ghost btn-xs" onclick="window.orgEditIdentity(' + item.id + ')">✏</button>'
          + '<button class="btn btn-danger btn-xs" onclick="window.orgDelIdentity(' + item.id + ')">✕</button>')
      + '</div></div>'
      + '<div class="identity-number">' + v(item.id_number) + '</div>'
      + (item.issue_date ? '<div class="text-muted" style="font-size:11px">Issued: ' + fmt.date(item.issue_date) + '</div>' : '')
      + (item.expiry_date ? '<div class="' + (expiring ? 'text-red' : 'text-muted') + '" style="font-size:11px">Expires: ' + fmt.date(item.expiry_date) + (expiring ? ' ⚠' : '') + '</div>' : '')
      + (item.issuing_authority ? '<div class="text-muted" style="font-size:11px">' + v(item.issuing_authority) + '</div>' : '')
      + '</div>';
  }, 'window.orgAddIdentity()', '+ Add Identity');

  // Registrations (GST + others)
  const allRegs = gsts.map(function(g) {
    return Object.assign({}, g, { reg_type:'GST', reg_number:g.gstin, start_date:g.registration_date, _isGst:true });
  }).concat(regs);

  const regsHTML = multiGrid(allRegs, function(r) {
    const expiring = expirySoon(r.expiry_date);
    return '<div class="multi-card' + (expiring ? ' multi-card-expiring' : '') + '">'
      + '<div class="multi-card-header">'
      + '<div><span class="badge badge-amber">' + v(r.reg_type) + '</span>'
      + (r.state ? '<span class="badge badge-gray" style="margin-left:4px">' + v(r.state) + '</span>' : '')
      + '</div>'
      + '<div class="multi-card-actions">'
      + '<button class="btn btn-ghost btn-xs" onclick="window.orgEditReg(' + (r._isGst?1:0) + ',' + r.id + ')">✏</button>'
      + '<button class="btn btn-danger btn-xs" onclick="window.orgDelReg(' + (r._isGst?1:0) + ',' + r.id + ')">✕</button>'
      + '</div></div>'
      + '<div class="identity-number">' + v(r.reg_number) + '</div>'
      + (r.trade_name ? '<div class="text-muted" style="font-size:11px">' + v(r.trade_name) + '</div>' : '')
      + (r.start_date ? '<div class="text-muted" style="font-size:11px">From: ' + fmt.date(r.start_date) + '</div>' : '')
      + (r.expiry_date ? '<div class="' + (expiring?'text-red fw-bold':'text-muted') + '" style="font-size:11px">Expires: ' + fmt.date(r.expiry_date) + (expiring?' ⚠ Expiring Soon':'') + '</div>' : '')
      + '</div>';
  }, 'window.orgAddReg()', '+ Add Registration / Licence');

  // Banks
  const banksHTML = multiGrid(banks, function(b) {
    return '<div class="multi-card' + (b.is_primary ? ' multi-card-primary' : '') + '">'
      + '<div class="multi-card-header"><div><div class="fw-bold">' + v(b.bank_name) + '</div>'
      + '<div class="text-muted" style="font-size:11px">' + v(b.account_type) + ' · ' + v(b.currency||'INR') + (b.purpose?' · '+v(b.purpose):'') + '</div>'
      + '</div><div class="multi-card-actions">'
      + '<button class="btn btn-ghost btn-xs" onclick="window.orgEditBank(' + b.id + ')">✏</button>'
      + '<button class="btn btn-danger btn-xs" onclick="window.orgDelBank(' + b.id + ')">✕</button>'
      + '</div></div>'
      + '<div class="bank-acno">•••• •••• ' + v(String(b.account_number||'').slice(-4)) + '</div>'
      + '<div class="text-muted" style="font-size:11px">' + v(b.account_name) + (b.branch?' · '+v(b.branch):'') + '</div>'
      + (b.ifsc_code ? '<div class="text-muted" style="font-size:11px">IFSC: <span class="mono">' + v(b.ifsc_code) + '</span></div>' : '')
      + '</div>';
  }, 'window.orgAddBank()', '+ Add Bank Account');

  // Documents
  const docsListHTML = docs.length
    ? '<div class="doc-grid">' + docs.map(function(d) {
        return '<div class="doc-card">'
          + '<div class="doc-icon">' + docIcon(d.mime_type) + '</div>'
          + '<div class="doc-info"><div class="doc-name">' + v(d.doc_name) + '</div>'
          + '<div class="doc-meta"><span class="badge badge-gray">' + v(d.doc_type) + '</span>'
          + (d.file_size ? '<span class="text-muted">' + v(d.file_size) + '</span>' : '')
          + '<span class="text-muted">' + fmt.date(d.uploaded_at) + '</span>'
          + (d.expiry_date ? '<span class="' + (expirySoon(d.expiry_date)?'text-red':'text-muted') + '">Exp: ' + fmt.date(d.expiry_date) + '</span>' : '')
          + '</div></div>'
          + '<div style="display:flex;gap:4px">'
          + '<button class="btn btn-ghost btn-xs" title="Download" onclick="window.orgDownloadDoc(' + d.id + ')">⬇</button>'
          + '<button class="btn btn-danger btn-xs" onclick="window.orgDelDoc(' + d.id + ')">✕</button>'
          + '</div></div>';
      }).join('') + '</div>'
    : '<div class="empty-mini">No documents uploaded yet</div>';

  const docsHTML = '<div class="doc-upload-zone" onclick="window.orgUploadDoc()" id="doc-drop-zone">'
    + '<div class="doc-upload-icon">📎</div>'
    + '<div class="doc-upload-text">Click to upload a document</div>'
    + '<div class="doc-upload-sub">PDF, Word, Excel, JPG, PNG up to 5MB</div>'
    + '</div>' + docsListHTML;

  // Assemble full page
  const html = '<div class="org-profile-layout">'
    + '<div class="org-sidebar">' + sidebar + '</div>'
    + '<div class="org-main" id="org-main-content">'
    + orgSection('company',       '🏢', 'Company Information',          companyHTML,  'window.orgEditCompany()')
    + orgSection('addresses',     '📍', 'Addresses',                    addrsHTML,    null)
    + orgSection('contacts',      '👥', 'Points of Contact',            contactsHTML, null)
    + orgSection('identity',      '🪪', 'Identity & Statutory Numbers', identityHTML, null)
    + orgSection('registrations', '📋', 'Registrations & Licences',     regsHTML,     null)
    + orgSection('banking',       '🏦', 'Bank Accounts',                banksHTML,    null)
    + orgSection('documents',     '📄', 'Documents',                    docsHTML,     null)
    + '</div></div>';

  setContent(html);
  bindActions();
}

// ─── Helpers ────────────────────────────────────────────────────
function orgSection(id, icon, title, body, editFn) {
  return '<div class="org-section card" id="org-sec-' + id + '">'
    + '<div class="org-section-header">'
    + '<div class="org-section-title"><span class="org-sec-icon">' + icon + '</span>' + title + '</div>'
    + (editFn ? '<button class="btn btn-ghost btn-sm" onclick="' + editFn + '">✏ Edit</button>' : '')
    + '</div><div class="org-section-body">' + body + '</div></div>';
}

function multiGrid(items, renderItem, addFn, addLabel) {
  const cardsHTML = items.length
    ? '<div class="multi-grid">' + items.map(renderItem).join('') + '</div>'
    : '<div class="empty-mini">None added yet</div>';
  return cardsHTML
    + '<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="' + addFn + '">' + addLabel + '</button>';
}

function fieldItem(label, value, mono) {
  return '<div class="field-item">'
    + '<div class="field-label">' + label + '</div>'
    + '<div class="field-value' + (!value ? ' empty' : '') + (mono ? ' mono' : '') + '">' + v(value, '—') + '</div>'
    + '</div>';
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════
function bindActions() {
  window.orgScrollTo = function(id) {
    const el = document.getElementById('org-sec-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Company
  window.orgEditCompany = function() {
    const org = _org || {};
    openModal({
      title: '✏ Edit Company Information', size: 'lg',
      body: '<form id="co-form" class="form-grid-sm">'
        + fg('Legal Name *', '<input class="finput" name="legal_name" value="' + v(org.legal_name) + '" required>')
        + fg('Brand / Trade Name', '<input class="finput" name="brand_name" value="' + v(org.brand_name || org.trade_name) + '">')
        + fg('Entity Type', '<select class="fselect" name="type_of_entity">' + opts(ENTITY_TYPES, org.type_of_entity) + '</select>')
        + fg('Industry', '<select class="fselect" name="industry">' + opts(INDUSTRIES, org.industry) + '</select>')
        + fg('Email', '<input class="finput" type="email" name="email" value="' + v(org.email) + '">')
        + fg('Phone', '<input class="finput" name="phone" value="' + v(org.phone) + '">')
        + fg('Website', '<input class="finput" type="url" name="website" value="' + v(org.website) + '">')
        + fg('LinkedIn', '<input class="finput" type="url" name="linkedin_url" value="' + v(org.linkedin_url) + '">')
        + fg('Timezone', '<select class="fselect" name="timezone">' + opts(TIMEZONES, org.timezone) + '</select>')
        + fg('Currency', '<select class="fselect" name="base_currency">' + opts(CURRENCIES, org.base_currency) + '</select>')
        + fg('Financial Year', '<select class="fselect" name="financial_year_start">'
            + FY_STARTS.map(function(fs) { return '<option value="' + fs[0] + '"' + (org.financial_year_start === fs[0] ? ' selected' : '') + '>' + fs[1] + '</option>'; }).join('')
            + '</select>')
        + fg('Working Hours', '<input class="finput" name="hours_of_operation" value="' + v(org.hours_of_operation) + '" placeholder="Mon-Fri 9am-6pm IST">')
        + fg('Employee Range', '<select class="fselect" name="employee_count_range"><option value="">Select…</option>' + opts(EMP_RANGES, org.employee_count_range) + '</select>')
        + fg('Date of Incorporation', '<input class="finput" type="date" name="incorporation_date" value="' + v((org.incorporation_date||'').split('T')[0]) + '">')
        + '<div class="fg full" style="background:var(--blue-l);border:1px solid var(--blue);border-radius:6px;padding:10px 12px;font-size:12px;color:#1e40af"><strong>💡 Statutory IDs</strong> — PAN, TAN, CIN, MSME, IEC are managed in the <strong>Identity &amp; Statutory Numbers</strong> section below. Scroll down to add or edit them.</div>'
        + '</form>',
      submitLabel: 'Save',
      onSubmit: async function() {
        const data = fd('co-form');
        if (_org && _org._exists) await put('/organisation', data);
        else await post('/organisation', data);
        toast('Saved', 'success');
        await reload();
      }
    });
  };

  // Logo
  window.orgEditLogo = function() {
    openModal({
      title: '🖼 Upload Company Logo',
      body: '<div class="fg full" style="text-align:center">'
        + '<div style="margin-bottom:12px">'
        + (_org && _org.logo_data ? '<img src="/api/v1/organisation/logo" style="width:80px;height:80px;border-radius:8px;object-fit:contain;border:1px solid var(--border)">' : '<div style="width:80px;height:80px;background:var(--bg);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto">🏛</div>')
        + '</div>'
        + '<label class="flabel">Upload Logo (PNG, JPG, SVG — max 1MB)</label>'
        + '<input type="file" class="finput" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml">'
        + '</div>',
      submitLabel: 'Upload',
      onSubmit: async function() {
        const fi = document.getElementById('logo-file');
        const file = fi && fi.files[0];
        if (!file) { toast('Please select a file', 'error'); return false; }
        if (file.size > 1024 * 1024) { toast('File too large (max 1MB)', 'error'); return false; }
        const base64 = await readFileBase64(file);
        await post('/organisation/logo', { file_data: base64, mime_type: file.type });
        toast('Logo uploaded', 'success');
        await reload();
      }
    });
  };

  // Address
  window.orgAddAddress    = function() { addressModal(null); };
  window.orgEditAddress   = function(id) { addressModal((_org.addresses||[]).find(function(x){return x.id===id;})); };
  window.orgDelAddress    = async function(id) {
    if (!confirm('Remove this address?')) return;
    await del('/organisation/addresses/' + id);
    toast('Removed', 'info');
    await reload();
  };

  // Contact
  window.orgAddContact    = function() { contactModal(null); };
  window.orgEditContact   = function(id) { contactModal((_org.contacts||[]).find(function(x){return x.id===id;})); };
  window.orgDelContact    = async function(id) {
    if (!confirm('Remove this contact?')) return;
    await del('/organisation/contacts/' + id);
    toast('Removed', 'info');
    await reload();
  };

  // Identity
  window.orgAddIdentity   = function() { identityModal(null); };
  window.orgEditIdentity  = function(id) { identityModal((_org.identity||[]).find(function(x){return x.id===id;})); };
  window.orgDelIdentity   = async function(id) {
    if (!confirm('Remove?')) return;
    await del('/organisation/identity/' + id);
    toast('Removed', 'info');
    await reload();
  };

  // Registration
  window.orgAddReg        = function() { regModal(null, false); };
  window.orgEditReg       = function(isGst, id) {
    if (isGst) {
      const r = (_org.gst||[]).find(function(x){return x.id===id;});
      if (r) regModal(Object.assign({}, r, {reg_type:'GST', reg_number:r.gstin, start_date:r.registration_date, _isGst:true}), true);
    } else {
      regModal((_org.registrations||[]).find(function(x){return x.id===id;}), false);
    }
  };
  window.orgDelReg        = async function(isGst, id) {
    if (!confirm('Remove this registration?')) return;
    const url = isGst ? '/organisation/gst/' + id : '/organisation/registrations/' + id;
    try { await del(url); } catch(e) { await put(url, { is_active: 0 }); }
    toast('Removed', 'info');
    await reload();
  };

  // Bank
  window.orgAddBank       = function() { bankModal(null); };
  window.orgEditBank      = function(id) { bankModal((_org.banks||[]).find(function(x){return x.id===id;})); };
  window.orgDelBank       = async function(id) {
    if (!confirm('Remove this bank account?')) return;
    try { await del('/organisation/banks/' + id); } catch(e) { await put('/organisation/banks/' + id, {is_active:0}); }
    toast('Removed', 'info');
    await reload();
  };

  // Document
  window.orgUploadDoc     = function() { docModal(); };
  window.orgDownloadDoc   = async function(id) {
    try {
      const doc = await get('/organisation/documents/' + id);
      if (!doc || !doc.file_data) { toast('File not available', 'error'); return; }
      const link = document.createElement('a');
      link.href     = 'data:' + (doc.mime_type || 'application/octet-stream') + ';base64,' + doc.file_data;
      link.download = doc.doc_name || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch(e) { toast(e.message, 'error'); }
  };
  window.orgDelDoc        = async function(id) {
    if (!confirm('Remove this document?')) return;
    try { await del('/organisation/documents/' + id); } catch(e) { await put('/organisation/documents/' + id, {is_active:0}); }
    toast('Removed', 'info');
    await reload();
  };
}

// ─── Form helpers ───────────────────────────────────────────────
function fg(label, inputHTML, hint) {
  return '<div class="fg'  + '">'
    + '<label class="flabel">' + label + '</label>'
    + inputHTML
    + (hint ? '<div class="field-hint">' + hint + '</div>' : '')
    + '</div>';
}

// ─── Modals ─────────────────────────────────────────────────────
function addressModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Address' : '+ Add Address', size: 'lg',
    body: '<form id="addr-form" class="form-grid-sm">'
      + fg('Address Type *', '<select class="fselect" name="address_type" required>' + opts(ADDR_TYPES, existing && existing.address_type) + '</select>')
      + fg('Primary?', '<select class="fselect" name="is_primary"><option value="0"' + (!existing || !existing.is_primary ? ' selected' : '') + '>No</option><option value="1"' + (existing && existing.is_primary ? ' selected' : '') + '>Yes</option></select>')
      + fg('Address Line 1', '<input class="finput" name="line1" value="' + v(existing && existing.line1) + '">')
      + fg('Address Line 2', '<input class="finput" name="line2" value="' + v(existing && existing.line2) + '">')
      + fg('City', '<input class="finput" name="city" value="' + v(existing && existing.city) + '">')
      + fg('State', '<input class="finput" name="state" value="' + v(existing && existing.state) + '">')
      + fg('Pincode', '<input class="finput" name="pincode" value="' + v(existing && existing.pincode) + '">')
      + fg('Country', '<input class="finput" name="country" value="' + v(existing && existing.country, 'India') + '">')
      + fg('Currency', '<select class="fselect" name="currency">' + opts(CURRENCIES, existing && existing.currency || 'INR') + '</select>')
      + fg('Timezone', '<select class="fselect" name="timezone">' + opts(TIMEZONES, existing && existing.timezone || 'Asia/Kolkata') + '</select>')
      + fg('Hours of Operation', '<input class="finput" name="hours_of_operation" value="' + v(existing && existing.hours_of_operation) + '" placeholder="Mon-Fri 9am-6pm IST">')
      + '</form>',
    submitLabel: isEdit ? 'Save Changes' : 'Add Address',
    onSubmit: async function() {
      const data = fd('addr-form');
      data.is_primary = parseInt(data.is_primary);
      if (isEdit) await put('/organisation/addresses/' + existing.id, data);
      else await post('/organisation/addresses', data);
      toast(isEdit ? 'Updated' : 'Added', 'success');
      await reload();
    }
  });
}

function contactModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Contact' : '+ Add Point of Contact',
    body: '<form id="contact-form" class="form-grid-sm">'
      + fg('Full Name *', '<input class="finput" name="name" value="' + v(existing && existing.name) + '" required>')
      + fg('Designation', '<input class="finput" name="designation" value="' + v(existing && existing.designation) + '" placeholder="CEO, CFO, HR Head">')
      + fg('Department', '<input class="finput" name="department" value="' + v(existing && existing.department) + '">')
      + fg('Email', '<input class="finput" type="email" name="email" value="' + v(existing && existing.email) + '">')
      + fg('Phone', '<input class="finput" name="phone" value="' + v(existing && existing.phone) + '">')
      + fg('Primary?', '<select class="fselect" name="is_primary"><option value="0"' + (!existing || !existing.is_primary ? ' selected' : '') + '>No</option><option value="1"' + (existing && existing.is_primary ? ' selected' : '') + '>Yes — Primary</option></select>')
      + '</form>',
    submitLabel: isEdit ? 'Save Changes' : 'Add Contact',
    onSubmit: async function() {
      const data = fd('contact-form');
      data.is_primary = parseInt(data.is_primary);
      if (isEdit) await put('/organisation/contacts/' + existing.id, data);
      else await post('/organisation/contacts', data);
      toast(isEdit ? 'Updated' : 'Added', 'success');
      await reload();
    }
  });
}

function identityModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Identity' : '+ Add Identity / Statutory Number',
    body: '<form id="id-form" class="form-grid-sm">'
      + fg('ID Type *', '<select class="fselect" name="id_type" required>' + opts(ID_TYPES, existing && existing.id_type) + '</select>')
      + fg('Number *', '<input class="finput" name="id_number" value="' + v(existing && existing.id_number) + '" required style="font-family:monospace">')
      + fg('Issue Date', '<input class="finput" type="date" name="issue_date" value="' + v(existing && (existing.issue_date||'').split('T')[0]) + '">')
      + fg('Expiry Date', '<input class="finput" type="date" name="expiry_date" value="' + v(existing && (existing.expiry_date||'').split('T')[0]) + '">')
      + fg('Issuing Authority', '<input class="finput" name="issuing_authority" value="' + v(existing && existing.issuing_authority) + '">')
      + fg('Notes', '<textarea class="finput" name="notes" rows="2">' + v(existing && existing.notes) + '</textarea>')
      + '</form>',
    submitLabel: isEdit ? 'Save' : 'Add',
    onSubmit: async function() {
      const data = fd('id-form');
      if (isEdit) await put('/organisation/identity/' + existing.id, data);
      else await post('/organisation/identity', data);
      toast(isEdit ? 'Updated' : 'Added', 'success');
      await reload();
    }
  });
}

function regModal(existing, isGst) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Registration' : '+ Add Registration / Licence', size: 'lg',
    body: '<form id="reg-form" class="form-grid-sm">'
      + fg('Type *', '<select class="fselect" name="reg_type" required>' + opts(REG_TYPES, existing && existing.reg_type) + '</select>')
      + fg('Registration Number *', '<input class="finput" name="reg_number" value="' + v(existing && (existing.reg_number || existing.gstin)) + '" required style="font-family:monospace">')
      + fg('State', '<input class="finput" name="state" value="' + v(existing && existing.state) + '" placeholder="e.g. Telangana">')
      + fg('Trade Name', '<input class="finput" name="trade_name" value="' + v(existing && existing.trade_name) + '">')
      + fg('Issuing Authority', '<input class="finput" name="issuing_authority" value="' + v(existing && existing.issuing_authority) + '">')
      + fg('Start Date', '<input class="finput" type="date" name="start_date" value="' + v(existing && (existing.start_date||existing.registration_date||'').split('T')[0]) + '">')
      + fg('Expiry Date', '<input class="finput" type="date" name="expiry_date" value="' + v(existing && (existing.expiry_date||'').split('T')[0]) + '">')
      + fg('Primary?', '<select class="fselect" name="is_primary"><option value="0"' + (!existing || !existing.is_primary ? ' selected' : '') + '>No</option><option value="1"' + (existing && existing.is_primary ? ' selected' : '') + '>Yes</option></select>')
      + fg('Notes', '<textarea class="finput" name="notes" rows="2">' + v(existing && existing.notes) + '</textarea>')
      + '</form>',
    submitLabel: isEdit ? 'Save' : 'Add',
    onSubmit: async function() {
      const data = fd('reg-form');
      data.is_primary = parseInt(data.is_primary || 0);
      if (isEdit) {
        if (isGst || (existing && existing._isGst)) {
          await put('/organisation/gst/' + existing.id, { gstin: data.reg_number, trade_name: data.trade_name, registration_date: data.start_date, is_primary: data.is_primary });
        } else {
          await put('/organisation/registrations/' + existing.id, data);
        }
      } else {
        if (data.reg_type === 'GST') {
          await post('/organisation/gst', { gstin: data.reg_number, trade_name: data.trade_name, registration_date: data.start_date, is_primary: data.is_primary });
        } else {
          await post('/organisation/registrations', data);
        }
      }
      toast(isEdit ? 'Updated' : 'Added', 'success');
      await reload();
    }
  });
}

function bankModal(existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Bank Account' : '+ Add Bank Account', size: 'lg',
    body: '<form id="bank-form" class="form-grid-sm">'
      + fg('Account Name *', '<input class="finput" name="account_name" value="' + v(existing && existing.account_name) + '" required placeholder="Name on account">')
      + fg('Bank Name *', '<input class="finput" name="bank_name" value="' + v(existing && existing.bank_name) + '" required>')
      + fg('Branch', '<input class="finput" name="branch" value="' + v(existing && existing.branch) + '">')
      + fg('Account Number *', '<input class="finput" name="account_number" value="' + v(existing && existing.account_number) + '" required style="font-family:monospace">')
      + fg('IFSC Code', '<input class="finput" name="ifsc_code" value="' + v(existing && existing.ifsc_code) + '" style="font-family:monospace">')
      + fg('SWIFT / BIC', '<input class="finput" name="swift_code" value="' + v(existing && existing.swift_code) + '" style="font-family:monospace">')
      + fg('Account Type', '<select class="fselect" name="account_type">' + opts(ACC_TYPES, existing && existing.account_type || 'Current') + '</select>')
      + fg('Currency', '<select class="fselect" name="currency">' + opts(CURRENCIES, existing && existing.currency || 'INR') + '</select>')
      + fg('Purpose', '<input class="finput" name="purpose" value="' + v(existing && existing.purpose) + '" placeholder="Payroll, Operations, Tax">')
      + fg('Primary?', '<select class="fselect" name="is_primary"><option value="0"' + (!existing || !existing.is_primary ? ' selected' : '') + '>No</option><option value="1"' + (existing && existing.is_primary ? ' selected' : '') + '>Yes</option></select>')
      + '</form>',
    submitLabel: isEdit ? 'Save' : 'Add',
    onSubmit: async function() {
      const data = fd('bank-form');
      data.is_primary = parseInt(data.is_primary || 0);
      if (isEdit) await put('/organisation/banks/' + existing.id, data);
      else await post('/organisation/banks', data);
      toast(isEdit ? 'Updated' : 'Added', 'success');
      await reload();
    }
  });
}

function docModal() {
  openModal({
    title: '📎 Upload Document',
    body: '<form id="doc-form" class="form-grid-sm">'
      + fg('Document Type *', '<select class="fselect" name="doc_type" required>' + opts(DOC_TYPES, null) + '</select>')
      + fg('Document Name *', '<input class="finput" name="doc_name" required placeholder="e.g. GST Certificate 2024-25">')
      + fg('Select File *', '<input type="file" class="finput" id="doc-file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx"><div class="field-hint">Max 5MB. PDF, Word, Excel, Images.</div>')
      + fg('Expiry Date', '<input class="finput" type="date" name="expiry_date">')
      + fg('Notes', '<input class="finput" name="notes" placeholder="Optional notes">')
      + '</form>',
    submitLabel: 'Upload',
    onSubmit: async function() {
      const data = fd('doc-form');
      const fi   = document.getElementById('doc-file');
      const file = fi && fi.files[0];
      if (!file) { toast('Please select a file', 'error'); return false; }
      if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5MB)', 'error'); return false; }
      const base64    = await readFileBase64(file);
      data.file_data  = base64;
      data.file_size  = (file.size / 1024).toFixed(1) + ' KB';
      data.mime_type  = file.type;
      if (!data.doc_name) data.doc_name = file.name;
      await post('/organisation/documents', data);
      toast('Document uploaded', 'success');
      await reload();
    }
  });
}

// ─── Utilities ──────────────────────────────────────────────────
function readFileBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload  = function() { resolve(reader.result.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function reload() {
  const org = await get('/organisation');
  _org = org;
  renderPage(org);
}

// organisation.js only handles /organisation/profile
// Business Units, Departments, etc. are in orgstructure.js
