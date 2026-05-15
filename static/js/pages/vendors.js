import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData, debounce } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

let _page=1, _search='';
export async function renderVendors() {
  const data = await API.vendors({ page:_page, per_page:25, q:_search });
  if (!data) return;
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Vendors <span style="font-size:14px;font-weight:400;color:var(--txt2)">(${data.total})</span></div>
      <button class="btn btn-primary" onclick="window._newVendor()">+ Add Vendor</button>
    </div>
    <div class="filter-bar">
      <input class="input search-input" placeholder="Search vendors…" value="${_search}" oninput="window._vSearch(this.value)">
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Name</th><th>Category</th><th>Email</th><th>PAN</th><th>Status</th></tr></thead>
        <tbody>
          ${(data.items||[]).map(v=>`<tr>
            <td><strong>${v.name}</strong></td>
            <td>${v.category_name||'—'}</td>
            <td>${v.email||'—'}</td>
            <td class="td-mono">${v.pan||'—'}</td>
            <td>${pillStatus(v.status)}</td>
          </tr>`).join('')}
          ${!data.items?.length?'<tr><td colspan="5"><div class="empty-state"><div class="empty-state-title">No vendors</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
  window._vSearch = debounce(v=>{_search=v;_page=1;renderVendors();},300);
  window._newVendor = () => {
    showModal({ title:'New Vendor', body:`<form id="vf"><div class="form-grid">
      <div class="field"><label class="label">Name *</label><input class="input" name="name" required></div>
      <div class="field"><label class="label">Category</label>
        <select class="select" name="category_id">${buildOptions(getMaster('vendor-categories'),'id','name','','Select')}</select></div>
      <div class="field"><label class="label">Email</label><input class="input" type="email" name="email"></div>
      <div class="field"><label class="label">Phone</label><input class="input" name="phone"></div>
      <div class="field"><label class="label">PAN</label><input class="input" name="pan"></div>
      <div class="field"><label class="label">GSTIN</label><input class="input" name="gstin"></div>
    </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveVendor()">Create</button>`,
    });
    window._saveVendor = async () => {
      try { await API.vendorCreate(getFormData(document.getElementById('vf')));
        toast('Vendor created','success'); closeModal(); renderVendors();
      } catch(e) { toast(e.message,'error'); }
    };
  };
}
