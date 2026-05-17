"""McHR&TA v2 Application Factory"""
import os
from flask import Flask, jsonify, send_from_directory, make_response, request
from .config import get_config
from .extensions import get_pg_conn, db_rows, db_row1, db_execute


def _bootstrap_v2(app):
    """Ensure v2 schema tables exist alongside v1 tables."""
    schema_path = os.path.join(os.path.dirname(__file__), 'models', 'schema.sql')
    try:
        with open(schema_path) as f:
            sql = f.read()
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()
        # Execute each statement
        for stmt in sql.split(';'):
            stmt = stmt.strip()
            if stmt:
                try:
                    cur.execute(stmt)
                except Exception as e:
                    # Non-fatal — table may already exist with different definition
                    if 'already exists' not in str(e).lower():
                        print(f"[schema] warning: {e}", flush=True)
        conn.close()
        print("[v2] Schema bootstrap complete", flush=True)
    except Exception as e:
        print(f"[v2] Schema bootstrap error: {e}", flush=True)


def _seed_masters(app):
    """Seed required master data if empty."""
    try:
        if not db_row1("SELECT id FROM master_timesheet_statuses LIMIT 1"):
            for s in ['Pending','Approved','Rejected','Draft']:
                db_execute("INSERT INTO master_timesheet_statuses (name) VALUES (%s) ON CONFLICT DO NOTHING", (s,))
        if not db_row1("SELECT id FROM master_invoice_statuses LIMIT 1"):
            for s in ['Draft','Sent','Paid','Overdue','Cancelled','Partially Paid']:
                db_execute("INSERT INTO master_invoice_statuses (name) VALUES (%s) ON CONFLICT DO NOTHING", (s,))
        if not db_row1("SELECT id FROM master_application_stages LIMIT 1"):
            stages = [('Applied',0,'#6b7280'),('Screening',1,'#f59e0b'),
                      ('Interview',2,'#3b82f6'),('Offer',3,'#8b5cf6'),
                      ('Placed',4,'#10b981'),('Rejected',5,'#ef4444')]
            for name, seq, color in stages:
                db_execute("INSERT INTO master_application_stages (name, order_seq, color) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                          (name, seq, color))
        if not db_row1("SELECT id FROM master_interview_formats LIMIT 1"):
            for f in ['Video Call','In-Person','Phone Screen','Panel','Technical']:
                db_execute("INSERT INTO master_interview_formats (name) VALUES (%s) ON CONFLICT DO NOTHING", (f,))
        if not db_row1("SELECT id FROM master_candidate_sources LIMIT 1"):
            for s in ['LinkedIn','Job Portal','Referral','Direct','Consultancy','Walk-in']:
                db_execute("INSERT INTO master_candidate_sources (name) VALUES (%s) ON CONFLICT DO NOTHING", (s,))
        if not db_row1("SELECT id FROM master_payment_terms LIMIT 1"):
            for name, days in [('Net 15',15),('Net 30',30),('Net 45',45),('Net 60',60),('Immediate',0)]:
                db_execute("INSERT INTO master_payment_terms (name, days) VALUES (%s,%s) ON CONFLICT DO NOTHING", (name, days))
        if not db_row1("SELECT id FROM master_priority_levels LIMIT 1"):
            for name, color in [('Low','#6b7280'),('Medium','#f59e0b'),('High','#ef4444'),('Urgent','#7c3aed')]:
                db_execute("INSERT INTO master_priority_levels (name, color) VALUES (%s,%s) ON CONFLICT DO NOTHING", (name, color))
        if not db_row1("SELECT id FROM master_employment_types LIMIT 1"):
            for t in ['Full-Time','Part-Time','Contract','Freelance','Intern']:
                db_execute("INSERT INTO master_employment_types (name) VALUES (%s) ON CONFLICT DO NOTHING", (t,))
        if not db_row1("SELECT id FROM master_vendor_categories LIMIT 1"):
            for c in ['IT Services','Staffing','Infrastructure','Legal','Finance','Other']:
                db_execute("INSERT INTO master_vendor_categories (name) VALUES (%s) ON CONFLICT DO NOTHING", (c,))
        # Ensure v2 roles exist
        v2_roles = [('Admin','Full system access',True),
                    ('HR Manager','HR and employee management',True),
                    ('Finance Manager','Finance and payroll access',True),
                    ('Recruiting Manager','Full recruitment access',True),
                    ('Account Manager','Client and job management',True),
                    ('Recruiter','Recruitment operations',True),
                    ('Employee','Self-service portal only',True)]
        for name, desc, is_sys in v2_roles:
            db_execute("INSERT INTO master_user_roles (name, description, is_system) VALUES (%s,%s,%s) ON CONFLICT (name) DO NOTHING",
                      (name, desc, is_sys))
        # Add missing columns to existing tables if needed
        db_execute("ALTER TABLE master_user_roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE")
        db_execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0")
        db_execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP")
        db_execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS business_unit_id INTEGER")
        db_execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")
        db_execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP")
        db_execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_by INTEGER")
        db_execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by INTEGER")
        print("[v2] Master data seeded", flush=True)
    except Exception as e:
        print(f"[v2] Seed error: {e}", flush=True)


def _run_migrations(app):
    """Run any DB column migrations needed for v2 schema on existing v1 database."""
    try:
        from .extensions import get_pg_conn
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()
        migrations = [
            # users table
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0",
            # organisation enhanced tables
            """CREATE TABLE IF NOT EXISTS organisation_contacts (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), name TEXT NOT NULL, designation TEXT, department TEXT, email TEXT, phone TEXT, is_primary INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS organisation_addresses (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), address_type TEXT NOT NULL DEFAULT 'Registered', line1 TEXT, line2 TEXT, city TEXT, state TEXT, pincode TEXT, country TEXT DEFAULT 'India', currency TEXT DEFAULT 'INR', timezone TEXT DEFAULT 'Asia/Kolkata', hours_of_operation TEXT, is_primary INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS organisation_identity (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), id_type TEXT NOT NULL, id_number TEXT NOT NULL, issue_date DATE, expiry_date DATE, issuing_authority TEXT, notes TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS organisation_registrations (id SERIAL PRIMARY KEY, organisation_id INTEGER NOT NULL REFERENCES organisation(id), reg_type TEXT NOT NULL, reg_number TEXT NOT NULL, state TEXT, jurisdiction TEXT, issuing_authority TEXT, trade_name TEXT, start_date DATE, expiry_date DATE, is_primary INTEGER DEFAULT 0, notes TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""",
            "ALTER TABLE organisation_bank_accounts ADD COLUMN IF NOT EXISTS purpose TEXT",
            "ALTER TABLE organisation_bank_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE organisation_documents ADD COLUMN IF NOT EXISTS expiry_date DATE",
            "ALTER TABLE organisation_documents ADD COLUMN IF NOT EXISTS notes TEXT",
            "ALTER TABLE organisation_documents ADD COLUMN IF NOT EXISTS uploaded_by INTEGER",
            "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS type_of_entity TEXT",
            "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS brand_name TEXT",
            "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS linkedin_url TEXT",
            "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS hours_of_operation TEXT",
            "ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INTEGER",
            "ALTER TABLE departments ADD COLUMN IF NOT EXISTS location_id INTEGER",
            "ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE business_units ADD COLUMN IF NOT EXISTS head_emp_id INTEGER",
            "ALTER TABLE business_units ADD COLUMN IF NOT EXISTS location_id INTEGER",
            "ALTER TABLE business_units ADD COLUMN IF NOT EXISTS code TEXT",
            "ALTER TABLE business_units ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS business_unit_id INTEGER",
            "ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS phone TEXT",
            "ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS email TEXT",
            "ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS manager_id INTEGER",
            "ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS is_hq INTEGER DEFAULT 0",
            "ALTER TABLE office_locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE cost_centres ADD COLUMN IF NOT EXISTS manager_id INTEGER",
            "ALTER TABLE cost_centres ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR'",
            "ALTER TABLE cost_centres ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
                        "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS employee_count_range TEXT",
            # organisation: logo and extra fields (v2 additions)
            "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS logo_data TEXT",
            "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS logo_mime TEXT",
            "ALTER TABLE organisation ADD COLUMN IF NOT EXISTS financial_year_end TEXT",
            # job_requisitions: v2 fields
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS work_mode TEXT DEFAULT 'On-Site'",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS min_experience INTEGER DEFAULT 0",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS max_experience INTEGER",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS positions INTEGER DEFAULT 1",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS filled_count INTEGER DEFAULT 0",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS budget NUMERIC DEFAULT 0",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS requirements TEXT",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'Permanent'",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS notice_period TEXT",
            "ALTER TABLE job_requisitions ADD COLUMN IF NOT EXISTS assigned_to INTEGER",
            # candidates: v2 fields
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS middle_name TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_company TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notice_period INTEGER",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_ctc NUMERIC",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS expected_ctc NUMERIC",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS marital_status TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS nationality TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pan TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS aadhaar TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS recruiter_id INTEGER",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active'",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 0",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notes TEXT",
            # employees: v2 fields
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender TEXT",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS dob DATE",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status TEXT",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Indian'",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS blood_group TEXT",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS notice_period INTEGER",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS linkedin_url TEXT",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT",
            # timesheets: rejection_reason
            "ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS rejection_reason TEXT",
            # invoices: cost_centre tracking
            "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_centre_id INTEGER",
            # departments: parent/manager
            "ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_dept_id INTEGER",
            "ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INTEGER",
            "ALTER TABLE departments ADD COLUMN IF NOT EXISTS location_id INTEGER",
            # bills_expenses table
            "CREATE TABLE IF NOT EXISTS bills_expenses (id SERIAL PRIMARY KEY, expense_type TEXT NOT NULL, vendor_id INTEGER REFERENCES vendors(id), project_id INTEGER, client_id INTEGER REFERENCES clients(id), cost_centre_id INTEGER REFERENCES cost_centres(id), amount NUMERIC NOT NULL DEFAULT 0, tax_amount NUMERIC DEFAULT 0, total_amount NUMERIC NOT NULL DEFAULT 0, currency TEXT DEFAULT 'INR', expense_date DATE NOT NULL, due_date DATE, payment_date DATE, payment_ref TEXT, payment_mode TEXT DEFAULT 'Bank Transfer', status TEXT DEFAULT 'Draft', description TEXT, bill_number TEXT, po_number TEXT, receipt_data TEXT, receipt_name TEXT, submitted_by INTEGER REFERENCES employees(id), approved_by INTEGER REFERENCES employees(id), approved_at TIMESTAMP, rejection_reason TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER",
            # employees table
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS business_unit_id INTEGER",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_by INTEGER",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by INTEGER",
            # master_user_roles
            "ALTER TABLE master_user_roles ADD COLUMN IF NOT EXISTS description TEXT",
            "ALTER TABLE master_user_roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE",
        ]
        for sql in migrations:
            try:
                cur.execute(sql)
            except Exception as ex:
                print(f"[migration] skip: {ex}", flush=True)
        conn.close()
        print("[v2] Migrations complete", flush=True)
    except Exception as e:
        print(f"[v2] Migration error: {e}", flush=True)


def create_app(config_override=None):
    BASE_DIR   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    STATIC_DIR = os.path.join(BASE_DIR, 'static')
    app = Flask(__name__, static_folder=STATIC_DIR)
    cfg = config_override or get_config()
    app.config.from_object(cfg)

    # Bootstrap DB
    with app.app_context():
        _bootstrap_v2(app)
        _run_migrations(app)
        _seed_masters(app)

    # Register all blueprints
    from .blueprints.auth.routes         import auth_bp
    from .blueprints.organisation.routes import org_bp
    from .blueprints.people.routes       import people_bp
    from .blueprints.timesheets.routes   import ts_bp
    from .blueprints.recruitment.routes  import rec_bp
    from .blueprints.invoices.routes     import inv_bp
    from .blueprints.clients.routes      import clients_bp
    from .blueprints.vendors.routes      import vendors_bp
    from .blueprints.reports.routes      import reports_bp
    from .blueprints.admin.routes        import admin_bp
    from .blueprints.portal.routes       import portal_bp
    from .blueprints.projects.routes     import projects_bp
    from .blueprints.bills.routes        import bills_bp

    for bp in [auth_bp, org_bp, people_bp, ts_bp, rec_bp,
               inv_bp, clients_bp, vendors_bp, reports_bp, admin_bp,
               portal_bp, projects_bp, bills_bp]:
        app.register_blueprint(bp)

    @app.after_request
    def cors(response):
        response.headers['Access-Control-Allow-Origin']  = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-Auth-Token,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        # Force no-cache on JS and CSS so browser always gets latest version
        path = request.path
        if path.startswith('/static/') and (path.endswith('.js') or path.endswith('.css')):
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma']  = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    @app.route('/api/v1/options', methods=['OPTIONS'])
    def options(): return '', 204

    @app.route('/api/v1/health')
    def health():
        try:
            conn = get_pg_conn(); cur = conn.cursor(); cur.execute("SELECT 1"); conn.close()
            db_ok = True
        except Exception: db_ok = False
        return jsonify({"status": "healthy" if db_ok else "degraded",
                        "version": "2.0.0", "db": "connected" if db_ok else "error"})

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def catch_all(path):
        if path.startswith('api/'):
            return jsonify({"success": False, "message": "Not found"}), 404
        resp = make_response(send_from_directory(STATIC_DIR, 'index.html'))
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        resp.headers['Pragma']  = 'no-cache'
        resp.headers['Expires'] = '0'
        return resp

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "message": "Not found"}), 404

    @app.errorhandler(Exception)
    def handle_exception(e):
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500

    return app
