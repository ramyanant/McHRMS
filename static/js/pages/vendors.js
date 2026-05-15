import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

function v(val,fb='') { return val==null?fb:String(val).replace(/"/g,'&quot;'); }
function fd(id) {
  const d=Object.fromEntries(new FormData(document.getElementById(id)));
  Object.keys(d).forEach(k=>{if(d[k]==='')d[k]=null;});
  return d;
}

export async function renderList() {
  setPageTitle('Vendors', 'Vendor & partner management');
  setBreadcrumb([{ label: 'Vendors' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([get('/vendors'), get('/masters/all')]);
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <input class="search-input" id="vendor-search" placeholder="Search vendors…" type="search">
          <button class="btn btn-primary" onclick="window._addVendor()">+ New Vendor</button>
        </div>
        <div class="card">
          <div class="tbl-wrap"><table class="data-table">
            <thead><tr><th>Vendor</th><th>Category</th><th>Contact</th><th>City</th><th>SLA</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${rows.map(v=>`<tr>
              <td>
                <div class="cell-person">
                  <div class="av av-sm av-purple">${fmt.ini(v.name)}</div>
                  <div>
                    <div class="cell-name">${v.name}</div>
                    <div class="cell-sub mono">${v.gstin||v.pan||''}</div>
                  </div>
                </div>
              </td>
              <td>${v.category_name||'—'}</td>
              <td>
                ${v.primary_contact?`<div>${v.primary_contact}</div>`:''}
                ${v.contact_email?`<div class="cell-sub">${v.contact_email}</div>`:'—'}
              </td>
              <td>${v.city||'—'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="width:40px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
                    <div style="width:${v.sla_score||90}%;height:100%;background:${(v.sla_score||90)>=80?'var(--green)':'var(--amber)'};border-radius:3px"></div>
                  </div>
                  <span style="font-size:11px">${v.sla_score||90}%</span>
                </div>
              </td>
              <td>${badge(v.status||'Active')}</td>
              <td class="tbl-actions">
                <button class="btn btn-ghost btn-sm" onclick="navigateTo('/vendors/${v.id}')">View</button>
                <button class="btn btn-ghost btn-sm" onclick="window._editVendorFromList(${v.id})">✏</button>
              </td>
            </tr>`).join('')||'<tr><td colspan="7" class="text-muted" style="text-align:center;padding:32px">No vendors found</td></tr>'}
            </tbody></table></div>
        </div>
      </div>`);
    window._addVendor = () => vendorModal(null, masters);
    window._editVendorFromList = async (id) => {
      const [vnd, m] = await Promise.all([get(`/vendors/${id}`), get('/masters/all')]);
      vendorModal(vnd, m);
    };
  } catch(e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [vendor, masters] = await Promise.all([get(`/vendors/${id}`), get('/masters/all')]);
    setPageTitle(vendor.name, 'Vendor');
    setBreadcrumb([{ label:'Vendors', url:'/vendors' }, { label: vendor.name }]);
    function f(l,val,mono=false) {
      return `<div class="field-item"><div class="field-label">${l}</div>
        <div class="field-value${!val?' empty':''}${mono?' mono':''}">${val||'—'}</div></div>`;
    }
    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card">
            <div class="profile-hero" style="background:linear-gradient(135deg,#7c3aed,#5b21b6)">
              <div class="av av-xl av-purple" style="margin:0 auto 10px">${fmt.ini(vendor.name)}</div>
              <div class="profile-name">${vendor.name}</div>
              <div class="profile-title" style="color:rgba(255,255,255,.75)">${vendor.category_name||'Vendor'}</div>
              <div style="margin-top:8px">${badge(vendor.status||'Active')}</div>
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>Contact</span><strong>${vendor.primary_contact||'—'}</strong></div>
              <div class="meta-row"><span>Email</span><strong>${vendor.contact_email||'—'}</strong></div>
              <div class="meta-row"><span>Phone</span><strong>${vendor.contact_phone||'—'}</strong></div>
              <div class="meta-row"><span>GSTIN</span><strong class="mono">${vendor.gstin||'—'}</strong></div>
              <div class="meta-row"><span>PAN</span><strong class="mono">${vendor.pan||'—'}</strong></div>
              <div class="meta-row"><span>SLA Score</span><strong>${vendor.sla_score||90}%</strong></div>
            </div>
            <div style="padding:0 16px 16px">
              <button class="btn btn-primary btn-full" onclick="window._editVendor()">✏ Edit</button>
            </div>
          </div>
        </div>
        <div class="detail-main">
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3 class="card-title">🏢 Details</h3></div>
            <div class="card-body"><div class="field-grid">
              ${f('City', vendor.city)} ${f('State', vendor.state_name)}
              ${f('Address', vendor.address_line1)} ${f('Pincode', vendor.pincode, true)}
              ${f('Contract End', fmt.date(vendor.contract_end))}
              ${f('Account Manager', vendor.account_manager_name)}
            </div></div>
          </div>
          <div class="card">
            <div class="card-header"><h3 class="card-title">🏦 Banking</h3></div>
            <div class="card-body"><div class="field-grid">
              ${f('Bank', vendor.bank_name)} ${f('Branch', vendor.bank_branch)}
              ${f('Account', vendor.bank_account_number, true)} ${f('IFSC', vendor.bank_ifsc, true)}
              ${f('Account Type', vendor.bank_account_type)}
            </div></div>
          </div>
        </div>
      </div>`);
    window._editVendor = () => vendorModal(vendor, masters);
  } catch(e) { showError(e.message); }
}

function vendorModal(existing, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? `✏ Edit: ${existing.name}` : '+ New Vendor',
    size: 'lg',
    body: `<form id="vendor-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="fg full"><label class="flabel">Vendor Name *</label>
        <input class="finput" name="name" value="${v(existing?.name)}" required></div>
      <div class="fg"><label class="flabel">Category</label>
        <select class="fselect" name="category_id">
          <option value="">Select…</option>
          ${(masters['vendor-categories']||[]).map(c=>`<option value="${c.id}" ${existing?.category_id==c.id?'selected':''}>${c.name}</option>`).join('')}
        </select></div>
      <div class="fg"><label class="flabel">Status</label>
        <select class="fselect" name="status">
          ${['Active','Inactive','Blacklisted'].map(s=>`<option ${(existing?.status||'Active')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div style="grid-column:1/-1;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);padding-top:8px;border-top:1px solid var(--border)">Contact</div>
      <div class="fg"><label class="flabel">Contact Name</label>
        <input class="finput" name="primary_contact" value="${v(existing?.primary_contact)}"></div>
      <div class="fg"><label class="flabel">Designation</label>
        <input class="finput" name="primary_contact_designation" value="${v(existing?.primary_contact_designation)}"></div>
      <div class="fg"><label class="flabel">Email</label>
        <input class="finput" type="email" name="contact_email" value="${v(existing?.contact_email)}"></div>
      <div class="fg"><label class="flabel">Phone</label>
        <input class="finput" name="contact_phone" value="${v(existing?.contact_phone)}"></div>
      <div style="grid-column:1/-1;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);padding-top:8px;border-top:1px solid var(--border)">Address & Compliance</div>
      <div class="fg full"><label class="flabel">Address</label>
        <input class="finput" name="address_line1" value="${v(existing?.address_line1)}"></div>
      <div class="fg"><label class="flabel">City</label>
        <input class="finput" name="city" value="${v(existing?.city)}"></div>
      <div class="fg"><label class="flabel">PAN</label>
        <input class="finput mono" name="pan" value="${v(existing?.pan)}"></div>
      <div class="fg"><label class="flabel">GSTIN</label>
        <input class="finput mono" name="gstin" value="${v(existing?.gstin)}"></div>
      <div class="fg"><label class="flabel">SLA Score</label>
        <input class="finput" type="number" name="sla_score" min="0" max="100" value="${v(existing?.sla_score,90)}"></div>
      <div class="fg"><label class="flabel">Contract End</label>
        <input class="finput" type="date" name="contract_end" value="${v(existing?.contract_end||'').split('T')[0]}"></div>
      <div style="grid-column:1/-1;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--txt3);padding-top:8px;border-top:1px solid var(--border)">Banking</div>
      <div class="fg"><label class="flabel">Bank Name</label>
        <input class="finput" name="bank_name" value="${v(existing?.bank_name)}"></div>
      <div class="fg"><label class="flabel">Account Number</label>
        <input class="finput mono" name="bank_account_number" value="${v(existing?.bank_account_number)}"></div>
      <div class="fg"><label class="flabel">IFSC</label>
        <input class="finput mono" name="bank_ifsc" value="${v(existing?.bank_ifsc)}"></div>
      <div class="fg"><label class="flabel">Account Type</label>
        <select class="fselect" name="bank_account_type">
          ${['Current','Savings','CC'].map(t=>`<option ${(existing?.bank_account_type||'Current')===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
    </form>`,
    submitLabel: isEdit ? 'Save Changes' : 'Create Vendor',
    onSubmit: async () => {
      const data = fd('vendor-form');
      if (isEdit) await put(`/vendors/${existing.id}`, data);
      else        await post('/vendors', data);
      toast(isEdit ? 'Vendor updated' : 'Vendor created', 'success');
      if (isEdit) renderDetail({ id: existing.id });
      else        renderList();
    }
  });
}
