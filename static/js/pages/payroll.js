/**
 * Payroll — Runs list, New Run (import spreadsheet), CBX generation, Payslips
 * Zero backticks, zero optional chaining
 */
import { get, post, put } from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         openModal, toast, badge, fmt } from '../ui.js';
import { navigate } from '../router.js';
// XLSX loaded dynamically

function v(val, fb) {
  if (val === null || val === undefined) return fb !== undefined ? fb : '';
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var STATUSES = ['New','On Hold','Approved','Rejected','Processed'];

function kpi(l, val, icon, c) {
  return '<div class="kpi-card kpi-'+c+'"><div class="kpi-icon">'+icon+'</div>' +
    '<div class="kpi-body"><div class="kpi-value">'+val+'</div><div class="kpi-label">'+l+'</div></div></div>';
}
// thSort handled inline in each function

export async function renderList() {
  setPageTitle('Payroll', 'Salary runs');
  setBreadcrumb([{ label: 'Payroll' }]);
  showLoader();
  try {
    var data = await get('/payroll/runs');
    var rows = data.items || [];
    var filterStatus = '', sortCol = 'year', sortDir = -1;

    function sorted(arr) {
      return arr.slice().sort(function(a,b) {
        if (sortCol === 'year') return ((b.year*12+b.month) - (a.year*12+a.month)) * sortDir;
        return String(a[sortCol]||'').localeCompare(String(b[sortCol]||'')) * sortDir;
      });
    }
    function getF() {
      var d = rows.slice();
      if (filterStatus) d = d.filter(function(r) { return r.status === filterStatus; });
      return sorted(d);
    }

    function renderTable() {
      var d = getF();
      if (!d.length) return '<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No payroll runs yet</div>' +
        '<button class="btn btn-primary" onclick="navigateTo(\'/payroll/new\')">+ Create Payroll Run</button></div>';
      return '<div class="card"><div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        '<th class="sortable" onclick="window._prSort(\'year\')" style="cursor:pointer">Month / Year ⇅</th>' +
        '<th class="sortable" onclick="window._prSort(\'run_date\')" style="cursor:pointer">Run Date ⇅</th>' +
        '<th class="sortable" onclick="window._prSort(\'employee_count\')" style="cursor:pointer">Employees ⇅</th>' +
        '<th class="sortable" onclick="window._prSort(\'total_net_salary\')" style="cursor:pointer">Net Amount ⇅</th>' +
        '<th class="sortable" onclick="window._prSort(\'status\')" style="cursor:pointer">Status ⇅</th>' +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      d.map(function(r) {
        var monthYear = MONTHS[r.month - 1] + ' ' + r.year;
        return '<tr class="tbl-clickable" onclick="navigateTo(\'/payroll/'+r.id+'\')">' +
          '<td class="fw-bold">'+v(monthYear)+'</td>' +
          '<td class="mono">'+fmt.date(r.run_date)+'</td>' +
          '<td>'+(r.employee_count || 0)+'</td>' +
          '<td class="mono fw-bold">'+fmt.money(r.total_net_salary)+'</td>' +
          '<td>'+badge(r.status || 'New')+'</td>' +
          '<td class="tbl-actions" onclick="event.stopPropagation()">' +
            '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/payroll/'+r.id+'\')">View</button>' +
            (r.status !== 'Processed'
              ? '<button class="btn btn-ghost btn-xs" onclick="navigateTo(\'/payroll/'+r.id+'\')">✏ Edit</button>'
              : '') +
            (r.status === 'Approved' || r.status === 'Processed'
              ? '<button class="btn btn-primary btn-xs" onclick="window._genCBX('+r.id+',\''+v(monthYear)+'\')">⬇ CBX</button>'
              : '') +
            (r.status === 'Processed'
              ? '<button class="btn btn-ghost btn-xs" onclick="window._genPayslips('+r.id+')">📄 Payslips</button>'
              : '') +
            '<button class="btn btn-danger btn-xs" onclick="window._deletePR('+r.id+')">Del</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
    }

    var totalNet = rows.reduce(function(s,r){ return s + parseFloat(r.total_net_salary||0); }, 0);
    var pending  = rows.filter(function(r){ return r.status === 'New' || r.status === 'On Hold'; }).length;

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Total Runs', rows.length, '📋', 'blue') +
        kpi('Pending Approval', pending, '⏳', 'amber') +
        kpi('Total Net Salary', fmt.money(totalNet), '💰', 'green') +
        kpi('Processed', rows.filter(function(r){return r.status==='Processed';}).length, '✅', 'purple') +
      '</div>' +
      '<div class="struct-toolbar">' +
        '<div style="display:flex;gap:8px">' +
          '<select class="fselect" style="width:130px" onchange="window._prFilter(this.value)">' +
            '<option value="">All Status</option>' +
            STATUSES.map(function(s){return '<option>'+s+'</option>';}).join('') +
          '</select>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="navigateTo(\'/payroll/new\')">+ New Payroll Run</button>' +
      '</div>' +
      '<div id="pr-content">'+renderTable()+'</div>' +
      '</div>'
    );

    window._prFilter = function(val) { filterStatus = val; document.getElementById('pr-content').innerHTML = renderTable(); };
    window._prSort   = function(col) { sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1); document.getElementById('pr-content').innerHTML = renderTable(); };

    window._genCBX = async function(id, label) {
      try {
        var res = await get('/payroll/runs/'+id+'/cbx');
        var content = res.content || '';
        if (!content) { toast('No approved entries to generate CBX', 'error'); return; }
        var blob = new Blob([content], { type: 'text/plain' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = res.filename || ('payroll_'+id+'.txt');
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        toast('CBX file downloaded', 'success');
      } catch(e) { toast(e.message, 'error'); }
    };

    window._genPayslips = async function(id) {
      navigate('/payroll/'+id+'?tab=payslips');
    };

    window._deletePR = async function(id) {
      if (!confirm('Delete this payroll run?')) return;
      await put('/payroll/runs/'+id, { status: 'Rejected' });
      toast('Deleted', 'info');
      rows.splice(rows.findIndex(function(r){ return r.id === id; }), 1);
      document.getElementById('pr-content').innerHTML = renderTable();
    };

  } catch(e) { showError(e.message); }
}

export async function renderNew() {
  setPageTitle('New Payroll Run', 'Import salary statement');
  setBreadcrumb([{ label:'Payroll', url:'/payroll' }, { label:'New Run' }]);

  var today = new Date();
  var entries = [];

  setContent(
    '<div class="page-body">' +
    '<div class="card" style="max-width:900px;margin:0 auto">' +
    '<div class="card-header"><h3 class="card-title">New Payroll Run</h3></div>' +
    '<div class="card-body">' +
      '<div class="form-grid" style="margin-bottom:16px">' +
        '<div class="fg"><label class="flabel">Month *</label>' +
          '<select class="fselect" id="pr-month">' +
          MONTHS.map(function(m,i){ return '<option value="'+(i+1)+'"'+(i+1===today.getMonth()+1?' selected':'')+'>'+m+'</option>'; }).join('') +
          '</select></div>' +
        '<div class="fg"><label class="flabel">Year *</label>' +
          '<input class="finput" type="number" id="pr-year" value="'+today.getFullYear()+'" min="2020" max="2030"></div>' +
        '<div class="fg"><label class="flabel">Run Date</label>' +
          '<input class="finput" type="date" id="pr-date" value="'+today.toISOString().split('T')[0]+'"></div>' +
        '<div class="fg full"><label class="flabel">Notes</label>' +
          '<input class="finput" id="pr-notes" placeholder="Optional notes"></div>' +
      '</div>' +
      '<div class="card" style="background:var(--bg);border:2px dashed var(--border);text-align:center;padding:24px;margin-bottom:16px">' +
        '<div style="font-size:32px;margin-bottom:8px">📊</div>' +
        '<div class="fw-bold" style="margin-bottom:4px">Import Salary Statement (Excel/CSV)</div>' +
        '<div class="text-muted" style="font-size:12px;margin-bottom:12px">'+
          'Required columns: Employee ID, Basic, HRA, Conveyance, Medical, Special, Incentive, Other Earnings, '+
          'Prof Tax, ESI, TDS, EPF, Medical Deduction, Advance, Other Deductions, Loss of Pay'+
        '</div>' +
        '<input type="file" id="payroll-file" accept=".xlsx,.xls,.csv" style="display:none">' +
        '<button class="btn btn-primary" onclick="document.getElementById(\'payroll-file\').click()">📎 Choose File</button>' +
        '<div id="file-status" class="text-muted" style="margin-top:8px;font-size:12px"></div>' +
      '</div>' +
      '<div id="payroll-preview"></div>' +
    '</div>' +
    '<div class="form-actions">' +
      '<button class="btn btn-ghost" onclick="navigateTo(\'/payroll\')">Cancel</button>' +
      '<button class="btn btn-primary" id="save-pr-btn" onclick="window._savePayrollRun()" disabled>Save Payroll Run</button>' +
    '</div>' +
    '</div></div>'
  );

  document.getElementById('payroll-file').addEventListener('change', async function(e) {
    var file = e.target.files[0];
    if (!file) return;
    document.getElementById('file-status').textContent = 'Reading: ' + file.name + '…';
    // Load XLSX library dynamically from CDN
    var XLSX;
    try {
      var mod = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs');
      XLSX = mod;
    } catch(xlsxErr) {
      document.getElementById('file-status').textContent = '❌ Could not load spreadsheet parser. Check your internet connection.';
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var wb = XLSX.read(ev.target.result, { type: 'binary' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var json = XLSX.utils.sheet_to_json(ws, { defval: 0 });
        entries = json.map(function(row) {
          // Normalize column names (case-insensitive, handle spaces/underscores)
          var norm = {};
          Object.keys(row).forEach(function(k) {
            norm[k.toLowerCase().replace(/[\s_]+/g,'_')] = row[k];
          });
          var basic=parseFloat(norm.basic||norm['a._basic']||norm.a_basic||0);
          var hra=parseFloat(norm.hra||norm['b._hra']||norm.b_hra||0);
          var conv=parseFloat(norm.conveyance||norm['c._conveyance']||norm.c_conveyance||0);
          var med=parseFloat(norm.medical||norm['d._medical']||norm.d_medical||0);
          var spec=parseFloat(norm.special||norm['e._special']||norm.e_special||0);
          var inc=parseFloat(norm.incentive||norm['f._incentive']||norm.f_incentive||0);
          var oth=parseFloat(norm.other_earnings||norm['g._other']||norm.g_other||0);
          var lop=parseFloat(norm.loss_of_pay||norm.lop||0);
          var gross=basic+hra+conv+med+spec+inc+oth;
          var pt=parseFloat(norm.prof_tax||norm.profession_tax||norm['h._profession_tax']||norm.h_profession_tax||norm.pt||norm['professional_tax']||0);
          var esi=parseFloat(norm.esi||norm['i._esi']||norm.i_esi||norm['e.s.i']||0);
          var tds=parseFloat(norm.tds||norm['j._tds']||norm.j_tds||norm['t.d.s']||0);
          var epf=parseFloat(norm.epf||norm['k._epf']||norm.k_epf||norm['e.p.f']||norm['pf']||norm['provident_fund']||0);
          var medd=parseFloat(norm.medical_deduction||norm['medical_ded']||norm['l._medical']||norm.l_medical||norm['med_deduction']||norm.med_ded||0);
          var adv=parseFloat(norm.advance||norm['m._advance']||norm.m_advance||norm['advance_deduction']||norm['advances']||0);
          var othd=parseFloat(norm.other_deductions||norm['n._other']||norm.n_other||norm['other_ded']||norm['others']||0);
          var totalDed=pt+esi+tds+epf+medd+adv+othd;
          var net=gross-totalDed-lop;
          return {
            employee_id:   norm.employee_id||norm.emp_id||norm.empid||'',
            emp_id_display:norm.employee_id||norm.emp_id||norm.empid||'—',
            employee_name: norm.employee_name||norm.name||'—',
            designation:   norm.designation||'—',
            department:    norm.department||'—',
            location:      norm.location||'—',
            ctc:           parseFloat(norm.ctc||0),
            loss_of_pay:lop, basic,hra,conveyance:conv,medical:med,special:spec,incentive:inc,other_earnings:oth,
            gross_salary:gross,prof_tax:pt,esi,tds,epf,medical_deduction:medd,advance:adv,other_deductions:othd,
            total_deductions:totalDed,net_salary:net,
            _status:'',
          };
        });
        renderPreview();
        document.getElementById('file-status').textContent = '✅ ' + entries.length + ' rows loaded from ' + file.name;
        document.getElementById('save-pr-btn').disabled = false;
      } catch(err) {
        document.getElementById('file-status').textContent = '❌ Error: ' + err.message;
      }
    };
    reader.readAsBinaryString(file);
  });

  function renderPreview() {
    if (!entries.length) return;
    var cols = ['emp_id_display','employee_name','designation','department','location','ctc',
      'loss_of_pay','basic','hra','conveyance','medical','special','incentive','other_earnings','gross_salary',
      'prof_tax','esi','tds','epf','medical_deduction','advance','other_deductions','total_deductions','net_salary'];
    var labels = ['Emp ID','Name','Designation','Department','Location','CTC',
      'LOP','Basic','HRA','Conv.','Medical','Special','Incentive','Other','Gross',
      'PT','ESI','TDS','EPF','Med.Ded.','Advance','Other Ded.','Total Ded.','Net'];

    document.getElementById('payroll-preview').innerHTML =
      '<div class="card" style="margin-top:16px"><div class="card-header"><h3 class="card-title">Preview ('+entries.length+' employees)</h3></div>' +
      '<div class="tbl-wrap"><table class="data-table" style="font-size:11px"><thead><tr>' +
        cols.map(function(c,i){ return '<th style="white-space:nowrap">'+labels[i]+'</th>'; }).join('') +
      '</tr></thead><tbody>' +
      entries.map(function(e,idx) {
        return '<tr>' + cols.map(function(c) {
          var val = e[c];
          if (c === 'emp_id_display' || c === 'employee_name' || c === 'designation' || c === 'department' || c === 'location') {
            return '<td style="white-space:nowrap">'+v(val)+'</td>';
          }
          return '<td class="mono" contenteditable="true" onblur="window._editCell('+idx+',\''+c+'\',this.textContent)" style="text-align:right;min-width:60px">'+parseFloat(val||0).toFixed(0)+'</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  window._editCell = function(idx, col, val) {
    entries[idx][col] = parseFloat(val) || 0;
    // Recalculate gross and net
    var e = entries[idx];
    e.gross_salary = e.basic+e.hra+e.conveyance+e.medical+e.special+e.incentive+e.other_earnings;
    e.total_deductions = e.prof_tax+e.esi+e.tds+e.epf+e.medical_deduction+e.advance+e.other_deductions;
    e.net_salary = e.gross_salary - e.total_deductions - e.loss_of_pay;
  };

  window._savePayrollRun = async function() {
    if (!entries.length) { toast('No data to save', 'error'); return; }
    var month = parseInt(document.getElementById('pr-month').value);
    var year  = parseInt(document.getElementById('pr-year').value);
    var date  = document.getElementById('pr-date').value;
    var notes = document.getElementById('pr-notes').value;
    try {
      var res = await post('/payroll/runs', { month, year, run_date: date, notes, entries });
      toast('Payroll run created!', 'success');
      navigate('/payroll/' + res.id);
    } catch(e2) { toast(e2.message, 'error'); }
  };
}

export async function renderDetail({ id }) {
  showLoader();
  try {
    var res = await get('/payroll/runs/' + id);
    var run     = res.run     || {};
    var entries = res.entries || [];

    var monthYear = MONTHS[(run.month||1) - 1] + ' ' + (run.year||'');
    setPageTitle('Payroll — ' + monthYear, run.status || '');
    setBreadcrumb([{ label:'Payroll', url:'/payroll' }, { label: monthYear }]);

    var totalNet  = entries.reduce(function(s,e){ return s + parseFloat(e.net_salary||0); }, 0);
    var totalGross= entries.reduce(function(s,e){ return s + parseFloat(e.gross_salary||0); }, 0);
    var totalDed  = entries.reduce(function(s,e){ return s + parseFloat(e.total_deductions||0); }, 0);
    var status    = run.status || 'New';
    var isPending = status === 'New' || status === 'On Hold';

    function renderEntries() {
      if (!entries.length) return '<div class="empty-mini">No salary entries</div>';
      var cols = ['emp_id','employee_name','designation','department_name','location_name','ctc',
        'loss_of_pay','basic','hra','conveyance','medical','special','incentive','other_earnings','gross_salary',
        'prof_tax','esi','tds','epf','medical_deduction','advance','other_deductions','total_deductions','net_salary'];
      var labels = ['Emp ID','Name','Designation','Dept','Location','CTC',
        'LOP','a.Basic','b.HRA','c.Conv','d.Med','e.Spec','f.Inc','g.Other','Gross',
        'h.PT','i.ESI','j.TDS','k.EPF','l.MedD','m.Adv','n.OthD','Total Ded','Net Salary'];
      return '<div class="tbl-wrap"><table class="data-table" style="font-size:11px"><thead><tr>' +
        cols.map(function(c,i){ return '<th style="white-space:nowrap">'+labels[i]+'</th>'; }).join('') +
      '</tr></thead><tbody>' +
      entries.map(function(e,idx) {
        return '<tr>' + cols.map(function(c) {
          var val = e[c];
          if (c === 'emp_id' || c === 'employee_name' || c === 'designation' || c === 'department_name' || c === 'location_name') {
            return '<td style="white-space:nowrap;font-size:11px">'+v(val,'—')+'</td>';
          }
          var num = parseFloat(val||0).toFixed(0);
          if (isPending) {
            return '<td class="mono" contenteditable="true" onblur="window._editPayEntry('+e.id+',\''+c+'\',this.textContent)" style="text-align:right;min-width:60px;background:var(--bg)">'+num+'</td>';
          }
          return '<td class="mono" style="text-align:right">'+num+'</td>';
        }).join('') + '</tr>';
      }).join('') +
      '<tr style="font-weight:700;background:var(--brand-light)"><td colspan="14" style="text-align:right;font-size:11px">TOTALS →</td>' +
      '<td class="mono" style="text-align:right">'+totalGross.toFixed(0)+'</td>' +
      '<td colspan="7"></td>' +
      '<td class="mono" style="text-align:right">'+totalDed.toFixed(0)+'</td>' +
      '<td class="mono" style="text-align:right;color:var(--green)">'+totalNet.toFixed(0)+'</td>' +
      '</tr>' +
      '</tbody></table></div>';
    }

    setContent(
      '<div class="page-body">' +
      '<div class="kpi-grid kpi-4" style="margin-bottom:16px">' +
        kpi('Employees', entries.length, '👥', 'blue') +
        kpi('Gross Salary', fmt.money(totalGross), '💰', 'purple') +
        kpi('Total Deductions', fmt.money(totalDed), '📉', 'amber') +
        kpi('Net Salary', fmt.money(totalNet), '✅', 'green') +
      '</div>' +
      '<div class="card">' +
        '<div class="card-header">' +
          '<h3 class="card-title">' + monthYear + ' Payroll — ' + badge(status) + '</h3>' +
          '<div style="display:flex;gap:8px">' +
            (isPending ? '<button class="btn btn-primary btn-sm" onclick="window._approveRun()">✓ Approve</button>' : '') +
            (isPending ? '<button class="btn btn-ghost btn-sm" onclick="window._holdRun()">⏸ On Hold</button>' : '') +
            (status === 'Approved' ? '<button class="btn btn-primary btn-sm" onclick="window._processRun()">⚡ Process</button>' : '') +
            (status === 'Approved' || status === 'Processed' ? '<button class="btn btn-ghost btn-sm" onclick="window._downloadCBX()">⬇ CBX File</button>' : '') +
            (status === 'Processed' ? '<button class="btn btn-ghost btn-sm" onclick="window._downloadPayslips()">📄 Payslips</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="tbl-wrap">' + renderEntries() + '</div>' +
      '</div></div>'
    );

    var pendingEdits = {};

    window._editPayEntry = function(entryId, col, val) {
      if (!pendingEdits[entryId]) pendingEdits[entryId] = {};
      pendingEdits[entryId][col] = parseFloat(val) || 0;
      // Recalc gross and net inline
      var e = entries.find(function(x){ return x.id === entryId; });
      if (e) {
        Object.assign(e, pendingEdits[entryId]);
        e.gross_salary = e.basic+e.hra+e.conveyance+e.medical+e.special+e.incentive+e.other_earnings;
        e.total_deductions = e.prof_tax+e.esi+e.tds+e.epf+e.medical_deduction+e.advance+e.other_deductions;
        e.net_salary = e.gross_salary - e.total_deductions - e.loss_of_pay;
      }
    };

    window._approveRun = async function() {
      // Save any pending edits first
      if (Object.keys(pendingEdits).length) {
        var toUpdate = entries.filter(function(e){ return pendingEdits[e.id]; })
          .map(function(e){ return Object.assign({id: e.id}, e); });
        await put('/payroll/runs/'+id+'/entries', toUpdate);
      }
      await post('/payroll/runs/'+id+'/approve', { action: 'approve' });
      toast('Payroll approved!', 'success');
      navigate('/payroll');
    };

    window._holdRun = async function() {
      await post('/payroll/runs/'+id+'/approve', { action: 'hold' });
      toast('Payroll put on hold', 'info');
      navigate('/payroll');
    };

    window._processRun = async function() {
      await post('/payroll/runs/'+id+'/approve', { action: 'process' });
      toast('Payroll processed!', 'success');
      navigate('/payroll');
    };

    window._downloadCBX = async function() {
      try {
        var res2 = await get('/payroll/runs/'+id+'/cbx');
        var blob = new Blob([res2.content || ''], { type: 'text/plain' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = res2.filename || ('payroll_'+id+'.txt');
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        toast('CBX file downloaded', 'success');
      } catch(e) { toast(e.message, 'error'); }
    };

    window._downloadPayslips = async function() {
      try {
        var payslips = await get('/payroll/runs/'+id+'/payslips');
        var html = '<html><head><title>Payslips - '+monthYear+'</title>' +
          '<style>body{font-family:Arial,sans-serif;font-size:12px} .payslip{border:1px solid #ccc;padding:20px;margin-bottom:20px;page-break-after:always} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ddd;padding:6px;text-align:right} .label{text-align:left} h3{margin:0 0 8px} .header{display:flex;justify-content:space-between;margin-bottom:16px}</style></head><body>';
        payslips.forEach(function(e) {
          html += '<div class="payslip">' +
            '<div class="header"><div><h3>PAYSLIP — '+monthYear+'</h3>' +
            '<div>'+v(e.employee_name)+'</div><div>'+v(e.emp_id)+'</div><div>'+v(e.designation)+'</div><div>'+v(e.department_name)+'</div></div></div>' +
            '<table><tr><th class="label">Earnings</th><th>Amount</th><th class="label">Deductions</th><th>Amount</th></tr>' +
            '<tr><td class="label">Basic</td><td>'+parseFloat(e.basic||0).toFixed(2)+'</td><td class="label">Profession Tax</td><td>'+parseFloat(e.prof_tax||0).toFixed(2)+'</td></tr>' +
            '<tr><td class="label">HRA</td><td>'+parseFloat(e.hra||0).toFixed(2)+'</td><td class="label">ESI</td><td>'+parseFloat(e.esi||0).toFixed(2)+'</td></tr>' +
            '<tr><td class="label">Conveyance</td><td>'+parseFloat(e.conveyance||0).toFixed(2)+'</td><td class="label">TDS</td><td>'+parseFloat(e.tds||0).toFixed(2)+'</td></tr>' +
            '<tr><td class="label">Medical</td><td>'+parseFloat(e.medical||0).toFixed(2)+'</td><td class="label">EPF</td><td>'+parseFloat(e.epf||0).toFixed(2)+'</td></tr>' +
            '<tr><td class="label">Special</td><td>'+parseFloat(e.special||0).toFixed(2)+'</td><td class="label">Advance</td><td>'+parseFloat(e.advance||0).toFixed(2)+'</td></tr>' +
            '<tr><td class="label">Incentive</td><td>'+parseFloat(e.incentive||0).toFixed(2)+'</td><td class="label">Other Deductions</td><td>'+parseFloat(e.other_deductions||0).toFixed(2)+'</td></tr>' +
            '<tr><td class="label">Other</td><td>'+parseFloat(e.other_earnings||0).toFixed(2)+'</td><td></td><td></td></tr>' +
            '<tr style="font-weight:bold"><td class="label">Gross Salary</td><td>'+parseFloat(e.gross_salary||0).toFixed(2)+'</td><td class="label">Total Deductions</td><td>'+parseFloat(e.total_deductions||0).toFixed(2)+'</td></tr>' +
            '<tr style="font-weight:bold;font-size:14px"><td colspan="3" class="label">NET SALARY</td><td>'+parseFloat(e.net_salary||0).toFixed(2)+'</td></tr>' +
            '</table></div>';
        });
        html += '</body></html>';
        var win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.print();
      } catch(e) { toast(e.message, 'error'); }
    };

  } catch(e) { showError(e.message); }
}
