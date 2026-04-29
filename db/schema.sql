-- HireFlow Pro Database Schema
-- SQLite3

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ═══════════════════════════════════════════════
-- ORGANIZATION
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS business_units (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    business_unit_id INTEGER REFERENCES business_units(id),
    head_name       TEXT,
    budget          REAL DEFAULT 0,
    cost_center     TEXT,
    location        TEXT,
    status          TEXT DEFAULT 'Active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS office_locations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    city        TEXT,
    country     TEXT DEFAULT 'USA',
    type        TEXT DEFAULT 'Regional',
    headcount   INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'Open',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- CLIENTS
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    industry        TEXT,
    contract_type   TEXT DEFAULT 'Staff Augmentation',
    billing_rate    TEXT,
    payment_terms   TEXT DEFAULT 'Net 30',
    primary_contact TEXT,
    contact_email   TEXT,
    address         TEXT,
    account_manager TEXT,
    health_score    INTEGER DEFAULT 80,
    status          TEXT DEFAULT 'Active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- VENDORS
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS vendors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    category        TEXT,
    primary_contact TEXT,
    contact_email   TEXT,
    contract_end    DATE,
    sla_score       INTEGER DEFAULT 90,
    spend_mtd       REAL DEFAULT 0,
    sla_description TEXT,
    status          TEXT DEFAULT 'Active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- EMPLOYEES
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id          TEXT UNIQUE,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT UNIQUE,
    phone           TEXT,
    job_title       TEXT,
    department_id   INTEGER REFERENCES departments(id),
    employment_type TEXT DEFAULT 'Full-Time',
    location        TEXT,
    manager_id      INTEGER REFERENCES employees(id),
    client_id       INTEGER REFERENCES clients(id),
    salary          REAL,
    bill_rate       REAL,
    start_date      DATE,
    status          TEXT DEFAULT 'Active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- TIMESHEETS
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS timesheets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    client_id       INTEGER REFERENCES clients(id),
    project         TEXT,
    week_ending     DATE NOT NULL,
    regular_hours   REAL DEFAULT 0,
    overtime_hours  REAL DEFAULT 0,
    total_hours     REAL GENERATED ALWAYS AS (regular_hours + overtime_hours) STORED,
    bill_rate       REAL DEFAULT 0,
    estimated_revenue REAL GENERATED ALWAYS AS ((regular_hours + overtime_hours) * bill_rate) STORED,
    status          TEXT DEFAULT 'Pending',
    notes           TEXT,
    submitted_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at     DATETIME,
    approved_by     INTEGER REFERENCES employees(id)
);

-- ═══════════════════════════════════════════════
-- PAYROLL
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payroll_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date        DATE NOT NULL,
    period_start    DATE,
    period_end      DATE,
    run_type        TEXT DEFAULT 'Semi-Monthly FTE',
    employee_count  INTEGER DEFAULT 0,
    gross_amount    REAL DEFAULT 0,
    net_amount      REAL DEFAULT 0,
    tax_amount      REAL DEFAULT 0,
    status          TEXT DEFAULT 'Scheduled',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- JOB REQUISITIONS
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS job_requisitions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    client_id       INTEGER REFERENCES clients(id),
    engagement_type TEXT DEFAULT 'Staff Augmentation',
    department_id   INTEGER REFERENCES departments(id),
    recruiter_id    INTEGER REFERENCES employees(id),
    priority        TEXT DEFAULT 'Medium',
    location        TEXT,
    comp_min        REAL,
    comp_max        REAL,
    description     TEXT,
    target_start    DATE,
    opened_date     DATE DEFAULT CURRENT_DATE,
    filled_date     DATE,
    status          TEXT DEFAULT 'Active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- CANDIDATES
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS candidates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    location        TEXT,
    current_title   TEXT,
    years_exp       INTEGER,
    source          TEXT DEFAULT 'LinkedIn',
    linkedin_url    TEXT,
    resume_url      TEXT,
    skills          TEXT,  -- comma-separated
    status          TEXT DEFAULT 'Active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- PIPELINE (APPLICATIONS)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS applications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id    INTEGER NOT NULL REFERENCES candidates(id),
    requisition_id  INTEGER NOT NULL REFERENCES job_requisitions(id),
    stage           TEXT DEFAULT 'Applied',
    expected_salary REAL,
    recruiter_id    INTEGER REFERENCES employees(id),
    notes           TEXT,
    rejection_reason TEXT,
    applied_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- INTERVIEWS
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS interviews (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL REFERENCES applications(id),
    round           TEXT NOT NULL,
    format          TEXT DEFAULT 'Video',
    interviewer     TEXT,
    scheduled_at    DATETIME,
    location_link   TEXT,
    scorecard_status TEXT DEFAULT 'Not Started',
    decision        TEXT,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- ONBOARDING
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS onboarding (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    template        TEXT DEFAULT 'Standard FTE',
    buddy_name      TEXT,
    start_date      DATE,
    progress_pct    INTEGER DEFAULT 0,
    day30_status    TEXT DEFAULT 'Pending',
    day60_status    TEXT DEFAULT 'Pending',
    day90_status    TEXT DEFAULT 'Pending',
    equipment       TEXT,
    status          TEXT DEFAULT 'In Progress',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    onboarding_id   INTEGER NOT NULL REFERENCES onboarding(id),
    task_name       TEXT NOT NULL,
    category        TEXT DEFAULT 'General',
    is_complete     INTEGER DEFAULT 0,
    due_date        DATE,
    completed_at    DATETIME
);

-- ═══════════════════════════════════════════════
-- INVOICES
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number  TEXT UNIQUE NOT NULL,
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    invoice_type    TEXT DEFAULT 'Staff Augmentation',
    period_start    DATE,
    period_end      DATE,
    amount          REAL NOT NULL DEFAULT 0,
    tax_amount      REAL DEFAULT 0,
    total_amount    REAL GENERATED ALWAYS AS (amount + tax_amount) STORED,
    due_date        DATE,
    paid_date       DATE,
    payment_ref     TEXT,
    notes           TEXT,
    po_number       TEXT,
    status          TEXT DEFAULT 'Draft',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id),
    employee_id     INTEGER REFERENCES employees(id),
    description     TEXT,
    hours           REAL DEFAULT 0,
    rate            REAL DEFAULT 0,
    amount          REAL GENERATED ALWAYS AS (hours * rate) STORED
);

-- ═══════════════════════════════════════════════
-- ACTIVITY LOG
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER,
    action      TEXT NOT NULL,
    description TEXT,
    user_name   TEXT DEFAULT 'System',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_client ON employees(client_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_employee ON timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_req ON applications(requisition_id);
CREATE INDEX IF NOT EXISTS idx_applications_stage ON applications(stage);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
