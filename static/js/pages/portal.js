/**
 * Employee Self-Service Portal
 * My Dashboard, Profile, Timesheets, Leaves, Payslips, Team, Approvals
 */
import { get, post, put }  from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt }  from '../ui.js';
import { navigate }        from '../router.js';

// ── Portal Dashboard ──────────────────────────────────────────
export async function renderDashboard() {
  setPageTitle('My Portal', 'Self-service dashboard');
  setBreadcrumb([{ label: 'My Portal' }]);
  showLoader();
  try {
    const d = await get('/portal/dashboard');
    const e = d.employee || {};
    const name = `${e.first_name||''} ${e.last_name||''}`.trim();
    setContent(`
      <div class="page-body">
        <!-- Hero -->
        <div class="portal-hero">
          <div class="av av-xl ${fmt.avColor(name)}">${fmt.ini(name)}</div>
          <div class="portal-hero-info">
            <div class="portal-name">${name}</div>
            <div class="portal-title">${e.job_title||'—'} · ${e.department_name||'—'}</div>
            <div class="portal-meta">${e.emp_id||''} · ${e.employment_type||''} · ${e.client_name||''}</div>
          </div>
        </div>
        <!-- Stats -->
        <div class="kpi-grid kpi-4">
          ${kpi('Leave Balance',       d.leave_balance,        '🏖', 'green')}
          ${kpi('Leaves Taken',        d.leaves_taken,         '📅', 'blue')}
          ${kpi('Pending Timesheets',  d.pending_timesheets,   '⏱', 'amber')}
          ${kpi('Hours This Month',    d.approved_hours_mtd+'h','✅', 'purple')}
        </div>
        <!-- Quick Actions -->
        <div class="quick-actions">
          <a class="quick-btn" href="#/portal/timesheets">⏱ Submit Timesheet</a>
          <a class="quick-btn" href="#/portal/leaves">🏖 Apply for Leave</a>
          <a class="quick-btn" href="#/portal/profile">👤 My Profile</a>
          <a class="quick-btn" href="#/portal/payslips">💰 Payslips</a>
        </div>
      </div>`);
  } catch (e) { showError(e.message); }
}

function kpi(label, value, icon, color) {
  return `<div class="kpi-card kpi-${color}">
    <div class="kpi-icon">${icon}</div>
    <div class="kpi-body">
      <div class="kpi-value">${value ?? 0}</div>
      <div class="kpi-label">${label}</div>
    </div>
  </div>`;
}

// ── My Profile ────────────────────────────────────────────────
export async function renderProfile() {
  setPageTitle('My Profile', 'Personal information');
  setBreadcrumb([{ label: 'My Portal', url: '/portal' }, { label: 'My Profile' }]);
  showLoader();
  try {
    const d = await get('/portal/dashboard');
    const e = d.employee || {};
    const name = `${e.first_name||''} ${e.last_name||''}`.trim();

    setContent(`
      <div class="detail-layout">
        <div class="detail-sidebar">
          <div class="card profile-card">
            <div class="profile-hero">
              <div class="av av-lg ${fmt.avColor(name)}">${fmt.ini(name)}</div>
              <div class="profile-name">${name}</div>
              <div class="profile-title">${e.job_title||'—'}</div>
            </div>
            <div class="profile-nav">
              ${['personal','role','identity','finance'].map(s => `
                <div class="pnav-item" onclick="document.getElementById('psec-${s}').scrollIntoView({behavior:'smooth'})">
                  ${{personal:'👤 Personal',role:'🏢 Role & Org',identity:'🪪 Identity',finance:'💰 Finance'}[s]}
                </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="detail-main">
          ${pSection('personal','Personal Information','👤',[
            ['First Name',e.first_name],['Last Name',e.last_name],
            ['Date of Birth',fmt.date(e.dob)],['Gender',e.gender],
            ['Marital Status',e.marital_status],['Blood Group',e.blood_group],
            ['Personal Email',e.personal_email],['Personal Phone',e.personal_phone],
          ],'personal')}
          ${pSection('role','Role & Organisation','🏢',[
            ['Job Title',e.job_title],['Department',e.department_name],
            ['Business Unit',e.business_unit_name],['Employment Type',e.employment_type],
            ['Start Date',fmt.date(e.start_date)],['Reporting Manager',e.reporting_manager_name],
            ['Location',e.location],['Client',e.client_name],
          ],null)}
          ${pSection('identity','Identity & Compliance','🪪',[
            ['PAN',e.pan],['Aadhaar',e.aadhaar],
            ['Passport',e.passport_number],['PF Number',e.pf_number],
            ['ESI Number',e.esi_number],['UAN',e.uan],
          ],'identity')}
          ${pSection('finance','Finance & Banking','💰',[
            ['Bank Name',e.bank_name],['Account Number',e.bank_account_number],
            ['IFSC',e.bank_ifsc],
          ],null)}
        </div>
      </div>`);
  } catch (err) { showError(err.message); }
}

function pSection(id, title, icon, fields, editSection) {
  const editBtn = editSection ? `<button class="btn btn-ghost btn-sm" onclick="window._editProfile('${editSection}')">✏ Edit</button>` : '';
  return `<div class="card" id="psec-${id}" style="margin-bottom:16px;scroll-margin-top:20px">
    <div class="card-header"><h3 class="card-title">${icon} ${title}</h3>${editBtn}</div>
    <div class="card-body">
      <div class="field-grid">
        ${fields.map(([l,v]) => `<div class="field-item">
          <div class="field-label">${l}</div>
          <div class="field-value${!v?' empty':''}">${v||'—'}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

window._editProfile = (section) => {
  get('/portal/dashboard').then(d => {
    const e = d.employee || {};
    const fields = {
      personal: `
        <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" name="first_name" value="${e.first_name||''}"></div>
        <div class="fg"><label class="flabel">Last Name</label><input class="finput" name="last_name" value="${e.last_name||''}"></div></div>
        <div class="frow"><div class="fg"><label class="flabel">Date of Birth</label><input class="finput" type="date" name="dob" value="${e.dob||''}"></div>
        <div class="fg"><label class="flabel">Gender</label><select class="fselect" name="gender">${['','Male','Female','Non-binary'].map(g=>`<option ${e.gender===g?'selected':''}>${g}</option>`).join('')}</select></div></div>
        <div class="fg"><label class="flabel">Personal Email</label><input class="finput" type="email" name="personal_email" value="${e.personal_email||''}"></div>
        <div class="fg"><label class="flabel">Personal Phone</label><input class="finput" name="personal_phone" value="${e.personal_phone||''}"></div>`,
      identity: `
        <div class="frow"><div class="fg"><label class="flabel">PAN</label><input class="finput" name="pan" value="${e.pan||''}"></div>
        <div class="fg"><label class="flabel">Aadhaar</label><input class="finput" name="aadhaar" value="${e.aadhaar||''}"></div></div>
        <div class="frow"><div class="fg"><label class="flabel">Passport</label><input class="finput" name="passport_number" value="${e.passport_number||''}"></div>
        <div class="fg"><label class="flabel">PF Number</label><input class="finput" name="pf_number" value="${e.pf_number||''}"></div></div>`,
    };
    openModal({
      title: `Edit ${section === 'personal' ? 'Personal Information' : 'Identity'}`,
      body: `<form id="profile-form" class="form-grid-sm">${fields[section]||''}</form>`,
      submitLabel: 'Save',
      onSubmit: async () => {
        const data = Object.fromEntries(new FormData(document.getElementById('profile-form')));
        await put(`/employees/${e.id}`, data);
        toast('Profile updated', 'success');
        renderProfile();
      }
    });
  });
};

// ── My Timesheets ─────────────────────────────────────────────
export async function renderTimesheets() {
  setPageTitle('My Timesheets', 'Submit and view timesheets');
  setBreadcrumb([{ label: 'My Portal', url: '/portal' }, { label: 'Timesheets' }]);
  showLoader();
  try {
    const [rows, masters] = await Promise.all([
      get('/my/timesheets'),
      get('/masters/all'),
    ]);
    const statMap = { Approved: 'green', Rejected: 'red', Pending: 'amber' };
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <div></div>
          <button class="btn btn-primary" onclick="window._submitTs()">+ Submit Timesheet</button>
        </div>
        <div class="kpi-grid kpi-3">
          ${kpi('Total Hours',  rows.reduce((s,t)=>s+(parseFloat(t.total_hours)||0),0).toFixed(1)+'h', '⏱', 'blue')}
          ${kpi('Approved',     rows.filter(t=>t.status==='Approved').reduce((s,t)=>s+(parseFloat(t.total_hours)||0),0).toFixed(1)+'h', '✅', 'green')}
          ${kpi('Pending',      rows.filter(t=>t.status==='Pending').length, '⏳', 'amber')}
        </div>
        ${rows.length ? `<div class="card"><div class="tbl-wrap"><table class="data-table">
          <thead><tr><th>Week Ending</th><th>Project</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${rows.sort((a,b)=>new Date(b.week_ending)-new Date(a.week_ending)).map(t => `<tr>
            <td class="mono">${fmt.date(t.week_ending)}</td>
            <td>${t.project_name||t.client_name||'—'}</td>
            <td class="mono">${t.mon||0}</td><td class="mono">${t.tue||0}</td>
            <td class="mono">${t.wed||0}</td><td class="mono">${t.thu||0}</td><td class="mono">${t.fri||0}</td>
            <td class="mono fw-bold">${t.total_hours||0}h</td>
            <td>${badge(t.status||'Pending')}</td>
          </tr>`).join('')}
          </tbody></table></div></div>`
        : `<div class="empty-state"><div class="empty-icon">⏱</div><div class="empty-title">No timesheets yet</div></div>`}`);

    window._submitTs = () => {
      const today = new Date();
      const day   = today.getDay();
      const diff  = 5 - day; // days to next Friday
      const nextFri = new Date(today.getTime() + diff * 86400000);
      const weekEnding = nextFri.toISOString().split('T')[0];

      openModal({
        title: 'Submit Timesheet',
        body: `<form id="ts-form" class="form-grid-sm">
          <div class="fg"><label class="flabel">Week Ending (Friday) *</label>
            <input class="finput" type="date" name="week_ending" value="${weekEnding}" required></div>
          <div class="fg"><label class="flabel">Project / Client</label>
            <select class="fselect" name="project_id">
              <option value="">Select project…</option>
              ${(masters['clients-lookup']||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
            </select></div>
          <div class="frow">
            ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`
              <div class="fg-day"><label class="flabel">${d}</label>
              <input class="finput" type="number" name="${d.toLowerCase()}" value="0" min="0" max="24" step="0.5"></div>`).join('')}
          </div>
          <div class="fg"><label class="flabel">Notes</label>
            <textarea class="finput" name="notes" rows="2" placeholder="Optional notes…"></textarea></div>
        </form>`,
        submitLabel: 'Submit',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('ts-form')));
          await post('/my/timesheets', data);
          toast('Timesheet submitted!', 'success');
          renderTimesheets();
        }
      });
    };
  } catch (e) { showError(e.message); }
}

// ── My Leaves ──────────────────────────────────────────────────
export async function renderLeaves() {
  setPageTitle('My Leave', 'Leave management');
  setBreadcrumb([{ label: 'My Portal', url: '/portal' }, { label: 'Leave' }]);
  showLoader();
  try {
    const [d, leaves] = await Promise.all([
      get('/portal/dashboard'),
      get('/my/leaves'),
    ]);
    setContent(`
      <div class="page-body">
        <div class="list-toolbar">
          <div></div>
          <button class="btn btn-primary" onclick="window._applyLeave()">+ Apply for Leave</button>
        </div>
        <div class="kpi-grid kpi-4">
          ${kpi('Balance',  d.leave_balance,  '🏖','green')}
          ${kpi('Taken',    d.leaves_taken,   '📅','blue')}
          ${kpi('Pending',  leaves.filter(l=>l.status==='Pending').length, '⏳','amber')}
          ${kpi('Approved', leaves.filter(l=>l.status==='Approved').length,'✅','purple')}
        </div>
        ${leaves.length ? `<div class="card"><div class="tbl-wrap"><table class="data-table">
          <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>${leaves.sort((a,b)=>new Date(b.from_date)-new Date(a.from_date)).map(l=>`<tr>
            <td><strong>${l.leave_type||'Annual'}</strong></td>
            <td class="mono">${fmt.date(l.from_date)}</td>
            <td class="mono">${fmt.date(l.to_date)}</td>
            <td class="mono fw-bold">${l.days||1}</td>
            <td class="text-muted">${l.reason||'—'}</td>
            <td>${badge(l.status||'Pending')}</td>
          </tr>`).join('')}</tbody></table></div></div>`
        : `<div class="empty-state"><div class="empty-icon">🏖</div><div class="empty-title">No leave requests</div></div>`}`);

    window._applyLeave = () => {
      openModal({
        title: 'Apply for Leave',
        body: `<form id="leave-form" class="form-grid-sm">
          <div class="fg"><label class="flabel">Leave Type *</label>
            <select class="fselect" name="leave_type" required>
              ${['Annual','Sick','Personal','Emergency','Maternity','Paternity','Unpaid'].map(t=>`<option>${t}</option>`).join('')}
            </select></div>
          <div class="frow">
            <div class="fg"><label class="flabel">From Date *</label><input class="finput" type="date" name="from_date" required></div>
            <div class="fg"><label class="flabel">To Date *</label><input class="finput" type="date" name="to_date" required></div>
          </div>
          <div class="fg"><label class="flabel">Reason</label>
            <textarea class="finput" name="reason" rows="3" placeholder="Reason for leave…"></textarea></div>
        </form>`,
        submitLabel: 'Submit Request',
        onSubmit: async () => {
          const data = Object.fromEntries(new FormData(document.getElementById('leave-form')));
          await post('/my/leaves', data);
          toast('Leave request submitted!', 'success');
          renderLeaves();
        }
      });
    };
  } catch (e) { showError(e.message); }
}

// ── Payslips ──────────────────────────────────────────────────
export async function renderPayslips() {
  setPageTitle('My Payslips', 'Salary statements');
  setBreadcrumb([{ label: 'My Portal', url: '/portal' }, { label: 'Payslips' }]);
  showLoader();
  try {
    const rows = await get('/portal/payslips');
    setContent(`
      <div class="page-body">
        ${rows.length ? `<div class="card"><div class="tbl-wrap"><table class="data-table">
          <thead><tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead>
          <tbody>${rows.map(p=>`<tr>
            <td class="mono">${p.month||''}/${p.year||''}</td>
            <td class="mono">${fmt.money(p.gross_salary)}</td>
            <td class="mono text-red">${fmt.money(p.total_deductions)}</td>
            <td class="mono fw-bold text-green">${fmt.money(p.net_salary)}</td>
            <td>${badge(p.status||'Paid')}</td>
          </tr>`).join('')}</tbody></table></div></div>`
        : `<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No payslips yet</div><div class="empty-sub">Payslips appear here once processed by Finance</div></div>`}
      </div>`);
  } catch (e) { showError(e.message); }
}

// ── My Team ───────────────────────────────────────────────────
export async function renderTeam() {
  setPageTitle('My Team', 'Org chart and colleagues');
  setBreadcrumb([{ label: 'My Portal', url: '/portal' }, { label: 'My Team' }]);
  showLoader();
  try {
    const t = await get('/portal/team');
    const card = (emp, role, color) => {
      const n = `${emp.first_name||''} ${emp.last_name||''}`.trim();
      return `<div class="team-card">
        <div class="av av-md ${fmt.avColor(n)}">${fmt.ini(n)}</div>
        <div class="team-info">
          <div class="team-name">${n}</div>
          <div class="team-title">${emp.job_title||'—'}</div>
        </div>
        <span class="badge badge-${color}">${role}</span>
      </div>`;
    };
    setContent(`
      <div class="page-body">
        ${t.manager ? `<div class="team-section"><div class="section-label">📊 Reporting Manager</div>
          <div class="team-grid">${card(t.manager,'Manager','purple')}</div></div>` : ''}
        ${t.peers?.length ? `<div class="team-section"><div class="section-label">🤝 Peers (${t.peers.length})</div>
          <div class="team-grid">${t.peers.map(p=>card(p,'Peer','blue')).join('')}</div></div>` : ''}
        ${t.reportees?.length ? `<div class="team-section"><div class="section-label">👤 My Reportees (${t.reportees.length})</div>
          <div class="team-grid">${t.reportees.map(r=>card(r,'Reportee','green')).join('')}</div></div>` : ''}
        ${!t.manager&&!t.peers?.length&&!t.reportees?.length ? `<div class="empty-state"><div class="empty-icon">👥</div>
          <div class="empty-title">No team configured</div>
          <div class="empty-sub">Ask admin to set your reporting manager</div></div>` : ''}
      </div>`);
  } catch (e) { showError(e.message); }
}

// ── Manager Approvals ─────────────────────────────────────────
export async function renderApprovals() {
  setPageTitle('Approvals', 'Pending team requests');
  setBreadcrumb([{ label: 'My Portal', url: '/portal' }, { label: 'Approvals' }]);
  showLoader();
  try {
    const d = await get('/timesheets/pending-approvals');
    const ts     = d.timesheets || [];
    const leaves = d.leaves     || [];
    const total  = ts.length + leaves.length;

    setContent(`
      <div class="page-body">
        <div class="page-lead">Pending Approvals (${total})</div>
        ${ts.length ? `
          <div class="section-label" style="margin:16px 0 8px">⏱ Timesheets (${ts.length})</div>
          <div class="card"><div class="tbl-wrap"><table class="data-table">
            <thead><tr><th>Employee</th><th>Week Ending</th><th>Total Hours</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>${ts.map(t=>`<tr>
              <td><strong>${t.employee_name}</strong><div class="cell-sub">${t.emp_id}</div></td>
              <td class="mono">${fmt.date(t.week_ending)}</td>
              <td class="mono fw-bold">${t.total_hours}h</td>
              <td class="text-muted">${t.notes||'—'}</td>
              <td class="tbl-actions">
                <button class="btn btn-sm btn-primary" onclick="window._approveTs(${t.id})">✓ Approve</button>
                <button class="btn btn-sm btn-danger"  onclick="window._rejectTs(${t.id})">✗ Reject</button>
              </td>
            </tr>`).join('')}</tbody></table></div></div>` : ''}
        ${leaves.length ? `
          <div class="section-label" style="margin:16px 0 8px">🏖 Leave Requests (${leaves.length})</div>
          <div class="card"><div class="tbl-wrap"><table class="data-table">
            <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Actions</th></tr></thead>
            <tbody>${leaves.map(l=>`<tr>
              <td><strong>${l.employee_name}</strong><div class="cell-sub">${l.emp_id}</div></td>
              <td>${l.leave_type}</td>
              <td class="mono">${fmt.date(l.from_date)}</td>
              <td class="mono">${fmt.date(l.to_date)}</td>
              <td class="mono fw-bold">${l.days}</td>
              <td class="text-muted">${l.reason||'—'}</td>
              <td class="tbl-actions">
                <button class="btn btn-sm btn-primary" onclick="window._approveLeave(${l.id})">✓ Approve</button>
                <button class="btn btn-sm btn-danger"  onclick="window._rejectLeave(${l.id})">✗ Reject</button>
              </td>
            </tr>`).join('')}</tbody></table></div></div>` : ''}
        ${total === 0 ? `<div class="empty-state"><div class="empty-icon">✅</div>
          <div class="empty-title">All caught up!</div>
          <div class="empty-sub">No pending approvals from your team</div></div>` : ''}
      </div>`);

    window._approveTs = async (id) => {
      await put(`/timesheets/${id}`, { status: 'Approved' });
      toast('Timesheet approved', 'success');
      renderApprovals();
    };
    window._rejectTs = async (id) => {
      const reason = prompt('Rejection reason (optional):');
      if (reason === null) return;
      await put(`/timesheets/${id}`, { status: 'Rejected', rejection_reason: reason });
      toast('Timesheet rejected', 'info');
      renderApprovals();
    };
    window._approveLeave = async (id) => {
      await put(`/my/leaves/${id}`, { action: 'approve' });
      toast('Leave approved', 'success');
      renderApprovals();
    };
    window._rejectLeave = async (id) => {
      const reason = prompt('Rejection reason (optional):');
      if (reason === null) return;
      await put(`/my/leaves/${id}`, { action: 'reject', reason });
      toast('Leave rejected', 'info');
      renderApprovals();
    };
  } catch (e) { showError(e.message); }
}
