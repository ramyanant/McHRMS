import { API } from '../api.js';
import { setContent } from '../router.js';
import { fmt } from '../utils.js';
import { pillStatus } from '../components/table.js';

export async function renderReports() {
  const [workforce, recruitment, invoices] = await Promise.all([
    API.rptWorkforce(), API.rptRecruitment(), API.rptInvoices(),
  ]);

  setContent(`
    <div class="toolbar"><div class="toolbar-title">Reports & Analytics</div></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><div class="card-title">Headcount by Department</div></div>
        <div class="table-container"><table>
          <thead><tr><th>Department</th><th>Headcount</th></tr></thead>
          <tbody>
            ${(workforce?.by_department||[]).map(d=>`<tr>
              <td>${d.department}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="background:var(--green);height:8px;border-radius:4px;width:${Math.min(d.count*10,200)}px;min-width:4px"></div>
                <strong>${d.count}</strong>
              </div></td>
            </tr>`).join('')}
            ${!workforce?.by_department?.length?'<tr><td colspan="2" style="color:var(--txt3);text-align:center">No data</td></tr>':''}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Headcount by Type</div></div>
        <div class="table-container"><table>
          <thead><tr><th>Employment Type</th><th>Count</th></tr></thead>
          <tbody>
            ${(workforce?.by_employment_type||[]).map(t=>`<tr><td>${t.type}</td><td><strong>${t.count}</strong></td></tr>`).join('')}
            ${!workforce?.by_employment_type?.length?'<tr><td colspan="2" style="color:var(--txt3);text-align:center">No data</td></tr>':''}
          </tbody>
        </table></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><div class="card-title">Invoice Aging (₹)</div></div>
        <div class="card-body">
          ${invoices?.aging?.[0] ? (() => {
            const a = invoices.aging[0];
            const data = [['Current', a.current_due,'var(--green)'],['30 Days', a['30_days'],'var(--amber)'],['60 Days', a['60_days'],'var(--red)'],['90+ Days', a['90_plus'],'#7c3aed']];
            return data.map(([l,v,c])=>`<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
              <div style="width:80px;font-size:12px;color:var(--txt2)">${l}</div>
              <div style="flex:1;height:24px;background:var(--s3);border-radius:4px;overflow:hidden">
                <div style="background:${c};height:100%;width:${v>0?Math.min(v/100,100):0}%;border-radius:4px"></div>
              </div>
              <div style="width:80px;text-align:right;font-size:13px;font-weight:600;color:${c}">${fmt.inr(v)}</div>
            </div>`).join('');
          })() : '<div style="color:var(--txt3)">No invoice data</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Recruitment — Source Mix</div></div>
        <div class="table-container"><table>
          <thead><tr><th>Source</th><th>Candidates</th></tr></thead>
          <tbody>
            ${(recruitment?.by_source||[]).map(s=>`<tr>
              <td>${s.source}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="background:var(--blue);height:8px;border-radius:4px;width:${Math.min(s.count*8,160)}px;min-width:4px"></div>
                <strong>${s.count}</strong>
              </div></td>
            </tr>`).join('')}
            ${!recruitment?.by_source?.length?'<tr><td colspan="2" style="color:var(--txt3);text-align:center">No data</td></tr>':''}
          </tbody>
        </table></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">Invoice Summary by Client (Top 10)</div></div>
      <div class="table-container"><table>
        <thead><tr><th>Client</th><th>Invoices</th><th>Total Invoiced</th><th>Paid</th><th>Outstanding</th></tr></thead>
        <tbody>
          ${(invoices?.by_client||[]).map(c=>`<tr>
            <td>${c.client}</td>
            <td class="td-mono">${c.invoice_count}</td>
            <td class="td-mono">${fmt.inr(c.total_amount)}</td>
            <td class="td-mono" style="color:var(--green)">${fmt.inr(c.paid)}</td>
            <td class="td-mono" style="color:${c.outstanding>0?'var(--red)':'var(--txt2)'}">${fmt.inr(c.outstanding)}</td>
          </tr>`).join('')}
          ${!invoices?.by_client?.length?'<tr><td colspan="5" style="color:var(--txt3);text-align:center">No data</td></tr>':''}
        </tbody>
      </table></div>
    </div>
  `);
}
