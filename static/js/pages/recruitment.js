import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData, debounce } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

export async function renderRecruitment() {
  const stats = await API.recStats();
  setContent(`
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top-color:var(--blue)"><div class="kpi-label">Open Jobs</div><div class="kpi-value">${stats?.open_jobs||0}</div></div>
      <div class="kpi-card" style="border-top-color:var(--green)"><div class="kpi-label">Candidates</div><div class="kpi-value">${stats?.total_candidates||0}</div></div>
      <div class="kpi-card" style="border-top-color:var(--amber)"><div class="kpi-label">Interviews Today</div><div class="kpi-value">${stats?.interviews_today||0}</div></div>
      <div class="kpi-card" style="border-top-color:var(--purple)"><div class="kpi-label">Offers Pending</div><div class="kpi-value">${stats?.offers_pending||0}</div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Pipeline by Stage</div></div>
      <div class="card-body" style="display:flex;gap:20px;flex-wrap:wrap">
        ${(stats?.pipeline_by_stage||[]).map(s=>`
          <div style="text-align:center;flex:1;min-width:80px">
            <div style="font-size:28px;font-weight:800;color:${s.color||'#6b7280'}">${s.count}</div>
            <div style="font-size:11px;color:var(--txt2);margin-top:4px">${s.stage}</div>
          </div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px">
      <a href="#/recruitment/jobs" class="card" style="padding:20px;cursor:pointer;text-decoration:none;color:var(--txt);display:block">
        <div style="font-size:24px;margin-bottom:8px">📋</div>
        <div style="font-weight:600">Job Requisitions</div>
        <div style="font-size:12px;color:var(--txt3);margin-top:4px">Manage open positions</div>
      </a>
      <a href="#/recruitment/pipeline" class="card" style="padding:20px;cursor:pointer;text-decoration:none;color:var(--txt);display:block">
        <div style="font-size:24px;margin-bottom:8px">🔄</div>
        <div style="font-weight:600">ATS Pipeline</div>
        <div style="font-size:12px;color:var(--txt3);margin-top:4px">Kanban view of candidates</div>
      </a>
      <a href="#/recruitment/interviews" class="card" style="padding:20px;cursor:pointer;text-decoration:none;color:var(--txt);display:block">
        <div style="font-size:24px;margin-bottom:8px">🗓</div>
        <div style="font-weight:600">Interviews</div>
        <div style="font-size:12px;color:var(--txt3);margin-top:4px">Schedule and track interviews</div>
      </a>
    </div>
  `);
}

export async function renderJobs() {
  const data = await API.jobs({ per_page:50 });
  const rows = data?.items || [];
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Job Requisitions <span style="font-size:14px;font-weight:400;color:var(--txt2)">(${data?.total||0})</span></div>
      <button class="btn btn-primary" onclick="window._newJob()">+ New Requisition</button>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Code</th><th>Title</th><th>Client</th><th>Positions</th><th>Applications</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(j=>`<tr style="cursor:pointer" onclick="window.go('/recruitment/jobs/${j.id}')">
            <td class="td-mono">${j.code||'—'}</td>
            <td><strong>${j.title}</strong><br><small style="color:var(--txt3)">${j.department_name||''}</small></td>
            <td>${j.client_name||'—'}</td>
            <td class="td-mono">${j.filled_positions||0}/${j.positions||1}</td>
            <td class="td-mono">${j.application_count||0}</td>
            <td>${j.priority_name||'—'}</td>
            <td>${pillStatus(j.status)}</td>
          </tr>`).join('')}
          ${!rows.length?'<tr><td colspan="7"><div class="empty-state"><div class="empty-state-title">No job requisitions</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
  window._newJob = () => {
    showModal({ title:'New Job Requisition', size:'modal-lg',
      body:`<form id="jf"><div class="form-grid">
        <div class="field form-full"><label class="label">Job Title *</label><input class="input" name="title" required></div>
        <div class="field"><label class="label">Client</label>
          <select class="select" name="client_id">${buildOptions(getMaster('clients-lookup'),'id','name','','Select Client')}</select></div>
        <div class="field"><label class="label">Department</label>
          <select class="select" name="department_id">${buildOptions(getMaster('departments'),'id','name','','Select Dept')}</select></div>
        <div class="field"><label class="label">Positions</label><input class="input" type="number" name="positions" value="1" min="1"></div>
        <div class="field"><label class="label">Priority</label>
          <select class="select" name="priority_id">${buildOptions(getMaster('priority-levels'),'id','name','','Select')}</select></div>
        <div class="field"><label class="label">Target Date</label><input class="input" type="date" name="target_date"></div>
        <div class="field"><label class="label">Min Experience (yrs)</label><input class="input" type="number" name="min_experience"></div>
        <div class="field"><label class="label">Max Experience (yrs)</label><input class="input" type="number" name="max_experience"></div>
        <div class="field"><label class="label">Min Salary</label><input class="input" type="number" name="min_salary"></div>
        <div class="field"><label class="label">Max Salary</label><input class="input" type="number" name="max_salary"></div>
        <div class="field form-full"><label class="label">Description</label><textarea class="textarea" name="description"></textarea></div>
        <div class="field form-full"><label class="label">Requirements</label><textarea class="textarea" name="requirements"></textarea></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveJob()">Create</button>`,
    });
    window._saveJob = async () => {
      try { const r=await API.jobCreate(getFormData(document.getElementById('jf')));
        toast('Requisition created','success'); closeModal(); window.go(`/recruitment/jobs/${r.id}`);
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderJobDetail(id) {
  const job = await API.job(id);
  if (!job) return;
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">${job.title}</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${pillStatus(job.status)}
        <span class="td-mono" style="color:var(--txt2)">${job.code||''}</span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
      <div>
        <div class="card section-card" style="padding:20px;margin-bottom:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div><div class="org-field-label">Client</div><div class="org-field-value">${job.client_name||'—'}</div></div>
            <div><div class="org-field-label">Positions</div><div class="org-field-value">${job.filled_positions||0} / ${job.positions}</div></div>
            <div><div class="org-field-label">Target Date</div><div class="org-field-value">${fmt.date(job.target_date)}</div></div>
            <div><div class="org-field-label">Experience</div><div class="org-field-value">${job.min_experience||0}–${job.max_experience||'Any'} yrs</div></div>
            <div><div class="org-field-label">Salary Range</div><div class="org-field-value">${fmt.inr(job.min_salary)} – ${fmt.inr(job.max_salary)}</div></div>
          </div>
        </div>
        ${job.description?`<div class="card" style="padding:20px;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:8px">Description</div>
          <div style="color:var(--txt2);white-space:pre-wrap;font-size:13px">${job.description}</div>
        </div>`:''}
        <div class="card">
          <div class="card-header">
            <div class="card-title">Applications (${job.applications?.length||0})</div>
            <button class="btn btn-primary btn-sm" onclick="window._addApplication(${id})">+ Add Candidate</button>
          </div>
          <div class="table-container"><table>
            <thead><tr><th>Candidate</th><th>Stage</th><th>Applied</th><th>Status</th></tr></thead>
            <tbody>
              ${(job.applications||[]).map(a=>`<tr>
                <td><a href="#/recruitment/candidates/${a.candidate_id}">${a.candidate_name}</a>
                  <br><small style="color:var(--txt3)">${a.email||a.phone||''}</small></td>
                <td>${a.stage_name||'—'}</td>
                <td>${fmt.date(a.applied_at)}</td>
                <td>${pillStatus(a.status)}</td>
              </tr>`).join('')}
              ${!job.applications?.length?'<tr><td colspan="4" style="text-align:center;color:var(--txt3)">No applications yet</td></tr>':''}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  `);
  window._addApplication = (rid) => {
    showModal({ title:'Add Candidate to Pipeline',
      body:`<form id="af">
        <div class="field"><label class="label">Candidate</label>
          <select class="select" name="candidate_id">${buildOptions(getMaster('employees-lookup'),'id','name','','Select Candidate')}</select></div>
      </form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveApp(${rid})">Add</button>`,
    });
    window._saveApp = async (rid) => {
      const cid = document.querySelector('[name=candidate_id]')?.value;
      if (!cid) return;
      try { await API.addApplication({requisition_id:rid, candidate_id:cid});
        toast('Added to pipeline','success'); closeModal(); renderJobDetail(rid);
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderCandidates() {
  const data = await API.candidates({ per_page:50 });
  const rows = data?.items || [];
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Candidates <span style="font-size:14px;font-weight:400;color:var(--txt2)">(${data?.total||0})</span></div>
      <button class="btn btn-primary" onclick="window._newCandidate()">+ Add Candidate</button>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Name</th><th>Current Company</th><th>Experience</th><th>CTC</th><th>Notice</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(c=>`<tr style="cursor:pointer" onclick="window.go('/recruitment/candidates/${c.id}')">
            <td><strong>${c.first_name} ${c.last_name||''}</strong><br>
              <small style="color:var(--txt3)">${c.email||c.phone||''}</small></td>
            <td>${c.current_company||'—'}<br><small style="color:var(--txt3)">${c.current_designation||''}</small></td>
            <td>${c.total_experience!=null?c.total_experience+' yrs':'—'}</td>
            <td>${fmt.inr(c.current_ctc)}</td>
            <td>${c.notice_period!=null?c.notice_period+' days':'—'}</td>
            <td>${pillStatus(c.status)}</td>
          </tr>`).join('')}
          ${!rows.length?'<tr><td colspan="6"><div class="empty-state"><div class="empty-state-title">No candidates</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
  window._newCandidate = () => {
    showModal({ title:'New Candidate', size:'modal-lg',
      body:`<form id="cf"><div class="form-grid">
        <div class="field"><label class="label">First Name *</label><input class="input" name="first_name" required></div>
        <div class="field"><label class="label">Last Name</label><input class="input" name="last_name"></div>
        <div class="field"><label class="label">Email</label><input class="input" type="email" name="email"></div>
        <div class="field"><label class="label">Phone</label><input class="input" name="phone"></div>
        <div class="field"><label class="label">Current Company</label><input class="input" name="current_company"></div>
        <div class="field"><label class="label">Current Designation</label><input class="input" name="current_designation"></div>
        <div class="field"><label class="label">Total Experience (yrs)</label><input class="input" type="number" step="0.5" name="total_experience"></div>
        <div class="field"><label class="label">Current CTC (₹)</label><input class="input" type="number" name="current_ctc"></div>
        <div class="field"><label class="label">Expected CTC (₹)</label><input class="input" type="number" name="expected_ctc"></div>
        <div class="field"><label class="label">Notice Period (days)</label><input class="input" type="number" name="notice_period"></div>
        <div class="field"><label class="label">Source</label>
          <select class="select" name="source_id">${buildOptions(getMaster('candidate-sources'),'id','name','','Select Source')}</select></div>
        <div class="field form-full"><label class="label">Skills</label><textarea class="textarea" name="skills" style="min-height:60px"></textarea></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveCandidate()">Create</button>`,
    });
    window._saveCandidate = async () => {
      try { const r=await API.candidateCreate(getFormData(document.getElementById('cf')));
        toast('Candidate added','success'); closeModal(); window.go(`/recruitment/candidates/${r.id}`);
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderCandidateDetail(id) {
  const c = await API.candidate(id);
  if (!c) return;
  const name = `${c.first_name} ${c.last_name||''}`.trim();
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">${name}</div>
      ${pillStatus(c.status)}
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
      <div>
        <div class="card section-card" style="padding:20px;margin-bottom:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><div class="org-field-label">Email</div><div class="org-field-value">${c.email||'—'}</div></div>
            <div><div class="org-field-label">Phone</div><div class="org-field-value">${c.phone||'—'}</div></div>
            <div><div class="org-field-label">Current Company</div><div class="org-field-value">${c.current_company||'—'}</div></div>
            <div><div class="org-field-label">Designation</div><div class="org-field-value">${c.current_designation||'—'}</div></div>
            <div><div class="org-field-label">Experience</div><div class="org-field-value">${c.total_experience!=null?c.total_experience+' yrs':'—'}</div></div>
            <div><div class="org-field-label">Notice Period</div><div class="org-field-value">${c.notice_period!=null?c.notice_period+' days':'—'}</div></div>
            <div><div class="org-field-label">Current CTC</div><div class="org-field-value">${fmt.inr(c.current_ctc)}</div></div>
            <div><div class="org-field-label">Expected CTC</div><div class="org-field-value">${fmt.inr(c.expected_ctc)}</div></div>
          </div>
          ${c.skills?`<div style="margin-top:12px"><div class="org-field-label">Skills</div>
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">
              ${c.skills.split(',').map(s=>`<span class="pill pill-blue">${s.trim()}</span>`).join('')}
            </div></div>`:''}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Applications</div></div>
          <div class="table-container"><table>
            <thead><tr><th>Job</th><th>Stage</th><th>Applied</th><th>Status</th></tr></thead>
            <tbody>
              ${(c.applications||[]).map(a=>`<tr>
                <td><a href="#/recruitment/jobs/${a.requisition_id}">${a.job_title}</a><br>
                  <small class="td-mono" style="color:var(--txt3)">${a.code||''}</small></td>
                <td>${a.stage_name||'—'}</td>
                <td>${fmt.date(a.applied_at)}</td>
                <td>${pillStatus(a.status)}</td>
              </tr>`).join('')}
              ${!c.applications?.length?'<tr><td colspan="4" style="text-align:center;color:var(--txt3)">No applications</td></tr>':''}
            </tbody>
          </table></div>
        </div>
      </div>
      <div>
        <div class="card" style="padding:20px;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:12px">Interviews</div>
          ${(c.interviews||[]).map(i=>`<div style="padding:10px 0;border-bottom:1px solid var(--bdr)">
            <div style="font-size:12px;font-weight:600">${i.format_name||'Interview'} - Round ${i.round}</div>
            <div style="font-size:11px;color:var(--txt3)">${fmt.date(i.scheduled_at)}</div>
            <div>${pillStatus(i.status)}</div>
            ${i.overall_rating?`<div style="font-size:11px;color:var(--amber)">★ ${i.overall_rating}/5</div>`:''}
          </div>`).join('')}
          ${!c.interviews?.length?'<div style="color:var(--txt3);font-size:13px">No interviews</div>':''}
        </div>
      </div>
    </div>
  `);
}

export async function renderPipeline() {
  const data = await API.pipeline();
  if (!data) return;
  const { stages, applications } = data;

  const cols = stages.map(s => {
    const cards = applications.filter(a => a.stage_id === s.id);
    return `<div class="kanban-col">
      <div class="kanban-col-header" style="background:${s.color||'#6b7280'}22;color:${s.color||'#6b7280'}">
        <span>${s.name}</span><span>${cards.length}</span>
      </div>
      <div class="kanban-cards">
        ${cards.map(a=>`<div class="kanban-card" onclick="window.go('/recruitment/candidates/${a.candidate_id}')">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${a.candidate_name}</div>
          <div style="font-size:11px;color:var(--txt3);margin-bottom:6px">${a.current_designation||''}</div>
          <div style="font-size:11px;color:var(--txt2)">${a.job_title||'—'}</div>
          ${a.total_experience!=null?`<div style="font-size:11px;color:var(--txt3);margin-top:4px">${a.total_experience} yrs exp</div>`:''}
        </div>`).join('')}
        ${!cards.length?'<div style="text-align:center;color:var(--txt3);font-size:12px;padding:20px">Empty</div>':''}
      </div>
    </div>`;
  }).join('');

  setContent(`
    <div class="toolbar"><div class="toolbar-title">ATS Pipeline</div></div>
    <div class="kanban-board">${cols}</div>
  `);
}

export async function renderInterviews() {
  const data = await API.interviews({ per_page:50 });
  const rows = Array.isArray(data) ? data : [];
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Interviews</div>
      <button class="btn btn-primary" onclick="window._scheduleInt()">+ Schedule Interview</button>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Candidate</th><th>Job</th><th>Interviewer</th><th>Format</th><th>Scheduled</th><th>Status</th><th>Rating</th></tr></thead>
        <tbody>
          ${rows.map(i=>`<tr>
            <td>${i.candidate_name}</td>
            <td>${i.job_title||'—'}</td>
            <td>${i.interviewer_name||'—'}</td>
            <td>${i.format_name||'—'}</td>
            <td class="td-mono">${fmt.date(i.scheduled_at)}</td>
            <td>${pillStatus(i.status)}</td>
            <td>${i.overall_rating?'★'.repeat(i.overall_rating)+'☆'.repeat(5-i.overall_rating):'—'}</td>
          </tr>`).join('')}
          ${!rows.length?'<tr><td colspan="7"><div class="empty-state"><div class="empty-state-title">No interviews</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
  window._scheduleInt = () => {
    showModal({ title:'Schedule Interview', size:'modal-lg',
      body:`<form id="intf"><div class="form-grid">
        <div class="field"><label class="label">Candidate *</label>
          <select class="select" name="candidate_id">${buildOptions(getMaster('employees-lookup'),'id','name','','Select Candidate')}</select></div>
        <div class="field"><label class="label">Job Requisition</label>
          <select class="select" name="requisition_id"><option value="">None</option></select></div>
        <div class="field"><label class="label">Interviewer</label>
          <select class="select" name="interviewer_id">${buildOptions(getMaster('employees-lookup'),'id','name','','Select Interviewer')}</select></div>
        <div class="field"><label class="label">Format</label>
          <select class="select" name="format_id">${buildOptions(getMaster('interview-formats'),'id','name','','Select Format')}</select></div>
        <div class="field"><label class="label">Date & Time *</label><input class="input" type="datetime-local" name="scheduled_at"></div>
        <div class="field"><label class="label">Duration (mins)</label><input class="input" type="number" name="duration_mins" value="60"></div>
        <div class="field"><label class="label">Round</label><input class="input" type="number" name="round" value="1" min="1"></div>
        <div class="field"><label class="label">Meeting Link / Location</label><input class="input" name="meeting_link"></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveInt()">Schedule</button>`,
    });
    window._saveInt = async () => {
      try { await API.scheduleInt(getFormData(document.getElementById('intf')));
        toast('Interview scheduled','success'); closeModal(); renderInterviews();
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderOffers() {
  const rows = await API.offers() || [];
  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Offers</div>
      <button class="btn btn-primary" onclick="window._newOffer()">+ Create Offer</button>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Candidate</th><th>Job</th><th>CTC Offered</th><th>Joining Date</th><th>Expiry</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(o=>`<tr>
            <td>${o.candidate_name}</td>
            <td>${o.job_title}<br><small class="td-mono" style="color:var(--txt3)">${o.job_code||''}</small></td>
            <td class="td-mono">${fmt.inr(o.offered_ctc)}</td>
            <td>${fmt.date(o.joining_date)}</td>
            <td style="${new Date(o.expiry_date)<new Date()&&o.status==='Sent'?'color:var(--red)':''}">${fmt.date(o.expiry_date)}</td>
            <td>${pillStatus(o.status)}</td>
          </tr>`).join('')}
          ${!rows.length?'<tr><td colspan="6"><div class="empty-state"><div class="empty-state-title">No offers</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
  window._newOffer = () => {
    showModal({ title:'Create Offer', size:'modal-lg',
      body:`<form id="of"><div class="form-grid">
        <div class="field"><label class="label">Candidate *</label>
          <select class="select" name="candidate_id">${buildOptions(getMaster('employees-lookup'),'id','name','','Select Candidate')}</select></div>
        <div class="field"><label class="label">Job Requisition *</label>
          <select class="select" name="requisition_id"><option value="">Select Job</option></select></div>
        <div class="field"><label class="label">Designation</label><input class="input" name="designation"></div>
        <div class="field"><label class="label">Department</label>
          <select class="select" name="department_id">${buildOptions(getMaster('departments'),'id','name','','Select')}</select></div>
        <div class="field"><label class="label">Joining Date</label><input class="input" type="date" name="joining_date"></div>
        <div class="field"><label class="label">Offer Expiry</label><input class="input" type="date" name="expiry_date"></div>
        <div class="field"><label class="label">Offered CTC (₹)</label><input class="input" type="number" name="offered_ctc"></div>
        <div class="field"><label class="label">Basic (₹)</label><input class="input" type="number" name="offered_basic"></div>
        <div class="field"><label class="label">HRA (₹)</label><input class="input" type="number" name="offered_hra"></div>
        <div class="field"><label class="label">Allowances (₹)</label><input class="input" type="number" name="offered_allowances"></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveOffer()">Create Offer</button>`,
    });
    window._saveOffer = async () => {
      try { await API.createOffer(getFormData(document.getElementById('of')));
        toast('Offer created','success'); closeModal(); renderOffers();
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderOnboarding() {
  const rows = await API.onboarding() || [];
  setContent(`
    <div class="toolbar"><div class="toolbar-title">Onboarding</div></div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Candidate</th><th>Job</th><th>Joining Date</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(o=>`<tr>
            <td>${o.candidate_name||o.employee_name||'—'}</td>
            <td>${o.job_title||'—'}</td>
            <td>${fmt.date(o.joining_date)}</td>
            <td>${pillStatus(o.status)}</td>
          </tr>`).join('')}
          ${!rows.length?'<tr><td colspan="4"><div class="empty-state"><div class="empty-state-title">No onboarding records</div></div></td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
}
