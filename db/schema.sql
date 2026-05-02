-- McHR&TA v4 — PostgreSQL Schema
-- Run once on a fresh database

-- ═══════════════════════════════════════
-- MASTER TABLES
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS master_countries (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_states (
    id SERIAL PRIMARY KEY, country_id INTEGER NOT NULL REFERENCES master_countries(id),
    code TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1, UNIQUE(country_id,code));
CREATE TABLE IF NOT EXISTS master_employment_types (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_contract_types (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_vendor_categories (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_invoice_statuses (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_application_stages (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_interview_formats (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_onboarding_templates (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_candidate_sources (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_payment_terms (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, days INTEGER DEFAULT 30, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_priority_levels (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_timesheet_statuses (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_payroll_run_types (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_user_roles (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_relationship_types (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);

-- ═══════════════════════════════════════
-- ORGANISATION
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS organisation (
    id SERIAL PRIMARY KEY,
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
    iec_code TEXT, profession_tax_number TEXT, pf_number TEXT, esi_number TEXT,
    incorporation_date DATE, financial_year_start TEXT DEFAULT '04-01',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS organisation_gst (
    id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id),
    gstin TEXT NOT NULL, state_id INTEGER REFERENCES master_states(id),
    trade_name TEXT, registration_date DATE, is_primary INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS organisation_bank_accounts (
    id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id),
    account_name TEXT NOT NULL, bank_name TEXT NOT NULL, branch TEXT,
    account_number TEXT NOT NULL, ifsc_code TEXT, swift_code TEXT,
    account_type TEXT DEFAULT 'Current', currency TEXT DEFAULT 'INR',
    is_primary INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS organisation_labour_certs (
    id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id),
    cert_number TEXT NOT NULL, issuing_authority TEXT,
    state_id INTEGER REFERENCES master_states(id),
    valid_from DATE, valid_until DATE,
    is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS organisation_documents (
    id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id),
    doc_type TEXT NOT NULL, doc_name TEXT NOT NULL,
    file_data TEXT, file_size TEXT, mime_type TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);

-- ═══════════════════════════════════════
-- STRUCTURE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS business_units (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    head_name TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS cost_centres (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    business_unit_id INTEGER REFERENCES business_units(id),
    budget NUMERIC DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    business_unit_id INTEGER REFERENCES business_units(id),
    cost_centre_id INTEGER REFERENCES cost_centres(id),
    head_name TEXT, budget NUMERIC DEFAULT 0, cost_center TEXT, location TEXT,
    is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS office_locations (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    city TEXT, state_id INTEGER REFERENCES master_states(id),
    country_id INTEGER REFERENCES master_countries(id),
    address_line1 TEXT, pincode TEXT,
    type TEXT DEFAULT 'Regional', headcount INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());

-- ═══════════════════════════════════════
-- EMPLOYEES (defined before clients for FK)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    emp_id TEXT UNIQUE,
    first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
    email TEXT UNIQUE, phone TEXT,
    personal_email TEXT, personal_phone TEXT,
    job_title TEXT,
    department_id INTEGER REFERENCES departments(id),
    employment_type_id INTEGER REFERENCES master_employment_types(id),
    location TEXT, office_location_id INTEGER REFERENCES office_locations(id),
    manager_id INTEGER REFERENCES employees(id),
    reporting_manager_id INTEGER REFERENCES employees(id),
    client_id INTEGER,
    salary NUMERIC DEFAULT 0, bill_rate NUMERIC DEFAULT 0,
    billable INTEGER DEFAULT 0, billable_amount NUMERIC DEFAULT 0,
    start_date DATE, is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'Active',
    referred_by TEXT, rating INTEGER DEFAULT 0,
    pan TEXT, aadhaar TEXT, passport_number TEXT,
    pf_number TEXT, esi_number TEXT,
    bank_account_name TEXT, bank_name TEXT, bank_branch TEXT,
    bank_account_number TEXT, bank_ifsc TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

-- ═══════════════════════════════════════
-- CLIENTS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, industry TEXT,
    contract_type_id INTEGER REFERENCES master_contract_types(id),
    currency TEXT DEFAULT 'INR',
    payment_terms_id INTEGER REFERENCES master_payment_terms(id),
    status TEXT DEFAULT 'Active', rating INTEGER DEFAULT 0, referred_by TEXT,
    primary_contact TEXT, primary_contact_designation TEXT,
    contact_email TEXT, contact_phone TEXT,
    billing_contact_name TEXT, billing_contact_designation TEXT,
    billing_contact_phone TEXT, billing_contact_email TEXT,
    address_line1 TEXT, address_line2 TEXT, city TEXT,
    state_id INTEGER REFERENCES master_states(id),
    pincode TEXT, country_id INTEGER REFERENCES master_countries(id),
    gstin TEXT, pan TEXT,
    account_manager_id INTEGER REFERENCES employees(id),
    health_score INTEGER DEFAULT 80, is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

-- Note: client_id FK on employees handled at application level
-- to avoid circular dependency between employees and clients

CREATE TABLE IF NOT EXISTS client_documents (
    id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id),
    doc_type TEXT NOT NULL, doc_name TEXT NOT NULL,
    file_data TEXT, file_size TEXT, mime_type TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);

-- ═══════════════════════════════════════
-- VENDORS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    category_id INTEGER REFERENCES master_vendor_categories(id),
    status TEXT DEFAULT 'Active', rating INTEGER DEFAULT 0, referred_by TEXT,
    primary_contact TEXT, primary_contact_designation TEXT,
    contact_email TEXT, contact_phone TEXT,
    address_line1 TEXT, address_line2 TEXT, city TEXT,
    state_id INTEGER REFERENCES master_states(id),
    pincode TEXT, country_id INTEGER REFERENCES master_countries(id),
    gstin TEXT, pan TEXT,
    account_manager_id INTEGER REFERENCES employees(id),
    bank_account_name TEXT, bank_name TEXT, bank_branch TEXT,
    bank_account_number TEXT, bank_ifsc TEXT, bank_swift TEXT,
    bank_account_type TEXT DEFAULT 'Current',
    contract_end DATE, sla_score INTEGER DEFAULT 90,
    spend_mtd NUMERIC DEFAULT 0, sla_description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS vendor_documents (
    id SERIAL PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    doc_type TEXT NOT NULL, doc_name TEXT NOT NULL,
    file_data TEXT, file_size TEXT, mime_type TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);

-- ═══════════════════════════════════════
-- EMPLOYEE SUB-TABLES
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_addresses (
    id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
    address_type TEXT NOT NULL, address_line1 TEXT, address_line2 TEXT, city TEXT,
    state_id INTEGER REFERENCES master_states(id),
    pincode TEXT, country_id INTEGER REFERENCES master_countries(id),
    created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
    id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
    name TEXT NOT NULL, phone TEXT, email TEXT,
    relationship TEXT, is_primary INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS employee_education (
    id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
    institution TEXT NOT NULL, degree TEXT, field_of_study TEXT,
    start_year INTEGER, end_year INTEGER, grade TEXT, sort_order INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS employee_experience (
    id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
    company TEXT NOT NULL, designation TEXT, location TEXT,
    start_date DATE, end_date DATE, is_current INTEGER DEFAULT 0,
    description TEXT, sort_order INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS employee_documents (
    id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
    doc_type TEXT NOT NULL, doc_name TEXT NOT NULL,
    file_data TEXT, file_size TEXT, mime_type TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);

-- ═══════════════════════════════════════
-- USERS & AUTH
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL REFERENCES master_user_roles(id),
    employee_id INTEGER REFERENCES employees(id),
    client_id INTEGER REFERENCES clients(id),
    vendor_id INTEGER REFERENCES vendors(id),
    full_name TEXT, is_active INTEGER DEFAULT 1,
    must_change_pwd INTEGER DEFAULT 0, last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL, ip_address TEXT, user_agent TEXT,
    expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW());

-- ═══════════════════════════════════════
-- TIMESHEETS & PAYROLL
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS timesheets (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    client_id INTEGER REFERENCES clients(id),
    project TEXT, week_ending DATE NOT NULL,
    regular_hours NUMERIC DEFAULT 0, overtime_hours NUMERIC DEFAULT 0,
    total_hours NUMERIC GENERATED ALWAYS AS (regular_hours + overtime_hours) STORED,
    bill_rate NUMERIC DEFAULT 0,
    estimated_revenue NUMERIC GENERATED ALWAYS AS ((regular_hours + overtime_hours) * bill_rate) STORED,
    status_id INTEGER REFERENCES master_timesheet_statuses(id),
    notes TEXT, submitted_at TIMESTAMP DEFAULT NOW(),
    approved_at TIMESTAMP, approved_by INTEGER REFERENCES employees(id));

CREATE TABLE IF NOT EXISTS payroll_runs (
    id SERIAL PRIMARY KEY, run_date DATE NOT NULL,
    period_start DATE, period_end DATE,
    run_type_id INTEGER REFERENCES master_payroll_run_types(id),
    employee_count INTEGER DEFAULT 0, gross_amount NUMERIC DEFAULT 0,
    net_amount NUMERIC DEFAULT 0, tax_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Scheduled', created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS payroll_entries (
    id SERIAL PRIMARY KEY,
    payroll_run_id INTEGER REFERENCES payroll_runs(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    month TEXT NOT NULL,
    ctc NUMERIC DEFAULT 0, basic NUMERIC DEFAULT 0, hra NUMERIC DEFAULT 0,
    medical_allowance NUMERIC DEFAULT 0, special_allowance NUMERIC DEFAULT 0,
    other_allowances NUMERIC DEFAULT 0, incentive NUMERIC DEFAULT 0,
    lop_days NUMERIC DEFAULT 0, lop_amount NUMERIC DEFAULT 0,
    total_earnings NUMERIC DEFAULT 0,
    profession_tax NUMERIC DEFAULT 0, pf_employee NUMERIC DEFAULT 0,
    pf_employer NUMERIC DEFAULT 0, medical_insurance NUMERIC DEFAULT 0,
    tds NUMERIC DEFAULT 0, esi_employee NUMERIC DEFAULT 0,
    esi_employer NUMERIC DEFAULT 0, other_deductions NUMERIC DEFAULT 0,
    total_deductions NUMERIC DEFAULT 0, net_salary NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW());

-- ═══════════════════════════════════════
-- TALENT ACQUISITION
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS job_requisitions (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id),
    engagement_type_id INTEGER REFERENCES master_contract_types(id),
    department_id INTEGER REFERENCES departments(id),
    recruiter_id INTEGER REFERENCES employees(id),
    priority_id INTEGER REFERENCES master_priority_levels(id),
    location TEXT, comp_min NUMERIC, comp_max NUMERIC, description TEXT,
    target_start DATE, opened_date DATE DEFAULT CURRENT_DATE, filled_date DATE,
    is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS candidates (
    id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    email TEXT, phone TEXT, location TEXT, current_title TEXT,
    years_exp INTEGER, source_id INTEGER REFERENCES master_candidate_sources(id),
    linkedin_url TEXT, resume_url TEXT, skills TEXT, is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id),
    requisition_id INTEGER NOT NULL REFERENCES job_requisitions(id),
    stage_id INTEGER REFERENCES master_application_stages(id),
    expected_salary NUMERIC, recruiter_id INTEGER REFERENCES employees(id),
    notes TEXT, rejection_reason TEXT,
    applied_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS interviews (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    round TEXT NOT NULL, format_id INTEGER REFERENCES master_interview_formats(id),
    interviewer TEXT, scheduled_at TIMESTAMP, location_link TEXT,
    scorecard_status TEXT DEFAULT 'Not Started', decision TEXT, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS onboarding (
    id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
    template_id INTEGER REFERENCES master_onboarding_templates(id),
    buddy_name TEXT, start_date DATE, progress_pct INTEGER DEFAULT 0,
    day30_status TEXT DEFAULT 'Pending', day60_status TEXT DEFAULT 'Pending',
    day90_status TEXT DEFAULT 'Pending', equipment TEXT,
    status TEXT DEFAULT 'In Progress', created_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id SERIAL PRIMARY KEY, onboarding_id INTEGER NOT NULL REFERENCES onboarding(id),
    task_name TEXT NOT NULL, category TEXT DEFAULT 'General',
    is_complete INTEGER DEFAULT 0, due_date DATE, completed_at TIMESTAMP);

-- ═══════════════════════════════════════
-- INVOICES
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY, invoice_number TEXT UNIQUE NOT NULL,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    contract_type_id INTEGER REFERENCES master_contract_types(id),
    period_start DATE, period_end DATE,
    amount NUMERIC NOT NULL DEFAULT 0, tax_amount NUMERIC DEFAULT 0,
    total_amount NUMERIC GENERATED ALWAYS AS (amount + tax_amount) STORED,
    due_date DATE, paid_date DATE, payment_ref TEXT, notes TEXT, po_number TEXT,
    status_id INTEGER REFERENCES master_invoice_statuses(id),
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id SERIAL PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    employee_id INTEGER REFERENCES employees(id),
    description TEXT, hours NUMERIC DEFAULT 0, rate NUMERIC DEFAULT 0,
    amount NUMERIC GENERATED ALWAYS AS (hours * rate) STORED);

-- ═══════════════════════════════════════
-- ACTIVITY LOG
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY, entity_type TEXT NOT NULL,
    entity_id INTEGER, action TEXT NOT NULL, description TEXT,
    user_id INTEGER REFERENCES users(id),
    user_name TEXT DEFAULT 'System', created_at TIMESTAMP DEFAULT NOW());

-- ═══════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_sess_token     ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sess_expires   ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_emp_dept       ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_emp_client     ON employees(client_id);
CREATE INDEX IF NOT EXISTS idx_emp_reporting  ON employees(reporting_manager_id);
CREATE INDEX IF NOT EXISTS idx_emp_addr       ON employee_addresses(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_edu        ON employee_education(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_exp        ON employee_experience(employee_id);
CREATE INDEX IF NOT EXISTS idx_ts_emp         ON timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_ts_status      ON timesheets(status_id);
CREATE INDEX IF NOT EXISTS idx_app_cand       ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_app_req        ON applications(requisition_id);
CREATE INDEX IF NOT EXISTS idx_inv_client     ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_inv_status     ON invoices(status_id);
CREATE INDEX IF NOT EXISTS idx_pay_entries    ON payroll_entries(employee_id, month);
CREATE INDEX IF NOT EXISTS idx_act_entity     ON activity_log(entity_type, entity_id);
