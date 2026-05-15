import { get, post, put }  from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable, renderPagination } from '../ui.js';
import { navigate }        from '../router.js';

export async function renderList() {
  setPageTitle('Clients', 'Client accounts');
  setBreadcrumb([{ label: 'Clients' }]);
  showLoader();
  try {
    const data = await get('/clients');
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <input class="search-input" id="client-search" placeholder="Search clients…" type="search">
          <button class="btn btn-primary" onclick="navigateTo('/clients/new')">+ New Client</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Client',   key: 'name',          render: r => `<strong>${r.name}</strong>${r.industry?`<div class="cell-sub">${r.industry}</div>`:''}`},
            { label: 'Type',     key: 'type',           render: r => r.type||'Direct' },
            { label: 'Projects', key: 'project_count' },
            { label: 'Invoiced', key: 'total_billed',   render: r => fmt.money(r.total_billed) },
            { label: 'Status',   key: 'status',         render: r => badge(r.status) },
            { label: 'GSTIN',    key: 'gstin',          render: r => `<span class="mono">${r.gstin||'—'}</span>` },
          ],
          rows,
          onRowClick: r => navigate(`/clients/${r.id}`),
          emptyMessage: 'No clients found',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderNew() {
  setPageTitle('New Client', '');
  setBreadcrumb([{ label: 'Clients', url: '/clients' }, { label: 'New' }]);
  const masters = await get('/masters/all');
  setContent(`
    <div class="page-body"><div class="card form-card">
      <div class="card-header"><h3 class="card-title">New Client</h3></div>
      <form id="client-form" class="form-grid">
        <div class="fg"><label class="flabel">Client Name *</label><input class="finput" name="name" required></div>
        <div class="fg"><label class="flabel">Legal Name</label><input class="finput" name="legal_name"></div>
        <div class="fg"><label class="flabel">Type</label>
          <select class="fselect" name="type">
            ${['Direct','MSP','VMS','Referral'].map(t=>`<option>${t}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Industry</label><input class="finput" name="industry"></div>
        <div class="fg"><label class="flabel">PAN</label><input class="finput" name="pan" class="mono"></div>
        <div class="fg"><label class="flabel">GSTIN</label><input class="finput" name="gstin" class="mono"></div>
        <div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="email"></div>
        <div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone"></div>
        <div class="fg"><label class="flabel">Website</label><input class="finput" type="url" name="website"></div>
        <div class="fg"><label class="flabel">Payment Terms</label>
          <select class="fselect" name="payment_terms_id">
            <option value="">Select…</option>
            ${(masters['payment-terms']||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Credit Limit (₹)</label><input class="finput" type="number" name="credit_limit"></div>
        <div class="fg"><label class="flabel">Account Manager</label>
          <select class="fselect" name="account_manager_id">
            <option value="">Select…</option>
            ${(masters['employees-lookup']||[]).map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}
          </select></div>
        <div class="form-section-title">Address</div>
        <div class="fg"><label class="flabel">Address</label><input class="finput" name="address"></div>
        <div class="fg"><label class="flabel">City</label><input class="finput" name="city"></div>
        <div class="fg"><label class="flabel">State</label><input class="finput" name="state"></div>
        <div class="fg"><label class="flabel">Pincode</label><input class="finput" name="pincode"></div>
      </form>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="navigateTo('/clients')">Cancel</button>
        <button class="btn btn-primary" onclick="window._saveClient()">Save Client</button>
      </div>
    </div></div>`);

  window._saveClient = async () => {
    const data = Object.fromEntries(new FormData(document.getElementById('client-form')));
    Object.keys(data).forEach(k => { if (data[k]==='') data[k]=null; });
    try {
      const res = await post('/clients', data);
      toast('Client created', 'success');
      navigate(`/clients/${res.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const client = await get(`/clients/${id}`);
    setPageTitle(client.name, 'Client profile');
    setBreadcrumb([{ label: 'Clients', url: '/clients' }, { label: client.name }]);
    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card profile-card">
            <div class="profile-hero">
              <div class="av av-lg av-blue">${fmt.ini(client.name)}</div>
              <div class="profile-name">${client.name}</div>
              <div class="profile-title">${client.industry||'—'}</div>
              ${badge(client.status)}
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>Type</span><strong>${client.type||'Direct'}</strong></div>
              <div class="meta-row"><span>PAN</span><strong class="mono">${client.pan||'—'}</strong></div>
              <div class="meta-row"><span>GSTIN</span><strong class="mono">${client.gstin||'—'}</strong></div>
              <div class="meta-row"><span>Email</span><strong>${client.email||'—'}</strong></div>
              <div class="meta-row"><span>Phone</span><strong>${client.phone||'—'}</strong></div>
            </div>
          </div>
        </div>
        <div class="detail-main">
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3 class="card-title">Projects (${client.projects?.length||0})</h3>
              <button class="btn btn-ghost btn-sm">+ New Project</button></div>
            ${client.projects?.length ? `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Status</th></tr></thead>
              <tbody>${client.projects.map(p=>`<tr onclick="navigateTo('/projects/${p.id}')" class="tbl-clickable">
                <td class="mono">${p.code||'—'}</td><td>${p.name}</td><td>${badge(p.status)}</td>
              </tr>`).join('')}</tbody></table></div>` : `<div class="empty-mini">No projects</div>`}
          </div>
          <div class="card">
            <div class="card-header"><h3 class="card-title">Recent Invoices</h3>
              <a href="#/invoices?client_id=${id}" class="card-link">View all →</a></div>
            ${client.invoices?.length ? `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Invoice #</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>${client.invoices.map(i=>`<tr onclick="navigateTo('/invoices/${i.id}')" class="tbl-clickable">
                <td class="mono">${i.invoice_number}</td>
                <td>${fmt.date(i.invoice_date)}</td>
                <td class="mono fw-bold">${fmt.money(i.total_amount)}</td>
                <td>${badge(i.status)}</td>
              </tr>`).join('')}</tbody></table></div>` : `<div class="empty-mini">No invoices</div>`}
          </div>
        </div>
      </div>`);
  } catch (e) { showError(e.message); }
}
