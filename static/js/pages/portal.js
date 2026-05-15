import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt, buildOptions, getFormData } from '../utils.js';
import { pillStatus } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { getMaster } from '../auth.js';
import { toast } from '../components/toast.js';

let _dashData = null;

export async function renderPortal() {
  const d = await API.portalDashboard();
  if (!d) return;
  _dashData = d;
  const e = d.employee || {};
  const name = `${e.first_name||''} ${e.last_name||''}`.trim();
  const av = fmt.avColor(name);

  setContent(`
    <div style="background:linear-gradient(135deg,#1a5c2e,#0f3d1e);border-radius:12px;padding:28px;margin-bottom:24px;color:#fff">
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div class="av av-lg ${av}">${fmt.ini(name)}</div>
        <div style="flex:1">
          <div style="font-size:24px;font-weight:900">${name}</div>
          <div style="opacity:.8;margin-top:4px">${e.job_title||'—'} · ${e.department_name||'—'}</div>
          <div style="opacity:.6;font-size:12px;margin-top:4px">${e.emp_id||''} · ${e.employment_type||''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;opacity:.5;text-transform:uppercase">Reports to</div>
          <div style="font-size:14px;font-weight:600;margin-top:4px">${e.reporting_manager_name||'—'}</div>
        </div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card" style="border-top-color:var(--green)">
        <div class="kpi-label">Leave Balance</div>
        <div class="kpi-value">${d.leave_balance??18}</div>
        <div class="kpi-sub">days remaining</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--blue)">
        <div class="kpi-label">Leave Taken</div>
        <div class="kpi-value">${d.leaves_taken||0}</div>
        <div class="kpi-sub">this year</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--amber)">
        <div class="kpi-label">Pending Timesheets</div>
        <div class="kpi-value">${d.pending_timesheets||0}</div>
        <div class="kpi-sub">awaiting approval</div>
      </div>
      <div class="kpi-card" style="border-top-color:var(--purple)">
        <div class="kpi-label">Hours This Month</div>
        <div class="kpi-value">${d.approved_hours_mtd||0}h</div>
        <div class="kpi-sub">approved</div>
      </div>
    </div>

    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <a href="#/portal/timesheets" class="btn btn-primary">⏱ Submit Timesheet</a>
      <a href="#/portal/leaves" class="btn btn-secondary">🏖 Apply for Leave</a>
      <a href="#/portal/profile" class="btn btn-secondary">👤 My Profile</a>
      <a href="#/portal/payslips" class="btn btn-secondary">💰 Payslips</a>
    </div>
  `);
}

export async function renderPortalProfile() {
  const d = _dashData || await API.portalDashboard();
  if (!d) return;
  const e = d.employee || {};
  const name = `${e.first_name||''} ${e.last_name||''}`.trim();
  const av   = fmt.avColor(name);

  const fld  = (l,v,mono=false) => `<div><div class="org-field-label">${l}</div>
    <div class="org-field-value ${!v?'empty':''} ${mono?'td-mono':''}">${v||'—'}</div></div>`;

  const sec = (id,title,icon,body,editable=true) => `
    <div class="card section-card" id="psec-${id}">
      <div class="card-header"><div class="card-title">${icon} ${title}</div>
        ${editable?`<button class="btn btn-ghost btn-xs" onclick="window._editProfile('${id}')">✏ Edit</button>`:''}
      </div>
      <div class="section-fields">${body}</div>
    </div>`;

  setContent(`<div class="detail-layout">
    <div class="detail-sidebar">
      <div class="card" style="overflow:hidden">
        <div style="background:linear-gradient(135deg,#1a5c2e,#0f3d1e);padding:20px;text-align:center;color:#fff">
          <div class="av av-lg ${av}" style="margin:0 auto 10px">${fmt.ini(name)}</div>
          <div style="font-size:13px;font-weight:700">${name}</div>
          <div style="font-size:10px;opacity:.7;margin-top:3px">${e.emp_id||''}</div>
        </div>
        <div style="padding:6px 0">
          ${[['personal','👤 Personal'],['role','🏢 Role & Org'],['identity','🪪 Identity'],['finance','💰 Finance']].map(([id,lbl])=>`
            <a class="sidebar-nav-link" onclick="document.getElementById('psec-${id}')?.scrollIntoView({behavior:'smooth'})">${lbl}</a>`).join('')}
        </div>
      </div>
    </div>
    <div>
      ${sec('personal','Personal','👤',
        fld('First Name',e.first_name)+fld('Last Name',e.last_name)+
        fld('Date of Birth',fmt.date(e.dob))+fld('Gender',e.gender)+
        fld('Marital Status',e.marital_status)+fld('Nationality',e.nationality)+
        fld('Personal Email',e.personal_email)+fld('Personal Phone',e.personal_phone)
      )}
      ${sec('role','Role & Organisation','🏢',
        fld('Job Title',e.job_title)+fld('Department',e.department_name)+
        fld('Business Unit',e.business_unit_name)+fld('Employment Type',e.employment_type)+
        fld('Client',e.client_name)+fld('Location',e.location)+
        fld('Start Date',fmt.date(e.start_date))+fld('Reporting Manager',e.reporting_manager_name),
        false
      )}
      ${sec('identity','Identity & Compliance','🪪',
        fld('PAN',e.pan,true)+fld('Aadhaar',e.aadhaar,true)+
        fld('PF Number',e.pf_number,true)+fld('UAN',e.uan,true)
      )}
      ${sec('finance','Finance','💰',
        fld('Bank Name',e.bank_name)+fld('Account',e.bank_account_number,true)+fld('IFSC',e.bank_ifsc,true),false
      )}
    </div>
  </div>`);

  window._editProfile = (section) => {
    const forms = {
      personal: `<div class="form-grid">
        <div class="field"><label class="label">First Name</label><input class="input" name="first_name" value="${e.first_name||''}"></div>
        <div class="field"><label class="label">Last Name</label><input class="input" name="last_name" value="${e.last_name||''}"></div>
        <div class="field"><label class="label">DOB</label><input class="input" type="date" name="dob" value="${e.dob||''}"></div>
        <div class="field"><label class="label">Gender</label>
          <select class="select" name="gender">${['','Male','Female','Non-binary'].map(g=>`<option ${e.gender===g?'selected':''}>${g}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Personal Email</label><input class="input" name="personal_email" value="${e.personal_email||''}"></div>
        <div class="field"><label class="label">Personal Phone</label><input class="input" name="personal_phone" value="${e.personal_phone||''}"></div>
      </div>`,
      identity: `<div class="form-grid">
        <div class="field"><label class="label">PAN</label><input class="input" name="pan" value="${e.pan||''}"></div>
        <div class="field"><label class="label">Aadhaar</label><input class="input" name="aadhaar" value="${e.aadhaar||''}"></div>
        <div class="field"><label class="label">PF Number</label><input class="input" name="pf_number" value="${e.pf_number||''}"></div>
        <div class="field"><label class="label">UAN</label><input class="input" name="uan" value="${e.uan||''}"></div>
      </div>`,
    };
    showModal({ title:`Edit ${section}`, body:`<form id="pf">${forms[section]||''}</form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveProfileSection()">Save</button>`,
    });
    window._saveProfileSection = async () => {
      const data = getFormData(document.getElementById('pf'));
      try {
        await apiFetch(`/employees/${e.id}`, { method:'PUT', body: JSON.stringify(data) });
        toast('Profile updated','success'); closeModal();
        _dashData = null; renderPortalProfile();
      } catch(err) { toast(err.message,'error'); }
    };
  };
}

export async function renderPortalTimesheets() {
  const rows = await API.myTimesheets() || [];
  const total = rows.reduce((s,t)=>s+(parseFloat(t.total_hours)||0),0);
  const approved = rows.filter(t=>t.status==='Approved').reduce((s,t)=>s+(parseFloat(t.total_hours)||0),0);
  const pending  = rows.filter(t=>t.status==='Pending'||!t.status).length;

  setContent(`
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card" style="border-top-color:var(--blue)"><div class="kpi-label">Total Hours</div><div class="kpi-value">${total.toFixed(1)}h</div></div>
      <div class="kpi-card" style="border-top-color:var(--green)"><div class="kpi-label">Approved</div><div class="kpi-value">${approved.toFixed(1)}h</div></div>
      <div class="kpi-card" style="border-top-color:var(--amber)"><div class="kpi-label">Pending</div><div class="kpi-value">${pending}</div></div>
    </div>
    <div class="toolbar">
      <div class="toolbar-title">My Timesheets</div>
      <button class="btn btn-primary" onclick="window._submitTs()">+ Submit Timesheet</button>
    </div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Week Ending</th><th>Project</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(t=>`<tr>
          <td class="td-mono">${fmt.date(t.week_ending)}</td>
          <td>${t.project_name||t.client_name||'—'}</td>
          <td class="td-mono">${t.mon||0}</td><td class="td-mono">${t.tue||0}</td>
          <td class="td-mono">${t.wed||0}</td><td class="td-mono">${t.thu||0}</td><td class="td-mono">${t.fri||0}</td>
          <td class="td-mono" style="font-weight:700">${t.total_hours||0}h</td>
          <td>${pillStatus(t.status||'Pending')}</td>
        </tr>`).join('')}
        ${!rows.length?'<tr><td colspan="9"><div class="empty-state"><div class="empty-state-title">No timesheets yet</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
  window._submitTs = () => {
    showModal({ title:'Submit Timesheet', size:'modal-lg',
      body:`<form id="tsf"><div class="form-grid">
        <div class="field"><label class="label">Week Ending (Friday) *</label><input class="input" type="date" name="week_ending" required></div>
        <div class="field"><label class="label">Project</label>
          <select class="select" name="project_id"><option value="">Select Project</option></select></div>
        <div class="field"><label class="label">Monday</label><input class="input" type="number" name="mon" value="8" step="0.5" min="0" max="24"></div>
        <div class="field"><label class="label">Tuesday</label><input class="input" type="number" name="tue" value="8" step="0.5" min="0" max="24"></div>
        <div class="field"><label class="label">Wednesday</label><input class="input" type="number" name="wed" value="8" step="0.5" min="0" max="24"></div>
        <div class="field"><label class="label">Thursday</label><input class="input" type="number" name="thu" value="8" step="0.5" min="0" max="24"></div>
        <div class="field"><label class="label">Friday</label><input class="input" type="number" name="fri" value="8" step="0.5" min="0" max="24"></div>
        <div class="field"><label class="label">Saturday</label><input class="input" type="number" name="sat" value="0" step="0.5" min="0" max="24"></div>
        <div class="field form-full"><label class="label">Notes</label><textarea class="textarea" name="notes" style="min-height:60px"></textarea></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveTs()">Submit for Approval</button>`,
    });
    window._saveTs = async () => {
      try { await API.submitTs(getFormData(document.getElementById('tsf')));
        toast('Timesheet submitted','success'); closeModal(); renderPortalTimesheets();
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderPortalLeaves() {
  const leaves = await API.myLeaves() || [];
  const d      = _dashData || await API.portalDashboard();
  const balance  = d?.leave_balance ?? 18;
  const taken    = d?.leaves_taken  ?? 0;
  const pending  = leaves.filter(l=>l.status==='Pending').length;
  const approved = leaves.filter(l=>l.status==='Approved').length;

  setContent(`
    <div class="kpi-grid">
      <div class="kpi-card" style="border-top-color:var(--green)"><div class="kpi-label">Balance</div><div class="kpi-value">${balance}</div><div class="kpi-sub">days remaining</div></div>
      <div class="kpi-card" style="border-top-color:var(--blue)"><div class="kpi-label">Taken</div><div class="kpi-value">${taken}</div><div class="kpi-sub">days used</div></div>
      <div class="kpi-card" style="border-top-color:var(--amber)"><div class="kpi-label">Pending</div><div class="kpi-value">${pending}</div><div class="kpi-sub">awaiting approval</div></div>
      <div class="kpi-card" style="border-top-color:var(--purple)"><div class="kpi-label">Approved</div><div class="kpi-value">${approved}</div><div class="kpi-sub">this year</div></div>
    </div>
    <div class="toolbar">
      <div class="toolbar-title">My Leave</div>
      <button class="btn btn-primary" onclick="window._applyLeave()">+ Apply for Leave</button>
    </div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
      <tbody>
        ${leaves.map(l=>`<tr>
          <td style="font-weight:600">${l.leave_type||'Annual'}</td>
          <td class="td-mono">${fmt.date(l.from_date)}</td>
          <td class="td-mono">${fmt.date(l.to_date)}</td>
          <td class="td-mono" style="font-weight:700">${l.days||1}</td>
          <td style="color:var(--txt2)">${l.reason||'—'}</td>
          <td>${pillStatus(l.status||'Pending')}</td>
        </tr>`).join('')}
        ${!leaves.length?'<tr><td colspan="6"><div class="empty-state"><div class="empty-state-title">No leave requests</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
  window._applyLeave = () => {
    showModal({ title:'Apply for Leave',
      body:`<form id="lf"><div class="form-grid">
        <div class="field"><label class="label">Leave Type *</label>
          <select class="select" name="leave_type">
            ${['Annual Leave','Sick Leave','Personal Leave','Maternity Leave','Paternity Leave','Emergency Leave','Unpaid Leave'].map(t=>`<option>${t}</option>`).join('')}
          </select></div>
        <div class="field"><label class="label">From Date *</label><input class="input" type="date" name="from_date" required></div>
        <div class="field"><label class="label">To Date *</label><input class="input" type="date" name="to_date" required></div>
        <div class="field form-full"><label class="label">Reason</label>
          <textarea class="textarea" name="reason" style="min-height:80px"></textarea></div>
      </div></form>`,
      footer:`<button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveLeave()">Submit Request</button>`,
    });
    window._saveLeave = async () => {
      try { await API.applyLeave(getFormData(document.getElementById('lf')));
        toast('Leave request submitted','success'); closeModal(); renderPortalLeaves();
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

export async function renderPortalPayslips() {
  const rows = await API.portalPayslips() || [];
  setContent(`
    <div class="toolbar"><div class="toolbar-title">My Payslips</div></div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Month/Year</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(p=>`<tr>
          <td class="td-mono">${p.month||'—'}/${p.year||'—'}</td>
          <td class="td-mono">${fmt.inr(p.gross_salary)}</td>
          <td class="td-mono" style="color:var(--red)">${fmt.inr(p.total_deductions)}</td>
          <td class="td-mono" style="font-weight:700;color:var(--green)">${fmt.inr(p.net_salary)}</td>
          <td>${pillStatus(p.status||'Paid')}</td>
        </tr>`).join('')}
        ${!rows.length?'<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-title">No payslips yet</div><div class="empty-state-sub">Payslips appear here once processed by Finance</div></div></td></tr>':''}
      </tbody>
    </table></div></div>
  `);
}

export async function renderPortalTeam() {
  const data = await API.portalTeam() || {};
  const { manager, reportees=[], peers=[] } = data;

  const card = (emp, badge, color) => {
    const n = `${emp.first_name} ${emp.last_name}`.trim();
    return `<div class="card" style="display:flex;align-items:center;gap:14px;padding:16px">
      <div class="av av-sm ${fmt.avColor(n)}">${fmt.ini(n)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${n}</div>
        <div style="font-size:11px;color:var(--txt2)">${emp.job_title||'—'}</div>
      </div>
      <span class="pill" style="background:${color};color:#fff">${badge}</span>
    </div>`;
  };

  const grp = (title, icon, items, badge, color) => !items.length ? '' : `
    <div style="margin-bottom:24px">
      <div style="font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${icon} ${title} (${items.length})</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
        ${items.map(e=>card(e,badge,color)).join('')}
      </div>
    </div>`;

  setContent(`
    <div class="toolbar"><div class="toolbar-title">My Team</div></div>
    ${manager ? grp('Reporting Manager','📊',[manager],'Manager','#7c3aed') : ''}
    ${grp('Peers','🤝',peers,'Peer','#2563eb')}
    ${grp('My Reportees','👤',reportees,'Reportee','#059669')}
    ${!manager&&!peers.length&&!reportees.length?`<div class="empty-state">
      <div class="empty-state-icon">👥</div>
      <div class="empty-state-title">No team configured</div>
      <div class="empty-state-sub">Ask admin to set your reporting manager</div>
    </div>`:''}
  `);
}

export async function renderPortalApprovals() {
  const data = await API.pendingApprovals() || { timesheets:[], leaves:[] };
  const total = (data.timesheets?.length||0) + (data.leaves?.length||0);

  setContent(`
    <div class="toolbar">
      <div class="toolbar-title">Pending Approvals (${total})</div>
    </div>
    ${data.timesheets?.length?`
      <div style="font-size:13px;font-weight:700;color:var(--txt2);text-transform:uppercase;margin-bottom:10px">⏱ Timesheets (${data.timesheets.length})</div>
      <div class="card" style="margin-bottom:20px"><div class="table-container"><table>
        <thead><tr><th>Employee</th><th>Week Ending</th><th>Total Hours</th><th>Notes</th><th>Actions</th></tr></thead>
        <tbody>${data.timesheets.map(t=>`<tr>
          <td>${t.employee_name}<br><small class="td-mono" style="color:var(--txt3)">${t.emp_id||''}</small></td>
          <td class="td-mono">${fmt.date(t.week_ending)}</td>
          <td class="td-mono" style="font-weight:700">${t.total_hours||0}h</td>
          <td style="color:var(--txt2)">${t.notes||'—'}</td>
          <td><div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-xs" onclick="window._approvTs(${t.id})">✓ Approve</button>
            <button class="btn btn-danger btn-xs" onclick="window._rejectTs(${t.id})">✗ Reject</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`:''}
    ${data.leaves?.length?`
      <div style="font-size:13px;font-weight:700;color:var(--txt2);text-transform:uppercase;margin-bottom:10px">🏖 Leave Requests (${data.leaves.length})</div>
      <div class="card"><div class="table-container"><table>
        <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Actions</th></tr></thead>
        <tbody>${data.leaves.map(l=>`<tr>
          <td>${l.employee_name}<br><small class="td-mono" style="color:var(--txt3)">${l.emp_id||''}</small></td>
          <td style="font-weight:600">${l.leave_type}</td>
          <td class="td-mono">${fmt.date(l.from_date)}</td>
          <td class="td-mono">${fmt.date(l.to_date)}</td>
          <td class="td-mono" style="font-weight:700">${l.days||1}</td>
          <td style="color:var(--txt2)">${l.reason||'—'}</td>
          <td><div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-xs" onclick="window._approvLeave(${l.id})">✓ Approve</button>
            <button class="btn btn-danger btn-xs" onclick="window._rejectLeave(${l.id})">✗ Reject</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`:''}
    ${total===0?`<div class="empty-state">
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-title">All caught up!</div>
      <div class="empty-state-sub">No pending approvals from your team</div>
    </div>`:''}
  `);

  window._approvTs = async (id) => {
    try { await API.tsUpdate(id,{status:'Approved'}); toast('Approved','success'); renderPortalApprovals(); }
    catch(e) { toast(e.message,'error'); }
  };
  window._rejectTs = async (id) => {
    const reason = prompt('Reason for rejection:'); if(reason===null) return;
    try { await API.tsUpdate(id,{status:'Rejected',rejection_reason:reason}); toast('Rejected','info'); renderPortalApprovals(); }
    catch(e) { toast(e.message,'error'); }
  };
  window._approvLeave = async (id) => {
    try { await API.updateLeave(id,{action:'approve'}); toast('Approved','success'); renderPortalApprovals(); }
    catch(e) { toast(e.message,'error'); }
  };
  window._rejectLeave = async (id) => {
    const reason = prompt('Reason:'); if(reason===null) return;
    try { await API.updateLeave(id,{action:'reject',reason}); toast('Rejected','info'); renderPortalApprovals(); }
    catch(e) { toast(e.message,'error'); }
  };
}

// Need apiFetch for profile edit
async function apiFetch(endpoint, options={}) {
  const token = localStorage.getItem('mch_token');
  const res = await fetch('/api/v1'+endpoint, {
    headers: { 'Content-Type':'application/json', ...(token?{'X-Auth-Token':token}:{}) },
    ...options,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message||'Error');
  return data.data;
}
