# McHR&TA — Enterprise HRMS v2

**McRaaN Human Resources & Talent Acquisition**

Stack: Flask 3.1 · PostgreSQL · Vanilla JS ES Modules  
Live: https://mchrms-production.up.railway.app  

## Modules
- Organisation (BUs, Departments, Cost Centres, Locations)
- People & Users (Employees, RBAC)
- Clients & Vendors
- Projects & Resources
- Payroll (CA Excel import → CBX bank file)
- Recruitment / TA (Jobs → Candidates → Pipeline → Offers → Onboarding)
- Timesheets
- Invoices & Bills
- Employee Portal (self-service viewing)
- Admin (Audit logs, Settings)

## Latest fixes (2026-05-20)
- 97 schema alignment migrations
- Clients/Vendors/Projects/Recruitment — 32 issues resolved
- Forgot Password flow (frontend + backend)
- Payroll delete, SAVEPOINT, column name fixes
- Security: @require_role on all mutating routes

