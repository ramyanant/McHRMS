#!/usr/bin/env python3
"""McHR&TA v4 — Flask REST API"""
import os, hashlib, secrets, json, base64, threading
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def _find_dir(name):
    for c in [os.path.join(BASE_DIR,name), os.path.join(BASE_DIR,'..',name), os.path.join('/app',name)]:
        if os.path.isdir(c): return os.path.abspath(c)
    return os.path.abspath(os.path.join(BASE_DIR,'..',name))

STATIC = _find_dir('static')
DATABASE_URL = os.environ.get('DATABASE_URL', '')
print(f"[startup] static={STATIC}", flush=True)
print(f"[startup] db={'PostgreSQL' if DATABASE_URL else 'NO DATABASE_URL SET'}", flush=True)

from decimal import Decimal

from datetime import date as _date
from flask.json.provider import DefaultJSONProvider

class PGJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.strftime('%Y-%m-%d %H:%M:%S')
        if isinstance(obj, _date):
            return obj.strftime('%Y-%m-%d')
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

app = Flask(__name__, static_folder=STATIC)
app.config['JSON_SORT_KEYS'] = False
app.json_provider_class = PGJSONProvider
app.json = PGJSONProvider(app)

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    print(f"Unhandled error: {e}", flush=True)
    traceback.print_exc()
    return jsonify({"success": False, "message": str(e), "trace": traceback.format_exc()[-500:]}), 500
SESSION_HOURS = 12

# ── Bootstrap DB ─────────────────────────────────────────────────────────
def get_pg_conn():
    url = DATABASE_URL
    if not url:
        raise RuntimeError("DATABASE_URL environment variable not set")
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)

_reset_status = {"running": False, "done": False, "error": None, "log": []}

def _do_reset():
    global _reset_status
    _reset_status = {"running": True, "done": False, "error": None, "log": []}
    log = _reset_status["log"]
    try:
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        log.append("Dropped and recreated schema")
        cur.execute("""CREATE TABLE master_countries (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_states (id SERIAL PRIMARY KEY, country_id INTEGER NOT NULL REFERENCES master_countries(id), code TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_employment_types (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_contract_types (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_vendor_categories (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_invoice_statuses (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE master_application_stages (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE master_interview_formats (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_onboarding_templates (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_candidate_sources (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_payment_terms (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, days INTEGER DEFAULT 30, is_active INTEGER DEFAULT 1);
CREATE TABLE master_priority_levels (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE master_timesheet_statuses (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_payroll_run_types (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE master_user_roles (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE master_relationship_types (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE organisation (id SERIAL PRIMARY KEY, legal_name TEXT NOT NULL, trade_name TEXT, legal_structure TEXT, industry TEXT, sub_domain TEXT, logo_url TEXT, timezone TEXT DEFAULT 'Asia/Kolkata', base_currency TEXT DEFAULT 'INR', reg_address_line1 TEXT, reg_address_line2 TEXT, reg_city TEXT, reg_state_id INTEGER REFERENCES master_states(id), reg_pincode TEXT, reg_country_id INTEGER REFERENCES master_countries(id), biz_address_line1 TEXT, biz_address_line2 TEXT, biz_city TEXT, biz_state_id INTEGER REFERENCES master_states(id), biz_pincode TEXT, biz_country_id INTEGER REFERENCES master_countries(id), email TEXT, phone TEXT, website TEXT, poc_name TEXT, poc_email TEXT, poc_phone TEXT, pan TEXT, cin TEXT, tan TEXT, msme_number TEXT, iec_code TEXT, profession_tax_number TEXT, pf_number TEXT, esi_number TEXT, incorporation_date DATE, financial_year_start TEXT DEFAULT '04-01', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE organisation_gst (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), gstin TEXT NOT NULL, state_id INTEGER REFERENCES master_states(id), trade_name TEXT, registration_date DATE, is_primary INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE organisation_bank_accounts (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), account_name TEXT NOT NULL, bank_name TEXT NOT NULL, branch TEXT, account_number TEXT NOT NULL, ifsc_code TEXT, swift_code TEXT, account_type TEXT DEFAULT 'Current', currency TEXT DEFAULT 'INR', is_primary INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE organisation_labour_certs (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), cert_number TEXT NOT NULL, issuing_authority TEXT, state_id INTEGER REFERENCES master_states(id), valid_from DATE, valid_until DATE, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE organisation_documents (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), doc_type TEXT NOT NULL, doc_name TEXT NOT NULL, file_data TEXT, file_size TEXT, mime_type TEXT, uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);
CREATE TABLE business_units (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, head_name TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE cost_centres (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, business_unit_id INTEGER REFERENCES business_units(id), budget NUMERIC DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE departments (id SERIAL PRIMARY KEY, name TEXT NOT NULL, business_unit_id INTEGER REFERENCES business_units(id), cost_centre_id INTEGER REFERENCES cost_centres(id), head_name TEXT, budget NUMERIC DEFAULT 0, cost_center TEXT, location TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE office_locations (id SERIAL PRIMARY KEY, name TEXT NOT NULL, city TEXT, state_id INTEGER REFERENCES master_states(id), country_id INTEGER REFERENCES master_countries(id), address_line1 TEXT, pincode TEXT, type TEXT DEFAULT 'Regional', headcount INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE employees (id SERIAL PRIMARY KEY, emp_id TEXT UNIQUE, first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, personal_email TEXT, personal_phone TEXT, job_title TEXT, department_id INTEGER REFERENCES departments(id), employment_type_id INTEGER REFERENCES master_employment_types(id), location TEXT, office_location_id INTEGER REFERENCES office_locations(id), manager_id INTEGER REFERENCES employees(id), reporting_manager_id INTEGER REFERENCES employees(id), client_id INTEGER, salary NUMERIC DEFAULT 0, bill_rate NUMERIC DEFAULT 0, billable INTEGER DEFAULT 0, billable_amount NUMERIC DEFAULT 0, start_date DATE, is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'Active', referred_by TEXT, rating INTEGER DEFAULT 0, pan TEXT, aadhaar TEXT, passport_number TEXT, pf_number TEXT, esi_number TEXT, bank_account_name TEXT, bank_name TEXT, bank_branch TEXT, bank_account_number TEXT, bank_ifsc TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT NOT NULL, industry TEXT, contract_type_id INTEGER REFERENCES master_contract_types(id), currency TEXT DEFAULT 'INR', payment_terms_id INTEGER REFERENCES master_payment_terms(id), status TEXT DEFAULT 'Active', rating INTEGER DEFAULT 0, referred_by TEXT, primary_contact TEXT, primary_contact_designation TEXT, contact_email TEXT, contact_phone TEXT, billing_contact_name TEXT, billing_contact_designation TEXT, billing_contact_phone TEXT, billing_contact_email TEXT, address_line1 TEXT, address_line2 TEXT, city TEXT, state_id INTEGER REFERENCES master_states(id), pincode TEXT, country_id INTEGER REFERENCES master_countries(id), gstin TEXT, pan TEXT, account_manager_id INTEGER REFERENCES employees(id), health_score INTEGER DEFAULT 80, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE client_documents (id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), doc_type TEXT NOT NULL, doc_name TEXT NOT NULL, file_data TEXT, file_size TEXT, mime_type TEXT, uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);
CREATE TABLE vendors (id SERIAL PRIMARY KEY, name TEXT NOT NULL, category_id INTEGER REFERENCES master_vendor_categories(id), status TEXT DEFAULT 'Active', rating INTEGER DEFAULT 0, referred_by TEXT, primary_contact TEXT, primary_contact_designation TEXT, contact_email TEXT, contact_phone TEXT, address_line1 TEXT, address_line2 TEXT, city TEXT, state_id INTEGER REFERENCES master_states(id), pincode TEXT, country_id INTEGER REFERENCES master_countries(id), gstin TEXT, pan TEXT, account_manager_id INTEGER REFERENCES employees(id), bank_account_name TEXT, bank_name TEXT, bank_branch TEXT, bank_account_number TEXT, bank_ifsc TEXT, bank_swift TEXT, bank_account_type TEXT DEFAULT 'Current', contract_end DATE, sla_score INTEGER DEFAULT 90, spend_mtd NUMERIC DEFAULT 0, sla_description TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE vendor_documents (id SERIAL PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id), doc_type TEXT NOT NULL, doc_name TEXT NOT NULL, file_data TEXT, file_size TEXT, mime_type TEXT, uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);
CREATE TABLE employee_addresses (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), address_type TEXT NOT NULL, address_line1 TEXT, address_line2 TEXT, city TEXT, state_id INTEGER REFERENCES master_states(id), pincode TEXT, country_id INTEGER REFERENCES master_countries(id), created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE employee_emergency_contacts (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), name TEXT NOT NULL, phone TEXT, email TEXT, relationship TEXT, is_primary INTEGER DEFAULT 0);
CREATE TABLE employee_education (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), institution TEXT NOT NULL, degree TEXT, field_of_study TEXT, start_year INTEGER, end_year INTEGER, grade TEXT, sort_order INTEGER DEFAULT 0);
CREATE TABLE employee_experience (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), company TEXT NOT NULL, designation TEXT, location TEXT, start_date DATE, end_date DATE, is_current INTEGER DEFAULT 0, description TEXT, sort_order INTEGER DEFAULT 0);
CREATE TABLE employee_documents (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), doc_type TEXT NOT NULL, doc_name TEXT NOT NULL, file_data TEXT, file_size TEXT, mime_type TEXT, uploaded_at TIMESTAMP DEFAULT NOW(), is_active INTEGER DEFAULT 1);
CREATE TABLE users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role_id INTEGER NOT NULL REFERENCES master_user_roles(id), employee_id INTEGER REFERENCES employees(id), client_id INTEGER REFERENCES clients(id), vendor_id INTEGER REFERENCES vendors(id), full_name TEXT, is_active INTEGER DEFAULT 1, must_change_pwd INTEGER DEFAULT 0, last_login TIMESTAMP, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE user_sessions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), token TEXT UNIQUE NOT NULL, ip_address TEXT, user_agent TEXT, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE timesheets (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), client_id INTEGER REFERENCES clients(id), project TEXT, week_ending DATE NOT NULL, regular_hours NUMERIC DEFAULT 0, overtime_hours NUMERIC DEFAULT 0, total_hours NUMERIC GENERATED ALWAYS AS (regular_hours + overtime_hours) STORED, bill_rate NUMERIC DEFAULT 0, estimated_revenue NUMERIC GENERATED ALWAYS AS ((regular_hours + overtime_hours) * bill_rate) STORED, status_id INTEGER REFERENCES master_timesheet_statuses(id), notes TEXT, submitted_at TIMESTAMP DEFAULT NOW(), approved_at TIMESTAMP, approved_by INTEGER REFERENCES employees(id));
CREATE TABLE payroll_runs (id SERIAL PRIMARY KEY, run_date DATE NOT NULL, period_start DATE, period_end DATE, run_type_id INTEGER REFERENCES master_payroll_run_types(id), employee_count INTEGER DEFAULT 0, gross_amount NUMERIC DEFAULT 0, net_amount NUMERIC DEFAULT 0, tax_amount NUMERIC DEFAULT 0, status TEXT DEFAULT 'Scheduled', created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE payroll_entries (id SERIAL PRIMARY KEY, payroll_run_id INTEGER REFERENCES payroll_runs(id), employee_id INTEGER NOT NULL REFERENCES employees(id), month TEXT NOT NULL, ctc NUMERIC DEFAULT 0, basic NUMERIC DEFAULT 0, hra NUMERIC DEFAULT 0, medical_allowance NUMERIC DEFAULT 0, special_allowance NUMERIC DEFAULT 0, other_allowances NUMERIC DEFAULT 0, incentive NUMERIC DEFAULT 0, lop_days NUMERIC DEFAULT 0, lop_amount NUMERIC DEFAULT 0, total_earnings NUMERIC DEFAULT 0, profession_tax NUMERIC DEFAULT 0, pf_employee NUMERIC DEFAULT 0, pf_employer NUMERIC DEFAULT 0, medical_insurance NUMERIC DEFAULT 0, tds NUMERIC DEFAULT 0, esi_employee NUMERIC DEFAULT 0, esi_employer NUMERIC DEFAULT 0, other_deductions NUMERIC DEFAULT 0, total_deductions NUMERIC DEFAULT 0, net_salary NUMERIC DEFAULT 0, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE job_requisitions (id SERIAL PRIMARY KEY, title TEXT NOT NULL, client_id INTEGER REFERENCES clients(id), engagement_type_id INTEGER REFERENCES master_contract_types(id), department_id INTEGER REFERENCES departments(id), recruiter_id INTEGER REFERENCES employees(id), priority_id INTEGER REFERENCES master_priority_levels(id), location TEXT, comp_min NUMERIC, comp_max NUMERIC, description TEXT, target_start DATE, opened_date DATE DEFAULT CURRENT_DATE, filled_date DATE, is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'Active', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE candidates (id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT, phone TEXT, location TEXT, current_title TEXT, years_exp INTEGER, source_id INTEGER REFERENCES master_candidate_sources(id), linkedin_url TEXT, resume_url TEXT, skills TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE applications (id SERIAL PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id), requisition_id INTEGER NOT NULL REFERENCES job_requisitions(id), stage_id INTEGER REFERENCES master_application_stages(id), expected_salary NUMERIC, recruiter_id INTEGER REFERENCES employees(id), notes TEXT, rejection_reason TEXT, applied_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE interviews (id SERIAL PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id), round TEXT NOT NULL, format_id INTEGER REFERENCES master_interview_formats(id), interviewer TEXT, scheduled_at TIMESTAMP, location_link TEXT, scorecard_status TEXT DEFAULT 'Not Started', decision TEXT, notes TEXT, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE onboarding (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), template_id INTEGER REFERENCES master_onboarding_templates(id), buddy_name TEXT, start_date DATE, progress_pct INTEGER DEFAULT 0, day30_status TEXT DEFAULT 'Pending', day60_status TEXT DEFAULT 'Pending', day90_status TEXT DEFAULT 'Pending', equipment TEXT, status TEXT DEFAULT 'In Progress', created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE onboarding_tasks (id SERIAL PRIMARY KEY, onboarding_id INTEGER NOT NULL REFERENCES onboarding(id), task_name TEXT NOT NULL, category TEXT DEFAULT 'General', is_complete INTEGER DEFAULT 0, due_date DATE, completed_at TIMESTAMP);
CREATE TABLE invoices (id SERIAL PRIMARY KEY, invoice_number TEXT UNIQUE NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id), contract_type_id INTEGER REFERENCES master_contract_types(id), period_start DATE, period_end DATE, amount NUMERIC NOT NULL DEFAULT 0, tax_amount NUMERIC DEFAULT 0, total_amount NUMERIC GENERATED ALWAYS AS (amount + tax_amount) STORED, due_date DATE, paid_date DATE, payment_ref TEXT, notes TEXT, po_number TEXT, status_id INTEGER REFERENCES master_invoice_statuses(id), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE invoice_line_items (id SERIAL PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id), employee_id INTEGER REFERENCES employees(id), description TEXT, hours NUMERIC DEFAULT 0, rate NUMERIC DEFAULT 0, amount NUMERIC GENERATED ALWAYS AS (hours * rate) STORED);
CREATE TABLE employee_leaves (id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), leave_type TEXT NOT NULL DEFAULT 'Annual', from_date DATE NOT NULL, to_date DATE NOT NULL, days NUMERIC DEFAULT 1, reason TEXT, status TEXT DEFAULT 'Pending', rejection_reason TEXT, applied_at TIMESTAMP DEFAULT NOW(), approved_by INTEGER REFERENCES employees(id), approved_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
CREATE TABLE activity_log (id SERIAL PRIMARY KEY, entity_type TEXT NOT NULL, entity_id INTEGER, action TEXT NOT NULL, description TEXT, user_id INTEGER REFERENCES users(id), user_name TEXT DEFAULT 'System', created_at TIMESTAMP DEFAULT NOW())""")
        log.append("All tables created")
        _seed_pg(cur)
        conn.close()
        log.append("Seed complete")
        _reset_status["done"] = True
        _reset_status["running"] = False
    except Exception as e:
        import traceback
        _reset_status["error"] = str(e)
        _reset_status["trace"] = traceback.format_exc()
        _reset_status["running"] = False


def _bootstrap_db():
    print("Checking PostgreSQL...", flush=True)
    try:
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT 1 as ok")
        cur.fetchone()
        # Check if already initialised
        cur.execute("SELECT to_regclass('public.users')")
        already = cur.fetchone()['to_regclass'] is not None
        conn.close()
        if already:
            print("PostgreSQL ready (already initialised)", flush=True)
        else:
            print("PostgreSQL connected. Starting background initialisation...", flush=True)
            t = threading.Thread(target=_do_reset, daemon=True)
            t.start()
    except Exception as e:
        print(f"PostgreSQL connection error: {e}", flush=True)


def _seed_pg(cur):
    cur.execute("SELECT COUNT(*) as c FROM master_countries")
    if cur.fetchone()['c'] > 0:
        return
    print("Seeding...", flush=True)
    for code,name in [("IN","India"),("US","United States"),("GB","United Kingdom"),("SG","Singapore"),("AE","UAE"),("AU","Australia")]:
        cur.execute("INSERT INTO master_countries(code,name) VALUES(%s,%s)",(code,name))
    cur.execute("SELECT id FROM master_countries WHERE code='IN'")
    in_id = cur.fetchone()['id']
    india_states = [('AN','Andaman & Nicobar Islands'),('AP','Andhra Pradesh'),('AR','Arunachal Pradesh'),('AS','Assam'),('BR','Bihar'),('CH','Chandigarh'),('CG','Chhattisgarh'),('DN','Dadra & Nagar Haveli & Daman & Diu'),('DL','Delhi'),('GA','Goa'),('GJ','Gujarat'),('HR','Haryana'),('HP','Himachal Pradesh'),('JK','Jammu & Kashmir'),('JH','Jharkhand'),('KA','Karnataka'),('KL','Kerala'),('LA','Ladakh'),('LD','Lakshadweep'),('MP','Madhya Pradesh'),('MH','Maharashtra'),('MN','Manipur'),('ML','Meghalaya'),('MZ','Mizoram'),('NL','Nagaland'),('OD','Odisha'),('PY','Puducherry'),('PB','Punjab'),('RJ','Rajasthan'),('SK','Sikkim'),('TN','Tamil Nadu'),('TS','Telangana'),('TR','Tripura'),('UP','Uttar Pradesh'),('UK','Uttarakhand'),('WB','West Bengal')]
    for code,name in india_states:
        cur.execute("INSERT INTO master_states(country_id,code,name) VALUES(%s,%s,%s)",(in_id,code,name))
    cur.execute("SELECT id FROM master_countries WHERE code='US'")
    us_id = cur.fetchone()['id']
    for code,name in [('CA','California'),('NY','New York'),('TX','Texas'),('WA','Washington')]:
        cur.execute("INSERT INTO master_states(country_id,code,name) VALUES(%s,%s,%s)",(us_id,code,name))
    for n in ["Full-Time","Contractor (C2C)","Contractor (W2)","Part-Time","Intern","Freelance"]:
        cur.execute("INSERT INTO master_employment_types(name) VALUES(%s)",(n,))
    for n in ["Staff Augmentation","Direct Hire","Retained Search","MSA","MSA + SOW","Milestone"]:
        cur.execute("INSERT INTO master_contract_types(name) VALUES(%s)",(n,))
    for n in ["Job Board","Background Check","Sub-Vendor","Technology","Legal","Payroll","Training"]:
        cur.execute("INSERT INTO master_vendor_categories(name) VALUES(%s)",(n,))
    for n,s in [("Draft",1),("Sent",2),("Paid",3),("Overdue",4),("Cancelled",5)]:
        cur.execute("INSERT INTO master_invoice_statuses(name,sort_order) VALUES(%s,%s)",(n,s))
    for n,s in [("Applied",1),("Screening",2),("Technical",3),("Offer",4),("Placed",5),("Rejected",6)]:
        cur.execute("INSERT INTO master_application_stages(name,sort_order) VALUES(%s,%s)",(n,s))
    for n in ["Video","Phone","In-Person","Take-Home Assessment"]:
        cur.execute("INSERT INTO master_interview_formats(name) VALUES(%s)",(n,))
    for n in ["Standard FTE","Contractor","Remote Employee","Executive"]:
        cur.execute("INSERT INTO master_onboarding_templates(name) VALUES(%s)",(n,))
    for n in ["LinkedIn","Referral","Indeed","Career Site","Agency","GitHub","Naukri","Walk-In"]:
        cur.execute("INSERT INTO master_candidate_sources(name) VALUES(%s)",(n,))
    for n,d in [("Net 15",15),("Net 30",30),("Net 45",45),("Net 60",60),("Due on Receipt",0)]:
        cur.execute("INSERT INTO master_payment_terms(name,days) VALUES(%s,%s)",(n,d))
    for n,s in [("High",1),("Medium",2),("Normal",3),("Low",4)]:
        cur.execute("INSERT INTO master_priority_levels(name,sort_order) VALUES(%s,%s)",(n,s))
    for n in ["Pending","Approved","Returned","Cancelled"]:
        cur.execute("INSERT INTO master_timesheet_statuses(name) VALUES(%s)",(n,))
    for n in ["Semi-Monthly FTE","Contractor Bi-Weekly","Monthly","Supplemental"]:
        cur.execute("INSERT INTO master_payroll_run_types(name) VALUES(%s)",(n,))
    for n,d in [("Admin","Full access"),("HR Manager","HR modules"),("Recruiter","ATS modules"),("Finance","Finance modules"),("Employee","Self-service"),("Client","Client portal"),("Vendor","Vendor portal")]:
        cur.execute("INSERT INTO master_user_roles(name,description) VALUES(%s,%s)",(n,d))
    for n in ["Spouse","Parent","Sibling","Child","Friend","Colleague","Other"]:
        cur.execute("INSERT INTO master_relationship_types(name) VALUES(%s)",(n,))
    cur.execute("SELECT id FROM master_states WHERE code='TS'")
    ts_id = cur.fetchone()['id']
    cur.execute("INSERT INTO organisation(legal_name,trade_name,email,phone,biz_city,biz_state_id,biz_country_id,pan,tan) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        ('McRaaN Consulting Private Limited','McHR&TA','info@mcraan.com','+91-40-12345678','Hyderabad',ts_id,in_id,'AAGCM1234A','HYDA12345B'))
    org_id = cur.fetchone()['id']
    cur.execute("INSERT INTO organisation_gst(organisation_id,gstin,state_id,is_primary) VALUES(%s,%s,%s,1)",(org_id,"36AAGCM1234A1Z5",ts_id))
    cur.execute("INSERT INTO organisation_bank_accounts(organisation_id,account_name,bank_name,branch,account_number,ifsc_code,is_primary) VALUES(%s,%s,%s,%s,%s,%s,1)",
        (org_id,"McRaaN Consulting","HDFC Bank","Banjara Hills","50200012345678","HDFC0001234"))
    for n,d in [("Technology Services","Engineering, DevOps, QA"),("Staffing Solutions","HR & Talent"),("Business Operations","Finance, Legal"),("Sales & Marketing","Sales, Marketing")]:
        cur.execute("INSERT INTO business_units(name,description) VALUES(%s,%s)",(n,d))
    cur.execute("SELECT id FROM business_units WHERE name='Technology Services'"); bu1=cur.fetchone()['id']
    cur.execute("SELECT id FROM business_units WHERE name='Staffing Solutions'"); bu2=cur.fetchone()['id']
    cur.execute("SELECT id FROM business_units WHERE name='Business Operations'"); bu3=cur.fetchone()['id']
    cur.execute("SELECT id FROM business_units WHERE name='Sales & Marketing'"); bu4=cur.fetchone()['id']
    for code,name,bu,budget in [("CC-001","Engineering",bu1,4200000),("CC-007","HR & Talent",bu2,640000),("CC-005","Sales",bu4,2800000),("CC-009","Finance",bu3,580000)]:
        cur.execute("INSERT INTO cost_centres(code,name,business_unit_id,budget) VALUES(%s,%s,%s,%s)",(code,name,bu,budget))
    cur.execute("SELECT id FROM cost_centres WHERE code='CC-001'"); cc1=cur.fetchone()['id']
    cur.execute("SELECT id FROM cost_centres WHERE code='CC-007'"); cc2=cur.fetchone()['id']
    cur.execute("SELECT id FROM cost_centres WHERE code='CC-005'"); cc3=cur.fetchone()['id']
    cur.execute("SELECT id FROM cost_centres WHERE code='CC-009'"); cc4=cur.fetchone()['id']
    for nm,bu,cc,head,budget in [("Engineering",bu1,cc1,"Ravi Kumar",4200000),("HR & Talent",bu2,cc2,"Aisha Kumar",640000),("Sales",bu4,cc3,"Sandra Bloom",2800000),("Finance",bu3,cc4,"Tom Wright",580000)]:
        cur.execute("INSERT INTO departments(name,business_unit_id,cost_centre_id,head_name,budget) VALUES(%s,%s,%s,%s,%s)",(nm,bu,cc,head,budget))
    cur.execute("SELECT id FROM master_states WHERE code='MH'"); mh_id=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_states WHERE code='KA'"); ka_id=cur.fetchone()['id']
    for nm,city,sid,hc,typ in [("Hyderabad (HQ)","Hyderabad",ts_id,120,"Headquarters"),("Mumbai","Mumbai",mh_id,45,"Regional"),("Bangalore","Bangalore",ka_id,38,"Regional")]:
        cur.execute("INSERT INTO office_locations(name,city,state_id,country_id,type,headcount) VALUES(%s,%s,%s,%s,%s,%s)",(nm,city,sid,in_id,typ,hc))
    cur.execute("SELECT id FROM master_employment_types WHERE name='Full-Time'"); et_fte=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_employment_types WHERE name='Contractor (C2C)'"); et_ctr=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_contract_types WHERE name='Staff Augmentation'"); ct_sa=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_contract_types WHERE name='MSA'"); ct_ms=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_payment_terms WHERE name='Net 30'"); pt30=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_payment_terms WHERE name='Net 45'"); pt45=cur.fetchone()['id']
    for nm,ind,ct,curr,pt,poc,email,score,status,rating in [
        ("Acme Inc.","Technology",ct_sa,"USD",pt30,"Brian Cole","brian@acme.com",98,"Active",5),
        ("TechCorp","Finance",ct_ms,"USD",pt30,"Sara Fine","sara@techcorp.com",94,"Active",4),
        ("GloboCorp","Retail",ct_sa,"INR",pt45,"Mike Rand","mike@globo.com",42,"At Risk",2),
        ("DataSys","Healthcare",ct_ms,"INR",pt30,"Amy Ling","amy@datasys.com",86,"Active",4),
        ("NovaTech","Manufacturing",ct_sa,"INR",pt30,"Rob Steel","rob@novatech.com",91,"Active",5),
    ]: cur.execute("INSERT INTO clients(name,industry,contract_type_id,currency,payment_terms_id,primary_contact,contact_email,health_score,status,rating) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(nm,ind,ct,curr,pt,poc,email,score,status,rating))
    cur.execute("SELECT id FROM master_vendor_categories WHERE name='Job Board'"); vc_jb=cur.fetchone()['id']
    cur.execute("INSERT INTO vendors(name,category_id,primary_contact,contact_email,contract_end,sla_score,spend_mtd,status,rating) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        ("LinkedIn Talent",vc_jb,"Sarah M.","sarah@linkedin.com","2026-12-31",97,28000,"Active",5))
    cur.execute("SELECT id FROM departments WHERE name='Engineering'"); dept_eng=cur.fetchone()['id']
    cur.execute("SELECT id FROM departments WHERE name='HR & Talent'"); dept_hr=cur.fetchone()['id']
    cur.execute("SELECT id FROM departments WHERE name='Sales'"); dept_sal=cur.fetchone()['id']
    for eid,fn,ln,em,title,dept,etype,sal,br,sd,status in [
        ("EMP-0001","Ravi","Kumar","ravi@mcraan.com","VP Engineering",dept_eng,et_fte,220000,0,"2019-01-15","Active"),
        ("EMP-0002","Aisha","Kumar","aisha@mcraan.com","HR Director",dept_hr,et_fte,180000,0,"2020-02-10","Active"),
        ("EMP-0003","Carlos","Mendez","carlos@mcraan.com","Sr. Recruiter",dept_hr,et_fte,95000,0,"2021-03-22","Active"),
        ("EMP-0004","Sandra","Bloom","sandra@mcraan.com","VP Sales",dept_sal,et_fte,240000,0,"2018-06-01","Active"),
        ("EMP-0005","Marcus","Torres","marcus@mcraan.com","Account Executive",dept_sal,et_fte,110000,145,"2021-06-15","Active"),
    ]: cur.execute("INSERT INTO employees(emp_id,first_name,last_name,email,job_title,department_id,employment_type_id,salary,bill_rate,start_date,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(eid,fn,ln,em,title,dept,etype,sal,br,sd,status))
    cur.execute("SELECT id FROM master_user_roles WHERE name='Admin'"); admin_role=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_user_roles WHERE name='HR Manager'"); hr_role=cur.fetchone()['id']
    cur.execute("SELECT id FROM master_user_roles WHERE name='Employee'"); emp_role=cur.fetchone()['id']
    cur.execute("SELECT id FROM employees WHERE emp_id='EMP-0002'"); aisha_id=cur.fetchone()['id']
    cur.execute("SELECT id FROM employees WHERE emp_id='EMP-0005'"); marcus_id=cur.fetchone()['id']
    for uname,email,pw,role,emp,fullname in [
        ("admin","admin@mcraan.com","Admin@123",admin_role,None,"System Administrator"),
        ("aisha.kumar","aisha@mcraan.com","HR@123",hr_role,aisha_id,"Aisha Kumar"),
        ("marcus.torres","marcus@mcraan.com","Emp@123",emp_role,marcus_id,"Marcus Torres"),
    ]: cur.execute("INSERT INTO users(username,email,password_hash,role_id,employee_id,full_name) VALUES(%s,%s,%s,%s,%s,%s)",
        (uname,email,hashlib.sha256(pw.encode()).hexdigest(),role,emp,fullname))
    cur.execute("INSERT INTO payroll_runs(run_date,period_start,period_end,employee_count,gross_amount,net_amount,status) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        ("2026-05-02","2026-04-16","2026-04-30",5,845000,634000,"Processing"))
    run_id = cur.fetchone()['id']
    cur.execute("SELECT id FROM employees WHERE emp_id='EMP-0001'"); r1=cur.fetchone()['id']
    cur.execute("SELECT id FROM employees WHERE emp_id='EMP-0002'"); r2=cur.fetchone()['id']
    cur.execute("SELECT id FROM employees WHERE emp_id='EMP-0003'"); r3=cur.fetchone()['id']
    for eid,ctc,basic,hra,med,spec,inc,pt,pf_e,pf_er,mi,tds in [
        (r1,220000,18333,7333,1250,3500,10000,200,2200,2200,1000,4500),
        (r2,180000,15000,6000,1000,2500,5000,200,1800,1800,1000,3000),
        (r3,95000,7916,3166,650,1300,2000,200,950,950,750,800),
    ]:
        total_earn=basic+hra+med+spec+inc; total_ded=pt+pf_e+mi+tds; net=total_earn-total_ded
        cur.execute("INSERT INTO payroll_entries(payroll_run_id,employee_id,month,ctc,basic,hra,medical_allowance,special_allowance,incentive,total_earnings,profession_tax,pf_employee,pf_employer,medical_insurance,tds,total_deductions,net_salary) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (run_id,eid,"2026-04",ctc,basic,hra,med,spec,inc,total_earn,pt,pf_e,pf_er,mi,tds,total_ded,net))
    cur.execute("SELECT id FROM users WHERE username='admin'")
    admin_id = cur.fetchone()['id']
    cur.execute("INSERT INTO activity_log(entity_type,entity_id,action,description,user_name) VALUES(%s,%s,%s,%s,%s)",
        ("organisation",1,"created","Organisation profile created","System"))
    print("Seeded OK", flush=True)

_bootstrap_db()


# ── DB & helpers ─────────────────────────────────────────────────────────
def get_db():
    if 'db' not in g:
        conn = get_pg_conn()
        conn.autocommit = True
        g.db = conn
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db:
        try: db.close()
        except: pass

def _cur():
    return get_db().cursor()

def rows(q, p=()):
    cur = _cur()
    cur.execute(q, p)
    result = cur.fetchall()
    return [dict(r) for r in result]

def row1(q, p=()):
    cur = _cur()
    cur.execute(q, p)
    r = cur.fetchone()
    return dict(r) if r else None

def _scalar(q, p=()):
    """Return first value of first row — for COUNT, SUM etc"""
    cur = _cur()
    cur.execute(q, p)
    r = cur.fetchone()
    if r is None: return 0
    return list(dict(r).values())[0]
def ok(data=None,msg="ok",status=200): return jsonify({"success":True,"message":msg,"data":data}),status
def err(msg="Error",status=400):       return jsonify({"success":False,"message":msg}),status
def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()
def log(etype,eid,action,desc,uname="System"):
    _cur().execute("INSERT INTO activity_log(entity_type,entity_id,action,description,user_name) VALUES(%s,%s,%s,%s,%s)",(etype,str(eid),action,desc,uname))

# ── Auth ─────────────────────────────────────────────────────────────────
def get_user():
    token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
    if not token: return None
    _cur().execute("DELETE FROM user_sessions WHERE expires_at < NOW()")
    return row1("""SELECT u.*,r.name as role_name FROM user_sessions s
        JOIN users u ON u.id=s.user_id JOIN master_user_roles r ON r.id=u.role_id
        WHERE s.token=%s AND s.expires_at>NOW() AND u.is_active=1""", (token,))

def require_auth(f):
    from functools import wraps
    @wraps(f)
    def w(*a,**kw):
        u=get_user()
        if not u: return err("Authentication required.",401)
        g.user=u; return f(*a,**kw)
    return w

# ── CORS ─────────────────────────────────────────────────────────────────
@app.after_request
def cors(r):
    r.headers['Access-Control-Allow-Origin']  = '*'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-Auth-Token'
    r.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    return r

# ── Static ───────────────────────────────────────────────────────────────
@app.route('/', defaults={'path':''})
@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api/'): return err("Not found",404)
    return send_from_directory(STATIC,'index.html')

@app.route('/api/options', methods=['OPTIONS'])
def handle_options(): return '',204

# ═══════════════════════════════════════════════════
# AUTH ROUTES
# ═══════════════════════════════════════════════════
@app.route('/api/auth/login', methods=['POST'])
def login():
    d=request.get_json()
    if not d or not d.get('username') or not d.get('password'):
        return err("Username and password required.")
    u=row1("""SELECT u.*,r.name as role_name FROM users u
        JOIN master_user_roles r ON r.id=u.role_id
        WHERE (u.username=%s OR u.email=%s) AND u.is_active=1""",
        (d['username'],d['username']))
    if not u or u['password_hash']!=hash_pw(d['password']):
        return err("Invalid username or password.",401)
    token=secrets.token_urlsafe(32)
    exp=(datetime.utcnow()+timedelta(hours=SESSION_HOURS))
    _cur().execute("INSERT INTO user_sessions(user_id,token,ip_address,user_agent,expires_at) VALUES(%s,%s,%s,%s,%s)",
               (u['id'],token,request.remote_addr,request.headers.get('User-Agent',''),exp))
    _cur().execute("UPDATE users SET last_login=NOW() WHERE id=%s",(u['id'],))

    # Get employee info if linked
    emp = None
    if u['employee_id']:
        emp = row1("SELECT emp_id,reporting_manager_id FROM employees WHERE id=%s",(u['employee_id'],))
    return ok({"token":token,"user":{"id":u['id'],"username":u['username'],"email":u['email'],
               "full_name":u['full_name'],"role":u['role_name'],
               "employee_id":u['employee_id'],"must_change_pwd":bool(u['must_change_pwd']),
               "emp":emp}})

@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    token=request.headers.get('X-Auth-Token')
    _cur().execute("DELETE FROM user_sessions WHERE token=%s",(token,))
    get_db().commit(); return ok(msg="Logged out")

@app.route('/api/auth/change-password', methods=['POST'])
@require_auth
def change_password():
    import hashlib
    d=request.get_json()
    uid=g.user['id']
    current=hashlib.sha256(d.get('current_password','').encode()).hexdigest()
    u=row1("SELECT * FROM users WHERE id=%s",(uid,))
    if not u: return err("User not found",404)
    if u['password_hash']!=current: return err("Current password is incorrect",400)
    new_hash=hashlib.sha256(d.get('new_password','').encode()).hexdigest()
    _cur().execute("UPDATE users SET password_hash=%s,must_change_pwd=0 WHERE id=%s",(new_hash,uid))
    get_db().commit()
    return ok(msg="Password changed successfully")

@app.route('/api/auth/me')
@require_auth
def auth_me():
    u=g.user
    return ok({"id":u['id'],"username":u['username'],"email":u['email'],
               "full_name":u['full_name'],"role":u['role_name'],"employee_id":u.get('employee_id')})

@app.route('/api/auth/change-password', methods=['POST'])
@require_auth
def change_pw():
    d=request.get_json()
    if not d.get('new_password'): return err("New password required.")
    db=get_db()
    if not d.get('skip_old'):
        old=row1("SELECT password_hash FROM users WHERE id=%s",(g.user['id'],))
        if not old or old.get('password_hash')!=hash_pw(d.get('old_password','')):
            return err("Current password incorrect.")
    _cur().execute("UPDATE users SET password_hash=%s,must_change_pwd=0 WHERE id=%s",(hash_pw(d['new_password']),g.user['id']))
    get_db().commit(); return ok(msg="Password updated")

# ═══════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════
@app.route('/api/users', methods=['GET','POST'])
@require_auth
def users():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT u.*,r.name as role_name,
            e.first_name||' '||e.last_name as employee_name
            FROM users u JOIN master_user_roles r ON r.id=u.role_id
            LEFT JOIN employees e ON e.id=u.employee_id ORDER BY u.created_at DESC"""))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO users(username,email,password_hash,role_id,employee_id,client_id,vendor_id,full_name,must_change_pwd) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,1) RETURNING id",
        (d['username'],d['email'],hash_pw(d['password']),d['role_id'],
         d.get('employee_id'),d.get('client_id'),d.get('vendor_id'),d.get('full_name')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"User created",201)

@app.route('/api/users/<int:uid>', methods=['GET','PUT','DELETE'])
@require_auth
def user_detail(uid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT u.*,r.name as role_name FROM users u JOIN master_user_roles r ON r.id=u.role_id WHERE u.id=%s",(uid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        _cur().execute("UPDATE users SET is_active=0 WHERE id=%s",(uid,)); db.commit(); return ok(msg="Deactivated")
    d=request.get_json()
    import hashlib
    _cur().execute("UPDATE users SET email=%s,role_id=%s,full_name=%s,is_active=%s,employee_id=%s,client_id=%s,vendor_id=%s WHERE id=%s",
        (d.get('email'),d.get('role_id'),d.get('full_name'),int(d.get('is_active',1)),
         d.get('employee_id') or None,d.get('client_id') or None,d.get('vendor_id') or None,uid))
    if d.get('new_password'):
        pwd_hash=hashlib.sha256(d['new_password'].encode()).hexdigest()
        force=1 if d.get('must_change_pwd',True) else 0
        _cur().execute("UPDATE users SET password_hash=%s,must_change_pwd=%s WHERE id=%s",(pwd_hash,force,uid))
        if d.get('send_email') and d.get('email'):
            u2=row1("SELECT full_name,username FROM users WHERE id=%s",(uid,))
            org=row1("SELECT legal_name FROM organisation LIMIT 1")
            org_name=org['legal_name'] if org else 'McHR&TA'
            html=f'<div style="font-family:Arial,sans-serif;padding:24px"><h2 style="color:#2d8f3e">{org_name} — Password Reset</h2><p>Hi {u2["full_name"] if u2 else ""},</p><p>Your password has been reset.</p><div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0"><p><strong>Username:</strong> {u2["username"] if u2 else ""}</p><p><strong>New Password:</strong> {d["new_password"]}</p></div><p style="color:#e53e3e"><strong>Please change your password on next login.</strong></p></div>'
            send_email(d['email'],f"{org_name} — Password Reset",html)
    get_db().commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════
# MASTERS
# ═══════════════════════════════════════════════════
@app.route('/api/bulk/upload/<entity>', methods=['POST'])
@require_auth
def bulk_upload(entity):
    """Process bulk CSV upload"""
    data = request.get_json()
    if not data or 'rows' not in data:
        return err("No data provided")
    rows_data = data['rows']
    if not rows_data:
        return err("Empty data")

    results = {'created': 0, 'skipped': 0, 'errors': []}

    if entity == 'employees':
        # Get lookup data
        depts = {d['name'].lower(): d['id'] for d in rows("SELECT id,name FROM departments WHERE is_active=1")}
        emp_types = {e['name'].lower(): e['id'] for e in rows("SELECT id,name FROM master_employment_types")}
        for i, row in enumerate(rows_data, 1):
            try:
                fn = (row.get('first_name') or '').strip()
                ln = (row.get('last_name') or '').strip()
                if not fn or not ln:
                    results['errors'].append(f"Row {i}: first_name and last_name required")
                    results['skipped'] += 1
                    continue
                dept_id = depts.get((row.get('department_name') or '').lower())
                et_id = emp_types.get((row.get('employment_type') or 'full-time').lower())
                # Auto emp_id
                n = _scalar("SELECT COUNT(*) as c FROM employees WHERE emp_id LIKE 'EMP-%'")
                emp_id = f"EMP-{int(n)+1:04d}"
                _cur().execute("""INSERT INTO employees(emp_id,first_name,last_name,email,phone,
                    job_title,department_id,employment_type_id,salary,bill_rate,
                    start_date,status,referred_by,location)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (emp_id, fn, ln,
                     row.get('email') or None, row.get('phone') or None,
                     row.get('job_title') or None, dept_id, et_id,
                     float(row.get('salary') or 0), float(row.get('bill_rate') or 0),
                     row.get('start_date(YYYY-MM-DD)') or row.get('start_date') or None,
                     row.get('status') or 'Active',
                     row.get('referred_by') or None, row.get('location') or None))
                results['created'] += 1
            except Exception as e:
                results['errors'].append(f"Row {i} ({row.get('first_name','')} {row.get('last_name','')}): {str(e)[:100]}")
                results['skipped'] += 1

    elif entity == 'candidates':
        sources = {s['name'].lower(): s['id'] for s in rows("SELECT id,name FROM master_candidate_sources")}
        for i, row in enumerate(rows_data, 1):
            try:
                fn = (row.get('first_name') or '').strip()
                ln = (row.get('last_name') or '').strip()
                if not fn or not ln:
                    results['errors'].append(f"Row {i}: first_name and last_name required")
                    results['skipped'] += 1
                    continue
                src_id = sources.get((row.get('source') or '').lower())
                _cur().execute("""INSERT INTO candidates(first_name,last_name,email,phone,
                    location,current_title,years_exp,source_id,skills)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (fn, ln, row.get('email') or None, row.get('phone') or None,
                     row.get('location') or None, row.get('current_title') or None,
                     int(row.get('years_exp') or 0), src_id, row.get('skills') or None))
                results['created'] += 1
            except Exception as e:
                results['errors'].append(f"Row {i}: {str(e)[:100]}")
                results['skipped'] += 1

    elif entity == 'clients':
        ct_map = {c['name'].lower(): c['id'] for c in rows("SELECT id,name FROM master_contract_types")}
        pt_map = {str(p['days']): p['id'] for p in rows("SELECT id,days FROM master_payment_terms")}
        for i, row in enumerate(rows_data, 1):
            try:
                name = (row.get('name') or '').strip()
                if not name:
                    results['errors'].append(f"Row {i}: name required"); results['skipped'] += 1; continue
                ct_id = ct_map.get((row.get('contract_type') or '').lower())
                pt_id = pt_map.get(str(row.get('payment_terms_days') or '30'))
                _cur().execute("""INSERT INTO clients(name,industry,contract_type_id,currency,
                    payment_terms_id,primary_contact,contact_email,contact_phone,city,gstin,pan,status)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (name, row.get('industry') or None, ct_id,
                     row.get('currency') or 'INR', pt_id,
                     row.get('primary_contact') or None, row.get('contact_email') or None,
                     row.get('contact_phone') or None, row.get('city') or None,
                     row.get('gstin') or None, row.get('pan') or None,
                     row.get('status') or 'Active'))
                results['created'] += 1
            except Exception as e:
                results['errors'].append(f"Row {i}: {str(e)[:100]}")
                results['skipped'] += 1

    elif entity == 'vendors':
        vc_map = {v['name'].lower(): v['id'] for v in rows("SELECT id,name FROM master_vendor_categories")}
        for i, row in enumerate(rows_data, 1):
            try:
                name = (row.get('name') or '').strip()
                if not name:
                    results['errors'].append(f"Row {i}: name required"); results['skipped'] += 1; continue
                vc_id = vc_map.get((row.get('category') or '').lower())
                _cur().execute("""INSERT INTO vendors(name,category_id,primary_contact,contact_email,
                    contact_phone,city,gstin,pan,sla_score,status)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (name, vc_id, row.get('primary_contact') or None,
                     row.get('contact_email') or None, row.get('contact_phone') or None,
                     row.get('city') or None, row.get('gstin') or None, row.get('pan') or None,
                     int(row.get('sla_score') or 90), row.get('status') or 'Active'))
                results['created'] += 1
            except Exception as e:
                results['errors'].append(f"Row {i}: {str(e)[:100]}")
                results['skipped'] += 1

    elif entity == 'timesheets':
        emp_map = {e['emp_id']: e['id'] for e in rows("SELECT id,emp_id FROM employees WHERE is_active=1")}
        cli_map = {c['name'].lower(): c['id'] for c in rows("SELECT id,name FROM clients WHERE is_active=1")}
        st_id = _scalar("SELECT id FROM master_timesheet_statuses WHERE name='Pending'")
        for i, row in enumerate(rows_data, 1):
            try:
                emp_code = (row.get('employee_code') or '').strip()
                if not emp_code or emp_code not in emp_map:
                    results['errors'].append(f"Row {i}: employee_code '{emp_code}' not found"); results['skipped'] += 1; continue
                we = row.get('week_ending(YYYY-MM-DD)') or row.get('week_ending')
                if not we:
                    results['errors'].append(f"Row {i}: week_ending required"); results['skipped'] += 1; continue
                cli_id = cli_map.get((row.get('client_name') or '').lower())
                _cur().execute("""INSERT INTO timesheets(employee_id,client_id,project,week_ending,
                    regular_hours,overtime_hours,bill_rate,notes,status_id)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (emp_map[emp_code], cli_id, row.get('project') or None, we,
                     float(row.get('regular_hours') or 0), float(row.get('overtime_hours') or 0),
                     float(row.get('bill_rate') or 0), row.get('notes') or None, st_id))
                results['created'] += 1
            except Exception as e:
                results['errors'].append(f"Row {i}: {str(e)[:100]}")
                results['skipped'] += 1
    else:
        return err(f"Bulk upload not supported for: {entity}", 400)

    msg = f"Uploaded: {results['created']} created, {results['skipped']} skipped"
    return ok(results, msg, 201 if results['created'] > 0 else 200)

# ═══════════════════════════════════════════════════
# RUN
# ═══════════════════════════════════════════════════
@app.route('/api/masters/all')
@require_auth
def masters_all():
    tmap={'employment-types':'master_employment_types','contract-types':'master_contract_types',
          'vendor-categories':'master_vendor_categories','invoice-statuses':'master_invoice_statuses',
          'application-stages':'master_application_stages','candidate-sources':'master_candidate_sources',
          'payment-terms':'master_payment_terms','priority-levels':'master_priority_levels',
          'timesheet-statuses':'master_timesheet_statuses','user-roles':'master_user_roles',
          'countries':'master_countries','interview-formats':'master_interview_formats',
          'onboarding-templates':'master_onboarding_templates','states':'master_states',
          'relationship-types':'master_relationship_types'}
    result={}
    for t,tbl in tmap.items():
        try: result[t]=rows(f"SELECT * FROM {tbl} ORDER BY name")
        except: result[t]=[]
    return ok(result)






@app.route('/api/masters/<table>')
def masters(table):
    tbl_map = {
        'countries':'master_countries','states':'master_states',
        'employment-types':'master_employment_types','contract-types':'master_contract_types',
        'vendor-categories':'master_vendor_categories','invoice-statuses':'master_invoice_statuses',
        'application-stages':'master_application_stages','interview-formats':'master_interview_formats',
        'onboarding-templates':'master_onboarding_templates','candidate-sources':'master_candidate_sources',
        'payment-terms':'master_payment_terms','priority-levels':'master_priority_levels',
        'timesheet-statuses':'master_timesheet_statuses','payroll-run-types':'master_payroll_run_types',
        'user-roles':'master_user_roles','relationship-types':'master_relationship_types',
    }
    if table not in tbl_map: return err("Unknown master",404)
    tbl = tbl_map[table]
    country = request.args.get('country_id')
    if table=='states':
        if country:
            return ok(rows(f"SELECT * FROM {tbl} WHERE country_id=%s AND is_active=1 ORDER BY name",(country,)))
        india = row1("SELECT id FROM master_countries WHERE code='IN'")
        if india: return ok(rows(f"SELECT * FROM {tbl} WHERE country_id=%s AND is_active=1 ORDER BY name",(india['id'],)))
    _cur2 = _cur()
    _cur2.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s AND column_name='sort_order'", (tbl,))
    has_sort = _cur2.fetchone() is not None
    order = 'sort_order,name' if has_sort else 'name'
    return ok(rows(f"SELECT * FROM {tbl} WHERE is_active=1 ORDER BY {order}"))


# ═══════════════════════════════════════════════════
# ORGANISATION
# ═══════════════════════════════════════════════════
def _migrate_employee_columns():
    """Add new employee columns (idempotent)."""
    new_cols = [
        ("gender",           "TEXT"),
        ("dob",              "DATE"),
        ("marital_status",   "TEXT"),
        ("nationality",      "TEXT DEFAULT 'Indian'"),
        ("blood_group",      "TEXT"),
        ("photo_url",        "TEXT"),
        ("cost_centre_id",   "INTEGER"),
        ("business_unit_id", "INTEGER"),
        ("salary_structure", "TEXT"),
        ("project",          "TEXT"),
        ("end_date",         "DATE"),
        ("notice_period",    "INTEGER DEFAULT 30"),
    ]
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        for col, typ in new_cols:
            cur.execute(f"ALTER TABLE employees ADD COLUMN IF NOT EXISTS {col} {typ}")
        conn.close()
    except Exception as e:
        print(f"Employee migration warning: {e}", flush=True)

def _migrate_org_columns():
    """Add new org columns to existing DB safely (idempotent)."""
    new_cols = [
        ("legal_structure", "TEXT"),
        ("industry", "TEXT"),
        ("sub_domain", "TEXT"),
        ("logo_url", "TEXT"),
        ("timezone", "TEXT DEFAULT 'Asia/Kolkata'"),
        ("base_currency", "TEXT DEFAULT 'INR'"),
    ]
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        for col, typ in new_cols:
            cur.execute(f"ALTER TABLE organisation ADD COLUMN IF NOT EXISTS {col} {typ}")
        conn.close()
    except Exception as e:
        print(f"Org migration warning: {e}", flush=True)

def _migrate_client_vendor_columns():
    """Add new client & vendor columns to existing DB (idempotent)."""
    client_cols = [
        ("client_type",     "TEXT DEFAULT 'Direct'"),
        ("billing_cycle",   "TEXT DEFAULT 'Monthly'"),
        ("contract_start",  "DATE"),
        ("contract_end",    "DATE"),
        ("rate_card",       "TEXT"),
        ("po_number",       "TEXT"),
        ("spoc2_name",      "TEXT"),
        ("spoc2_email",     "TEXT"),
        ("spoc2_phone",     "TEXT"),
        ("spoc2_designation","TEXT"),
        ("spoc3_name",      "TEXT"),
        ("spoc3_email",     "TEXT"),
        ("spoc3_phone",     "TEXT"),
        ("spoc3_designation","TEXT"),
    ]
    vendor_cols = [
        ("vendor_type",     "TEXT DEFAULT 'Staffing'"),
        ("contract_start",  "DATE"),
        ("payment_terms_id","INTEGER"),
        ("gst_registered",  "INTEGER DEFAULT 0"),
        ("msme_registered", "INTEGER DEFAULT 0"),
        ("tds_applicable",  "INTEGER DEFAULT 0"),
        ("tds_rate",        "NUMERIC DEFAULT 0"),
        ("compliance_notes","TEXT"),
    ]
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        for col, typ in client_cols:
            cur.execute(f"ALTER TABLE clients ADD COLUMN IF NOT EXISTS {col} {typ}")
        for col, typ in vendor_cols:
            cur.execute(f"ALTER TABLE vendors ADD COLUMN IF NOT EXISTS {col} {typ}")
        conn.close()
    except Exception as e:
        print(f"Client/Vendor migration warning: {e}", flush=True)

@app.route('/api/organisation', methods=['GET','PUT'])
@require_auth
def organisation():
    _migrate_org_columns()  # safe no-op if columns exist
    db=get_db()
    if request.method=='GET':
        org=row1("""SELECT o.*,s1.name as reg_state_name,s2.name as biz_state_name,
            c1.name as reg_country_name,c2.name as biz_country_name
            FROM organisation o
            LEFT JOIN master_states s1 ON s1.id=o.reg_state_id
            LEFT JOIN master_states s2 ON s2.id=o.biz_state_id
            LEFT JOIN master_countries c1 ON c1.id=o.reg_country_id
            LEFT JOIN master_countries c2 ON c2.id=o.biz_country_id LIMIT 1""")
        if not org: return ok({})
        org['gst_registrations']=rows("""SELECT g.*,s.name as state_name
            FROM organisation_gst g LEFT JOIN master_states s ON s.id=g.state_id
            WHERE g.organisation_id=%s AND g.is_active=1 ORDER BY g.is_primary DESC""",(org['id'],))
        org['bank_accounts']=rows("SELECT * FROM organisation_bank_accounts WHERE organisation_id=%s AND is_active=1 ORDER BY is_primary DESC",(org['id'],))
        org['labour_certs']=rows("""SELECT lc.*,s.name as state_name
            FROM organisation_labour_certs lc LEFT JOIN master_states s ON s.id=lc.state_id
            WHERE lc.organisation_id=%s AND lc.is_active=1""",(org['id'],))
        org['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM organisation_documents WHERE organisation_id=%s AND is_active=1 ORDER BY uploaded_at DESC",(org['id'],))
        return ok(org)
    d=request.get_json()
    existing=row1("SELECT id FROM organisation LIMIT 1")
    fields=['legal_name','trade_name','legal_structure','industry','sub_domain','logo_url',
            'timezone','base_currency','email','phone','website',
            'reg_address_line1','reg_address_line2','reg_city','reg_state_id','reg_pincode','reg_country_id',
            'biz_address_line1','biz_address_line2','biz_city','biz_state_id','biz_pincode','biz_country_id',
            'poc_name','poc_email','poc_phone','pan','cin','tan','msme_number',
            'iec_code','profession_tax_number','pf_number','esi_number',
            'incorporation_date','financial_year_start']
    _date_fields = {'reg_state_id','reg_country_id','biz_state_id','biz_country_id'}
    vals=[d.get(f) or None if f in {'incorporation_date','reg_state_id','reg_country_id','biz_state_id','biz_country_id'} else d.get(f) for f in fields]
    if existing:
        _cur().execute("UPDATE organisation SET "+",".join(f+"=%s" for f in fields)+",updated_at=NOW() WHERE id=%s",vals+[existing['id']])
        org_id=existing['id']
    else:
        cur_org=_cur()
        cur_org.execute("INSERT INTO organisation("+",".join(fields)+") VALUES("+",".join(["%s"]*len(fields))+") RETURNING id",vals)
        row=cur_org.fetchone()
        org_id=row['id'] if row else None
    get_db().commit(); log("organisation",org_id,"updated","Organisation profile updated",g.user.get('username','System')); db.commit()
    return ok(msg="Organisation updated")

@app.route('/api/organisation/gst', methods=['POST'])
@require_auth
def add_gst():
    d=request.get_json()
    org=row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up.")
    _cur().execute("INSERT INTO organisation_gst(organisation_id,gstin,state_id,trade_name,registration_date,is_primary) VALUES(%s,%s,%s,%s,%s,%s)",
        (org['id'],d['gstin'],d.get('state_id'),d.get('trade_name'),d.get('registration_date') or None,d.get('is_primary',0)))
    get_db().commit(); return ok(msg="GST added",status=201)

@app.route('/api/organisation/gst/<int:gid>', methods=['PUT','DELETE'])
@require_auth
def gst_detail(gid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE organisation_gst SET is_active=0 WHERE id=%s",(gid,)); db.commit(); return ok(msg="GST removed")
    d=request.get_json()
    _cur().execute("UPDATE organisation_gst SET gstin=%s,state_id=%s,trade_name=%s,registration_date=%s,is_primary=%s WHERE id=%s",
        (d['gstin'],int(d['state_id']) if d.get('state_id') else None,d.get('trade_name'),
         d.get('registration_date') or None,int(d.get('is_primary',0)),gid))
    get_db().commit(); return ok(msg="GST updated")

@app.route('/api/organisation/banks', methods=['POST'])
@require_auth
def add_bank():
    d=request.get_json()
    org=row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up.")
    _cur().execute("""INSERT INTO organisation_bank_accounts
        (organisation_id,account_name,bank_name,branch,account_number,ifsc_code,swift_code,account_type,currency,is_primary)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (org['id'],d['account_name'],d['bank_name'],d.get('branch'),d['account_number'],
         d.get('ifsc_code'),d.get('swift_code'),d.get('account_type','Current'),d.get('currency','INR'),d.get('is_primary',0)))
    get_db().commit(); return ok(msg="Bank added",status=201)

@app.route('/api/organisation/banks/<int:bid>', methods=['PUT','DELETE'])
@require_auth
def bank_detail(bid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE organisation_bank_accounts SET is_active=0 WHERE id=%s",(bid,)); db.commit(); return ok(msg="Bank removed")
    d=request.get_json()
    _cur().execute("UPDATE organisation_bank_accounts SET account_name=%s,bank_name=%s,branch=%s,account_number=%s,ifsc_code=%s,swift_code=%s,account_type=%s,currency=%s,is_primary=%s WHERE id=%s",
        (d['account_name'],d['bank_name'],d.get('branch'),d['account_number'],d.get('ifsc_code'),d.get('swift_code'),d.get('account_type','Current'),d.get('currency','INR'),d.get('is_primary',0),bid))
    get_db().commit(); return ok(msg="Bank updated")

@app.route('/api/organisation/labour-certs', methods=['POST'])
@require_auth
def add_labour_cert():
    d=request.get_json()
    org=row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up.")
    _cur().execute("INSERT INTO organisation_labour_certs(organisation_id,cert_number,issuing_authority,state_id,valid_from,valid_until) VALUES(%s,%s,%s,%s,%s,%s)",
        (org['id'],d['cert_number'],d.get('issuing_authority'),d.get('state_id'),d.get('valid_from'),d.get('valid_until')))
    get_db().commit(); return ok(msg="Labour cert added",status=201)

@app.route('/api/organisation/labour-certs/<int:lid>', methods=['PUT','DELETE'])
@require_auth
def labour_cert_detail(lid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE organisation_labour_certs SET is_active=0 WHERE id=%s",(lid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE organisation_labour_certs SET cert_number=%s,issuing_authority=%s,state_id=%s,valid_from=%s,valid_until=%s WHERE id=%s",
        (d['cert_number'],d.get('issuing_authority'),int(d['state_id']) if d.get('state_id') else None,d.get('valid_from') or None,d.get('valid_until') or None,lid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/organisation/documents', methods=['GET','POST'])
@require_auth
def org_docs():
    db=get_db()
    org=row1("SELECT id FROM organisation LIMIT 1")
    if not org: return err("Organisation not set up.")
    if request.method=='GET':
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM organisation_documents WHERE organisation_id=%s AND is_active=1 ORDER BY uploaded_at DESC",(org['id'],)))
    d=request.get_json()
    # file_data is base64 encoded file content
    _cur().execute("INSERT INTO organisation_documents(organisation_id,doc_type,doc_name,file_data,file_size,mime_type) VALUES(%s,%s,%s,%s,%s,%s)",
        (org['id'],d['doc_type'],d['doc_name'],d.get('file_data'),d.get('file_size'),d.get('mime_type')))
    get_db().commit(); return ok(msg="Document saved",status=201)

@app.route('/api/organisation/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
def org_doc_detail(did):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE organisation_documents SET is_active=0 WHERE id=%s",(did,)); db.commit(); return ok(msg="Removed")
    # GET returns full file data for download
    r=row1("SELECT * FROM organisation_documents WHERE id=%s",(did,))
    return ok(r) if r else err("Not found",404)

# ═══════════════════════════════════════════════════
# ORG STRUCTURE
# ═══════════════════════════════════════════════════
@app.route('/api/org/summary')
@require_auth
def org_summary():
    db=get_db()
    return ok({"departments":_scalar("SELECT COUNT(*) as c FROM departments WHERE is_active=1"),
               "offices":_scalar("SELECT COUNT(*) as c FROM office_locations WHERE is_active=1"),
               "business_units":_scalar("SELECT COUNT(*) as c FROM business_units WHERE is_active=1"),
               "cost_centres":_scalar("SELECT COUNT(*) as c FROM cost_centres WHERE is_active=1")})

@app.route('/api/departments', methods=['GET','POST'])
@require_auth
def departments():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT d.*,b.name as business_unit,cc.name as cost_centre_name,
            (SELECT COUNT(*) FROM employees e WHERE e.department_id=d.id AND e.status IN ('Active','Onboarding')) as headcount
            FROM departments d LEFT JOIN business_units b ON b.id=d.business_unit_id
            LEFT JOIN cost_centres cc ON cc.id=d.cost_centre_id
            WHERE d.is_active=1 ORDER BY d.name"""))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO departments(name,business_unit_id,cost_centre_id,head_name,budget,cost_center,location) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (d['name'],d.get('business_unit_id'),d.get('cost_centre_id'),d.get('head_name'),d.get('budget',0),d.get('cost_center'),d.get('location')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Department created",201)

@app.route('/api/departments/<int:did>', methods=['GET','PUT','DELETE'])
@require_auth
def dept_detail(did):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT d.*,b.name as business_unit FROM departments d LEFT JOIN business_units b ON b.id=d.business_unit_id WHERE d.id=%s""",(did,))
        return ok(r) if r else err('Not found',404)
    if request.method=='DELETE':
        _cur().execute("UPDATE departments SET is_active=0 WHERE id=%s",(did,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE departments SET name=%s,business_unit_id=%s,cost_centre_id=%s,head_name=%s,budget=%s,location=%s WHERE id=%s",
        (d['name'],d.get('business_unit_id'),d.get('cost_centre_id'),d.get('head_name'),d.get('budget',0),d.get('location'),did))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/business-units', methods=['GET','POST'])
@require_auth
def business_units():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT b.*,
            (SELECT COUNT(*) FROM departments d WHERE d.business_unit_id=b.id AND d.is_active=1) as dept_count,
            (SELECT COUNT(*) FROM employees e JOIN departments d ON d.id=e.department_id WHERE d.business_unit_id=b.id AND e.status='Active') as headcount
            FROM business_units b WHERE b.is_active=1 ORDER BY b.name"""))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO business_units(name,description,head_name) VALUES(%s,%s,%s) RETURNING id",(d['name'],d.get('description'),d.get('head_name')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Business unit created",201)

@app.route('/api/business-units/<int:bid>', methods=['GET','PUT','DELETE'])
@require_auth
def bu_detail(bid):
    db=get_db()
    if request.method=='GET':
        r=row1('SELECT * FROM business_units WHERE id=%s',(bid,))
        return ok(r) if r else err('Not found',404)
    if request.method=='DELETE':
        _cur().execute("UPDATE business_units SET is_active=0 WHERE id=%s",(bid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE business_units SET name=%s,description=%s,head_name=%s WHERE id=%s",(d['name'],d.get('description'),d.get('head_name'),bid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/cost-centres', methods=['GET','POST'])
@require_auth
def cost_centres():
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT cc.*,b.name as business_unit FROM cost_centres cc LEFT JOIN business_units b ON b.id=cc.business_unit_id WHERE cc.is_active=1 ORDER BY cc.code"))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO cost_centres(code,name,business_unit_id,budget) VALUES(%s,%s,%s,%s) RETURNING id",(d['code'],d['name'],d.get('business_unit_id'),d.get('budget',0)))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Cost centre created",201)

@app.route('/api/cost-centres/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def cc_detail(cid):
    db=get_db()
    if request.method=='GET':
        r=row1('SELECT * FROM cost_centres WHERE id=%s',(cid,))
        return ok(r) if r else err('Not found',404)
    if request.method=='DELETE':
        _cur().execute("UPDATE cost_centres SET is_active=0 WHERE id=%s",(cid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE cost_centres SET code=%s,name=%s,business_unit_id=%s,budget=%s WHERE id=%s",(d['code'],d['name'],d.get('business_unit_id'),d.get('budget',0),cid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/offices', methods=['GET','POST'])
@require_auth
def offices():
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT o.*,s.name as state_name,c.name as country_name FROM office_locations o LEFT JOIN master_states s ON s.id=o.state_id LEFT JOIN master_countries c ON c.id=o.country_id WHERE o.is_active=1 ORDER BY o.name"))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO office_locations(name,city,state_id,country_id,address_line1,pincode,type,headcount) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (d['name'],d.get('city'),d.get('state_id'),d.get('country_id'),d.get('address_line1'),d.get('pincode'),d.get('type','Regional'),d.get('headcount',0)))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Location created",201)

@app.route('/api/offices/<int:oid>', methods=['GET','PUT','DELETE'])
@require_auth
def office_detail(oid):
    db=get_db()
    if request.method=='GET':
        r=row1('SELECT o.*,s.name as state_name,c.name as country_name FROM office_locations o LEFT JOIN master_states s ON s.id=o.state_id LEFT JOIN master_countries c ON c.id=o.country_id WHERE o.id=%s',(oid,))
        return ok(r) if r else err('Not found',404)
    if request.method=='DELETE':
        _cur().execute("UPDATE office_locations SET is_active=0 WHERE id=%s",(oid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE office_locations SET name=%s,city=%s,state_id=%s,country_id=%s,address_line1=%s,pincode=%s,type=%s,headcount=%s WHERE id=%s",
        (d['name'],d.get('city'),d.get('state_id'),d.get('country_id'),d.get('address_line1'),d.get('pincode'),d.get('type','Regional'),d.get('headcount',0),oid))
    get_db().commit(); return ok(msg="Updated")


# ═══════════════════════════════════════════════════
# CLIENTS
# ═══════════════════════════════════════════════════
@app.route('/api/clients', methods=['GET','POST'])
@require_auth
def clients():
    _migrate_client_vendor_columns()
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT c.*,ct.name as contract_type,pt.name as payment_terms,
            s.name as state_name,co.name as country_name,
            e.first_name||' '||e.last_name as account_manager_name,
            (SELECT COUNT(*) FROM job_requisitions r WHERE r.client_id=c.id AND r.status='Active') as open_reqs,
            (SELECT COUNT(*) FROM employees em WHERE em.client_id=c.id AND em.status='Active') as placements,
            (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND TO_CHAR(i.created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')) as revenue_mtd,
            (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND EXTRACT(YEAR FROM i.created_at)=EXTRACT(YEAR FROM NOW())) as revenue_ytd
            FROM clients c
            LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
            LEFT JOIN master_payment_terms pt ON pt.id=c.payment_terms_id
            LEFT JOIN master_states s ON s.id=c.state_id
            LEFT JOIN master_countries co ON co.id=c.country_id
            LEFT JOIN employees e ON e.id=c.account_manager_id
            WHERE c.is_active=1 ORDER BY c.name"""))
    d=request.get_json()
    cur=_cur();cur.execute("""INSERT INTO clients(name,industry,client_type,contract_type_id,currency,payment_terms_id,
        billing_cycle,contract_start,contract_end,po_number,rate_card,
        status,rating,referred_by,
        primary_contact,primary_contact_designation,contact_email,contact_phone,
        billing_contact_name,billing_contact_designation,billing_contact_phone,billing_contact_email,
        spoc2_name,spoc2_email,spoc2_phone,spoc2_designation,
        spoc3_name,spoc3_email,spoc3_phone,spoc3_designation,
        address_line1,address_line2,city,state_id,pincode,country_id,
        gstin,pan,account_manager_id,health_score)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'],d.get('industry'),d.get('client_type','Direct'),d.get('contract_type_id'),d.get('currency','INR'),d.get('payment_terms_id'),
         d.get('billing_cycle','Monthly'),d.get('contract_start') or None,d.get('contract_end') or None,d.get('po_number'),d.get('rate_card'),
         d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('billing_contact_name'),d.get('billing_contact_designation'),d.get('billing_contact_phone'),d.get('billing_contact_email'),
         d.get('spoc2_name'),d.get('spoc2_email'),d.get('spoc2_phone'),d.get('spoc2_designation'),
         d.get('spoc3_name'),d.get('spoc3_email'),d.get('spoc3_phone'),d.get('spoc3_designation'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),d.get('health_score',80)))
    cli_id = cur.fetchone()['id']
    log("clients",cli_id,"created",f"Client '{d['name']}' added",g.user.get('username'))
    return ok({"id":cli_id},"Client created",201)

@app.route('/api/clients/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def client_detail(cid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT c.*,ct.name as contract_type,pt.name as payment_terms,
            s.name as state_name,co.name as country_name,
            e.first_name||' '||e.last_name as account_manager_name
            FROM clients c LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
            LEFT JOIN master_payment_terms pt ON pt.id=c.payment_terms_id
            LEFT JOIN master_states s ON s.id=c.state_id
            LEFT JOIN master_countries co ON co.id=c.country_id
            LEFT JOIN employees e ON e.id=c.account_manager_id
            WHERE c.id=%s""",(cid,))
        if not r: return err("Not found",404)
        r['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM client_documents WHERE client_id=%s AND is_active=1 ORDER BY uploaded_at DESC",(cid,))
        return ok(r)
    if request.method=='DELETE':
        _cur().execute("UPDATE clients SET is_active=0 WHERE id=%s",(cid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("""UPDATE clients SET name=%s,industry=%s,client_type=%s,contract_type_id=%s,currency=%s,payment_terms_id=%s,
        billing_cycle=%s,contract_start=%s,contract_end=%s,po_number=%s,rate_card=%s,
        status=%s,rating=%s,referred_by=%s,
        primary_contact=%s,primary_contact_designation=%s,contact_email=%s,contact_phone=%s,
        billing_contact_name=%s,billing_contact_designation=%s,billing_contact_phone=%s,billing_contact_email=%s,
        spoc2_name=%s,spoc2_email=%s,spoc2_phone=%s,spoc2_designation=%s,
        spoc3_name=%s,spoc3_email=%s,spoc3_phone=%s,spoc3_designation=%s,
        address_line1=%s,address_line2=%s,city=%s,state_id=%s,pincode=%s,country_id=%s,
        gstin=%s,pan=%s,account_manager_id=%s,health_score=%s,updated_at=NOW() WHERE id=%s""",
        (d['name'],d.get('industry'),d.get('client_type','Direct'),d.get('contract_type_id'),d.get('currency','INR'),d.get('payment_terms_id'),
         d.get('billing_cycle','Monthly'),d.get('contract_start') or None,d.get('contract_end') or None,d.get('po_number'),d.get('rate_card'),
         d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('billing_contact_name'),d.get('billing_contact_designation'),d.get('billing_contact_phone'),d.get('billing_contact_email'),
         d.get('spoc2_name'),d.get('spoc2_email'),d.get('spoc2_phone'),d.get('spoc2_designation'),
         d.get('spoc3_name'),d.get('spoc3_email'),d.get('spoc3_phone'),d.get('spoc3_designation'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),d.get('health_score',80),cid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/clients/<int:cid>/documents', methods=['GET','POST'])
@require_auth
def client_docs(cid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM client_documents WHERE client_id=%s AND is_active=1 ORDER BY uploaded_at DESC",(cid,)))
    d=request.get_json()
    _cur().execute("INSERT INTO client_documents(client_id,doc_type,doc_name,file_data,file_size,mime_type) VALUES(%s,%s,%s,%s,%s,%s)",
        (cid,d['doc_type'],d['doc_name'],d.get('file_data'),d.get('file_size'),d.get('mime_type')))
    get_db().commit(); return ok(msg="Document saved",status=201)

@app.route('/api/clients/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
def client_doc_detail(did):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE client_documents SET is_active=0 WHERE id=%s",(did,)); db.commit(); return ok(msg="Removed")
    r=row1("SELECT * FROM client_documents WHERE id=%s",(did,))
    return ok(r) if r else err("Not found",404)

# ═══════════════════════════════════════════════════
# VENDORS
# ═══════════════════════════════════════════════════
@app.route('/api/vendors', methods=['GET','POST'])
@require_auth
def vendors():
    _migrate_client_vendor_columns()
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT v.*,vc.name as category,
            s.name as state_name,c.name as country_name,
            e.first_name||' '||e.last_name as account_manager_name
            FROM vendors v
            LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
            LEFT JOIN master_states s ON s.id=v.state_id
            LEFT JOIN master_countries c ON c.id=v.country_id
            LEFT JOIN employees e ON e.id=v.account_manager_id
            WHERE v.is_active=1 ORDER BY v.name"""))
    d=request.get_json()
    cur=_cur();cur.execute("""INSERT INTO vendors(name,category_id,vendor_type,status,rating,referred_by,
        primary_contact,primary_contact_designation,contact_email,contact_phone,
        address_line1,address_line2,city,state_id,pincode,country_id,gstin,pan,
        account_manager_id,bank_account_name,bank_name,bank_branch,bank_account_number,bank_ifsc,bank_swift,bank_account_type,
        contract_start,contract_end,sla_score,spend_mtd,sla_description,
        payment_terms_id,gst_registered,msme_registered,tds_applicable,tds_rate,compliance_notes)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['name'],d.get('category_id'),d.get('vendor_type','Staffing'),d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc'),d.get('bank_swift'),d.get('bank_account_type','Current'),
         d.get('contract_start') or None,d.get('contract_end') or None,d.get('sla_score',90),d.get('spend_mtd',0),d.get('sla_description'),
         d.get('payment_terms_id'),1 if d.get('gst_registered') else 0,1 if d.get('msme_registered') else 0,
         1 if d.get('tds_applicable') else 0,d.get('tds_rate',0),d.get('compliance_notes')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Vendor created",201)

@app.route('/api/vendors/<int:vid>', methods=['GET','PUT','DELETE'])
@require_auth
def vendor_detail(vid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT v.*,vc.name as category,s.name as state_name,c.name as country_name,
            e.first_name||' '||e.last_name as account_manager_name,
            pt.name as payment_terms_name
            FROM vendors v LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
            LEFT JOIN master_states s ON s.id=v.state_id LEFT JOIN master_countries c ON c.id=v.country_id
            LEFT JOIN employees e ON e.id=v.account_manager_id
            LEFT JOIN master_payment_terms pt ON pt.id=v.payment_terms_id
            WHERE v.id=%s""",(vid,))
        if not r: return err("Not found",404)
        r['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM vendor_documents WHERE vendor_id=%s AND is_active=1 ORDER BY uploaded_at DESC",(vid,))
        return ok(r)
    if request.method=='DELETE':
        _cur().execute("UPDATE vendors SET is_active=0 WHERE id=%s",(vid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("""UPDATE vendors SET name=%s,category_id=%s,vendor_type=%s,status=%s,rating=%s,referred_by=%s,
        primary_contact=%s,primary_contact_designation=%s,contact_email=%s,contact_phone=%s,
        address_line1=%s,address_line2=%s,city=%s,state_id=%s,pincode=%s,country_id=%s,gstin=%s,pan=%s,
        account_manager_id=%s,bank_account_name=%s,bank_name=%s,bank_branch=%s,bank_account_number=%s,bank_ifsc=%s,bank_swift=%s,bank_account_type=%s,
        contract_start=%s,contract_end=%s,sla_score=%s,sla_description=%s,
        payment_terms_id=%s,gst_registered=%s,msme_registered=%s,tds_applicable=%s,tds_rate=%s,compliance_notes=%s,
        updated_at=NOW() WHERE id=%s""",
        (d['name'],d.get('category_id'),d.get('vendor_type','Staffing'),d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc'),d.get('bank_swift'),d.get('bank_account_type','Current'),
         d.get('contract_start') or None,d.get('contract_end') or None,d.get('sla_score',90),d.get('sla_description'),
         d.get('payment_terms_id'),1 if d.get('gst_registered') else 0,1 if d.get('msme_registered') else 0,
         1 if d.get('tds_applicable') else 0,d.get('tds_rate',0),d.get('compliance_notes'),vid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/vendors/<int:vid>/documents', methods=['GET','POST'])
@require_auth
def vendor_docs(vid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM vendor_documents WHERE vendor_id=%s AND is_active=1",(vid,)))
    d=request.get_json()
    _cur().execute("INSERT INTO vendor_documents(vendor_id,doc_type,doc_name,file_data,file_size,mime_type) VALUES(%s,%s,%s,%s,%s,%s)",
        (vid,d['doc_type'],d['doc_name'],d.get('file_data'),d.get('file_size'),d.get('mime_type')))
    get_db().commit(); return ok(msg="Document saved",status=201)

@app.route('/api/vendors/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
def vendor_doc_detail(did):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE vendor_documents SET is_active=0 WHERE id=%s",(did,)); db.commit(); return ok(msg="Removed")
    r=row1("SELECT * FROM vendor_documents WHERE id=%s",(did,))
    return ok(r) if r else err("Not found",404)


# ═══════════════════════════════════════════════════
# EMPLOYEES
# ═══════════════════════════════════════════════════
@app.route('/api/employees', methods=['GET','POST'])
@require_auth
def employees():
    _migrate_employee_columns()
    db=get_db()
    if request.method=='GET':
        q=request.args.get('q',''); status=request.args.get('status',''); et=request.args.get('employment_type','')
        sql="""SELECT e.*,d.name as department_name,et.name as employment_type,
            c.name as client_name,
            m.first_name||' '||m.last_name as manager_name,
            rm.first_name||' '||rm.last_name as reporting_manager_name,
            b.name as business_unit_name
            FROM employees e
            LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
            LEFT JOIN clients c ON c.id=e.client_id
            LEFT JOIN employees m ON m.id=e.manager_id
            LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
            LEFT JOIN business_units b ON b.id=e.business_unit_id
            WHERE e.is_active=1"""
        params=[]
        if status: sql+=" AND e.status=%s"; params.append(status)
        if et: sql+=" AND et.name=%s"; params.append(et)
        if q: sql+=" AND (e.first_name||' '||e.last_name LIKE %s OR e.emp_id LIKE %s OR e.job_title LIKE %s)"; params+=[f'%{q}%']*3
        sql+=" ORDER BY e.last_name,e.first_name"
        return ok(rows(sql,params))
    d=request.get_json()
    emp_id = d.get('emp_id','').strip()
    if not emp_id:
        et_row = row1("SELECT name FROM master_employment_types WHERE id=%s",(d.get('employment_type_id',1),))
        prefix = "CTR" if et_row and "Contractor" in et_row.get('name','') else "EMP"
        n = _scalar(f"SELECT COUNT(*) as c FROM employees WHERE emp_id LIKE '{prefix}-%'")
        emp_id = f"{prefix}-{n+1:04d}"
        while row1("SELECT id FROM employees WHERE emp_id=%s",(emp_id,)):
            n+=1; emp_id=f"{prefix}-{n+1:04d}"
    else:
        if row1("SELECT id FROM employees WHERE emp_id=%s",(emp_id,)):
            return err(f"Employee code '{emp_id}' already exists.")
    cur=_cur();cur.execute("""INSERT INTO employees(emp_id,first_name,middle_name,last_name,email,phone,
        personal_email,personal_phone,job_title,department_id,employment_type_id,
        location,office_location_id,manager_id,reporting_manager_id,client_id,
        salary,bill_rate,billable,billable_amount,start_date,status,referred_by,rating,
        pan,aadhaar,passport_number,pf_number,esi_number,
        bank_account_name,bank_name,bank_branch,bank_account_number,bank_ifsc,
        gender,dob,marital_status,nationality,blood_group,photo_url,
        cost_centre_id,business_unit_id,salary_structure,project,notice_period)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (emp_id,d.get('first_name',''),d.get('middle_name'),d.get('last_name',''),d.get('email'),d.get('phone'),
         d.get('personal_email'),d.get('personal_phone'),d.get('job_title'),d.get('department_id'),d.get('employment_type_id'),
         d.get('location'),d.get('office_location_id'),d.get('manager_id'),d.get('reporting_manager_id'),d.get('client_id'),
         d.get('salary',0),d.get('bill_rate',0),d.get('billable',0),d.get('billable_amount',0),
         d.get('start_date') or None,d.get('status','Active'),d.get('referred_by'),d.get('rating',0),
         d.get('pan'),d.get('aadhaar'),d.get('passport_number'),d.get('pf_number'),d.get('esi_number'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc'),
         d.get('gender'),d.get('dob') or None,d.get('marital_status'),d.get('nationality','Indian'),d.get('blood_group'),d.get('photo_url'),
         d.get('cost_centre_id'),d.get('business_unit_id'),d.get('salary_structure'),d.get('project'),d.get('notice_period',30)))
    emp_db_id=cur.fetchone()['id']
    for atype in ['Current','Permanent']:
        key=atype.lower()
        if d.get(f'{key}_address_line1') or d.get(f'{key}_city'):
            _cur().execute("INSERT INTO employee_addresses(employee_id,address_type,address_line1,address_line2,city,state_id,pincode,country_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                (emp_db_id,atype,d.get(f'{key}_address_line1'),d.get(f'{key}_address_line2'),d.get(f'{key}_city'),d.get(f'{key}_state_id'),d.get(f'{key}_pincode'),d.get(f'{key}_country_id')))
    log("employees",emp_db_id,"hired",f"{d.get('first_name','')} {d.get('last_name','')} ({emp_id}) added",g.user.get('username','System')); db.commit()
    try:
        import hashlib
        default_pwd = hashlib.sha256(b"Employee@123").hexdigest()
        uname = (d.get('email','') or f"{d.get('first_name','').lower()}.{d.get('last_name','').lower()}").split('@')[0].replace(' ','.')
        emp_role = row1("SELECT id FROM master_user_roles WHERE name='Employee'")
        if emp_role:
            existing = row1("SELECT id FROM users WHERE username=%s OR (employee_id=%s AND employee_id IS NOT NULL)",(uname,emp_db_id))
            if not existing:
                _cur().execute("INSERT INTO users(username,email,password_hash,role_id,employee_id,full_name,must_change_pwd) VALUES(%s,%s,%s,%s,%s,%s,1) RETURNING id",
                    (uname,d.get('email'),default_pwd,emp_role['id'],emp_db_id,f"{d.get('first_name','')} {d.get('last_name','')}".strip()))
        db.commit()
    except Exception as ue:
        print(f"Warning: Could not create user: {ue}", flush=True)
    return ok({"id":emp_db_id,"emp_id":emp_id},"Employee created",201)

@app.route('/api/employees/<int:eid>', methods=['GET','PUT','DELETE'])
@require_auth
def employee_detail(eid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT e.*,d.name as department_name,et.name as employment_type,
            c.name as client_name,m.first_name||' '||m.last_name as manager_name,
            rm.first_name||' '||rm.last_name as reporting_manager_name,
            b.name as business_unit_name, cc.name as cost_centre_name, cc.code as cost_centre_code
            FROM employees e LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
            LEFT JOIN clients c ON c.id=e.client_id
            LEFT JOIN employees m ON m.id=e.manager_id
            LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
            LEFT JOIN business_units b ON b.id=e.business_unit_id
            LEFT JOIN cost_centres cc ON cc.id=e.cost_centre_id
            WHERE e.id=%s""",(eid,))
        if not r: return err("Not found",404)
        r['addresses']=rows("SELECT * FROM employee_addresses WHERE employee_id=%s",(eid,))
        r['emergency_contacts']=rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=%s",(eid,))
        r['education']=rows("SELECT * FROM employee_education WHERE employee_id=%s ORDER BY sort_order,end_year DESC",(eid,))
        r['experience']=rows("SELECT * FROM employee_experience WHERE employee_id=%s ORDER BY sort_order,start_date DESC",(eid,))
        r['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM employee_documents WHERE employee_id=%s AND is_active=1",(eid,))
        r['payslips']=rows("SELECT month,ctc,net_salary,total_earnings,total_deductions FROM payroll_entries WHERE employee_id=%s ORDER BY month DESC LIMIT 12",(eid,))
        return ok(r)
    if request.method=='DELETE':
        _cur().execute("UPDATE employees SET status='Terminated',is_active=0 WHERE id=%s",(eid,)); db.commit(); return ok(msg="Terminated")
    d=request.get_json()
    # Check emp_id uniqueness on update
    new_emp_id=d.get('emp_id','').strip()
    if new_emp_id:
        conflict=row1("SELECT id FROM employees WHERE emp_id=%s AND id!=%s",(new_emp_id,eid))
        if conflict: return err(f"Employee code '{new_emp_id}' is already used by another employee.")
    _cur().execute("""UPDATE employees SET emp_id=COALESCE(NULLIF(%s,''),emp_id),
        first_name=%s,middle_name=%s,last_name=%s,email=%s,phone=%s,
        personal_email=%s,personal_phone=%s,job_title=%s,department_id=%s,employment_type_id=%s,
        location=%s,office_location_id=%s,manager_id=%s,reporting_manager_id=%s,client_id=%s,
        salary=%s,bill_rate=%s,billable=%s,billable_amount=%s,start_date=%s,status=%s,referred_by=%s,rating=%s,
        pan=%s,aadhaar=%s,passport_number=%s,pf_number=%s,esi_number=%s,
        bank_account_name=%s,bank_name=%s,bank_branch=%s,bank_account_number=%s,bank_ifsc=%s,
        gender=%s,dob=%s,marital_status=%s,nationality=%s,blood_group=%s,photo_url=%s,
        cost_centre_id=%s,business_unit_id=%s,salary_structure=%s,project=%s,notice_period=%s,
        updated_at=NOW() WHERE id=%s""",
        (new_emp_id,d.get('first_name',''),d.get('middle_name'),d.get('last_name',''),d.get('email'),d.get('phone'),
         d.get('personal_email'),d.get('personal_phone'),d.get('job_title'),d.get('department_id'),d.get('employment_type_id'),
         d.get('location'),d.get('office_location_id'),d.get('manager_id'),d.get('reporting_manager_id'),d.get('client_id'),
         d.get('salary',0),d.get('bill_rate',0),d.get('billable',0),d.get('billable_amount',0),
         d.get('start_date') or None,d.get('status','Active'),d.get('referred_by'),d.get('rating',0),
         d.get('pan'),d.get('aadhaar'),d.get('passport_number'),d.get('pf_number'),d.get('esi_number'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc'),
         d.get('gender'),d.get('dob') or None,d.get('marital_status'),d.get('nationality','Indian'),d.get('blood_group'),d.get('photo_url'),
         d.get('cost_centre_id'),d.get('business_unit_id'),d.get('salary_structure'),d.get('project'),d.get('notice_period',30),eid))
    get_db().commit(); return ok(msg="Updated")

# Employee sub-resources
@app.route('/api/employees/<int:eid>/addresses', methods=['GET','POST'])
@require_auth
def emp_addresses(eid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT ea.*,s.name as state_name,c.name as country_name FROM employee_addresses ea LEFT JOIN master_states s ON s.id=ea.state_id LEFT JOIN master_countries c ON c.id=ea.country_id WHERE ea.employee_id=%s",(eid,)))
    d=request.get_json()
    # Upsert by type
    existing=row1("SELECT id FROM employee_addresses WHERE employee_id=%s AND address_type=%s",(eid,d['address_type']))
    if existing:
        _cur().execute("UPDATE employee_addresses SET address_line1=%s,address_line2=%s,city=%s,state_id=%s,pincode=%s,country_id=%s WHERE id=%s",
            (d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),existing['id']))
    else:
        _cur().execute("INSERT INTO employee_addresses(employee_id,address_type,address_line1,address_line2,city,state_id,pincode,country_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
            (eid,d['address_type'],d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id')))
    get_db().commit(); return ok(msg="Address saved")

@app.route('/api/employees/<int:eid>/emergency-contacts', methods=['GET','POST'])
@require_auth
def emp_emergency(eid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=%s",(eid,)))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO employee_emergency_contacts(employee_id,name,phone,email,relationship,is_primary) VALUES(%s,%s,%s,%s,%s,%s)",
        (eid,d['name'],d.get('phone'),d.get('email'),d.get('relationship'),d.get('is_primary',0)))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Added",201)

@app.route('/api/employees/emergency-contacts/<int:cid>', methods=['PUT','DELETE'])
@require_auth
def emp_emergency_detail(cid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("DELETE FROM employee_emergency_contacts WHERE id=%s",(cid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE employee_emergency_contacts SET name=%s,phone=%s,email=%s,relationship=%s,is_primary=%s WHERE id=%s",
        (d['name'],d.get('phone'),d.get('email'),d.get('relationship'),d.get('is_primary',0),cid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/employees/<int:eid>/education', methods=['GET','POST'])
@require_auth
def emp_education(eid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT * FROM employee_education WHERE employee_id=%s ORDER BY sort_order,end_year DESC",(eid,)))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO employee_education(employee_id,institution,degree,field_of_study,start_year,end_year,grade) VALUES(%s,%s,%s,%s,%s,%s,%s)",
        (eid,d['institution'],d.get('degree'),d.get('field_of_study'),d.get('start_year'),d.get('end_year'),d.get('grade')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Added",201)

@app.route('/api/employees/education/<int:eid>', methods=['PUT','DELETE'])
@require_auth
def edu_detail(eid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("DELETE FROM employee_education WHERE id=%s",(eid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE employee_education SET institution=%s,degree=%s,field_of_study=%s,start_year=%s,end_year=%s,grade=%s WHERE id=%s",
        (d['institution'],d.get('degree'),d.get('field_of_study'),d.get('start_year'),d.get('end_year'),d.get('grade'),eid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/employees/<int:eid>/experience', methods=['GET','POST'])
@require_auth
def emp_experience(eid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT * FROM employee_experience WHERE employee_id=%s ORDER BY sort_order,start_date DESC",(eid,)))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO employee_experience(employee_id,company,designation,location,start_date,end_date,is_current,description) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
        (eid,d['company'],d.get('designation'),d.get('location'),d.get('start_date'),d.get('end_date'),d.get('is_current',0),d.get('description')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Added",201)

@app.route('/api/employees/experience/<int:xid>', methods=['PUT','DELETE'])
@require_auth
def exp_detail(xid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("DELETE FROM employee_experience WHERE id=%s",(xid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE employee_experience SET company=%s,designation=%s,location=%s,start_date=%s,end_date=%s,is_current=%s,description=%s WHERE id=%s",
        (d['company'],d.get('designation'),d.get('location'),d.get('start_date'),d.get('end_date'),d.get('is_current',0),d.get('description'),xid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/employees/<int:eid>/documents', methods=['GET','POST'])
@require_auth
def emp_docs(eid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM employee_documents WHERE employee_id=%s AND is_active=1",(eid,)))
    d=request.get_json()
    _cur().execute("INSERT INTO employee_documents(employee_id,doc_type,doc_name,file_data,file_size,mime_type) VALUES(%s,%s,%s,%s,%s,%s)",
        (eid,d['doc_type'],d['doc_name'],d.get('file_data'),d.get('file_size'),d.get('mime_type')))
    get_db().commit(); return ok(msg="Document saved",status=201)

@app.route('/api/employees/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
def emp_doc_detail(did):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE employee_documents SET is_active=0 WHERE id=%s",(did,)); db.commit(); return ok(msg="Removed")
    r=row1("SELECT * FROM employee_documents WHERE id=%s",(did,))
    return ok(r) if r else err("Not found",404)

# Employee self-service (for Employee role)
@app.route('/api/my/profile')
@require_auth
def my_profile():
    if not g.user.get('employee_id'): return err("No employee profile linked.",403)
    r=row1("""SELECT e.*,d.name as department_name,et.name as employment_type,c.name as client_name,
        rm.first_name||' '||rm.last_name as reporting_manager_name
        FROM employees e LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        LEFT JOIN clients c ON c.id=e.client_id
        LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
        WHERE e.id=%s""",(g.user['employee_id'],))
    if r:
        r['addresses']=rows("SELECT * FROM employee_addresses WHERE employee_id=%s",(g.user['employee_id'],))
        r['emergency_contacts']=rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=%s",(g.user['employee_id'],))
        r['education']=rows("SELECT * FROM employee_education WHERE employee_id=%s ORDER BY end_year DESC",(g.user['employee_id'],))
        r['experience']=rows("SELECT * FROM employee_experience WHERE employee_id=%s ORDER BY start_date DESC",(g.user['employee_id'],))
    return ok(r)

@app.route('/api/my/timesheets', methods=['GET','POST'])
@require_auth
def my_timesheets():
    if not g.user.get('employee_id'): return err("No employee profile linked.",403)
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT t.*,c.name as client_name,s.name as status
            FROM timesheets t LEFT JOIN clients c ON c.id=t.client_id
            LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
            WHERE t.employee_id=%s ORDER BY t.week_ending DESC""",(g.user['employee_id'],)))
    d=request.get_json()
    st=_scalar("SELECT id FROM master_timesheet_statuses WHERE name='Pending'")
    if not d.get('week_ending'): return err("week_ending required")
    cur=_cur();cur.execute("INSERT INTO timesheets(employee_id,client_id,project,week_ending,regular_hours,overtime_hours,bill_rate,notes,status_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (g.user['employee_id'],d.get('client_id'),d.get('project'),d['week_ending'],
         d.get('regular_hours',0) or 0,d.get('overtime_hours',0) or 0,d.get('bill_rate',0) or 0,d.get('notes'),st))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Timesheet submitted",201)

@app.route('/api/my/payslips')
@require_auth
def my_payslips():
    if not g.user.get('employee_id'): return err("No employee profile linked.",403)
    return ok(rows("SELECT * FROM payroll_entries WHERE employee_id=%s ORDER BY month DESC",(g.user['employee_id'],)))

# Manager approval queue
@app.route('/api/my/approval-queue')
@require_auth
def approval_queue():
    if not g.user.get('employee_id'): return err("No employee profile linked.",403)
    return ok(rows("""SELECT t.*,e.first_name||' '||e.last_name as employee_name,e.emp_id,
        c.name as client_name,s.name as status
        FROM timesheets t JOIN employees e ON e.id=t.employee_id
        LEFT JOIN clients c ON c.id=t.client_id
        LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        WHERE e.reporting_manager_id=%s AND s.name='Pending'
        ORDER BY t.week_ending DESC""",(g.user['employee_id'],)))


# ═══════════════════════════════════════════════════
# TIMESHEETS
# ═══════════════════════════════════════════════════
@app.route('/api/timesheets', methods=['GET','POST'])
@require_auth
def timesheets():
    db=get_db()
    if request.method=='GET':
        status=request.args.get('status','')
        sql="""SELECT t.*,e.first_name||' '||e.last_name as employee_name,e.emp_id,
            c.name as client_name,s.name as status
            FROM timesheets t JOIN employees e ON e.id=t.employee_id
            LEFT JOIN clients c ON c.id=t.client_id
            LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE 1=1"""
        params=[]
        emp_filter=request.args.get('employee_id')
        if emp_filter: sql+=" AND t.employee_id=%s"; params.append(int(emp_filter))
        elif g.user.get('role_name')=='Employee' and g.user.get('employee_id'):
            sql+=" AND t.employee_id=%s"; params.append(g.user['employee_id'])
        if status: sql+=" AND s.name=%s"; params.append(status)
        sql+=" ORDER BY t.week_ending DESC,t.submitted_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    # Employee role: force their own employee_id
    if g.user.get('role_name')=='Employee' and g.user.get('employee_id'):
        d['employee_id']=g.user['employee_id']
    if not d.get('employee_id'): return err("employee_id required")
    st=_scalar("SELECT id FROM master_timesheet_statuses WHERE name='Pending'")
    cur=_cur();cur.execute("INSERT INTO timesheets(employee_id,client_id,project,week_ending,regular_hours,overtime_hours,bill_rate,notes,status_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (d['employee_id'],d.get('client_id'),d.get('project'),d['week_ending'],d.get('regular_hours',0),d.get('overtime_hours',0),d.get('bill_rate',0),st))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Submitted",201)

@app.route('/api/timesheets/summary')
@require_auth
def ts_summary():
    db=get_db()
    total=_scalar("SELECT COALESCE(SUM(total_hours),0) as v FROM timesheets WHERE week_ending=(SELECT MAX(week_ending) FROM timesheets)")
    billable=_scalar("SELECT COALESCE(SUM(total_hours),0) as v FROM timesheets WHERE bill_rate>0 AND week_ending=(SELECT MAX(week_ending) FROM timesheets)")
    pending=_scalar("SELECT COUNT(*) as c FROM timesheets t JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE s.name='Pending'")
    ot=_scalar("SELECT COUNT(*) as c FROM timesheets t JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE s.name='Pending' AND t.overtime_hours>0")
    return ok({"total_hours":total,"billable_hours":billable,"pending_approval":pending,"ot_alerts":ot,"utilization":round(billable/total*100,1) if total else 0})

@app.route('/api/timesheets/<int:tid>', methods=['GET','PUT'])
@require_auth
def ts_detail(tid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT * FROM timesheets WHERE id=%s",(tid,)); return ok(r) if r else err("Not found",404)
    d=request.get_json()
    new_status=d.get('status','Pending')
    st=row1("SELECT id FROM master_timesheet_statuses WHERE name=%s",(new_status,))
    if not st: return err("Invalid status")
    _cur().execute("UPDATE timesheets SET status_id=%s,notes=%s WHERE id=%s",(st['id'],d.get('notes'),tid))
    if new_status=='Approved': _cur().execute("UPDATE timesheets SET approved_at=NOW() WHERE id=%s",(tid,))

    log("timesheets",tid,new_status.lower(),f"Timesheet #{tid} {new_status}",g.user.get('username')); db.commit()
    return ok(msg=f"Timesheet {new_status}")

# ═══════════════════════════════════════════════════
# PAYROLL
# ═══════════════════════════════════════════════════
@app.route('/api/payroll', methods=['GET','POST'])
@require_auth
def payroll():
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT p.*,rt.name as run_type FROM payroll_runs p LEFT JOIN master_payroll_run_types rt ON rt.id=p.run_type_id ORDER BY p.run_date DESC"))
    d=request.get_json()
    rt=row1("SELECT id FROM master_payroll_run_types WHERE name=%s",(d.get('run_type','Semi-Monthly FTE'),))
    cur=_cur();cur.execute("INSERT INTO payroll_runs(run_date,period_start,period_end,run_type_id,employee_count,gross_amount,status) VALUES(%s,%s,%s,%s,%s,%s,'Scheduled')",
        (d['run_date'],d.get('period_start'),d.get('period_end'),rt['id'] if rt else None,d.get('employee_count',0),d.get('gross_amount',0)))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Scheduled",201)

@app.route('/api/payroll/summary')
@require_auth
def payroll_summary():
    db=get_db()
    et_fte=row1("SELECT id FROM master_employment_types WHERE name='Full-Time'")
    et_id = et_fte['id'] if et_fte else 0
    total_sal=_scalar("SELECT COALESCE(SUM(salary),0)/12 as v FROM employees WHERE employment_type_id=%s AND status='Active'",(et_id,))
    total_ctr=_scalar("SELECT COALESCE(SUM(bill_rate),0)*160 as v FROM employees WHERE employment_type_id!=%s AND status='Active'",(et_id,))
    ts = float(total_sal or 0); tc = float(total_ctr or 0)
    return ok({"base_salaries":round(ts),"contractor_payments":round(tc),
               "overtime":84000,"benefits":round(ts*0.10),"taxes":round((ts+tc)*0.0765),"total":round(ts+tc+84000)})

@app.route('/api/payroll/entries')
@require_auth
def payroll_entries():
    month = request.args.get('month','')
    et    = request.args.get('employment_type','')
    db    = get_db()
    sql   = """SELECT pe.*,
        e.emp_id,e.first_name||' '||e.last_name as employee_name,
        e.job_title,et.name as employment_type,
        d.name as department_name
        FROM payroll_entries pe
        JOIN employees e ON e.id=pe.employee_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        LEFT JOIN departments d ON d.id=e.department_id
        WHERE 1=1"""
    params=[]
    if month: sql+=" AND pe.month=%s"; params.append(month)
    if et: sql+=" AND et.name LIKE %s"; params.append(f'%{et}%')
    sql+=" ORDER BY e.last_name,e.first_name"
    data = rows(sql,params)
    # Cumulative summary
    summary = {
        'total_ctc':sum(r.get('ctc',0) for r in data),
        'total_incentive':sum(r.get('incentive',0) for r in data),
        'total_net_salary':sum(r.get('net_salary',0) for r in data),
        'total_pt':sum(r.get('profession_tax',0) for r in data),
        'total_pf_employee':sum(r.get('pf_employee',0) for r in data),
        'total_pf_employer':sum(r.get('pf_employer',0) for r in data),
        'total_tds':sum(r.get('tds',0) for r in data),
        'total_esi_employee':sum(r.get('esi_employee',0) for r in data),
        'total_esi_employer':sum(r.get('esi_employer',0) for r in data),
        'total_medical_insurance':sum(r.get('medical_insurance',0) for r in data),
        'total_deductions':sum(r.get('total_deductions',0) for r in data),
        'count':len(data),
    }
    return ok({"entries":data,"summary":summary})

@app.route('/api/payroll/months')
@require_auth
def payroll_months():
    return ok(rows("SELECT DISTINCT month FROM payroll_entries ORDER BY month DESC"))

@app.route('/api/payroll/entries/<int:eid>', methods=['GET'])
@require_auth
def payroll_entry_detail(eid):
    r=row1("""SELECT pe.*,e.emp_id,e.first_name||' '||e.last_name as employee_name,
        e.job_title,d.name as department_name,et.name as employment_type
        FROM payroll_entries pe JOIN employees e ON e.id=pe.employee_id
        LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        WHERE pe.id=%s""",(eid,))
    return ok(r) if r else err("Not found",404)


# ═══════════════════════════════════════════════════
# JOBS, PIPELINE, INTERVIEWS, ONBOARDING
# ═══════════════════════════════════════════════════
@app.route('/api/requisitions', methods=['GET','POST'])
@require_auth
def requisitions():
    db=get_db()
    if request.method=='GET':
        status=request.args.get('status','Active'); pri=request.args.get('priority','')
        sql="""SELECT r.*,c.name as client_name,e.first_name||' '||e.last_name as recruiter_name,
            p.name as priority,et.name as engagement_type,
            (CURRENT_DATE - r.opened_date::date) as days_open,
            (SELECT COUNT(*) FROM applications a WHERE a.requisition_id=r.id) as applicant_count,
            (SELECT COUNT(*) FROM applications a JOIN master_application_stages s ON s.id=a.stage_id
             WHERE a.requisition_id=r.id AND s.name NOT IN ('Applied','Rejected')) as in_pipeline
            FROM job_requisitions r JOIN clients c ON c.id=r.client_id
            LEFT JOIN employees e ON e.id=r.recruiter_id
            LEFT JOIN master_priority_levels p ON p.id=r.priority_id
            LEFT JOIN master_contract_types et ON et.id=r.engagement_type_id WHERE 1=1"""
        params=[]
        if status: sql+=" AND r.status=%s"; params.append(status)
        if pri: sql+=" AND p.name=%s"; params.append(pri)
        sql+=" ORDER BY p.sort_order,days_open DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    if not d.get('title'): return err("title is required")
    cur=_cur();cur.execute("""INSERT INTO job_requisitions(title,client_id,engagement_type_id,department_id,recruiter_id,priority_id,location,comp_min,comp_max,description,target_start,opened_date)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_DATE) RETURNING id""",
        (d['title'],d.get('client_id') or None,d.get('engagement_type_id'),d.get('department_id'),d.get('recruiter_id'),
         d.get('priority_id'),d.get('location'),d.get('comp_min'),d.get('comp_max'),d.get('description'),d.get('target_start') or None))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Created",201)

@app.route('/api/requisitions/<int:rid>', methods=['GET','PUT','DELETE'])
@require_auth
def req_detail(rid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT r.*,c.name as client_name,p.name as priority,et.name as engagement_type FROM job_requisitions r JOIN clients c ON c.id=r.client_id LEFT JOIN master_priority_levels p ON p.id=r.priority_id LEFT JOIN master_contract_types et ON et.id=r.engagement_type_id WHERE r.id=%s",(rid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        _cur().execute("UPDATE job_requisitions SET status='Closed',is_active=0 WHERE id=%s",(rid,)); db.commit(); return ok(msg="Closed")
    d=request.get_json()
    _cur().execute("UPDATE job_requisitions SET title=%s,priority_id=%s,status=%s,location=%s,comp_min=%s,comp_max=%s,description=%s,recruiter_id=%s WHERE id=%s",
        (d['title'],d.get('priority_id'),d.get('status','Active'),d.get('location'),d.get('comp_min'),d.get('comp_max'),d.get('description'),d.get('recruiter_id'),rid))
    get_db().commit(); return ok(msg="Updated")

# ── Candidate-Project mapping bootstrap ────────────────────────────────────────
def _bootstrap_candidate_projects():
    try:
        conn=get_pg_conn(); conn.autocommit=True; cur=conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS candidate_projects (
            id SERIAL PRIMARY KEY,
            candidate_id INTEGER NOT NULL REFERENCES candidates(id),
            project_id INTEGER NOT NULL REFERENCES projects(id),
            role TEXT,
            notes TEXT,
            status TEXT DEFAULT 'Active',
            mapped_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(candidate_id,project_id)
        )""")
        conn.close()
    except Exception as ex:
        print(f"candidate_projects bootstrap: {ex}", flush=True)

_bootstrap_candidate_projects()

@app.route('/api/candidates', methods=['GET','POST'])
@require_auth
def candidates():
    db=get_db()
    if request.method=='GET':
        q=request.args.get('q','')
        sql="""SELECT c.*,s.name as source,
        COUNT(DISTINCT a.id) as application_count,
        COUNT(DISTINCT cp.id) as project_count,
        MAX(st.name) as latest_stage
        FROM candidates c
        LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        LEFT JOIN applications a ON a.candidate_id=c.id
        LEFT JOIN master_application_stages st ON st.id=a.stage_id
        LEFT JOIN candidate_projects cp ON cp.candidate_id=c.id
        WHERE c.is_active=1"""
        params=[]
        if q: sql+=" AND (c.first_name||' '||c.last_name LIKE %s OR c.current_title LIKE %s)"; params=[f'%{q}%']*2
        sql+=" GROUP BY c.id,s.name ORDER BY c.created_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    if not d.get('first_name') or not d.get('last_name'): return err("first_name and last_name required")
    cur=_cur()
    cur.execute("INSERT INTO candidates(first_name,last_name,email,phone,location,current_title,years_exp,source_id,skills) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (d['first_name'],d['last_name'],d.get('email'),d.get('phone'),d.get('location'),d.get('current_title'),d.get('years_exp') or 0,d.get('source_id'),d.get('skills','')))
    cid=cur.fetchone()['id']
    # Auto-create application if requisition_id provided
    req_id=d.get('requisition_id')
    app_id=None
    if req_id:
        sid=_scalar("SELECT id FROM master_application_stages WHERE name='Applied'")
        cur.execute("INSERT INTO applications(candidate_id,requisition_id,stage_id,recruiter_id) VALUES(%s,%s,%s,%s) RETURNING id",
            (cid,req_id,sid,d.get('recruiter_id')))
        app_id=cur.fetchone()['id']
    get_db().commit()
    return ok({"id":cid,"application_id":app_id},"Candidate added",201)

@app.route('/api/candidates/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def candidate_detail(cid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE candidates SET is_active=0 WHERE id=%s",(cid,))
        return ok(msg="Removed")
    if request.method=='PUT':
        d=request.get_json()
        _cur().execute("""UPDATE candidates SET first_name=%s,last_name=%s,email=%s,phone=%s,
            location=%s,current_title=%s,years_exp=%s,linkedin_url=%s,skills=%s WHERE id=%s""",
            (d.get('first_name'),d.get('last_name'),d.get('email'),d.get('phone'),
             d.get('location'),d.get('current_title'),d.get('years_exp') or 0,
             d.get('linkedin_url'),d.get('skills'),cid))
        return ok(msg="Updated")
    # GET — full candidate with applications + project mappings
    c=row1("""SELECT c.*,s.name as source FROM candidates c
        LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        WHERE c.id=%s""", (cid,))
    if not c: return err("Not found",404)
    apps=rows("""SELECT a.*,r.title as role,r.location,cl.name as client_name,
        st.name as stage FROM applications a
        JOIN job_requisitions r ON r.id=a.requisition_id
        LEFT JOIN clients cl ON cl.id=r.client_id
        LEFT JOIN master_application_stages st ON st.id=a.stage_id
        WHERE a.candidate_id=%s ORDER BY a.applied_at DESC""", (cid,))
    proj_maps=rows("""SELECT cp.*,p.name as project_name,p.project_code,p.status as project_status,
        c2.name as client_name FROM candidate_projects cp
        JOIN projects p ON p.id=cp.project_id
        LEFT JOIN clients c2 ON c2.id=p.client_id
        WHERE cp.candidate_id=%s""", (cid,))
    c['applications']=apps
    c['project_mappings']=proj_maps
    return ok(c)

@app.route('/api/candidates/<int:cid>/projects', methods=['GET','POST'])
@require_auth
def candidate_projects(cid):
    if request.method=='GET':
        return ok(rows("""SELECT cp.*,p.name as project_name,p.project_code,
            p.status as project_status,c.name as client_name
            FROM candidate_projects cp JOIN projects p ON p.id=cp.project_id
            LEFT JOIN clients c ON c.id=p.client_id
            WHERE cp.candidate_id=%s ORDER BY cp.mapped_at DESC""", (cid,)))
    d=request.get_json()
    if not d.get('project_id'): return err("project_id required")
    try:
        cur=_cur()
        cur.execute("""INSERT INTO candidate_projects(candidate_id,project_id,role,notes,status)
            VALUES(%s,%s,%s,%s,%s) ON CONFLICT(candidate_id,project_id) DO UPDATE
            SET role=EXCLUDED.role,notes=EXCLUDED.notes,status=EXCLUDED.status
            RETURNING id""",
            (cid,d['project_id'],d.get('role'),d.get('notes'),'Active'))
        return ok({"id":cur.fetchone()['id']},"Mapped",201)
    except Exception as ex:
        return err(str(ex))

@app.route('/api/candidate-projects/<int:mid>', methods=['DELETE'])
@require_auth
def candidate_project_remove(mid):
    _cur().execute("DELETE FROM candidate_projects WHERE id=%s",(mid,))
    return ok(msg="Removed")

@app.route('/api/pipeline')
@require_auth
def pipeline():
    req_id=request.args.get('requisition_id','')
    sql="""SELECT a.*,c.first_name||' '||c.last_name as candidate_name,
        c.current_title,c.years_exp,c.location,c.skills,src.name as source,
        r.title as role,cl.name as client,s.name as stage,
        e.first_name||' '||e.last_name as recruiter_name
        FROM applications a JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions r ON r.id=a.requisition_id
        LEFT JOIN clients cl ON cl.id=r.client_id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        LEFT JOIN master_candidate_sources src ON src.id=c.source_id
        LEFT JOIN employees e ON e.id=a.recruiter_id WHERE 1=1"""
    params=[]
    if req_id: sql+=" AND a.requisition_id=%s"; params.append(req_id)
    sql+=" ORDER BY a.updated_at DESC"
    data=rows(sql,params)
    stages=['Applied','Screening','Technical','Offer','Placed','Rejected']
    grouped={s:[] for s in stages}
    for r in data:
        stage=r.get('stage') or 'Applied'
        if stage in grouped: grouped[stage].append(r)
    return ok({"by_stage":grouped,"counts":{s:len(grouped[s]) for s in stages},"total":len(data)})

@app.route('/api/applications', methods=['POST'])
@require_auth
def add_application():
    d=request.get_json()
    sid=_scalar("SELECT id FROM master_application_stages WHERE name='Applied'")
    cur=_cur();cur.execute("INSERT INTO applications(candidate_id,requisition_id,stage_id,expected_salary,recruiter_id) VALUES(%s,%s,%s,%s,%s)",
        (d['candidate_id'],d['requisition_id'],sid,d.get('expected_salary'),d.get('recruiter_id')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Created",201)

@app.route('/api/requisitions/<int:rid>/applications', methods=['GET'])
@require_auth
def req_applications(rid):
    return ok(rows("""SELECT a.id as application_id, a.stage_id,
        c.id as candidate_id, c.first_name||' '||c.last_name as candidate_name,
        c.current_title, c.years_exp, c.skills, s.name as stage
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        WHERE a.requisition_id=%s ORDER BY a.applied_at DESC""",(rid,)))

@app.route('/api/applications/<int:aid>', methods=['GET','PUT'])
@require_auth
def app_detail(aid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT a.*,c.first_name||' '||c.last_name as candidate_name,s.name as stage,req.title as role FROM applications a JOIN candidates c ON c.id=a.candidate_id LEFT JOIN master_application_stages s ON s.id=a.stage_id JOIN job_requisitions req ON req.id=a.requisition_id WHERE a.id=%s",(aid,))
        return ok(r) if r else err("Not found",404)
    d=request.get_json()
    if d.get('stage'):
        st=row1("SELECT id FROM master_application_stages WHERE name=%s",(d['stage'],))
        if st: _cur().execute("UPDATE applications SET stage_id=%s,updated_at=NOW() WHERE id=%s",(st['id'],aid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/interviews', methods=['GET','POST'])
@require_auth
def interviews():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT i.*,f.name as format,c.first_name||' '||c.last_name as candidate_name,r.title as role,cl.name as client
            FROM interviews i JOIN applications a ON a.id=i.application_id JOIN candidates c ON c.id=a.candidate_id
            JOIN job_requisitions r ON r.id=a.requisition_id LEFT JOIN clients cl ON cl.id=r.client_id
            LEFT JOIN master_interview_formats f ON f.id=i.format_id ORDER BY i.scheduled_at"""))
    d=request.get_json()
    if not d.get('application_id'): return err("application_id is required")
    fmt=row1("SELECT id FROM master_interview_formats WHERE name=%s",(d.get('format','Video'),))
    cur=_cur()
    cur.execute("INSERT INTO interviews(application_id,round,format_id,interviewer,scheduled_at,location_link,notes) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (d['application_id'],d['round'],fmt['id'] if fmt else None,d.get('interviewer'),d.get('scheduled_at'),d.get('location_link'),d.get('notes')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Scheduled",201)

@app.route('/api/interviews/summary')
@require_auth
def int_summary():
    db=get_db()
    return ok({"scheduled_this_week":_scalar("SELECT COUNT(*) as c FROM interviews WHERE scheduled_at::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')"),
               "awaiting_feedback":_scalar("SELECT COUNT(*) as c FROM interviews WHERE scorecard_status='Pending'"),
               "overdue_feedback":_scalar("SELECT COUNT(*) as c FROM interviews WHERE scorecard_status='Overdue'"),
               "no_shows":_scalar("SELECT COUNT(*) as c FROM interviews WHERE decision='No Show'")})

@app.route('/api/interviews/<int:iid>', methods=['GET','PUT'])
@require_auth
def int_detail(iid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT i.*,f.name as format,
            c.first_name||' '||c.last_name as candidate_name,
            r.title as role,a.id as application_id
            FROM interviews i JOIN applications a ON a.id=i.application_id
            JOIN candidates c ON c.id=a.candidate_id
            JOIN job_requisitions r ON r.id=a.requisition_id
            LEFT JOIN master_interview_formats f ON f.id=i.format_id
            WHERE i.id=%s""",(iid,))
        return ok(r) if r else err("Not found",404)
    d=request.get_json()
    _cur().execute("UPDATE interviews SET scorecard_status=%s,decision=%s,notes=%s,interviewer=%s,scheduled_at=%s WHERE id=%s",
        (d.get('scorecard_status'),d.get('decision'),d.get('notes'),d.get('interviewer'),d.get('scheduled_at'),iid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/onboarding', methods=['GET','POST'])
@require_auth
def onboarding():
    db=get_db()
    if request.method=='GET':
        # Get employee-based onboardings
        emp_rows=rows("""SELECT o.*,t.name as template,'employee' as person_type,
            e.first_name||' '||e.last_name as person_name,e.emp_id,e.job_title,c.name as client_name
            FROM onboarding o JOIN employees e ON e.id=o.employee_id
            LEFT JOIN master_onboarding_templates t ON t.id=o.template_id
            LEFT JOIN clients c ON c.id=e.client_id WHERE o.status!='Completed'""")
        # Get candidate-based onboardings
        cand_rows=rows("""SELECT o.*,t.name as template,'candidate' as person_type,
            ca.first_name||' '||ca.last_name as person_name,NULL as emp_id,
            r.title as job_title,cl.name as client_name
            FROM onboarding o JOIN candidates ca ON ca.id=o.candidate_id
            LEFT JOIN master_onboarding_templates t ON t.id=o.template_id
            LEFT JOIN applications ap ON ap.candidate_id=ca.id
            LEFT JOIN job_requisitions r ON r.id=ap.requisition_id
            LEFT JOIN clients cl ON cl.id=r.client_id
            WHERE o.status!='Completed' AND o.candidate_id IS NOT NULL""")
        all_rows=emp_rows+cand_rows
        all_rows.sort(key=lambda x:(x.get('start_date') or ''))
        return ok(all_rows)
    d=request.get_json()
    # Support both employee_id and candidate_id
    emp_id=d.get('employee_id') or None
    cand_id=d.get('candidate_id') or None
    if not emp_id and not cand_id: return err("Either employee_id or candidate_id is required")
    # Migrate: add candidate_id column if missing
    try:
        _cur().execute("ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS candidate_id INTEGER REFERENCES candidates(id)")
        _cur().execute("ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS person_type TEXT DEFAULT 'employee'")
        _cur().execute("ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS vendor_id INTEGER")
        _cur().execute("ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS notes TEXT")
    except: pass
    tpl=row1("SELECT id FROM master_onboarding_templates WHERE name=%s",(d.get('template','Standard'),))
    cur=_cur()
    cur.execute("""INSERT INTO onboarding(employee_id,candidate_id,vendor_id,person_type,
        template_id,buddy_name,start_date,equipment,notes)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (emp_id,cand_id,d.get('vendor_id'),d.get('person_type','employee' if emp_id else 'candidate'),
         tpl['id'] if tpl else None,d.get('buddy_name'),d.get('start_date'),
         d.get('equipment'),d.get('notes')))
    ob_id=cur.fetchone()['id']
    # Create default tasks based on template type
    person_type=d.get('person_type','employee' if emp_id else 'candidate')
    if person_type=='candidate':
        tasks=[("Offer letter signed","Documents"),("Background check","Compliance"),
               ("Equipment provisioned","IT"),("System access setup","IT"),
               ("ID/Badge issued","Admin"),("Day 1 orientation","HR"),("30-day check-in","HR")]
    elif person_type=='vendor':
        tasks=[("NDA signed","Documents"),("System access setup","IT"),
               ("Tool/access provisioned","IT"),("Project briefing","HR"),("30-day check-in","HR")]
    else:
        tasks=[("Offer letter signed","Documents"),("Background check","Compliance"),
               ("Equipment provisioned","IT"),("System access setup","IT"),
               ("Benefits enrollment","HR"),("Day 1 orientation","HR"),
               ("30-day check-in","HR"),("60-day review","HR"),("90-day review","HR")]
    for task,cat in tasks:
        _cur().execute("INSERT INTO onboarding_tasks(onboarding_id,task_name,category) VALUES(%s,%s,%s)",(ob_id,task,cat))
    get_db().commit(); return ok({"id":ob_id},"Onboarding started",201)

@app.route('/api/onboarding/placed-candidates', methods=['GET'])
@require_auth
def placed_candidates():
    """Candidates who are Placed/Offer stage — ready to onboard."""
    return ok(rows("""SELECT DISTINCT c.id as candidate_id,
        c.first_name||' '||c.last_name as name,c.email,c.phone,
        c.current_title,r.title as role,cl.name as client_name,
        st.name as stage,a.id as application_id
        FROM applications a JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions r ON r.id=a.requisition_id
        LEFT JOIN clients cl ON cl.id=r.client_id
        LEFT JOIN master_application_stages st ON st.id=a.stage_id
        WHERE st.name IN ('Placed','Offer')
        AND NOT EXISTS (SELECT 1 FROM onboarding o WHERE o.candidate_id=c.id)
        ORDER BY c.first_name"""))

@app.route('/api/onboarding/<int:oid>', methods=['GET','PUT'])
@require_auth
def onb_detail(oid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT o.*,t.name as template,e.first_name||' '||e.last_name as employee_name FROM onboarding o JOIN employees e ON e.id=o.employee_id LEFT JOIN master_onboarding_templates t ON t.id=o.template_id WHERE o.id=%s",(oid,))
        if not r: return err("Not found",404)
        r['tasks']=rows("SELECT * FROM onboarding_tasks WHERE onboarding_id=%s ORDER BY id",(oid,))
        return ok(r)
    d=request.get_json()
    _cur().execute("UPDATE onboarding SET progress_pct=%s,status=%s,day30_status=%s,day60_status=%s,day90_status=%s WHERE id=%s",
        (d.get('progress_pct'),d.get('status'),d.get('day30_status'),d.get('day60_status'),d.get('day90_status'),oid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/onboarding/tasks/<int:tid>', methods=['PUT'])
@require_auth
def toggle_task(tid):
    db=get_db()
    complete=1 if request.get_json().get('is_complete') else 0
    _cur().execute("UPDATE onboarding_tasks SET is_complete=%s,completed_at=%s WHERE id=%s",(complete,datetime.utcnow() if complete else None,tid))
    r=row1("SELECT onboarding_id FROM onboarding_tasks WHERE id=%s",(tid,))
    if r:
        stats=row1("SELECT COUNT(*) as cnt,COALESCE(SUM(is_complete),0) as total FROM onboarding_tasks WHERE onboarding_id=%s",(r['onboarding_id'],))
        pct=round((stats['total'] or 0)/(stats['cnt'] or 1)*100) if stats else 0
        _cur().execute("UPDATE onboarding SET progress_pct=%s WHERE id=%s",(pct,r['onboarding_id']))
    get_db().commit(); return ok(msg="Updated")


# ═══════════════════════════════════════════════════
# PROJECTS
# ═══════════════════════════════════════════════════
def _bootstrap_projects():
    """Create projects table and related tables if they don't exist."""
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            project_code TEXT UNIQUE,
            name TEXT NOT NULL,
            short_name TEXT,
            project_type TEXT DEFAULT 'T&M',
            category TEXT,
            description TEXT,
            status TEXT DEFAULT 'Draft',
            priority TEXT DEFAULT 'Medium',
            confidentiality TEXT DEFAULT 'Internal',
            client_id INTEGER REFERENCES clients(id),
            account_manager_id INTEGER REFERENCES employees(id),
            project_manager_id INTEGER REFERENCES employees(id),
            department_id INTEGER REFERENCES departments(id),
            business_unit_id INTEGER REFERENCES business_units(id),
            cost_centre_id INTEGER REFERENCES cost_centres(id),
            start_date DATE,
            end_date DATE,
            go_live_date DATE,
            budget NUMERIC DEFAULT 0,
            budget_currency TEXT DEFAULT 'INR',
            estimated_revenue NUMERIC DEFAULT 0,
            actual_revenue NUMERIC DEFAULT 0,
            billing_type TEXT DEFAULT 'T&M',
            billing_cycle TEXT DEFAULT 'Monthly',
            rate_card TEXT,
            po_number TEXT,
            contract_value NUMERIC DEFAULT 0,
            sow_reference TEXT,
            health_score INTEGER DEFAULT 80,
            completion_pct INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS project_resources (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            employee_id INTEGER NOT NULL REFERENCES employees(id),
            role TEXT,
            allocation_pct INTEGER DEFAULT 100,
            bill_rate NUMERIC DEFAULT 0,
            cost_rate NUMERIC DEFAULT 0,
            start_date DATE,
            end_date DATE,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS project_vendors (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            vendor_id INTEGER NOT NULL REFERENCES vendors(id),
            role TEXT,
            contract_value NUMERIC DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS project_milestones (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            title TEXT NOT NULL,
            description TEXT,
            due_date DATE,
            completion_date DATE,
            status TEXT DEFAULT 'Pending',
            deliverable TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS project_risks (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            title TEXT NOT NULL,
            description TEXT,
            probability TEXT DEFAULT 'Medium',
            impact TEXT DEFAULT 'Medium',
            mitigation TEXT,
            status TEXT DEFAULT 'Open',
            owner_id INTEGER REFERENCES employees(id),
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS project_documents (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            doc_type TEXT,
            doc_name TEXT,
            file_data TEXT,
            file_size TEXT,
            mime_type TEXT,
            uploaded_by INTEGER REFERENCES employees(id),
            is_active INTEGER DEFAULT 1,
            uploaded_at TIMESTAMP DEFAULT NOW()
        );
        """)
        conn.close()
    except Exception as e:
        print(f"Projects bootstrap warning: {e}", flush=True)

_bootstrap_projects()

def _next_project_code():
    """Generate next project code like PROJ-0042."""
    try:
        n = _scalar("SELECT COUNT(*) as c FROM projects") or 0
        return f"PROJ-{(n+1):04d}"
    except:
        return f"PROJ-{__import__('random').randint(1000,9999)}"

@app.route('/api/projects', methods=['GET','POST'])
@require_auth
def projects():
    db=get_db()
    if request.method=='GET':
        status=request.args.get('status','')
        ptype=request.args.get('type','')
        client=request.args.get('client_id','')
        sql="""SELECT p.*,
            c.name as client_name,
            e.first_name||' '||e.last_name as pm_name,
            am.first_name||' '||am.last_name as account_manager_name,
            d.name as department_name,
            b.name as business_unit_name,
            cc.name as cost_centre_name,
            (SELECT COUNT(*) FROM project_resources pr WHERE pr.project_id=p.id AND pr.is_active=1) as resource_count,
            (SELECT COALESCE(SUM(t.total_hours),0) FROM timesheets t
             JOIN project_resources pr ON pr.employee_id=t.employee_id AND pr.project_id=p.id
             WHERE EXTRACT(MONTH FROM t.week_ending)=EXTRACT(MONTH FROM NOW())) as hours_mtd
            FROM projects p
            LEFT JOIN clients c ON c.id=p.client_id
            LEFT JOIN employees e ON e.id=p.project_manager_id
            LEFT JOIN employees am ON am.id=p.account_manager_id
            LEFT JOIN departments d ON d.id=p.department_id
            LEFT JOIN business_units b ON b.id=p.business_unit_id
            LEFT JOIN cost_centres cc ON cc.id=p.cost_centre_id
            WHERE p.is_active=1"""
        params=[]
        if status: sql+=" AND p.status=%s"; params.append(status)
        if ptype: sql+=" AND p.project_type=%s"; params.append(ptype)
        if client: sql+=" AND p.client_id=%s"; params.append(int(client))
        sql+=" ORDER BY p.updated_at DESC"
        return ok(rows(sql, params))
    d=request.get_json()
    if not d.get('project_code'):
        d['project_code']=_next_project_code()
    cur=_cur()
    cur.execute("""INSERT INTO projects(project_code,name,short_name,project_type,category,description,
        status,priority,confidentiality,client_id,account_manager_id,project_manager_id,
        department_id,business_unit_id,cost_centre_id,start_date,end_date,go_live_date,
        budget,budget_currency,estimated_revenue,billing_type,billing_cycle,
        rate_card,po_number,contract_value,sow_reference,health_score,completion_pct)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['project_code'],d['name'],d.get('short_name'),d.get('project_type','T&M'),d.get('category'),
         d.get('description'),d.get('status','Draft'),d.get('priority','Medium'),
         d.get('confidentiality','Internal'),d.get('client_id'),d.get('account_manager_id'),
         d.get('project_manager_id'),d.get('department_id'),d.get('business_unit_id'),
         d.get('cost_centre_id'),d.get('start_date') or None,d.get('end_date') or None,
         d.get('go_live_date') or None,d.get('budget',0),d.get('budget_currency','INR'),
         d.get('estimated_revenue',0),d.get('billing_type','T&M'),d.get('billing_cycle','Monthly'),
         d.get('rate_card'),d.get('po_number'),d.get('contract_value',0),d.get('sow_reference'),
         d.get('health_score',80),d.get('completion_pct',0)))
    pid=cur.fetchone()['id']
    log("projects",pid,"created",f"Project '{d['name']}' created",g.user.get('username'))
    get_db().commit(); return ok({"id":pid,"project_code":d['project_code']},"Project created",201)

@app.route('/api/projects/<int:pid>', methods=['GET','PUT','DELETE'])
@require_auth
def project_detail(pid):
    db=get_db()
    if request.method=='GET':
        p=row1("""SELECT p.*,c.name as client_name,
            pm.first_name||' '||pm.last_name as pm_name,
            am.first_name||' '||am.last_name as account_manager_name,
            d.name as department_name,b.name as business_unit_name,
            cc.name as cost_centre_name, cc.code as cost_centre_code
            FROM projects p LEFT JOIN clients c ON c.id=p.client_id
            LEFT JOIN employees pm ON pm.id=p.project_manager_id
            LEFT JOIN employees am ON am.id=p.account_manager_id
            LEFT JOIN departments d ON d.id=p.department_id
            LEFT JOIN business_units b ON b.id=p.business_unit_id
            LEFT JOIN cost_centres cc ON cc.id=p.cost_centre_id
            WHERE p.id=%s""",(pid,))
        if not p: return err("Not found",404)
        p['resources']=rows("""SELECT pr.*,e.first_name||' '||e.last_name as employee_name,
            e.emp_id,e.job_title,d.name as department_name
            FROM project_resources pr JOIN employees e ON e.id=pr.employee_id
            LEFT JOIN departments d ON d.id=e.department_id
            WHERE pr.project_id=%s AND pr.is_active=1 ORDER BY pr.created_at""",(pid,))
        p['vendors']=rows("""SELECT pv.*,v.name as vendor_name,v.vendor_type,v.contact_email
            FROM project_vendors pv JOIN vendors v ON v.id=pv.vendor_id
            WHERE pv.project_id=%s AND pv.is_active=1""",(pid,))
        p['milestones']=rows("SELECT * FROM project_milestones WHERE project_id=%s AND is_active=1 ORDER BY due_date",(pid,))
        p['risks']=rows("""SELECT pr.*,e.first_name||' '||e.last_name as owner_name
            FROM project_risks pr LEFT JOIN employees e ON e.id=pr.owner_id
            WHERE pr.project_id=%s AND pr.is_active=1""",(pid,))
        p['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM project_documents WHERE project_id=%s AND is_active=1 ORDER BY uploaded_at DESC",(pid,))
        # Timesheet summary
        p['hours_mtd']=_scalar("SELECT COALESCE(SUM(t.total_hours),0) FROM timesheets t JOIN project_resources pr ON pr.employee_id=t.employee_id AND pr.project_id=%s WHERE EXTRACT(MONTH FROM t.week_ending)=EXTRACT(MONTH FROM NOW())",(pid,)) or 0
        p['hours_total']=_scalar("SELECT COALESCE(SUM(t.total_hours),0) FROM timesheets t JOIN project_resources pr ON pr.employee_id=t.employee_id AND pr.project_id=%s",(pid,)) or 0
        return ok(p)
    if request.method=='PUT':
        d=request.get_json()
        _cur().execute("""UPDATE projects SET name=%s,short_name=%s,project_type=%s,category=%s,
            description=%s,status=%s,priority=%s,confidentiality=%s,client_id=%s,
            account_manager_id=%s,project_manager_id=%s,department_id=%s,business_unit_id=%s,
            cost_centre_id=%s,start_date=%s,end_date=%s,go_live_date=%s,budget=%s,
            budget_currency=%s,estimated_revenue=%s,billing_type=%s,billing_cycle=%s,
            rate_card=%s,po_number=%s,contract_value=%s,sow_reference=%s,
            health_score=%s,completion_pct=%s,updated_at=NOW() WHERE id=%s""",
            (d['name'],d.get('short_name'),d.get('project_type','T&M'),d.get('category'),
             d.get('description'),d.get('status','Active'),d.get('priority','Medium'),
             d.get('confidentiality','Internal'),d.get('client_id'),d.get('account_manager_id'),
             d.get('project_manager_id'),d.get('department_id'),d.get('business_unit_id'),
             d.get('cost_centre_id'),d.get('start_date') or None,d.get('end_date') or None,
             d.get('go_live_date') or None,d.get('budget',0),d.get('budget_currency','INR'),
             d.get('estimated_revenue',0),d.get('billing_type','T&M'),d.get('billing_cycle','Monthly'),
             d.get('rate_card'),d.get('po_number'),d.get('contract_value',0),d.get('sow_reference'),
             d.get('health_score',80),d.get('completion_pct',0),pid))
        db.commit(); return ok(msg="Updated")
    # DELETE
    _cur().execute("UPDATE projects SET is_active=0 WHERE id=%s",(pid,))
    db.commit(); return ok(msg="Archived")

# Project Resources
@app.route('/api/projects/<int:pid>/resources', methods=['POST'])
@require_auth
def project_add_resource(pid):
    d=request.get_json()
    cur=_cur()
    cur.execute("""INSERT INTO project_resources(project_id,employee_id,role,allocation_pct,bill_rate,cost_rate,start_date,end_date)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (pid,d['employee_id'],d.get('role'),d.get('allocation_pct',100),
         d.get('bill_rate',0),d.get('cost_rate',0),
         d.get('start_date') or None,d.get('end_date') or None))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Resource added",201)

@app.route('/api/projects/resources/<int:rid>', methods=['PUT','DELETE'])
@require_auth
def project_resource_detail(rid):
    if request.method=='DELETE':
        _cur().execute("UPDATE project_resources SET is_active=0 WHERE id=%s",(rid,))
    else:
        d=request.get_json()
        _cur().execute("UPDATE project_resources SET role=%s,allocation_pct=%s,bill_rate=%s,cost_rate=%s,end_date=%s WHERE id=%s",
            (d.get('role'),d.get('allocation_pct',100),d.get('bill_rate',0),d.get('cost_rate',0),d.get('end_date') or None,rid))
    get_db().commit(); return ok(msg="Done")

# Project Vendors
@app.route('/api/projects/<int:pid>/vendors', methods=['POST'])
@require_auth
def project_add_vendor(pid):
    d=request.get_json()
    cur=_cur()
    cur.execute("INSERT INTO project_vendors(project_id,vendor_id,role,contract_value) VALUES(%s,%s,%s,%s) RETURNING id",
        (pid,d['vendor_id'],d.get('role'),d.get('contract_value',0)))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Vendor added",201)

@app.route('/api/projects/vendors/<int:rid>', methods=['DELETE'])
@require_auth
def project_vendor_detail(rid):
    _cur().execute("UPDATE project_vendors SET is_active=0 WHERE id=%s",(rid,))
    get_db().commit(); return ok(msg="Removed")

# Project Milestones
@app.route('/api/projects/<int:pid>/milestones', methods=['POST'])
@require_auth
def project_add_milestone(pid):
    d=request.get_json()
    cur=_cur()
    cur.execute("INSERT INTO project_milestones(project_id,title,description,due_date,deliverable,status) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
        (pid,d['title'],d.get('description'),d.get('due_date') or None,d.get('deliverable'),d.get('status','Pending')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Milestone added",201)

@app.route('/api/projects/milestones/<int:mid>', methods=['PUT','DELETE'])
@require_auth
def project_milestone_detail(mid):
    if request.method=='DELETE':
        _cur().execute("UPDATE project_milestones SET is_active=0 WHERE id=%s",(mid,))
    else:
        d=request.get_json()
        _cur().execute("UPDATE project_milestones SET title=%s,description=%s,due_date=%s,completion_date=%s,status=%s,deliverable=%s WHERE id=%s",
            (d['title'],d.get('description'),d.get('due_date') or None,d.get('completion_date') or None,d.get('status','Pending'),d.get('deliverable'),mid))
    get_db().commit(); return ok(msg="Done")

# Project Documents
@app.route('/api/projects/<int:pid>/documents', methods=['POST'])
@require_auth
def project_add_doc(pid):
    d=request.get_json()
    cur=_cur()
    cur.execute("INSERT INTO project_documents(project_id,doc_type,doc_name,file_data,file_size,mime_type,uploaded_by) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (pid,d.get('doc_type','General'),d.get('doc_name'),d.get('file_data'),d.get('file_size'),d.get('mime_type'),g.user.get('employee_id')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Uploaded",201)

@app.route('/api/projects/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
def project_doc_detail(did):
    if request.method=='DELETE':
        _cur().execute("UPDATE project_documents SET is_active=0 WHERE id=%s",(did,))
        get_db().commit(); return ok(msg="Removed")
    r=row1("SELECT * FROM project_documents WHERE id=%s",(did,))
    return ok(r) if r else err("Not found",404)

# Project Risks
@app.route('/api/projects/<int:pid>/risks', methods=['POST'])
@require_auth
def project_add_risk(pid):
    d=request.get_json()
    cur=_cur()
    cur.execute("INSERT INTO project_risks(project_id,title,description,probability,impact,mitigation,status,owner_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (pid,d['title'],d.get('description'),d.get('probability','Medium'),d.get('impact','Medium'),d.get('mitigation'),d.get('status','Open'),d.get('owner_id')))
    get_db().commit(); return ok({"id":cur.fetchone()['id']},"Risk added",201)

@app.route('/api/projects/risks/<int:rid>', methods=['PUT','DELETE'])
@require_auth
def project_risk_detail(rid):
    if request.method=='DELETE':
        _cur().execute("UPDATE project_risks SET is_active=0 WHERE id=%s",(rid,))
    else:
        d=request.get_json()
        _cur().execute("UPDATE project_risks SET title=%s,description=%s,probability=%s,impact=%s,mitigation=%s,status=%s,owner_id=%s WHERE id=%s",
            (d['title'],d.get('description'),d.get('probability','Medium'),d.get('impact','Medium'),d.get('mitigation'),d.get('status','Open'),d.get('owner_id'),rid))
    get_db().commit(); return ok(msg="Done")



# ═══════════════════════════════════════════════════
# INVOICES
# ═══════════════════════════════════════════════════
@app.route('/api/invoices', methods=['GET','POST'])
@require_auth
def invoices():
    db=get_db()
    if request.method=='GET':
        status=request.args.get('status','')
        sql="""SELECT i.*,c.name as client_name,s.name as status,ct.name as invoice_type,
            (CURRENT_DATE - i.due_date::date) as days_overdue
            FROM invoices i JOIN clients c ON c.id=i.client_id
            LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
            LEFT JOIN master_contract_types ct ON ct.id=i.contract_type_id WHERE 1=1"""
        params=[]
        emp_filter=request.args.get('employee_id')
        if emp_filter: sql+=" AND t.employee_id=%s"; params.append(int(emp_filter))
        elif g.user.get('role_name')=='Employee' and g.user.get('employee_id'):
            sql+=" AND t.employee_id=%s"; params.append(g.user['employee_id'])
        if status: sql+=" AND s.name=%s"; params.append(status)
        sql+=" ORDER BY i.created_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    last=row1("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1")
    num=int(last['invoice_number'].split('-')[1])+1 if last else 1001
    inv_num=f"INV-{num}"
    st=_scalar("SELECT id FROM master_invoice_statuses WHERE name='Draft'")
    cur=_cur();cur.execute("INSERT INTO invoices(invoice_number,client_id,contract_type_id,period_start,period_end,amount,tax_amount,due_date,po_number,notes,status_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (inv_num,d['client_id'],d.get('contract_type_id'),d.get('period_start'),d.get('period_end'),d.get('amount',0),d.get('tax_amount',0),d.get('due_date'),d.get('po_number'),d.get('notes'),st))

    inv_id = cur.fetchone()['id']
    log("invoices",inv_id,"created",f"Invoice {inv_num} created",g.user.get('username'))
    return ok({"id":inv_id,"invoice_number":inv_num},"Created",201)

@app.route('/api/invoices/summary')
@require_auth
def inv_summary():
    db=get_db()
    def q(sql): return _scalar(sql)
    total=q("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE TO_CHAR(created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')")
    paid=q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Paid' AND TO_CHAR(i.created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')")
    outstd=q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name IN ('Sent','Overdue')")
    overdue=q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue'")
    return ok({"total_invoiced":total,"paid":paid,"outstanding":outstd,"overdue":overdue,
               "ar_aging":{
                   "current":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Sent' AND (CURRENT_DATE - i.due_date::date)<0"),
                   "d30_60":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue' AND (CURRENT_DATE - i.due_date::date) BETWEEN 0 AND 30"),
                   "d60_90":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue' AND (CURRENT_DATE - i.due_date::date) BETWEEN 30 AND 60"),
                   "d90_plus":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue' AND (CURRENT_DATE - i.due_date::date)>60"),
               }})

@app.route('/api/invoices/<int:iid>', methods=['GET','PUT'])
@require_auth
def inv_detail(iid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT i.*,c.name as client_name,s.name as status FROM invoices i JOIN clients c ON c.id=i.client_id LEFT JOIN master_invoice_statuses s ON s.id=i.status_id WHERE i.id=%s",(iid,))
        return ok(r) if r else err("Not found",404)
    d=request.get_json()
    if d.get('status'):
        st=row1("SELECT id FROM master_invoice_statuses WHERE name=%s",(d['status'],))
        if st: _cur().execute("UPDATE invoices SET status_id=%s,updated_at=NOW() WHERE id=%s",(st['id'],iid))
    if d.get('paid_date'): _cur().execute("UPDATE invoices SET paid_date=%s,payment_ref=%s WHERE id=%s",(d['paid_date'],d.get('payment_ref'),iid))
    if d.get('notes'): _cur().execute("UPDATE invoices SET notes=%s WHERE id=%s",(d['notes'],iid))

    if d.get('status')=='Paid':
        r=row1("SELECT invoice_number,amount FROM invoices WHERE id=%s",(iid,))
        if r: log("invoices",iid,"paid",f"Invoice {r['invoice_number']} paid",g.user.get('username','System'))
    return ok(msg="Updated")

# ═══════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════
@app.route('/api/reports/financial')
@require_auth
def rpt_financial():
    db=get_db()
    trend=rows("""SELECT TO_CHAR(i.created_at, 'YYYY-MM') as month,TO_CHAR(i.created_at, 'Mon') as label,
        COALESCE(SUM(i.amount),0) as revenue,
        COALESCE(SUM(CASE WHEN s.name='Paid' THEN i.amount ELSE 0 END),0) as collected
        FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id
        GROUP BY TO_CHAR(i.created_at, 'YYYY-MM'),TO_CHAR(i.created_at, 'Mon') ORDER BY month DESC LIMIT 6""")
    trend.reverse()
    client_rev=rows("SELECT c.name,COALESCE(SUM(i.amount),0) as revenue FROM clients c LEFT JOIN invoices i ON i.client_id=c.id WHERE c.is_active=1 GROUP BY c.id,c.name ORDER BY revenue DESC LIMIT 8")
    rev_mtd=_scalar("SELECT COALESCE(SUM(amount),0) as v FROM invoices WHERE TO_CHAR(created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')")
    payroll_mtd=_scalar("SELECT COALESCE(SUM(gross_amount),0) as v FROM payroll_runs WHERE status IN ('Processing','Completed') AND TO_CHAR('%Y-%m',run_date)=TO_CHAR(NOW(), 'YYYY-MM')")
    return ok({"trend":trend,"client_revenue":client_rev,"revenue_mtd":rev_mtd,"payroll_mtd":payroll_mtd,"gross_margin":round((rev_mtd-payroll_mtd)/rev_mtd*100,1) if rev_mtd else 0})

@app.route('/api/reports/recruiter')
@require_auth
def rpt_recruiter():
    return ok(rows("""SELECT e.id,e.first_name||' '||e.last_name as name,COUNT(a.id) as total_apps,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) as hires,
        SUM(CASE WHEN s.name IN ('Technical','Offer','Placed') THEN 1 ELSE 0 END) as interviews,
        ROUND(AVG(CASE WHEN r.filled_date IS NOT NULL THEN (r.filled_date::date - r.opened_date::date) END),1) as avg_ttf
        FROM employees e JOIN applications a ON a.recruiter_id=e.id
        JOIN master_application_stages s ON s.id=a.stage_id
        JOIN job_requisitions r ON r.id=a.requisition_id
        GROUP BY e.id,e.first_name,e.last_name ORDER BY hires DESC"""))

@app.route('/api/reports/applicants')
@require_auth
def rpt_applicants():
    by_rec=rows("""SELECT e.first_name||' '||e.last_name as recruiter,COUNT(a.id) as total,
        SUM(CASE WHEN s.name='Screening' THEN 1 ELSE 0 END) as screened,
        SUM(CASE WHEN s.name IN ('Technical','Offer','Placed') THEN 1 ELSE 0 END) as interviewed,
        SUM(CASE WHEN s.name IN ('Offer','Placed') THEN 1 ELSE 0 END) as offered,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) as hired
        FROM applications a LEFT JOIN employees e ON e.id=a.recruiter_id
        JOIN master_application_stages s ON s.id=a.stage_id GROUP BY a.recruiter_id,e.first_name,e.last_name ORDER BY hired DESC""")
    by_src=rows("""SELECT cs.name as source,COUNT(*) as total,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) as hired,
        ROUND(SUM(CASE WHEN s.name='Placed' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) as hire_rate
        FROM applications a JOIN candidates c ON c.id=a.candidate_id
        LEFT JOIN master_candidate_sources cs ON cs.id=c.source_id
        JOIN master_application_stages s ON s.id=a.stage_id GROUP BY c.source_id,cs.name ORDER BY hire_rate DESC""")
    return ok({"by_recruiter":by_rec,"by_source":by_src})

@app.route('/api/reports/clients')
@require_auth
def rpt_clients():
    return ok(rows("""SELECT c.*,ct.name as contract_type,
        (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id) as total_revenue,
        (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND TO_CHAR(i.created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')) as revenue_mtd,
        (SELECT COUNT(*) FROM employees e WHERE e.client_id=c.id AND e.status='Active') as active_placements,
        (SELECT COUNT(*) FROM job_requisitions r WHERE r.client_id=c.id AND r.status='Active') as open_reqs,
        e.first_name||' '||e.last_name as account_manager_name
        FROM clients c LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
        LEFT JOIN employees e ON e.id=c.account_manager_id
        WHERE c.is_active=1 ORDER BY total_revenue DESC"""))

@app.route('/api/reports/vendors')
@require_auth
def rpt_vendors():
    return ok(rows("""SELECT v.*,vc.name as category,
        CASE WHEN v.sla_score>=90 THEN 'Compliant' WHEN v.sla_score>=80 THEN 'Watch' ELSE 'Breach' END as compliance_status
        FROM vendors v LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
        WHERE v.is_active=1 ORDER BY v.sla_score DESC"""))

@app.route('/api/reports/workforce')
@require_auth
def rpt_workforce():
    by_dept=rows("""SELECT d.name,COUNT(e.id) as headcount,
        SUM(CASE WHEN et.name='Full-Time' THEN 1 ELSE 0 END) as fte,
        SUM(CASE WHEN et.name LIKE 'Contractor%' THEN 1 ELSE 0 END) as contractors
        FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.status IN ('Active','Onboarding')
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        WHERE d.is_active=1 GROUP BY d.id,d.name ORDER BY headcount DESC""")
    totals=row1("""SELECT COUNT(*) as total,
        SUM(CASE WHEN et.name='Full-Time' THEN 1 ELSE 0 END) as fte,
        SUM(CASE WHEN et.name LIKE 'Contractor%' THEN 1 ELSE 0 END) as contractors,
        SUM(CASE WHEN e.status='Onboarding' THEN 1 ELSE 0 END) as onboarding
        FROM employees e LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        WHERE e.status IN ('Active','Onboarding')""")
    return ok({"by_department":by_dept,"totals":totals or {}})

# ═══════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════
@app.route('/api/dashboard')
@require_auth
def dashboard():
    db=get_db()
    emp_count=_scalar("SELECT COUNT(*) as c FROM employees WHERE status IN ('Active','Onboarding')")
    open_reqs=_scalar("SELECT COUNT(*) as c FROM job_requisitions WHERE status='Active'")
    rev_mtd=_scalar("SELECT COALESCE(SUM(amount),0) as v FROM invoices WHERE TO_CHAR(created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')")
    pending_inv=_scalar("SELECT COALESCE(SUM(amount),0) as v FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name IN ('Sent','Overdue')")
    funnel={}
    for r in rows("SELECT s.name,COUNT(a.id) as cnt FROM master_application_stages s LEFT JOIN applications a ON a.stage_id=s.id GROUP BY s.id,s.name ORDER BY s.sort_order"):
        funnel[r['name']]=r['cnt']
    top_rec=rows("""SELECT e.first_name||' '||e.last_name as name,COUNT(a.id) as hires
        FROM applications a JOIN employees e ON e.id=a.recruiter_id
        JOIN master_application_stages s ON s.id=a.stage_id WHERE s.name='Placed'
        GROUP BY a.recruiter_id,e.first_name,e.last_name ORDER BY hires DESC LIMIT 5""")
    client_rev=rows("""SELECT c.name,COALESCE(SUM(i.amount),0) as revenue
        FROM clients c LEFT JOIN invoices i ON i.client_id=c.id AND TO_CHAR(i.created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')
        WHERE c.is_active=1 GROUP BY c.id,c.name ORDER BY revenue DESC LIMIT 6""")
    urgent=rows("""SELECT r.id,r.title,c.name as client,p.name as priority,
        (CURRENT_DATE - r.opened_date::date) as days_open
        FROM job_requisitions r JOIN clients c ON c.id=r.client_id
        JOIN master_priority_levels p ON p.id=r.priority_id
        WHERE r.status='Active' ORDER BY p.sort_order,days_open DESC LIMIT 6""")
    activity=rows("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10")
    trend=rows("""SELECT TO_CHAR(created_at, 'Mon') as label,TO_CHAR(created_at, 'YYYY-MM') as month,
        COALESCE(SUM(amount),0) as revenue,
        COALESCE(SUM(CASE WHEN s.name='Paid' THEN i.amount ELSE 0 END),0) as collected
        FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id
        GROUP BY TO_CHAR(i.created_at, 'YYYY-MM'),TO_CHAR(i.created_at, 'Mon') ORDER BY month DESC LIMIT 6""")
    trend.reverse()
    return ok({"kpis":{"active_employees":emp_count,"open_requisitions":open_reqs,"revenue_mtd":rev_mtd,"pending_invoices":pending_inv},
               "funnel":funnel,"top_recruiters":top_rec,"client_revenue":client_rev,
               "urgent_requisitions":urgent,"activity":activity,"revenue_trend":trend})

# ═══════════════════════════════════════════════════
# SOURCING, SEARCH, LOOKUPS, ACTIVITY
# ═══════════════════════════════════════════════════
@app.route('/api/sourcing/stats')
@require_auth
def sourcing_stats():
    return ok(rows("""SELECT cs.name as source,COUNT(*) as total,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) as hired,
        ROUND(SUM(CASE WHEN s.name='Placed' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) as hire_rate
        FROM candidates c LEFT JOIN master_candidate_sources cs ON cs.id=c.source_id
        LEFT JOIN applications a ON a.candidate_id=c.id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        GROUP BY c.source_id,cs.name ORDER BY total DESC"""))

@app.route('/api/search')
@require_auth
def search():
    q=request.args.get('q','').strip()
    if len(q)<2: return ok([])
    like=f'%{q}%'
    results=[]
    results+=rows("SELECT id,'employee' as type,first_name||' '||last_name as label,job_title as sub FROM employees WHERE (first_name||' '||last_name LIKE %s OR emp_id LIKE %s) AND status='Active' LIMIT 4",(like,like))
    results+=rows("SELECT id,'client' as type,name as label,industry as sub FROM clients WHERE name LIKE %s AND is_active=1 LIMIT 4",(like,))
    results+=rows("SELECT id,'candidate' as type,first_name||' '||last_name as label,current_title as sub FROM candidates WHERE first_name||' '||last_name LIKE %s AND is_active=1 LIMIT 4",(like,))
    results+=rows("SELECT r.id,'requisition' as type,r.title as label,c.name as sub FROM job_requisitions r JOIN clients c ON c.id=r.client_id WHERE r.title LIKE %s AND r.status='Active' LIMIT 4",(like,))
    return ok(results)

@app.route('/api/activity')
@require_auth
def activity():
    limit=request.args.get('limit',20)
    return ok(rows("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT %s",(limit,)))

@app.route('/api/lookup/employees')
@require_auth
def lu_employees():
    return ok(rows("SELECT id,first_name||' '||last_name as name,emp_id,job_title FROM employees WHERE status='Active' ORDER BY first_name"))

@app.route('/api/lookup/clients')
@require_auth
def lu_clients():
    return ok(rows("SELECT id,name,currency FROM clients WHERE is_active=1 ORDER BY name"))

@app.route('/api/lookup/departments')
@require_auth
def lu_departments():
    return ok(rows("SELECT id,name FROM departments WHERE is_active=1 ORDER BY name"))

@app.route('/api/lookup/business-units')
@require_auth
def lu_business_units():
    return ok(rows("SELECT id,name FROM business_units WHERE is_active=1 ORDER BY name"))

@app.route('/api/lookup/cost-centres')
@require_auth
def lu_cost_centres():
    return ok(rows("SELECT id,code,name FROM cost_centres WHERE is_active=1 ORDER BY code"))

@app.route('/api/health')
def health():
    db_status = "disconnected"
    table_count = 0
    try:
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as c FROM pg_tables WHERE schemaname='public'")
        table_count = cur.fetchone()['c']
        conn.close()
        db_status = f"postgresql:{table_count}_tables"
    except Exception as e:
        db_status = f"error:{str(e)[:100]}"
    return ok({"status":"ok","app":"McHR&TA v4","db":db_status,"tables":table_count})

@app.route('/api/admin/schema-debug')
def schema_debug():
    """Debug endpoint — shows schema creation status"""
    try:
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()

        # What tables exist?
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
        existing = [r['tablename'] for r in cur.fetchall()]

        # Find schema.sql
        schema_paths = [
            os.path.join(BASE_DIR,'..','db','schema.sql'),
            os.path.join(BASE_DIR,'db','schema.sql'),
            os.path.join('/app','db','schema.sql'),
        ]
        found_schema = None
        for p in schema_paths:
            if os.path.exists(p):
                found_schema = p
                break

        schema_info = {}
        if found_schema:
            with open(found_schema) as f:
                sql = f.read()
            stmts = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--') and len(s.strip()) > 10]
            schema_info = {"path": found_schema, "statements": len(stmts), "size": len(sql),
                          "first_stmt": stmts[0][:100] if stmts else "none",
                          "note": "Use /api/admin/reset-db to apply schema"}
        else:
            schema_info = {"error": "schema.sql not found", "searched": schema_paths}

        # List /app directory
        app_files = []
        for root, dirs, files in os.walk('/app'):
            for f in files:
                if f.endswith('.sql') or f.endswith('.py'):
                    app_files.append(os.path.join(root, f))
            if len(app_files) > 20:
                break

        conn.close()
        return jsonify({
            "existing_tables": existing,
            "table_count": len(existing),
            "schema": schema_info,
            "app_files": app_files[:20]
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

# ═══════════════════════════════════════════════════
# BULK EXPORT
# ═══════════════════════════════════════════════════
import csv, io

@app.route('/api/export/<entity>')
@require_auth
def export_entity(entity):
    db = get_db()
    exports = {
        'employees': {
            'sql': '''SELECT e.emp_id, e.first_name, e.middle_name, e.last_name,
                e.email, e.phone, e.personal_email, e.personal_phone,
                e.job_title, d.name as department, et.name as employment_type,
                e.location, e.salary, e.bill_rate,
                e.billable, e.billable_amount,
                rm.first_name||' '||rm.last_name as reporting_manager,
                c.name as client, e.status, e.start_date,
                e.pan, e.pf_number, e.esi_number,
                e.bank_name, e.bank_account_number, e.bank_ifsc,
                e.referred_by, e.rating, e.created_at
                FROM employees e
                LEFT JOIN departments d ON d.id=e.department_id
                LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
                LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
                LEFT JOIN clients c ON c.id=e.client_id
                WHERE e.is_active=1 ORDER BY e.emp_id''',
            'filename': 'employees'
        },
        'clients': {
            'sql': '''SELECT c.name, c.industry, ct.name as contract_type,
                c.currency, pt.name as payment_terms, c.status, c.rating,
                c.primary_contact, c.primary_contact_designation,
                c.contact_email, c.contact_phone,
                c.billing_contact_name, c.billing_contact_designation,
                c.billing_contact_email, c.billing_contact_phone,
                c.address_line1, c.address_line2, c.city,
                s.name as state, c.pincode, co.name as country,
                c.gstin, c.pan,
                am.first_name||' '||am.last_name as account_manager,
                c.health_score, c.referred_by, c.created_at
                FROM clients c
                LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
                LEFT JOIN master_payment_terms pt ON pt.id=c.payment_terms_id
                LEFT JOIN master_states s ON s.id=c.state_id
                LEFT JOIN master_countries co ON co.id=c.country_id
                LEFT JOIN employees am ON am.id=c.account_manager_id
                WHERE c.is_active=1 ORDER BY c.name''',
            'filename': 'clients'
        },
        'vendors': {
            'sql': '''SELECT v.name, vc.name as category, v.status, v.rating,
                v.primary_contact, v.primary_contact_designation,
                v.contact_email, v.contact_phone,
                v.address_line1, v.address_line2, v.city,
                s.name as state, v.pincode, co.name as country,
                v.gstin, v.pan,
                am.first_name||' '||am.last_name as account_manager,
                v.bank_name, v.bank_account_number, v.bank_ifsc,
                v.contract_end, v.sla_score, v.spend_mtd,
                v.referred_by, v.created_at
                FROM vendors v
                LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
                LEFT JOIN master_states s ON s.id=v.state_id
                LEFT JOIN master_countries co ON co.id=v.country_id
                LEFT JOIN employees am ON am.id=v.account_manager_id
                WHERE v.is_active=1 ORDER BY v.name''',
            'filename': 'vendors'
        },
        'timesheets': {
            'sql': '''SELECT e.emp_id, e.first_name||' '||e.last_name as employee,
                c.name as client, t.project, t.week_ending,
                t.regular_hours, t.overtime_hours, t.total_hours,
                t.bill_rate, t.estimated_revenue,
                s.name as status, t.submitted_at, t.approved_at
                FROM timesheets t
                JOIN employees e ON e.id=t.employee_id
                LEFT JOIN clients c ON c.id=t.client_id
                LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
                ORDER BY t.week_ending DESC, e.emp_id''',
            'filename': 'timesheets'
        },
        'payroll': {
            'sql': '''SELECT e.emp_id, e.first_name||' '||e.last_name as employee,
                d.name as department, et.name as employment_type,
                pe.month, pe.ctc, pe.basic, pe.hra,
                pe.medical_allowance, pe.special_allowance,
                pe.other_allowances, pe.incentive,
                pe.lop_days, pe.lop_amount, pe.total_earnings,
                pe.profession_tax, pe.pf_employee, pe.pf_employer,
                pe.medical_insurance, pe.tds,
                pe.esi_employee, pe.esi_employer,
                pe.other_deductions, pe.total_deductions, pe.net_salary
                FROM payroll_entries pe
                JOIN employees e ON e.id=pe.employee_id
                LEFT JOIN departments d ON d.id=e.department_id
                LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
                ORDER BY pe.month DESC, e.emp_id''',
            'filename': 'payroll'
        },
        'invoices': {
            'sql': '''SELECT i.invoice_number, c.name as client,
                ct.name as type, i.period_start, i.period_end,
                i.amount, i.tax_amount, i.total_amount,
                i.due_date, i.paid_date, i.payment_ref,
                s.name as status, i.po_number, i.notes, i.created_at
                FROM invoices i
                JOIN clients c ON c.id=i.client_id
                LEFT JOIN master_contract_types ct ON ct.id=i.contract_type_id
                LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
                ORDER BY i.created_at DESC''',
            'filename': 'invoices'
        },
        'candidates': {
            'sql': '''SELECT c.first_name, c.last_name, c.email, c.phone,
                c.location, c.current_title, c.years_exp,
                cs.name as source, c.skills,
                s.name as latest_stage,
                r.title as latest_role,
                cl.name as client,
                c.created_at
                FROM candidates c
                LEFT JOIN master_candidate_sources cs ON cs.id=c.source_id
                LEFT JOIN applications a ON a.candidate_id=c.id
                  AND a.id=(SELECT MAX(id) FROM applications WHERE candidate_id=c.id)
                LEFT JOIN master_application_stages s ON s.id=a.stage_id
                LEFT JOIN job_requisitions r ON r.id=a.requisition_id
                LEFT JOIN clients cl ON cl.id=r.client_id
                WHERE c.is_active=1 ORDER BY c.created_at DESC''',
            'filename': 'candidates'
        },
    }

    if entity not in exports:
        return err(f"Unknown export: {entity}. Available: {', '.join(exports.keys())}", 404)

    cfg = exports[entity]
    cursor = _cur()
    cursor.execute(cfg['sql'])
    data = cursor.fetchall()
    if not data:
        return err("No data to export", 404)

    # Build CSV - PG returns RealDictRow
    output = io.StringIO()
    writer = csv.writer(output)
    headers = list(data[0].keys()) if data else []
    writer.writerow(headers)
    writer.writerows([[row[h] for h in headers] for row in data])

    from flask import Response
    from datetime import datetime
    filename = f"{cfg['filename']}_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename={filename}'}
    )

@app.route('/api/export/all')
@require_auth
def export_all():
    import zipfile, io as _io
    db = get_db()
    entities = ['employees','clients','vendors','timesheets','payroll','invoices','candidates']

    zip_buf = _io.BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for entity in entities:
            try:
                from flask import current_app
                with current_app.test_request_context():
                    resp = export_entity(entity)
                    if hasattr(resp, 'get_data'):
                        zf.writestr(f'{entity}.csv', resp.get_data(as_text=True))
            except Exception as e:
                zf.writestr(f'{entity}_error.txt', str(e))

    zip_buf.seek(0)
    from flask import Response
    from datetime import datetime
    filename = f"mchrta_export_{datetime.now().strftime('%Y%m%d_%H%M')}.zip"
    return Response(
        zip_buf.read(),
        mimetype='application/zip',
        headers={'Content-Disposition': f'attachment; filename={filename}'}
    )

# ═══════════════════════════════════════════════════
# RESET (remove after stabilisation)
# ═══════════════════════════════════════════════════
@app.route('/api/admin/reset-db', methods=['GET','POST'])
def reset_db():
    secret = request.args.get('secret','') or request.headers.get('X-Reset-Secret','')
    if secret != 'mchrta-reset-2026':
        return """<html><body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
            <h2>McHR&TA - Database Reset</h2>
            <form method="GET"><input type="hidden" name="secret" value="mchrta-reset-2026">
            <button type="submit" style="background:#2d8f3e;color:#fff;padding:12px 24px;border:none;border-radius:6px;font-size:16px;cursor:pointer">Reset Database</button></form>
        </body></html>"""
    if not _reset_status["running"]:
        t = threading.Thread(target=_do_reset, daemon=True)
        t.start()
    return """<html><head><meta http-equiv="refresh" content="3;url=/api/admin/reset-status"></head>
        <body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
        <h2>Reset started...</h2>
        <p>Initialising database. You will be redirected in 3 seconds.</p>
        <p><a href="/api/admin/reset-status">Check status</a></p>
        </body></html>"""

@app.route('/api/admin/reset-status')
def reset_status():
    s = _reset_status
    if s["done"]:
        return """<html><body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
            <h2 style="color:#2d8f3e">&#10003; Database Ready!</h2>
            <p style="background:#e8f5eb;border:1px solid #2d8f3e;border-radius:8px;padding:16px;font-size:18px;font-weight:bold">
              Username: admin<br>Password: Admin@123</p>
            <a href="/" style="display:inline-block;margin-top:20px;background:#2d8f3e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:16px">Go to Login</a>
        </body></html>"""
    if s["error"]:
        return f"""<html><body style="font-family:sans-serif;padding:40px">
            <h2 style="color:red">Reset Failed</h2>
            <p><strong>{s["error"]}</strong></p>
            <pre style="font-size:11px">{s.get("trace","")}</pre>
            <p>Log: {" | ".join(s.get("log",[]))}</p>
        </body></html>"""
    return """<html><head><meta http-equiv="refresh" content="2;url=/api/admin/reset-status"></head>
        <body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
        <h2>Working...</h2><p>Database initialisation in progress. Page refreshes automatically.</p>
        </body></html>"""


# ═══════════════════════════════════════════════════
# BULK UPLOAD
# ═══════════════════════════════════════════════════
import csv, io as _io_bulk

@app.route('/api/bulk/template/<entity>')
def bulk_template(entity):
    """Download CSV template for bulk upload"""
    templates = {
        'employees': ['first_name*','last_name*','email','phone','job_title','department_name',
                      'employment_type','salary','bill_rate','start_date(YYYY-MM-DD)','status','referred_by','location'],
        'candidates': ['first_name*','last_name*','email','phone','location','current_title',
                       'years_exp','source','skills'],
        'clients':    ['name*','industry','contract_type','currency','payment_terms_days',
                       'primary_contact','contact_email','contact_phone','city','gstin','pan','status'],
        'vendors':    ['name*','category','primary_contact','contact_email','contact_phone',
                       'city','gstin','pan','sla_score','status'],
        'timesheets': ['employee_code*','client_name','project','week_ending(YYYY-MM-DD)*',
                       'regular_hours*','overtime_hours','bill_rate','notes'],
    }
    if entity not in templates:
        return err(f"Unknown entity: {entity}", 404)
    output = _io_bulk.StringIO()
    writer = csv.writer(output)
    writer.writerow(templates[entity])
    writer.writerow([f"Sample {h.split('(')[0].replace('*','')}" for h in templates[entity]])
    from flask import Response
    return Response(output.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename={entity}_template.csv'})

# ═══════════════════════════════════════════════════════
# EMPLOYEE SELF-SERVICE ROUTES
# ═══════════════════════════════════════════════════════

@app.route('/api/employee/profile', methods=['GET','PUT'])
@require_auth
def employee_self_profile():
    """Employee can view and edit their own personal fields"""
    uid = g.user.get('employee_id')
    if not uid:
        user_email = g.user.get('email','')
        emp = row1("SELECT id FROM employees WHERE (email=%s OR personal_email=%s) AND status='Active'",(user_email,user_email))
        if not emp:
            # Try username as email prefix match
            uname = g.user.get('username','')
            if uname and '@' not in uname:
                emp = row1("SELECT id FROM employees WHERE email LIKE %s",( uname+'@%',))
        if emp:
            uid = emp['id']
            try:
                _cur().execute("UPDATE users SET employee_id=%s WHERE id=%s",(uid,g.user['id']))
                get_db().commit()
            except: pass
        else:
            return err("No employee profile linked to this account",403)
    db = get_db()
    if request.method == 'GET':
        r = row1("""SELECT e.*,d.name as department_name,et.name as employment_type,
            rm.first_name||' '||rm.last_name as reporting_manager_name
            FROM employees e
            LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
            LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
            WHERE e.id=%s""",(uid,))
        return ok(r) if r else err("Not found",404)
    d = request.get_json()
    # Employees can only edit these personal fields
    allowed = ['personal_email','personal_phone','bank_account_name','bank_name',
               'bank_branch','bank_account_number','bank_ifsc','pan','aadhaar',
               'passport_number','pf_number','esi_number']
    sets = [f"{f}=%s" for f in allowed if f in d]
    vals = [d[f] for f in allowed if f in d]
    if sets:
        vals.append(uid)
        _cur().execute(f"UPDATE employees SET {','.join(sets)},updated_at=NOW() WHERE id=%s", vals)
        db.commit()
    return ok(msg="Profile updated")

@app.route('/api/admin/reset-emp-password')
def reset_emp_password():
    """Reset any employee user password - no auth needed"""
    username = request.args.get('u','')
    password = request.args.get('p','')
    secret   = request.args.get('s','')
    if secret != 'reset2026':
        return '<h3>Add ?s=reset2026&u=USERNAME&p=NEWPASSWORD</h3>', 200
    if not username or not password:
        return '<h3>Missing u= or p= parameters</h3>', 200
    try:
        import hashlib
        conn = get_pg_conn(); conn.autocommit = True
        cur  = conn.cursor()
        cur.execute("UPDATE users SET password_hash=%s WHERE username=%s RETURNING id",
                   (hashlib.sha256(password.encode()).hexdigest(), username))
        row = cur.fetchone()
        conn.close()
        if row:
            return f'<h2 style="color:green;font-family:sans-serif;padding:40px">✅ Password for "{username}" reset to "{password}".<br><br><a href="/">Log in →</a></h2>', 200
        else:
            return f'<h2 style="color:red;font-family:sans-serif;padding:40px">User "{username}" not found.</h2>', 404
    except Exception as ex:
        return f'<h2 style="color:red">Error: {ex}</h2>', 500

@app.route('/api/employee/dashboard-test')
def employee_dashboard_test():
    """No-auth test - shows what dashboard returns for any linked user"""
    try:
        conn = get_pg_conn()
        conn.autocommit = True
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT u.id,u.username,u.email,u.employee_id,r.name as role FROM users u JOIN master_user_roles r ON r.id=u.role_id WHERE u.is_active=1 ORDER BY u.id")
        users = cur.fetchall()
        cur.execute("SELECT id,first_name,last_name,email,emp_id FROM employees ORDER BY id")
        emps = cur.fetchall()
        rows = ''.join(f'<tr><td>{u["id"]}</td><td>{u["username"]}</td><td>{u["email"]}</td><td>{u["employee_id"]}</td><td>{u["role"]}</td></tr>' for u in users)
        emp_rows = ''.join(f'<tr><td>{e["id"]}</td><td>{e["first_name"]} {e["last_name"]}</td><td>{e["email"]}</td><td>{e["emp_id"]}</td></tr>' for e in emps)
        conn.close()
        return f"""<html><body style="font-family:sans-serif;padding:24px">
        <h2>Dashboard Diagnostic</h2>
        <h3>Users</h3>
        <table border=1 cellpadding=6 style="border-collapse:collapse">
        <tr><th>ID</th><th>Username</th><th>Email</th><th>employee_id</th><th>Role</th></tr>{rows}</table>
        <h3>Employees</h3>
        <table border=1 cellpadding=6 style="border-collapse:collapse">
        <tr><th>ID</th><th>Name</th><th>Email</th><th>emp_id</th></tr>{emp_rows}</table>
        <br><a href="/">App →</a>
        </body></html>"""
    except Exception as ex:
        return f'<h2 style="color:red">Error: {ex}</h2>', 500

@app.route('/api/employee/dashboard', methods=['GET'])
@require_auth
def employee_dashboard():
    """Employee personal dashboard data"""
    uid = g.user.get('employee_id')
    if not uid:
        # Try multiple matching strategies
        user_email = g.user.get('email','')
        username   = g.user.get('username','')
        emp = None
        # 1. Match by official email
        if user_email:
            emp = row1("SELECT id FROM employees WHERE email=%s",(user_email,))
        # 2. Match by personal email
        if not emp and user_email:
            emp = row1("SELECT id FROM employees WHERE personal_email=%s",(user_email,))
        # 3. Match username as emp_id (e.g. username='EMP-001')
        if not emp and username:
            emp = row1("SELECT id FROM employees WHERE emp_id ILIKE %s",(username,))
        # 4. Match username against first/last name slug (jagsmamidi → jagsmamidi)
        if not emp and username:
            emp = row1("""SELECT id FROM employees WHERE LOWER(REPLACE(first_name||last_name,' ','')) ILIKE %s""",(username.lower(),))
        # 5. Match "firstname.lastname" pattern (shreyas.iyer → shreyas + iyer)
        if not emp and username and '.' in username:
            parts=username.split('.',1)
            emp=row1("""SELECT id FROM employees WHERE LOWER(first_name) ILIKE %s AND LOWER(last_name) ILIKE %s""",
                (parts[0].lower(),parts[1].lower()))
        # 6. Match by first name alone (last resort, only if unique)
        if not emp and username:
            matches=rows("""SELECT id FROM employees WHERE LOWER(first_name) ILIKE %s""",(username.split('.')[0].lower()+'%',))
            if len(matches)==1: emp=matches[0]
        if emp:
            uid = emp['id']
            try:
                _cur().execute("UPDATE users SET employee_id=%s WHERE id=%s",(uid,g.user['id']))
                get_db().commit()
            except: pass
        else:
            return err(f"No employee profile linked. Login: {user_email or username}. Ask admin to link your account in Users & Access.",403)
    emp = row1("""SELECT e.*,
        d.name as department_name,
        b.name as business_unit_name,
        c.name as client_name,
        et.name as employment_type,
        rm.first_name||' '||rm.last_name as reporting_manager_name
        FROM employees e
        LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN business_units b ON b.id=d.business_unit_id
        LEFT JOIN clients c ON c.id=e.client_id
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
        WHERE e.id=%s""",(uid,))
    if not emp: return err("Employee not found",404)
    # Pending timesheets
    pending_ts = _scalar("SELECT COUNT(*) FROM timesheets t LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE t.employee_id=%s AND (s.name='Pending' OR (t.status_id IS NULL))",(uid,))
    # Total approved hours this month
    approved_hours = row1("""SELECT COALESCE(SUM(t.total_hours),0) as hours
        FROM timesheets t LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        WHERE t.employee_id=%s AND s.name='Approved'
        AND t.week_ending >= date_trunc('month',NOW())""",(uid,))
    # Leave balance (simple: 18 days per year, used = sum of approved leaves this year)
    try:
        leaves_taken = row1("""SELECT COALESCE(SUM(days),0) as used
            FROM employee_leaves WHERE employee_id=%s AND status='Approved'
            AND EXTRACT(YEAR FROM from_date)=EXTRACT(YEAR FROM NOW())""",(uid,))
    except:
        leaves_taken = {'used': 0}
    # Recent timesheets
    recent_ts = rows("""SELECT t.*,COALESCE(s.name,'Pending') as status,c.name as client_name
        FROM timesheets t LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN clients c ON c.id=t.client_id
        WHERE t.employee_id=%s ORDER BY t.submitted_at DESC LIMIT 5""",(uid,))
    # Pending leaves
    try:
        pending_leaves = rows("""SELECT * FROM employee_leaves WHERE employee_id=%s
            ORDER BY created_at DESC LIMIT 5""",(uid,))
    except:
        pending_leaves = []
    return ok({
        'employee': emp,
        'pending_timesheets': pending_ts,
        'approved_hours_mtd': float(approved_hours['hours']) if approved_hours else 0,
        'leave_balance': max(0, 18 - float(leaves_taken['used'] if leaves_taken else 0)),
        'leaves_taken': float(leaves_taken['used']) if leaves_taken else 0,
        'recent_timesheets': recent_ts,
        'pending_leaves': pending_leaves,
    })

def _ensure_employee_leaves_table():
    """Create employee_leaves if it doesn't exist — safe to run every startup."""
    try:
        conn=get_pg_conn(); conn.autocommit=True; cur=conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS employee_leaves (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER NOT NULL REFERENCES employees(id),
            leave_type TEXT NOT NULL DEFAULT 'Annual',
            from_date DATE NOT NULL,
            to_date DATE NOT NULL,
            days NUMERIC DEFAULT 1,
            reason TEXT,
            status TEXT DEFAULT 'Pending',
            rejection_reason TEXT,
            applied_at TIMESTAMP DEFAULT NOW(),
            approved_by INTEGER REFERENCES employees(id),
            approved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )""")
        conn.close()
    except Exception as ex:
        print(f"employee_leaves migration: {ex}", flush=True)

_ensure_employee_leaves_table()

@app.route('/api/employee/leaves', methods=['GET','POST'])
@require_auth
def employee_leaves():
    uid = g.user.get('employee_id')
    if not uid:
        user_email = g.user.get('email','')
        emp = row1("SELECT id FROM employees WHERE email=%s",(user_email,))
        if emp: uid = emp['id']
        else: return err("No employee profile",403)
    db = get_db()
    if request.method == 'GET':
        return ok(rows("""SELECT * FROM employee_leaves WHERE employee_id=%s
            ORDER BY created_at DESC""",(uid,)))
    d = request.get_json()
    if not d.get('from_date') or not d.get('to_date'): return err("from_date and to_date required")
    _cur().execute("""INSERT INTO employee_leaves(employee_id,leave_type,from_date,to_date,reason)
        VALUES(%s,%s,%s,%s,%s) RETURNING id""",
        (uid,d.get('leave_type','Casual'),d['from_date'],d['to_date'],d.get('reason','')))
    lid = _cur().fetchone()['id']
    db.commit()
    return ok({'id':lid}, "Leave applied", 201)

@app.route('/api/employee/leaves/<int:lid>', methods=['PUT','DELETE'])
@require_auth
def employee_leave_detail(lid):
    db = get_db()
    uid = g.user.get('employee_id')
    leave = row1("SELECT * FROM employee_leaves WHERE id=%s",(lid,))
    if not leave: return err("Not found",404)
    # Approval by manager/HR
    if request.method == 'PUT':
        d = request.get_json()
        status = d.get('status','Pending')
        _cur().execute("""UPDATE employee_leaves SET status=%s,rejection_reason=%s,
            approved_by=%s,approved_at=NOW() WHERE id=%s""",
            (status,d.get('rejection_reason'),uid,lid))
        db.commit()
        return ok(msg=f"Leave {status.lower()}")
    if request.method == 'DELETE':
        if leave['employee_id'] != uid: return err("Unauthorized",403)
        if leave['status'] != 'Pending': return err("Can only cancel pending leaves")
        _cur().execute("DELETE FROM employee_leaves WHERE id=%s",(lid,))
        db.commit()
        return ok(msg="Leave cancelled")

@app.route('/api/manager/team', methods=['GET'])
@require_auth
def manager_team():
    """Reporting manager sees their direct reports"""
    uid = g.user.get('employee_id')
    if not uid:
        emp = row1("SELECT id FROM employees WHERE email=%s",(g.user.get('email',''),))
        if emp: uid = emp['id']
        else: return ok([])  # No team if no employee profile
    team = rows("""SELECT e.*,et.name as employment_type,d.name as department_name
        FROM employees e
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        LEFT JOIN departments d ON d.id=e.department_id
        WHERE e.reporting_manager_id=%s AND e.status='Active'""",(uid,))
    return ok(team)

@app.route('/api/manager/timesheets', methods=['GET'])
@require_auth
def manager_timesheets():
    """Manager sees pending timesheets of their direct reports"""
    uid = g.user.get('employee_id')
    if not uid: return err("No employee profile",403)
    status = request.args.get('status','Pending')
    result = rows("""SELECT t.*,e.first_name||' '||e.last_name as employee_name,
        e.emp_id,c.name as client_name,s.name as status
        FROM timesheets t
        JOIN employees e ON e.id=t.employee_id
        JOIN master_timesheet_statuses s ON s.id=t.status_id
        LEFT JOIN clients c ON c.id=t.client_id
        WHERE e.reporting_manager_id=%s AND s.name=%s
        ORDER BY t.week_ending DESC""",(uid,status))
    return ok(result)

@app.route('/api/manager/leaves', methods=['GET'])
@require_auth
def manager_leaves():
    """Manager sees leave requests from their direct reports"""
    uid = g.user.get('employee_id')
    if not uid: return err("No employee profile",403)
    result = rows("""SELECT l.*,e.first_name||' '||e.last_name as employee_name,e.emp_id
        FROM employee_leaves l JOIN employees e ON e.id=l.employee_id
        WHERE e.reporting_manager_id=%s ORDER BY l.created_at DESC""",(uid,))
    return ok(result)


@app.route('/api/admin/ensure-user', methods=['POST'])
@require_auth
def ensure_employee_user():
    """Create or update a user account for an employee."""
    if g.user.get('role_name') not in ('Admin','HR Manager'): return err("Admin/HR only",403)
    d = request.get_json()
    emp_id = d.get('employee_id')
    username = d.get('username','').strip()
    password = d.get('password','Employee@123')
    if not emp_id or not username: return err("employee_id and username required")
    emp = row1("SELECT * FROM employees WHERE id=%s",(emp_id,))
    if not emp: return err("Employee not found",404)
    # Get Employee role id
    emp_role = row1("SELECT id FROM master_user_roles WHERE name='Employee'")
    if not emp_role: return err("Employee role not configured",500)
    email = emp.get('email') or f"{username}@mcraan.com"
    full_name = f"{emp['first_name']} {emp['last_name']}"
    # Check if user already exists
    existing = row1("SELECT id FROM users WHERE username=%s OR email=%s",(username,email))
    if existing:
        _cur().execute("UPDATE users SET employee_id=%s,is_active=1 WHERE id=%s",(emp_id,existing['id']))
        return ok({"id":existing['id'],"action":"linked"},"Linked to existing user")
    # Create new user
    cur=_cur()
    cur.execute("INSERT INTO users(username,email,password_hash,role_id,employee_id,full_name,must_change_pwd) VALUES(%s,%s,%s,%s,%s,%s,0) RETURNING id",
        (username,email,hash_pw(password),emp_role['id'],emp_id,full_name))
    uid=cur.fetchone()['id']
    return ok({"id":uid,"username":username,"password":password,"action":"created"},f"User created: {username}",201)

@app.route('/api/admin/db-status')
def db_status():
    """Show DB state and fix jags - open in browser"""
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cur.execute("SELECT id, first_name, last_name, email FROM employees ORDER BY id")
        emps = cur.fetchall()
        
        cur.execute("SELECT id, username, email, employee_id FROM users ORDER BY id")
        users = cur.fetchall()
        
        emp_rows = ''.join(f'<tr><td>{e["id"]}</td><td>{e["first_name"]} {e["last_name"]}</td><td>{e["email"] or "NO EMAIL"}</td></tr>' for e in emps)
        usr_rows = ''.join(f'<tr><td>{u["id"]}</td><td>{u["username"]}</td><td>{u["email"] or "NONE"}</td><td style="color:{"green" if u["employee_id"] else "red"}">{u["employee_id"] or "NOT LINKED"}</td></tr>' for u in users)
        
        # Auto-fix: link each user to matching employee
        fixed = 0
        for u in users:
            if u['employee_id']: continue
            uname = u['username'] or ''
            uemail = u['email'] or ''
            # Try email match
            cur.execute("SELECT id FROM employees WHERE email=%s OR LOWER(SPLIT_PART(email,'@',1))=%s LIMIT 1",
                       (uemail, uname.lower()))
            emp = cur.fetchone()
            if emp:
                cur.execute("UPDATE users SET employee_id=%s WHERE id=%s", (emp['id'], u['id']))
                fixed += 1
        
        conn.close()
        
        return f"""<html><body style="font-family:sans-serif;padding:24px;max-width:900px">
        <h2>McHRMS DB Status</h2>
        <p style="color:green;font-weight:bold">Auto-linked {fixed} user(s) to employees</p>
        <h3>Employees ({len(emps)})</h3>
        <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr><th>ID</th><th>Name</th><th>Email</th></tr>{emp_rows}</table>
        <h3>Users ({len(users)})</h3>
        <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr><th>ID</th><th>Username</th><th>Email</th><th>Employee ID (RED=not linked)</th></tr>{usr_rows}</table>
        <br><a href="/">Go to app →</a>
        <br><br><small>Refresh this page to re-run the fix</small>
        </body></html>"""
    except Exception as ex:
        return f'<h2 style="color:red">Error: {ex}</h2>', 500

@app.route('/api/admin/autolink-users')
def autolink_users():
    """No-auth: auto-link all users to employees by email/name matching"""
    secret = request.args.get('s','')
    if secret != 'link2026':
        return '<a href="?s=link2026">Click to auto-link users to employees</a>', 200
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        # Link by email match
        cur.execute("""UPDATE users u SET employee_id=e.id
            FROM employees e
            WHERE u.employee_id IS NULL
            AND (u.email=e.email OR u.username=split_part(e.email,'@',1)
                 OR u.username=LOWER(e.first_name)||'.'||LOWER(e.last_name)
                 OR u.username=LOWER(e.first_name))""")
        linked = cur.rowcount
        conn.close()
        return f'<h2 style="font-family:sans-serif;padding:40px;color:green">✅ Linked {linked} user(s) to employee records.<br><br><a href="/">Go to app →</a></h2>', 200
    except Exception as ex:
        return f'<h2 style="color:red;font-family:sans-serif;padding:40px">Error: {ex}</h2>', 500

@app.route('/api/admin/link-employees', methods=['POST'])
@require_auth
def admin_link_employees():
    """Admin utility: link users to employees by matching email"""
    if g.user.get('role_name') != 'Admin': return err("Admin only",403)
    linked = 0
    users = rows("SELECT id,email FROM users WHERE employee_id IS NULL AND email IS NOT NULL")
    for u in users:
        emp = row1("SELECT id FROM employees WHERE email=%s OR personal_email=%s",(u['email'],u['email']))
        if not emp:
            # Try matching by username as email prefix
            uname = u.get('username','')
            if '@' not in uname:
                emp = row1("SELECT id FROM employees WHERE email LIKE %s",(uname+'@%',))
        if emp:
            _cur().execute("UPDATE users SET employee_id=%s WHERE id=%s",(emp['id'],u['id']))
            linked += 1
    get_db().commit()
    return ok({'linked': linked}, f"Linked {linked} users to employee records")


@app.route('/api/admin/users-debug', methods=['GET'])
@require_auth  
def users_debug():
    if g.user.get('role_name') != 'Admin': return err("Admin only",403)
    result = rows("""SELECT u.id,u.username,u.email,u.employee_id,u.full_name,
        r.name as role_name,
        e.first_name||' '||e.last_name as emp_name,
        e.email as emp_email
        FROM users u 
        JOIN master_user_roles r ON r.id=u.role_id
        LEFT JOIN employees e ON e.id=u.employee_id
        ORDER BY u.id""")
    return ok(result)

@app.route('/api/admin/fix-user-link/<int:uid>', methods=['POST'])
@require_auth
def fix_user_link(uid):
    """Manually link a user to an employee record by employee_id"""
    if g.user.get('role_name') != 'Admin': return err("Admin only",403)
    d = request.get_json()
    emp_id = d.get('employee_id')
    if not emp_id:
        # Try auto-link by email
        u = row1("SELECT email FROM users WHERE id=%s",(uid,))
        if u:
            emp = row1("SELECT id FROM employees WHERE email=%s OR personal_email=%s",
                      (u['email'],u['email']))
            if emp: emp_id = emp['id']
    if not emp_id: return err("Could not find matching employee")
    _cur().execute("UPDATE users SET employee_id=%s WHERE id=%s",(emp_id,uid))
    get_db().commit()
    return ok(msg="User linked to employee")


if __name__ == '__main__':
    import sys
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 5000))
    print(f"McHR&TA v4.1 starting on port {port}", flush=True)
    app.run(debug=False, port=port, host='0.0.0.0')
@app.route('/health')
def health_check(): return jsonify({'status':'ok','version':'4.1'})
