import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

export async function renderOrganisation(tab = 'profile') {
  const tabs = [
    ['profile',        'Organisation Profile'],
    ['business-units', 'Business Units'],
    ['departments',    'Departments'],
    ['cost-centres',   'Cost Centres'],
    ['locations',      'Locations'],
  ];
  const tabHtml = `<div class="tabs" style="margin-bottom:20px">
    ${tabs.map(([id,label])=>`<div class="tab-item ${tab===id?'active':''}" onclick="window.go('/organisation/${id}')">${label}</div>`).join('')}
  </div>`;

  if (tab === 'profile')        return renderOrgProfile(tabHtml);
  if (tab === 'business-units') return renderBUs(tabHtml);
  if (tab === 'departments')    return renderDepts(tabHtml);
  if (tab === 'cost-centres')   return renderCCs(tabHtml);
  if (tab === 'locations')      return renderLocations(tabHtml);
}

async function renderOrgProfile(tabHtml) {
  const org = await API.org();
  setContent(`${tabHtml}
    <div class="card">
      <div class="card-header">
        <div class="card-title">🏢 Organisation Details</div>
        <button class="btn btn-primary btn-sm" onclick="window._editOrg()">✏ Edit</button>
      </div>
      <div class="section-fields">
        ${[['Legal Name',org?.legal_name],['Type',org?.type],['PAN',org?.pan],['TAN',org?.tan],
           ['CIN',org?.cin],['Website',org?.website],['Email',org?.email],['Phone',org?.phone],
           ['City',org?.city],['State',org?.state],['Country',org?.country]
          ].map(([l,v])=>`<div><div class="org-field-label">${l}</div><div class="org-field-value ${!v?'empty':''}">${v||'—'}</div></div>`).join('')}
      </div>
    </div>
  `);
  window._editOrg = () => {
    showModal({ title:'Edit Organisation', size:'modal-lg',
      body:`<form id="of"><div class="form-grid">
        <div class="field"><label class="label">Name *</label><input class="input" name="name" value="${org?.name||''}"></div>
        <div class="field"><label class="label">Legal Name</label><input class="input" name="legal_name" value="${org?.legal_name||''}"></div>
        <div class="field"><label class="label">PAN</label><input class="input" name="pan" value="${org?.pan||''}"></div>
        <div class="field"><label class="label">TAN</label><input class="input" name="tan" value="${org?.tan||''}"></div>
        <div class="field"><label class="label">CIN</label><input class="input" name="cin" value="${org?.cin||''}"></div>
        <div class="field"><label class="label">Website</label><input class="input" name="website" value="${org?.website||''}"></div>
        <div class="field"><label class="label">Email</label><input class="input" name="email" value="${org?.email||''}"></div>
        <div class="field"><label class="label">Phone</label><input class="input" name="phone" value="${org?.phone||''}"></div>
        <div class="field form-full"><label class="label">Address</label><input class="input" name="address_line1" value="${org?.address_line1||''}"></div>
        <div class="field"><label class="label">City</label><input class="input" name="city" value="${org?.city||''}"></div>
        <div class="field"><label class="label">State</label><input class="input" name="state" value="${org?.state||''}"></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveOrg()">Save</button>`,
    });
    window._saveOrg = async () => {
      try { await API.orgSave(getFormData(document.getElementById('of')));
        toast('Saved','success'); closeModal(); renderOrganisation('profile');
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

async function renderBUs(tabHtml) {
  const rows = await API.busUnits() || [];
  setContent(`${tabHtml}
    <div class="toolbar">
      <div class="toolbar-title">Business Units</div>
      <button class="btn btn-primary btn-sm" onclick="window._newBU()">+ Add BU</button>
    </div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Name</th><th>Code</th><th>Departments</th><th>Headcount</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(b=>`<tr>
          <td><strong>${b.name}</strong></td><td class="td-mono">${b.code||'—'}</td>
          <td>${b.dept_count||0}</td><td>${b.headcount||0}</td>
          <td>${pillStatus(b.is_active?'Active':'Inactive')}</td>
        </tr>`).join('')}
        ${!rows.length?'<tr><td colspan="5"><div class="empty-state"><div class="empty-state-title">No business units</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
  window._newBU = () => {
    showModal({ title:'New Business Unit',
      body:`<form id="bf"><div class="form-grid">
        <div class="field"><label class="label">Name *</label><input class="input" name="name" required></div>
        <div class="field"><label class="label">Code</label><input class="input" name="code"></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveBU()">Create</button>`,
    });
    window._saveBU = async () => {
      try { await API.buSave(getFormData(document.getElementById('bf')));
        toast('Created','success'); closeModal(); renderOrganisation('business-units');
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

async function renderDepts(tabHtml) {
  const rows = await API.departments() || [];
  setContent(`${tabHtml}
    <div class="toolbar">
      <div class="toolbar-title">Departments</div>
      <button class="btn btn-primary btn-sm" onclick="window._newDept()">+ Add Department</button>
    </div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Name</th><th>Code</th><th>Business Unit</th><th>Cost Centre</th><th>Headcount</th></tr></thead>
      <tbody>
        ${rows.map(d=>`<tr><td><strong>${d.name}</strong></td><td class="td-mono">${d.code||'—'}</td>
          <td>${d.bu_name||'—'}</td><td>${d.cc_name||'—'}</td><td>${d.headcount||0}</td></tr>`).join('')}
        ${!rows.length?'<tr><td colspan="5"><div class="empty-state"><div class="empty-state-title">No departments</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
  window._newDept = () => {
    showModal({ title:'New Department', body:`<form id="df"><div class="form-grid">
      <div class="field"><label class="label">Name *</label><input class="input" name="name" required></div>
      <div class="field"><label class="label">Code</label><input class="input" name="code"></div>
      <div class="field"><label class="label">Business Unit *</label>
        <select class="select" name="business_unit_id">${buildOptions(getMaster('business-units'),'id','name','','Select BU')}</select></div>
      <div class="field"><label class="label">Cost Centre</label>
        <select class="select" name="cost_centre_id">${buildOptions(getMaster('cost-centres'),'id','name','','Select CC')}</select></div>
    </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveDept()">Create</button>`,
    });
    window._saveDept = async () => {
      try { await API.deptSave(getFormData(document.getElementById('df')));
        toast('Created','success'); closeModal(); renderOrganisation('departments');
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

async function renderCCs(tabHtml) {
  const rows = await API.costCentres() || [];
  setContent(`${tabHtml}
    <div class="toolbar">
      <div class="toolbar-title">Cost Centres</div>
      <button class="btn btn-primary btn-sm" onclick="window._newCC()">+ Add Cost Centre</button>
    </div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Name</th><th>Code</th><th>Business Unit</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(c=>`<tr><td><strong>${c.name}</strong></td><td class="td-mono">${c.code||'—'}</td>
          <td>${c.bu_name||'—'}</td><td>${pillStatus(c.is_active?'Active':'Inactive')}</td></tr>`).join('')}
        ${!rows.length?'<tr><td colspan="4"><div class="empty-state"><div class="empty-state-title">No cost centres</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
  window._newCC = () => {
    showModal({ title:'New Cost Centre', body:`<form id="ccf"><div class="form-grid">
      <div class="field"><label class="label">Name *</label><input class="input" name="name" required></div>
      <div class="field"><label class="label">Code</label><input class="input" name="code"></div>
      <div class="field"><label class="label">Business Unit</label>
        <select class="select" name="bu_id">${buildOptions(getMaster('business-units'),'id','name','','Select BU')}</select></div>
    </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveCC()">Create</button>`,
    });
    window._saveCC = async () => {
      try { await API.ccSave(getFormData(document.getElementById('ccf')));
        toast('Created','success'); closeModal(); renderOrganisation('cost-centres');
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

async function renderLocations(tabHtml) {
  const rows = await API.locations() || [];
  setContent(`${tabHtml}
    <div class="toolbar">
      <div class="toolbar-title">Office Locations</div>
      <button class="btn btn-primary btn-sm" onclick="window._newLoc()">+ Add Location</button>
    </div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Name</th><th>Code</th><th>City</th><th>State</th><th>HQ</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(l=>`<tr><td><strong>${l.name}</strong></td><td class="td-mono">${l.code||'—'}</td>
          <td>${l.city||'—'}</td><td>${l.state||'—'}</td>
          <td>${l.is_hq?'<span class="pill pill-green">HQ</span>':'—'}</td>
          <td>${pillStatus(l.is_active?'Active':'Inactive')}</td></tr>`).join('')}
        ${!rows.length?'<tr><td colspan="6"><div class="empty-state"><div class="empty-state-title">No locations</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
  window._newLoc = () => {
    showModal({ title:'New Location', body:`<form id="lf"><div class="form-grid">
      <div class="field"><label class="label">Name *</label><input class="input" name="name" required></div>
      <div class="field"><label class="label">Code</label><input class="input" name="code"></div>
      <div class="field form-full"><label class="label">Address</label><input class="input" name="address"></div>
      <div class="field"><label class="label">City</label><input class="input" name="city"></div>
      <div class="field"><label class="label">State</label><input class="input" name="state"></div>
      <div class="field"><label class="label">Pincode</label><input class="input" name="pincode"></div>
      <div class="field"><label class="label">Headquarters?</label>
        <select class="select" name="is_hq"><option value="false">No</option><option value="true">Yes</option></select></div>
    </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveLoc()">Create</button>`,
    });
    window._saveLoc = async () => {
      try { await API.locationSave(getFormData(document.getElementById('lf')));
        toast('Created','success'); closeModal(); renderOrganisation('locations');
      } catch(e) { toast(e.message,'error'); }
    };
  };
}
