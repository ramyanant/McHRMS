# McHR&TA — Enterprise Architecture Design
# Principal Architect: Claude Sonnet 4.6
# Version: 2.0 | Phase 1 Foundation

================================================================================
## SECTION 1: CURRENT STATE AUDIT FINDINGS
================================================================================

### What Exists
- 2 files: api/app.py (3,530 lines), static/index.html (7,777 lines)
- 136 API routes, 58 DB tables, 224 JS functions — all in single files
- Requirements: flask==3.1.0, psycopg2-binary==2.9.9 (just 2 packages)

### Critical Defects
| # | Severity | Issue |
|---|----------|-------|
| 1 | CRITICAL | SHA-256 unsalted password hashing (rainbow table vulnerable) |
| 2 | CRITICAL | `_cur()` creates new cursor per call — causes "no results to fetch" |
| 3 | CRITICAL | `autocommit=True` everywhere — zero rollback capability |
| 4 | CRITICAL | No rollback — any multi-step op can leave DB in corrupt state |
| 5 | CRITICAL | Duplicate route: /api/auth/change-password (Flask ignores second) |
| 6 | CRITICAL | Admin reset-db endpoint exposed in production with no guard |
| 7 | HIGH | No input validation layer — raw JSON to SQL |
| 8 | HIGH | No rate limiting — brute force on login trivial |
| 9 | HIGH | No audit fields (created_by, updated_by, deleted_at) on any table |
| 10 | HIGH | No soft deletes — hard delete breaks referential integrity |
| 11 | HIGH | No notifications table or email system |
| 12 | HIGH | No permissions table — RBAC is role-name string comparison only |
| 13 | HIGH | No offer management table |
| 14 | HIGH | 0 rollback() calls in 3,530 lines |
| 15 | MEDIUM | auth token in localStorage (XSS-stealable) |
| 16 | MEDIUM | No URL routing — browser back/forward/refresh all broken |
| 17 | MEDIUM | No migration system — schema changes require manual DB surgery |
| 18 | MEDIUM | `log()` called only 10 times in entire codebase |
| 19 | MEDIUM | 7,777-line single HTML file — one bad character breaks everything |
| 20 | LOW | No indexes beyond PKs |

================================================================================
## SECTION 2: TARGET ARCHITECTURE
================================================================================

### Backend: Layered Flask + Blueprint Architecture

```
api/
├── __init__.py              # App factory
├── config.py                # Environment config
├── extensions.py            # DB, limiter, mail singletons
├── middleware/
│   ├── auth.py              # JWT/session auth decorator
│   ├── rbac.py              # Permission enforcement
│   ├── audit.py             # Auto audit log on write
│   └── validate.py          # Request validation
├── models/
│   ├── base.py              # Base model with audit fields
│   └── schema.sql           # Versioned schema
├── blueprints/
│   ├── auth/                # Login, logout, password
│   ├── organisation/        # Profile, BUs, Depts, CCs, Locations
│   ├── people/              # Employees, Users, Roles
│   ├── projects/            # Projects, resources, milestones
│   ├── clients/             # Clients, contacts, documents
│   ├── vendors/             # Vendors, documents
│   ├── timesheets/          # Submit, approve, history
│   ├── payroll/             # Runs, entries, payslips
│   ├── recruitment/         # Jobs, applicants, pipeline, interviews, offers, onboarding
│   ├── invoices/            # Create, approve, send, pay
│   ├── reports/             # All reports
│   ├── notifications/       # In-app + email
│   ├── audit/               # Audit log viewer
│   ├── portal/              # Employee self-service
│   └── admin/               # Users, roles, permissions, system
└── utils/
    ├── pagination.py
    ├── export.py            # CSV/PDF/Excel
    ├── email.py             # SMTP/SendGrid
    └── validators.py
```

### Frontend: Multi-file SPA with Hash Routing

```
static/
├── index.html               # Shell only — no logic
├── js/
│   ├── app.js               # Router, auth state, boot
│   ├── api.js               # Centralised API layer
│   ├── router.js            # Hash-based URL router
│   ├── auth.js              # Auth state management
│   ├── components/
│   │   ├── table.js         # Reusable data table
│   │   ├── modal.js         # Reusable modal
│   │   ├── form.js          # Form builder
│   │   ├── breadcrumb.js    # Breadcrumb component
│   │   ├── pagination.js    # Pagination component
│   │   ├── toast.js         # Notifications
│   │   └── sidebar.js       # Dynamic sidebar
│   └── pages/
│       ├── dashboard.js
│       ├── organisation/
│       ├── employees/
│       ├── recruitment/
│       ├── timesheets/
│       ├── payroll/
│       ├── invoices/
│       ├── reports/
│       ├── portal/
│       └── admin/
└── css/
    ├── base.css             # Design tokens, reset
    ├── components.css       # Reusable UI components
    └── pages.css            # Page-specific overrides
```

================================================================================
## SECTION 3: COMPLETE URL MAP
================================================================================

Every URL below is a real page with its own title, breadcrumb, and permissions.

### Public Routes
| URL | Page | Description |
|-----|------|-------------|
| /login | Login | Authentication |
| /forgot-password | Forgot Password | Password reset flow |

### Dashboard
| URL | Page | Roles |
|-----|------|-------|
| /dashboard | Main Dashboard | All |

### Organisation
| URL | Page | Roles |
|-----|------|-------|
| /organisation/profile | Org Profile | Admin |
| /organisation/business-units | Business Units | Admin, HR |
| /organisation/business-units/:id | BU Detail | Admin, HR |
| /organisation/departments | Departments | Admin, HR |
| /organisation/departments/:id | Dept Detail | Admin, HR |
| /organisation/cost-centres | Cost Centres | Admin, Finance |
| /organisation/cost-centres/:id | CC Detail | Admin, Finance |
| /organisation/locations | Locations | Admin |
| /organisation/locations/:id | Location Detail | Admin |

### People — Employees
| URL | Page | Roles |
|-----|------|-------|
| /employees | Employee List | Admin, HR |
| /employees/new | Add Employee | Admin, HR |
| /employees/:id | Employee Profile | Admin, HR, Self |
| /employees/:id/personal | Personal Info | Admin, HR, Self |
| /employees/:id/employment | Employment Info | Admin, HR |
| /employees/:id/documents | Documents | Admin, HR, Self |
| /employees/:id/payroll | Payroll Info | Admin, Finance |
| /employees/:id/leaves | Leave History | Admin, HR, Self |
| /employees/:id/timesheets | Timesheet History | Admin, HR, Self |

### People — Users & Access
| URL | Page | Roles |
|-----|------|-------|
| /admin/users | Users List | Admin |
| /admin/users/new | Add User | Admin |
| /admin/users/:id | User Detail | Admin |
| /admin/roles | Roles | Admin |
| /admin/roles/:id | Role Detail | Admin |
| /admin/permissions | Permission Matrix | Admin |

### Projects
| URL | Page | Roles |
|-----|------|-------|
| /projects | Projects List | Admin, PM, Finance |
| /projects/new | New Project | Admin, PM |
| /projects/:id | Project Overview | Admin, PM |
| /projects/:id/resources | Resources | Admin, PM |
| /projects/:id/timesheets | Timesheets | Admin, PM, Finance |
| /projects/:id/milestones | Milestones | Admin, PM |
| /projects/:id/invoices | Invoices | Admin, Finance |
| /projects/:id/risks | Risks | Admin, PM |
| /projects/:id/documents | Documents | Admin, PM |

### Clients
| URL | Page | Roles |
|-----|------|-------|
| /clients | Clients List | Admin, AM, Finance |
| /clients/new | New Client | Admin, AM |
| /clients/:id | Client Overview | Admin, AM |
| /clients/:id/contacts | Contacts | Admin, AM |
| /clients/:id/projects | Projects | Admin, AM |
| /clients/:id/invoices | Invoices | Admin, Finance |
| /clients/:id/documents | Documents | Admin, AM |

### Vendors
| URL | Page | Roles |
|-----|------|-------|
| /vendors | Vendors List | Admin, Finance |
| /vendors/new | New Vendor | Admin |
| /vendors/:id | Vendor Overview | Admin |
| /vendors/:id/documents | Documents | Admin |

### Timesheets
| URL | Page | Roles |
|-----|------|-------|
| /timesheets | All Timesheets | Admin, Finance |
| /timesheets/pending | Pending Approval | Admin, Manager |
| /timesheets/new | Submit Timesheet | Employee |
| /timesheets/:id | Timesheet Detail | Admin, Manager, Owner |
| /timesheets/approval | My Approval Queue | Manager |

### Payroll
| URL | Page | Roles |
|-----|------|-------|
| /payroll | Payroll Dashboard | Admin, Finance |
| /payroll/runs | Payroll Runs | Admin, Finance |
| /payroll/runs/new | Run Payroll | Admin, Finance |
| /payroll/runs/:id | Run Detail | Admin, Finance |
| /payroll/payslips | All Payslips | Admin, Finance |
| /payroll/payslips/:id | Payslip Detail | Admin, Finance, Owner |

### Recruitment — Talent Acquisition
| URL | Page | Roles |
|-----|------|-------|
| /recruitment | TA Dashboard | All TA roles |
| /recruitment/jobs | Job Requisitions | All TA roles |
| /recruitment/jobs/new | New Requisition | RM, AM, HR |
| /recruitment/jobs/:id | Job Detail | All TA roles |
| /recruitment/jobs/:id/pipeline | Job Pipeline | All TA roles |
| /recruitment/applicants | All Applicants | All TA roles |
| /recruitment/applicants/new | New Applicant | Recruiter+ |
| /recruitment/applicants/:id | Applicant Profile | All TA roles |
| /recruitment/candidates | Candidates | All TA roles |
| /recruitment/candidates/new | New Candidate | Recruiter+ |
| /recruitment/candidates/:id | Candidate Profile | All TA roles |
| /recruitment/pipeline | ATS Pipeline (Kanban) | All TA roles |
| /recruitment/interviews | All Interviews | All TA roles |
| /recruitment/interviews/new | Schedule Interview | Recruiter+ |
| /recruitment/interviews/:id | Interview Detail | All TA roles |
| /recruitment/offers | Offers | RM, AM, HR |
| /recruitment/offers/new | New Offer | RM, AM |
| /recruitment/offers/:id | Offer Detail | RM, AM, HR |
| /recruitment/onboarding | Onboarding List | HR, RM |
| /recruitment/onboarding/:id | Onboarding Detail | HR, RM |

### Invoices & Billing
| URL | Page | Roles |
|-----|------|-------|
| /invoices | Invoices List | Admin, Finance, AM |
| /invoices/new | Create Invoice | Admin, Finance |
| /invoices/:id | Invoice Detail | Admin, Finance, AM |
| /invoices/aging | Aging Report | Admin, Finance |

### Reports & Analytics
| URL | Page | Roles |
|-----|------|-------|
| /reports | Reports Home | All (filtered) |
| /reports/workforce | Workforce Report | Admin, HR |
| /reports/recruitment | Recruitment Funnel | TA roles |
| /reports/timesheets | Timesheet Report | Admin, Finance, Manager |
| /reports/payroll | Payroll Summary | Admin, Finance |
| /reports/invoices | Invoice / AR Report | Admin, Finance |
| /reports/clients | Client Profitability | Admin, Finance, AM |
| /reports/projects | Project Costing | Admin, Finance, PM |
| /reports/leaves | Leave Summary | Admin, HR |

### Notifications
| URL | Page | Roles |
|-----|------|-------|
| /notifications | Notifications | All |
| /notifications/settings | Notification Prefs | All |

### Audit & Activity
| URL | Page | Roles |
|-----|------|-------|
| /audit-logs | Audit Log Viewer | Admin |
| /audit-logs/:id | Audit Entry Detail | Admin |

### Settings
| URL | Page | Roles |
|-----|------|-------|
| /settings | Settings Home | Admin |
| /settings/general | General Settings | Admin |
| /settings/email | Email Config | Admin |
| /settings/security | Security Settings | Admin |
| /settings/integrations | Integrations | Admin |

### Employee Portal (Self-Service)
| URL | Page | Roles |
|-----|------|-------|
| /portal | Portal Home | Employee |
| /portal/profile | My Profile | Employee |
| /portal/timesheets | My Timesheets | Employee |
| /portal/timesheets/new | Submit Timesheet | Employee |
| /portal/leaves | My Leaves | Employee |
| /portal/leaves/new | Apply Leave | Employee |
| /portal/payslips | My Payslips | Employee |
| /portal/payslips/:id | Payslip Detail | Employee |
| /portal/team | My Team | Employee |
| /portal/approvals | Approval Queue | Manager |

================================================================================
## SECTION 4: DATABASE IMPROVEMENTS
================================================================================

### New/Modified Tables Required

1. **All tables** — Add: created_by INTEGER, updated_by INTEGER, 
   deleted_at TIMESTAMP (soft delete), is_active BOOLEAN DEFAULT TRUE

2. **notifications** (NEW)
   id, user_id, type, title, body, link, is_read, created_at

3. **offers** (NEW)
   id, candidate_id, requisition_id, employee_id (when accepted),
   offered_salary, offered_designation, offer_date, expiry_date,
   status (Draft/Sent/Accepted/Rejected/Expired), 
   offer_letter_url, rejection_reason, created_by, timestamps

4. **permissions** (NEW)
   id, role_id, resource, action (view/create/edit/delete/approve)

5. **leave_balances** (NEW)
   id, employee_id, year, leave_type, total_days, used_days, 
   pending_days, carried_forward

6. **email_templates** (NEW)
   id, code, subject, body_html, variables_json

7. **All tables** — Add proper indexes on foreign keys and common filters

================================================================================
## SECTION 5: API VERSIONING STRATEGY
================================================================================

All new APIs under /api/v1/ prefix
Legacy /api/ routes maintained with deprecation headers during transition

================================================================================
## SECTION 6: SECURITY IMPROVEMENTS
================================================================================

1. bcrypt password hashing (cost factor 12)
2. Rate limiting: 5 failed logins → 15 min lockout
3. httpOnly cookies for session tokens (XSS protection)
4. Input validation on every endpoint (marshmallow/pydantic)
5. Remove all debug/reset admin endpoints from production
6. Permission middleware — check DB permissions, not just role name
7. Audit log on every write operation (automatic middleware)

================================================================================
## SECTION 7: IMPLEMENTATION PHASES
================================================================================

### Phase 1 — Foundation (CURRENT — Weeks 1-2)
Backend refactoring to Blueprint architecture.
Zero new features. Zero regressions. Pure structural improvement.

Steps:
1. Create project folder structure
2. Split app.py into blueprints (auth, org, people, recruitment, etc.)
3. Fix _cur() cursor bug with proper connection management
4. Add bcrypt password hashing with migration
5. Add proper transaction management
6. Add audit log middleware (auto-logs all writes)
7. Add input validation layer
8. Remove/guard debug endpoints
9. Add rate limiting to auth

### Phase 2 — Frontend Modularisation (Weeks 3-4)
Split index.html into proper multi-file SPA.
Implement URL hash routing.
Zero new features. All existing pages work on dedicated URLs.

Steps:
1. Create static/js/ structure
2. Implement hash router
3. Extract each module page into its own JS file
4. Build reusable Table, Modal, Form components
5. Centralise API layer
6. Add breadcrumb navigation
7. Add proper empty/loading states

### Phase 3 — Missing Business Logic (Weeks 5-6)
Build what's missing from the current system.

1. Offer management (full lifecycle)
2. Leave balance management
3. Timesheet billing linkage to invoices
4. Payroll with PF/ESI/TDS calculations
5. Candidate → Employee conversion workflow
6. Invoice approval workflow
7. Notification engine (in-app + email)

### Phase 4 — Reporting & Exports (Week 7)
1. All report pages with filters
2. CSV/Excel export on every list
3. PDF payslip generation
4. Dashboard analytics charts

### Phase 5 — Production Readiness (Week 8)
1. Environment configuration system
2. Proper error monitoring
3. OpenAPI/Swagger documentation
4. Docker containerisation
5. Database migration system (Alembic)
6. CI/CD pipeline setup
7. Performance optimisation

================================================================================
## SECTION 8: EXECUTION RULES (INVIOLABLE)
================================================================================

1. Every change uses safe_patch.py — never manual string positions
2. Node.js syntax check before every JS push
3. Python ast.parse() before every app.py push
4. No feature added without its URL route
5. No route added without RBAC permission check
6. No write operation without audit log entry
7. No DB write without transaction boundary
8. Test login after EVERY push

