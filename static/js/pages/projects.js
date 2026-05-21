/**
 * Projects — Full project lifecycle. Issue #11: New Project working.
 * LinkedIn-style detail with Resources, Milestones, Timesheets, Documents
 */
import { get, post, put } from '../api.js';
import { renderDocsTab, docsTabHtml } from '../docs.js?v=20260521a';
import { logoUploaderHtml } from '../logoup.js?v=20260521h';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

function v(val,fb){if(val===null||val===undefined)return fb!==undefined?fb:'';return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fd(id){const d=Object.fromEntries(new FormData(document.getElementById(id)));Object.keys(d).forEach(k=>{if(d[k]==='')d[k]=null;});return d;}
function opts(arr,sel,vk,lk){return arr.map(i=>{const val=typeof i==='string'?i:i[vk||'id'];const lbl=typeof i==='string'?i:i[lk||'name'];return '<option value="'+v(val)+'"'+(String(val)===String(sel)?' selected':'')+'>'+v(lbl)+'</option>';}).join('');}

const PROJ_TYPES   = ['T&M','Fixed Price','Retainer','Milestone Based','ODC'];
const PROJ_STATUS  = ['Draft','Active','On Hold','Completed','Cancelled'];
const BILLING_CYCLE= ['Monthly','Bi-Weekly','Weekly','On Completion','Milestone'];
const PRIORITIES   = ['Critical','High','Medium','Low'];

export async function renderList() {
  setPageTitle('Projects', 'Active engagements');
  setBreadcrumb([{ label:'Projects' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([get('/projects'), get('/masters/all')]);
    const rows = data.items || [];
    let q='', filterStatus='', projSort='name', projDir=1, projPage=1;
    const PROJ_PER = 25;

    function getF() {
      let d=[...rows];
      if(q) d=d.filter(r=>(r.name+' '+(r.client_name||'')+(r.project_code||'')).toLowerCase().includes(q.toLowerCase()));
      if(filterStatus) d=d.filter(r=>r.status===filterStatus);
      return d.slice().sort((a,b)=>String(a[projSort]||'').localeCompare(String(b[projSort]||''))*projDir);
    }

    function thP(col,label){const arr=projSort===col?(projDir===1?' ↑':' ↓'):'';return '<th class="sortable" onclick="window._projSort(\''+col+'\')" style="cursor:pointer">'+label+arr+'</th>';}

    function render() {
      const all=getF(), total=all.length;
      const pages=Math.max(1,Math.ceil(total/PROJ_PER));
      projPage=Math.min(Math.max(1,projPage),pages);
      const d=all.slice((projPage-1)*PROJ_PER, projPage*PROJ_PER);
      let pgBar=''; if(pages>1){let bts=[];if(projPage>1)bts.push('<button class="pg-btn" onclick="window._projPg('+(projPage-1)+')">‹</button>');for(let p2=Math.max(1,projPage-2);p2<=Math.min(pages,projPage+2);p2++)bts.push('<button class="pg-btn'+(p2===projPage?' active':'')+'" onclick="window._projPg('+p2+')">'+p2+'</button>');if(projPage<pages)bts.push('<button class="pg-btn" onclick="window._projPg('+(projPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' projects</span></div>';}
      document.getElementById('proj-content').innerHTML = total
        ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>'+
            thP('project_code','Code')+thP('name','Project')+thP('client_name','Client')+thP('project_type','Type')+thP('pm_name','PM')+thP('start_date','Start')+thP('budget','Budget')+thP('health_score','Health')+thP('status','Status')+'<th>Actions</th>'+
            '</tr></thead><tbody>'+
            d.map(p=>'<tr class="tbl-clickable" onclick="navigateTo(\'/projects/'+p.id+'\')">' +
              '<td class="mono">'+v(p.project_code||'—')+'</td>'+
              '<td><strong>'+v(p.name)+'</strong><div class="cell-sub">'+v(p.short_name||'')+'</div></td>'+
              '<td>'+v(p.client_name||'—')+'</td>'+
              '<td>'+v(p.project_type||'T&M')+'</td>'+
              '<td>'+(p.pm_name?'<div style="display:flex;align-items:center;gap:6px">'+fmt.avatar(p.pm_name, p.pm_photo_url, 'av-xs')+'<span>'+v(p.pm_name)+'</span></div>':'—')+'</td>'+
              '<td class="mono">'+fmt.date(p.start_date)+'</td>'+
              '<td class="mono">'+fmt.money(p.budget)+'</td>'+
              '<td><div style="display:flex;align-items:center;gap:6px">'+
                '<div style="width:40px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">'+
                  '<div style="width:'+(p.health_score||80)+'%;height:100%;background:'+(p.health_score>=70?'var(--green)':'var(--amber)')+'"></div></div>'+
                '<span style="font-size:11px">'+(p.health_score||80)+'%</span></div></td>'+
              '<td>'+badge(p.status||'Active')+'</td>'+
              '<td class="tbl-actions" onclick="event.stopPropagation()">'+
                '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/projects/'+p.id+'\')">View</button>'+
                '<button class="btn btn-primary btn-xs" onclick="navigateTo(\'/projects/'+p.id+'\')">✏ Edit</button>'+
                '<button class="btn btn-danger btn-xs" onclick="window._deleteProject('+p.id+')">Delete</button>'+
              '</td></tr>').join('')+
            '</tbody></table></div>'+pgBar+'</div>'
        : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No projects yet</div>'+
          '<button class="btn btn-primary" onclick="navigateTo(\'/projects/new\')">+ Create First Project</button></div>';
    }

    setContent('<div class="page-body">'+
      '<div class="struct-toolbar">'+
        '<div style="display:flex;gap:8px">'+
          '<input class="search-input" placeholder="Search projects…" oninput="window._projQ(this.value)">'+
          '<select class="fselect" style="width:130px" onchange="window._projFilter(this.value)">'+
            '<option value="">All Status</option>'+PROJ_STATUS.map(s=>'<option>'+s+'</option>').join('')+
          '</select>'+
        '</div>'+
        '<button class="btn btn-primary" onclick="navigateTo(\'/projects/new\')">+ New Project</button>'+
      '</div>'+
      '<div id="proj-content"></div></div>');

    render();
    window._projQ = val=>{q=val;projPage=1;render();};
    window._deleteProject = async function(id) {
      if(!confirm('Delete this project?')) return;
      try {
        await put('/projects/'+id, {is_active:0});
        toast('Project deleted','info');
        rows = rows.filter(function(r){ return r.id !== id; });
        render();
      } catch(ex){ toast(ex.message||'Failed','error'); }
    };
    window._projFilter = val=>{filterStatus=val;projPage=1;render();};
    window._projSort = col=>{projSort===col?projDir*=-1:(projSort=col,projDir=1);render();};
    window._projPg = p=>{projPage=p;render();};
  } catch(e) { showError(e.message); }
}

export async function renderNew() {
  showLoader();
  try {
    const masters = await get('/masters/all');
    setPageTitle('New Project', '');
    setBreadcrumb([{ label:'Projects', url:'/projects' }, { label:'New' }]);
    renderProjectForm(null, masters);
  } catch(e) { showError(e.message); }
}

function renderProjectForm(proj, masters) {
  const isEdit = !!proj;
  setContent(
    '<div class="page-body"><div class="card" style="max-width:960px;margin:0 auto">'+
    '<div class="card-header"><h3 class="card-title">'+(isEdit?'Edit: '+v(proj.name):'Create New Project')+'</h3></div>'+
    '<form id="proj-form"><div class="form-grid">'+
      // Basic
      '<div class="form-section-title">Project Details</div>'+
      '<div class="fg full"><label class="flabel">Project Name *</label><input class="finput" name="name" value="'+v((proj && proj.name))+'" required placeholder="e.g. Digital Transformation Phase 2"></div>'+
      '<div class="fg"><label class="flabel">Short Name</label><input class="finput" name="short_name" value="'+v((proj && proj.short_name))+'" placeholder="Acronym"></div>'+
      '<div class="fg"><label class="flabel">Project Type</label><select class="fselect" name="project_type">'+opts(PROJ_TYPES,(proj && proj.project_type)||'T&M')+'</select></div>'+
      '<div class="fg"><label class="flabel">Priority</label><select class="fselect" name="priority">'+opts(PRIORITIES,(proj && proj.priority)||'Medium')+'</select></div>'+
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">'+opts(PROJ_STATUS,(proj && proj.status)||'Draft')+'</select></div>'+
      '<div class="fg"><label class="flabel">Health Score</label><input class="finput" type="number" name="health_score" value="'+v((proj && proj.health_score),80)+'" min="0" max="100"></div>'+
      // Commercial
      '<div class="form-section-title">Commercial</div>'+
      '<div class="fg"><label class="flabel">Client</label><select class="fselect" name="client_id"><option value="">Select client…</option>'+opts(masters['clients-lookup']||[],(proj && proj.client_id))+'</select></div>'+
      '<div class="fg"><label class="flabel">Account Manager</label><select class="fselect" name="account_manager_id"><option value="">Select…</option>'+opts(masters['employees-lookup']||[],(proj && proj.account_manager_id))+'</select></div>'+
      '<div class="fg"><label class="flabel">Project Manager</label><select class="fselect" name="project_manager_id"><option value="">Select…</option>'+opts(masters['employees-lookup']||[],(proj && proj.project_manager_id))+'</select></div>'+
      '<div class="fg"><label class="flabel">Billing Type</label><select class="fselect" name="billing_type">'+opts(PROJ_TYPES,(proj && proj.billing_type)||'T&M')+'</select></div>'+
      '<div class="fg"><label class="flabel">Billing Cycle</label><select class="fselect" name="billing_cycle">'+opts(BILLING_CYCLE,(proj && proj.billing_cycle)||'Monthly')+'</select></div>'+
      '<div class="fg"><label class="flabel">Contract Value (₹)</label><input class="finput" type="number" name="contract_value" value="'+v((proj && proj.contract_value),0)+'"></div>'+
      '<div class="fg"><label class="flabel">Budget (₹)</label><input class="finput" type="number" name="budget" value="'+v((proj && proj.budget),0)+'"></div>'+
      '<div class="fg"><label class="flabel">PO Number</label><input class="finput" name="po_number" value="'+v((proj && proj.po_number))+'"></div>'+
      '<div class="fg"><label class="flabel">SOW Reference</label><input class="finput" name="sow_reference" value="'+v((proj && proj.sow_reference))+'"></div>'+
      // Org
      '<div class="form-section-title">Organisation</div>'+
      '<div class="fg"><label class="flabel">Department</label><select class="fselect" name="department_id"><option value="">Select…</option>'+opts(masters['departments']||[],(proj && proj.department_id))+'</select></div>'+
      '<div class="fg"><label class="flabel">Business Unit</label><select class="fselect" name="business_unit_id"><option value="">Select…</option>'+opts(masters['business-units']||[],(proj && proj.business_unit_id))+'</select></div>'+
      '<div class="fg"><label class="flabel">Cost Centre</label><select class="fselect" name="cost_centre_id"><option value="">Select…</option>'+opts(masters['cost-centres']||[],(proj && proj.cost_centre_id))+'</select></div>'+
      // Timeline
      '<div class="form-section-title">Timeline</div>'+
      '<div class="fg"><label class="flabel">Start Date</label><input class="finput" type="date" name="start_date" value="'+v((proj && proj.start_date)?String(proj.start_date).split('T')[0]:'')+'"></div>'+
      '<div class="fg"><label class="flabel">End Date</label><input class="finput" type="date" name="end_date" value="'+v((proj && proj.end_date)?String(proj.end_date).split('T')[0]:'')+'"></div>'+
      '<div class="fg"><label class="flabel">Go Live Date</label><input class="finput" type="date" name="go_live_date" value="'+v((proj && proj.go_live_date)?String(proj.go_live_date).split('T')[0]:'')+'"></div>'+
      // Description
      '<div class="fg full"><label class="flabel">Description</label><textarea class="finput" name="description" rows="3">'+v((proj && proj.description))+'</textarea></div>'+
    '</div></form>'+
    '<div class="form-actions">'+
      '<button type="button" class="btn btn-ghost" onclick="navigateTo(\''+(isEdit?'/projects/'+proj.id:'/projects')+'\')">Cancel</button>'+
      '<button type="button" class="btn btn-primary" onclick="window._saveProject()">'+( isEdit?'Save Changes':'Create Project')+'</button>'+
    '</div></div></div>'
  );

  window._saveProject = async () => {
    const data = fd('proj-form');
    try {
      if (isEdit) {
        await put('/projects/'+proj.id, data);
        toast('Project updated', 'success');
        navigate('/projects/'+proj.id);
      } else {
        const r = await post('/projects', data);
        toast('Project created! Code: '+r.code, 'success');
        navigate('/projects/'+r.id);
      }
    } catch(e) { toast(e.message, 'error'); }
  };
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    const [proj, masters] = await Promise.all([get('/projects/'+id), get('/masters/all')]);
    setPageTitle(proj.name, proj.client_name||'');
    setBreadcrumb([{ label:'Projects', url:'/projects' }, { label:proj.name }]);
    const resources  = proj.resources   || [];
    const milestones = proj.milestones  || [];
    const timesheets = proj.timesheets  || [];

    const tabs = ['overview','resources','milestones','timesheets','documents'];
    const tabLabels = { overview:'📋 Overview', resources:'👥 Resources', milestones:'🏁 Milestones', timesheets:'⏱ Timesheets', documents:'📄 Documents' };
    let activeTab = 'overview';

    function tabContent(tab) {
      switch(tab) {
        case 'overview': return (
          '<div class="card" style="margin-bottom:12px"><div class="card-header"><h3 class="card-title">Commercial</h3></div><div class="card-body"><div class="field-grid">'+
          fld('Billing Type',proj.billing_type)+fld('Billing Cycle',proj.billing_cycle)+
          fld('Contract Value',fmt.money(proj.contract_value))+fld('Budget',fmt.money(proj.budget))+
          fld('PO Number',proj.po_number,true)+fld('SOW',proj.sow_reference)+
          '</div></div></div>'+
          '<div class="card"><div class="card-header"><h3 class="card-title">Timeline</h3></div><div class="card-body"><div class="field-grid">'+
          fld('Start Date',fmt.date(proj.start_date))+fld('End Date',fmt.date(proj.end_date))+
          fld('Go Live',fmt.date(proj.go_live_date))+fld('Completion',v(proj.completion_pct,0)+'%')+
          '</div></div></div>'
        );
        case 'resources': return (
          '<div class="card"><div class="card-header"><h3 class="card-title">Team ('+resources.length+')</h3>'+
            '<button class="btn btn-ghost btn-sm" onclick="window._addResource()">+ Add</button></div>'+
          (resources.length
            ? '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Employee</th><th>Role</th><th>Allocation</th><th>Bill Rate</th><th>Actions</th></tr></thead><tbody>'+
              resources.map(r=>'<tr><td><strong>'+v(r.employee_name)+'</strong><div class="cell-sub mono">'+v(r.emp_id)+'</div></td>'+
                '<td>'+v(r.role,'—')+'</td><td>'+(r.allocation_pct||100)+'%</td><td class="mono">'+(r.bill_rate?'₹'+r.bill_rate+'/hr':'—')+'</td>'+
                '<td><button class="btn btn-danger btn-xs" onclick="window._removeResource('+r.id+')">Remove</button></td></tr>').join('')+
              '</tbody></table></div>'
            : '<div class="empty-mini">No team members assigned yet</div>')+
          '</div>'
        );
        case 'milestones': return (
          '<div class="card"><div class="card-header"><h3 class="card-title">Milestones ('+milestones.length+')</h3>'+
            '<button class="btn btn-ghost btn-sm" onclick="window._addMilestone()">+ Add</button></div>'+
          (milestones.length
            ? '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Due Date</th><th>Status</th><th>Deliverable</th></tr></thead><tbody>'+
              milestones.map(m=>'<tr><td><strong>'+v(m.title)+'</strong></td><td class="mono">'+fmt.date(m.due_date)+'</td>'+
                '<td>'+badge(m.status||'Pending')+'</td><td>'+v(m.deliverable,'—')+'</td></tr>').join('')+
              '</tbody></table></div>'
            : '<div class="empty-mini">No milestones defined</div>')+
          '</div>'
        );
        case 'timesheets': return (
          '<div class="card"><div class="card-header"><h3 class="card-title">Recent Timesheets</h3></div>'+
          (timesheets.length
            ? '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Employee</th><th>Week Ending</th><th>Hours</th><th>Status</th></tr></thead><tbody>'+
              timesheets.map(t=>'<tr><td>'+v(t.employee_name,'—')+'</td><td class="mono">'+fmt.date(t.week_ending)+'</td>'+
                '<td class="mono fw-bold">'+v(t.total_hours,0)+'h</td><td>'+badge(t.status||'Pending')+'</td></tr>').join('')+
              '</tbody></table></div>'
            : '<div class="empty-mini">No timesheets for this project yet</div>')+
          '</div>'
        );
        case 'documents':
        var docHtml = '<div class="card"><div class="card-header"><h3 class="card-title">📄 Documents</h3>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._uploadProjDoc()">+ Upload</button>' +
          '</div><div id="proj-doc-list"><div class="empty-mini">Loading…</div></div></div>';
        setTimeout(function() {
          get('/projects/' + id + '/documents').then(function(docs) {
            var el = document.getElementById('proj-doc-list'); if(!el) return;
            if (!docs || !docs.length) { el.innerHTML = '<div class="empty-mini">No documents yet</div>'; return; }
            el.innerHTML = '<div class="doc-grid">' + docs.map(function(d) {
              return '<div class="doc-card"><div class="doc-icon">📄</div>' +
                '<div class="doc-info"><div class="doc-name">' + v(d.doc_name) + '</div>' +
                '<div class="doc-meta"><span class="badge badge-gray">' + v(d.doc_type || 'Doc') + '</span>' +
                (d.file_size ? '<span class="text-muted">' + v(d.file_size) + '</span>' : '') + '</div></div>' +
                '<button class="btn btn-danger btn-xs" onclick="window._rmProjDoc(' + d.id + ')">✕</button></div>';
            }).join('') + '</div>';
          }).catch(function() { var el=document.getElementById('proj-doc-list'); if(el) el.innerHTML='<div class="empty-mini">No documents yet</div>'; });
          window._uploadProjDoc = function() {
            openModal({ title: '📎 Upload Document',
              body: '<form id="pdoc-form" class="form-grid-sm">' +
                '<div class="fg full"><label class="flabel">Document Name *</label><input class="finput" name="doc_name" required placeholder="e.g. SOW v1.2"></div>' +
                '<div class="fg"><label class="flabel">Type</label><select class="fselect" name="doc_type">' +
                ['SOW','Contract','PO','Proposal','Report','Minutes','Other'].map(function(t){return '<option>'+t+'</option>';}).join('') +
                '</select></div>' +
                '<div class="fg full"><label class="flabel">File *</label><input type="file" class="finput" id="pdoc-file" accept=".pdf,.doc,.docx,.png,.jpg,.xls,.xlsx"></div>' +
                '</form>',
              submitLabel: 'Upload',
              onSubmit: async function() {
                var data = Object.fromEntries(new FormData(document.getElementById('pdoc-form')));
                var fi = document.getElementById('pdoc-file');
                if (!fi||!fi.files||!fi.files[0]) { toast('Select a file','error'); return false; }
                var file=fi.files[0];
                var b64=await new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});
                data.file_data=b64; data.file_size=(file.size/1024).toFixed(1)+' KB'; data.mime_type=file.type;
                await post('/projects/'+id+'/documents', data);
                toast('Uploaded!','success');
                var el=document.getElementById('proj-doc-list');
                if(el) el.innerHTML='<div class="empty-mini">Reload tab to see updated list</div>';
              }
            });
          };
          window._rmProjDoc = async function(docId) {
            if(!confirm('Remove document?')) return;
            await put('/projects/documents/'+docId,{is_active:0}).catch(function(){});
            toast('Removed','info');
          };
        }, 100);
        return docHtml;
      default: return '';
      }
    }

    function sidebar() {
      return '<div class="detail-sidebar"><div class="card">'+
        '<div class="profile-hero" style="background:linear-gradient(135deg,#0f766e,#0d5c56)">'+
          '<div style="font-size:40px;margin-bottom:8px">📋</div>'+
          '<div class="profile-name">'+v(proj.name)+'</div>'+
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(proj.project_code||proj.project_type||'')+'</div>'+
          '<div style="margin-top:8px">'+badge(proj.status||'Active')+'</div>'+
        '</div>'+
        '<div class="profile-meta">'+
          '<div class="meta-row"><span>Client</span><strong>'+v(proj.client_name,'—')+'</strong></div>'+
          '<div class="meta-row"><span>PM</span><strong>'+(proj.pm_name?'<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle">'+fmt.avatar(proj.pm_name, proj.pm_photo_url, 'av-xs')+v(proj.pm_name)+'</span>':'—')+'</strong></div>'+
          '<div class="meta-row"><span>Budget</span><strong>'+fmt.money(proj.budget)+'</strong></div>'+
          '<div class="meta-row"><span>Health</span><strong>'+(proj.health_score||80)+'%</strong></div>'+
          '<div class="meta-row"><span>Completion</span>'+
            '<div style="display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end">'+
              '<div style="width:60px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">'+
                '<div style="width:'+(proj.completion_pct||0)+'%;height:100%;background:var(--green)"></div></div>'+
              '<strong>'+(proj.completion_pct||0)+'%</strong>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
          '<button class="btn btn-primary btn-full" onclick="window._editProj()">✏ Edit</button>'+
          '<button class="btn btn-ghost btn-full" onclick="navigateTo(\'/invoices/new\')">+ Create Invoice</button>'+
        '</div>'+
      '</div></div>';
    }

    setContent('<div class="detail-layout">'+
      sidebar()+
      '<div class="detail-main">'+
        '<div class="card" style="padding:14px;margin-bottom:12px">'+logoUploaderHtml('projects', proj.id)+'</div>'+
        '<div class="tab-bar">'+tabs.map(t=>'<button class="tab'+(t===activeTab?' active':'')+'" onclick="window._projTab(\''+t+'\',this)">'+tabLabels[t]+'</button>').join('')+'</div>'+
        '<div id="proj-tab">'+tabContent(activeTab)+'</div>'+
      '</div>'+
    '</div>');

    window._projTab = (tab, el) => {
      activeTab = tab;
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('proj-tab').innerHTML = tabContent(tab);
    };
    window._editProj = () => { renderProjectForm(proj, masters); };
    window._addResource = () => {
      openModal({
        title: '+ Add Team Member', size: 'md',
        body: '<form id="res-form" class="form-grid-sm">'+
          '<div class="fg full"><label class="flabel">Employee *</label><select class="fselect" name="employee_id" required><option value="">Select…</option>'+opts(masters['employees-lookup']||[],null)+'</select></div>'+
          '<div class="fg"><label class="flabel">Role</label><input class="finput" name="role" placeholder="e.g. Lead Developer"></div>'+
          '<div class="fg"><label class="flabel">Allocation %</label><input class="finput" type="number" name="allocation_pct" value="100" min="1" max="100"></div>'+
          '<div class="fg"><label class="flabel">Bill Rate (₹/hr)</label><input class="finput" type="number" name="bill_rate" value="0"></div>'+
        '</form>',
        submitLabel: 'Add',
        onSubmit: async () => {
          const data = fd('res-form');
          await post('/projects/'+id+'/resources', data);
          toast('Team member added', 'success');
          renderDetail({ id });
        }
      });
    };
    window._removeResource = async (rid) => {
      if (!confirm('Remove from project?')) return;
      await put('/projects/resources/'+rid, { is_active: 0 }).catch(()=>{});
      toast('Removed', 'info');
      renderDetail({ id });
    };
    window._addMilestone = () => {
      openModal({
        title: '+ Add Milestone',
        body: '<form id="ms-form" class="form-grid-sm">'+
          '<div class="fg full"><label class="flabel">Title *</label><input class="finput" name="title" required></div>'+
          '<div class="fg"><label class="flabel">Due Date</label><input class="finput" type="date" name="due_date"></div>'+
          '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">'+opts(['Pending','In Progress','Completed','Delayed'],'Pending')+'</select></div>'+
          '<div class="fg full"><label class="flabel">Deliverable</label><input class="finput" name="deliverable"></div>'+
        '</form>',
        submitLabel: 'Add',
        onSubmit: async () => {
          await post('/projects/'+id+'/milestones', fd('ms-form'));
          toast('Milestone added', 'success');
          renderDetail({ id });
        }
      });
    };
  } catch(e) { showError(e.message); }
}

function fld(l, val, mono) {
  return '<div class="field-item"><div class="field-label">'+l+'</div><div class="field-value'+(val?'':' empty')+(mono?' mono':'')+'">'+v(val,'—')+'</div></div>';
}
