import { get, post, put }  from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable } from '../ui.js';
import { navigate }        from '../router.js';

export async function renderList() {
  setPageTitle('Vendors', 'Vendor management');
  setBreadcrumb([{ label: 'Vendors' }]);
  showLoader();
  try {
    const data = await get('/vendors');
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <input class="search-input" placeholder="Search vendors…" type="search">
          <button class="btn btn-primary" onclick="window._addVendor()">+ New Vendor</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Vendor',    key: 'name',          render: r => `<strong>${r.name}</strong>` },
            { label: 'Category',  key: 'category_name', render: r => r.category_name||'—' },
            { label: 'PAN',       key: 'pan',           render: r => `<span class="mono">${r.pan||'—'}</span>` },
            { label: 'GSTIN',     key: 'gstin',         render: r => `<span class="mono">${r.gstin||'—'}</span>` },
            { label: 'Status',    key: 'status',        render: r => badge(r.status) },
          ],
          rows,
          onRowClick: r => navigate(`/vendors/${r.id}`),
          emptyMessage: 'No vendors found',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const v = await get(`/vendors/${id}`);
    setPageTitle(v.name, 'Vendor');
    setBreadcrumb([{ label: 'Vendors', url: '/vendors' }, { label: v.name }]);
    setContent(`<div class="page-body"><div class="card form-card">
      <div class="card-header"><h3 class="card-title">${v.name}</h3>${badge(v.status)}</div>
      <div class="card-body">
        <div class="field-grid">
          ${fld('Category',  v.category_name)}${fld('PAN', v.pan)}
          ${fld('GSTIN',    v.gstin)}${fld('Email', v.email)}
          ${fld('Phone',    v.phone)}${fld('Website', v.website)}
          ${fld('City',     v.city)}${fld('State', v.state)}
        </div>
      </div>
    </div></div>`);
  } catch (e) { showError(e.message); }
}

function fld(l, v) { return `<div class="field-item"><div class="field-label">${l}</div><div class="field-value${!v?' empty':''}">${v||'—'}</div></div>`; }
