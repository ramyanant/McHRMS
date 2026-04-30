#!/usr/bin/env python3
"""
HireFlow Pro — Flask REST API Backend
SQLite3 database-driven, full CRUD for all modules
"""
import sqlite3
import json
import os
from datetime import datetime, date
from flask import Flask, request, jsonify, g, send_from_directory

# ── App setup ────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# static/ and db/ may be next to app.py OR at the repo root (one level up).
# This handles both local dev and Railway/Render where cwd is /app.
def _find_dir(name):
    candidates = [
        os.path.join(BASE_DIR, name),          # api/static  or  api/db
        os.path.join(BASE_DIR, '..', name),    # repo root:  static/  or  db/
        os.path.join('/app', name),            # /app/static  (Railway working dir)
    ]
    for c in candidates:
        if os.path.isdir(c):
            return os.path.abspath(c)
    return os.path.abspath(os.path.join(BASE_DIR, '..', name))

STATIC = _find_dir('static')
print(f"[startup] static folder: {STATIC}  (exists={os.path.isdir(STATIC)})", flush=True)

_default_db = os.path.join(_find_dir('db'), 'hireflow.db')
DB_PATH = os.environ.get('DB_PATH', _default_db)
print(f"[startup] DB path: {DB_PATH}", flush=True)

app = Flask(__name__, static_folder=STATIC)
app.config['JSON_SORT_KEYS'] = False

# ── Auto-init DB on first boot (Railway / Render / local) ────────────────────
def _bootstrap_db():
    """Create schema + seed demo data if the DB file does not yet exist."""
    if os.path.exists(DB_PATH):
        return
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    print(f"📦 First boot — initialising database at {DB_PATH}")
    schema_candidates = [
        os.path.join(BASE_DIR, '..', 'db', 'schema.sql'),
        os.path.join(BASE_DIR, 'db', 'schema.sql'),
        os.path.join(BASE_DIR, 'schema.sql'),
    ]
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    for sf in schema_candidates:
        if os.path.exists(sf):
            with open(sf) as f:
                conn.executescript(f.read())
            print(f"✓ Schema applied from {sf}")
            break
    else:
        print("⚠️  schema.sql not found — skipping DDL (tables may be missing)")
    _seed_demo(conn)
    conn.commit()
    conn.close()
    print("✓ Database ready")

def _seed_demo(conn):
    if conn.execute("SELECT COUNT(*) FROM clients").fetchone()[0] > 0:
        return
    print("🌱 Seeding demo data…")
    conn.executemany("INSERT INTO business_units (name,description) VALUES (?,?)", [
        ("Technology Services","Engineering, DevOps, QA"),
        ("Staffing Solutions","Talent Acquisition, Onboarding"),
        ("Business Operations","Finance, Legal, Compliance"),
        ("Sales & Marketing","Sales, Marketing, Client Success"),
    ])
    conn.executemany("INSERT INTO departments (name,business_unit_id,head_name,budget,cost_center,location) VALUES (?,?,?,?,?,?)", [
        ("Engineering",1,"Ravi Kumar",4200000,"CC-001","New York"),
        ("HR & Talent",2,"Aisha Kumar",640000,"CC-007","New York"),
        ("Sales",4,"Sandra Bloom",2800000,"CC-005","New York"),
        ("Finance",3,"Tom Wright",580000,"CC-009","New York"),
        ("Product",1,"Leo Chang",920000,"CC-004","San Francisco"),
    ])
    conn.executemany("INSERT INTO office_locations (name,city,country,type,headcount) VALUES (?,?,?,?,?)", [
        ("New York (HQ)","New York","USA","Headquarters",420),
        ("San Francisco","San Francisco","USA","Regional",310),
        ("Austin","Austin","USA","Regional",185),
        ("London","London","UK","International",140),
        ("Hyderabad","Hyderabad","India","Development",229),
    ])
    conn.executemany("INSERT INTO clients (name,industry,contract_type,billing_rate,payment_terms,primary_contact,contact_email,account_manager,health_score,status) VALUES (?,?,?,?,?,?,?,?,?,?)", [
        ("Acme Inc.","Technology","Staff Augmentation","$145/hr","Net 30","Brian Cole","brian@acme.com","Aisha Kumar",98,"Active"),
        ("TechCorp","Finance","MSA + SOW","$165/hr","Net 30","Sara Fine","sara@techcorp.com","Carlos Mendez",94,"Active"),
        ("GloboCorp","Retail","Direct Hire","18% fee","Net 45","Mike Rand","mike@globo.com","Jenny Liu",42,"At Risk"),
        ("DataSys","Healthcare","MSA","$135/hr","Net 30","Amy Ling","amy@datasys.com","Dev Rao",86,"Active"),
        ("NovaTech","Manufacturing","Staff Augmentation","$120/hr","Net 30","Rob Steel","rob@novatech.com","Sara Hassan",91,"Active"),
    ])
    conn.executemany("INSERT INTO vendors (name,category,primary_contact,contact_email,contract_end,sla_score,spend_mtd,sla_description) VALUES (?,?,?,?,?,?,?,?)", [
        ("LinkedIn Talent","Job Board","Sarah M.","sarah@linkedin.com","2026-12-31",97,28000,"Response rate ≥85%"),
        ("Sterling BGC","Background Check","John T.","john@sterling.com","2026-06-30",99,14000,"Turnaround within 72 hours"),
        ("TechStaff Inc.","Sub-Vendor","Mike R.","mike@techstaff.com","2026-03-31",82,185000,"Submittal quality ≥90%"),
        ("Workday HCM","Technology","Lisa K.","lisa@workday.com","2027-01-31",100,18000,"99.9% uptime SLA"),
        ("Checkr","Background Check","Tom B.","tom@checkr.com","2026-08-31",71,8000,"Turnaround within 48 hours"),
    ])
    conn.executemany("INSERT INTO employees (emp_id,first_name,last_name,email,job_title,department_id,employment_type,location,salary,bill_rate,start_date,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
        ("EMP-0001","Ravi","Kumar","ravi@hireflow.com","VP Engineering",1,"Full-Time","New York",220000,0,"2019-01-15","Active"),
        ("EMP-0002","Aisha","Kumar","aisha@hireflow.com","HR Director",2,"Full-Time","New York",180000,0,"2020-02-10","Active"),
        ("EMP-0003","Carlos","Mendez","carlos@hireflow.com","Sr. Recruiter",2,"Full-Time","Austin",95000,0,"2021-03-22","Active"),
        ("EMP-0004","Sandra","Bloom","sandra@hireflow.com","VP Sales",3,"Full-Time","New York",240000,0,"2018-06-01","Active"),
        ("EMP-0005","Marcus","Torres","marcus@hireflow.com","Account Executive",3,"Full-Time","San Francisco",110000,145,"2021-06-15","Active"),
        ("CTR-0891","James","Obi","james@contractor.com","DevOps Engineer",1,"Contractor","Remote",0,120,"2026-04-21","Active"),
        ("EMP-1284","Priya","Sharma","priya@hireflow.com","Sr. React Developer",1,"Full-Time","Remote",155000,0,"2026-05-05","Onboarding"),
    ])
    conn.executemany("INSERT INTO job_requisitions (title,client_id,engagement_type,department_id,recruiter_id,priority,location,comp_min,comp_max,opened_date,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
        ("Sr. Software Engineer",1,"Staff Augmentation",1,2,"High","Remote / New York",140000,160000,"2026-04-09","Active"),
        ("Data Engineer",4,"Staff Augmentation",1,3,"High","Remote",130000,150000,"2026-04-03","Active"),
        ("Product Manager",2,"Direct Hire",5,3,"Medium","New York",155000,175000,"2026-04-15","Active"),
        ("DevOps Architect",1,"Staff Augmentation",1,2,"Medium","Remote / SF",145000,165000,"2026-03-27","Active"),
        ("UX Designer",5,"Direct Hire",1,2,"Normal","San Francisco",100000,120000,"2026-04-20","Active"),
    ])
    conn.executemany("INSERT INTO candidates (first_name,last_name,email,phone,location,current_title,years_exp,source,skills) VALUES (?,?,?,?,?,?,?,?,?)", [
        ("Ananya","Reddy","ananya@email.com","+1-555-1001","Hyderabad","Software Engineer",5,"LinkedIn","React,Node.js,TypeScript"),
        ("James","Park","jpark@email.com","+1-555-1002","Remote","Data Engineer",4,"Indeed","Python,Spark,Kafka"),
        ("Kevin","Nguyen","kevin@email.com","+1-555-1004","Austin","DevOps Architect",8,"GitHub","AWS,Kubernetes,Terraform"),
        ("Sofia","Patel","sofia@email.com","+1-555-1009","Chicago","Product Manager",9,"LinkedIn","Enterprise SaaS,B2B,OKRs"),
        ("Keisha","Brown","keisha@email.com","+1-555-1012","New York","UX Designer",6,"Referral","Figma,Design Systems"),
    ])
    conn.executemany("INSERT INTO applications (candidate_id,requisition_id,stage,expected_salary,recruiter_id) VALUES (?,?,?,?,?)", [
        (1,1,"Applied",120000,2),(2,2,"Applied",135000,3),
        (3,4,"Screening",145000,3),(4,3,"Technical",165000,3),
        (5,5,"Screening",110000,2),
    ])
    conn.executemany("INSERT INTO invoices (invoice_number,client_id,invoice_type,period_start,period_end,amount,tax_amount,due_date,paid_date,status) VALUES (?,?,?,?,?,?,?,?,?,?)", [
        ("INV-1001",1,"Staff Augmentation","2026-04-16","2026-04-30",84500,0,"2026-05-15",None,"Sent"),
        ("INV-1002",2,"Staff Augmentation","2026-04-16","2026-04-30",62000,0,"2026-05-15","2026-04-27","Paid"),
        ("INV-1003",3,"Direct Hire",None,None,38500,0,"2026-04-25",None,"Overdue"),
        ("INV-1004",4,"Staff Augmentation","2026-04-01","2026-04-15",51750,0,"2026-04-30","2026-04-26","Paid"),
    ])
    conn.executemany("INSERT INTO payroll_runs (run_date,period_start,period_end,run_type,employee_count,gross_amount,net_amount,tax_amount,status) VALUES (?,?,?,?,?,?,?,?,?)", [
        ("2026-05-02","2026-04-16","2026-04-30","Semi-Monthly FTE",5,420000,315000,105000,"Processing"),
        ("2026-05-15","2026-05-01","2026-05-15","Semi-Monthly FTE",5,420000,0,0,"Scheduled"),
    ])
    conn.executemany("INSERT INTO activity_log (entity_type,entity_id,action,description,user_name) VALUES (?,?,?,?,?)", [
        ("applications","4","stage_change","Sofia Patel advanced to Technical round — Product Manager at TechCorp","Aisha Kumar"),
        ("invoices","1","sent","Invoice #INV-1001 sent to Acme Inc. — $84,500","System"),
        ("invoices","2","paid","Payment received — TechCorp $62,000 via ACH","System"),
        ("timesheets","1","approved","Timesheet approved for Marcus Torres","Aisha Kumar"),
        ("invoices","3","overdue","Invoice #INV-1003 overdue — GloboCorp $38,500","System"),
    ])
    print("✓ Demo data seeded")

_bootstrap_db()

# ── DB helpers ────────────────────────────────────────────────────────────────
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db: db.close()

def rows_to_list(rows):
    return [dict(r) for r in rows]

def ok(data=None, msg="ok", status=200):
    return jsonify({"success": True, "message": msg, "data": data}), status

def err(msg="Error", status=400):
    return jsonify({"success": False, "message": msg}), status

def log_activity(entity_type, entity_id, action, description, user="System"):
    db = get_db()
    db.execute(
        "INSERT INTO activity_log (entity_type,entity_id,action,description,user_name) VALUES (?,?,?,?,?)",
        (entity_type, str(entity_id), action, description, user)
    )

# ── CORS (manual, no flask-cors needed) ──────────────────────────────────────
@app.after_request
def add_cors(r):
    r.headers['Access-Control-Allow-Origin']  = '*'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    r.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    return r

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api/'):
        return err("Not found", 404)
    return send_from_directory(STATIC, 'index.html')

@app.route('/api/options', methods=['OPTIONS'])
def handle_options():
    return '', 204

# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/dashboard')
def dashboard():
    db = get_db()

    # KPIs
    emp_count    = db.execute("SELECT COUNT(*) FROM employees WHERE status IN ('Active','Onboarding')").fetchone()[0]
    open_reqs    = db.execute("SELECT COUNT(*) FROM job_requisitions WHERE status='Active'").fetchone()[0]
    revenue_mtd  = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").fetchone()[0]
    pending_inv  = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status IN ('Sent','Overdue')").fetchone()[0]

    # Funnel
    funnel = {}
    for stage in ['Applied','Screening','Technical','Offer','Placed']:
        funnel[stage] = db.execute("SELECT COUNT(*) FROM applications WHERE stage=?", (stage,)).fetchone()[0]

    # Top recruiters
    top_rec = rows_to_list(db.execute("""
        SELECT e.first_name||' '||e.last_name AS name,
               COUNT(a.id) AS hires
        FROM applications a
        JOIN employees e ON e.id = a.recruiter_id
        WHERE a.stage='Placed'
        GROUP BY a.recruiter_id
        ORDER BY hires DESC LIMIT 5
    """).fetchall())

    # Client revenue
    client_rev = rows_to_list(db.execute("""
        SELECT c.name, COALESCE(SUM(i.amount),0) AS revenue
        FROM clients c
        LEFT JOIN invoices i ON i.client_id=c.id
            AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')
        WHERE c.status='Active'
        GROUP BY c.id ORDER BY revenue DESC LIMIT 6
    """).fetchall())

    # Urgent reqs
    urgent = rows_to_list(db.execute("""
        SELECT r.id, r.title, c.name AS client, r.priority,
               CAST(julianday('now')-julianday(r.opened_date) AS INTEGER) AS days_open
        FROM job_requisitions r
        JOIN clients c ON c.id=r.client_id
        WHERE r.status='Active'
        ORDER BY CASE r.priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
                 days_open DESC LIMIT 6
    """).fetchall())

    # Activity feed
    activity = rows_to_list(db.execute("""
        SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10
    """).fetchall())

    # Revenue trend (last 6 months simulated from invoices)
    trend = rows_to_list(db.execute("""
        SELECT strftime('%b',created_at) AS month,
               COALESCE(SUM(amount),0) AS revenue
        FROM invoices
        GROUP BY strftime('%Y-%m',created_at)
        ORDER BY strftime('%Y-%m',created_at) DESC LIMIT 6
    """).fetchall())
    trend.reverse()

    return ok({
        "kpis": {
            "active_employees": emp_count,
            "open_requisitions": open_reqs,
            "revenue_mtd": revenue_mtd,
            "pending_invoices": pending_inv,
        },
        "funnel": funnel,
        "top_recruiters": top_rec,
        "client_revenue": client_rev,
        "urgent_requisitions": urgent,
        "activity": activity,
        "revenue_trend": trend,
    })

# ═══════════════════════════════════════════════════════════════════════════════
# ORGANIZATION
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/org/summary')
def org_summary():
    db = get_db()
    dept_count   = db.execute("SELECT COUNT(*) FROM departments").fetchone()[0]
    office_count = db.execute("SELECT COUNT(*) FROM office_locations").fetchone()[0]
    bu_count     = db.execute("SELECT COUNT(*) FROM business_units").fetchone()[0]
    return ok({"departments": dept_count, "offices": office_count, "business_units": bu_count})

@app.route('/api/departments', methods=['GET','POST'])
def departments():
    db = get_db()
    if request.method == 'GET':
        rows = db.execute("""
            SELECT d.*, b.name AS business_unit,
                   (SELECT COUNT(*) FROM employees e WHERE e.department_id=d.id AND e.status IN ('Active','Onboarding')) AS headcount
            FROM departments d
            LEFT JOIN business_units b ON b.id=d.business_unit_id
            ORDER BY d.name
        """).fetchall()
        return ok(rows_to_list(rows))

    data = request.get_json()
    cur = db.execute(
        "INSERT INTO departments (name,business_unit_id,head_name,budget,cost_center,location) VALUES (?,?,?,?,?,?)",
        (data['name'], data.get('business_unit_id'), data.get('head_name'),
         data.get('budget', 0), data.get('cost_center'), data.get('location'))
    )
    db.commit()
    return ok({"id": cur.lastrowid}, "Department created", 201)

@app.route('/api/departments/<int:did>', methods=['PUT','DELETE'])
def department_detail(did):
    db = get_db()
    if request.method == 'DELETE':
        db.execute("DELETE FROM departments WHERE id=?", (did,))
        db.commit()
        return ok(msg="Department deleted")
    data = request.get_json()
    db.execute("UPDATE departments SET name=?,head_name=?,budget=?,status=? WHERE id=?",
               (data['name'], data.get('head_name'), data.get('budget',0), data.get('status','Active'), did))
    db.commit()
    return ok(msg="Department updated")

@app.route('/api/business-units')
def business_units():
    db = get_db()
    rows = db.execute("""
        SELECT b.*, COUNT(d.id) AS dept_count,
               (SELECT COUNT(*) FROM employees e JOIN departments d2 ON d2.id=e.department_id WHERE d2.business_unit_id=b.id AND e.status='Active') AS headcount
        FROM business_units b LEFT JOIN departments d ON d.business_unit_id=b.id
        GROUP BY b.id
    """).fetchall()
    return ok(rows_to_list(rows))

@app.route('/api/offices')
def offices():
    db = get_db()
    return ok(rows_to_list(db.execute("SELECT * FROM office_locations ORDER BY name").fetchall()))

# ═══════════════════════════════════════════════════════════════════════════════
# CLIENTS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/clients', methods=['GET','POST'])
def clients():
    db = get_db()
    if request.method == 'GET':
        rows = db.execute("""
            SELECT c.*,
                (SELECT COUNT(*) FROM job_requisitions r WHERE r.client_id=c.id AND r.status='Active') AS open_reqs,
                (SELECT COUNT(*) FROM employees e WHERE e.client_id=c.id AND e.status='Active') AS placements,
                (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')) AS revenue_mtd
            FROM clients c ORDER BY c.name
        """).fetchall()
        return ok(rows_to_list(rows))

    data = request.get_json()
    cur = db.execute(
        "INSERT INTO clients (name,industry,contract_type,billing_rate,payment_terms,primary_contact,contact_email,address,account_manager) VALUES (?,?,?,?,?,?,?,?,?)",
        (data['name'], data.get('industry'), data.get('contract_type','Staff Augmentation'),
         data.get('billing_rate'), data.get('payment_terms','Net 30'),
         data.get('primary_contact'), data.get('contact_email'),
         data.get('address'), data.get('account_manager'))
    )
    db.commit()
    log_activity("clients", cur.lastrowid, "created", f"Client '{data['name']}' added")
    db.commit()
    return ok({"id": cur.lastrowid}, "Client created", 201)

@app.route('/api/clients/<int:cid>', methods=['GET','PUT','DELETE'])
def client_detail(cid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("SELECT * FROM clients WHERE id=?", (cid,)).fetchone()
        if not row: return err("Not found", 404)
        return ok(dict(row))
    if request.method == 'DELETE':
        db.execute("DELETE FROM clients WHERE id=?", (cid,))
        db.commit()
        return ok(msg="Client deleted")
    data = request.get_json()
    db.execute("""UPDATE clients SET name=?,industry=?,contract_type=?,billing_rate=?,
                  payment_terms=?,primary_contact=?,contact_email=?,address=?,
                  account_manager=?,status=?,health_score=? WHERE id=?""",
               (data['name'], data.get('industry'), data.get('contract_type'),
                data.get('billing_rate'), data.get('payment_terms'),
                data.get('primary_contact'), data.get('contact_email'),
                data.get('address'), data.get('account_manager'),
                data.get('status','Active'), data.get('health_score',80), cid))
    db.commit()
    return ok(msg="Client updated")

# ═══════════════════════════════════════════════════════════════════════════════
# VENDORS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/vendors', methods=['GET','POST'])
def vendors():
    db = get_db()
    if request.method == 'GET':
        return ok(rows_to_list(db.execute("SELECT * FROM vendors ORDER BY name").fetchall()))
    data = request.get_json()
    cur = db.execute(
        "INSERT INTO vendors (name,category,primary_contact,contact_email,contract_end,sla_score,spend_mtd,sla_description) VALUES (?,?,?,?,?,?,?,?)",
        (data['name'], data.get('category'), data.get('primary_contact'),
         data.get('contact_email'), data.get('contract_end'),
         data.get('sla_score', 90), data.get('spend_mtd', 0), data.get('sla_description'))
    )
    db.commit()
    return ok({"id": cur.lastrowid}, "Vendor created", 201)

@app.route('/api/vendors/<int:vid>', methods=['PUT','DELETE'])
def vendor_detail(vid):
    db = get_db()
    if request.method == 'DELETE':
        db.execute("DELETE FROM vendors WHERE id=?", (vid,))
        db.commit()
        return ok(msg="Vendor deleted")
    data = request.get_json()
    db.execute("""UPDATE vendors SET name=?,category=?,primary_contact=?,contact_email=?,
                  contract_end=?,sla_score=?,spend_mtd=?,sla_description=?,status=? WHERE id=?""",
               (data['name'], data.get('category'), data.get('primary_contact'),
                data.get('contact_email'), data.get('contract_end'),
                data.get('sla_score',90), data.get('spend_mtd',0),
                data.get('sla_description'), data.get('status','Active'), vid))
    db.commit()
    return ok(msg="Vendor updated")

# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEES
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/employees', methods=['GET','POST'])
def employees():
    db = get_db()
    if request.method == 'GET':
        status   = request.args.get('status')
        dept_id  = request.args.get('department_id')
        emp_type = request.args.get('employment_type')
        q        = request.args.get('q', '')

        sql = """
            SELECT e.*, d.name AS department_name, c.name AS client_name,
                   m.first_name||' '||m.last_name AS manager_name
            FROM employees e
            LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN clients c ON c.id=e.client_id
            LEFT JOIN employees m ON m.id=e.manager_id
            WHERE 1=1
        """
        params = []
        if status:   sql += " AND e.status=?";         params.append(status)
        if dept_id:  sql += " AND e.department_id=?";  params.append(dept_id)
        if emp_type: sql += " AND e.employment_type=?"; params.append(emp_type)
        if q:        sql += " AND (e.first_name||' '||e.last_name LIKE ? OR e.emp_id LIKE ? OR e.job_title LIKE ?)"; params += [f'%{q}%']*3
        sql += " ORDER BY e.last_name, e.first_name"

        return ok(rows_to_list(db.execute(sql, params).fetchall()))

    data = request.get_json()
    # Auto-generate emp_id
    count = db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    prefix = "CTR" if data.get('employment_type','').startswith('Cont') else "EMP"
    emp_id = f"{prefix}-{count+1:04d}"

    cur = db.execute("""
        INSERT INTO employees (emp_id,first_name,last_name,email,phone,job_title,
            department_id,employment_type,location,manager_id,client_id,salary,bill_rate,start_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (emp_id, data['first_name'], data['last_name'],
          data.get('email'), data.get('phone'), data.get('job_title'),
          data.get('department_id'), data.get('employment_type','Full-Time'),
          data.get('location'), data.get('manager_id'), data.get('client_id'),
          data.get('salary',0), data.get('bill_rate',0), data.get('start_date')))
    db.commit()
    log_activity("employees", cur.lastrowid, "hired",
                 f"Employee {data['first_name']} {data['last_name']} ({emp_id}) added")
    db.commit()
    return ok({"id": cur.lastrowid, "emp_id": emp_id}, "Employee created", 201)

@app.route('/api/employees/<int:eid>', methods=['GET','PUT','DELETE'])
def employee_detail(eid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("""
            SELECT e.*, d.name AS department_name, c.name AS client_name,
                   m.first_name||' '||m.last_name AS manager_name
            FROM employees e
            LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN clients c ON c.id=e.client_id
            LEFT JOIN employees m ON m.id=e.manager_id
            WHERE e.id=?
        """, (eid,)).fetchone()
        if not row: return err("Not found", 404)
        return ok(dict(row))
    if request.method == 'DELETE':
        db.execute("UPDATE employees SET status='Terminated' WHERE id=?", (eid,))
        db.commit()
        return ok(msg="Employee terminated")
    data = request.get_json()
    db.execute("""UPDATE employees SET first_name=?,last_name=?,email=?,phone=?,
                  job_title=?,department_id=?,employment_type=?,location=?,
                  manager_id=?,client_id=?,salary=?,bill_rate=?,start_date=?,status=? WHERE id=?""",
               (data['first_name'], data['last_name'], data.get('email'), data.get('phone'),
                data.get('job_title'), data.get('department_id'), data.get('employment_type'),
                data.get('location'), data.get('manager_id'), data.get('client_id'),
                data.get('salary',0), data.get('bill_rate',0), data.get('start_date'),
                data.get('status','Active'), eid))
    db.commit()
    return ok(msg="Employee updated")

# ═══════════════════════════════════════════════════════════════════════════════
# TIMESHEETS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/timesheets', methods=['GET','POST'])
def timesheets():
    db = get_db()
    if request.method == 'GET':
        status = request.args.get('status')
        sql = """
            SELECT t.*, e.first_name||' '||e.last_name AS employee_name,
                   e.emp_id, c.name AS client_name
            FROM timesheets t
            JOIN employees e ON e.id=t.employee_id
            LEFT JOIN clients c ON c.id=t.client_id
            WHERE 1=1
        """
        params = []
        if status: sql += " AND t.status=?"; params.append(status)
        sql += " ORDER BY t.week_ending DESC, t.submitted_at DESC"
        return ok(rows_to_list(db.execute(sql, params).fetchall()))

    data = request.get_json()
    cur = db.execute("""
        INSERT INTO timesheets (employee_id,client_id,project,week_ending,regular_hours,overtime_hours,bill_rate)
        VALUES (?,?,?,?,?,?,?)
    """, (data['employee_id'], data.get('client_id'), data.get('project'),
          data['week_ending'], data.get('regular_hours',0),
          data.get('overtime_hours',0), data.get('bill_rate',0)))
    db.commit()
    return ok({"id": cur.lastrowid}, "Timesheet submitted", 201)

@app.route('/api/timesheets/<int:tid>', methods=['GET','PUT'])
def timesheet_detail(tid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("SELECT * FROM timesheets WHERE id=?", (tid,)).fetchone()
        return ok(dict(row)) if row else err("Not found", 404)
    data = request.get_json()
    db.execute("UPDATE timesheets SET status=?,notes=? WHERE id=?",
               (data.get('status','Pending'), data.get('notes'), tid))
    if data.get('status') == 'Approved':
        db.execute("UPDATE timesheets SET approved_at=datetime('now') WHERE id=?", (tid,))
    db.commit()
    log_activity("timesheets", tid, data.get('status','updated').lower(),
                 f"Timesheet #{tid} {data.get('status','updated')}")
    db.commit()
    return ok(msg=f"Timesheet {data.get('status','updated')}")

@app.route('/api/timesheets/summary')
def timesheet_summary():
    db = get_db()
    total    = db.execute("SELECT COALESCE(SUM(total_hours),0) FROM timesheets WHERE week_ending='2026-04-25'").fetchone()[0]
    billable = db.execute("SELECT COALESCE(SUM(total_hours),0) FROM timesheets WHERE week_ending='2026-04-25' AND bill_rate>0").fetchone()[0]
    pending  = db.execute("SELECT COUNT(*) FROM timesheets WHERE status='Pending'").fetchone()[0]
    ot_count = db.execute("SELECT COUNT(*) FROM timesheets WHERE overtime_hours>0 AND status='Pending'").fetchone()[0]
    return ok({"total_hours": total, "billable_hours": billable,
               "pending_approval": pending, "ot_alerts": ot_count,
               "utilization": round(billable/total*100, 1) if total else 0})

# ═══════════════════════════════════════════════════════════════════════════════
# PAYROLL
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/payroll', methods=['GET','POST'])
def payroll():
    db = get_db()
    if request.method == 'GET':
        return ok(rows_to_list(db.execute("SELECT * FROM payroll_runs ORDER BY run_date DESC").fetchall()))
    data = request.get_json()
    cur = db.execute(
        "INSERT INTO payroll_runs (run_date,period_start,period_end,run_type,employee_count,gross_amount,status) VALUES (?,?,?,?,?,?,?)",
        (data['run_date'], data.get('period_start'), data.get('period_end'),
         data.get('run_type','Semi-Monthly FTE'), data.get('employee_count',0),
         data.get('gross_amount',0), 'Scheduled')
    )
    db.commit()
    return ok({"id": cur.lastrowid}, "Payroll run scheduled", 201)

@app.route('/api/payroll/summary')
def payroll_summary():
    db = get_db()
    # Compute from employees
    total_salary = db.execute("SELECT COALESCE(SUM(salary),0)/12 FROM employees WHERE employment_type='Full-Time' AND status='Active'").fetchone()[0]
    contractor   = db.execute("SELECT COALESCE(SUM(bill_rate),0)*160 FROM employees WHERE employment_type='Contractor' AND status='Active'").fetchone()[0]
    return ok({
        "base_salaries": round(total_salary),
        "contractor_payments": round(contractor),
        "overtime": 84000,
        "benefits": round(total_salary * 0.10),
        "taxes": round(total_salary * 0.0765 + contractor * 0.0765),
        "total": round(total_salary + contractor + 84000),
    })

# ═══════════════════════════════════════════════════════════════════════════════
# JOB REQUISITIONS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/requisitions', methods=['GET','POST'])
def requisitions():
    db = get_db()
    if request.method == 'GET':
        priority = request.args.get('priority')
        status   = request.args.get('status', 'Active')
        q        = request.args.get('q','')
        sql = """
            SELECT r.*, c.name AS client_name,
                   e.first_name||' '||e.last_name AS recruiter_name,
                   CAST(julianday('now')-julianday(r.opened_date) AS INTEGER) AS days_open,
                   (SELECT COUNT(*) FROM applications a WHERE a.requisition_id=r.id) AS applicant_count,
                   (SELECT COUNT(*) FROM applications a WHERE a.requisition_id=r.id AND a.stage NOT IN ('Applied','Rejected')) AS in_pipeline
            FROM job_requisitions r
            JOIN clients c ON c.id=r.client_id
            LEFT JOIN employees e ON e.id=r.recruiter_id
            WHERE 1=1
        """
        params = []
        if status:   sql += " AND r.status=?"; params.append(status)
        if priority: sql += " AND r.priority=?"; params.append(priority)
        if q:        sql += " AND r.title LIKE ?"; params.append(f'%{q}%')
        sql += " ORDER BY CASE r.priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, days_open DESC"
        return ok(rows_to_list(db.execute(sql, params).fetchall()))

    data = request.get_json()
    cur = db.execute("""
        INSERT INTO job_requisitions (title,client_id,engagement_type,department_id,recruiter_id,
            priority,location,comp_min,comp_max,description,target_start,opened_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,date('now'))
    """, (data['title'], data['client_id'], data.get('engagement_type','Staff Augmentation'),
          data.get('department_id'), data.get('recruiter_id'),
          data.get('priority','Medium'), data.get('location'),
          data.get('comp_min'), data.get('comp_max'),
          data.get('description'), data.get('target_start')))
    db.commit()
    log_activity("requisitions", cur.lastrowid, "created", f"Job req '{data['title']}' opened")
    db.commit()
    return ok({"id": cur.lastrowid}, "Requisition created", 201)

@app.route('/api/requisitions/<int:rid>', methods=['GET','PUT','DELETE'])
def requisition_detail(rid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("SELECT r.*, c.name AS client_name FROM job_requisitions r JOIN clients c ON c.id=r.client_id WHERE r.id=?", (rid,)).fetchone()
        return ok(dict(row)) if row else err("Not found", 404)
    if request.method == 'DELETE':
        db.execute("UPDATE job_requisitions SET status='Closed' WHERE id=?", (rid,))
        db.commit()
        return ok(msg="Requisition closed")
    data = request.get_json()
    db.execute("""UPDATE job_requisitions SET title=?,priority=?,status=?,location=?,
                  comp_min=?,comp_max=?,description=?,recruiter_id=? WHERE id=?""",
               (data['title'], data.get('priority'), data.get('status','Active'),
                data.get('location'), data.get('comp_min'), data.get('comp_max'),
                data.get('description'), data.get('recruiter_id'), rid))
    db.commit()
    return ok(msg="Requisition updated")

# ═══════════════════════════════════════════════════════════════════════════════
# CANDIDATES
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/candidates', methods=['GET','POST'])
def candidates():
    db = get_db()
    if request.method == 'GET':
        q = request.args.get('q','')
        sql = "SELECT * FROM candidates WHERE status='Active'"
        params = []
        if q: sql += " AND (first_name||' '||last_name LIKE ? OR current_title LIKE ? OR skills LIKE ?)"; params=[f'%{q}%']*3
        sql += " ORDER BY created_at DESC"
        return ok(rows_to_list(db.execute(sql, params).fetchall()))

    data = request.get_json()
    cur = db.execute("""
        INSERT INTO candidates (first_name,last_name,email,phone,location,current_title,
            years_exp,source,linkedin_url,skills)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (data['first_name'], data['last_name'], data.get('email'), data.get('phone'),
          data.get('location'), data.get('current_title'), data.get('years_exp',0),
          data.get('source','LinkedIn'), data.get('linkedin_url'), data.get('skills','')))
    db.commit()
    return ok({"id": cur.lastrowid}, "Candidate added", 201)

@app.route('/api/candidates/<int:cid>', methods=['GET','PUT'])
def candidate_detail(cid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("SELECT * FROM candidates WHERE id=?", (cid,)).fetchone()
        apps = rows_to_list(db.execute("""
            SELECT a.*, r.title AS role, cl.name AS client
            FROM applications a
            JOIN job_requisitions r ON r.id=a.requisition_id
            JOIN clients cl ON cl.id=r.client_id
            WHERE a.candidate_id=?
        """, (cid,)).fetchall())
        return ok({**dict(row), "applications": apps}) if row else err("Not found", 404)
    data = request.get_json()
    db.execute("""UPDATE candidates SET first_name=?,last_name=?,email=?,phone=?,
                  current_title=?,years_exp=?,location=?,skills=? WHERE id=?""",
               (data['first_name'], data['last_name'], data.get('email'), data.get('phone'),
                data.get('current_title'), data.get('years_exp'), data.get('location'),
                data.get('skills'), cid))
    db.commit()
    return ok(msg="Candidate updated")

# ═══════════════════════════════════════════════════════════════════════════════
# PIPELINE / APPLICATIONS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/pipeline', methods=['GET'])
def pipeline():
    db = get_db()
    req_id = request.args.get('requisition_id')
    sql = """
        SELECT a.*, c.first_name||' '||c.last_name AS candidate_name,
               c.current_title, c.years_exp, c.location, c.source, c.skills,
               r.title AS role, cl.name AS client,
               e.first_name||' '||e.last_name AS recruiter_name
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions r ON r.id=a.requisition_id
        JOIN clients cl ON cl.id=r.client_id
        LEFT JOIN employees e ON e.id=a.recruiter_id
        WHERE 1=1
    """
    params = []
    if req_id: sql += " AND a.requisition_id=?"; params.append(req_id)
    sql += " ORDER BY a.updated_at DESC"
    rows = rows_to_list(db.execute(sql, params).fetchall())

    # Group by stage
    stages = ['Applied','Screening','Technical','Offer','Placed','Rejected']
    grouped = {s: [] for s in stages}
    for row in rows:
        stage = row['stage'] if row['stage'] in stages else 'Applied'
        grouped[stage].append(row)

    counts = {s: len(grouped[s]) for s in stages}
    return ok({"by_stage": grouped, "counts": counts, "total": len(rows)})

@app.route('/api/applications', methods=['POST'])
def add_application():
    db = get_db()
    data = request.get_json()
    cur = db.execute("""
        INSERT INTO applications (candidate_id,requisition_id,stage,expected_salary,recruiter_id,notes)
        VALUES (?,?,?,?,?,?)
    """, (data['candidate_id'], data['requisition_id'],
          data.get('stage','Applied'), data.get('expected_salary'),
          data.get('recruiter_id'), data.get('notes')))
    db.commit()
    log_activity("applications", cur.lastrowid, "applied", f"Candidate applied to req #{data['requisition_id']}")
    db.commit()
    return ok({"id": cur.lastrowid}, "Application created", 201)

@app.route('/api/applications/<int:aid>', methods=['GET','PUT'])
def application_detail(aid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("""
            SELECT a.*, c.first_name||' '||c.last_name AS candidate_name,
                   r.title AS role, cl.name AS client
            FROM applications a
            JOIN candidates c ON c.id=a.candidate_id
            JOIN job_requisitions r ON r.id=a.requisition_id
            JOIN clients cl ON cl.id=r.client_id
            WHERE a.id=?
        """, (aid,)).fetchone()
        return ok(dict(row)) if row else err("Not found", 404)

    data = request.get_json()
    old = db.execute("SELECT stage FROM applications WHERE id=?", (aid,)).fetchone()
    db.execute("""UPDATE applications SET stage=?,notes=?,rejection_reason=?,
                  updated_at=datetime('now') WHERE id=?""",
               (data.get('stage'), data.get('notes'), data.get('rejection_reason'), aid))
    db.commit()
    if old and old[0] != data.get('stage'):
        log_activity("applications", aid, "stage_change",
                     f"Application #{aid} moved from {old[0]} to {data.get('stage')}")
        db.commit()
    return ok(msg="Application updated")

# ═══════════════════════════════════════════════════════════════════════════════
# INTERVIEWS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/interviews', methods=['GET','POST'])
def interviews():
    db = get_db()
    if request.method == 'GET':
        rows = db.execute("""
            SELECT i.*, a.stage,
                   c.first_name||' '||c.last_name AS candidate_name,
                   r.title AS role, cl.name AS client
            FROM interviews i
            JOIN applications a ON a.id=i.application_id
            JOIN candidates c ON c.id=a.candidate_id
            JOIN job_requisitions r ON r.id=a.requisition_id
            JOIN clients cl ON cl.id=r.client_id
            ORDER BY i.scheduled_at ASC
        """).fetchall()
        return ok(rows_to_list(rows))

    data = request.get_json()
    cur = db.execute("""
        INSERT INTO interviews (application_id,round,format,interviewer,scheduled_at,location_link,notes)
        VALUES (?,?,?,?,?,?,?)
    """, (data['application_id'], data['round'], data.get('format','Video'),
          data.get('interviewer'), data.get('scheduled_at'),
          data.get('location_link'), data.get('notes')))
    db.commit()
    log_activity("interviews", cur.lastrowid, "scheduled", f"Interview scheduled: {data['round']}")
    db.commit()
    return ok({"id": cur.lastrowid}, "Interview scheduled", 201)

@app.route('/api/interviews/<int:iid>', methods=['PUT'])
def interview_detail(iid):
    db = get_db()
    data = request.get_json()
    db.execute("""UPDATE interviews SET scorecard_status=?,decision=?,notes=?,
                  interviewer=?,scheduled_at=?,format=? WHERE id=?""",
               (data.get('scorecard_status'), data.get('decision'),
                data.get('notes'), data.get('interviewer'),
                data.get('scheduled_at'), data.get('format'), iid))
    db.commit()
    return ok(msg="Interview updated")

@app.route('/api/interviews/summary')
def interview_summary():
    db = get_db()
    total    = db.execute("SELECT COUNT(*) FROM interviews WHERE date(scheduled_at) BETWEEN date('now') AND date('now','+7 days')").fetchone()[0]
    pending  = db.execute("SELECT COUNT(*) FROM interviews WHERE scorecard_status='Pending'").fetchone()[0]
    overdue  = db.execute("SELECT COUNT(*) FROM interviews WHERE scorecard_status='Overdue'").fetchone()[0]
    noshows  = db.execute("SELECT COUNT(*) FROM interviews WHERE decision='No Show'").fetchone()[0]
    return ok({"scheduled_this_week": total, "awaiting_feedback": pending,
               "overdue_feedback": overdue, "no_shows": noshows})

# ═══════════════════════════════════════════════════════════════════════════════
# ONBOARDING
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/onboarding', methods=['GET','POST'])
def onboarding():
    db = get_db()
    if request.method == 'GET':
        rows = db.execute("""
            SELECT o.*, e.first_name||' '||e.last_name AS employee_name,
                   e.emp_id, e.job_title, c.name AS client_name
            FROM onboarding o
            JOIN employees e ON e.id=o.employee_id
            LEFT JOIN clients c ON c.id=e.client_id
            WHERE o.status != 'Completed'
            ORDER BY o.start_date ASC
        """).fetchall()
        return ok(rows_to_list(rows))

    data = request.get_json()
    cur = db.execute("""
        INSERT INTO onboarding (employee_id,template,buddy_name,start_date,equipment)
        VALUES (?,?,?,?,?)
    """, (data['employee_id'], data.get('template','Standard FTE'),
          data.get('buddy_name'), data.get('start_date'), data.get('equipment')))
    ob_id = cur.lastrowid

    # Create default tasks
    default_tasks = [
        ("Offer letter signed","Documents"),("Background check","Compliance"),
        ("I-9 verification","Compliance"),("Equipment provisioned","IT"),
        ("System access setup","IT"),("Benefits enrollment","HR"),
        ("Day 1 orientation","HR"),("30-day check-in","HR"),
    ]
    for task, cat in default_tasks:
        db.execute("INSERT INTO onboarding_tasks (onboarding_id,task_name,category) VALUES (?,?,?)",
                   (ob_id, task, cat))
    db.commit()
    return ok({"id": ob_id}, "Onboarding started", 201)

@app.route('/api/onboarding/<int:oid>', methods=['GET','PUT'])
def onboarding_detail(oid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("SELECT o.*, e.first_name||' '||e.last_name AS employee_name FROM onboarding o JOIN employees e ON e.id=o.employee_id WHERE o.id=?", (oid,)).fetchone()
        tasks = rows_to_list(db.execute("SELECT * FROM onboarding_tasks WHERE onboarding_id=? ORDER BY id", (oid,)).fetchall())
        if not row: return err("Not found", 404)
        return ok({**dict(row), "tasks": tasks})
    data = request.get_json()
    db.execute("UPDATE onboarding SET progress_pct=?,status=?,day30_status=?,day60_status=?,day90_status=? WHERE id=?",
               (data.get('progress_pct'), data.get('status'), data.get('day30_status'),
                data.get('day60_status'), data.get('day90_status'), oid))
    db.commit()
    return ok(msg="Onboarding updated")

@app.route('/api/onboarding/tasks/<int:tid>', methods=['PUT'])
def toggle_task(tid):
    db = get_db()
    data = request.get_json()
    complete = 1 if data.get('is_complete') else 0
    db.execute("UPDATE onboarding_tasks SET is_complete=?,completed_at=? WHERE id=?",
               (complete, datetime.now().isoformat() if complete else None, tid))

    # Recalculate progress
    row = db.execute("SELECT onboarding_id FROM onboarding_tasks WHERE id=?", (tid,)).fetchone()
    if row:
        oid = row[0]
        stats = db.execute("SELECT COUNT(*), SUM(is_complete) FROM onboarding_tasks WHERE onboarding_id=?", (oid,)).fetchone()
        pct = round(stats[1]/stats[0]*100) if stats[0] else 0
        db.execute("UPDATE onboarding SET progress_pct=? WHERE id=?", (pct, oid))
    db.commit()
    return ok(msg="Task updated")

# ═══════════════════════════════════════════════════════════════════════════════
# INVOICES
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/invoices', methods=['GET','POST'])
def invoices():
    db = get_db()
    if request.method == 'GET':
        status    = request.args.get('status')
        client_id = request.args.get('client_id')
        sql = """
            SELECT i.*, c.name AS client_name,
                   CAST(julianday('now')-julianday(i.due_date) AS INTEGER) AS days_overdue
            FROM invoices i JOIN clients c ON c.id=i.client_id WHERE 1=1
        """
        params = []
        if status:    sql += " AND i.status=?";    params.append(status)
        if client_id: sql += " AND i.client_id=?"; params.append(client_id)
        sql += " ORDER BY i.created_at DESC"
        return ok(rows_to_list(db.execute(sql, params).fetchall()))

    data = request.get_json()
    # Auto-generate invoice number
    last = db.execute("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1").fetchone()
    if last:
        num = int(last[0].split('-')[1]) + 1
    else:
        num = 1001
    inv_num = f"INV-{num}"

    cur = db.execute("""
        INSERT INTO invoices (invoice_number,client_id,invoice_type,period_start,period_end,
            amount,tax_amount,due_date,po_number,notes)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (inv_num, data['client_id'], data.get('invoice_type','Staff Augmentation'),
          data.get('period_start'), data.get('period_end'),
          data.get('amount',0), data.get('tax_amount',0),
          data.get('due_date'), data.get('po_number'), data.get('notes')))
    db.commit()
    log_activity("invoices", cur.lastrowid, "created", f"Invoice {inv_num} created for client #{data['client_id']}")
    db.commit()
    return ok({"id": cur.lastrowid, "invoice_number": inv_num}, "Invoice created", 201)

@app.route('/api/invoices/<int:iid>', methods=['GET','PUT'])
def invoice_detail(iid):
    db = get_db()
    if request.method == 'GET':
        row = db.execute("SELECT i.*, c.name AS client_name FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=?", (iid,)).fetchone()
        return ok(dict(row)) if row else err("Not found", 404)
    data = request.get_json()
    db.execute("""UPDATE invoices SET status=?,paid_date=?,payment_ref=?,notes=? WHERE id=?""",
               (data.get('status'), data.get('paid_date'), data.get('payment_ref'), data.get('notes'), iid))
    db.commit()
    if data.get('status') == 'Paid':
        row = db.execute("SELECT invoice_number, amount, client_id FROM invoices WHERE id=?", (iid,)).fetchone()
        log_activity("invoices", iid, "paid", f"Invoice {row[0]} marked paid — ${row[1]:,.0f}")
        db.commit()
    return ok(msg="Invoice updated")

@app.route('/api/invoices/summary')
def invoice_summary():
    db = get_db()
    total     = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").fetchone()[0]
    paid      = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='Paid' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").fetchone()[0]
    outstd    = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status IN ('Sent','Overdue')").fetchone()[0]
    overdue   = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='Overdue'").fetchone()[0]
    # AR aging
    aging = {
        "current":  db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='Sent' AND julianday('now')-julianday(due_date)<0").fetchone()[0],
        "d30_60":   db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='Overdue' AND julianday('now')-julianday(due_date) BETWEEN 0 AND 30").fetchone()[0],
        "d60_90":   db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='Overdue' AND julianday('now')-julianday(due_date) BETWEEN 30 AND 60").fetchone()[0],
        "d90_plus": db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='Overdue' AND julianday('now')-julianday(due_date)>60").fetchone()[0],
    }
    return ok({"total_invoiced": total, "paid": paid, "outstanding": outstd,
               "overdue": overdue, "ar_aging": aging})

# ═══════════════════════════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/reports/financial')
def report_financial():
    db = get_db()
    # Monthly revenue last 6 months
    trend = rows_to_list(db.execute("""
        SELECT strftime('%Y-%m',created_at) AS month,
               strftime('%b',created_at) AS label,
               COALESCE(SUM(amount),0) AS revenue,
               COALESCE(SUM(CASE WHEN status='Paid' THEN amount ELSE 0 END),0) AS collected
        FROM invoices GROUP BY strftime('%Y-%m',created_at)
        ORDER BY month DESC LIMIT 6
    """).fetchall())
    trend.reverse()
    # Client revenue
    client_rev = rows_to_list(db.execute("""
        SELECT c.name, COALESCE(SUM(i.amount),0) AS revenue
        FROM clients c LEFT JOIN invoices i ON i.client_id=c.id
        GROUP BY c.id ORDER BY revenue DESC LIMIT 8
    """).fetchall())
    # Summary
    total_rev    = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").fetchone()[0]
    total_payroll= db.execute("SELECT COALESCE(SUM(gross_amount),0) FROM payroll_runs WHERE status IN ('Processing','Completed') AND strftime('%Y-%m',run_date)=strftime('%Y-%m','now')").fetchone()[0]
    return ok({"trend": trend, "client_revenue": client_rev,
               "revenue_mtd": total_rev, "payroll_mtd": total_payroll,
               "gross_margin": round((total_rev - total_payroll) / total_rev * 100, 1) if total_rev else 0})

@app.route('/api/reports/recruiters')
def report_recruiters():
    db = get_db()
    rows = rows_to_list(db.execute("""
        SELECT e.id, e.first_name||' '||e.last_name AS name,
               COUNT(a.id) AS total_apps,
               SUM(CASE WHEN a.stage='Placed' THEN 1 ELSE 0 END) AS hires,
               SUM(CASE WHEN a.stage IN ('Technical','Offer','Placed') THEN 1 ELSE 0 END) AS interviews,
               ROUND(AVG(CASE WHEN r.filled_date IS NOT NULL
                   THEN julianday(r.filled_date)-julianday(r.opened_date) END), 1) AS avg_ttf
        FROM employees e
        JOIN applications a ON a.recruiter_id=e.id
        JOIN job_requisitions r ON r.id=a.requisition_id
        WHERE e.department_id IN (7,8)
        GROUP BY e.id ORDER BY hires DESC
    """).fetchall())
    return ok(rows)

@app.route('/api/reports/applicants')
def report_applicants():
    db = get_db()
    by_recruiter = rows_to_list(db.execute("""
        SELECT e.first_name||' '||e.last_name AS recruiter,
               COUNT(a.id) AS total,
               SUM(CASE WHEN a.stage='Screening' THEN 1 ELSE 0 END) AS screened,
               SUM(CASE WHEN a.stage IN ('Technical','Offer','Placed') THEN 1 ELSE 0 END) AS interviewed,
               SUM(CASE WHEN a.stage IN ('Offer','Placed') THEN 1 ELSE 0 END) AS offered,
               SUM(CASE WHEN a.stage='Placed' THEN 1 ELSE 0 END) AS hired
        FROM applications a
        LEFT JOIN employees e ON e.id=a.recruiter_id
        GROUP BY a.recruiter_id ORDER BY hired DESC
    """).fetchall())
    by_source = rows_to_list(db.execute("""
        SELECT c.source, COUNT(*) AS total,
               SUM(CASE WHEN a.stage='Placed' THEN 1 ELSE 0 END) AS hired,
               ROUND(SUM(CASE WHEN a.stage='Placed' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) AS hire_rate
        FROM applications a JOIN candidates c ON c.id=a.candidate_id
        GROUP BY c.source ORDER BY hire_rate DESC
    """).fetchall())
    return ok({"by_recruiter": by_recruiter, "by_source": by_source})

@app.route('/api/reports/clients')
def report_clients():
    db = get_db()
    rows = rows_to_list(db.execute("""
        SELECT c.*, 
               (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id) AS total_revenue,
               (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')) AS revenue_mtd,
               (SELECT COUNT(*) FROM employees e WHERE e.client_id=c.id AND e.status='Active') AS active_placements,
               (SELECT COUNT(*) FROM job_requisitions r WHERE r.client_id=c.id AND r.status='Active') AS open_reqs
        FROM clients c ORDER BY total_revenue DESC
    """).fetchall())
    return ok(rows)

@app.route('/api/reports/vendors')
def report_vendors():
    db = get_db()
    return ok(rows_to_list(db.execute("""
        SELECT *, CASE WHEN sla_score >= 90 THEN 'Compliant'
                       WHEN sla_score >= 80 THEN 'Watch'
                       ELSE 'Breach' END AS compliance_status
        FROM vendors ORDER BY sla_score DESC
    """).fetchall()))

@app.route('/api/reports/workforce')
def report_workforce():
    db = get_db()
    by_dept = rows_to_list(db.execute("""
        SELECT d.name, COUNT(e.id) AS headcount,
               SUM(CASE WHEN e.employment_type='Full-Time' THEN 1 ELSE 0 END) AS fte,
               SUM(CASE WHEN e.employment_type='Contractor' THEN 1 ELSE 0 END) AS contractors
        FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.status IN ('Active','Onboarding')
        GROUP BY d.id ORDER BY headcount DESC
    """).fetchall())
    totals = db.execute("""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN employment_type='Full-Time' THEN 1 ELSE 0 END) AS fte,
               SUM(CASE WHEN employment_type='Contractor' THEN 1 ELSE 0 END) AS contractors,
               SUM(CASE WHEN status='Onboarding' THEN 1 ELSE 0 END) AS onboarding
        FROM employees WHERE status IN ('Active','Onboarding')
    """).fetchone()
    return ok({"by_department": by_dept, "totals": dict(totals)})

# ═══════════════════════════════════════════════════════════════════════════════
# SOURCING STATS
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/sourcing/stats')
def sourcing_stats():
    db = get_db()
    by_source = rows_to_list(db.execute("""
        SELECT source, COUNT(*) AS total,
               SUM(CASE WHEN a.stage='Placed' THEN 1 ELSE 0 END) AS hired,
               ROUND(SUM(CASE WHEN a.stage='Placed' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) AS hire_rate
        FROM candidates c LEFT JOIN applications a ON a.candidate_id=c.id
        GROUP BY source ORDER BY total DESC
    """).fetchall())
    return ok(by_source)

# ═══════════════════════════════════════════════════════════════════════════════
# ACTIVITY LOG
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/activity')
def activity():
    db = get_db()
    limit = request.args.get('limit', 20)
    rows = db.execute("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return ok(rows_to_list(rows))

# ═══════════════════════════════════════════════════════════════════════════════
# SEARCH (global)
# ═══════════════════════════════════════════════════════════════════════════════
@app.route('/api/search')
def search():
    db = get_db()
    q = request.args.get('q','').strip()
    if len(q) < 2:
        return ok([])
    results = []
    like = f'%{q}%'

    emps = rows_to_list(db.execute(
        "SELECT id,'employee' AS type,first_name||' '||last_name AS label,job_title AS sub FROM employees WHERE (first_name||' '||last_name LIKE ? OR emp_id LIKE ?) AND status='Active' LIMIT 5",
        (like, like)
    ).fetchall())
    clients = rows_to_list(db.execute(
        "SELECT id,'client' AS type,name AS label,industry AS sub FROM clients WHERE name LIKE ? LIMIT 5",
        (like,)
    ).fetchall())
    cands = rows_to_list(db.execute(
        "SELECT id,'candidate' AS type,first_name||' '||last_name AS label,current_title AS sub FROM candidates WHERE first_name||' '||last_name LIKE ? LIMIT 5",
        (like,)
    ).fetchall())
    reqs = rows_to_list(db.execute(
        "SELECT r.id,'requisition' AS type,r.title AS label,c.name AS sub FROM job_requisitions r JOIN clients c ON c.id=r.client_id WHERE r.title LIKE ? AND r.status='Active' LIMIT 5",
        (like,)
    ).fetchall())
    results = emps + clients + cands + reqs
    return ok(results)

# ─── Helper routes ────────────────────────────────────────────────────────────
@app.route('/api/lookup/employees')
def lookup_employees():
    db = get_db()
    rows = db.execute("SELECT id, first_name||' '||last_name AS name, emp_id, job_title FROM employees WHERE status='Active' ORDER BY first_name").fetchall()
    return ok(rows_to_list(rows))

@app.route('/api/lookup/clients')
def lookup_clients():
    db = get_db()
    rows = db.execute("SELECT id, name FROM clients WHERE status='Active' ORDER BY name").fetchall()
    return ok(rows_to_list(rows))

@app.route('/api/lookup/departments')
def lookup_departments():
    db = get_db()
    rows = db.execute("SELECT id, name FROM departments ORDER BY name").fetchall()
    return ok(rows_to_list(rows))

@app.route('/api/health')
def health():
    return ok({"status": "ok", "db": DB_PATH})

# ─── Run ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    # Railway/Render inject PORT as an env var; fall back to CLI arg or 5000
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    print(f"🚀 HireFlow Pro starting on http://0.0.0.0:{port}  debug={debug}")
    app.run(debug=debug, port=port, host='0.0.0.0')
