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
  setPageTitle('Payroll', 'Monthly salary runs');
  setBreadcrumb([{ label: 'Payroll' }]);
  showLoader();
  try {
    var data = await get('/payroll/runs');
    var rows = data.items || data || [];
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var q = '', filterStatus = '', filterMonth = 0, filterYear = 0, sortCol = 'year', sortDir = -1, page = 1;
    var PER = 25;

    function getF() {
      return rows.filter(function(r) {
        var mLabel = MONTHS[(r.month||1)-1] + ' ' + r.year;
        var matchQ = !q || mLabel.toLowerCase().includes(q.toLowerCase()) ||
                     (r.status||'').toLowerCase().includes(q.toLowerCase());
        var matchS = !filterStatus || r.status === filterStatus;
        var matchM = !filterMonth || (r.month||0) === filterMonth;
        var matchY = !filterYear  || (r.year||0)  === filterYear;
        return matchQ && matchS && matchM && matchY;
      }).sort(function(a,b) {
        var av = a[sortCol], bv = b[sortCol];
        if (sortCol === 'year') { av = a.year*100+(a.month||0); bv = b.year*100+(b.month||0); }
        return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
      });
    }

    function sortBtn(col, label) {
      var active = sortCol === col;
      return '<button class="btn btn-ghost btn-xs" style="font-weight:'+(active?'700':'400')+'" onclick="window._prSort(\'' + col + '\')">' +
        label + (active ? (sortDir===1?' ▲':' ▼') : '') + '</button>';
    }

    function render() {
      var all = getF(), total = all.length, pages = Math.max(1,Math.ceil(total/PER));
      page = Math.min(Math.max(1,page), pages);
      var slice = all.slice((page-1)*PER, page*PER);

      var pgBar = '';
      if (pages > 1) {
        pgBar = '<div class="pagination">';
        if (page > 1) pgBar += '<button class="pg-btn" onclick="window._prPage('+(page-1)+')">&#8249;</button>';
        for (var p2 = Math.max(1,page-2); p2 <= Math.min(pages,page+2); p2++) {
          pgBar += '<button class="pg-btn'+(p2===page?' active':'')+'" onclick="window._prPage('+p2+')">'+p2+'</button>';
        }
        if (page < pages) pgBar += '<button class="pg-btn" onclick="window._prPage('+(page+1)+')">&#8250;</button>';
        pgBar += '<span class="pg-info">'+total+' runs</span></div>';
      }

      var html = '<div class="page-body">' +
        '<div class="card">' +
        '<div class="card-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<h3 class="card-title" style="flex:1">Payroll Runs</h3>' +
        '<select class="fselect" style="width:110px" onchange="window._prMonth(this.value)">' +
        '<option value="">All Months</option>' +
        ['January','February','March','April','May','June','July','August','September','October','November','December'].map(function(m,i){
          return '<option value="'+(i+1)+'"'+(filterMonth===(i+1)?' selected':'')+'>'+m+'</option>';
        }).join('') + '</select>' +
        '<select class="fselect" style="width:90px" onchange="window._prYear(this.value)">' +
        '<option value="">All Years</option>' +
        (function(){ var opts="",y=new Date().getFullYear(); for(var i=y+1;i>=2020;i--) opts+='<option value="'+i+'"'+(filterYear===i?' selected':'')+'>'+i+'</option>'; return opts; })() +
        '</select>' +
        '<select class="fselect" style="width:130px" onchange="window._prStatus(this.value)">' +
        '<option value="">All Statuses</option>' +
        ['New','Approved','Processed','On Hold','Rejected'].map(function(s){
          return '<option value="'+s+'"'+(filterStatus===s?' selected':'')+'>'+s+'</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-primary btn-sm" onclick="navigateTo(\'/payroll/new\')">+ New Payroll Run</button>' +
        '</div>' +
        '<div class="tbl-wrap"><table class="data-table"><thead><tr>' +
        '<th>'+sortBtn('year','Month / Year')+'</th>' +
        '<th>CA Statement</th>' +
        '<th>CBX Statement</th>' +
        '<th>Banking File</th>' +
        '<th>'+sortBtn('status','Status')+'</th>' +
        '<th>Emp</th>' +
        '<th>Actions</th>' +
        '</tr></thead><tbody>' +
        (slice.length === 0 ? '<tr><td colspan="7" class="text-center" style="padding:32px;color:var(--txt3)">No payroll runs found</td></tr>' :
        slice.map(function(r) {
          var mLabel = MONTHS[(r.month||1)-1] + ' ' + r.year;
          var statusColor = {New:'info',Approved:'success',Processed:'success','On Hold':'warning',Rejected:'danger'}[r.status]||'default';
          // CA Statement — direct download from stored file
          var caBtn = r.ca_filename
            ? '<button class="btn btn-ghost btn-xs" onclick="window._prDownCA('+r.id+')" title="'+v(r.ca_filename)+'">&#128190; '+v(r.ca_filename)+'</button>'
            : '<span style="color:var(--txt3);font-size:11px">None</span>';
          // CBX Statement — available Approved/Processed, Excel format (re-generates on click)
          var cbxBtn = (r.status === 'Approved' || r.status === 'Processed')
            ? '<button class="btn btn-ghost btn-xs" onclick="window._prDownCBX('+r.id+','+r.year+','+(r.month||1)+')" title="Download CBX Statement">&#128190; '+r.year+'-'+(String(r.month||1).padStart(2,\'0\'))+' CBX Statement.xlsx</button>'
            : '<span style="color:var(--txt3);font-size:11px">&#8212;</span>';
          // Banking File — TXT format for bank upload (available Approved/Processed)
          var bankBtn = (r.status === 'Approved' || r.status === 'Processed')
            ? '<button class="btn btn-ghost btn-xs" onclick="window._prDownBank('+r.id+','+r.year+','+(r.month||1)+')">&#128196; '+r.year+'-'+(String(r.month||1).padStart(2,\'0\'))+' CBX Statement.txt</button>'
            : '<span style="color:var(--txt3);font-size:11px">&#8212;</span>';
          return '<tr class="tbl-clickable" data-id="'+r.id+'">' +
            '<td><strong>'+mLabel+'</strong></td>' +
            '<td onclick="event.stopPropagation()">'+caBtn+'</td>' +
            '<td onclick="event.stopPropagation()">'+cbxBtn+'</td>' +
            '<td onclick="event.stopPropagation()">'+bankBtn+'</td>' +
            '<td><span class="badge badge-'+statusColor+'">'+v(r.status)+'</span></td>' +
            '<td>'+(r.employee_count||0)+'</td>' +
            '<td class="tbl-actions" onclick="event.stopPropagation()">' +
            '<button class="btn btn-ghost btn-xs" data-id="'+r.id+'" onclick="window._prView(this)">View</button>' +
            '<button class="btn btn-danger btn-xs" data-id="'+r.id+'" data-label="'+mLabel+'" onclick="window._prDelete(this)">Delete</button>' +
            '</td></tr>';
        }).join('')) +
        '</tbody></table></div>' + pgBar + '</div></div>';

      setContent(html);

      window._prQ      = function(val){ q=val; page=1; render(); };
      window._prStatus = function(val){ filterStatus=val; page=1; render(); };
      window._prMonth  = function(val){ filterMonth=parseInt(val)||0; page=1; render(); };
      window._prYear   = function(val){ filterYear=parseInt(val)||0;  page=1; render(); };
      window._prSort   = function(col){ if(sortCol===col) sortDir*=-1; else{sortCol=col;sortDir=-1;} render(); };
      window._prPage   = function(p){ page=p; render(); };
      // Row click navigation using data-id
      document.querySelectorAll('tr[data-id]').forEach(function(tr) {
        tr.addEventListener('click', function() { navigateTo('/payroll/'+this.dataset.id); });
      });
      window._prView = function(btn) { navigateTo('/payroll/'+btn.dataset.id); };
      window._prDelete = async function(btn) {
        var id = btn.dataset.id, label = btn.dataset.label;
        if(!confirm('Delete payroll run for '+label+'? This cannot be undone.')) return;
        try { await put('/payroll/runs/'+id, {is_active:0}); toast('Deleted','info'); rows=rows.filter(function(r){return String(r.id)!==String(id);}); render(); }
        catch(ex){ toast(ex.message||'Failed','error'); }
      };
      // _authToken defined at module scope in renderList for use in download fns
      window._authToken = function() {
        // api.js stores token in localStorage under 'mch_token'
        return localStorage.getItem('mch_token') || '';
      };
      window._prDownCA = async function(id) {
        try {
          var tok = window._authToken();
          var resp = await fetch('/api/v2/payroll/runs/'+id+'/ca?token='+encodeURIComponent(tok));
          if (!resp.ok) {
            var e2 = await resp.json().catch(function(){return {};});
            toast(e2.message || 'CA file not found', 'error'); return;
          }
          var blob = await resp.blob();
          var cd   = resp.headers.get('Content-Disposition') || '';
          var fname = (cd.match(/filename="([^"]+)"/) || [])[1] || 'ca_statement.xlsx';
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fname;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
          toast('CA file downloaded', 'success');
        } catch(ex){ toast(ex.message||'Failed','error'); }
      };
      window._prDownBank = async function(id, year, month) {
        try {
          var tok = window._authToken();
          var resp = await fetch('/api/v2/payroll/runs/'+id+'/cbx?format=txt&token='+encodeURIComponent(tok));
          if (!resp.ok) { var e2 = await resp.json(); toast(e2.message||'Download failed','error'); return; }
          var txt = await resp.text();
          var mm = String(month).padStart(2,'0');
          var blob = new Blob([txt], {type:'text/plain'});
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = year+'-'+mm+'.CBX.txt';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
          toast('Banking file downloaded','success');
        } catch(ex){ toast(ex.message||'Failed','error'); }
      };
      window._prDownCBX = async function(id, year, month) {
        // Generate CBX Excel from payroll entries
        try {
          var res2 = await get('/payroll/runs/'+id);
          var entries2 = (res2.entries || []);
          if (!entries2.length) { toast('No entries in this run','error'); return; }
          var mod2 = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs');
          var XL = mod2;
          var hdr = ['Emp ID','Name','Designation','Department','Location','CTC',
            'LOP','Basic','HRA','Conv.','Medical','Special','Incentive','Other Earnings',
            'Gross','PT','ESI','TDS','EPF','Med.Ded.','Advance','Other Ded.','Total Ded.','Net Salary'];
          var xlrows = [hdr];
          entries2.forEach(function(e) {
            xlrows.push([
              e.emp_id||'', e.employee_name||'', e.designation||'', e.department_name||'', e.location_name||'',
              parseFloat(e.ctc||0), parseFloat(e.loss_of_pay||0), parseFloat(e.basic||0),
              parseFloat(e.hra||0), parseFloat(e.conveyance||0), parseFloat(e.medical||0),
              parseFloat(e.special||0), parseFloat(e.incentive||0), parseFloat(e.other_earnings||0),
              parseFloat(e.gross_salary||0), parseFloat(e.prof_tax||0), parseFloat(e.esi||0),
              parseFloat(e.tds||0), parseFloat(e.epf||0), parseFloat(e.medical_deduction||0),
              parseFloat(e.advance||0), parseFloat(e.other_deductions||0),
              parseFloat(e.total_deductions||0), parseFloat(e.net_salary||0)
            ]);
          });
          var ws2 = XL.utils.aoa_to_sheet(xlrows);
          var wb2 = XL.utils.book_new();
          XL.utils.book_append_sheet(wb2, ws2, 'Payroll');
          var mm = String(month).padStart(2,'0');
          XL.writeFile(wb2, year+'-'+mm+'.CBX.xlsx');
          toast('CBX Excel downloaded', 'success');
        } catch(ex){ toast(ex.message||'Failed','error'); }
      };
    }

    render();
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
      '<button class="btn btn-primary" id="save-pr-btn" onclick="window._savePayrollRun()" id="save-run-btn" disabled>Save Payroll Run</button>' +
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
        // {header:1} forces array-of-arrays — first row is headers, rest are data
        // Positional access A=0,B=1...X=23 is always reliable regardless of header text
        var rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // Find first row that looks like data (has an EmpID-like value in col 0)
        var dataStart = 1; // skip header row
        // If first row col0 is numeric or looks like an EmpID, treat row 0 as data
        if (rawRows.length > 0 && rawRows[0][0]) {
          var r0c0 = String(rawRows[0][0]).trim();
          // It's a data row if col0 has digits (emp ID) but not a pure header word
          if (/\d/.test(r0c0)) { dataStart = 0; }
        }
        // Skip rows where col[0] is empty, or is a header word, or is a total row
        var SKIP_WORDS = ['emp','empid','employeeid','sl','slno','srno','s.no','name','total','grand'];
        var json = rawRows.slice(dataStart).filter(function(r) {
          if (!r || r[0] === null || r[0] === undefined || String(r[0]).trim() === '') return false;
          var c0 = String(r[0]).trim().toLowerCase().replace(/[^a-z0-9]/g,'');
          // Skip if col0 is a known header/total keyword
          if (SKIP_WORDS.indexOf(c0) >= 0) return false;
          // Skip if col0 is only letters (no numbers — likely a header)
          if (/^[a-z\s\.]+$/i.test(String(r[0]).trim()) && String(r[0]).trim().length > 0 && !/\d/.test(String(r[0]))) return false;
          return true;
        });
        entries = json.map(function(row) {
          // ── POSITIONAL COLUMN PARSER (A=0 … X=23) ──────────────────────────────
          // A(0)=EmpID  B(1)=Name   C(2)=Designation  D(3)=Department  E(4)=Location
          // F(5)=CTC    G(6)=LOP    H(7)=Basic         I(8)=HRA         J(9)=Conv
          // K(10)=Medical  L(11)=Special  M(12)=Incentive  N(13)=Other  O(14)=Gross
          // P(15)=PT    Q(16)=ESI   R(17)=TDS   S(18)=EPF
          // T(19)=Med.Ded.  U(20)=Advance  V(21)=OtherDed  W(22)=TotalDed  X(23)=Net
          var cols = row; // already an array
          function col(i) { return parseFloat(cols[i]) || 0; }
          function colS(i) { var v = cols[i]; return (v === null || v === undefined) ? '' : String(v).trim(); }

          var empId  = colS(0);
          var name   = colS(1);
          var desig  = colS(2);
          var dept   = colS(3);
          var loc    = colS(4);
          var ctc    = col(5);
          var lop    = col(6);
          var basic  = col(7);
          var hra    = col(8);
          var conv   = col(9);
          var med    = col(10);
          var spec   = col(11);
          var inc    = col(12);
          var oth    = col(13);
          var gross  = col(14);  // use spreadsheet gross (col O)
          var pt     = col(15);
          var esi    = col(16);
          var tds    = col(17);
          var epf    = col(18);
          var medd   = col(19);
          var adv    = col(20);
          var othd   = col(21);
          var totalDed = col(22);  // use spreadsheet total (col W)
          var net    = col(23);    // use spreadsheet net (col X)

          return {
            employee_id:   empId,
            emp_id:        empId,
            name:          name,
            designation:   desig,
            department:    dept,
            location:      loc,
            ctc:           ctc,
            loss_of_pay:   lop,
            basic:         basic,
            hra:           hra,
            conveyance:    conv,
            medical:       med,
            special:       spec,
            incentive:     inc,
            other_earnings:oth,
            gross_salary:  gross,
            prof_tax:      pt,
            esi:           esi,
            tds:           tds,
            epf:           epf,
            medical_deduction: medd,
            advance:       adv,
            other_deductions:  othd,
            total_deductions:  totalDed,
            net_salary:    net,
            _status:       '',
          };
        });
        renderPreview();
        document.getElementById('file-status').textContent = '✅ ' + entries.length + ' rows loaded from ' + file.name;
        // Store raw file as base64 so we can save it to the server
        var fileReader2 = new FileReader();
        fileReader2.onload = function(ev2) {
          window._caFileData = ev2.target.result;   // data URI (base64)
          window._caFileName = file.name;
        };
        fileReader2.readAsDataURL(file);
        var saveBtn = document.getElementById('save-run-btn');
        if (saveBtn && entries.length > 0) saveBtn.disabled = false;
        document.getElementById('save-pr-btn').disabled = false;
      } catch(err) {
        document.getElementById('file-status').textContent = '❌ Error: ' + err.message;
      }
    };
    reader.readAsBinaryString(file);
  });

  function renderPreview() {
    if (!entries.length) return;
    var cols = ['emp_id','name','designation','department','location','ctc',
      'loss_of_pay','basic','hra','conveyance','medical','special','incentive','other_earnings','gross_salary',
      'prof_tax','esi','tds','epf','medical_deduction','advance','other_deductions','total_deductions','net_salary'];
    var labels = ['Emp ID','Name','Designation','Department','Location','CTC',
      'LOP','Basic','HRA','Conv.','Medical','Special','Incentive','Other','Gross',
      'PT','ESI','TDS','EPF','Med.Ded.','Advance','Other Ded.','Total Ded.','Net'];

    // Show raw detected columns so user can see what was found
        var detectedCols = window._payrollRawKeys || (entries.length > 0 ? 'Upload processed (' + entries.length + ' rows)' : 'none');
        var colDebug = '<div class="card" style="margin-top:8px;border:1px solid #bfdbfe">' +
          '<div class="card-body" style="padding:8px 12px;font-size:11px">' +
          '<strong>📊 Columns detected:</strong> <code style="font-size:10px">' + detectedCols + '</code>' +
          '</div></div>';
        document.getElementById('payroll-preview').innerHTML = colDebug +
          '<div class="card" style="margin-top:8px"><div class="card-header"><h3 class="card-title">Preview ('+entries.length+' employees)</h3></div>' +
      '<div class="tbl-wrap"><table class="data-table" style="font-size:11px"><thead><tr>' +
        cols.map(function(c,i){ return '<th style="white-space:nowrap">'+labels[i]+'</th>'; }).join('') +
      '</tr></thead><tbody>' +
      entries.map(function(e,idx) {
        return '<tr>' + cols.map(function(c) {
          var val = e[c];
          if (c === 'emp_id' || c === 'name' || c === 'designation' || c === 'department' || c === 'location') {
            return '<td style="white-space:nowrap">'+v(val)+'</td>';
          }
          return '<td class="mono" contenteditable="true" onblur="window._editCell('+idx+',\''+c+'\',this.textContent)" style="text-align:right;min-width:60px">'+parseFloat(val||0).toFixed(2)+'</td>';
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
    var btn = document.getElementById('save-run-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      // 1. Save to database
      var mmPad = String(month).padStart(2,'0');
      var caName = year+'-'+mmPad+' CA Statement.xlsx';
      var res = await post('/payroll/runs', { month, year, run_date: date, notes, entries,
        ca_filename: caName, ca_file_data: window._caFileData || '' });
      var runId = res.id;

      // 2. Generate Excel download (same 24-col format as input)
      try {
        var mod2 = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs');
        var XL = mod2;
        var cols = ['Emp ID','Name','Designation','Department','Location','CTC',
          'LOP','Basic','HRA','Conv.','Medical','Special','Incentive','Other Earnings',
          'Gross','PT','ESI','TDS','EPF','Med.Ded.','Advance','Other Ded.','Total Ded.','Net Salary'];
        var rows = [cols];
        entries.forEach(function(e) {
          rows.push([
            e.emp_id||e.employee_id, e.name||'', e.designation||'', e.department||'', e.location||'',
            e.ctc||0, e.loss_of_pay||0, e.basic||0, e.hra||0, e.conveyance||0,
            e.medical||0, e.special||0, e.incentive||0, e.other_earnings||0, e.gross_salary||0,
            e.prof_tax||0, e.esi||0, e.tds||0, e.epf||0, e.medical_deduction||0,
            e.advance||0, e.other_deductions||0, e.total_deductions||0, e.net_salary||0
          ]);
        });
        var ws = XL.utils.aoa_to_sheet(rows);
        var wb = XL.utils.book_new();
        XL.utils.book_append_sheet(wb, ws, 'Payroll');
        var mname = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1];
        var mmStr2 = String(month).padStart(2,'0');
        XL.writeFile(wb, year+'-'+mmStr2+'.CBX.xlsx');
      } catch(xlErr) { console.warn('Excel export failed:', xlErr); }

      // 3. Generate CBX .txt download
      try {
        var runDateFmt = date ? new Date(date).toLocaleDateString('en-GB').replace(/\//g,'/') : new Date().toLocaleDateString('en-GB').replace(/\//g,'/');
        var cbxLines = entries.map(function(e) {
          var acc  = (e.bank_account_number||'').trim();
          var net  = Math.round(parseFloat(e.net_salary||0));
          var name = (e.name||'').trim();
          var ifsc = (e.bank_ifsc||'').trim();
          var email= (e.personal_email||e.email||'').trim();
          return 'N,,' + acc + ',' + net + ',' + name + ',,,,,,,,,,,,,,,,,,' + runDateFmt + ',,' + ifsc + ',,,' + email;
        });
        var cbxBlob = new Blob([cbxLines.join('\n')], { type: 'text/plain' });
        var cbxUrl  = URL.createObjectURL(cbxBlob);
        var cbxLink = document.createElement('a');
        var mmStr = String(month).padStart(2,'0');
        cbxLink.href = cbxUrl; cbxLink.download = year+'-'+mmStr+'.CBX.txt';
        document.body.appendChild(cbxLink); cbxLink.click(); document.body.removeChild(cbxLink);
        URL.revokeObjectURL(cbxUrl);
      } catch(cbxErr) { console.warn('CBX export failed:', cbxErr); }

      toast('✓ Payroll saved. Excel + CBX downloaded.', 'success');
      navigate('/payroll/' + runId);
    } catch(e2) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Payroll Run'; }
      toast(e2.message, 'error');
    }
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
          var num = parseFloat(val||0).toFixed(2);
          if (isPending) {
            return '<td class="mono" contenteditable="true" onblur="window._editPayEntry('+e.id+',\''+c+'\',this.textContent)" style="text-align:right;min-width:60px;background:var(--bg)">'+num+'</td>';
          }
          return '<td class="mono" style="text-align:right">'+num+'</td>';
        }).join('') + '</tr>';
      }).join('') +
      '<tr style="font-weight:700;background:var(--brand-light)"><td colspan="14" style="text-align:right;font-size:11px">TOTALS →</td>' +
      '<td class="mono" style="text-align:right">'+totalGross.toFixed(2)+'</td>' +
      '<td colspan="7"></td>' +
      '<td class="mono" style="text-align:right">'+totalDed.toFixed(2)+'</td>' +
      '<td class="mono" style="text-align:right;color:var(--green)">'+totalNet.toFixed(2)+'</td>' +
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
