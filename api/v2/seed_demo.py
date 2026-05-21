"""
One-shot demo-data seeder for testing.

Triggered via the admin-gated POST /api/v2/admin/seed-demo endpoint
(registered in __init__.py). Tops each table up to ~`target` rows,
inserting in FK-dependency order and wiring child rows to already-seeded
parents. Idempotent: a table already at/above `target` is skipped, so
re-running won't pile up duplicates.

Every insert is wrapped per-row so one bad row never aborts the batch;
the first error per table is captured in the result for diagnosis.
All seeded records use recognisable demo-ish values so they're easy to
spot (and bulk-delete later if desired).
"""
import random
import datetime
from .extensions import db_rows, db_row1, get_pg_conn

FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
         'Krishna', 'Ishaan', 'Priya', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kiara',
         'Myra', 'Anika', 'Navya', 'Riya', 'Rahul', 'Rohan', 'Karan', 'Amit', 'Vikram',
         'Neha', 'Pooja', 'Sneha', 'Kavya', 'Meera', 'Sanjay', 'Deepak', 'Ravi', 'Suresh']
LAST = ['Sharma', 'Verma', 'Gupta', 'Reddy', 'Nair', 'Menon', 'Iyer', 'Rao', 'Patel',
        'Shah', 'Mehta', 'Desai', 'Kapoor', 'Khanna', 'Bose', 'Das', 'Mukherjee',
        'Chowdhury', 'Pillai', 'Naidu', 'Joshi', 'Malhotra', 'Sinha', 'Agarwal']
CITIES = [('Hyderabad', 'Telangana'), ('Bengaluru', 'Karnataka'), ('Chennai', 'Tamil Nadu'),
          ('Mumbai', 'Maharashtra'), ('Pune', 'Maharashtra'), ('New Delhi', 'Delhi'),
          ('Gurugram', 'Haryana'), ('Noida', 'Uttar Pradesh'), ('Kolkata', 'West Bengal'),
          ('Ahmedabad', 'Gujarat'), ('Jaipur', 'Rajasthan'), ('Kochi', 'Kerala')]
COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne', 'Wonka', 'Hooli',
             'Pied Piper', 'Vandelay', 'Soylent', 'Massive Dynamic', 'Cyberdyne', 'Tyrell',
             'Gekko', 'Nakatomi', 'Oscorp', 'Aperture', 'Bluth', 'Dunder Mifflin']
SUFFIX = ['Technologies', 'Solutions', 'Systems', 'Labs', 'Industries', 'Consulting',
          'Services', 'Software', 'Networks', 'Analytics']
INDUSTRIES = ['IT Services', 'Banking', 'Healthcare', 'Manufacturing', 'Retail', 'Telecom',
              'Logistics', 'Education', 'Pharma', 'Energy', 'E-commerce', 'Insurance']
JOB_TITLES = ['Software Engineer', 'Senior Engineer', 'Tech Lead', 'Project Manager',
              'Business Analyst', 'QA Engineer', 'DevOps Engineer', 'Data Analyst',
              'HR Executive', 'Account Manager', 'Recruiter', 'Designer', 'Architect',
              'Consultant', 'Team Lead', 'Delivery Manager']
DEPT_NAMES = ['Engineering', 'Product', 'Quality Assurance', 'Human Resources', 'Finance',
              'Sales', 'Marketing', 'Operations', 'IT Support', 'Data Science', 'Design',
              'Customer Success', 'Legal', 'Procurement', 'Administration']
BU_NAMES = ['Digital Services', 'Enterprise Solutions', 'Cloud Practice', 'Staffing',
            'Consulting', 'Product Engineering', 'Managed Services', 'Analytics Practice',
            'Cybersecurity', 'Corporate']
EXPENSE_TYPES = ['Travel', 'Accommodation', 'Meals', 'Office Supplies', 'Software/Subscriptions',
                 'Equipment', 'Marketing', 'Training', 'Utilities', 'Professional Services',
                 'Contractor Invoice', 'Vendor Bill', 'Miscellaneous']
PROJECT_TYPES = ['T&M', 'Fixed Price', 'Retainer', 'Support']
STATUSES_PROJ = ['Active', 'On Hold', 'Completed', 'Draft']


def _count(table):
    try:
        return db_row1("SELECT COUNT(*) AS n FROM " + table)['n'] or 0
    except Exception:
        return 0


def _ids(table):
    for q in ("SELECT id FROM %s WHERE is_active=1" % table, "SELECT id FROM %s" % table):
        try:
            return [r['id'] for r in db_rows(q)]
        except Exception:
            continue
    return []


def _rdate(min_days=1, max_days=365):
    return (datetime.date.today() - datetime.timedelta(days=random.randint(min_days, max_days))).isoformat()


def _fdate(min_days=10, max_days=180):
    return (datetime.date.today() + datetime.timedelta(days=random.randint(min_days, max_days))).isoformat()


def seed_demo(target=100):
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    result = {}

    def ins(table, sql, params):
        try:
            cur.execute(sql, params)
            return True
        except Exception as e:
            if (table + '_err') not in result:
                result[table + '_err'] = str(e)[:200]
            return False

    def pick(lst, fallback=None):
        return random.choice(lst) if lst else fallback

    # ── 1. Business Units ────────────────────────────────────────
    start = _count('business_units')
    for i in range(start, target):
        nm = BU_NAMES[i % len(BU_NAMES)] + ' BU ' + str(i + 1)
        ins('business_units', "INSERT INTO business_units (name, code, description) VALUES (%s,%s,%s)",
            (nm, 'BU%03d' % (i + 1), 'Demo business unit ' + str(i + 1)))
    result['business_units'] = _count('business_units')

    bu_ids = _ids('business_units')

    # ── 2. Cost Centres ──────────────────────────────────────────
    start = _count('cost_centres')
    for i in range(start, target):
        ins('cost_centres', "INSERT INTO cost_centres (name, code, business_unit_id, budget) VALUES (%s,%s,%s,%s)",
            ('Cost Centre ' + str(i + 1), 'CC%04d' % (i + 1), pick(bu_ids), random.randint(5, 200) * 100000))
    result['cost_centres'] = _count('cost_centres')

    cc_ids = _ids('cost_centres')

    # ── 3. Locations ─────────────────────────────────────────────
    start = _count('office_locations')
    for i in range(start, target):
        city, state = pick(CITIES, ('Hyderabad', 'Telangana'))
        ins('office_locations',
            "INSERT INTO office_locations (name, city, state, country, address_line1, pincode, type, headcount) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (city + ' Office ' + str(i + 1), city, state, 'India',
             str(random.randint(1, 99)) + ', ' + pick(COMPANIES) + ' Towers',
             str(random.randint(100000, 999999)), pick(['HQ', 'Regional', 'Branch', 'Satellite']),
             random.randint(5, 200)))
    result['office_locations'] = _count('office_locations')

    loc_ids = _ids('office_locations')

    # ── 4. Departments ───────────────────────────────────────────
    start = _count('departments')
    for i in range(start, target):
        ins('departments',
            "INSERT INTO departments (name, business_unit_id, cost_centre_id, head_name, budget) VALUES (%s,%s,%s,%s,%s)",
            (DEPT_NAMES[i % len(DEPT_NAMES)] + ' ' + str(i + 1), pick(bu_ids), pick(cc_ids),
             pick(FIRST) + ' ' + pick(LAST), random.randint(2, 100) * 100000))
    result['departments'] = _count('departments')

    dept_ids = _ids('departments')
    emp_type_ids = _ids('master_employment_types')

    # ── 5. Employees ─────────────────────────────────────────────
    start = _count('employees')
    for i in range(start, target):
        fn, ln = pick(FIRST), pick(LAST)
        ins('employees',
            "INSERT INTO employees (emp_id, first_name, last_name, email, phone, job_title, "
            "department_id, employment_type_id, office_location_id, status, start_date, salary, "
            "bank_name, bank_account_number, bank_ifsc) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            ('DMO%04d' % (i + 1), fn, ln,
             (fn + '.' + ln + str(i + 1) + '@demo-mchrta.com').lower(),
             '9' + str(random.randint(100000000, 999999999)),
             pick(JOB_TITLES), pick(dept_ids), pick(emp_type_ids), pick(loc_ids),
             'Active', _rdate(30, 1500), random.randint(4, 40) * 100000,
             pick(['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak']),
             str(random.randint(10**11, 10**12 - 1)),
             pick(['HDFC', 'ICIC', 'SBIN', 'UTIB', 'KKBK']) + '0' + str(random.randint(100000, 999999))))
    result['employees'] = _count('employees')

    emp_ids = _ids('employees')

    # ── 5b. User logins for demo employees ───────────────────────
    # The create-employee route auto-makes a user account; the direct
    # INSERTs above bypass that, so demo employees had no login. Create
    # an Employee-role user for each demo employee (emp_id LIKE 'DMO%')
    # that doesn't already have one. Password: Employee123.
    try:
        from .middleware.auth import hash_password
        pw = hash_password('Employee123')
    except Exception:
        pw = None
    erole = db_row1("SELECT id FROM master_user_roles WHERE name='Employee' LIMIT 1")
    erole_id = erole['id'] if erole else None
    made = 0
    if pw and erole_id:
        try:
            demo_emps = db_rows("SELECT id, first_name, last_name, email FROM employees WHERE emp_id LIKE 'DMO%'")
        except Exception:
            demo_emps = []
        for e in demo_emps:
            try:
                if db_row1("SELECT id FROM users WHERE employee_id=%s", (e['id'],)):
                    continue
            except Exception:
                pass
            email = e.get('email') or ('demo' + str(e['id']) + '@demo-mchrta.com')
            uname = email.split('@')[0] + str(e['id'])
            full = ((e.get('first_name') or '') + ' ' + (e.get('last_name') or '')).strip()
            if ins('users',
                   "INSERT INTO users (username, email, password_hash, role_id, full_name, employee_id, is_active) "
                   "VALUES (%s,%s,%s,%s,%s,%s,1)",
                   (uname, email, pw, erole_id, full, e['id'])):
                made += 1
    result['demo_users_created'] = made
    result['users'] = _count('users')

    # ── 6. Clients ───────────────────────────────────────────────
    start = _count('clients')
    for i in range(start, target):
        nm = pick(COMPANIES) + ' ' + pick(SUFFIX) + ' ' + str(i + 1)
        fn, ln = pick(FIRST), pick(LAST)
        ins('clients',
            "INSERT INTO clients (name, industry, status, primary_contact, primary_contact_designation, "
            "contact_email, contact_phone, city, account_manager_id) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (nm, pick(INDUSTRIES), pick(['Active', 'Prospect', 'Inactive']),
             fn + ' ' + ln, pick(['CEO', 'CTO', 'VP', 'Director', 'Manager']),
             (fn + '@' + pick(COMPANIES) + '.com').lower(),
             '9' + str(random.randint(100000000, 999999999)),
             pick(CITIES)[0], pick(emp_ids)))
    result['clients'] = _count('clients')

    client_ids = _ids('clients')
    vcat_ids = _ids('master_vendor_categories')

    # ── 7. Vendors ───────────────────────────────────────────────
    start = _count('vendors')
    for i in range(start, target):
        nm = pick(COMPANIES) + ' ' + pick(['Supplies', 'Infotech', 'Enterprises', 'Traders', 'Corp']) + ' ' + str(i + 1)
        fn = pick(FIRST)
        ins('vendors',
            "INSERT INTO vendors (name, category_id, status, primary_contact, contact_email, contact_phone, city) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (nm, pick(vcat_ids), pick(['Active', 'Inactive']), fn + ' ' + pick(LAST),
             (fn + '@vendor' + str(i + 1) + '.com').lower(),
             '9' + str(random.randint(100000000, 999999999)), pick(CITIES)[0]))
    result['vendors'] = _count('vendors')

    vendor_ids = _ids('vendors')

    # ── 8. Projects ──────────────────────────────────────────────
    start = _count('projects')
    for i in range(start, target):
        ins('projects',
            "INSERT INTO projects (project_code, name, project_type, status, client_id, "
            "project_manager_id, department_id, budget, budget_currency, start_date) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            ('DMO-PRJ-%04d' % (i + 1), pick(COMPANIES) + ' ' + pick(['Platform', 'Migration', 'Revamp', 'Rollout', 'Portal']) + ' ' + str(i + 1),
             pick(PROJECT_TYPES), pick(STATUSES_PROJ), pick(client_ids), pick(emp_ids),
             pick(dept_ids), random.randint(5, 500) * 100000, 'INR', _rdate(10, 700)))
    result['projects'] = _count('projects')

    # ── 9. Job Requisitions ──────────────────────────────────────
    start = _count('job_requisitions')
    for i in range(start, target):
        city = pick(CITIES)[0]
        ins('job_requisitions',
            "INSERT INTO job_requisitions (title, client_id, department_id, employment_type_id, "
            "status, positions, location, min_experience, max_experience, recruiter_id) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (pick(JOB_TITLES) + ' (' + city + ')', pick(client_ids), pick(dept_ids), pick(emp_type_ids),
             pick(['Open', 'On Hold', 'Filled', 'Closed']), random.randint(1, 5), city,
             random.randint(0, 5), random.randint(6, 15), pick(emp_ids)))
    result['job_requisitions'] = _count('job_requisitions')

    src_ids = _ids('master_candidate_sources')

    # ── 10. Candidates ───────────────────────────────────────────
    start = _count('candidates')
    for i in range(start, target):
        fn, ln = pick(FIRST), pick(LAST)
        ins('candidates',
            "INSERT INTO candidates (first_name, last_name, email, phone, current_location, "
            "current_designation, total_experience, current_ctc, expected_ctc, status, source_id, recruiter_id) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (fn, ln, (fn + '.' + ln + str(i + 1) + '@email.com').lower(),
             '9' + str(random.randint(100000000, 999999999)), pick(CITIES)[0],
             pick(JOB_TITLES), round(random.uniform(0, 15), 1),
             random.randint(3, 30) * 100000, random.randint(4, 40) * 100000,
             pick(['Active', 'Screening', 'Interviewing', 'Offered', 'Rejected', 'Joined']),
             pick(src_ids), pick(emp_ids)))
    result['candidates'] = _count('candidates')

    inv_status_ids = _ids('master_invoice_statuses')

    # ── 11. Invoices ─────────────────────────────────────────────
    start = _count('invoices')
    for i in range(start, target):
        amt = random.randint(50, 2000) * 1000
        tax = round(amt * 0.18, 2)
        ps = _rdate(30, 365)
        ins('invoices',
            "INSERT INTO invoices (invoice_number, client_id, amount, tax_amount, status_id, "
            "period_start, period_end, due_date) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            ('DMO-INV-%04d' % (i + 1), pick(client_ids), amt, tax, pick(inv_status_ids),
             ps, _rdate(1, 29), _fdate(5, 60)))
    result['invoices'] = _count('invoices')

    # ── 12. Bills & Expenses ─────────────────────────────────────
    start = _count('bills_expenses')
    for i in range(start, target):
        amt = random.randint(2, 500) * 1000
        tax = round(amt * 0.18, 2)
        ins('bills_expenses',
            "INSERT INTO bills_expenses (expense_type, vendor_id, project_id, client_id, "
            "amount, tax_amount, total_amount, currency, expense_date, payment_mode, status, "
            "description, bill_number, submitted_by) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (pick(EXPENSE_TYPES), pick(vendor_ids), None, pick(client_ids),
             amt, tax, amt + tax, 'INR', _rdate(1, 300),
             pick(['Bank Transfer', 'Cheque', 'UPI', 'Credit Card']),
             pick(['Draft', 'Submitted', 'Approved', 'Paid']),
             'Demo expense ' + str(i + 1), 'DMO-BILL-%04d' % (i + 1), pick(emp_ids)))
    result['bills_expenses'] = _count('bills_expenses')

    try:
        conn.close()
    except Exception:
        pass
    return result
