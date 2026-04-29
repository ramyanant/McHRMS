# HireFlow Pro — Database-Driven HR & ATS Platform

A complete full-stack HR and Applicant Tracking System built with **Python Flask + SQLite3 backend** and a **live database-driven frontend**.

## Stack
| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12 · Flask 3.x |
| Database | SQLite3 (WAL mode, full foreign keys) |
| Frontend | Vanilla JS · Chart.js 4.4 |
| API | RESTful JSON · Full CRUD |

## Quick Start
```bash
# 1. Install Flask (only dependency)
pip install flask

# 2. Initialize DB and start server
python start.py

# 3. Open browser
open http://localhost:8080
```

## File Structure
```
hireflow-app/
├── start.py              # One-command startup
├── api/
│   ├── app.py            # Flask REST API (~1,050 lines, 40+ endpoints)
│   └── db/
│       └── hireflow.db   # SQLite database (auto-created)
├── db/
│   ├── schema.sql        # Full database schema (17 tables)
│   └── init_db.py        # Schema + seed data loader
└── static/
    └── index.html        # Full frontend (~1,490 lines)
```

## API Endpoints (40+)

### Dashboard
- `GET /api/dashboard` — All KPIs, funnel, activity, trends

### Organization
- `GET/POST /api/departments`
- `PUT/DELETE /api/departments/:id`
- `GET /api/business-units`
- `GET /api/offices`

### Clients & Vendors
- `GET/POST /api/clients` · `GET/PUT/DELETE /api/clients/:id`
- `GET/POST /api/vendors` · `PUT/DELETE /api/vendors/:id`

### People
- `GET/POST /api/employees` · `GET/PUT/DELETE /api/employees/:id`
- `GET/POST /api/timesheets` · `PUT /api/timesheets/:id`
- `GET /api/timesheets/summary`
- `GET/POST /api/payroll` · `GET /api/payroll/summary`

### Talent Acquisition
- `GET/POST /api/requisitions` · `GET/PUT/DELETE /api/requisitions/:id`
- `GET/POST /api/candidates` · `GET/PUT /api/candidates/:id`
- `GET /api/pipeline`
- `POST /api/applications` · `GET/PUT /api/applications/:id`
- `GET/POST /api/interviews` · `PUT /api/interviews/:id`
- `GET /api/interviews/summary`
- `GET/POST /api/onboarding` · `GET/PUT /api/onboarding/:id`
- `PUT /api/onboarding/tasks/:id`

### Finance
- `GET/POST /api/invoices` · `GET/PUT /api/invoices/:id`
- `GET /api/invoices/summary`

### Reports (all live queries)
- `GET /api/reports/financial`
- `GET /api/reports/recruiter`
- `GET /api/reports/applicants`
- `GET /api/reports/clients`
- `GET /api/reports/vendors`
- `GET /api/reports/workforce`

### Utilities
- `GET /api/search?q=` — Global search across all entities
- `GET /api/activity`
- `GET /api/sourcing/stats`
- `GET /api/lookup/employees|clients|departments`
- `GET /api/org/summary`

## Database Schema (17 Tables)
`business_units` · `departments` · `office_locations` · `clients` · `vendors` · `employees` · `timesheets` · `payroll_runs` · `job_requisitions` · `candidates` · `applications` · `interviews` · `onboarding` · `onboarding_tasks` · `invoices` · `invoice_line_items` · `activity_log`

## Seed Data
- 8 clients · 8 vendors · 16 employees · 8 timesheets
- 8 job requisitions · 14 candidates · 14 applications · 6 interviews
- 4 onboarding records · 10 invoices · Activity log

## Features
- ✅ Full CRUD on every entity
- ✅ Live KPIs computed from real DB queries
- ✅ Revenue trend charts from invoice data
- ✅ Kanban pipeline from real applications
- ✅ Global search across all entities
- ✅ Timesheet approve/return/bulk-approve
- ✅ Invoice mark-paid with date recording
- ✅ AR aging computed from DB
- ✅ 6 report tabs with live analytics
- ✅ Activity log tracking all mutations
- ✅ CORS enabled (deploy anywhere)
- ✅ Zero npm, zero build step
