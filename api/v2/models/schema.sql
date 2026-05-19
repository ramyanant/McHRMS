-- ============================================================
-- McHR&TA v2 Database Schema
-- Version: 2.0.0
-- All tables include full audit fields
-- Soft deletes on all primary entities
-- ============================================================

-- ── Audit Log (must exist before anything else) ──────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER,
    username      TEXT,
    ip_address    TEXT,
    user_agent    TEXT,
    module        TEXT NOT NULL,
    action        TEXT NOT NULL,  -- CREATE|UPDATE|DELETE|APPROVE|REJECT|LOGIN|LOGOUT
    entity_type   TEXT,
    entity_id     TEXT,
    description   TEXT,
    before_value  JSONB,
    after_value   JSONB,
    created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user     ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity   ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log(created_at DESC);

-- ── Master / Lookup Tables ───────────────────────────────────
CREATE TABLE IF NOT EXISTS master_user_roles (
    id          SERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system   BOOLEAN DEFAULT FALSE,  -- system roles cannot be deleted
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id          SERIAL PRIMARY KEY,
    role_id     INTEGER NOT NULL REFERENCES master_user_roles(id) ON DELETE CASCADE,
    resource    TEXT NOT NULL,   -- employees, invoices, timesheets, etc.
    can_view    BOOLEAN DEFAULT FALSE,
    can_create  BOOLEAN DEFAULT FALSE,
    can_edit    BOOLEAN DEFAULT FALSE,
    can_delete  BOOLEAN DEFAULT FALSE,
    can_approve BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(role_id, resource)
);

CREATE TABLE IF NOT EXISTS master_employment_types (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS master_contract_types (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS master_timesheet_statuses (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS master_invoice_statuses (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS master_payroll_run_types (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS master_candidate_sources (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS master_application_stages (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    order_seq  INTEGER DEFAULT 0,
    color      TEXT DEFAULT '#6b7280'
);

CREATE TABLE IF NOT EXISTS master_interview_formats (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS master_onboarding_templates (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    tasks_json  JSONB
);

CREATE TABLE IF NOT EXISTS master_payment_terms (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    days       INTEGER
);

CREATE TABLE IF NOT EXISTS master_priority_levels (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    color      TEXT
);

CREATE TABLE IF NOT EXISTS master_vendor_categories (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS master_relationship_types (
    id         SERIAL PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS master_countries (
    id         SERIAL PRIMARY KEY,
    code       TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS master_states (
    id          SERIAL PRIMARY KEY,
    country_id  INTEGER NOT NULL REFERENCES master_countries(id),
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE
);

-- ── Organisation ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisation (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    legal_name      TEXT,
    type            TEXT,
    pan             TEXT,
    tan             TEXT,
    cin             TEXT,
    website         TEXT,
    email           TEXT,
    phone           TEXT,
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    pincode         TEXT,
    country         TEXT DEFAULT 'India',
    logo_url        TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisation_gst (
    id          SERIAL PRIMARY KEY,
    org_id      INTEGER REFERENCES organisation(id),
    gstin       TEXT NOT NULL,
    state       TEXT NOT NULL,
    is_primary  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisation_bank_accounts (
    id              SERIAL PRIMARY KEY,
    org_id          INTEGER REFERENCES organisation(id),
    bank_name       TEXT NOT NULL,
    account_number  TEXT NOT NULL,
    ifsc            TEXT,
    account_type    TEXT,
    is_primary      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisation_labour_certs (
    id           SERIAL PRIMARY KEY,
    org_id       INTEGER REFERENCES organisation(id),
    cert_type    TEXT,
    cert_number  TEXT,
    valid_until  DATE,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisation_documents (
    id            SERIAL PRIMARY KEY,
    org_id        INTEGER REFERENCES organisation(id),
    doc_type      TEXT,
    file_name     TEXT,
    file_url      TEXT,
    uploaded_by   INTEGER,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_units (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    code         TEXT UNIQUE,
    head_emp_id  INTEGER,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW(),
    created_by   INTEGER,
    deleted_at   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    code             TEXT UNIQUE,
    business_unit_id INTEGER REFERENCES business_units(id),
    head_emp_id      INTEGER,
    cost_centre_id   INTEGER,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    created_by       INTEGER,
    deleted_at       TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cost_centres (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    code         TEXT UNIQUE,
    bu_id        INTEGER REFERENCES business_units(id),
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW(),
    created_by   INTEGER
);

CREATE TABLE IF NOT EXISTS office_locations (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    code          TEXT,
    address       TEXT,
    city          TEXT,
    state         TEXT,
    pincode       TEXT,
    country       TEXT DEFAULT 'India',
    phone         TEXT,
    is_hq         BOOLEAN DEFAULT FALSE,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    created_by    INTEGER
);

-- ── Users & Access ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         TEXT UNIQUE NOT NULL,
    email            TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    role_id          INTEGER NOT NULL REFERENCES master_user_roles(id),
    employee_id      INTEGER,
    client_id        INTEGER,
    vendor_id        INTEGER,
    full_name        TEXT,
    is_active        BOOLEAN DEFAULT TRUE,
    must_change_pwd  BOOLEAN DEFAULT FALSE,
    last_login       TIMESTAMP,
    login_attempts   INTEGER DEFAULT 0,
    locked_until     TIMESTAMP,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    created_by       INTEGER
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT UNIQUE NOT NULL,
    ip_address   TEXT,
    user_agent   TEXT,
    expires_at   TIMESTAMP NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ── Employees ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id                    SERIAL PRIMARY KEY,
    emp_id                TEXT UNIQUE,
    first_name            TEXT NOT NULL,
    middle_name           TEXT,
    last_name             TEXT NOT NULL,
    email                 TEXT,
    phone                 TEXT,
    personal_email        TEXT,
    personal_phone        TEXT,
    dob                   DATE,
    gender                TEXT,
    marital_status        TEXT,
    nationality           TEXT DEFAULT 'Indian',
    blood_group           TEXT,

    -- Employment
    job_title             TEXT,
    department_id         INTEGER REFERENCES departments(id),
    business_unit_id      INTEGER REFERENCES business_units(id),
    employment_type_id    INTEGER REFERENCES master_employment_types(id),
    reporting_manager_id  INTEGER REFERENCES employees(id),
    office_location_id    INTEGER REFERENCES office_locations(id),
    client_id             INTEGER,
    project_id            INTEGER,
    cost_centre_id        INTEGER REFERENCES cost_centres(id),
    start_date            DATE,
    end_date              DATE,
    notice_period         INTEGER,
    probation_end_date    DATE,
    status                TEXT DEFAULT 'Active',

    -- Identity / Compliance
    pan                   TEXT,
    aadhaar               TEXT,
    passport_number       TEXT,
    pf_number             TEXT,
    esi_number            TEXT,
    uan                   TEXT,
    pf_applicable         BOOLEAN DEFAULT TRUE,
    esi_applicable        BOOLEAN DEFAULT FALSE,

    -- Finance
    salary                NUMERIC(15,2),
    salary_structure      TEXT,
    bill_rate             NUMERIC(10,2),
    bank_name             TEXT,
    bank_account_number   TEXT,
    bank_ifsc             TEXT,

    -- Metadata
    photo_url             TEXT,
    resume_url            TEXT,
    location              TEXT,
    referred_by           TEXT,
    rating                INTEGER,
    notes                 TEXT,

    created_at            TIMESTAMP DEFAULT NOW(),
    updated_at            TIMESTAMP DEFAULT NOW(),
    created_by            INTEGER,
    updated_by            INTEGER,
    deleted_at            TIMESTAMP,
    is_active             BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_employees_dept   ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_mgr    ON employees(reporting_manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

CREATE TABLE IF NOT EXISTS employee_addresses (
    id            SERIAL PRIMARY KEY,
    employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    address_type  TEXT DEFAULT 'Current',
    line1         TEXT,
    line2         TEXT,
    city          TEXT,
    state         TEXT,
    pincode       TEXT,
    country       TEXT DEFAULT 'India',
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    relationship    TEXT,
    phone           TEXT,
    email           TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_education (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    degree          TEXT,
    institution     TEXT,
    field_of_study  TEXT,
    start_year      INTEGER,
    end_year        INTEGER,
    grade           TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_experience (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    company         TEXT,
    designation     TEXT,
    start_date      DATE,
    end_date        DATE,
    description     TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id            SERIAL PRIMARY KEY,
    employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    doc_type      TEXT,
    file_name     TEXT,
    file_url      TEXT,
    uploaded_by   INTEGER,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_balances (
    id               SERIAL PRIMARY KEY,
    employee_id      INTEGER NOT NULL REFERENCES employees(id),
    year             INTEGER NOT NULL,
    leave_type       TEXT NOT NULL,
    total_days       NUMERIC(5,1) DEFAULT 0,
    used_days        NUMERIC(5,1) DEFAULT 0,
    pending_days     NUMERIC(5,1) DEFAULT 0,
    carried_forward  NUMERIC(5,1) DEFAULT 0,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, year, leave_type)
);

CREATE TABLE IF NOT EXISTS employee_leaves (
    id             SERIAL PRIMARY KEY,
    employee_id    INTEGER NOT NULL REFERENCES employees(id),
    leave_type     TEXT NOT NULL DEFAULT 'Annual',
    from_date      DATE NOT NULL,
    to_date        DATE NOT NULL,
    days           NUMERIC(5,1) DEFAULT 1,
    reason         TEXT,
    status         TEXT DEFAULT 'Pending',
    approved_by    INTEGER REFERENCES employees(id),
    approved_at    TIMESTAMP,
    rejection_reason TEXT,
    applied_at     TIMESTAMP DEFAULT NOW(),
    created_at     TIMESTAMP DEFAULT NOW(),
    updated_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaves_emp    ON employee_leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON employee_leaves(status);

-- ── Clients ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id                SERIAL PRIMARY KEY,
    name              TEXT NOT NULL,
    legal_name        TEXT,
    type              TEXT DEFAULT 'Direct',
    industry          TEXT,
    website           TEXT,
    email             TEXT,
    phone             TEXT,
    pan               TEXT,
    gstin             TEXT,
    address           TEXT,
    city              TEXT,
    state             TEXT,
    pincode           TEXT,
    country           TEXT DEFAULT 'India',
    payment_terms_id  INTEGER REFERENCES master_payment_terms(id),
    credit_limit      NUMERIC(15,2),
    account_manager_id INTEGER REFERENCES employees(id),
    status            TEXT DEFAULT 'Active',
    rating            INTEGER,
    notes             TEXT,
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW(),
    created_by        INTEGER,
    updated_by        INTEGER,
    deleted_at        TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_documents (
    id           SERIAL PRIMARY KEY,
    client_id    INTEGER NOT NULL REFERENCES clients(id),
    doc_type     TEXT,
    file_name    TEXT,
    file_url     TEXT,
    uploaded_by  INTEGER,
    created_at   TIMESTAMP DEFAULT NOW()
);

-- ── Vendors ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    category_id      INTEGER REFERENCES master_vendor_categories(id),
    website          TEXT,
    email            TEXT,
    phone            TEXT,
    pan              TEXT,
    gstin            TEXT,
    address          TEXT,
    city             TEXT,
    state            TEXT,
    country          TEXT DEFAULT 'India',
    payment_terms_id INTEGER REFERENCES master_payment_terms(id),
    status           TEXT DEFAULT 'Active',
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    created_by       INTEGER,
    deleted_at       TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_documents (
    id          SERIAL PRIMARY KEY,
    vendor_id   INTEGER NOT NULL REFERENCES vendors(id),
    doc_type    TEXT,
    file_name   TEXT,
    file_url    TEXT,
    uploaded_by INTEGER,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id               SERIAL PRIMARY KEY,
    code             TEXT UNIQUE,
    name             TEXT NOT NULL,
    client_id        INTEGER REFERENCES clients(id),
    project_manager_id INTEGER REFERENCES employees(id),
    type             TEXT,
    status           TEXT DEFAULT 'Active',
    start_date       DATE,
    end_date         DATE,
    budget           NUMERIC(15,2),
    billing_type     TEXT,
    rate             NUMERIC(10,2),
    description      TEXT,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    created_by       INTEGER,
    deleted_at       TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_resources (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id),
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    role            TEXT,
    allocation_pct  NUMERIC(5,2) DEFAULT 100,
    start_date      DATE,
    end_date        DATE,
    bill_rate       NUMERIC(10,2),
    cost_rate       NUMERIC(10,2),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_milestones (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id),
    name        TEXT NOT NULL,
    due_date    DATE,
    status      TEXT DEFAULT 'Pending',
    amount      NUMERIC(15,2),
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_risks (
    id           SERIAL PRIMARY KEY,
    project_id   INTEGER NOT NULL REFERENCES projects(id),
    description  TEXT NOT NULL,
    impact       TEXT,
    probability  TEXT,
    mitigation   TEXT,
    status       TEXT DEFAULT 'Open',
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_documents (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id),
    doc_type    TEXT,
    file_name   TEXT,
    file_url    TEXT,
    uploaded_by INTEGER,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Timesheets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheets (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    project_id      INTEGER REFERENCES projects(id),
    client_id       INTEGER REFERENCES clients(id),
    week_ending     DATE NOT NULL,
    mon             NUMERIC(4,2) DEFAULT 0,
    tue             NUMERIC(4,2) DEFAULT 0,
    wed             NUMERIC(4,2) DEFAULT 0,
    thu             NUMERIC(4,2) DEFAULT 0,
    fri             NUMERIC(4,2) DEFAULT 0,
    sat             NUMERIC(4,2) DEFAULT 0,
    sun             NUMERIC(4,2) DEFAULT 0,
    total_hours     NUMERIC(6,2) DEFAULT 0,
    billable_hours  NUMERIC(6,2) DEFAULT 0,
    status_id       INTEGER REFERENCES master_timesheet_statuses(id),
    notes           TEXT,
    approved_by     INTEGER REFERENCES employees(id),
    approved_at     TIMESTAMP,
    rejection_reason TEXT,
    invoice_id      INTEGER,   -- linked when billed
    submitted_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ts_employee  ON timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_ts_week      ON timesheets(week_ending);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='timesheets' AND column_name='project_id') THEN
    CREATE INDEX IF NOT EXISTS idx_ts_project ON timesheets(project_id);
  END IF;
END $$;

-- ── Payroll ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
    id              SERIAL PRIMARY KEY,
    run_type_id     INTEGER REFERENCES master_payroll_run_types(id),
    month           INTEGER NOT NULL,
    year            INTEGER NOT NULL,
    status          TEXT DEFAULT 'Draft',
    run_date        DATE,
    total_gross     NUMERIC(15,2),
    total_net       NUMERIC(15,2),
    total_deductions NUMERIC(15,2),
    notes           TEXT,
    created_by      INTEGER,
    approved_by     INTEGER,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(month, year, run_type_id)
);

CREATE TABLE IF NOT EXISTS payroll_entries (
    id                 SERIAL PRIMARY KEY,
    payroll_run_id     INTEGER REFERENCES payroll_runs(id),
    employee_id        INTEGER NOT NULL REFERENCES employees(id),
    month              INTEGER,
    year               INTEGER,
    basic              NUMERIC(12,2) DEFAULT 0,
    hra                NUMERIC(12,2) DEFAULT 0,
    allowances         NUMERIC(12,2) DEFAULT 0,
    gross_salary       NUMERIC(12,2) DEFAULT 0,
    pf_employee        NUMERIC(12,2) DEFAULT 0,
    pf_employer        NUMERIC(12,2) DEFAULT 0,
    esi_employee       NUMERIC(12,2) DEFAULT 0,
    esi_employer       NUMERIC(12,2) DEFAULT 0,
    tds                NUMERIC(12,2) DEFAULT 0,
    other_deductions   NUMERIC(12,2) DEFAULT 0,
    total_deductions   NUMERIC(12,2) DEFAULT 0,
    net_salary         NUMERIC(12,2) DEFAULT 0,
    working_days       NUMERIC(4,1),
    paid_days          NUMERIC(4,1),
    lop_days           NUMERIC(4,1) DEFAULT 0,
    status             TEXT DEFAULT 'Draft',
    payslip_url        TEXT,
    paid_at            TIMESTAMP,
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payroll_emp     ON payroll_entries(employee_id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_entries' AND column_name='year') THEN
    CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_entries(year, month);
  END IF;
END $$;

-- ── Recruitment ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_requisitions (
    id                   SERIAL PRIMARY KEY,
    code                 TEXT UNIQUE,
    title                TEXT NOT NULL,
    department_id        INTEGER REFERENCES departments(id),
    client_id            INTEGER REFERENCES clients(id),
    project_id           INTEGER REFERENCES projects(id),
    employment_type_id   INTEGER REFERENCES master_employment_types(id),
    positions            INTEGER DEFAULT 1,
    filled_positions     INTEGER DEFAULT 0,
    min_experience       INTEGER,
    max_experience       INTEGER,
    min_salary           NUMERIC(12,2),
    max_salary           NUMERIC(12,2),
    location             TEXT,
    description          TEXT,
    requirements         TEXT,
    priority_id          INTEGER REFERENCES master_priority_levels(id),
    status               TEXT DEFAULT 'Open',
    target_date          DATE,
    raised_by            INTEGER REFERENCES employees(id),
    assigned_to          INTEGER REFERENCES employees(id),
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW(),
    created_by           INTEGER,
    deleted_at           TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jreq_status ON job_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_jreq_client ON job_requisitions(client_id);

CREATE TABLE IF NOT EXISTS candidates (
    id                  SERIAL PRIMARY KEY,
    first_name          TEXT NOT NULL,
    last_name           TEXT,
    email               TEXT,
    phone               TEXT,
    current_location    TEXT,
    current_company     TEXT,
    current_designation TEXT,
    total_experience    NUMERIC(4,1),
    relevant_experience NUMERIC(4,1),
    current_ctc         NUMERIC(12,2),
    expected_ctc        NUMERIC(12,2),
    notice_period       INTEGER,
    skills              TEXT,
    linkedin_url        TEXT,
    resume_url          TEXT,
    source_id           INTEGER REFERENCES master_candidate_sources(id),
    referred_by         TEXT,
    status              TEXT DEFAULT 'Active',
    rating              INTEGER,
    notes               TEXT,
    converted_to_employee_id INTEGER REFERENCES employees(id),
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    created_by          INTEGER,
    deleted_at          TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
    id                  SERIAL PRIMARY KEY,
    requisition_id      INTEGER NOT NULL REFERENCES job_requisitions(id),
    candidate_id        INTEGER NOT NULL REFERENCES candidates(id),
    stage_id            INTEGER REFERENCES master_application_stages(id),
    status              TEXT DEFAULT 'Applied',
    applied_at          TIMESTAMP DEFAULT NOW(),
    assigned_to         INTEGER REFERENCES employees(id),
    notes               TEXT,
    rejection_reason    TEXT,
    updated_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(requisition_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_req  ON applications(requisition_id);
CREATE INDEX IF NOT EXISTS idx_applications_cand ON applications(candidate_id);

CREATE TABLE IF NOT EXISTS interviews (
    id               SERIAL PRIMARY KEY,
    application_id   INTEGER REFERENCES applications(id),
    requisition_id   INTEGER REFERENCES job_requisitions(id),
    candidate_id     INTEGER NOT NULL REFERENCES candidates(id),
    interviewer_id   INTEGER REFERENCES employees(id),
    format_id        INTEGER REFERENCES master_interview_formats(id),
    round            INTEGER DEFAULT 1,
    scheduled_at     TIMESTAMP,
    duration_mins    INTEGER DEFAULT 60,
    location         TEXT,
    meeting_link     TEXT,
    status           TEXT DEFAULT 'Scheduled',
    overall_rating   INTEGER,
    feedback         TEXT,
    recommendation   TEXT,
    completed_at     TIMESTAMP,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    created_by       INTEGER
);

CREATE TABLE IF NOT EXISTS offers (
    id                   SERIAL PRIMARY KEY,
    candidate_id         INTEGER NOT NULL REFERENCES candidates(id),
    requisition_id       INTEGER NOT NULL REFERENCES job_requisitions(id),
    application_id       INTEGER REFERENCES applications(id),
    designation          TEXT,
    department_id        INTEGER REFERENCES departments(id),
    joining_date         DATE,
    offered_ctc          NUMERIC(12,2),
    offered_basic        NUMERIC(12,2),
    offered_hra          NUMERIC(12,2),
    offered_allowances   NUMERIC(12,2),
    employment_type_id   INTEGER REFERENCES master_employment_types(id),
    offer_date           DATE,
    expiry_date          DATE,
    status               TEXT DEFAULT 'Draft',
    offer_letter_url     TEXT,
    acceptance_date      DATE,
    rejection_date       DATE,
    rejection_reason     TEXT,
    converted_to_emp_id  INTEGER REFERENCES employees(id),
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW(),
    created_by           INTEGER,
    approved_by          INTEGER
);

CREATE TABLE IF NOT EXISTS onboarding (
    id                  SERIAL PRIMARY KEY,
    offer_id            INTEGER REFERENCES offers(id),
    candidate_id        INTEGER REFERENCES candidates(id),
    employee_id         INTEGER REFERENCES employees(id),
    requisition_id      INTEGER REFERENCES job_requisitions(id),
    joining_date        DATE,
    status              TEXT DEFAULT 'Pending',
    template_id         INTEGER REFERENCES master_onboarding_templates(id),
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    created_by          INTEGER
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id              SERIAL PRIMARY KEY,
    onboarding_id   INTEGER NOT NULL REFERENCES onboarding(id),
    task_name       TEXT NOT NULL,
    owner           TEXT,
    due_date        DATE,
    status          TEXT DEFAULT 'Pending',
    notes           TEXT,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ── Invoices & Billing ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id                  SERIAL PRIMARY KEY,
    invoice_number      TEXT UNIQUE,
    client_id           INTEGER NOT NULL REFERENCES clients(id),
    project_id          INTEGER REFERENCES projects(id),
    status_id           INTEGER REFERENCES master_invoice_statuses(id),
    invoice_date        DATE NOT NULL,
    due_date            DATE,
    billing_period_from DATE,
    billing_period_to   DATE,
    currency            TEXT DEFAULT 'INR',
    subtotal            NUMERIC(15,2) DEFAULT 0,
    discount_pct        NUMERIC(5,2)  DEFAULT 0,
    discount_amount     NUMERIC(15,2) DEFAULT 0,
    taxable_amount      NUMERIC(15,2) DEFAULT 0,
    cgst_pct            NUMERIC(5,2)  DEFAULT 0,
    sgst_pct            NUMERIC(5,2)  DEFAULT 0,
    igst_pct            NUMERIC(5,2)  DEFAULT 0,
    cgst_amount         NUMERIC(15,2) DEFAULT 0,
    sgst_amount         NUMERIC(15,2) DEFAULT 0,
    igst_amount         NUMERIC(15,2) DEFAULT 0,
    total_amount        NUMERIC(15,2) DEFAULT 0,
    amount_paid         NUMERIC(15,2) DEFAULT 0,
    balance_due         NUMERIC(15,2) DEFAULT 0,
    payment_terms_id    INTEGER REFERENCES master_payment_terms(id),
    notes               TEXT,
    payment_date        DATE,
    payment_reference   TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    created_by          INTEGER,
    updated_by          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status_id);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id              SERIAL PRIMARY KEY,
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    resource_name   TEXT,
    employee_id     INTEGER REFERENCES employees(id),
    quantity        NUMERIC(10,2) DEFAULT 1,
    unit            TEXT DEFAULT 'Hours',
    rate            NUMERIC(10,2) DEFAULT 0,
    amount          NUMERIC(15,2) DEFAULT 0,
    timesheet_ids   INTEGER[],
    order_seq       INTEGER DEFAULT 0
);

-- ── Notifications ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    link        TEXT,
    module      TEXT,
    entity_id   INTEGER,
    is_read     BOOLEAN DEFAULT FALSE,
    read_at     TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user   ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_time   ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS email_templates (
    id              SERIAL PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    subject         TEXT NOT NULL,
    body_html       TEXT NOT NULL,
    variables_json  JSONB,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── Candidate Projects (sourcing) ─────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_projects (
    id            SERIAL PRIMARY KEY,
    candidate_id  INTEGER NOT NULL REFERENCES candidates(id),
    project_id    INTEGER REFERENCES projects(id),
    client_id     INTEGER REFERENCES clients(id),
    role          TEXT,
    status        TEXT,
    start_date    DATE,
    end_date      DATE,
    notes         TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- ── Settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
    id          SERIAL PRIMARY KEY,
    key         TEXT UNIQUE NOT NULL,
    value       TEXT,
    description TEXT,
    updated_at  TIMESTAMP DEFAULT NOW(),
    updated_by  INTEGER
);

