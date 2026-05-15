import { get }             from '../api.js';
import { setPageTitle, setBreadcrumb, setContent, showLoader, showError,
         badge, fmt } from '../ui.js';

export async function renderList() {
  setPageTitle('Payroll', 'Salary runs');
  setBreadcrumb([{ label: 'Payroll' }]);
  showLoader();
  setContent(`<div class="page-body">
    <div class="empty-state">
      <div class="empty-icon">💰</div>
      <div class="empty-title">Payroll Module</div>
      <div class="empty-sub">Payroll runs and payslip management — coming in Phase 3</div>
    </div>
  </div>`);
}
export async function renderDetail({ id }) { renderList(); }
