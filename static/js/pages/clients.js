import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData, debounce } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

let _page=1, _search='';
export async function renderClients() {
  const data = await API.clients({ page:_page, per_page:25, q:_search });
  if (!data) return;
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Clients <span style="font-size:14px;font-weight:400;color:var(--txt2)">(${data.total})</span></div>
      <button class="btn btn-primary" onclick="window._newClient()">+ Add Client</button>
    </div>
    <div class="filter-bar">
      <input class="input search-input" placeholder="Search clients…" value="${_search}" oninput="window._clientSearch(this.value)">
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Name</th><th>Type</th><th>City</th><th>Projects</th><th>Billed</th><th>Status</th></tr></thead>
        <tbody>
          ${(data.items||[]).map(c=>`<tr style="cursor:pointer" onclick="window.go('/clients/${c.id}')">
            <td><strong>${c.name}</strong><br><small style="color:var(--txt3)">${c.email||c.pan||''}</small></td>
            <td>${c.type||'—'}</td><td>${c.city||'—'}</td>
            <td>${c.project_count||0}</td><td>${fmt.inr(c.total_billed)}</td>
            <td>${pillStatus(c.status)}</td>
          </tr>`).join('')}
          ${!data.items?.length?'<tr><td colspan="6"><div class="empty-state"><div class="empty-state-title">No clients</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
  window._clientSearch = debounce(v=>{_search=v;_page=1;renderClients();},300);
  window._newClient = () => {
    showModal({title:'New Client',size:'modal-lg',
      body:`<form id="cf"><div class="form-grid">
        <div class="field"><label class="label">Name *</label><input class="input" name="name" required></div>
        <div class="field"><label class="label">Legal Name</label><input class="input" name="legal_name"></div>
        <div class="field"><label class="label">Type</label><select class="select" name="type"><option>Direct</option><option>Indirect</option></select></div>
        <div class="field"><label class="label">Industry</label><input class="input" name="industry"></div>
        <div class="field"><label class="label">Email</label><input class="input" type="email" name="email"></div>
        <div class="field"><label class="label">Phone</label><input class="input" name="phone"></div>
        <div class="field"><label class="label">PAN</label><input class="input" name="pan"></div>
        <div class="field"><label class="label">GSTIN</label><input class="input" name="gstin"></div>
        <div class="field form-full"><label class="label">Address</label><input class="input" name="address"></div>
        <div class="field"><label class="label">City</label><input class="input" name="city"></div>
        <div class="field"><label class="label">State</label><input class="input" name="state"></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveClient()">Create</button>`,
    });
    window._saveClient = async () => {
      try { const r=await API.clientCreate(getFormData(document.getElementById('cf')));
        toast('Client created','success'); closeModal(); window.go(`/clients/${r.id}`);
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderClientDetail(id) {
  const c = await API.client(id);
  if (!c) return;
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">${c.name}</div>
      <button class="btn btn-primary" onclick="window.go('/invoices/new?client=${id}')">+ Create Invoice</button>
    </div>
    <div class="card" style="margin-bottom:20px;padding:20px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
        <div><div class="org-field-label">Type</div><div class="org-field-value">${c.type||'—'}</div></div>
        <div><div class="org-field-label">PAN</div><div class="org-field-value td-mono">${c.pan||'—'}</div></div>
        <div><div class="org-field-label">GSTIN</div><div class="org-field-value td-mono">${c.gstin||'—'}</div></div>
        <div><div class="org-field-label">Status</div><div>${pillStatus(c.status)}</div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header"><div class="card-title">Projects</div></div>
        <div class="table-container"><table>
          <thead><tr><th>Code</th><th>Name</th><th>Status</th></tr></thead>
          <tbody>${(c.projects||[]).map(p=>`<tr><td class="td-mono">${p.code||'—'}</td><td>${p.name}</td><td>${pillStatus(p.status)}</td></tr>`).join('')}
          ${!c.projects?.length?'<tr><td colspan="3" style="text-align:center;color:var(--txt3)">No projects</td></tr>':''}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Recent Invoices</div></div>
        <div class="table-container"><table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>${(c.invoices||[]).map(i=>`<tr>
            <td><a href="#/invoices/${i.id}" class="td-mono">${i.invoice_number}</a></td>
            <td>${fmt.date(i.invoice_date)}</td><td>${fmt.inr(i.total_amount)}</td>
            <td>${pillStatus(i.status)}</td>
          </tr>`).join('')}
          ${!c.invoices?.length?'<tr><td colspan="4" style="text-align:center;color:var(--txt3)">No invoices</td></tr>':''}</tbody>
        </table></div>
      </div>
    </div>
  `);
}
