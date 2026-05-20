# McHR&TA Session Notes — 2026-05-20

## For Next Chat — Read This First

**Repo:** https://github.com/ramyanant/McHRMS.git | Branch: `mcraan`
**Live:** https://mchrms-production.up.railway.app
**Entry:** `api/v2/main.py $PORT`
**Latest commit:** `f7c54cf`
**Admin:** `admin / Admin@123`
**Railway:** Deployments paused (billing limit — credits still showing, needs review)

---

## Employees (Live in DB)
| Name | EmpID | Username | Password | Title |
|------|-------|----------|----------|-------|
| Jagadish Chandra Mamidi | ISPL1001 | jagadish.mamidi | Employee123 | Founder President |
| Ramya Anant | ISPL1002 | ramya.anant | Employee123 | Chief Administrative Officer |
| Seema Nair | ISPL1003 | seema.nair | Employee123 | HR Manager |

All have `must_change_pwd=true`. Employee role → routed to `/portal` on login.

---

## What Was Done This Session

### Payroll Module (fully functional)
- SAVEPOINT, updated_at, run_date NOT NULL, location_id errors all fixed
- CA Statement: stored as base64, downloadable as `YYYY-MM CA Statement.xlsx`
- CBX Statement: `YYYY-MM CBX Statement.xlsx`
- Banking File: `YYYY-MM CBX Statement.txt`
  - Format: `N,,{BankAccNo},{NetSalary},{FullName},,{20 commas},,{DD/MM/YYYY},,{IFSC},,,{Email}`
  - Bank details from employees table via employee_id FK
- Auth: `?token=` query param accepted in auth middleware for direct downloads
- Row click + View navigates correctly
- Month + Year + Status filters
- EmpID + Name in preview (sheet_to_json {header:1}, robust row filter)
- Designation: COALESCE(e.designation, e.job_title) everywhere
- Indian Rupee format: pure JS inr() function (9,99,99,000.00)
- SyntaxError fix: escaped quotes in padStart caused ES module parse failure
- Employee login: Employee role → /portal (not /dashboard which returned 404)

### Employee ID Format
- Configurable prefix in app_settings (emp_id_prefix = ISPL)
- Starting number in app_settings (emp_id_start = 1001)
- people/routes.py reads from app_settings at runtime
- Migration renames EMP-XXXX → ISPLXXXX for existing employees
- API: GET/PUT /api/v2/admin/settings/emp-id
- UI: Organisation Profile → Employee ID Format section

### Forgot Password
- POST /auth/forgot-password → 6-digit OTP returned directly (demo mode)
- POST /auth/reset-password → validates, resets

---

## NEXT: PAYSLIPS (discussed, not yet built)

### Requirements
1. List: YYYY-MM | Date of Salary | LOP Days | Net Salary | Download PDF
   - Sort, filters, pagination
2. On click: HTML view of payslip
3. PDF: YYYY-MM Payslip - EmpID - Firstname Lastname.pdf
4. Access: Admin (all) | Reporting Manager (direct reports) | Employee (own only)
5. Admin: View + Download per employee + Bulk Download with select-all
6. Template: User has IQuest payslip — will share screenshot in new chat
7. Data: All live DB columns confirmed available

### Live DB Columns for Payslips
Earnings: basic, hra, conveyance, medical, special, incentive, other_earnings, gross_salary
Deductions: prof_tax, esi_employee, tds, epf, medical_deduction, advance, other_deductions, total_deductions
Days: lop_days, loss_of_pay, working_days, paid_days
Net: net_salary
Employee: emp_id, employee_name, designation, department_name, location_name, bank_account_number, bank_ifsc, personal_email
Run: month, year, run_date, status

### Existing Backend
GET /api/v2/payroll/runs/<id>/payslips — returns entries with employee info
Portal renderPayslips() — currently placeholder "coming in Phase 3"

### PDF Approach (recommended)
HTML view with print CSS + browser Print to PDF (no server dependency)
