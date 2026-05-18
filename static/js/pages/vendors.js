/**
 * Vendors — Full detail, row click, inline edit, Documents tab, filter by, delete
 */
import { get, post, put } from '../api.js';
import { renderDocsTab, docsTabHtml } from '../docs.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

function v(val,fb){if(val===null||val===undefined)return fb!==undefined?fb:'';return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fd(id){const d=Object.fromEntries(new FormData(document.getElementById(id)));Object.keys(d).forEach(k=>{if(d[k]==='')d[k]=null;});return d;}
function opts(arr,sel,vk,lk){return arr.map(i=>{const val=typeof i==='string'?i:i[vk||'id'];const lbl=typeof i==='string'?i:i[lk||'name'];return '<option value="'+v(val)+'"'+(String(val)===String(sel)?' selected':'')+'>'+v(lbl)+'</option>';}).join('');}
function fld(l,val,mono){return '<div class="field-item"><div class="field-label">'+l+'</div><div class="field-value'+(val?'':' empty')+(mono?' mono':'')+'">'+v(val,'—')+'</div></div>';}

const STATUSES = ['Active','Inactive','Blacklisted'];

export async function renderList() {
  setPageTitle('Vendors', 'Vendor & partner management');
  setBreadcrumb([{ label:'Vendors' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([get('/vendors'), get('/masters/all')]);
    const rows = data.items || [];
    let q='', filterStatus='', filterCat='', sortCol='name', sortDir=1, venPage=1;
    const VEN_PER=25;

    const categories = [...new Set(rows.map(r=>r.category_name).filter(Boolean))];

    function getF() {
      let d=[...rows];
      if(q) d=d.filter(r=>(r.name+' '+(r.contact_email||'')+(r.gstin||'')).toLowerCase().includes(q.toLowerCase()));
      if(filterStatus) d=d.filter(r=>r.status===filterStatus);
      if(filterCat) d=d.filter(r=>r.category_name===filterCat);
      d.sort((a,b)=>String(a[sortCol]||'').localeCompare(String(b[sortCol]||''))*sortDir);
      return d;
    }

    function render() {
      const all=getF(), total=all.length, pages=Math.max(1,Math.ceil(total/VEN_PER));
      venPage=Math.min(Math.max(1,venPage),pages);
      const d=all.slice((venPage-1)*VEN_PER,venPage*VEN_PER);
      let pgBar=''; if(pages>1){let bts=[];if(venPage>1)bts.push('<button class="pg-btn" onclick="window._venPg('+(venPage-1)+')">‹</button>');for(let p=Math.max(1,venPage-2);p<=Math.min(pages,venPage+2);p++)bts.push('<button class="pg-btn'+(p===venPage?' active':'')+'" onclick="window._venPg('+p+')">'+p+'</button>');if(venPage<pages)bts.push('<button class="pg-btn" onclick="window._venPg('+(venPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' vendors</span></div>';}
      if(!total){document.getElementById('vendors-content').innerHTML='<div class="empty-state"><div class="empty-icon">🏭</div><div class="empty-title">No vendors found</div></div>';return;}
      document.getElementById('vendors-content').innerHTML =
        '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>'+
          '<th class="sortable" onclick="window._vSort(\'name\')">Vendor ⇅</th>'+
          '<th class="sortable" onclick="window._vSort(\'category_name\')">Category ⇅</th>'+
          '<th>Contact</th>'+
          '<th class="sortable" onclick="window._vSort(\'city\')">City ⇅</th>'+
          '<th>SLA Score</th>'+
          '<th class="sortable" onclick="window._vSort(\'status\')">Status ⇅</th>'+
          '<th>Actions</th>'+
        '</tr></thead><tbody>'+
        d.map(ven=>
          '<tr class="tbl-clickable" onclick="navigateTo(\'/vendors/'+ven.id+'\')">' +
          '<td><div class="cell-person">'+
            '<div class="av av-sm av-purple">'+fmt.ini(ven.name)+'</div>'+
            '<div><div class="cell-name">'+v(ven.name)+'</div>'+
            '<div class="cell-sub mono">'+v(ven.gstin||ven.pan||'')+'</div></div>'+
          '</div></td>'+
          '<td>'+v(ven.category_name,'—')+'</td>'+
          '<td><div>'+v(ven.primary_contact,'—')+'</div>'+
            (ven.contact_email?'<div class="cell-sub">'+v(ven.contact_email)+'</div>':'')+
          '</td>'+
          '<td>'+v(ven.city,'—')+'</td>'+
          '<td><div style="display:flex;align-items:center;gap:6px">'+
            '<div style="width:40px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">'+
              '<div style="width:'+(ven.sla_score||90)+'%;height:100%;background:'+(ven.sla_score>=80?'var(--green)':'var(--amber)')+'"></div></div>'+
            '<span style="font-size:11px">'+(ven.sla_score||90)+'%</span></div></td>'+
          '<td>'+badge(ven.status||'Active')+'</td>'+
          '<td class="tbl-actions" onclick="event.stopPropagation()">'+
            '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/vendors/'+ven.id+'\')">View</button>'+
            '<button class="btn btn-primary btn-xs" onclick="navigateTo(\'/vendors/'+ven.id+'\')" >✏ Edit</button>'+
            '<button class="btn btn-danger btn-xs" onclick="window._deleteVendor('+ven.id+')">Delete</button>'+
          '</td></tr>'
        ).join('')+'</tbody></table></div>'+pgBar+'</div>';
    }

    setContent(
      '<div class="page-body">'+
      '<div class="struct-toolbar">'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<input class="search-input" placeholder="Search vendors…" oninput="window._vQ(this.value)" style="width:220px">'+
          '<select class="fselect" style="width:130px" onchange="window._vFilter(this.value)">'+
            '<option value="">All Status</option>'+STATUSES.map(s=>'<option>'+s+'</option>').join('')+
          '</select>'+
          '<select class="fselect" style="width:150px" onchange="window._vCat(this.value)">'+
            '<option value="">All Categories</option>'+categories.map(c=>'<option>'+c+'</option>').join('')+
          '</select>'+
        '</div>'+
        '<button class="btn btn-primary" onclick="navigateTo(\'/vendors/new\')">+ New Vendor</button>'+
      '</div>'+
      '<div id="vendors-content"></div></div>'
    );
    render();
    window._vQ      = val=>{q=val;render();};
    window._vFilter = val=>{filterStatus=val;render();};
    window._vCat    = val=>{filterCat=val;render();};
    window._vSort   = col=>{sortCol===col?sortDir*=-1:(sortCol=col,sortDir=1);render();};
    window._venPg    = p=>{venPage=p;render();};
    window._deleteVendor = async (id) => {
      if(!confirm('Delete this vendor?')) return;
      await put('/vendors/'+id, {is_active:0});
      toast('Vendor deleted','info');
      renderList();
    };
  } catch(e) { showError(e.message); }
}

export async function renderNew() {
  showLoader();
  const masters = await get('/masters/all');
  setPageTitle('New Vendor', '');
  setBreadcrumb([{ label:'Vendors', url:'/vendors' }, { label:'New' }]);
  renderVendorForm(null, masters);
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [vendor, masters] = await Promise.all([get('/vendors/'+id), get('/masters/all')]);
    setPageTitle(vendor.name, 'Vendor');
    setBreadcrumb([{ label:'Vendors', url:'/vendors' }, { label:vendor.name }]);
    renderVendorDetail(vendor, masters);
  } catch(e) { showError(e.message); }
}

function renderVendorDetail(vendor, masters) {
  const tabs = ['overview','banking','documents'];
  const tabLabels = { overview:'📋 Overview', banking:'🏦 Banking', documents:'📄 Documents' };
  let activeTab = 'overview';

  function tabContent(tab) {
    switch(tab) {
      case 'overview': return (
        '<div class="card" style="margin-bottom:12px"><div class="card-header"><h3 class="card-title">Details</h3></div><div class="card-body"><div class="field-grid">'+
        fld('Category',vendor.category_name)+fld('Status',vendor.status)+
        fld('SLA Score',(vendor.sla_score||90)+'%')+fld('Contract End',fmt.date(vendor.contract_end))+
        fld('Address',vendor.address_line1)+fld('City',vendor.city)+
        fld('PAN',vendor.pan,true)+fld('GSTIN',vendor.gstin,true)+
        fld('Primary Contact',vendor.primary_contact)+fld('Email',vendor.contact_email)+
        fld('Phone',vendor.contact_phone)+fld('Account Manager',vendor.account_manager_name)+
        '</div></div></div>'
      );
      case 'banking': return (
        '<div class="card"><div class="card-header"><h3 class="card-title">Banking Details</h3></div><div class="card-body"><div class="field-grid">'+
        fld('Bank Name',vendor.bank_name)+fld('Branch',vendor.bank_branch)+
        fld('Account',vendor.bank_account_number?'••••'+vendor.bank_account_number.slice(-4):null,true)+
        fld('IFSC',vendor.bank_ifsc,true)+fld('Account Type',vendor.bank_account_type)+
        fld('SWIFT',vendor.bank_swift,true)+
        '</div></div></div>'
      );
      case 'documents':
        var vDocHtml = '<div class="card"><div class="card-header"><h3 class="card-title">📄 Documents</h3>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._uploadVDoc()">+ Upload</button>' +
        '</div><div id="vdoc-list"><div class="empty-mini">Loading…</div></div></div>';
        setTimeout(function() {
          get('/vendors/' + vendor.id + '/documents').then(function(docs) {
            var el = document.getElementById('vdoc-list'); if (!el) return;
            if (!docs || !docs.length) { el.innerHTML = '<div class="empty-mini">No documents yet</div>'; return; }
            el.innerHTML = '<div class="doc-grid">' + docs.map(function(d) {
              return '<div class="doc-card"><div class="doc-icon">📄</div>' +
                '<div class="doc-info"><div class="doc-name">' + v(d.doc_name) + '</div>' +
                '<div class="doc-meta"><span class="badge badge-gray">' + v(d.doc_type || 'Doc') + '</span></div></div>' +
                '<button class="btn btn-danger btn-xs" onclick="window._rmVDoc(' + d.id + ')">✕</button></div>';
            }).join('') + '</div>';
          }).catch(function() {});
          window._uploadVDoc = function() {
            openModal({ title: '📎 Upload Document',
              body: '<form id="vdoc-form" class="form-grid-sm">' +
                '<div class="fg full"><label class="flabel">Name *</label><input class="finput" name="doc_name" required></div>' +
                '<div class="fg full"><label class="flabel">File *</label><input type="file" class="finput" id="vdoc-file"></div>' +
                '</form>',
              submitLabel: 'Upload',
              onSubmit: async function() {
                var data = Object.fromEntries(new FormData(document.getElementById('vdoc-form')));
                var fi = document.getElementById('vdoc-file');
                if (!fi || !fi.files || !fi.files[0]) { toast('Select a file','error'); return false; }
                var file = fi.files[0];
                var b64 = await new Promise(function(res,rej) { var r=new FileReader(); r.onload=function(){res(r.result.split(',')[1]);}; r.onerror=rej; r.readAsDataURL(file); });
                data.file_data=b64; data.file_size=(file.size/1024).toFixed(1)+' KB'; data.mime_type=file.type; data.doc_type='Document';
                await post('/vendors/'+vendor.id+'/documents', data);
                toast('Uploaded!','success');
              }
            });
          };
          window._rmVDoc = async function(docId) {
            if (!confirm('Remove?')) return;
            await put('/vendors/documents/'+docId,{is_active:0}).catch(function(){});
            toast('Removed','info');
          };
        }, 100);
        return vDocHtml;
      default: return '';
    }
  }

  setContent(
    '<div class="detail-layout">'+
    '<div class="detail-sidebar"><div class="card">'+
      '<div class="profile-hero" style="background:linear-gradient(135deg,#7c3aed,#5b21b6)">'+
        '<div class="av av-xl av-purple" style="margin:0 auto 10px">'+fmt.ini(vendor.name)+'</div>'+
        '<div class="profile-name">'+v(vendor.name)+'</div>'+
        '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(vendor.category_name||'Vendor')+'</div>'+
        '<div style="margin-top:8px">'+badge(vendor.status||'Active')+'</div>'+
      '</div>'+
      '<div class="profile-meta">'+
        '<div class="meta-row"><span>Contact</span><strong>'+v(vendor.primary_contact,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Email</span><strong>'+v(vendor.contact_email,'—')+'</strong></div>'+
        '<div class="meta-row"><span>Phone</span><strong>'+v(vendor.contact_phone,'—')+'</strong></div>'+
        '<div class="meta-row"><span>GSTIN</span><strong class="mono">'+v(vendor.gstin,'—')+'</strong></div>'+
        '<div class="meta-row"><span>SLA Score</span><strong>'+(vendor.sla_score||90)+'%</strong></div>'+
      '</div>'+
      '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
        '<button class="btn btn-primary btn-full" onclick="window._editVendor()">✏ Edit</button>'+
        '<button class="btn btn-danger btn-full" onclick="window._deleteVendor()">Delete</button>'+
      '</div>'+
    '</div></div>'+
    '<div class="detail-main">'+
      '<div class="tab-bar">'+tabs.map(t=>'<button class="tab'+(t===activeTab?' active':'')+'" onclick="window._vTab(\''+t+'\',this)">'+tabLabels[t]+'</button>').join('')+'</div>'+
      '<div id="vendor-tab">'+tabContent(activeTab)+'</div>'+
    '</div></div>'
  );

  window._vTab = (tab, el) => {
    activeTab=tab;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('vendor-tab').innerHTML=tabContent(tab);
  };
  window._editVendor   = () => renderVendorForm(vendor, masters);
  window._deleteVendor = async () => {
    if(!confirm('Delete vendor "'+vendor.name+'"?')) return;
    await put('/vendors/'+vendor.id, {is_active:0});
    toast('Vendor deleted','info');
    navigate('/vendors');
  };
}

function renderVendorForm(existing, masters) {
  const isEdit = !!existing;
  if(isEdit) {
    setPageTitle('Edit: '+existing.name,'');
    setBreadcrumb([{ label:'Vendors', url:'/vendors' }, { label:existing.name, url:'/vendors/'+existing.id }, { label:'Edit' }]);
  }
  setContent(
    '<div class="page-body"><div class="card" style="max-width:900px;margin:0 auto">'+
    '<div class="card-header"><h3 class="card-title">'+(isEdit?'Edit Vendor: '+v(existing.name):'New Vendor')+'</h3></div>'+
    '<form id="vendor-form"><div class="form-grid">'+
      '<div class="form-section-title">Vendor Information</div>'+
      '<div class="fg full"><label class="flabel">Vendor Name *</label><input class="finput" name="name" value="'+v((existing && existing.name))+'" required></div>'+
      '<div class="fg"><label class="flabel">Category</label><select class="fselect" name="category_id"><option value="">Select…</option>'+opts(masters['vendor-categories']||[],(existing && existing.category_id))+'</select></div>'+
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">'+opts(STATUSES,(existing && existing.status)||'Active')+'</select></div>'+
      '<div class="fg"><label class="flabel">SLA Score</label><input class="finput" type="number" name="sla_score" value="'+v((existing && existing.sla_score),90)+'" min="0" max="100"></div>'+
      '<div class="fg"><label class="flabel">Contract End Date</label><input class="finput" type="date" name="contract_end" value="'+v((existing && existing.contract_end)?String(existing.contract_end).split('T')[0]:'')+'"></div>'+
      '<div class="form-section-title">Contact</div>'+
      '<div class="fg"><label class="flabel">Contact Name</label><input class="finput" name="primary_contact" value="'+v((existing && existing.primary_contact))+'"></div>'+
      '<div class="fg"><label class="flabel">Designation</label><input class="finput" name="primary_contact_designation" value="'+v((existing && existing.primary_contact_designation))+'"></div>'+
      '<div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="contact_email" value="'+v((existing && existing.contact_email))+'"></div>'+
      '<div class="fg"><label class="flabel">Phone</label><input class="finput" name="contact_phone" value="'+v((existing && existing.contact_phone))+'"></div>'+
      '<div class="form-section-title">Address & Compliance</div>'+
      '<div class="fg full"><label class="flabel">Address</label><input class="finput" name="address_line1" value="'+v((existing && existing.address_line1))+'"></div>'+
      '<div class="fg"><label class="flabel">City</label><input class="finput" name="city" value="'+v((existing && existing.city))+'"></div>'+
      '<div class="fg"><label class="flabel">PAN</label><input class="finput mono" name="pan" value="'+v((existing && existing.pan))+'"></div>'+
      '<div class="fg"><label class="flabel">GSTIN</label><input class="finput mono" name="gstin" value="'+v((existing && existing.gstin))+'"></div>'+
      '<div class="form-section-title">Banking</div>'+
      '<div class="fg"><label class="flabel">Bank Name</label><input class="finput" name="bank_name" value="'+v((existing && existing.bank_name))+'"></div>'+
      '<div class="fg"><label class="flabel">Account Number</label><input class="finput mono" name="bank_account_number" value="'+v((existing && existing.bank_account_number))+'"></div>'+
      '<div class="fg"><label class="flabel">IFSC Code</label><input class="finput mono" name="bank_ifsc" value="'+v((existing && existing.bank_ifsc))+'"></div>'+
      '<div class="fg"><label class="flabel">Account Type</label><select class="fselect" name="bank_account_type">'+opts(['Current','Savings','CC'],(existing && existing.bank_account_type)||'Current')+'</select></div>'+
    '</div></form>'+
    '<div class="form-actions">'+
      '<button type="button" class="btn btn-ghost" onclick="navigateTo(\''+(isEdit?'/vendors/'+existing.id:'/vendors')+'\')">Cancel</button>'+
      '<button type="button" class="btn btn-primary" onclick="window._saveVendor()">'+(isEdit?'Save Changes':'Create Vendor')+'</button>'+
    '</div></div></div>'
  );
  window._saveVendor = async () => {
    const data = fd('vendor-form');
    try {
      if(isEdit) { await put('/vendors/'+existing.id, data); toast('Vendor updated','success'); navigate('/vendors/'+existing.id); }
      else { const r=await post('/vendors', data); toast('Vendor created','success'); navigate('/vendors/'+r.id); }
    } catch(e) { toast(e.message,'error'); }
  };
}
