/**
 * Clients — Full LinkedIn-style, no backticks, row click → detail, inline edit, Documents tab
 */
import { get, post, put } from '../api.js';
import { logoUploaderHtml } from '../logoup.js?v=20260521g';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

function v(val,fb){if(val===null||val===undefined)return fb!==undefined?fb:'';return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fd(id){const d=Object.fromEntries(new FormData(document.getElementById(id)));Object.keys(d).forEach(k=>{if(d[k]==='')d[k]=null;});return d;}
function opts(arr,sel,vk,lk){return arr.map(i=>{const val=typeof i==='string'?i:i[vk||'id'];const lbl=typeof i==='string'?i:i[lk||'name'];return '<option value="'+v(val)+'"'+(String(val)===String(sel)?' selected':'')+'>'+v(lbl)+'</option>';}).join('');}
function fld(l,val,mono){return '<div class="field-item"><div class="field-label">'+l+'</div><div class="field-value'+(val?'':' empty')+(mono?' mono':'')+'">'+v(val,'—')+'</div></div>';}

const INDUSTRIES  = ['IT & Technology','Staffing & Recruitment','BFSI','Healthcare','Manufacturing','Retail','Education','Logistics','Real Estate','Other'];
const CLIENT_TYPES= ['Direct','MSP','VMS','Referral','Channel Partner'];
const CURRENCIES  = ['INR','USD','EUR','GBP','SGD','AED'];
const STATUSES    = ['Active','Inactive','On Hold','Prospect'];

export async function renderList() {
  setPageTitle('Clients', 'Client accounts & engagements');
  setBreadcrumb([{ label:'Clients' }]);
  showLoader();
  try {
    const data = await get('/clients');
    const rows = data.items || [];
    let q='', filterStatus='', sortCol='name', sortDir=1, cliPage=1;
    const CLI_PER=25;

    function getF() {
      let d=[...rows];
      if(q) d=d.filter(r=>(r.name+' '+(r.contact_email||'')+(r.gstin||'')).toLowerCase().includes(q.toLowerCase()));
      if(filterStatus) d=d.filter(r=>r.status===filterStatus);
      d.sort((a,b)=>String(a[sortCol]||'').localeCompare(String(b[sortCol]||''))*sortDir);
      return d;
    }

    function render() {
      const all=getF(), total=all.length, pages=Math.max(1,Math.ceil(total/CLI_PER));
      cliPage=Math.min(Math.max(1,cliPage),pages);
      const d=all.slice((cliPage-1)*CLI_PER,cliPage*CLI_PER);
      if(!total){document.getElementById('clients-content').innerHTML='<div class="empty-state"><div class="empty-icon">🤝</div><div class="empty-title">No clients found</div></div>';return;}
      let pgBar=''; if(pages>1){let bts=[];if(cliPage>1)bts.push('<button class="pg-btn" onclick="window._cliPg('+(cliPage-1)+')">‹</button>');for(let p=Math.max(1,cliPage-2);p<=Math.min(pages,cliPage+2);p++)bts.push('<button class="pg-btn'+(p===cliPage?' active':'')+'" onclick="window._cliPg('+p+')">'+p+'</button>');if(cliPage<pages)bts.push('<button class="pg-btn" onclick="window._cliPg('+(cliPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' clients</span></div>';}
      document.getElementById('clients-content').innerHTML =
        '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>'+
          '<th class="sortable" onclick="window._cSort(\'name\')">Client <span class="sort-icon">'+(sortCol==='name'?(sortDir===1?'↑':'↓'):'')+'</span></th>'+
          '<th class="sortable" onclick="window._cSort(\'industry\')">Industry <span class="sort-icon">'+(sortCol==='industry'?(sortDir===1?'↑':'↓'):'')+'</span></th>'+
          '<th>Contact</th>'+
          '<th class="sortable" onclick="window._cSort(\'account_manager_name\')">Account Manager <span class="sort-icon">'+(sortCol==='account_manager_name'?(sortDir===1?'↑':'↓'):'')+'</span></th>'+
          '<th>Health</th>'+
          '<th class="sortable" onclick="window._cSort(\'status\')">Status <span class="sort-icon">'+(sortCol==='status'?(sortDir===1?'↑':'↓'):'')+'</span></th>'+
          '<th>Actions</th>'+
        '</tr></thead><tbody>'+
        d.map(c=>
          '<tr class="tbl-clickable" onclick="navigateTo(\'/clients/'+c.id+'\')">' +
          '<td><div class="cell-person">'+
            '<div class="av av-sm av-blue">'+fmt.ini(c.name)+'</div>'+
            '<div><div class="cell-name">'+v(c.name)+'</div>'+
            '<div class="cell-sub mono">'+v(c.gstin||c.city||'')+'</div></div>'+
          '</div></td>'+
          '<td>'+v(c.industry,'—')+'</td>'+
          '<td><div>'+v(c.primary_contact,'—')+'</div>'+
            (c.contact_email?'<div class="cell-sub">'+v(c.contact_email)+'</div>':'')+
          '</td>'+
          '<td>'+v(c.account_manager_name,'—')+'</td>'+
          '<td><div style="display:flex;align-items:center;gap:6px">'+
            '<div style="width:40px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">'+
              '<div style="width:'+(c.health_score||80)+'%;height:100%;background:'+(c.health_score>=70?'var(--green)':'var(--amber)')+'"></div>'+
            '</div>'+
            '<span style="font-size:11px">'+(c.health_score||80)+'%</span>'+
          '</div></td>'+
          '<td>'+badge(c.status||'Active')+'</td>'+
          '<td class="tbl-actions" onclick="event.stopPropagation()">'+
            '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/clients/'+c.id+'\')">View</button>'+
            '<button class="btn btn-primary btn-xs" onclick="navigateTo(\'/clients/'+c.id+'\')" >✏ Edit</button>'+
            '<button class="btn btn-danger btn-xs" onclick="window._deleteClient('+c.id+')">Delete</button>'+
          '</td></tr>'
        ).join('')+'</tbody></table></div>'+pgBar+'</div>';
    }

    setContent(
      '<div class="page-body">'+
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">'+
        kpi('Total',   rows.length,                                          '🤝','blue')+
        kpi('Active',  rows.filter(r=>r.status==='Active').length,           '✅','green')+
        kpi('On Hold', rows.filter(r=>r.status==='On Hold').length,          '⏸','amber')+
        kpi('Prospect',rows.filter(r=>r.status==='Prospect').length,         '🎯','purple')+
      '</div>'+
      '<div class="struct-toolbar">'+
        '<div style="display:flex;gap:8px">'+
          '<input class="search-input" placeholder="Search clients…" oninput="window._cQ(this.value)">'+
          '<select class="fselect" style="width:130px" onchange="window._cFilter(this.value)">'+
            '<option value="">All Status</option>'+STATUSES.map(s=>'<option>'+s+'</option>').join('')+
          '</select>'+
        '</div>'+
        '<button class="btn btn-primary" onclick="navigateTo(\'/clients/new\')">+ New Client</button>'+
      '</div>'+
      '<div id="clients-content"></div></div>'
    );
    render();
    window._cQ      = val=>{q=val;cliPage=1;render()};
    window._cliPg   = p=>{cliPage=p;render();};
    window._cFilter = val=>{filterStatus=val;render();};
    window._cSort   = col=>{sortCol===col?sortDir*=-1:(sortCol=col,sortDir=1);render();};
    window._deleteClient = async (id) => {
      if(!confirm('Deactivate this client?')) return;
      try {
        await put('/clients/'+id, {is_active:0});
        toast('Client deactivated','info');
        renderList();
      } catch(e) { toast(e.message || 'Delete failed','error'); }
    };
  } catch(e) { showError(e.message); }
}

function kpi(l,val,icon,c){return '<div class="kpi-card kpi-'+c+'"><div class="kpi-icon">'+icon+'</div><div class="kpi-body"><div class="kpi-value">'+val+'</div><div class="kpi-label">'+l+'</div></div></div>';}

export async function renderNew() {
  showLoader();
  const masters = await get('/masters/all');
  setPageTitle('New Client', '');
  setBreadcrumb([{ label:'Clients', url:'/clients' }, { label:'New' }]);
  renderClientForm(null, masters);
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [client, masters] = await Promise.all([get('/clients/'+id), get('/masters/all')]);
    setPageTitle(client.name, 'Client Profile');
    setBreadcrumb([{ label:'Clients', url:'/clients' }, { label:client.name }]);
    renderClientDetail(client, masters);
  } catch(e) { showError(e.message); }
}

function renderClientDetail(client, masters) {
  const tabs = ['overview','contacts','projects','invoices','timesheets','documents'];
  const tabLabels = {
    overview:'📋 Overview', contacts:'👥 Contacts',
    projects:'🗂 Projects', invoices:'🧾 Invoices',
    timesheets:'⏱ Timesheets', documents:'📄 Documents'
  };
  let activeTab = 'overview';

  function sidebar() {
    return '<div class="detail-sidebar"><div class="card">'+
      '<div class="profile-hero" style="background:linear-gradient(135deg,#1d4ed8,#1e40af)">'+
        '<div class="av av-xl av-blue" style="margin:0 auto 10px">'+fmt.ini(client.name)+'</div>'+
        '<div class="profile-name">'+v(client.name)+'</div>'+
        '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(client.industry||'Client')+'</div>'+
        '<div style="margin-top:8px">'+badge(client.status||'Active')+'</div>'+
      '</div>'+
      '<div class="profile-meta">'+
        '<div class="meta-row"><span>Type</span><strong>'+v(client.client_type||client.contract_type||'Direct')+'</strong></div>'+
        '<div class="meta-row"><span>PAN</span><strong class="mono">'+v(client.pan,'—')+'</strong></div>'+
        '<div class="meta-row"><span>GSTIN</span><strong class="mono">'+v(client.gstin,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Email</span><strong>'+v(client.contact_email,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Phone</span><strong>'+v(client.contact_phone,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Health</span><strong>'+(client.health_score||80)+'%</strong></div>'+
      '</div>'+
      '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
        '<button class="btn btn-primary btn-full" onclick="window._editClient()">✏ Edit Client</button>'+
        '<button class="btn btn-ghost btn-full" onclick="navigateTo(\'/invoices/new\')">+ Create Invoice</button>'+
        '<button class="btn btn-danger btn-full" onclick="window._deleteThisClient()">Delete Client</button>'+
      '</div>'+
    '</div></div>';
  }

  function tabContent(tab) {
    switch(tab) {
      case 'overview': return (
        '<div class="card" style="margin-bottom:12px"><div class="card-header"><h3 class="card-title">Company Info</h3></div><div class="card-body"><div class="field-grid">'+
        fld('Industry',client.industry)+fld('Currency',client.currency)+
        fld('Payment Terms',client.payment_terms)+fld('Website',client.website)+
        fld('Referred By',client.referred_by)+fld('Account Manager',client.account_manager_name)+
        '</div></div></div>'+
        '<div class="card"><div class="card-header"><h3 class="card-title">Address</h3></div><div class="card-body"><div class="field-grid">'+
        fld('Address',client.address_line1)+fld('City',client.city)+
        fld('State/Region',client.state_name)+fld('Pincode',client.pincode,true)+
        '</div></div></div>'
      );
      case 'contacts': return (
        '<div class="card"><div class="card-header"><h3 class="card-title">Contacts</h3></div><div class="card-body"><div class="multi-grid">'+
        buildContactCard('Primary Contact',client.primary_contact,client.primary_contact_designation,client.contact_email,client.contact_phone)+
        buildContactCard('Billing Contact',client.billing_contact_name,client.billing_contact_designation,client.billing_contact_email,client.billing_contact_phone)+
        '</div></div></div>'
      );
      case 'projects': return '<div id="proj-tab"><div class="page-loader"><div class="spinner"></div></div></div>';
      case 'invoices': return '<div id="inv-tab"><div class="page-loader"><div class="spinner"></div></div></div>';
      case 'timesheets': return '<div id="ts-tab"><div class="page-loader"><div class="spinner"></div></div></div>';
      case 'documents': return docSection(client.id, 'client');
      default: return '';
    }
  }

  setContent(
    '<div class="detail-layout">'+sidebar()+
    '<div class="detail-main">'+
      '<div class="card" style="padding:14px;margin-bottom:12px">'+logoUploaderHtml('clients', client.id)+'</div>'+
      '<div class="tab-bar">'+tabs.map(t=>'<button class="tab'+(t===activeTab?' active':'')+'" onclick="window._cTab(\''+t+'\',this)">'+tabLabels[t]+'</button>').join('')+'</div>'+
      '<div id="client-tab">'+tabContent(activeTab)+'</div>'+
    '</div></div>'
  );

  // Load lazy tabs
  loadProjectsTab(client.id);

  window._cTab = (tab, el) => {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('client-tab').innerHTML = tabContent(tab);
    if(tab==='projects')   loadProjectsTab(client.id);
    if(tab==='invoices')   loadInvoicesTab(client.id);
    if(tab==='timesheets') loadTSTab(client.id);
  };
  window._editClient = () => renderClientForm(client, masters);
  window._deleteThisClient = async () => {
    if(!confirm('Deactivate client "'+client.name+'"?')) return;
    try {
      await put('/clients/'+client.id, {is_active:0});
      toast('Client deactivated','info');
      navigate('/clients');
    } catch(e) { toast(e.message || 'Delete failed','error'); }
  };
}

function buildContactCard(title, name, desig, email, phone) {
  if(!name) return '';
  return '<div class="multi-card">'+
    '<div class="multi-card-header"><span class="badge badge-blue">'+title+'</span></div>'+
    '<div class="contact-av-row" style="margin-top:8px">'+
      '<div class="av av-sm av-blue">'+fmt.ini(name)+'</div>'+
      '<div><div class="fw-bold">'+v(name)+'</div><div class="text-muted" style="font-size:11px">'+v(desig||'')+'</div></div>'+
    '</div>'+
    (email?'<a href="mailto:'+v(email)+'" class="contact-link" style="margin-top:6px">✉ '+v(email)+'</a>':'')+
    (phone?'<a href="tel:'+v(phone)+'" class="contact-link">📞 '+v(phone)+'</a>':'')+
  '</div>';
}

async function loadProjectsTab(clientId) {
  const el = document.getElementById('proj-tab'); if(!el) return;
  try {
    const data = await get('/projects?client_id='+clientId);
    const rows = data.items||[];
    el.innerHTML = rows.length
      ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th><th>Budget</th></tr></thead><tbody>'+
        rows.map(p=>'<tr class="tbl-clickable" onclick="navigateTo(\'/projects/'+p.id+'\')">' +
          '<td class="mono">'+v(p.project_code||'—')+'</td><td><strong>'+v(p.name)+'</strong></td>'+
          '<td>'+v(p.project_type||'T&M')+'</td><td>'+badge(p.status||'Active')+'</td>'+
          '<td class="mono">'+fmt.money(p.budget)+'</td></tr>').join('')+
        '</tbody></table></div></div>'
      : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No projects</div>'+
        '<button class="btn btn-primary" onclick="navigateTo(\'/projects/new\')">+ New Project</button></div>';
  } catch(e) { el.innerHTML='<div class="error-state"><div class="error-title">'+e.message+'</div></div>'; }
}

async function loadInvoicesTab(clientId) {
  const el = document.getElementById('inv-tab'); if(!el) return;
  try {
    const data = await get('/invoices?client_id='+clientId);
    const rows = data.items||[];
    el.innerHTML = rows.length
      ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr><th>Invoice #</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>'+
        rows.map(i=>'<tr class="tbl-clickable" onclick="navigateTo(\'/invoices/'+i.id+'\')">' +
          '<td class="mono fw-bold">'+v(i.invoice_number)+'</td>'+
          '<td>'+fmt.date(i.created_at)+'</td><td class="mono">'+fmt.money(i.total_amount)+'</td>'+
          '<td>'+badge(i.status_name||'Draft')+'</td></tr>').join('')+
        '</tbody></table></div></div>'
      : '<div class="empty-mini">No invoices</div>';
  } catch(e) { el.innerHTML='<div class="error-state">'+e.message+'</div>'; }
}

async function loadTSTab(clientId) {
  const el = document.getElementById('ts-tab'); if(!el) return;
  try {
    const data = await get('/timesheets?client_id='+clientId+'&per_page=50');
    const rows = data.items||[];
    el.innerHTML = rows.length
      ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr><th>Employee</th><th>Week Ending</th><th>Hours</th><th>Status</th></tr></thead><tbody>'+
        rows.map(t=>'<tr>'+
          '<td><strong>'+v(t.employee_name,'—')+'</strong></td>'+
          '<td class="mono">'+fmt.date(t.week_ending)+'</td>'+
          '<td class="mono fw-bold">'+(t.total_hours||0)+'h</td>'+
          '<td>'+badge(t.status||'Pending')+'</td></tr>').join('')+
        '</tbody></table></div></div>'
      : '<div class="empty-mini">No timesheets</div>';
  } catch(e) { el.innerHTML='<div class="error-state">'+e.message+'</div>'; }
}

function docSection(entityId, entityType) {
  var DOC_TYPES = ['Contract','NDA','SOW','PO','Certificate','Invoice','Correspondence','Other'];

  setTimeout(function() {
    get('/' + entityType + 's/' + entityId + '/documents').then(function(docs) {
      var el = document.getElementById('entity-docs-' + entityId);
      if (!el) return;
      if (!docs || !docs.length) {
        el.innerHTML = '<div class="empty-mini">No documents uploaded yet</div>';
        return;
      }
      var items = docs.map(function(d) {
        var icon = (d.mime_type && d.mime_type.indexOf('pdf') >= 0) ? '&#128213;' :
                   (d.mime_type && d.mime_type.indexOf('image') >= 0) ? '&#128444;' : '&#128196;';
        return '<div class="doc-card">' +
          '<div class="doc-icon">' + icon + '</div>' +
          '<div class="doc-info"><div class="doc-name">' + v(d.doc_name) + '</div>' +
          '<div class="doc-meta"><span class="badge badge-gray">' + v(d.doc_type || 'Doc') + '</span>' +
          (d.file_size ? '<span class="text-muted">' + v(d.file_size) + '</span>' : '') +
          '</div></div>' +
          '<div style="display:flex;gap:4px">' +
            '<button class="btn btn-ghost btn-xs" title="Download" onclick="window.dlDoc(&#39;client&#39;,' + d.id + ')">&#11015;</button>' +
            '<button class="btn btn-danger btn-xs" onclick="window.rmDoc(&#39;client&#39;,' + d.id + ',' + entityId + ')">&#10005;</button>' +
          '</div></div>';
      }).join('');
      el.innerHTML = '<div class="doc-grid">' + items + '</div>';
    }).catch(function() {
      var el = document.getElementById('entity-docs-' + entityId);
      if (el) el.innerHTML = '<div class="empty-mini">No documents yet</div>';
    });
  }, 200);

  window.uploadDoc = function(eId, eType) {
    openModal({
      title: 'Upload Document',
      body: '<form id="doc-up-form" class="form-grid-sm">' +
        '<div class="fg"><label class="flabel">Type</label>' +
        '<select class="fselect" name="doc_type">' +
        DOC_TYPES.map(function(t) { return '<option>' + t + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="fg"><label class="flabel">Name *</label>' +
        '<input class="finput" name="doc_name" required placeholder="e.g. MSA 2024"></div>' +
        '<div class="fg full"><label class="flabel">File *</label>' +
        '<input type="file" class="finput" id="doc-up-file" accept=".pdf,.doc,.docx,.png,.jpg"></div>' +
        '</form>',
      submitLabel: 'Upload',
      onSubmit: async function() {
        var data = Object.fromEntries(new FormData(document.getElementById('doc-up-form')));
        var fi = document.getElementById('doc-up-file');
        if (!fi || !fi.files || !fi.files[0]) { toast('Select a file', 'error'); return false; }
        var file = fi.files[0];
        if (file.size > 5 * 1024 * 1024) { toast('Max 5MB', 'error'); return false; }
        var b64 = await new Promise(function(res, rej) {
          var r = new FileReader(); r.onload = function() { res(r.result.split(',')[1]); }; r.onerror = rej; r.readAsDataURL(file);
        });
        data.file_data = b64; data.file_size = (file.size/1024).toFixed(1) + ' KB'; data.mime_type = file.type;
        await post('/' + eType + 's/' + eId + '/documents', data);
        toast('Uploaded!', 'success');
      }
    });
  };

  window.dlDoc = async function(eType, docId) {
    try {
      var doc = await get('/' + eType + 's/documents/' + docId);
      if (!doc || !doc.file_data) { toast('File not available', 'error'); return; }
      var link = document.createElement('a');
      link.href = 'data:' + (doc.mime_type || 'application/octet-stream') + ';base64,' + doc.file_data;
      link.download = doc.doc_name || 'document';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch(e) { toast(e.message, 'error'); }
  };

  window.rmDoc = async function(eType, docId, eId) {
    if (!confirm('Remove document?')) return;
    await put('/' + eType + 's/documents/' + docId, { is_active: 0 }).catch(function() {});
    toast('Removed', 'info');
    var el = document.getElementById('entity-docs-' + eId);
    if (el) el.innerHTML = '<div class="empty-mini">Removed</div>';
  };

  return '<div class="card">' +
    '<div class="card-header"><h3 class="card-title">Documents</h3>' +
    '<button class="btn btn-ghost btn-sm" onclick="window.uploadDoc(' + entityId + ',&#39;client&#39;)">+ Upload</button>' +
    '</div>' +
    '<div id="entity-docs-' + entityId + '"><div class="empty-mini">Loading...</div></div>' +
    '</div>';
}
function renderClientForm(existing, masters) {
  const isEdit = !!existing;
  if(isEdit) {
    setPageTitle('Edit: '+existing.name, '');
    setBreadcrumb([{ label:'Clients', url:'/clients' }, { label:existing.name, url:'/clients/'+existing.id }, { label:'Edit' }]);
  }
  setContent(
    '<div class="page-body"><div class="card" style="max-width:900px;margin:0 auto">'+
    '<div class="card-header">'+
      '<h3 class="card-title">'+(isEdit?'Edit Client: '+v(existing.name):'New Client')+'</h3>'+
    '</div>'+
    '<form id="client-form"><div class="form-grid">'+
      '<div class="form-section-title">Company Information</div>'+
      '<div class="fg full"><label class="flabel">Client Name *</label><input class="finput" name="name" value="'+v((existing && existing.name))+'" required></div>'+
      '<div class="fg"><label class="flabel">Industry</label><select class="fselect" name="industry"><option value="">Select…</option>'+opts(INDUSTRIES,(existing && existing.industry))+'</select></div>'+
      '<div class="fg"><label class="flabel">Client Type</label><select class="fselect" name="client_type">'+opts(CLIENT_TYPES,(existing && existing.client_type)||(existing && existing.contract_type)||'Direct')+'</select></div>'+
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">'+opts(STATUSES,(existing && existing.status)||'Active')+'</select></div>'+
      '<div class="fg"><label class="flabel">Currency</label><select class="fselect" name="currency">'+opts(CURRENCIES,(existing && existing.currency)||'INR')+'</select></div>'+
      '<div class="fg"><label class="flabel">Payment Terms</label><select class="fselect" name="payment_terms_id"><option value="">Select…</option>'+opts(masters['payment-terms']||[],(existing && existing.payment_terms_id))+'</select></div>'+
      '<div class="fg"><label class="flabel">Health Score</label><input class="finput" type="number" name="health_score" value="'+v((existing && existing.health_score),80)+'" min="0" max="100"></div>'+
      '<div class="fg"><label class="flabel">Account Manager</label><select class="fselect" name="account_manager_id"><option value="">Select…</option>'+opts(masters['employees-lookup']||[],(existing && existing.account_manager_id))+'</select></div>'+
      '<div class="form-section-title">Primary Contact</div>'+
      '<div class="fg"><label class="flabel">Name</label><input class="finput" name="primary_contact" value="'+v((existing && existing.primary_contact))+'"></div>'+
      '<div class="fg"><label class="flabel">Designation</label><input class="finput" name="primary_contact_designation" value="'+v((existing && existing.primary_contact_designation))+'"></div>'+
      '<div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="contact_email" value="'+v((existing && existing.contact_email))+'"></div>'+
      '<div class="fg"><label class="flabel">Phone</label><input class="finput" name="contact_phone" value="'+v((existing && existing.contact_phone))+'"></div>'+
      '<div class="form-section-title">Billing Contact</div>'+
      '<div class="fg"><label class="flabel">Name</label><input class="finput" name="billing_contact_name" value="'+v((existing && existing.billing_contact_name))+'"></div>'+
      '<div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="billing_contact_email" value="'+v((existing && existing.billing_contact_email))+'"></div>'+
      '<div class="fg"><label class="flabel">Phone</label><input class="finput" name="billing_contact_phone" value="'+v((existing && existing.billing_contact_phone))+'"></div>'+
      '<div class="form-section-title">Address & Compliance</div>'+
      '<div class="fg full"><label class="flabel">Address</label><input class="finput" name="address_line1" value="'+v((existing && existing.address_line1))+'"></div>'+
      '<div class="fg"><label class="flabel">City</label><input class="finput" name="city" value="'+v((existing && existing.city))+'"></div>'+
      '<div class="fg"><label class="flabel">Pincode</label><input class="finput mono" name="pincode" value="'+v((existing && existing.pincode))+'"></div>'+
      '<div class="fg"><label class="flabel">PAN</label><input class="finput mono" name="pan" value="'+v((existing && existing.pan))+'"></div>'+
      '<div class="fg"><label class="flabel">GSTIN</label><input class="finput mono" name="gstin" value="'+v((existing && existing.gstin))+'"></div>'+
    '</div></form>'+
    '<div class="form-actions">'+
      '<button type="button" class="btn btn-ghost" onclick="navigateTo(\''+(isEdit?'/clients/'+existing.id:'/clients')+'\')">Cancel</button>'+
      '<button type="button" class="btn btn-primary" onclick="window._saveClient()">'+(isEdit?'Save Changes':'Create Client')+'</button>'+
    '</div></div></div>'
  );

  window._saveClient = async () => {
    const data = fd('client-form');
    try {
      if(isEdit) { await put('/clients/'+existing.id, data); toast('Client updated','success'); navigate('/clients/'+existing.id); }
      else { const r=await post('/clients', data); toast('Client created','success'); navigate('/clients/'+r.id); }
    } catch(e) { toast(e.message,'error'); }
  };
}
