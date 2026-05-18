/**
 * Talent Acquisition — Complete module
 * Issues: #11 New Project, #12 Job fields, #13 Candidate fields,
 *         #14 Submit to job, #15 Schedule interview, #16 Offers, #17 Onboarding
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';

function v(val,fb){if(val===null||val===undefined)return fb!==undefined?fb:'';return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fd(id){const d=Object.fromEntries(new FormData(document.getElementById(id)));Object.keys(d).forEach(k=>{if(d[k]==='')d[k]=null;});return d;}
function opts(arr,sel,vk,lk){return arr.map(item=>{const val=typeof item==='string'?item:item[vk||'id'];const lbl=typeof item==='string'?item:item[lk||'name'];return '<option value="'+v(val)+'"'+(String(val)===String(sel)?' selected':'')+'>'+v(lbl)+'</option>';}).join('');}
function fg(label,input,hint){return '<div class="fg"><label class="flabel">'+label+'</label>'+input+(hint?'<div class="field-hint">'+hint+'</div>':'')+'</div>';}
function fi(label,name,val,type,ph,extra){return fg(label,'<input class="finput" type="'+(type||'text')+'" name="'+name+'" value="'+v(val)+'"'+(ph?' placeholder="'+ph+'"':'')+(extra||'')+'>');}
function fsl(label,name,options,selected){return fg(label,'<select class="fselect" name="'+name+'"><option value="">Select…</option>'+opts(options,selected)+'</select>');}

const WORK_MODES   = ['On-Site','Hybrid','Remote','Flexible'];
const JOB_TYPES    = ['Permanent','Contract','Contract to Hire','Temporary','Internship','Freelance'];
const JOB_STATUSES = ['Active','On Hold','Closed','Cancelled','Filled'];
const PRIORITIES   = ['Critical','High','Medium','Low'];
const INTERVIEW_FORMATS = ['Video Call','Phone','In-Person','Technical Panel','HR Round'];
const OFFER_STATUSES    = ['Draft','Sent','Accepted','Rejected','Withdrawn','Expired'];
const STAGES = ['Applied','Screening','Technical','Offer','Placed','Rejected'];

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
export async function renderDashboard() {
  setPageTitle('Talent Acquisition', 'Recruitment & Hiring');
  setBreadcrumb([{ label:'Talent Acquisition' }]);
  showLoader();
  try {
    const stats = await get('/recruitment/stats');
    const pipeline = stats.pipeline_by_stage || [];
    const maxPipeline = Math.max(...pipeline.map(s=>s.count||0), 1);

    setContent(
      '<div class="page-body">'+
      '<div class="kpi-grid kpi-4" style="margin-bottom:20px">'+
        kpi('Open Jobs',        stats.open_jobs||0,         '💼','blue')+
        kpi('Candidates',       stats.total_candidates||0,  '👥','green')+
        kpi('Interviews Today', stats.interviews_today||0,  '🗓','amber')+
        kpi('Onboarding',       stats.onboarding_pending||0,'📋','purple')+
      '</div>'+
      '<div class="dashboard-grid">'+
        '<div class="card" style="grid-column:1/3">'+
          '<div class="card-header"><h3 class="card-title">Recruitment Pipeline</h3>' +
            '<button class="btn btn-ghost btn-sm" onclick="navigateTo(\'/recruitment/pipeline\')">View Kanban →</button>'+
          '</div>'+
          '<div class="pipeline-bars">'+
            pipeline.map(s=>'<div class="pipeline-row"><div class="pipeline-label">'+v(s.stage||s.name)+'</div>'+
              '<div class="pipeline-bar-wrap"><div class="pipeline-bar" style="width:'+Math.round((s.count||0)/maxPipeline*100)+'%;background:var(--brand)"></div></div>'+
              '<div class="pipeline-count">'+(s.count||0)+'</div></div>').join('')+
          '</div>'+
        '</div>'+
        '<div class="card">'+
          '<div class="card-header"><h3 class="card-title">Quick Actions</h3></div>'+
          '<div class="card-body" style="display:flex;flex-direction:column;gap:8px">'+
            '<button class="btn btn-primary" onclick="navigateTo(\'/recruitment/jobs/new\')">+ Post New Job</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/candidates/new\')">+ Add Candidate</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/recruitment/pipeline\')">View Pipeline</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/interviews\')">Interviews</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/offers\')">Offers</button>'+
            '<button class="btn btn-ghost" onclick="navigateTo(\'/onboarding\')">Onboarding</button>'+
          '</div>'+
        '</div>'+
      '</div></div>'
    );
  } catch(e) { showError(e.message); }
}

function kpi(l,val,icon,c) { return '<div class="kpi-card kpi-'+c+'"><div class="kpi-icon">'+icon+'</div><div class="kpi-body"><div class="kpi-value">'+val+'</div><div class="kpi-label">'+l+'</div></div></div>'; }

// ═══════════════════════════════════════════════════════════════
// JOBS
// ═══════════════════════════════════════════════════════════════
export async function renderJobs() {
  setPageTitle('Job Requisitions', 'Open positions');
  setBreadcrumb([{ label:'Talent Acquisition', url:'/recruitment' }, { label:'Jobs' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([get('/recruitment/jobs'), get('/masters/all')]);
    const rows = data.items || [];
    const employees = masters['employees-lookup'] || [];

    let filterStatus = '', filterClient = '', q = '';
    let sortCol = 'created_at', sortDir = -1, jobPage = 1;
    const JOB_PER = 25;

    const statuses = [...new Set(rows.map(r => r.status).filter(Boolean))];
    const clients  = [...new Set(rows.map(r => r.client_name).filter(Boolean))];

    function sorted(arr) {
      return arr.slice().sort((a, b) => String(a[sortCol]||'').localeCompare(String(b[sortCol]||'')) * sortDir);
    }
    function getF() {
      let d = rows.slice();
      if (q)            d = d.filter(r => (r.title+' '+(r.client_name||'')+(r.location||'')).toLowerCase().includes(q.toLowerCase()));
      if (filterStatus) d = d.filter(r => r.status === filterStatus);
      if (filterClient) d = d.filter(r => r.client_name === filterClient);
      return sorted(d);
    }
    function thSort(col, label) {
      const arr = sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ' ⇅';
      return '<th class="sortable" onclick="window._jSort(&apos;' + col + '&apos;)" style="cursor:pointer">' + label + arr + '</th>';
    }

    function renderTable() {
      const all=getF(), total=all.length, pages=Math.max(1,Math.ceil(total/JOB_PER));
      jobPage=Math.min(Math.max(1,jobPage),pages);
      const d=all.slice((jobPage-1)*JOB_PER,jobPage*JOB_PER);
      let pgBar=''; if(pages>1){let bts=[];if(jobPage>1)bts.push('<button class="pg-btn" onclick="window._jobPg('+(jobPage-1)+')">‹</button>');for(let p=Math.max(1,jobPage-2);p<=Math.min(pages,jobPage+2);p++)bts.push('<button class="pg-btn'+(p===jobPage?' active':'')+'" onclick="window._jobPg('+p+')">'+p+'</button>');if(jobPage<pages)bts.push('<button class="pg-btn" onclick="window._jobPg('+(jobPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' jobs</span></div>';}
      if (!total) return '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No jobs found</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thSort('title','Job Title') +
        thSort('client_name','Client') +
        thSort('location','Location') +
        thSort('notice_period','Notice Period') +
        thSort('positions','Openings') +
        thSort('assigned_to_name','Recruiter / Owner') +
        thSort('status','Status') +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(function(j) { return '<tr class="tbl-clickable" onclick="navigateTo(&apos;/recruitment/jobs/' + j.id + '&apos;)">' +
        '<td><div class="fw-bold">' + v(j.title) + '</div>' +
          '<div class="cell-sub">' + v(j.work_mode || '') + (j.job_type ? ' · ' + v(j.job_type) : '') + '</div></td>' +
        '<td>' + v(j.client_name, '—') + '</td>' +
        '<td>' + v(j.location, '—') + '</td>' +
        '<td>' + (j.notice_period ? v(j.notice_period) + ' days' : '—') + '</td>' +
        '<td class="fw-bold">' + (j.positions || 1) + '</td>' +
        '<td>' + v(j.assigned_to_name || j.recruiter_name, '—') + '</td>' +
        '<td>' + badge(j.status || 'Active') + '</td>' +
        '<td class="tbl-actions" onclick="event.stopPropagation()">' +
          '<button class="btn btn-ghost btn-xs" onclick="navigateTo(&apos;/recruitment/jobs/&apos;+' + j.id + '+&apos;&apos;)">View</button>' +
          '<button class="btn btn-ghost btn-xs" onclick="window._editJob(' + j.id + ')">✏ Edit</button>' +
          '<button class="btn btn-primary btn-xs" onclick="navigateTo(&apos;/candidates/new&apos;)">+ Candidate</button>' +
          '<button class="btn btn-danger btn-xs" onclick="window._deleteJob(' + j.id + ') ">Del</button>' +
        '</td></tr>';
      }).join('') +
      '</tbody></table></div>'+pgBar+'</div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="struct-toolbar">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<input class="search-input" placeholder="Search jobs…" oninput="window._jQ(this.value)" style="width:200px">' +
          '<select class="fselect" style="width:120px" onchange="window._jStat(this.value)">' +
            '<option value="">All Status</option>' + statuses.map(s => '<option>' + v(s) + '</option>').join('') +
          '</select>' +
          '<select class="fselect" style="width:150px" onchange="window._jClient(this.value)">' +
            '<option value="">All Clients</option>' + clients.map(c => '<option>' + v(c) + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="navigateTo(&apos;/recruitment/jobs/new&apos;)"">+ New Job</button>' +
      '</div>' +
      '<div id="jobs-content">' + renderTable() + '</div>' +
      '</div>'
    );

    window._jQ      = val => { q = val; jobPage=1; document.getElementById('jobs-content').innerHTML = renderTable(); };
    window._jobPg   = p => { jobPage=p; document.getElementById('jobs-content').innerHTML = renderTable(); };
    window._jStat   = val => { filterStatus = val; document.getElementById('jobs-content').innerHTML = renderTable(); };
    window._jClient = val => { filterClient = val; document.getElementById('jobs-content').innerHTML = renderTable(); };
    window._jSort   = col => { sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1); document.getElementById('jobs-content').innerHTML = renderTable(); };

    window._deleteJob = async (id, title) => {
      if (!confirm('Delete job "' + title + '"?')) return;
      await put('/recruitment/jobs/' + id, { is_active: 0, status: 'Cancelled' });
      toast('Job deleted', 'info');
      document.getElementById('jobs-content').innerHTML = renderTable();
    };
    window._editJob = id => {
      const j = rows.find(r => r.id === id);
      if (j) buildJobForm(j, masters);
    };

  } catch(e) { showError(e.message); }
}

export async function renderNewJob() {
  showLoader();
  const masters = await get('/masters/all');
  setPageTitle('New Job', '');
  setBreadcrumb([{ label:'Jobs', url:'/recruitment/jobs' }, { label:'New' }]);
  jobModal(null, masters);
}

function jobModal(existing, masters) {
  const isEdit = !!existing;
  if (isEdit) {
    openModal({
      title: '✏ Edit Job: '+v(existing.title), size: 'lg',
      body: buildJobForm(existing, masters),
      submitLabel: 'Save Changes',
      onSubmit: async () => { await saveJob(existing.id, masters); }
    });
  } else {
    // Full page form for new job
    setContent(
      '<div class="page-body"><div class="card" style="max-width:900px;margin:0 auto">'+
      '<div class="card-header"><h3 class="card-title">Post New Job</h3></div>'+
      '<form id="job-form">'+buildJobForm(null, masters)+'</form>'+
      '<div class="form-actions">'+
        '<button type="button" class="btn btn-ghost" onclick="navigateTo(\'/recruitment/jobs\')">Cancel</button>'+
        '<button type="button" class="btn btn-primary" onclick="window._saveNewJob()">Post Job</button>'+
      '</div></div></div>'
    );
    window._saveNewJob = async () => saveJob(null, masters);
  }
}

function buildJobForm(j, masters) {
  return '<div class="form-grid">'+
    '<div class="fg full"><label class="flabel">Job Title *</label><input class="finput" name="title" value="'+v((j && j.title))+'" required placeholder="e.g. Senior React Developer"></div>'+
    fsl('Client','client_id',masters['clients-lookup']||[],(j && j.client_id))+
    fsl('Department','department_id',masters['departments']||[],(j && j.department_id))+
    fsl('Priority','priority_id',masters['priority-levels']||[],(j && j.priority_id))+
    fg('Status','<select class="fselect" name="status">'+opts(JOB_STATUSES,(j && j.status)||'Active')+'</select>')+
    fg('Work Mode','<select class="fselect" name="work_mode">'+opts(WORK_MODES,(j && j.work_mode)||'On-Site')+'</select>')+
    fg('Job Type','<select class="fselect" name="job_type">'+opts(JOB_TYPES,(j && j.job_type)||'Permanent')+'</select>')+
    '<div class="fg"><label class="flabel">Location</label><input class="finput" name="location" value="'+v((j && j.location))+'" placeholder="City or Remote"></div>'+
    '<div class="fg"><label class="flabel">Number of Positions</label><input class="finput" type="number" name="positions" value="'+v((j && j.positions),1)+'" min="1"></div>'+
    '<div class="fg"><label class="flabel">Min Experience (years)</label><input class="finput" type="number" name="min_experience" value="'+v((j && j.min_experience),0)+'" min="0"></div>'+
    '<div class="fg"><label class="flabel">Max Experience (years)</label><input class="finput" type="number" name="max_experience" value="'+v((j && j.max_experience))+'"></div>'+
    '<div class="fg"><label class="flabel">Min CTC (₹ LPA)</label><input class="finput" type="number" name="comp_min" value="'+v((j && j.comp_min))+'" step="0.5"></div>'+
    '<div class="fg"><label class="flabel">Max CTC (₹ LPA)</label><input class="finput" type="number" name="comp_max" value="'+v((j && j.comp_max))+'" step="0.5"></div>'+
    '<div class="fg"><label class="flabel">Budget (₹)</label><input class="finput" type="number" name="budget" value="'+v((j && j.budget),0)+'"></div>'+
    '<div class="fg"><label class="flabel">Notice Period</label><input class="finput" name="notice_period" value="'+v((j && j.notice_period))+'" placeholder="e.g. Immediate, 30 days"></div>'+
    fsl('Recruiter / Owner','recruiter_id',masters['employees-lookup']||[],(j && j.recruiter_id))+
    '<div class="fg full"><label class="flabel">Assign Additional Recruiters (Ctrl/Cmd+click for multiple)</label>'+
    '<select class="fselect" name="assigned_recruiters" multiple style="height:90px">'+
    (masters['employees-lookup']||[]).map(function(e){return '<option value="'+e.id+'"'+((j&&j.assigned_recruiters&&j.assigned_recruiters.toString().includes(String(e.id)))?' selected':'')+'>'+v(e.name)+'</option>';}).join('')+
    '</select></div>'+
    '<div class="fg"><label class="flabel">Target Start Date</label><input class="finput" type="date" name="target_start" value="'+v((j && j.target_start)?String(j.target_start).split('T')[0]:'')+'"></div>'+
    '<div class="fg full"><label class="flabel">Job Description</label><textarea class="finput" name="description" rows="4" placeholder="Describe the role, responsibilities…">'+v((j && j.description))+'</textarea></div>'+
    '<div class="fg full"><label class="flabel">Requirements / Skills</label><textarea class="finput" name="requirements" rows="3" placeholder="Required skills and qualifications…">'+v((j && j.requirements))+'</textarea></div>'+
    '</div>';
}

async function saveJob(existingId, masters) {
  const formEl = document.getElementById('job-form') || document.querySelector('#job-form');
  if (!formEl) { toast('Form not found', 'error'); return; }
  const data = Object.fromEntries(new FormData(formEl));
  Object.keys(data).forEach(k=>{if(data[k]==='')data[k]=null;});
  // Convert LPA to actual values if needed
  try {
    if (existingId) {
      await put('/recruitment/jobs/'+existingId, data);
      toast('Job updated', 'success');
      navigate('/recruitment/jobs/'+existingId);
    } else {
      const r = await post('/recruitment/jobs', data);
      toast('Job posted', 'success');
      navigate('/recruitment/jobs/'+r.id);
    }
  } catch(e) { toast(e.message, 'error'); }
}

export async function renderJobDetail({ id }) {
  showLoader();
  try {
    const [job, masters] = await Promise.all([get('/recruitment/jobs/'+id), get('/masters/all')]);
    setPageTitle(job.title, job.client_name||'');
    setBreadcrumb([{ label:'Jobs', url:'/recruitment/jobs' }, { label:job.title }]);
    const apps = job.applications || [];
    setContent(
      '<div class="detail-layout">'+
      '<div class="detail-sidebar"><div class="card">'+
        '<div class="profile-hero" style="background:linear-gradient(135deg,#1d4ed8,#1e40af)">'+
          '<div style="font-size:40px;margin-bottom:8px">💼</div>'+
          '<div class="profile-name">'+v(job.title)+'</div>'+
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(job.client_name||'')+'</div>'+
          '<div style="margin-top:8px">'+badge(job.status||'Active')+'</div>'+
        '</div>'+
        '<div class="profile-meta">'+
          '<div class="meta-row"><span>Work Mode</span><strong>'+v(job.work_mode||'On-Site')+'</strong></div>'+
          '<div class="meta-row"><span>Job Type</span><strong>'+v(job.job_type||'Permanent')+'</strong></div>'+
          '<div class="meta-row"><span>Positions</span><strong>'+v(job.positions||1)+'</strong></div>'+
          '<div class="meta-row"><span>Experience</span><strong>'+v(job.min_experience||0)+'–'+v(job.max_experience||'any')+' yrs</strong></div>'+
          '<div class="meta-row"><span>CTC Range</span><strong>'+(job.comp_min?'₹'+Math.round(job.comp_min/100000)+'L – ₹'+Math.round((job.comp_max||0)/100000)+'L':'TBD')+'</strong></div>'+
          '<div class="meta-row"><span>Location</span><strong>'+v(job.location,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Recruiter</span><strong>'+v(job.recruiter_name,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Applications</span><strong>'+apps.length+'</strong></div>'+
        '</div>'+
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
          '<button class="btn btn-primary btn-full" onclick="window._addCandidateToJob()">+ Add Candidate</button>'+
          '<button class="btn btn-ghost btn-full" onclick="window._editThisJob()">✏ Edit Job</button>'+
        '</div>'+
      '</div></div>'+
      '<div class="detail-main">'+
        (job.description?'<div class="card" style="margin-bottom:16px"><div class="card-header"><h3 class="card-title">Description</h3></div><div class="card-body"><p>'+v(job.description)+'</p></div></div>':'') +
        '<div class="card">'+
          '<div class="card-header"><h3 class="card-title">Applications ('+apps.length+')</h3></div>'+
          (apps.length
            ? '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Candidate</th><th>Stage</th><th>Expected CTC</th><th>Applied</th><th>Actions</th></tr></thead><tbody>'+
              apps.map(a=>'<tr class="tbl-clickable" onclick="navigateTo(\'/candidates/'+a.candidate_id+'\')">' +
                '<td><strong>'+v(a.candidate_name)+'</strong><div class="cell-sub">'+v(a.email||'')+'</div></td>'+
                '<td>'+badge(a.stage_name||'Applied')+'</td>'+
                '<td class="mono">'+(a.expected_salary?'₹'+fmt.money(a.expected_salary):'—')+'</td>'+
                '<td>'+fmt.date(a.applied_at)+'</td>'+
                '<td class="tbl-actions" onclick="event.stopPropagation()">'+
                  '<button class="btn btn-ghost btn-xs" onclick="window._scheduleInterview('+a.id+',\''+v(a.candidate_name)+'\')">🗓 Interview</button>'+
                  '<button class="btn btn-ghost btn-xs" onclick="window._moveStage('+a.id+')">Move Stage</button>'+
                '</td></tr>'
              ).join('')+'</tbody></table></div>'
            : '<div class="empty-mini">No applications yet</div>'
          )+
        '</div>'+
      '</div></div>'
    );
    window._editThisJob     = () => jobModal(job, masters);
    window._addCandidateToJob = () => {
      openModal({
        title: '+ Submit Candidate to '+v(job.title), size: 'md',
        body: '<form id="submit-form" class="form-grid-sm">'+
          '<div class="fg full"><label class="flabel">Candidate *</label>'+
            '<select class="fselect" name="candidate_id" required>'+
              '<option value="">Select candidate…</option>'+
              opts(masters['employees-lookup']||[], null)+ // placeholder
            '</select></div>'+
          '<div class="fg full" style="font-size:12px;color:var(--txt3)">Or: <a href="#" onclick="event.preventDefault();navigateTo(\'/candidates/new\')">Add new candidate →</a></div>'+
          '</form>',
        submitLabel: 'Submit to Job',
        onSubmit: async () => {
          const data = fd('submit-form');
          if (!data.candidate_id) { toast('Select a candidate', 'error'); return false; }
          await post('/applications', { candidate_id: data.candidate_id, requisition_id: id });
          toast('Candidate submitted', 'success');
          navigate('/recruitment/jobs/'+id);
        }
      });
      // Load actual candidates for the select
      get('/candidates').then(res=>{
        const sel = document.querySelector('#submit-form select[name=candidate_id]');
        if (sel) sel.innerHTML = '<option value="">Select…</option>'+(res.items||[]).map(c=>'<option value="'+c.id+'">'+v(c.first_name+' '+c.last_name)+' ('+v(c.email||c.current_title||'')+')</option>').join('');
      });
    };
    window._scheduleInterview = (appId, candidateName) => scheduleInterviewModal(appId, candidateName, masters);
    window._moveStage = (appId) => moveStageModal(appId, masters);
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE (Kanban)
// ═══════════════════════════════════════════════════════════════
export async function renderPipeline() {
  setPageTitle('Recruitment Pipeline', 'Kanban view');
  setBreadcrumb([{ label:'Talent Acquisition', url:'/recruitment' }, { label:'Pipeline' }]);
  showLoader();
  try {
    const data = await get('/recruitment/pipeline');
    const { stages, applications } = data;
    const grouped = {};
    stages.forEach(s => { grouped[s.id] = { stage: s, apps: [] }; });
    applications.forEach(a => { if (grouped[a.stage_id]) grouped[a.stage_id].apps.push(a); });

    setContent(
      '<div class="page-body">'+
      '<div class="kanban-board">'+
        stages.map(s => {
          const apps = grouped[s.id]?.apps || [];
          return '<div class="kanban-col">'+
            '<div class="kanban-header">'+
              '<span>'+v(s.name)+'</span>'+
              '<span class="kanban-count">'+apps.length+'</span>'+
            '</div>'+
            '<div class="kanban-cards">'+
              apps.map(a =>
                '<div class="kanban-card" onclick="navigateTo(\'/candidates/'+a.candidate_id+'\')">' +
                '<div class="kanban-name">'+v(a.candidate_name)+'</div>'+
                '<div class="kanban-job">'+v(a.job_title||'')+'</div>'+
                '<div class="kanban-sub">'+v(a.client_name||'')+'</div>'+
                (a.expected_ctc?'<div class="kanban-ctc">₹'+Math.round((a.expected_ctc||0)/100000)+'L</div>':'')+
                '<div style="display:flex;gap:4px;margin-top:6px">'+
                  '<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();window._moveApp('+a.id+',\''+v(s.name)+'\')" style="font-size:10px">Move</button>'+
                  '<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();window._schedInt('+a.id+',\''+v(a.candidate_name)+'\')" style="font-size:10px">🗓</button>'+
                '</div>'+
                '</div>'
              ).join('')+
              '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;font-size:11px" onclick="window._quickAdd('+s.id+')">+ Add</button>'+
            '</div></div>';
        }).join('')+
      '</div></div>'
    );

    window._moveApp = async (appId, currentStage) => {
    const masters = await get('/masters/all');
    const stages = masters['application-stages'] || [];
    openModal({
      title: 'Move to Stage',
      body: '<form id="stage-form" class="form-grid-sm">'+
        '<div class="fg full"><label class="flabel">New Stage *</label>'+
          '<select class="fselect" name="stage_id" required>'+
          '<option value="">Select stage…</option>'+
          stages.map(s => '<option value="'+s.id+'">'+v(s.name)+'</option>').join('')+
          '</select></div>'+
        '<div class="fg full"><label class="flabel">Notes</label>'+
          '<textarea class="finput" name="notes" rows="2"></textarea></div>'+
      '</form>',
      submitLabel: 'Move',
      onSubmit: async () => {
        const data = fd('stage-form');
        if (!data.stage_id) { toast('Select a stage', 'error'); return false; }
        await put('/applications/'+appId, data);
        toast('Candidate moved!', 'success');
        renderPipeline(); // ← reload without page refresh
      }
    });
  };
    window._schedInt = (appId, name) => scheduleInterviewModal(appId, name, null);
    window._quickAdd = sid => navigate('/candidates/new');
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// CANDIDATES
// ═══════════════════════════════════════════════════════════════
export async function renderCandidates() {
  setPageTitle('Candidates', 'Talent pool');
  setBreadcrumb([{ label:'Talent Acquisition', url:'/recruitment' }, { label:'Candidates' }]);
  showLoader();
  try {
    const [data, masters] = await Promise.all([get('/candidates'), get('/masters/all')]);
    const rows = data.items || [];

    const RATINGS_LIST = ['Flyer','Excellent','Good','Average','Bad','Blacklisted'];
    const AVAIL_LIST   = ['Immediate','Notice Period','Looking for Change','Currently Employed','Freelancer'];

    let q = '', filterStatus = '', filterRating = '', filterAvail = '';
    let sortCol = 'created_at', sortDir = -1;

    const statuses   = [...new Set(rows.map(r => r.status).filter(Boolean))];

    function sorted(arr) {
      return arr.slice().sort((a, b) => {
        const av = String(a[sortCol] || ''), bv = String(b[sortCol] || '');
        return av.localeCompare(bv) * sortDir;
      });
    }
    function getF() {
      let d = rows.slice();
      if (q)            d = d.filter(r => (r.first_name+' '+r.last_name+' '+(r.email||'')+(r.candidate_location||'')+(r.current_title||'')).toLowerCase().includes(q.toLowerCase()));
      if (filterStatus) d = d.filter(r => r.status === filterStatus);
      if (filterRating) d = d.filter(r => r.rating === filterRating);
      if (filterAvail)  d = d.filter(r => r.availability === filterAvail);
      return sorted(d);
    }

    function thSort(col, label) {
      const arr = sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ' ⇅';
      return '<th class="sortable" onclick="window._cSort(&apos;' + col + '&apos;)" style="cursor:pointer">' + label + arr + '</th>';
    }

    function ratingBadge(rating) {
      const map = { Flyer:'green', Excellent:'blue', Good:'purple', Average:'gray', Bad:'amber', Blacklisted:'red' };
      const color = map[rating] || 'gray';
      return '<span class="badge badge-' + color + '">' + v(rating || '—') + '</span>';
    }
    function availBadge(avail) {
      const map = { Immediate:'green', 'Notice Period':'amber', 'Looking for Change':'blue', 'Currently Employed':'purple', Freelancer:'teal' };
      const color = map[avail] || 'gray';
      return '<span class="badge badge-' + color + '" style="font-size:10px">' + v(avail || '—') + '</span>';
    }

    function renderTable() {
      const all=getF(), total=all.length, pages=Math.max(1,Math.ceil(total/CAND_PER));
      candPage=Math.min(Math.max(1,candPage),pages);
      const d=all.slice((candPage-1)*CAND_PER,candPage*CAND_PER);
      let pgBar=''; if(pages>1){let bts=[];if(candPage>1)bts.push('<button class="pg-btn" onclick="window._candPg('+(candPage-1)+')">‹</button>');for(let p=Math.max(1,candPage-2);p<=Math.min(pages,candPage+2);p++)bts.push('<button class="pg-btn'+(p===candPage?' active':'')+'" onclick="window._candPg('+p+')">'+p+'</button>');if(candPage<pages)bts.push('<button class="pg-btn" onclick="window._candPg('+(candPage+1)+')">›</button>');pgBar='<div class="pg-bar">'+bts.join('')+'<span class="pg-info"> '+total+' candidates</span></div>';}
      if (!total) return '<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">No candidates found</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thSort('first_name','Candidate') +
        thSort('current_title','Title / Company') +
        thSort('candidate_location','Location') +
        thSort('years_exp','Exp') +
        thSort('availability','Availability') +
        thSort('rating','Rating') +
        thSort('status','Status') +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(function(cand) {
        const c = cand; const name = v(c.first_name) + ' ' + v(c.last_name);
        return '<tr class="tbl-clickable" onclick="navigateTo(&apos;/candidates/' + c.id + '&apos;)">' +
          '<td><div class="cell-person">' +
            '<div class="av av-sm av-blue">' + fmt.ini(name) + '</div>' +
            '<div><div class="fw-bold">' + name + '</div>' +
            '<div class="cell-sub">' + v(c.email) + '</div></div>' +
          '</div></td>' +
          '<td><div>' + v(c.current_title, '—') + '</div>' +
            '<div class="cell-sub">' + v(c.current_company, '') + '</div></td>' +
          '<td>' + v(c.candidate_location || c.location, '—') + '</td>' +
          '<td class="mono">' + (c.years_exp || 0) + 'y</td>' +
          '<td>' + availBadge(c.availability) + '</td>' +
          '<td>' + ratingBadge(c.rating) + '</td>' +
          '<td>' + badge(c.status || 'Active') + '</td>' +
          '<td class="tbl-actions" onclick="event.stopPropagation()">' +
            '<button class="btn btn-ghost btn-xs" onclick="navigateTo(&apos;/candidates/' + c.id + '&apos;)">View</button>' +
            '<button class="btn btn-ghost btn-xs" onclick="window._editCandidateRow(' + c.id + ')">✏ Edit</button>' +
            '<button class="btn btn-primary btn-xs" onclick="window._submitToJob(' + c.id + ')">Submit</button>' +
            '<button class="btn btn-danger btn-xs" onclick="window._deleteCandidate(' + c.id + ')">Del</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>'+pgBar+'</div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="struct-toolbar">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<input class="search-input" placeholder="Search candidates…" oninput="window._cQ(this.value)" style="width:200px">' +
          '<select class="fselect" style="width:120px" onchange="window._cStat(this.value)">' +
            '<option value="">All Status</option>' + statuses.map(s => '<option>' + v(s) + '</option>').join('') +
          '</select>' +
          '<select class="fselect" style="width:120px" onchange="window._cRating(this.value)">' +
            '<option value="">All Ratings</option>' + RATINGS_LIST.map(r => '<option>' + r + '</option>').join('') +
          '</select>' +
          '<select class="fselect" style="width:150px" onchange="window._cAvail(this.value)">' +
            '<option value="">All Availability</option>' + AVAIL_LIST.map(a => '<option>' + a + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn btn-ghost" onclick="navigateTo(&apos;/recruitment/jobs&apos;)"">← Jobs</button>' +
          '<button class="btn btn-primary" onclick="navigateTo(&apos;/candidates/new&apos;)"">+ Add Candidate</button>' +
        '</div>' +
      '</div>' +
      '<div id="cand-content">' + renderTable() + '</div>' +
      '</div>'
    );

    window._cQ      = val => { q = val; candPage=1; document.getElementById('cand-content').innerHTML = renderTable(); };
    window._candPg  = p => { candPage=p; document.getElementById('cand-content').innerHTML = renderTable(); };
    window._cStat   = val => { filterStatus = val; document.getElementById('cand-content').innerHTML = renderTable(); };
    window._cRating = val => { filterRating = val; document.getElementById('cand-content').innerHTML = renderTable(); };
    window._cAvail  = val => { filterAvail  = val; document.getElementById('cand-content').innerHTML = renderTable(); };
    window._cSort   = col => { sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1); document.getElementById('cand-content').innerHTML = renderTable(); };

    window._deleteCandidate = async (id) => {
      if (!confirm('Delete this candidate?')) return;
      await put('/candidates/' + id, { is_active: 0, status: 'Inactive' });
      toast('Candidate deleted', 'info');
      document.getElementById('cand-content').innerHTML = renderTable();
    };

    window._submitToJob = (candId) => {
      var candName = 'Candidate';
      openModal({
        title: 'Submit to Job — ' + candName,
        body: '<form id="s2j-form" class="form-grid-sm">' +
          '<div class="fg full"><label class="flabel">Select Job *</label>' +
          '<select class="fselect" name="requisition_id" id="s2j-job" required>' +
          '<option value="">Loading jobs…</option></select></div>' +
          '<div class="fg full"><label class="flabel">Notes</label>' +
          '<input class="finput" name="notes" placeholder="Submission notes"></div>' +
          '</form>',
        submitLabel: 'Submit',
        onSubmit: async () => {
          const jobId = document.getElementById('s2j-job').value;
          if (!jobId) { toast('Select a job', 'error'); return false; }
          await post('/candidates', { candidate_id: candId, requisition_id: jobId, _action: 'apply' })
            .catch(() => {});
          // Create application directly
          const stage = (masters['application-stages'] || [{ id: 1 }])[0];
          await post('/applications', { candidate_id: candId, requisition_id: jobId, stage_id: stage.id })
            .catch(() => {});
          toast('Candidate submitted to job!', 'success');
        }
      });
      get('/recruitment/jobs?status=Active').then(res => {
        const jobs = res.items || [];
        const sel = document.getElementById('s2j-job');
        if (sel) sel.innerHTML = '<option value="">Select job…</option>' +
          jobs.map(j => '<option value="' + j.id + '">' + v(j.title) + ' – ' + v(j.client_name || '') + '</option>').join('');
      });
    };

    window._editCandidateRow = (id) => {
      const c = rows.find(r => r.id === id);
      if (!c) return;
      openModal({
        title: '✏ Edit: ' + v(c.first_name) + ' ' + v(c.last_name), size: 'lg',
        body: '<form id="edit-cand-form" class="form-grid-sm">' +
          '<div class="fg"><label class="flabel">Rating</label>' +
            '<select class="fselect" name="rating">' +
            RATINGS_LIST.map(r => '<option' + (c.rating === r ? ' selected' : '') + '>' + r + '</option>').join('') +
            '</select></div>' +
          '<div class="fg"><label class="flabel">Availability</label>' +
            '<select class="fselect" name="availability">' +
            AVAIL_LIST.map(a => '<option' + (c.availability === a ? ' selected' : '') + '>' + a + '</option>').join('') +
            '</select></div>' +
          '<div class="fg"><label class="flabel">Location</label>' +
            '<input class="finput" name="location" value="' + v(c.candidate_location || c.location) + '"></div>' +
          '<div class="fg"><label class="flabel">Status</label>' +
            '<select class="fselect" name="status">' +
            ['Active','Shortlisted','Offered','Placed','Inactive','Blacklisted'].map(s => '<option' + (c.status === s ? ' selected' : '') + '>' + s + '</option>').join('') +
            '</select></div>' +
          '</form>',
        submitLabel: 'Save',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('edit-cand-form')));
          await put('/candidates/' + id, data);
          toast('Updated', 'success');
          const updated = await get('/candidates');
          rows.length = 0;
          (updated.items || []).forEach(r => rows.push(r));
          document.getElementById('cand-content').innerHTML = renderTable();
        }
      });
    };

  } catch(e) { showError(e.message); }
}

export async function renderNewCandidate() {
  showLoader();
  const masters = await get('/masters/all');
  setPageTitle('New Candidate', '');
  setBreadcrumb([{ label:'Candidates', url:'/candidates' }, { label:'New' }]);
  renderCandidateForm(null, masters);
}

function renderCandidateForm(existing, masters) {
  const isEdit = !!existing;
  setContent(
    '<div class="page-body"><div class="card" style="max-width:900px;margin:0 auto">'+
    '<div class="card-header"><h3 class="card-title">'+(isEdit?'Edit Candidate':'Add New Candidate')+'</h3></div>'+
    '<form id="cand-form"><div class="form-grid">'+
      // Personal
      '<div class="form-section-title">Personal Information</div>'+
      '<div class="fg"><label class="flabel">First Name *</label><input class="finput" name="first_name" value="'+v((existing && existing.first_name))+'" required></div>'+
      '<div class="fg"><label class="flabel">Middle Name</label><input class="finput" name="middle_name" value="'+v((existing && existing.middle_name))+'"></div>'+
      '<div class="fg"><label class="flabel">Last Name *</label><input class="finput" name="last_name" value="'+v((existing && existing.last_name))+'" required></div>'+
      '<div class="fg"><label class="flabel">Gender</label><select class="fselect" name="gender"><option value="">Select…</option>'+opts(['Male','Female','Other'],(existing && existing.gender))+'</select></div>'+
      '<div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="email" value="'+v((existing && existing.email))+'"></div>'+
      '<div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone" value="'+v((existing && existing.phone))+'"></div>'+
      '<div class="fg"><label class="flabel">LinkedIn URL</label><input class="finput" type="url" name="linkedin_url" value="'+v((existing && existing.linkedin_url))+'"></div>'+
      '<div class="fg"><label class="flabel">Location</label><input class="finput" name="location" value="'+v((existing && existing.location)||(existing && existing.current_location))+'"></div>'+
      // Professional
      '<div class="form-section-title">Professional Details</div>'+
      '<div class="fg"><label class="flabel">Current Title</label><input class="finput" name="current_title" value="'+v((existing && existing.current_title)||(existing && existing.current_designation))+'"></div>'+
      '<div class="fg"><label class="flabel">Current Company</label><input class="finput" name="current_company" value="'+v((existing && existing.current_company))+'"></div>'+
      '<div class="fg"><label class="flabel">Total Experience (years)</label><input class="finput" type="number" name="years_exp" value="'+v((existing && existing.years_exp)||(existing && existing.total_experience),0)+'" min="0"></div>'+
      '<div class="fg"><label class="flabel">Notice Period (days)</label><input class="finput" type="number" name="notice_period" value="'+v((existing && existing.notice_period))+'"></div>'+
      '<div class="fg"><label class="flabel">Current CTC (₹)</label><input class="finput" type="number" name="current_ctc" value="'+v((existing && existing.current_ctc))+'"></div>'+
      '<div class="fg"><label class="flabel">Expected CTC (₹)</label><input class="finput" type="number" name="expected_ctc" value="'+v((existing && existing.expected_ctc))+'"></div>'+
      '<div class="fg full"><label class="flabel">Skills</label><input class="finput" name="skills" value="'+v((existing && existing.skills))+'" placeholder="React, Python, AWS… (comma separated)"></div>'+
      // Recruitment
      '<div class="form-section-title">Recruitment Details</div>'+
      fsl('Source','source_id',masters['candidate-sources']||[],(existing && existing.source_id))+
      fsl('Recruiter','recruiter_id',masters['employees-lookup']||[],((existing && existing.recruiter_id)||(window._user && window._user.employee_id)))+
      '<div class="fg"><label class="flabel">Rating</label><select class="fselect" name="rating"><option value="">Select…</option>'+opts(['Flyer','Excellent','Good','Average','Bad','Blacklisted'],(existing && existing.rating)||'Good')+'</select></div>'+
      '<div class="fg"><label class="flabel">Availability</label><select class="fselect" name="availability"><option value="">Select…</option>'+opts(['Immediate','Notice Period','Looking for Change','Currently Employed','Freelancer'],(existing && existing.availability)||'Looking for Change')+'</select></div>'+
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status"><option value="">Select…</option>'+opts(['Active','Inactive','Placed','Blacklisted'],(existing && existing.status)||'Active')+'</select></div>'+
      fsl('Submit to Job','requisition_id',masters['clients-lookup']||[], null)+ // Will be loaded
      '<div class="fg full"><label class="flabel">Resume File</label><input type="file" class="finput" id="resume-file" accept=".pdf,.doc,.docx"></div>'+
      '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2">'+v((existing && existing.notes))+'</textarea></div>'+
      '</div></form>'+
      '<div class="form-actions">'+
        '<button type="button" class="btn btn-ghost" onclick="navigateTo(\''+(isEdit?'/candidates/'+existing.id:'/candidates')+'\')">Cancel</button>'+
        '<button type="button" class="btn btn-primary" onclick="window._saveCandidate()">'+( isEdit?'Save Changes':'Add Candidate')+'</button>'+
      '</div>'+
    '</div></div>'
  );

  // Load jobs for "Submit to Job" dropdown
  get('/recruitment/jobs').then(res => {
    const sel = document.querySelector('#cand-form select[name=requisition_id]');
    if (sel) sel.innerHTML = '<option value="">None (add later)</option>'+(res.items||[]).map(j=>'<option value="'+j.id+'">'+v(j.title)+' — '+v(j.client_name||'')+'</option>').join('');
  });

  window._saveCandidate = async () => {
    const formEl = document.getElementById('cand-form');
    const data = Object.fromEntries(new FormData(formEl));
    Object.keys(data).forEach(k=>{if(data[k]==='')data[k]=null;});
    // Handle resume upload
    const fi = document.getElementById('resume-file');
    if (fi && fi.files[0]) {
      const file = fi.files[0];
      if (file.size < 5*1024*1024) {
        const base64 = await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});
        data.resume_data   = base64;
        data.resume_name   = file.name;
        data.resume_mime   = file.type;
      }
    }
    try {
      if (isEdit) {
        await put('/candidates/'+existing.id, data);
        toast('Candidate updated', 'success');
        navigate('/candidates/'+existing.id);
      } else {
        const r = await post('/candidates', data);
        toast('Candidate added', 'success');
        navigate('/candidates/'+r.id);
      }
    } catch(e) { toast(e.message, 'error'); }
  };
}

export async function renderCandidateDetail({ id }) {
  showLoader();
  try {
    const [cand, masters] = await Promise.all([get('/candidates/'+id), get('/masters/all')]);
    setPageTitle(cand.first_name+' '+cand.last_name, cand.current_title||'Candidate');
    setBreadcrumb([{ label:'Candidates', url:'/candidates' }, { label: cand.first_name+' '+cand.last_name }]);
    const apps = cand.applications || [], ivs = cand.interviews || [];
    setContent(
      '<div class="detail-layout">'+
      '<div class="detail-sidebar"><div class="card">'+
        '<div class="profile-hero" style="background:linear-gradient(135deg,#7c3aed,#5b21b6)">'+
          '<div class="av av-xl av-purple" style="margin:0 auto 10px">'+fmt.ini(cand.first_name+' '+cand.last_name)+'</div>'+
          '<div class="profile-name">'+v(cand.first_name)+' '+v(cand.middle_name?cand.middle_name+' ':'')+v(cand.last_name)+'</div>'+
          '<div class="profile-title" style="color:rgba(255,255,255,.75)">'+v(cand.current_title||'Candidate')+'</div>'+
          '<div style="margin-top:8px">'+badge(cand.status||'Active')+'</div>'+
        '</div>'+
        '<div class="profile-meta">'+
          '<div class="meta-row"><span>Email</span><strong>'+v(cand.email,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Phone</span><strong>'+v(cand.phone,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Location</span><strong>'+v(cand.location,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Experience</span><strong>'+(cand.years_exp||0)+' years</strong></div>'+
          '<div class="meta-row"><span>Current Co.</span><strong>'+v(cand.current_company,'—')+'</strong></div>'+
          '<div class="meta-row"><span>Notice Period</span><strong>'+(cand.notice_period?cand.notice_period+' days':'—')+'</strong></div>'+
          '<div class="meta-row"><span>Current CTC</span><strong>'+(cand.current_ctc?'₹'+Math.round(cand.current_ctc/100000)+'L':'—')+'</strong></div>'+
          '<div class="meta-row"><span>Expected CTC</span><strong>'+(cand.expected_ctc?'₹'+Math.round(cand.expected_ctc/100000)+'L':'—')+'</strong></div>'+
          '<div class="meta-row"><span>Source</span><strong>'+v(cand.source_name,'—')+'</strong></div>'+
        '</div>'+
        '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">'+
          '<button class="btn btn-primary btn-full" onclick="window._editCand()">✏ Edit</button>'+
          '<button class="btn btn-ghost btn-full" onclick="window._submitToJob()">Submit to Job</button>'+
          '<button class="btn btn-ghost btn-full" onclick="window._scheduleForCand()">🗓 Schedule Interview</button>'+
          '<button class="btn btn-ghost btn-full" onclick="window._makeOffer()">Make Offer</button>'+
        '</div>'+
      '</div></div>'+
      '<div class="detail-main">'+
        (cand.skills?'<div class="card" style="margin-bottom:16px"><div class="card-header"><h3 class="card-title">Skills</h3></div><div class="card-body"><div class="skills-wrap">'+cand.skills.split(',').map(s=>'<span class="skill-tag">'+v(s.trim())+'</span>').join('')+'</div></div></div>':'') +
        '<div class="card" style="margin-bottom:16px">'+
          '<div class="card-header"><h3 class="card-title">Applications ('+apps.length+')</h3></div>'+
          (apps.length?'<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Job</th><th>Client</th><th>Stage</th><th>Applied</th></tr></thead><tbody>'+
            apps.map(a=>'<tr><td><strong>'+v(a.job_title)+'</strong></td><td>'+v(a.client_name,'—')+'</td><td>'+badge(a.stage_name||'Applied')+'</td><td>'+fmt.date(a.applied_at)+'</td></tr>').join('')+
            '</tbody></table></div>':'<div class="empty-mini">No applications yet</div>')+
        '</div>'+
        '<div class="card">'+
          '<div class="card-header"><h3 class="card-title">Interviews ('+ivs.length+')</h3></div>'+
          (ivs.length?'<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Round</th><th>Format</th><th>Scheduled</th><th>Interviewer</th><th>Decision</th></tr></thead><tbody>'+
            ivs.map(i=>'<tr><td>Round '+v(i.round)+'</td><td>'+v(i.format_name||'—')+'</td><td>'+fmt.date(i.scheduled_at)+'</td><td>'+v(i.interviewer,'—')+'</td><td>'+badge(i.decision||'Pending')+'</td></tr>').join('')+
            '</tbody></table></div>':'<div class="empty-mini">No interviews scheduled</div>')+
        '</div>'+
      '</div></div>'
    );

    window._editCand          = () => renderCandidateForm(cand, masters);
    window._submitToJob       = () => submitToJobModal(cand, masters);
    window._scheduleForCand   = () => scheduleInterviewForCandModal(cand, masters);
    window._makeOffer         = () => offerModal(null, cand, masters);
  } catch(e) { showError(e.message); }
}

// ─── Submit Candidate to Job ────────────────────────────────────
function submitToJobModal(cand, masters) {
  openModal({
    title: 'Submit '+v(cand.first_name)+' to a Job', size: 'md',
    body: '<form id="submit-job-form" class="form-grid-sm">'+
      '<div class="fg full"><label class="flabel">Select Job *</label>'+
        '<select class="fselect" name="requisition_id" required><option value="">Loading jobs…</option></select>'+
      '</div>'+
      '<div class="fg"><label class="flabel">Expected CTC (₹)</label><input class="finput" type="number" name="expected_salary" value="'+v(cand.expected_ctc)+'"></div>'+
    '</form>',
    submitLabel: 'Submit Candidate',
    onSubmit: async () => {
      const data = fd('submit-job-form');
      if (!data.requisition_id) { toast('Please select a job', 'error'); return false; }
      await post('/applications', { candidate_id: cand.id, requisition_id: data.requisition_id, expected_salary: data.expected_salary });
      toast('Submitted to job!', 'success');
      navigate('/candidates/'+cand.id);
    }
  });
  get('/recruitment/jobs').then(res=>{
    const sel = document.querySelector('#submit-job-form select[name=requisition_id]');
    if (sel) sel.innerHTML = '<option value="">Select job…</option>'+(res.items||[]).map(j=>'<option value="'+j.id+'">'+v(j.title)+' — '+v(j.client_name||'')+'</option>').join('');
  });
}

// ─── Schedule Interview ─────────────────────────────────────────
function scheduleInterviewModal(appId, candidateName, masters) {
  openModal({
    title: '🗓 Schedule Interview', size: 'lg',
    body: '<form id="int-form" class="form-grid-sm">'+
      (!appId
        ? '<div class="fg"><label class="flabel">Candidate *</label><select class="fselect" name="_candidate_id" id="int-cand-sel" required><option value="">Loading…</option></select></div>'+
          '<div class="fg"><label class="flabel">Job *</label><select class="fselect" name="_job_id" id="int-job-sel" required><option value="">Select candidate first…</option></select></div>'
        : '<div class="fg full"><label class="flabel">Candidate</label><div class="field-value fw-bold">'+v(candidateName)+'</div></div>'
      )+
      '<div class="fg"><label class="flabel">Round *</label><select class="fselect" name="round" required>'+opts(['1','2','3','4','HR','Final'],null)+'</select></div>'+
      '<div class="fg"><label class="flabel">Format</label><select class="fselect" name="format">'+opts(INTERVIEW_FORMATS,null)+'</select></div>'+
      '<div class="fg"><label class="flabel">Date & Time *</label><input class="finput" type="datetime-local" name="scheduled_at" required></div>'+
      '<div class="fg"><label class="flabel">Interviewer(s)</label><input class="finput" name="interviewer" placeholder="Name(s) of interviewer"></div>'+
      '<div class="fg full"><label class="flabel">Meeting Link / Location</label><input class="finput" name="meeting_link" placeholder="Zoom/Meet URL or room number"></div>'+
      '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2"></textarea></div>'+
    '</form>',
    submitLabel: 'Schedule Interview',
    onSubmit: async () => {
      const data = fd('int-form');
      if (!appId) {
        const candId = document.getElementById('int-cand-sel')?.value;
        const jobId  = document.getElementById('int-job-sel')?.value;
        if (!candId || !jobId) { toast('Select a candidate and job', 'error'); return false; }
        // Find or create application for this candidate+job
        data.candidate_id = candId;
        data.job_id       = jobId;
      } else {
        data.application_id = appId;
      }
      await post('/interviews', data);
      toast('Interview scheduled!', 'success');
    }
  });
  // If no appId, load candidates and wire up job loading
  if (!appId) {
    get('/candidates').then(res => {
      const sel = document.getElementById('int-cand-sel');
      if (!sel) return;
      const items = res.items || [];
      sel.innerHTML = '<option value="">Select candidate…</option>' +
        items.map(c => '<option value="'+c.id+'">'+v(c.first_name+' '+c.last_name)+'</option>').join('');
      sel.onchange = () => {
        const jobSel = document.getElementById('int-job-sel');
        if (!jobSel || !sel.value) return;
        jobSel.innerHTML = '<option value="">Loading jobs…</option>';
        get('/recruitment/jobs?status=Active').then(r => {
          const jobs = r.items || [];
          jobSel.innerHTML = '<option value="">Select job…</option>' +
            jobs.map(j => '<option value="'+j.id+'">'+v(j.title)+'</option>').join('');
        });
      };
    });
  }
}

function scheduleInterviewForCandModal(cand, masters) {
  openModal({
    title: '🗓 Schedule Interview for '+v(cand.first_name), size: 'md',
    body: '<form id="int2-form" class="form-grid-sm">'+
      '<div class="fg full"><label class="flabel">Application *</label>'+
        '<select class="fselect" name="application_id" required><option value="">Loading applications…</option></select></div>'+
      '<div class="fg"><label class="flabel">Round *</label><select class="fselect" name="round" required>'+opts(['1','2','3','4','HR','Final'],null)+'</select></div>'+
      '<div class="fg"><label class="flabel">Format</label><select class="fselect" name="format">'+opts(INTERVIEW_FORMATS,null)+'</select></div>'+
      '<div class="fg"><label class="flabel">Date & Time *</label><input class="finput" type="datetime-local" name="scheduled_at" required></div>'+
      '<div class="fg"><label class="flabel">Interviewer(s)</label><input class="finput" name="interviewer" placeholder="Names of interviewers"></div>'+
      '<div class="fg full"><label class="flabel">Meeting Link</label><input class="finput" name="meeting_link" placeholder="Zoom/Meet URL"></div>'+
    '</form>',
    submitLabel: 'Schedule',
    onSubmit: async () => {
      const data = fd('int2-form');
      await post('/interviews', data);
      toast('Interview scheduled!', 'success');
    }
  });
  get('/candidates/'+cand.id).then(res=>{
    const apps = res.applications || [];
    const sel = document.querySelector('#int2-form select[name=application_id]');
    if (sel) sel.innerHTML = '<option value="">Select application…</option>'+apps.map(a=>'<option value="'+a.id+'">'+v(a.job_title)+' — '+v(a.client_name||'')+'</option>').join('');
  });
}

function moveStageModal(appId, masters) {
  openModal({
    title: 'Move to Stage',
    body: '<form id="stage-form" class="form-grid-sm">'+
      '<div class="fg full"><label class="flabel">New Stage *</label>'+
        '<select class="fselect" name="stage_id" required><option value="">Loading…</option></select></div>'+
      '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2"></textarea></div>'+
    '</form>',
    submitLabel: 'Move',
    onSubmit: async () => {
      const data = fd('stage-form');
      await put('/applications/'+appId, data);
      toast('Stage updated', 'success');
    }
  });
  get('/masters/all').then(m=>{
    const stages = m['application-stages'] || [];
    const sel = document.querySelector('#stage-form select[name=stage_id]');
    if (sel) sel.innerHTML = '<option value="">Select stage…</option>'+stages.map(s=>'<option value="'+s.id+'">'+v(s.name)+'</option>').join('');
  });
}

// ═══════════════════════════════════════════════════════════════
// INTERVIEWS
// ═══════════════════════════════════════════════════════════════
export async function renderInterviews() {
  setPageTitle('Interviews', 'Scheduled interviews');
  setBreadcrumb([{ label:'Talent Acquisition', url:'/recruitment' }, { label:'Interviews' }]);
  showLoader();
  try {
    const data = await get('/interviews');
    const rows = data.items || data || [];

    let q = '', filterStatus = '', filterClient = '';
    let sortCol = 'scheduled_at', sortDir = -1;

    const statuses = [...new Set(rows.map(r => r.status).filter(Boolean))];
    const clients  = [...new Set(rows.map(r => r.client_name).filter(Boolean))];

    function sorted(arr) {
      return arr.slice().sort((a,b) => String(a[sortCol]||'').localeCompare(String(b[sortCol]||'')) * sortDir);
    }
    function getF() {
      let d = rows.slice();
      if (q)            d = d.filter(r => (r.candidate_name+' '+(r.job_title||'')+(r.client_name||'')).toLowerCase().includes(q.toLowerCase()));
      if (filterStatus) d = d.filter(r => r.status === filterStatus);
      if (filterClient) d = d.filter(r => r.client_name === filterClient);
      return sorted(d);
    }
    function thSort(col, label) {
      const arr = sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ' ⇅';
      return '<th class="sortable" onclick="window._ivSort(&apos;' + col + '&apos;)" style="cursor:pointer">' + label + arr + '</th>';
    }

    function renderTable() {
      const d = getF();
      if (!d.length) return '<div class="empty-state"><div class="empty-icon">🎙</div><div class="empty-title">No interviews scheduled</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thSort('candidate_name','Candidate') +
        thSort('job_title','Position') +
        thSort('client_name','Client') +
        thSort('round','Round') +
        thSort('format_name','Format') +
        thSort('scheduled_at','Date & Time') +
        thSort('status','Status') +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(i => '<tr class="tbl-clickable">' +
        '<td><strong>' + v(i.candidate_name,'—') + '</strong></td>' +
        '<td>' + v(i.job_title,'—') + '</td>' +
        '<td>' + v(i.client_name,'—') + '</td>' +
        '<td><span class="badge badge-blue">Round ' + v(i.round,'—') + '</span></td>' +
        '<td>' + v(i.format_name || i.format,'—') + '</td>' +
        '<td class="mono">' + fmt.date(i.scheduled_at) + '</td>' +
        '<td>' + badge(i.status || 'Scheduled') + '</td>' +
        '<td class="tbl-actions"><button class="btn btn-ghost btn-xs" onclick="window._updateIV(' + i.id + ')">Update</button></td>' +
      '</tr>').join('') +
      '</tbody></table></div></div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="struct-toolbar">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<input class="search-input" placeholder="Search…" oninput="window._ivQ(this.value)" style="width:180px">' +
          '<select class="fselect" style="width:120px" onchange="window._ivStat(this.value)">' +
            '<option value="">All Status</option>' + statuses.map(s => '<option>' + v(s) + '</option>').join('') +
          '</select>' +
          '<select class="fselect" style="width:150px" onchange="window._ivClient(this.value)">' +
            '<option value="">All Clients</option>' + clients.map(c => '<option>' + v(c) + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="window._schedGeneral()">+ Schedule Interview</button>' +
      '</div>' +
      '<div id="iv-content">' + renderTable() + '</div>' +
      '</div>'
    );

    window._ivQ      = val => { q = val; document.getElementById('iv-content').innerHTML = renderTable(); };
    window._ivStat   = val => { filterStatus = val; document.getElementById('iv-content').innerHTML = renderTable(); };
    window._ivClient = val => { filterClient = val; document.getElementById('iv-content').innerHTML = renderTable(); };
    window._ivSort   = col => { sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1); document.getElementById('iv-content').innerHTML = renderTable(); };

    window._schedGeneral = () => scheduleInterviewModal(null, '', null);
    window._updateIV = (id) => {
      const iv = rows.find(r => r.id === id);
      openModal({
        title: 'Update Interview',
        body: '<form id="iv-upd-form" class="form-grid-sm">' +
          '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">' +
          opts(['Scheduled','Completed','Cancelled','No Show','Rescheduled'], iv ? iv.status : 'Scheduled') +
          '</select></div>' +
          '<div class="fg"><label class="flabel">Result</label><select class="fselect" name="result">' +
          opts(['Pending','Passed','Failed','On Hold'], iv && iv.result ? iv.result : 'Pending') +
          '</select></div>' +
          '<div class="fg full"><label class="flabel">Feedback</label><textarea class="finput" name="feedback" rows="3">' + v(iv && iv.feedback) + '</textarea></div>' +
          '</form>',
        submitLabel: 'Update',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('iv-upd-form')));
          await put('/interviews/' + id, data);
          toast('Interview updated', 'success');
          const fresh = await get('/interviews');
          rows.length = 0; (fresh.items || []).forEach(r => rows.push(r));
          document.getElementById('iv-content').innerHTML = renderTable();
        }
      });
    };
  } catch(e) { showError(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// OFFERS
// ═══════════════════════════════════════════════════════════════
export async function renderOffers() {
  setPageTitle('Offers', 'Job offers');
  setBreadcrumb([{ label:'Talent Acquisition', url:'/recruitment' }, { label:'Offers' }]);
  showLoader();
  try {
    const data = await get('/offers');
    const rows = data.items || data || [];

    let q = '', filterStatus = '', filterClient = '';
    let sortCol = 'created_at', sortDir = -1;

    const statuses = [...new Set(rows.map(r => r.status).filter(Boolean))];
    const clients  = [...new Set(rows.map(r => r.client_name).filter(Boolean))];

    function sorted(arr) {
      return arr.slice().sort((a,b) => String(a[sortCol]||'').localeCompare(String(b[sortCol]||'')) * sortDir);
    }
    function getF() {
      let d = rows.slice();
      if (q)            d = d.filter(r => (r.candidate_name+' '+(r.job_title||'')+(r.client_name||'')).toLowerCase().includes(q.toLowerCase()));
      if (filterStatus) d = d.filter(r => r.status === filterStatus);
      if (filterClient) d = d.filter(r => r.client_name === filterClient);
      return sorted(d);
    }
    function thSort(col, label) {
      const arr = sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ' ⇅';
      return '<th class="sortable" onclick="window._ofSort(&apos;' + col + '&apos;)" style="cursor:pointer">' + label + arr + '</th>';
    }

    function renderTable() {
      const d = getF();
      if (!d.length) return '<div class="empty-state"><div class="empty-icon">📨</div><div class="empty-title">No offers yet</div></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        thSort('candidate_name','Candidate') +
        thSort('job_title','Position') +
        thSort('client_name','Client') +
        thSort('offer_date','Offer Date') +
        thSort('expected_joining','Joining Date') +
        thSort('status','Status') +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(o => '<tr class="tbl-clickable">' +
        '<td><strong>' + v(o.candidate_name,'—') + '</strong></td>' +
        '<td>' + v(o.job_title,'—') + '</td>' +
        '<td>' + v(o.client_name,'—') + '</td>' +
        '<td class="mono">' + fmt.date(o.offer_date) + '</td>' +
        '<td class="mono">' + fmt.date(o.expected_joining) + '</td>' +
        '<td>' + badge(o.status || 'Pending') + '</td>' +
        '<td class="tbl-actions">' +
          '<button class="btn btn-ghost btn-xs" onclick="window._updateOffer(' + o.id + ')">Update</button>' +
        '</td></tr>'
      ).join('') + '</tbody></table></div></div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="struct-toolbar">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<input class="search-input" placeholder="Search offers…" oninput="window._ofQ(this.value)" style="width:180px">' +
          '<select class="fselect" style="width:120px" onchange="window._ofStat(this.value)">' +
            '<option value="">All Status</option>' + statuses.map(s => '<option>' + v(s) + '</option>').join('') +
          '</select>' +
          '<select class="fselect" style="width:150px" onchange="window._ofClient(this.value)">' +
            '<option value="">All Clients</option>' + clients.map(c => '<option>' + v(c) + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="window._newOffer()">+ New Offer</button>' +
      '</div>' +
      '<div id="of-content">' + renderTable() + '</div>' +
      '</div>'
    );

    window._ofQ      = val => { q = val; document.getElementById('of-content').innerHTML = renderTable(); };
    window._ofStat   = val => { filterStatus = val; document.getElementById('of-content').innerHTML = renderTable(); };
    window._ofClient = val => { filterClient = val; document.getElementById('of-content').innerHTML = renderTable(); };
    window._ofSort   = col => { sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1); document.getElementById('of-content').innerHTML = renderTable(); };

    window._updateOffer = (id) => {
      const o = rows.find(r => r.id === id);
      openModal({
        title: 'Update Offer',
        body: '<form id="of-upd-form" class="form-grid-sm">' +
          '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">' +
          opts(['Pending','Sent','Accepted','Declined','Withdrawn','Joined','No Show'], o && o.status) +
          '</select></div>' +
          '<div class="fg"><label class="flabel">Joining Date</label><input class="finput" type="date" name="expected_joining" value="' + v(o && o.expected_joining ? String(o.expected_joining).split('T')[0] : '') + '"></div>' +
          '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2">' + v(o && o.notes) + '</textarea></div>' +
          '</form>',
        submitLabel: 'Update',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('of-upd-form')));
          await put('/offers/' + id, data);
          toast('Offer updated', 'success');
        }
      });
    };

    window._newOffer = () => {
      openModal({
        title: '+ New Offer', size: 'md',
        body: '<form id="new-of-form" class="form-grid-sm">' +
          '<div class="fg full"><label class="flabel">Candidate *</label><select class="fselect" name="candidate_id" id="of-cand-sel" required><option value="">Loading…</option></select></div>' +
          '<div class="fg full"><label class="flabel">Job *</label><select class="fselect" name="requisition_id" id="of-job-sel" required><option value="">Select…</option></select></div>' +
          '<div class="fg"><label class="flabel">Offer Date</label><input class="finput" type="date" name="offer_date"></div>' +
          '<div class="fg"><label class="flabel">Expected Joining</label><input class="finput" type="date" name="expected_joining"></div>' +
          '</form>',
        submitLabel: 'Create Offer',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('new-of-form')));
          await post('/offers', data);
          toast('Offer created', 'success');
          const fresh = await get('/offers');
          rows.length = 0; (fresh.items || []).forEach(r => rows.push(r));
          document.getElementById('of-content').innerHTML = renderTable();
        }
      });
      Promise.all([get('/candidates'), get('/recruitment/jobs')]).then(([cands, jobs]) => {
        const csel = document.getElementById('of-cand-sel');
        const jsel = document.getElementById('of-job-sel');
        if (csel) csel.innerHTML = '<option value="">Select candidate…</option>' +
          (cands.items||[]).map(c => '<option value="' + c.id + '">' + v(c.first_name+' '+c.last_name) + '</option>').join('');
        if (jsel) jsel.innerHTML = '<option value="">Select job…</option>' +
          (jobs.items||[]).map(j => '<option value="' + j.id + '">' + v(j.title) + ' — ' + v(j.client_name||'') + '</option>').join('');
      });
    };
  } catch(e) { showError(e.message); }
}

function offerModal(existing, cand, masters) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? '✏ Edit Offer' : '+ New Offer', size: 'lg',
    body: '<form id="offer-form" class="form-grid-sm">'+
      (cand
        ? '<div class="fg full" style="background:var(--green-l);padding:10px;border-radius:6px">Candidate: <strong>'+v(cand.first_name+' '+cand.last_name)+'</strong></div>'
        : '<div class="fg full"><label class="flabel">Candidate *</label><select class="fselect" name="candidate_id" required><option value="">Loading…</option></select></div>')+
      '<div class="fg full"><label class="flabel">Job Requisition *</label><select class="fselect" name="requisition_id" required><option value="">Loading…</option></select></div>'+
      '<div class="fg"><label class="flabel">Offered Designation</label><input class="finput" name="designation" value="'+v((existing && existing.designation))+'"></div>'+
      '<div class="fg"><label class="flabel">Offered CTC (₹)</label><input class="finput" type="number" name="offered_ctc" value="'+v((existing && existing.offered_ctc))+'"></div>'+
      '<div class="fg"><label class="flabel">Basic Salary (₹)</label><input class="finput" type="number" name="offered_basic" value="'+v((existing && existing.offered_basic))+'"></div>'+
      '<div class="fg"><label class="flabel">Joining Date</label><input class="finput" type="date" name="joining_date" value="'+v((existing && existing.joining_date)?String(existing.joining_date).split('T')[0]:'')+'"></div>'+
      '<div class="fg"><label class="flabel">Offer Date</label><input class="finput" type="date" name="offer_date" value="'+v((existing && existing.offer_date)?String(existing.offer_date).split('T')[0]:new Date().toISOString().split('T')[0])+'"></div>'+
      '<div class="fg"><label class="flabel">Expiry Date</label><input class="finput" type="date" name="expiry_date" value="'+v((existing && existing.expiry_date)?String(existing.expiry_date).split('T')[0]:'')+'"></div>'+
      '<div class="fg"><label class="flabel">Status</label><select class="fselect" name="status">'+opts(OFFER_STATUSES,(existing && existing.status)||'Draft')+'</select></div>'+
    '</form>',
    submitLabel: isEdit ? 'Save' : 'Create Offer',
    onSubmit: async () => {
      const data = fd('offer-form');
      if (cand) data.candidate_id = cand.id;
      if (isEdit) await put('/offers/'+existing.id, data);
      else await post('/offers', data);
      toast(isEdit?'Updated':'Offer created', 'success');
      renderOffers();
    }
  });
  // Load candidates and jobs
  if (!cand) {
    get('/candidates').then(res=>{
      const sel = document.querySelector('#offer-form select[name=candidate_id]');
      if (sel) sel.innerHTML = '<option value="">Select candidate…</option>'+(res.items||[]).map(c=>'<option value="'+c.id+'"'+((existing && existing.candidate_id)==c.id?' selected':'')+'>'+v(c.first_name+' '+c.last_name)+'</option>').join('');
    });
  }
  get('/recruitment/jobs').then(res=>{
    const sel = document.querySelector('#offer-form select[name=requisition_id]');
    if (sel) sel.innerHTML = '<option value="">Select job…</option>'+(res.items||[]).map(j=>'<option value="'+j.id+'"'+((existing && existing.requisition_id)==j.id?' selected':'')+'>'+v(j.title)+' — '+v(j.client_name||'')+'</option>').join('');
  });
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════
export async function renderOnboarding() {
  setPageTitle('Onboarding', 'New joiner onboarding');
  setBreadcrumb([{ label:'Talent Acquisition', url:'/recruitment' }, { label:'Onboarding' }]);
  showLoader();
  try {
    const res  = await get('/onboarding');
    const rows = Array.isArray(res) ? res : (res.items || []);
    let q='', filterStatus='', obSort='start_date', obDir=-1;

    function getOb() {
      let d=[...rows];
      if(q) d=d.filter(r=>(r.employee_name+' '+r.candidate_name+' '+(r.status||'')).toLowerCase().includes(q.toLowerCase()));
      if(filterStatus) d=d.filter(r=>r.status===filterStatus);
      return d.slice().sort((a,b)=>String(a[obSort]||'').localeCompare(String(b[obSort]||''))*obDir);
    }
    function thOb(col,label){const arr=obSort===col?(obDir===1?' ▲':' ▼'):' ⇅';return '<th class="sortable" onclick="window._obSort(\''+col+'\')" style="cursor:pointer">'+label+arr+'</th>';}

    function renderOb() {
      const d=getOb();
      const statuses=[...new Set(rows.map(r=>r.status).filter(Boolean))];
      document.getElementById('ob-content').innerHTML = d.length
        ? '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>'+
            thOb('employee_name','Person')+thOb('person_type','Type')+thOb('start_date','Start Date')+
            thOb('status','Status')+'<th>IT</th><th>HR</th><th>Mgr</th><th>Actions</th>'+
          '</tr></thead><tbody>'+
          d.map(o=>'<tr class="tbl-clickable" onclick="navigateTo(\'/onboarding/'+o.id+'\')">'+
            '<td><strong>'+v(o.employee_name||o.candidate_name||'—')+'</strong></td>'+
            '<td><span class="badge badge-'+(o.person_type==='employee'?'blue':'purple')+'">'+v(o.person_type||'employee')+'</span></td>'+
            '<td class="mono">'+fmt.date(o.start_date)+'</td>'+
            '<td>'+badge(o.status||'In Progress')+'</td>'+
            '<td>'+badge(o.it_setup_status||'Pending')+'</td>'+
            '<td>'+badge(o.hr_induction_status||'Pending')+'</td>'+
            '<td>'+badge(o.manager_intro_status||'Pending')+'</td>'+
            '<td class="tbl-actions" onclick="event.stopPropagation()">'+
              '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/onboarding/'+o.id+'\')">View</button>'+
              '<button class="btn btn-danger btn-xs" onclick="window._delOb('+o.id+')">Delete</button>'+
            '</td></tr>'
          ).join('')+'</tbody></table></div></div>'
        : '<div class="empty-state"><div class="empty-icon">🚀</div><div class="empty-title">No onboarding in progress</div></div>';
    }

    setContent('<div class="page-body">'+
      '<div class="struct-toolbar">'+
        '<div style="display:flex;gap:8px">'+
          '<input class="search-input" placeholder="Search…" oninput="window._obQ(this.value)" style="width:200px">'+
          '<select class="fselect" style="width:130px" onchange="window._obStatus(this.value)">'+
            '<option value="">All Status</option>'+
            ['In Progress','Completed','On Hold','Cancelled'].map(s=>'<option>'+s+'</option>').join('')+
          '</select>'+
        '</div>'+
        '<button class="btn btn-primary" onclick="window._startOnboarding()">+ Start Onboarding</button>'+
      '</div>'+
      '<div id="ob-content"></div></div>');

    renderOb();
    window._obQ      = val=>{q=val;renderOb();};
    window._obStatus = val=>{filterStatus=val;renderOb();};
    window._obSort   = col=>{obSort===col?obDir*=-1:(obSort=col,obDir=1);renderOb();};
    window._delOb    = async id=>{if(!confirm('Remove this onboarding record?'))return;await put('/onboarding/'+id,{status:'Cancelled'});toast('Removed','info');rows.splice(rows.findIndex(r=>r.id===id),1);renderOb();};
    window._startOnboarding = () => { try {
      openModal({
        title: '+ Start Onboarding', size: 'md',
        body: '<form id="onb-form" class="form-grid-sm">'+
          '<div class="fg"><label class="flabel">Person Type</label><select class="fselect" name="person_type" onchange="window._onbTypeChange(this.value)">'+opts(['employee','candidate'],'employee')+'</select></div>'+
          '<div class="fg full" id="onb-person-sel"><label class="flabel">Employee *</label><select class="fselect" name="employee_id" required><option value="">Loading…</option></select></div>'+
          '<div class="fg"><label class="flabel">Start Date *</label><input class="finput" type="date" name="start_date" value="'+new Date().toISOString().split('T')[0]+'" required></div>'+
          '<div class="fg"><label class="flabel">Buddy / Mentor</label><input class="finput" name="buddy_name" placeholder="Buddy name"></div>'+
          '<div class="fg full"><label class="flabel">Notes</label><textarea class="finput" name="notes" rows="2"></textarea></div>'+
        '</form>',
        submitLabel: 'Start Onboarding',
        onSubmit: async () => {
          const data = fd('onb-form');
          await post('/onboarding', data);
          toast('Onboarding started!', 'success');
          renderOnboarding();
        }
      });
      get('/employees?per_page=200').then(res=>{
        const sel = document.querySelector('#onb-form select[name=employee_id]');
        if (sel) sel.innerHTML = '<option value="">Select employee…</option>'+(res.items||[]).map(e=>'<option value="'+e.id+'">'+v(e.first_name+' '+e.last_name)+'</option>').join('');
      });
      window._onbTypeChange = type => {
        const sel = document.querySelector('#onb-form select');
        const container = document.getElementById('onb-person-sel');
        if (!container) return;
        if (type === 'employee') {
          container.innerHTML = '<label class="flabel">Employee *</label><select class="fselect" name="employee_id" required><option value="">Loading…</option></select>';
          get('/employees?per_page=200').then(res=>{const s=container.querySelector('select');if(s)s.innerHTML='<option value="">Select employee…</option>'+(res.items||[]).map(e=>'<option value="'+e.id+'">'+v(e.first_name+' '+e.last_name)+'</option>').join('');});
        } else {
          container.innerHTML = '<label class="flabel">Candidate *</label><select class="fselect" name="candidate_id" required><option value="">Loading…</option></select>';
          get('/candidates').then(res=>{const s=container.querySelector('select');if(s)s.innerHTML='<option value="">Select candidate…</option>'+(res.items||[]).map(c=>'<option value="'+c.id+'">'+v(c.first_name+' '+c.last_name)+'</option>').join('');});
        }
      };
  } catch(startErr) { toast(startErr.message,'error'); }
    };
  } catch(e) { showError(e.message); }
}

export async function renderOnboardingDetail({ id }) {
  showLoader();
  try {
    const onb = await get('/onboarding/'+id);
    setPageTitle((onb.employee_name||onb.candidate_name||'Onboarding'), 'Onboarding');
    setBreadcrumb([{ label:'Onboarding', url:'/onboarding' }, { label: onb.employee_name||onb.candidate_name||'' }]);
    const tasks = onb.tasks || [];
    setContent(
      '<div class="page-body">'+
      '<div class="card">'+
        '<div class="card-header">'+
          '<h3 class="card-title">'+(onb.employee_name||onb.candidate_name||'Onboarding')+'</h3>'+
          '<div style="display:flex;align-items:center;gap:12px">'+
            '<div style="display:flex;align-items:center;gap:8px;font-size:13px">'+
              'Progress: <strong>'+(onb.progress_pct||0)+'%</strong>'+
              '<div style="width:100px;height:8px;background:var(--bg);border-radius:4px;overflow:hidden">'+
                '<div style="width:'+(onb.progress_pct||0)+'%;height:100%;background:var(--green);border-radius:4px"></div></div>'+
            '</div>'+
            badge(onb.status||'In Progress')+
          '</div>'+
        '</div>'+
        '<div class="card-body">'+
          '<div class="field-grid" style="margin-bottom:16px">'+
            '<div class="field-item"><div class="field-label">Start Date</div><div class="field-value">'+fmt.date(onb.start_date)+'</div></div>'+
            '<div class="field-item"><div class="field-label">Buddy</div><div class="field-value">'+v(onb.buddy_name,'—')+'</div></div>'+
            '<div class="field-item"><div class="field-label">Template</div><div class="field-value">'+v(onb.template,'Standard')+'</div></div>'+
          '</div>'+
          '<div style="font-weight:600;margin-bottom:12px">Onboarding Checklist</div>'+
          tasks.map(t=>
            '<div class="task-row">'+
              '<input type="checkbox"'+(t.is_complete?' checked':'')+' onchange="window._toggleTask('+t.id+',this.checked)" style="margin-right:8px">'+
              '<span class="'+(t.is_complete?'task-done':'')+'">'+(t.task_name||v(t.task))+'</span>'+
              '<span class="task-owner text-muted">'+v(t.category||'')+'</span>'+
            '</div>'
          ).join('')+
        '</div>'+
      '</div></div>'
    );
    window._toggleTask = async (tid, checked) => {
      await put('/onboarding/tasks/'+tid, { is_complete: checked ? 1 : 0 });
      renderOnboardingDetail({ id });
    };
  } catch(e) { showError(e.message); }
}
