-- McHR&TA — McRaaN Human Resources and Talent Acquisition
-- Normalised SQLite Schema v2.0
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS master_countries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT, country_id INTEGER NOT NULL REFERENCES master_countries(id), code TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1, UNIQUE(country_id,code));
CREATE TABLE IF NOT EXISTS master_employment_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_contract_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_vendor_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_invoice_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_application_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_interview_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_onboarding_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_candidate_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_payment_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, days INTEGER DEFAULT 30, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_priority_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_timesheet_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_payroll_run_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, description TEXT, is_active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS organisation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_name TEXT NOT NULL, trade_name TEXT, logo_url TEXT,
    reg_address_line1 TEXT, reg_address_line2 TEXT, reg_city TEXT,
    reg_state_id INTEGER REFERENCES master_states(id), reg_pincode TEXT,
    reg_country_id INTEGER REFERENCES master_countries(id),
    biz_address_line1 TEXT, biz_address_line2 TEXT, biz_city TEXT,
    biz_state_id INTEGER REFERENCES master_states(id), biz_pincode TEXT,
    biz_country_id INTEGER REFERENCES master_countries(id),
    email TEXT, phone TEXT, website TEXT,
    poc_name TEXT, poc_email TEXT, poc_phone TEXT,
    pan TEXT, cin TEXT, tan TEXT, msme_number TEXT,
    incorporation_date DATE, financial_year_start TEXT DEFAULT '04-01',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS organisation_gst (
    id INTEGER PRIMARY KEY AUTOINCREMENT, organisation_id INTEGER NOT NULL REFERENCES organisation(id),
    gstin TEXT NOT NULL, state_id INTEGER REFERENCES master_states(id),
    trade_name TEXT, registration_date DATE, is_primary INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS organisation_bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, organisation_id INTEGER NOT NULL REFERENCES organisation(id),
    account_name TEXT NOT NULL, bank_name TEXT NOT NULL, branch TEXT,
    account_number TEXT NOT NULL, ifsc_code TEXT, swift_code TEXT,
    account_type TEXT DEFAULT 'Current', currency TEXT DEFAULT 'INR',
    is_primary INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS business_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
    is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    business_unit_id INTEGER REFERENCES business_units(id),
    head_name TEXT, budget REAL DEFAULT 0, cost_center TEXT, location TEXT,
    is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS office_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    city TEXT, state_id INTEGER REFERENCES master_states(id),
    country_id INTEGER REFERENCES master_countries(id),
    type TEXT DEFAULT 'Regional', headcount INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    industry TEXT, contract_type_id INTEGER REFERENCES master_contract_types(id),
    billing_rate TEXT, payment_terms_id INTEGER REFERENCES master_payment_terms(id),
    primary_contact TEXT, contact_email TEXT, contact_phone TEXT,
    address_line1 TEXT, address_line2 TEXT, city TEXT,
    state_id INTEGER REFERENCES master_states(id), pincode TEXT,
    country_id INTEGER REFERENCES master_countries(id),
    gstin TEXT, pan TEXT, account_manager TEXT,
    health_score INTEGER DEFAULT 80, is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    category_id INTEGER REFERENCES master_vendor_categories(id),
    primary_contact TEXT, contact_email TEXT, contact_phone TEXT,
    address_line1 TEXT, city TEXT,
    state_id INTEGER REFERENCES master_states(id),
    country_id INTEGER REFERENCES master_countries(id),
    gstin TEXT, pan TEXT, contract_end DATE,
    sla_score INTEGER DEFAULT 90, spend_mtd REAL DEFAULT 0, sla_description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT UNIQUE,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    email TEXT UNIQUE, phone TEXT, job_title TEXT,
    department_id INTEGER REFERENCES departments(id),
    employment_type_id INTEGER REFERENCES master_employment_types(id),
    location TEXT, office_location_id INTEGER REFERENCES office_locations(id),
    manager_id INTEGER REFERENCES employees(id),
    client_id INTEGER REFERENCES clients(id),
    salary REAL DEFAULT 0, bill_rate REAL DEFAULT 0,
    start_date DATE, is_active INTEGER DEFAULT 1,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL REFERENCES master_user_roles(id),
    employee_id INTEGER REFERENCES employees(id),
    client_id INTEGER REFERENCES clients(id),
    vendor_id INTEGER REFERENCES vendors(id),
    full_name TEXT, is_active INTEGER DEFAULT 1,
    must_change_pwd INTEGER DEFAULT 0,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    ip_address TEXT, user_agent TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS timesheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    client_id INTEGER REFERENCES clients(id),
    project TEXT, week_ending DATE NOT NULL,
    regular_hours REAL DEFAULT 0, overtime_hours REAL DEFAULT 0,
    total_hours REAL GENERATED ALWAYS AS (regular_hours + overtime_hours) STORED,
    bill_rate REAL DEFAULT 0,
    estimated_revenue REAL GENERATED ALWAYS AS ((regular_hours + overtime_hours) * bill_rate) STORED,
    status_id INTEGER REFERENCES master_timesheet_statuses(id),
    notes TEXT, submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME, approved_by INTEGER REFERENCES employees(id));
CREATE TABLE IF NOT EXISTS payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_date DATE NOT NULL,
    period_start DATE, period_end DATE,
    run_type_id INTEGER REFERENCES master_payroll_run_types(id),
    employee_count INTEGER DEFAULT 0, gross_amount REAL DEFAULT 0,
    net_amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS job_requisitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id),
    engagement_type_id INTEGER REFERENCES master_contract_types(id),
    department_id INTEGER REFERENCES departments(id),
    recruiter_id INTEGER REFERENCES employees(id),
    priority_id INTEGER REFERENCES master_priority_levels(id),
    location TEXT, comp_min REAL, comp_max REAL, description TEXT,
    target_start DATE, opened_date DATE DEFAULT CURRENT_DATE, filled_date DATE,
    is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    email TEXT, phone TEXT, location TEXT, current_title TEXT,
    years_exp INTEGER, source_id INTEGER REFERENCES master_candidate_sources(id),
    linkedin_url TEXT, resume_url TEXT, skills TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id),
    requisition_id INTEGER NOT NULL REFERENCES job_requisitions(id),
    stage_id INTEGER REFERENCES master_application_stages(id),
    expected_salary REAL, recruiter_id INTEGER REFERENCES employees(id),
    notes TEXT, rejection_reason TEXT,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    round TEXT NOT NULL,
    format_id INTEGER REFERENCES master_interview_formats(id),
    interviewer TEXT, scheduled_at DATETIME, location_link TEXT,
    scorecard_status TEXT DEFAULT 'Not Started', decision TEXT, notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS onboarding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    template_id INTEGER REFERENCES master_onboarding_templates(id),
    buddy_name TEXT, start_date DATE, progress_pct INTEGER DEFAULT 0,
    day30_status TEXT DEFAULT 'Pending', day60_status TEXT DEFAULT 'Pending',
    day90_status TEXT DEFAULT 'Pending', equipment TEXT,
    status TEXT DEFAULT 'In Progress',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onboarding_id INTEGER NOT NULL REFERENCES onboarding(id),
    task_name TEXT NOT NULL, category TEXT DEFAULT 'General',
    is_complete INTEGER DEFAULT 0, due_date DATE, completed_at DATETIME);
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    contract_type_id INTEGER REFERENCES master_contract_types(id),
    period_start DATE, period_end DATE,
    amount REAL NOT NULL DEFAULT 0, tax_amount REAL DEFAULT 0,
    total_amount REAL GENERATED ALWAYS AS (amount + tax_amount) STORED,
    due_date DATE, paid_date DATE, payment_ref TEXT, notes TEXT, po_number TEXT,
    status_id INTEGER REFERENCES master_invoice_statuses(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    employee_id INTEGER REFERENCES employees(id),
    description TEXT, hours REAL DEFAULT 0, rate REAL DEFAULT 0,
    amount REAL GENERATED ALWAYS AS (hours * rate) STORED);
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL,
    entity_id INTEGER, action TEXT NOT NULL, description TEXT,
    user_id INTEGER REFERENCES users(id),
    user_name TEXT DEFAULT 'System',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_sess_token     ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sess_user      ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sess_expires   ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_emp_dept       ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_emp_client     ON employees(client_id);
CREATE INDEX IF NOT EXISTS idx_ts_emp         ON timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_ts_status      ON timesheets(status_id);
CREATE INDEX IF NOT EXISTS idx_app_cand       ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_app_req        ON applications(requisition_id);
CREATE INDEX IF NOT EXISTS idx_app_stage      ON applications(stage_id);
CREATE INDEX IF NOT EXISTS idx_inv_client     ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_inv_status     ON invoices(status_id);
CREATE INDEX IF NOT EXISTS idx_act_entity     ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_org_gst        ON organisation_gst(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_bank       ON organisation_bank_accounts(organisation_id);
