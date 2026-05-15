import { get, post, put }  from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt, renderTable, renderPagination } from '../ui.js';
import { navigate }        from '../router.js';

export async function renderDashboard() {
  setPageTitle('Talent Acquisition', 'Recruitment overview');
  setBreadcrumb([{ label: 'Talent Acquisition' }]);
  showLoader();
  try {
    const d = await get('/recruitment/stats');
    setContent(`
      <div class="page-body">
        <div class="kpi-grid">
          ${kpi('Open Jobs',        d.open_jobs,          '📝','blue',  '/recruitment/jobs')}
          ${kpi('Candidates',       d.total_candidates,   '🎯','purple','/candidates')}
          ${kpi('Interviews Today', d.interviews_today,   '🎙','amber', '/recruitment/interviews')}
          ${kpi('Offers Pending',   d.offers_pending,     '📨','green', '/recruitment/offers')}
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Pipeline by Stage</h3>
            <a href="#/recruitment/pipeline" class="card-link">View Kanban →</a></div>
          <div class="pipeline-bars">
            ${(d.pipeline_by_stage||[]).map(s=>`
              <div class="pipeline-row">
                <div class="pipeline-label">${s.stage}</div>
                <div class="pipeline-bar-wrap">
                  <div class="pipeline-bar" style="width:${Math.min(100,(s.count||0)*8)}%;background:${s.color}"></div>
                </div>
                <div class="pipeline-count">${s.count}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`);
  } catch (e) { showError(e.message); }
}

function kpi(label, value, icon, color, link) {
  return `<a class="kpi-card kpi-${color}" href="#${link}">
    <div class="kpi-icon">${icon}</div>
    <div class="kpi-body"><div class="kpi-value">${value??0}</div><div class="kpi-label">${label}</div></div>
  </a>`;
}

export async function renderJobs() {
  setPageTitle('Job Requisitions', 'Open positions');
  setBreadcrumb([{ label: 'Talent Acquisition', url: '/recruitment' }, { label: 'Jobs' }]);
  showLoader();
  try {
    const data = await get('/recruitment/jobs');
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <input class="search-input" placeholder="Search jobs…" type="search">
          <button class="btn btn-primary" onclick="navigateTo('/recruitment/jobs/new')">+ New Job</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Code',       key: 'code' },
            { label: 'Title',      key: 'title',       render: r => `<strong>${r.title}</strong>` },
            { label: 'Client',     key: 'client_name', render: r => r.client_name||'—' },
            { label: 'Positions',  key: 'positions',   render: r => `${r.filled_positions||0}/${r.positions}` },
            { label: 'Apps',       key: 'application_count' },
            { label: 'Priority',   key: 'priority_name', render: r => r.priority_name ? `<span class="badge badge-gray">${r.priority_name}</span>` : '—' },
            { label: 'Status',     key: 'status',      render: r => badge(r.status) },
            { label: 'Target',     key: 'target_date', render: r => fmt.date(r.target_date) },
          ],
          rows,
          onRowClick: r => navigate(`/recruitment/jobs/${r.id}`),
          emptyMessage: 'No job requisitions',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderJobNew() {
  setPageTitle('New Job Requisition', '');
  setBreadcrumb([{ label: 'Jobs', url: '/recruitment/jobs' }, { label: 'New' }]);
  const masters = await get('/masters/all');
  setContent(`
    <div class="page-body"><div class="card form-card">
      <div class="card-header"><h3 class="card-title">New Job Requisition</h3></div>
      <form id="job-form" class="form-grid">
        <div class="fg"><label class="flabel">Job Title *</label><input class="finput" name="title" required></div>
        <div class="fg"><label class="flabel">Client</label>
          <select class="fselect" name="client_id"><option value="">Select client…</option>
          ${(masters['clients-lookup']||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Department</label>
          <select class="fselect" name="department_id"><option value="">Select…</option>
          ${(masters['departments']||[]).map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Positions</label><input class="finput" type="number" name="positions" value="1" min="1"></div>
        <div class="fg"><label class="flabel">Employment Type</label>
          <select class="fselect" name="employment_type_id"><option value="">Select…</option>
          ${(masters['employment-types']||[]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Location</label><input class="finput" name="location"></div>
        <div class="fg"><label class="flabel">Min Experience (yrs)</label><input class="finput" type="number" name="min_experience"></div>
        <div class="fg"><label class="flabel">Max Experience (yrs)</label><input class="finput" type="number" name="max_experience"></div>
        <div class="fg"><label class="flabel">Target Date</label><input class="finput" type="date" name="target_date"></div>
        <div class="fg"><label class="flabel">Priority</label>
          <select class="fselect" name="priority_id"><option value="">Select…</option>
          ${(masters['priority-levels']||[]).map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
          </select></div>
        <div class="fg full"><label class="flabel">Job Description</label>
          <textarea class="finput" name="description" rows="5"></textarea></div>
        <div class="fg full"><label class="flabel">Requirements</label>
          <textarea class="finput" name="requirements" rows="4"></textarea></div>
      </form>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="navigateTo('/recruitment/jobs')">Cancel</button>
        <button class="btn btn-primary" onclick="window._saveJob()">Save Job</button>
      </div>
    </div></div>`);

  window._saveJob = async () => {
    const data = Object.fromEntries(new FormData(document.getElementById('job-form')));
    Object.keys(data).forEach(k => { if (data[k]==='') data[k]=null; });
    try {
      const res = await post('/recruitment/jobs', data);
      toast('Job requisition created', 'success');
      navigate(`/recruitment/jobs/${res.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };
}

export async function renderJobDetail({ id }) {
  showLoader();
  try {
    const job = await get(`/recruitment/jobs/${id}`);
    setPageTitle(job.title, job.code);
    setBreadcrumb([{ label: 'Jobs', url: '/recruitment/jobs' }, { label: job.title }]);
    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card">
            <div class="card-body">
              <div class="meta-row"><span>Status</span>${badge(job.status)}</div>
              <div class="meta-row"><span>Client</span><strong>${job.client_name||'—'}</strong></div>
              <div class="meta-row"><span>Positions</span><strong>${job.filled_positions||0} / ${job.positions}</strong></div>
              <div class="meta-row"><span>Applications</span><strong>${job.application_count||0}</strong></div>
              <div class="meta-row"><span>Target</span><strong>${fmt.date(job.target_date)}</strong></div>
              <div class="meta-row"><span>Assigned</span><strong>${job.assigned_to_name||'—'}</strong></div>
              <button class="btn btn-primary btn-full" style="margin-top:12px" onclick="navigateTo('/recruitment/pipeline?requisition_id=${id}')">View Pipeline</button>
              <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="window._addCandidate(${id})">+ Add Candidate</button>
            </div>
          </div>
        </div>
        <div class="detail-main">
          ${job.description ? `<div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3 class="card-title">Job Description</h3></div>
            <div class="card-body prose">${job.description}</div>
          </div>` : ''}
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Applications (${(job.applications||[]).length})</h3>
            </div>
            ${job.applications?.length ? `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Candidate</th><th>Stage</th><th>Applied</th><th>Action</th></tr></thead>
              <tbody>${job.applications.map(a=>`<tr>
                <td><a href="#/candidates/${a.candidate_id}" class="link">${a.candidate_name}</a></td>
                <td>${a.stage_name ? badge(a.stage_name) : '—'}</td>
                <td class="mono">${fmt.date(a.applied_at)}</td>
                <td><a href="#/candidates/${a.candidate_id}" class="btn btn-sm btn-ghost">View</a></td>
              </tr>`).join('')}</tbody></table></div>`
            : `<div class="empty-mini">No applications yet</div>`}
          </div>
        </div>
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderCandidates() {
  setPageTitle('Candidates', 'Talent pool');
  setBreadcrumb([{ label: 'Talent Acquisition', url: '/recruitment' }, { label: 'Candidates' }]);
  showLoader();
  try {
    const data = await get('/candidates');
    const rows = data.items || [];
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <input class="search-input" placeholder="Search candidates…" type="search">
          <button class="btn btn-primary" onclick="navigateTo('/candidates/new')">+ Add Candidate</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Name',         key: 'first_name', render: r => `<strong>${r.first_name} ${r.last_name||''}</strong>` },
            { label: 'Current Role', key: 'current_designation', render: r => r.current_designation||'—' },
            { label: 'Company',      key: 'current_company',     render: r => r.current_company||'—' },
            { label: 'Exp',          key: 'total_experience',    render: r => r.total_experience ? r.total_experience+'y' : '—' },
            { label: 'CTC',          key: 'current_ctc',         render: r => fmt.money(r.current_ctc) },
            { label: 'Notice',       key: 'notice_period',       render: r => r.notice_period ? r.notice_period+'d' : '—' },
            { label: 'Source',       key: 'source_name',         render: r => r.source_name||'—' },
            { label: 'Status',       key: 'status',              render: r => badge(r.status) },
          ],
          rows,
          onRowClick: r => navigate(`/candidates/${r.id}`),
          emptyMessage: 'No candidates found',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderCandidateNew() {
  setPageTitle('New Candidate', '');
  setBreadcrumb([{ label: 'Candidates', url: '/candidates' }, { label: 'New' }]);
  const masters = await get('/masters/all');
  setContent(`
    <div class="page-body"><div class="card form-card">
      <div class="card-header"><h3 class="card-title">Add Candidate</h3></div>
      <form id="cand-form" class="form-grid">
        <div class="fg"><label class="flabel">First Name *</label><input class="finput" name="first_name" required></div>
        <div class="fg"><label class="flabel">Last Name</label><input class="finput" name="last_name"></div>
        <div class="fg"><label class="flabel">Email</label><input class="finput" type="email" name="email"></div>
        <div class="fg"><label class="flabel">Phone</label><input class="finput" name="phone"></div>
        <div class="fg"><label class="flabel">Current Company</label><input class="finput" name="current_company"></div>
        <div class="fg"><label class="flabel">Current Designation</label><input class="finput" name="current_designation"></div>
        <div class="fg"><label class="flabel">Total Experience (yrs)</label><input class="finput" type="number" step="0.5" name="total_experience"></div>
        <div class="fg"><label class="flabel">Current CTC (₹)</label><input class="finput" type="number" name="current_ctc"></div>
        <div class="fg"><label class="flabel">Expected CTC (₹)</label><input class="finput" type="number" name="expected_ctc"></div>
        <div class="fg"><label class="flabel">Notice Period (days)</label><input class="finput" type="number" name="notice_period"></div>
        <div class="fg"><label class="flabel">Source</label>
          <select class="fselect" name="source_id"><option value="">Select…</option>
          ${(masters['candidate-sources']||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
          </select></div>
        <div class="fg"><label class="flabel">Current Location</label><input class="finput" name="current_location"></div>
        <div class="fg full"><label class="flabel">Skills</label>
          <textarea class="finput" name="skills" rows="3" placeholder="Comma-separated skills…"></textarea></div>
        <div class="fg"><label class="flabel">LinkedIn URL</label><input class="finput" type="url" name="linkedin_url"></div>
      </form>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="navigateTo('/candidates')">Cancel</button>
        <button class="btn btn-primary" onclick="window._saveCand()">Save Candidate</button>
      </div>
    </div></div>`);

  window._saveCand = async () => {
    const data = Object.fromEntries(new FormData(document.getElementById('cand-form')));
    Object.keys(data).forEach(k => { if (data[k]==='') data[k]=null; });
    try {
      const res = await post('/candidates', data);
      toast('Candidate added', 'success');
      navigate(`/candidates/${res.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };
}

export async function renderCandidateDetail({ id }) {
  showLoader();
  try {
    const cand = await get(`/candidates/${id}`);
    const name = `${cand.first_name} ${cand.last_name||''}`.trim();
    setPageTitle(name, 'Candidate Profile');
    setBreadcrumb([{ label: 'Candidates', url: '/candidates' }, { label: name }]);
    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card profile-card">
            <div class="profile-hero">
              <div class="av av-lg ${fmt.avColor(name)}">${fmt.ini(name)}</div>
              <div class="profile-name">${name}</div>
              <div class="profile-title">${cand.current_designation||'—'}</div>
              <div class="profile-title">${cand.current_company||'—'}</div>
              ${badge(cand.status||'Active')}
            </div>
            <div class="profile-meta">
              <div class="meta-row"><span>Experience</span><strong>${cand.total_experience||0}y</strong></div>
              <div class="meta-row"><span>Current CTC</span><strong>${fmt.money(cand.current_ctc)}</strong></div>
              <div class="meta-row"><span>Expected</span><strong>${fmt.money(cand.expected_ctc)}</strong></div>
              <div class="meta-row"><span>Notice</span><strong>${cand.notice_period||'—'}d</strong></div>
            </div>
          </div>
        </div>
        <div class="detail-main">
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3 class="card-title">Contact</h3></div>
            <div class="card-body">
              <div class="field-grid">
                ${f('Email',    cand.email)}${f('Phone',    cand.phone)}
                ${f('Location',cand.current_location)}${f('LinkedIn', cand.linkedin_url)}
                ${f('Source',  cand.source_name)}
              </div>
            </div>
          </div>
          ${cand.skills ? `<div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3 class="card-title">Skills</h3></div>
            <div class="card-body">
              <div class="skills-wrap">${cand.skills.split(',').map(s=>`<span class="skill-tag">${s.trim()}</span>`).join('')}</div>
            </div>
          </div>` : ''}
          <div class="card">
            <div class="card-header"><h3 class="card-title">Applications</h3></div>
            ${cand.applications?.length ? `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th>Job</th><th>Stage</th><th>Applied</th></tr></thead>
              <tbody>${cand.applications.map(a=>`<tr>
                <td><a href="#/recruitment/jobs/${a.requisition_id}" class="link">${a.job_title}</a>
                <div class="cell-sub">${a.code}</div></td>
                <td>${badge(a.stage_name||a.status)}</td>
                <td class="mono">${fmt.date(a.applied_at)}</td>
              </tr>`).join('')}</tbody></table></div>`
            : `<div class="empty-mini">No applications</div>`}
          </div>
        </div>
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderPipeline() {
  setPageTitle('ATS Pipeline', 'Recruitment Kanban');
  setBreadcrumb([{ label: 'Talent Acquisition', url: '/recruitment' }, { label: 'Pipeline' }]);
  showLoader();
  try {
    const d = await get('/recruitment/pipeline');
    const stages = d.stages || [];
    const apps   = d.applications || [];

    setContent(`
      <div class="page-body">
        <div class="kanban-board">
          ${stages.map(s => {
            const stageApps = apps.filter(a => a.stage_id === s.id);
            return `<div class="kanban-col">
              <div class="kanban-header" style="border-top:3px solid ${s.color}">
                <span>${s.name}</span>
                <span class="kanban-count">${stageApps.length}</span>
              </div>
              <div class="kanban-cards">
                ${stageApps.map(a => `
                  <div class="kanban-card" onclick="navigateTo('/candidates/${a.candidate_id}')">
                    <div class="kanban-name">${a.candidate_name}</div>
                    <div class="kanban-sub">${a.current_designation||'—'}</div>
                    <div class="kanban-job">${a.job_title||'—'}</div>
                    ${a.expected_ctc ? `<div class="kanban-ctc">${fmt.money(a.expected_ctc)}</div>` : ''}
                  </div>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderInterviews() {
  setPageTitle('Interviews', 'Scheduled and completed');
  setBreadcrumb([{ label: 'Talent Acquisition', url: '/recruitment' }, { label: 'Interviews' }]);
  showLoader();
  try {
    const rows = await get('/interviews');
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <div></div>
          <button class="btn btn-primary" onclick="window._scheduleInterview()">+ Schedule Interview</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Candidate',    key: 'candidate_name', render: r => `<strong>${r.candidate_name}</strong>` },
            { label: 'Job',          key: 'job_title',      render: r => r.job_title||'—' },
            { label: 'Round',        key: 'round' },
            { label: 'Format',       key: 'format_name',    render: r => r.format_name||'—' },
            { label: 'Interviewer',  key: 'interviewer_name', render: r => r.interviewer_name||'—' },
            { label: 'Scheduled',    key: 'scheduled_at',   render: r => fmt.date(r.scheduled_at) },
            { label: 'Status',       key: 'status',         render: r => badge(r.status) },
            { label: 'Rating',       key: 'overall_rating', render: r => r.overall_rating ? '⭐'.repeat(r.overall_rating) : '—' },
          ],
          rows: Array.isArray(rows) ? rows : [],
          emptyMessage: 'No interviews scheduled',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderInterviewDetail({ id }) {
  showLoader();
  try {
    const iv = await get(`/interviews/${id}`);
    setPageTitle(`Interview — ${iv.candidate_name}`, iv.format_name || '');
    setBreadcrumb([{ label: 'Interviews', url: '/recruitment/interviews' }, { label: iv.candidate_name }]);
    setContent(`<div class="page-body"><div class="card form-card">
      <div class="card-body">
        <div class="field-grid">
          ${f('Candidate',   iv.candidate_name)}${f('Job',        iv.job_title)}
          ${f('Interviewer', iv.interviewer_name)}${f('Format',   iv.format_name)}
          ${f('Scheduled',   fmt.date(iv.scheduled_at))}${f('Duration', iv.duration_mins+'min')}
          ${f('Status',      iv.status)}${f('Rating', iv.overall_rating ? '⭐'.repeat(iv.overall_rating) : '—')}
        </div>
        ${iv.feedback ? `<div style="margin-top:16px"><strong>Feedback:</strong><p>${iv.feedback}</p></div>` : ''}
        ${iv.recommendation ? `<div><strong>Recommendation:</strong> ${iv.recommendation}</div>` : ''}
      </div>
    </div></div>`);
  } catch (e) { showError(e.message); }
}

export async function renderOffers() {
  setPageTitle('Offers', 'Offer management');
  setBreadcrumb([{ label: 'Talent Acquisition', url: '/recruitment' }, { label: 'Offers' }]);
  showLoader();
  try {
    const rows = await get('/offers');
    setContent(`
      <div class="page-body">
        <div class="list-toolbar"><div></div>
          <button class="btn btn-primary" onclick="navigateTo('/recruitment/offers/new')">+ New Offer</button>
        </div>
        ${renderTable({
          columns: [
            { label: 'Candidate', key: 'candidate_name', render: r => `<strong>${r.candidate_name}</strong>` },
            { label: 'Job',       key: 'job_title',      render: r => r.job_title||'—' },
            { label: 'CTC',       key: 'offered_ctc',    render: r => fmt.money(r.offered_ctc) },
            { label: 'Joining',   key: 'joining_date',   render: r => fmt.date(r.joining_date) },
            { label: 'Expires',   key: 'expiry_date',    render: r => fmt.date(r.expiry_date) },
            { label: 'Status',    key: 'status',         render: r => badge(r.status) },
          ],
          rows: Array.isArray(rows) ? rows : [],
          onRowClick: r => navigate(`/recruitment/offers/${r.id}`),
          emptyMessage: 'No offers yet',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderOfferDetail({ id }) {
  showLoader();
  try {
    const offer = await get(`/offers/${id}`);
    setPageTitle(`Offer — ${offer.candidate_name}`, offer.status);
    setBreadcrumb([{ label: 'Offers', url: '/recruitment/offers' }, { label: offer.candidate_name }]);
    setContent(`<div class="page-body"><div class="card form-card">
      <div class="card-header">
        <h3 class="card-title">${offer.candidate_name} — ${offer.job_title}</h3>
        <div>${badge(offer.status)}</div>
      </div>
      <div class="card-body">
        <div class="field-grid">
          ${f('Offered CTC',   fmt.money(offer.offered_ctc))}
          ${f('Joining Date',  fmt.date(offer.joining_date))}
          ${f('Offer Date',    fmt.date(offer.offer_date))}
          ${f('Expiry Date',   fmt.date(offer.expiry_date))}
        </div>
      </div>
      <div class="form-actions">
        ${offer.status === 'Sent' ? `
          <button class="btn btn-primary" onclick="window._offerAction(${id},'Accepted')">✓ Mark Accepted</button>
          <button class="btn btn-danger"  onclick="window._offerAction(${id},'Rejected')">✗ Mark Rejected</button>` : ''}
        ${offer.status === 'Draft' ? `
          <button class="btn btn-primary" onclick="window._offerAction(${id},'Sent')">Send Offer</button>` : ''}
      </div>
    </div></div>`);

    window._offerAction = async (oid, status) => {
      await put(`/offers/${oid}`, { status });
      toast(`Offer ${status.toLowerCase()}`, 'success');
      renderOfferDetail({ id: oid });
    };
  } catch (e) { showError(e.message); }
}

export async function renderOnboarding() {
  setPageTitle('Onboarding', 'New joiner management');
  setBreadcrumb([{ label: 'Talent Acquisition', url: '/recruitment' }, { label: 'Onboarding' }]);
  showLoader();
  try {
    const rows = await get('/onboarding');
    setContent(`
      <div class="page-body">
        ${renderTable({
          columns: [
            { label: 'Candidate/Employee', key: 'candidate_name', render: r => `<strong>${r.candidate_name||r.employee_name||'—'}</strong>` },
            { label: 'Job',     key: 'job_title',    render: r => r.job_title||'—' },
            { label: 'Joining', key: 'joining_date', render: r => fmt.date(r.joining_date) },
            { label: 'Status',  key: 'status',       render: r => badge(r.status) },
          ],
          rows: Array.isArray(rows) ? rows : [],
          onRowClick: r => navigate(`/recruitment/onboarding/${r.id}`),
          emptyMessage: 'No onboarding records',
        })}
      </div>`);
  } catch (e) { showError(e.message); }
}

export async function renderOnboardingDetail({ id }) {
  showLoader();
  try {
    const onb = await get(`/onboarding/${id}`);
    setPageTitle('Onboarding', onb.candidate_name || '');
    setBreadcrumb([{ label: 'Onboarding', url: '/recruitment/onboarding' }, { label: onb.candidate_name||'Detail' }]);
    setContent(`<div class="page-body"><div class="card">
      <div class="card-header"><h3 class="card-title">${onb.candidate_name||'Onboarding'}</h3>${badge(onb.status)}</div>
      <div class="card-body">
        <div class="field-grid">
          ${f('Joining Date', fmt.date(onb.joining_date))}
          ${f('Status',       onb.status)}
        </div>
        <div style="margin-top:20px">
          <h4>Tasks</h4>
          ${(onb.tasks||[]).map(t=>`
            <div class="task-row">
              <input type="checkbox" ${t.status==='Completed'?'checked':''} onchange="window._toggleTask(${t.id}, this.checked)">
              <span class="${t.status==='Completed'?'task-done':''}">${t.task_name}</span>
              <span class="task-owner">${t.owner||''}</span>
            </div>`).join('')}
        </div>
      </div>
    </div></div>`);

    window._toggleTask = async (tid, done) => {
      await put(`/onboarding/tasks/${tid}`, { status: done ? 'Completed' : 'Pending' });
    };
  } catch (e) { showError(e.message); }
}

function f(label, value) {
  return `<div class="field-item">
    <div class="field-label">${label}</div>
    <div class="field-value${!value?' empty':''}">${value||'—'}</div>
  </div>`;
}
