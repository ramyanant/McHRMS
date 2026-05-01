#!/usr/bin/env python3
"""McHR&TA — Flask REST API v2.0  (McRaaN Human Resources and Talent Acquisition)"""
import sqlite3, os, hashlib, secrets, json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def _find_dir(name):
    for c in [os.path.join(BASE_DIR,name), os.path.join(BASE_DIR,'..', name), os.path.join('/app',name)]:
        if os.path.isdir(c): return os.path.abspath(c)
    return os.path.abspath(os.path.join(BASE_DIR, '..', name))

STATIC  = _find_dir('static')
_db_dir = _find_dir('db')
DB_PATH = os.environ.get('DB_PATH', os.path.join(_db_dir, 'hireflow.db'))
print(f"[startup] static={STATIC} exists={os.path.isdir(STATIC)}", flush=True)
print(f"[startup] db={DB_PATH}", flush=True)

app = Flask(__name__, static_folder=STATIC)
app.config['JSON_SORT_KEYS'] = False
SESSION_HOURS = 12

# ── Bootstrap DB ───────────────────────────────────────────────────────────
def _bootstrap_db():
    if os.path.exists(DB_PATH): return
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    print(f"📦 First boot — creating DB at {DB_PATH}", flush=True)
    schema = next((p for p in [
        os.path.join(BASE_DIR,'..','db','schema.sql'),
        os.path.join(BASE_DIR,'db','schema.sql'),
        os.path.join('/app','db','schema.sql'),
    ] if os.path.exists(p)), None)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON"); conn.execute("PRAGMA journal_mode=WAL")
    if schema:
        with open(schema) as f: conn.executescript(f.read())
    _seed(conn); conn.commit(); conn.close()
    print("✓ DB ready", flush=True)

def _seed(conn):
    if conn.execute("SELECT COUNT(*) FROM master_countries").fetchone()[0] > 0: return
    print("🌱 Seeding demo data…", flush=True)
    c = conn.cursor()
    c.execute("INSERT INTO master_countries(code,name) VALUES('IN','India')")
    c.execute("INSERT INTO master_countries(code,name) VALUES('US','United States')")
    in_id = c.execute("SELECT id FROM master_countries WHERE code='IN'").fetchone()[0]
    all_india_states = [
        ('AN','Andaman & Nicobar Islands'),('AP','Andhra Pradesh'),
        ('AR','Arunachal Pradesh'),('AS','Assam'),('BR','Bihar'),
        ('CH','Chandigarh'),('CG','Chhattisgarh'),('DN','Dadra & Nagar Haveli & Daman & Diu'),
        ('DL','Delhi'),('GA','Goa'),('GJ','Gujarat'),('HR','Haryana'),
        ('HP','Himachal Pradesh'),('JK','Jammu & Kashmir'),('JH','Jharkhand'),
        ('KA','Karnataka'),('KL','Kerala'),('LA','Ladakh'),('LD','Lakshadweep'),
        ('MP','Madhya Pradesh'),('MH','Maharashtra'),('MN','Manipur'),
        ('ML','Meghalaya'),('MZ','Mizoram'),('NL','Nagaland'),('OD','Odisha'),
        ('PY','Puducherry'),('PB','Punjab'),('RJ','Rajasthan'),('SK','Sikkim'),
        ('TN','Tamil Nadu'),('TS','Telangana'),('TR','Tripura'),
        ('UP','Uttar Pradesh'),('UK','Uttarakhand'),('WB','West Bengal'),
    ]
    for code, name in all_india_states:
        c.execute("INSERT INTO master_states(country_id,code,name) VALUES(?,?,?)",(in_id,code,name))
    # US states
    for code, name in [('CA','California'),('NY','New York'),('TX','Texas'),('WA','Washington'),('IL','Illinois'),('FL','Florida')]:
        c.execute("INSERT INTO master_states(country_id,code,name) VALUES(?,?,?)",(us_id,code,name))
    for n in ["Full-Time","Contractor (C2C)","Part-Time","Intern"]:
        c.execute("INSERT INTO master_employment_types(name) VALUES(?)",(n,))
    for n in ["Staff Augmentation","Direct Hire","MSA","MSA + SOW","Retained Search"]:
        c.execute("INSERT INTO master_contract_types(name) VALUES(?)",(n,))
    for n in ["Job Board","Background Check","Sub-Vendor","Technology","Payroll"]:
        c.execute("INSERT INTO master_vendor_categories(name) VALUES(?)",(n,))
    for n,s in [("Draft",1),("Sent",2),("Paid",3),("Overdue",4),("Cancelled",5)]:
        c.execute("INSERT INTO master_invoice_statuses(name,sort_order) VALUES(?,?)",(n,s))
    for n,s in [("Applied",1),("Screening",2),("Technical",3),("Offer",4),("Placed",5),("Rejected",6)]:
        c.execute("INSERT INTO master_application_stages(name,sort_order) VALUES(?,?)",(n,s))
    for n in ["Video","Phone","In-Person","Take-Home Assessment"]:
        c.execute("INSERT INTO master_interview_formats(name) VALUES(?)",(n,))
    for n in ["Standard FTE","Contractor","Remote Employee","Executive"]:
        c.execute("INSERT INTO master_onboarding_templates(name) VALUES(?)",(n,))
    for n in ["LinkedIn","Referral","Indeed","Career Site","Agency","GitHub","Naukri"]:
        c.execute("INSERT INTO master_candidate_sources(name) VALUES(?)",(n,))
    for n,d in [("Net 15",15),("Net 30",30),("Net 45",45),("Net 60",60)]:
        c.execute("INSERT INTO master_payment_terms(name,days) VALUES(?,?)",(n,d))
    for n,s in [("High",1),("Medium",2),("Normal",3),("Low",4)]:
        c.execute("INSERT INTO master_priority_levels(name,sort_order) VALUES(?,?)",(n,s))
    for n in ["Pending","Approved","Returned","Cancelled"]:
        c.execute("INSERT INTO master_timesheet_statuses(name) VALUES(?)",(n,))
    for n in ["Semi-Monthly FTE","Contractor Bi-Weekly","Monthly"]:
        c.execute("INSERT INTO master_payroll_run_types(name) VALUES(?)",(n,))
    for n,d in [
        ("Admin","Full system access"),("HR Manager","HR & people modules"),
        ("Recruiter","ATS & talent modules"),("Finance","Finance & billing"),
        ("Employee","Self-service"),("Client","Client portal"),("Vendor","Vendor portal"),
    ]:
        c.execute("INSERT INTO master_user_roles(name,description) VALUES(?,?)",(n,d))
    ts_id = c.execute("SELECT id FROM master_states WHERE code='TS'").fetchone()[0]
    c.execute("""INSERT INTO organisation(legal_name,trade_name,email,phone,website,
        biz_city,biz_state_id,biz_country_id,reg_city,reg_state_id,reg_country_id)
        VALUES('McRaaN Consulting Private Limited','McHR&TA','info@mcraan.com',
        '+91-40-12345678','https://www.mcraan.com','Hyderabad',?,?,'Hyderabad',?,?)""",
        (ts_id,in_id,ts_id,in_id))
    org_id = c.lastrowid
    c.execute("INSERT INTO organisation_gst(organisation_id,gstin,state_id,is_primary) VALUES(?,?,?,1)",
              (org_id,"36AAAAA0000A1Z5",ts_id))
    c.execute("""INSERT INTO organisation_bank_accounts(organisation_id,account_name,bank_name,
        branch,account_number,ifsc_code,is_primary)
        VALUES(?,?,?,?,?,?,1)""",(org_id,"McRaaN Consulting","HDFC Bank","Banjara Hills","50200012345678","HDFC0001234"))
    for n,d in [("Technology Services","Engineering, DevOps, QA"),("Staffing Solutions","Talent Acquisition")]:
        c.execute("INSERT INTO business_units(name,description) VALUES(?,?)",(n,d))
    bu1 = c.execute("SELECT id FROM business_units WHERE name='Technology Services'").fetchone()[0]
    bu2 = c.execute("SELECT id FROM business_units WHERE name='Staffing Solutions'").fetchone()[0]
    c.execute("INSERT INTO departments(name,business_unit_id,head_name,budget,cost_center,location) VALUES(?,?,?,?,?,?)",
              ("Engineering",bu1,"Ravi Kumar",4200000,"CC-001","Hyderabad"))
    c.execute("INSERT INTO departments(name,business_unit_id,head_name,budget,cost_center,location) VALUES(?,?,?,?,?,?)",
              ("HR & Talent",bu2,"Aisha Kumar",640000,"CC-007","Hyderabad"))
    et_fte = c.execute("SELECT id FROM master_employment_types WHERE name='Full-Time'").fetchone()[0]
    ct_sa  = c.execute("SELECT id FROM master_contract_types WHERE name='Staff Augmentation'").fetchone()[0]
    ct_dh  = c.execute("SELECT id FROM master_contract_types WHERE name='Direct Hire'").fetchone()[0]
    pt30   = c.execute("SELECT id FROM master_payment_terms WHERE name='Net 30'").fetchone()[0]
    vc_jb  = c.execute("SELECT id FROM master_vendor_categories WHERE name='Job Board'").fetchone()[0]
    for name,ind,ctype,rate,pt,poc,email,mgr,score in [
        ("Acme Inc.","Technology",ct_sa,"$145/hr",pt30,"Brian","brian@acme.com","Admin",98),
        ("TechCorp","Finance",ct_sa,"$165/hr",pt30,"Sara","sara@tc.com","Admin",94),
        ("GloboCorp","Retail",ct_dh,"18% fee",pt30,"Mike","mike@gc.com","Admin",42),
    ]:
        c.execute("""INSERT INTO clients(name,industry,contract_type_id,currency,payment_terms_id,
            primary_contact,contact_email,account_manager,health_score) VALUES(?,?,?,?,?,?,?,?,?)""",
            (name,ind,ctype,rate,pt,poc,email,mgr,score))
    c.execute("""INSERT INTO vendors(name,category_id,primary_contact,contact_email,sla_score,spend_mtd,sla_description)
        VALUES(?,?,?,?,?,?,?)""",("LinkedIn Talent",vc_jb,"Sarah M.","sarah@li.com",97,28000,"Response rate ≥85%"))
    dept_eng = c.execute("SELECT id FROM departments WHERE name='Engineering'").fetchone()[0]
    dept_hr  = c.execute("SELECT id FROM departments WHERE name='HR & Talent'").fetchone()[0]
    for eid,fn,ln,em,title,dept,sal,brate,sd,status in [
        ("EMP-0001","Ravi","Kumar","ravi@mcraan.com","VP Engineering",dept_eng,220000,0,"2019-01-15","Active"),
        ("EMP-0002","Aisha","Kumar","aisha@mcraan.com","HR Director",dept_hr,180000,0,"2020-02-10","Active"),
        ("EMP-0003","Carlos","Mendez","carlos@mcraan.com","Sr. Recruiter",dept_hr,95000,0,"2021-03-22","Active"),
    ]:
        c.execute("""INSERT INTO employees(emp_id,first_name,last_name,email,job_title,
            department_id,employment_type_id,salary,bill_rate,start_date,status)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",(eid,fn,ln,em,title,dept,et_fte,sal,brate,sd,status))
    admin_role = c.execute("SELECT id FROM master_user_roles WHERE name='Admin'").fetchone()[0]
    c.execute("""INSERT INTO users(username,email,password_hash,role_id,full_name)
        VALUES('admin','admin@mcraan.com',?,?,'System Administrator')""",
        (hashlib.sha256(b'Admin@123').hexdigest(),admin_role))
    conn.commit()
    print("✓ Demo data seeded", flush=True)

_bootstrap_db()

# ── DB helpers ─────────────────────────────────────────────────────────────
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db: db.close()

def rows(q, p=()): return [dict(r) for r in get_db().execute(q,p).fetchall()]
def row1(q, p=()): r = get_db().execute(q,p).fetchone(); return dict(r) if r else None

def ok(data=None, msg="ok", status=200): return jsonify({"success":True,"message":msg,"data":data}), status
def err(msg="Error", status=400):        return jsonify({"success":False,"message":msg}), status

def hash_pw(pw): return hashlib.sha256(pw.encode()).hexdigest()

def log_activity(etype, eid, action, desc, user_name="System"):
    db = get_db()
    db.execute("INSERT INTO activity_log(entity_type,entity_id,action,description,user_name) VALUES(?,?,?,?,?)",
               (etype, str(eid), action, desc, user_name))

# ── Auth helpers ───────────────────────────────────────────────────────────
def get_current_user():
    token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
    if not token: return None
    db = get_db()
    db.execute("DELETE FROM user_sessions WHERE expires_at < datetime('now')")
    sess = db.execute("""SELECT u.*,r.name as role_name FROM user_sessions s
        JOIN users u ON u.id=s.user_id
        JOIN master_user_roles r ON r.id=u.role_id
        WHERE s.token=? AND s.expires_at > datetime('now') AND u.is_active=1""",
        (token,)).fetchone()
    return dict(sess) if sess else None

def require_auth(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*a, **kw):
        u = get_current_user()
        if not u: return err("Authentication required. Please log in.", 401)
        g.user = u
        return f(*a, **kw)
    return wrapper

def require_role(*roles):
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def wrapper(*a, **kw):
            u = get_current_user()
            if not u: return err("Authentication required.", 401)
            if u['role_name'] not in roles and 'Admin' not in roles:
                return err("You do not have permission to access this resource.", 403)
            g.user = u
            return f(*a, **kw)
        return wrapper
    return decorator

# ── CORS ───────────────────────────────────────────────────────────────────
@app.after_request
def add_cors(r):
    r.headers['Access-Control-Allow-Origin']  = '*'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-Auth-Token'
    r.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    return r

# ── Static ─────────────────────────────────────────────────────────────────
@app.route('/', defaults={'path':''})
@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api/'): return err("Not found", 404)
    return send_from_directory(STATIC, 'index.html')

@app.route('/api/options', methods=['OPTIONS'])
def handle_options(): return '', 204

# ═══════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════
@app.route('/api/auth/login', methods=['POST'])
def login():
    d = request.get_json()
    if not d or not d.get('username') or not d.get('password'):
        return err("Username and password required.")
    db = get_db()
    u = db.execute("""SELECT u.*,r.name as role_name FROM users u
        JOIN master_user_roles r ON r.id=u.role_id
        WHERE (u.username=? OR u.email=?) AND u.is_active=1""",
        (d['username'], d['username'])).fetchone()
    if not u or u['password_hash'] != hash_pw(d['password']):
        return err("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=SESSION_HOURS)
    db.execute("""INSERT INTO user_sessions(user_id,token,ip_address,user_agent,expires_at)
        VALUES(?,?,?,?,?)""",
        (u['id'],token,request.remote_addr,request.headers.get('User-Agent',''),expires.isoformat()))
    db.execute("UPDATE users SET last_login=datetime('now') WHERE id=?",(u['id'],))
    db.commit()
    resp = ok({
        "token": token,
        "user": {"id":u['id'],"username":u['username'],"email":u['email'],
                 "full_name":u['full_name'],"role":u['role_name'],
                 "must_change_pwd":bool(u['must_change_pwd'])}
    }, "Login successful")
    return resp

@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
    get_db().execute("DELETE FROM user_sessions WHERE token=?", (token,))
    get_db().commit()
    return ok(msg="Logged out")

@app.route('/api/auth/me')
@require_auth
def auth_me():
    u = g.user
    return ok({"id":u['id'],"username":u['username'],"email":u['email'],
               "full_name":u['full_name'],"role":u['role_name']})

@app.route('/api/auth/change-password', methods=['POST'])
@require_auth
def change_password():
    d = request.get_json()
    if not d.get('new_password'): return err("New password required.")
    db = get_db()
    if not d.get('skip_old_check'):
        old = db.execute("SELECT password_hash FROM users WHERE id=?",(g.user['id'],)).fetchone()
        if not old or old[0] != hash_pw(d.get('old_password','')):
            return err("Current password incorrect.")
    db.execute("UPDATE users SET password_hash=?,must_change_pwd=0,updated_at=datetime('now') WHERE id=?",
               (hash_pw(d['new_password']), g.user['id']))
    db.commit()
    return ok(msg="Password updated")

# ═══════════════════════════════════════════════════════
# USERS (admin only)
# ═══════════════════════════════════════════════════════
@app.route('/api/users', methods=['GET','POST'])
@require_auth
def users_list():
    db = get_db()
    if request.method == 'GET':
        return ok(rows("""SELECT u.*,r.name as role_name,
            e.first_name||' '||e.last_name as employee_name
            FROM users u
            JOIN master_user_roles r ON r.id=u.role_id
            LEFT JOIN employees e ON e.id=u.employee_id
            ORDER BY u.created_at DESC"""))
    d = request.get_json()
    if not d.get('username') or not d.get('email') or not d.get('password'):
        return err("Username, email, and password are required.")
    cur = db.execute("""INSERT INTO users(username,email,password_hash,role_id,
        employee_id,client_id,vendor_id,full_name,must_change_pwd)
        VALUES(?,?,?,?,?,?,?,?,1)""",
        (d['username'],d['email'],hash_pw(d['password']),d['role_id'],
         d.get('employee_id'),d.get('client_id'),d.get('vendor_id'),d.get('full_name')))
    db.commit()
    return ok({"id":cur.lastrowid}, "User created", 201)

@app.route('/api/users/<int:uid>', methods=['GET','PUT','DELETE'])
@require_auth
def user_detail(uid):
    db = get_db()
    if request.method == 'GET':
        u = row1("SELECT u.*,r.name as role_name FROM users u JOIN master_user_roles r ON r.id=u.role_id WHERE u.id=?",(uid,))
        return ok(u) if u else err("Not found",404)
    if request.method == 'DELETE':
        db.execute("UPDATE users SET is_active=0 WHERE id=?",(uid,)); db.commit()
        return ok(msg="User deactivated")
    d = request.get_json()
    db.execute("""UPDATE users SET email=?,role_id=?,full_name=?,is_active=?,
        employee_id=?,client_id=?,vendor_id=?,updated_at=datetime('now') WHERE id=?""",
        (d.get('email'),d.get('role_id'),d.get('full_name'),d.get('is_active',1),
         d.get('employee_id'),d.get('client_id'),d.get('vendor_id'),uid))
    if d.get('reset_password'):
        db.execute("UPDATE users SET password_hash=?,must_change_pwd=1 WHERE id=?",
                   (hash_pw(d['reset_password']),uid))
    db.commit()
    return ok(msg="User updated")

# ═══════════════════════════════════════════════════════
# MASTER DATA (lookup endpoints — no auth required for dropdowns)
# ═══════════════════════════════════════════════════════
@app.route('/api/masters/<table>')
def masters(table):
    allowed = {
        'countries':'master_countries','states':'master_states',
        'employment-types':'master_employment_types','contract-types':'master_contract_types',
        'vendor-categories':'master_vendor_categories','invoice-statuses':'master_invoice_statuses',
        'application-stages':'master_application_stages','interview-formats':'master_interview_formats',
        'onboarding-templates':'master_onboarding_templates','candidate-sources':'master_candidate_sources',
        'payment-terms':'master_payment_terms','priority-levels':'master_priority_levels',
        'timesheet-statuses':'master_timesheet_statuses','payroll-run-types':'master_payroll_run_types',
        'user-roles':'master_user_roles',
    }
    if table not in allowed: return err("Unknown master table", 404)
    tbl = allowed[table]
    country = request.args.get('country_id')
    if table == 'states':
        if country:
            return ok(rows(f"SELECT * FROM {tbl} WHERE country_id=? AND is_active=1 ORDER BY name",(country,)))
        # Default: return India states (country_id=1) if no filter
        india = get_db().execute("SELECT id FROM master_countries WHERE code='IN'").fetchone()
        if india:
            return ok(rows(f"SELECT * FROM {tbl} WHERE country_id=? AND is_active=1 ORDER BY name",(india[0],)))
    return ok(rows(f"SELECT * FROM {tbl} WHERE is_active=1 ORDER BY {'sort_order,name' if 'sort_order' in tbl else 'name'}"))

@app.route('/api/masters/<table>', methods=['POST'])
@require_auth
def master_add(table):
    allowed = ['employment-types','contract-types','vendor-categories','candidate-sources',
               'payment-terms','priority-levels','interview-formats','onboarding-templates']
    if table not in allowed: return err("Cannot add to this master", 400)
    tbl_map = {t: 'master_'+t.replace('-','_') for t in allowed}
    d = request.get_json()
    get_db().execute(f"INSERT INTO {tbl_map[table]}(name) VALUES(?)",(d['name'],))
    get_db().commit()
    return ok(msg="Added", status=201)

# ═══════════════════════════════════════════════════════
# ORGANISATION
# ═══════════════════════════════════════════════════════
@app.route('/api/organisation', methods=['GET','PUT'])
@require_auth
def organisation():
    db = get_db()
    if request.method == 'GET':
        org = row1("""SELECT o.*,
            s1.name as reg_state_name, s2.name as biz_state_name,
            c1.name as reg_country_name, c2.name as biz_country_name
            FROM organisation o
            LEFT JOIN master_states s1 ON s1.id=o.reg_state_id
            LEFT JOIN master_states s2 ON s2.id=o.biz_state_id
            LEFT JOIN master_countries c1 ON c1.id=o.reg_country_id
            LEFT JOIN master_countries c2 ON c2.id=o.biz_country_id
            LIMIT 1""")
        if not org: return ok({})
        org['gst_registrations'] = rows("""SELECT g.*,s.name as state_name
            FROM organisation_gst g LEFT JOIN master_states s ON s.id=g.state_id
            WHERE g.organisation_id=? AND g.is_active=1 ORDER BY g.is_primary DESC""",(org['id'],))
        org['bank_accounts'] = rows("""SELECT * FROM organisation_bank_accounts
            WHERE organisation_id=? AND is_active=1 ORDER BY is_primary DESC""",(org['id'],))
        org['labour_certs'] = rows("""SELECT lc.*,s.name as state_name
            FROM organisation_labour_certs lc LEFT JOIN master_states s ON s.id=lc.state_id
            WHERE lc.organisation_id=? AND lc.is_active=1 ORDER BY lc.id""",(org['id'],))
        org['documents'] = rows("""SELECT * FROM organisation_documents
            WHERE organisation_id=? AND is_active=1 ORDER BY uploaded_at DESC""",(org['id'],))
        return ok(org)
    d = request.get_json()
    existing = db.execute("SELECT id FROM organisation LIMIT 1").fetchone()
    fields = ['legal_name','trade_name','email','phone','website',
              'reg_address_line1','reg_address_line2','reg_city','reg_state_id','reg_pincode','reg_country_id',
              'biz_address_line1','biz_address_line2','biz_city','biz_state_id','biz_pincode','biz_country_id',
              'poc_name','poc_email','poc_phone','pan','cin','tan','msme_number',
              'iec_code','profession_tax_number','pf_number','esi_number',
              'incorporation_date','financial_year_start']
    vals = [d.get(f) for f in fields]
    if existing:
        set_clause = ','.join(f+f"=?" for f in [f+',' for f in fields])[:-1]
        # build proper update
        db.execute("UPDATE organisation SET "+','.join(f+"=?" for f in fields)+",updated_at=datetime('now') WHERE id=?",
                   vals + [existing[0]])
        org_id = existing[0]
    else:
        db.execute("INSERT INTO organisation("+','.join(fields)+") VALUES("+','.join(['?']*len(fields))+")", vals)
        org_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.commit()
    log_activity("organisation", org_id, "updated", "Organisation profile updated", g.user.get('username','System'))
    db.commit()
    return ok(msg="Organisation updated")

@app.route('/api/organisation/gst', methods=['POST'])
@require_auth
def add_gst():
    d = request.get_json()
    org = get_db().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up yet.")
    get_db().execute("""INSERT INTO organisation_gst(organisation_id,gstin,state_id,trade_name,registration_date,is_primary)
        VALUES(?,?,?,?,?,?)""",
        (org[0],d['gstin'],d.get('state_id'),d.get('trade_name'),d.get('registration_date'),d.get('is_primary',0)))
    get_db().commit()
    return ok(msg="GST registration added", status=201)

@app.route('/api/organisation/gst/<int:gid>', methods=['PUT','DELETE'])
@require_auth
def gst_detail(gid):
    db = get_db()
    if request.method == 'DELETE':
        db.execute("UPDATE organisation_gst SET is_active=0 WHERE id=?",(gid,)); db.commit()
        return ok(msg="GST removed")
    d = request.get_json()
    db.execute("UPDATE organisation_gst SET gstin=?,state_id=?,trade_name=?,is_primary=? WHERE id=?",
               (d['gstin'],d.get('state_id'),d.get('trade_name'),d.get('is_primary',0),gid))
    db.commit(); return ok(msg="GST updated")

@app.route('/api/organisation/labour-certs', methods=['POST'])
@require_auth
def add_labour_cert():
    d=request.get_json()
    org=get_db().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up yet.")
    get_db().execute("""INSERT INTO organisation_labour_certs
        (organisation_id,cert_number,issuing_authority,state_id,valid_from,valid_until)
        VALUES(?,?,?,?,?,?)""",
        (org[0],d['cert_number'],d.get('issuing_authority'),d.get('state_id'),
         d.get('valid_from'),d.get('valid_until')))
    get_db().commit()
    return ok(msg="Labour certificate added",status=201)

@app.route('/api/organisation/labour-certs/<int:lid>', methods=['DELETE'])
@require_auth
def delete_labour_cert(lid):
    get_db().execute("UPDATE organisation_labour_certs SET is_active=0 WHERE id=?",(lid,))
    get_db().commit()
    return ok(msg="Labour certificate removed")

@app.route('/api/organisation/documents', methods=['GET','POST'])
@require_auth
def org_documents():
    db=get_db()
    org=db.execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up yet.")
    if request.method=='GET':
        return ok(rows("SELECT * FROM organisation_documents WHERE organisation_id=? AND is_active=1 ORDER BY uploaded_at DESC",(org[0],)))
    d=request.get_json()
    db.execute("INSERT INTO organisation_documents(organisation_id,doc_type,doc_name,file_url,file_size) VALUES(?,?,?,?,?)",
               (org[0],d['doc_type'],d['doc_name'],d.get('file_url'),d.get('file_size')))
    db.commit()
    return ok(msg="Document record added",status=201)

@app.route('/api/organisation/documents/<int:did>', methods=['DELETE'])
@require_auth
def delete_org_document(did):
    get_db().execute("UPDATE organisation_documents SET is_active=0 WHERE id=?",(did,))
    get_db().commit()
    return ok(msg="Document removed")

@app.route('/api/organisation/banks', methods=['POST'])
@require_auth
def add_bank():
    d = request.get_json()
    org = get_db().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up yet.")
    get_db().execute("""INSERT INTO organisation_bank_accounts
        (organisation_id,account_name,bank_name,branch,account_number,ifsc_code,swift_code,account_type,currency,is_primary)
        VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (org[0],d['account_name'],d['bank_name'],d.get('branch'),d['account_number'],
         d.get('ifsc_code'),d.get('swift_code'),d.get('account_type','Current'),d.get('currency','INR'),d.get('is_primary',0)))
    get_db().commit()
    return ok(msg="Bank account added", status=201)

@app.route('/api/organisation/banks/<int:bid>', methods=['PUT','DELETE'])
@require_auth
def bank_detail(bid):
    db = get_db()
    if request.method == 'DELETE':
        db.execute("UPDATE organisation_bank_accounts SET is_active=0 WHERE id=?",(bid,)); db.commit()
        return ok(msg="Bank account removed")
    d = request.get_json()
    db.execute("""UPDATE organisation_bank_accounts SET account_name=?,bank_name=?,branch=?,
        account_number=?,ifsc_code=?,swift_code=?,account_type=?,currency=?,is_primary=? WHERE id=?""",
        (d['account_name'],d['bank_name'],d.get('branch'),d['account_number'],
         d.get('ifsc_code'),d.get('swift_code'),d.get('account_type','Current'),
         d.get('currency','INR'),d.get('is_primary',0),bid))
    db.commit(); return ok(msg="Bank account updated")

# ═══════════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════════
@app.route('/api/dashboard')
@require_auth
def dashboard():
    db = get_db()
    emp_count = db.execute("SELECT COUNT(*) FROM employees WHERE status IN ('Active','Onboarding')").fetchone()[0]
    open_reqs  = db.execute("SELECT COUNT(*) FROM job_requisitions WHERE status='Active'").fetchone()[0]
    rev_mtd    = db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").fetchone()[0]
    pending_inv= db.execute("""SELECT COALESCE(SUM(amount),0) FROM invoices i
        JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name IN ('Sent','Overdue')""").fetchone()[0]
    funnel = {}
    for stage_row in db.execute("SELECT s.name,COUNT(a.id) as cnt FROM master_application_stages s LEFT JOIN applications a ON a.stage_id=s.id GROUP BY s.id ORDER BY s.sort_order").fetchall():
        funnel[stage_row[0]] = stage_row[1]
    top_rec = rows("""SELECT e.first_name||' '||e.last_name AS name, COUNT(a.id) AS hires
        FROM applications a JOIN employees e ON e.id=a.recruiter_id
        JOIN master_application_stages s ON s.id=a.stage_id WHERE s.name='Placed'
        GROUP BY a.recruiter_id ORDER BY hires DESC LIMIT 5""")
    client_rev = rows("""SELECT c.name, COALESCE(SUM(i.amount),0) AS revenue
        FROM clients c LEFT JOIN invoices i ON i.client_id=c.id AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')
        WHERE c.is_active=1 GROUP BY c.id ORDER BY revenue DESC LIMIT 6""")
    urgent = rows("""SELECT r.id,r.title,c.name AS client,p.name AS priority,
        CAST(julianday('now')-julianday(r.opened_date) AS INTEGER) AS days_open
        FROM job_requisitions r JOIN clients c ON c.id=r.client_id
        JOIN master_priority_levels p ON p.id=r.priority_id
        WHERE r.status='Active' ORDER BY p.sort_order,days_open DESC LIMIT 6""")
    activity = rows("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10")
    trend = rows("""SELECT strftime('%b',created_at) AS label,strftime('%Y-%m',created_at) AS month,
        COALESCE(SUM(amount),0) AS revenue,
        COALESCE(SUM(CASE WHEN s.name='Paid' THEN i.amount ELSE 0 END),0) AS collected
        FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id
        GROUP BY strftime('%Y-%m',i.created_at) ORDER BY month DESC LIMIT 6""")
    trend.reverse()
    return ok({"kpis":{"active_employees":emp_count,"open_requisitions":open_reqs,"revenue_mtd":rev_mtd,"pending_invoices":pending_inv},
               "funnel":funnel,"top_recruiters":top_rec,"client_revenue":client_rev,
               "urgent_requisitions":urgent,"activity":activity,"revenue_trend":trend})

# ═══════════════════════════════════════════════════════
# ORG STRUCTURE
# ═══════════════════════════════════════════════════════
@app.route('/api/org/summary')
@require_auth
def org_summary():
    db=get_db()
    return ok({"departments":db.execute("SELECT COUNT(*) FROM departments WHERE is_active=1").fetchone()[0],
               "offices":db.execute("SELECT COUNT(*) FROM office_locations WHERE is_active=1").fetchone()[0],
               "business_units":db.execute("SELECT COUNT(*) FROM business_units WHERE is_active=1").fetchone()[0]})

@app.route('/api/departments', methods=['GET','POST'])
@require_auth
def departments():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT d.*,b.name AS business_unit,
            (SELECT COUNT(*) FROM employees e WHERE e.department_id=d.id AND e.status IN ('Active','Onboarding')) AS headcount
            FROM departments d LEFT JOIN business_units b ON b.id=d.business_unit_id
            WHERE d.is_active=1 ORDER BY d.name"""))
    d=request.get_json()
    cur=db.execute("INSERT INTO departments(name,business_unit_id,head_name,budget,cost_center,location) VALUES(?,?,?,?,?,?)",
        (d['name'],d.get('business_unit_id'),d.get('head_name'),d.get('budget',0),d.get('cost_center'),d.get('location')))
    db.commit(); return ok({"id":cur.lastrowid},"Department created",201)

@app.route('/api/departments/<int:did>', methods=['PUT','DELETE'])
@require_auth
def dept_detail(did):
    db=get_db()
    if request.method=='DELETE':
        db.execute("UPDATE departments SET is_active=0 WHERE id=?",(did,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    db.execute("UPDATE departments SET name=?,head_name=?,budget=?,cost_center=?,location=? WHERE id=?",
               (d['name'],d.get('head_name'),d.get('budget',0),d.get('cost_center'),d.get('location'),did))
    db.commit(); return ok(msg="Updated")

@app.route('/api/business-units')
@require_auth
def business_units():
    return ok(rows("""SELECT b.*,(SELECT COUNT(*) FROM departments d WHERE d.business_unit_id=b.id AND d.is_active=1) AS dept_count,
        (SELECT COUNT(*) FROM employees e JOIN departments d ON d.id=e.department_id WHERE d.business_unit_id=b.id AND e.status='Active') AS headcount
        FROM business_units b WHERE b.is_active=1"""))

@app.route('/api/offices')
@require_auth
def offices():
    return ok(rows("""SELECT o.*,s.name as state_name,c.name as country_name FROM office_locations o
        LEFT JOIN master_states s ON s.id=o.state_id LEFT JOIN master_countries c ON c.id=o.country_id
        WHERE o.is_active=1 ORDER BY o.name"""))

# ═══════════════════════════════════════════════════════
# CLIENTS
# ═══════════════════════════════════════════════════════
@app.route('/api/clients', methods=['GET','POST'])
@require_auth
def clients():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT c.*,ct.name as contract_type,pt.name as payment_terms,
            s.name as state_name,co.name as country_name,
            (SELECT COUNT(*) FROM job_requisitions r WHERE r.client_id=c.id AND r.status='Active') as open_reqs,
            (SELECT COUNT(*) FROM employees e WHERE e.client_id=c.id AND e.status='Active') as placements,
            (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')) as revenue_mtd
            FROM clients c
            LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
            LEFT JOIN master_payment_terms pt ON pt.id=c.payment_terms_id
            LEFT JOIN master_states s ON s.id=c.state_id
            LEFT JOIN master_countries co ON co.id=c.country_id
            WHERE c.is_active=1 ORDER BY c.name"""))
    d=request.get_json()
    cur=db.execute("""INSERT INTO clients(name,industry,contract_type_id,currency,payment_terms_id,
        primary_contact,contact_email,contact_phone,address_line1,city,state_id,country_id,gstin,pan,account_manager)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (d['name'],d.get('industry'),d.get('contract_type_id'),d.get('currency','INR'),d.get('payment_terms_id'),
         d.get('primary_contact'),d.get('contact_email'),d.get('contact_phone'),d.get('address_line1'),
         d.get('city'),d.get('state_id'),d.get('country_id'),d.get('gstin'),d.get('pan'),d.get('account_manager')))
    db.commit(); return ok({"id":cur.lastrowid},"Client created",201)

@app.route('/api/clients/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def client_detail(cid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT c.*,ct.name as contract_type,pt.name as payment_terms FROM clients c LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id LEFT JOIN master_payment_terms pt ON pt.id=c.payment_terms_id WHERE c.id=?",(cid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        db.execute("UPDATE clients SET is_active=0 WHERE id=?",(cid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    db.execute("""UPDATE clients SET name=?,industry=?,contract_type_id=?,currency=?,payment_terms_id=?,
        primary_contact=?,contact_email=?,contact_phone=?,address_line1=?,city=?,state_id=?,
        country_id=?,gstin=?,pan=?,account_manager=?,health_score=?,updated_at=datetime('now') WHERE id=?""",
        (d['name'],d.get('industry'),d.get('contract_type_id'),d.get('currency','INR'),d.get('payment_terms_id'),
         d.get('primary_contact'),d.get('contact_email'),d.get('contact_phone'),d.get('address_line1'),
         d.get('city'),d.get('state_id'),d.get('country_id'),d.get('gstin'),d.get('pan'),
         d.get('account_manager'),d.get('health_score',80),cid))
    db.commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════════
# VENDORS
# ═══════════════════════════════════════════════════════
@app.route('/api/vendors', methods=['GET','POST'])
@require_auth
def vendors():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT v.*,vc.name as category FROM vendors v
            LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
            WHERE v.is_active=1 ORDER BY v.name"""))
    d=request.get_json()
    cur=db.execute("""INSERT INTO vendors(name,category_id,primary_contact,contact_email,contact_phone,
        contract_end,sla_score,spend_mtd,sla_description,gstin,pan) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (d['name'],d.get('category_id'),d.get('primary_contact'),d.get('contact_email'),d.get('contact_phone'),
         d.get('contract_end'),d.get('sla_score',90),d.get('spend_mtd',0),d.get('sla_description'),
         d.get('gstin'),d.get('pan')))
    db.commit(); return ok({"id":cur.lastrowid},"Vendor created",201)

@app.route('/api/vendors/<int:vid>', methods=['GET','PUT','DELETE'])
@require_auth
def vendor_detail(vid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT v.*,vc.name as category FROM vendors v LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id WHERE v.id=?",(vid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        db.execute("UPDATE vendors SET is_active=0 WHERE id=?",(vid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    db.execute("""UPDATE vendors SET name=?,category_id=?,primary_contact=?,contact_email=?,contact_phone=?,
        contract_end=?,sla_score=?,sla_description=?,gstin=?,pan=?,updated_at=datetime('now') WHERE id=?""",
        (d['name'],d.get('category_id'),d.get('primary_contact'),d.get('contact_email'),d.get('contact_phone'),
         d.get('contract_end'),d.get('sla_score',90),d.get('sla_description'),d.get('gstin'),d.get('pan'),vid))
    db.commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════════
# EMPLOYEES
# ═══════════════════════════════════════════════════════
@app.route('/api/employees', methods=['GET','POST'])
@require_auth
def employees():
    db=get_db()
    if request.method=='GET':
        q=request.args.get('q',''); status=request.args.get('status',''); et=request.args.get('employment_type','')
        sql="""SELECT e.*,d.name AS department_name,et.name AS employment_type,
            c.name AS client_name,m.first_name||' '||m.last_name AS manager_name
            FROM employees e
            LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
            LEFT JOIN clients c ON c.id=e.client_id
            LEFT JOIN employees m ON m.id=e.manager_id WHERE e.is_active=1"""
        params=[]
        if status: sql+=" AND e.status=?"; params.append(status)
        if et: sql+=" AND et.name=?"; params.append(et)
        if q: sql+=" AND (e.first_name||' '||e.last_name LIKE ? OR e.emp_id LIKE ? OR e.job_title LIKE ?)"; params+=[f'%{q}%']*3
        sql+=" ORDER BY e.last_name,e.first_name"
        return ok(rows(sql,params))
    d=request.get_json()
    n=db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    et=d.get('employment_type_id')
    etype_name = db.execute("SELECT name FROM master_employment_types WHERE id=?",(et,)).fetchone()
    prefix="CTR" if etype_name and "Contractor" in etype_name[0] else "EMP"
    emp_id=f"{prefix}-{n+1:04d}"
    cur=db.execute("""INSERT INTO employees(emp_id,first_name,last_name,email,phone,job_title,
        department_id,employment_type_id,location,manager_id,client_id,salary,bill_rate,start_date)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (emp_id,d['first_name'],d['last_name'],d.get('email'),d.get('phone'),d.get('job_title'),
         d.get('department_id'),d.get('employment_type_id'),d.get('location'),
         d.get('manager_id'),d.get('client_id'),d.get('salary',0),d.get('bill_rate',0),d.get('start_date')))
    db.commit()
    log_activity("employees",cur.lastrowid,"hired",f"{d['first_name']} {d['last_name']} ({emp_id}) added",g.user.get('username','System'))
    db.commit()
    return ok({"id":cur.lastrowid,"emp_id":emp_id},"Employee created",201)

@app.route('/api/employees/<int:eid>', methods=['GET','PUT','DELETE'])
@require_auth
def employee_detail(eid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT e.*,d.name as department_name,et.name as employment_type,
            c.name as client_name,m.first_name||' '||m.last_name as manager_name
            FROM employees e LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
            LEFT JOIN clients c ON c.id=e.client_id LEFT JOIN employees m ON m.id=e.manager_id
            WHERE e.id=?""",(eid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        db.execute("UPDATE employees SET status='Terminated',is_active=0 WHERE id=?",(eid,)); db.commit(); return ok(msg="Terminated")
    d=request.get_json()
    db.execute("""UPDATE employees SET first_name=?,last_name=?,email=?,phone=?,job_title=?,
        department_id=?,employment_type_id=?,location=?,manager_id=?,client_id=?,
        salary=?,bill_rate=?,start_date=?,status=?,updated_at=datetime('now') WHERE id=?""",
        (d['first_name'],d['last_name'],d.get('email'),d.get('phone'),d.get('job_title'),
         d.get('department_id'),d.get('employment_type_id'),d.get('location'),
         d.get('manager_id'),d.get('client_id'),d.get('salary',0),d.get('bill_rate',0),
         d.get('start_date'),d.get('status','Active'),eid))
    db.commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════════
# TIMESHEETS
# ═══════════════════════════════════════════════════════
@app.route('/api/timesheets', methods=['GET','POST'])
@require_auth
def timesheets():
    db=get_db()
    if request.method=='GET':
        status=request.args.get('status','')
        sql="""SELECT t.*,e.first_name||' '||e.last_name AS employee_name,e.emp_id,
            c.name AS client_name,s.name AS status
            FROM timesheets t JOIN employees e ON e.id=t.employee_id
            LEFT JOIN clients c ON c.id=t.client_id
            LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE 1=1"""
        params=[]
        if status: sql+=" AND s.name=?"; params.append(status)
        sql+=" ORDER BY t.week_ending DESC,t.submitted_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    st_id=db.execute("SELECT id FROM master_timesheet_statuses WHERE name='Pending'").fetchone()[0]
    cur=db.execute("""INSERT INTO timesheets(employee_id,client_id,project,week_ending,regular_hours,overtime_hours,bill_rate,status_id)
        VALUES(?,?,?,?,?,?,?,?)""",
        (d['employee_id'],d.get('client_id'),d.get('project'),d['week_ending'],
         d.get('regular_hours',0),d.get('overtime_hours',0),d.get('bill_rate',0),st_id))
    db.commit(); return ok({"id":cur.lastrowid},"Submitted",201)

@app.route('/api/timesheets/summary')
@require_auth
def ts_summary():
    db=get_db()
    total=db.execute("SELECT COALESCE(SUM(total_hours),0) FROM timesheets WHERE week_ending=(SELECT MAX(week_ending) FROM timesheets)").fetchone()[0]
    billable=db.execute("SELECT COALESCE(SUM(total_hours),0) FROM timesheets WHERE bill_rate>0 AND week_ending=(SELECT MAX(week_ending) FROM timesheets)").fetchone()[0]
    pending=db.execute("SELECT COUNT(*) FROM timesheets t JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE s.name='Pending'").fetchone()[0]
    ot=db.execute("SELECT COUNT(*) FROM timesheets t JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE s.name='Pending' AND t.overtime_hours>0").fetchone()[0]
    return ok({"total_hours":total,"billable_hours":billable,"pending_approval":pending,"ot_alerts":ot,
               "utilization":round(billable/total*100,1) if total else 0})

@app.route('/api/timesheets/<int:tid>', methods=['GET','PUT'])
@require_auth
def ts_detail(tid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT * FROM timesheets WHERE id=?",(tid,)); return ok(r) if r else err("Not found",404)
    d=request.get_json()
    new_status=d.get('status','Pending')
    st_id=db.execute("SELECT id FROM master_timesheet_statuses WHERE name=?",(new_status,)).fetchone()
    if not st_id: return err("Invalid status")
    db.execute("UPDATE timesheets SET status_id=?,notes=? WHERE id=?",(st_id[0],d.get('notes'),tid))
    if new_status=='Approved': db.execute("UPDATE timesheets SET approved_at=datetime('now') WHERE id=?",(tid,))
    db.commit()
    log_activity("timesheets",tid,new_status.lower(),f"Timesheet #{tid} {new_status}",g.user.get('username'))
    db.commit(); return ok(msg=f"Timesheet {new_status}")

# ═══════════════════════════════════════════════════════
# PAYROLL
# ═══════════════════════════════════════════════════════
@app.route('/api/payroll', methods=['GET','POST'])
@require_auth
def payroll():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT p.*,rt.name as run_type FROM payroll_runs p
            LEFT JOIN master_payroll_run_types rt ON rt.id=p.run_type_id ORDER BY p.run_date DESC"""))
    d=request.get_json()
    rt_id=db.execute("SELECT id FROM master_payroll_run_types WHERE name=?",(d.get('run_type','Semi-Monthly FTE'),)).fetchone()
    cur=db.execute("""INSERT INTO payroll_runs(run_date,period_start,period_end,run_type_id,employee_count,gross_amount,status)
        VALUES(?,?,?,?,?,?,'Scheduled')""",
        (d['run_date'],d.get('period_start'),d.get('period_end'),rt_id[0] if rt_id else None,
         d.get('employee_count',0),d.get('gross_amount',0)))
    db.commit(); return ok({"id":cur.lastrowid},"Scheduled",201)

@app.route('/api/payroll/summary')
@require_auth
def payroll_summary():
    db=get_db()
    et_fte=db.execute("SELECT id FROM master_employment_types WHERE name='Full-Time'").fetchone()
    total_sal=db.execute("SELECT COALESCE(SUM(salary),0)/12 FROM employees WHERE employment_type_id=? AND status='Active'",
                         (et_fte[0],) if et_fte else (0,)).fetchone()[0]
    total_ctr=db.execute("SELECT COALESCE(SUM(bill_rate),0)*160 FROM employees WHERE employment_type_id!=? AND status='Active'",
                         (et_fte[0],) if et_fte else (0,)).fetchone()[0]
    return ok({"base_salaries":round(total_sal),"contractor_payments":round(total_ctr),
               "overtime":84000,"benefits":round(total_sal*0.10),
               "taxes":round((total_sal+total_ctr)*0.0765),"total":round(total_sal+total_ctr+84000)})

# ═══════════════════════════════════════════════════════
# JOB REQUISITIONS
# ═══════════════════════════════════════════════════════
@app.route('/api/requisitions', methods=['GET','POST'])
@require_auth
def requisitions():
    db=get_db()
    if request.method=='GET':
        status=request.args.get('status','Active'); pri=request.args.get('priority',''); q=request.args.get('q','')
        sql="""SELECT r.*,c.name AS client_name,e.first_name||' '||e.last_name AS recruiter_name,
            p.name AS priority,et.name AS engagement_type,
            CAST(julianday('now')-julianday(r.opened_date) AS INTEGER) AS days_open,
            (SELECT COUNT(*) FROM applications a WHERE a.requisition_id=r.id) AS applicant_count,
            (SELECT COUNT(*) FROM applications a JOIN master_application_stages s ON s.id=a.stage_id
             WHERE a.requisition_id=r.id AND s.name NOT IN ('Applied','Rejected')) AS in_pipeline
            FROM job_requisitions r JOIN clients c ON c.id=r.client_id
            LEFT JOIN employees e ON e.id=r.recruiter_id
            LEFT JOIN master_priority_levels p ON p.id=r.priority_id
            LEFT JOIN master_contract_types et ON et.id=r.engagement_type_id WHERE 1=1"""
        params=[]
        if status: sql+=" AND r.status=?"; params.append(status)
        if pri: sql+=" AND p.name=?"; params.append(pri)
        if q: sql+=" AND r.title LIKE ?"; params.append(f'%{q}%')
        sql+=" ORDER BY p.sort_order,days_open DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    cur=db.execute("""INSERT INTO job_requisitions(title,client_id,engagement_type_id,department_id,recruiter_id,
        priority_id,location,comp_min,comp_max,description,target_start,opened_date)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,date('now'))""",
        (d['title'],d['client_id'],d.get('engagement_type_id'),d.get('department_id'),d.get('recruiter_id'),
         d.get('priority_id'),d.get('location'),d.get('comp_min'),d.get('comp_max'),
         d.get('description'),d.get('target_start')))
    db.commit()
    log_activity("requisitions",cur.lastrowid,"created",f"Job req '{d['title']}' opened",g.user.get('username'))
    db.commit(); return ok({"id":cur.lastrowid},"Created",201)

@app.route('/api/requisitions/<int:rid>', methods=['GET','PUT','DELETE'])
@require_auth
def req_detail(rid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT r.*,c.name as client_name,p.name as priority,et.name as engagement_type
            FROM job_requisitions r JOIN clients c ON c.id=r.client_id
            LEFT JOIN master_priority_levels p ON p.id=r.priority_id
            LEFT JOIN master_contract_types et ON et.id=r.engagement_type_id
            WHERE r.id=?""",(rid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        db.execute("UPDATE job_requisitions SET status='Closed',is_active=0 WHERE id=?",(rid,)); db.commit(); return ok(msg="Closed")
    d=request.get_json()
    db.execute("""UPDATE job_requisitions SET title=?,priority_id=?,status=?,location=?,
        comp_min=?,comp_max=?,description=?,recruiter_id=?,updated_at=datetime('now') WHERE id=?""",
        (d['title'],d.get('priority_id'),d.get('status','Active'),d.get('location'),
         d.get('comp_min'),d.get('comp_max'),d.get('description'),d.get('recruiter_id'),rid))
    db.commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════════
# CANDIDATES & PIPELINE
# ═══════════════════════════════════════════════════════
@app.route('/api/candidates', methods=['GET','POST'])
@require_auth
def candidates():
    db=get_db()
    if request.method=='GET':
        q=request.args.get('q','')
        sql="SELECT c.*,s.name as source FROM candidates c LEFT JOIN master_candidate_sources s ON s.id=c.source_id WHERE c.is_active=1"
        params=[]
        if q: sql+=" AND (c.first_name||' '||c.last_name LIKE ? OR c.current_title LIKE ?)"; params=[f'%{q}%']*2
        sql+=" ORDER BY c.created_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    cur=db.execute("""INSERT INTO candidates(first_name,last_name,email,phone,location,current_title,years_exp,source_id,skills)
        VALUES(?,?,?,?,?,?,?,?,?)""",
        (d['first_name'],d['last_name'],d.get('email'),d.get('phone'),d.get('location'),
         d.get('current_title'),d.get('years_exp',0),d.get('source_id'),d.get('skills','')))
    db.commit(); return ok({"id":cur.lastrowid},"Candidate added",201)

@app.route('/api/pipeline')
@require_auth
def pipeline():
    req_id=request.args.get('requisition_id','')
    sql="""SELECT a.*,c.first_name||' '||c.last_name AS candidate_name,
        c.current_title,c.years_exp,c.location,c.skills,
        src.name AS source,
        r.title AS role,cl.name AS client,
        s.name AS stage,
        e.first_name||' '||e.last_name AS recruiter_name
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions r ON r.id=a.requisition_id
        JOIN clients cl ON cl.id=r.client_id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        LEFT JOIN master_candidate_sources src ON src.id=c.source_id
        LEFT JOIN employees e ON e.id=a.recruiter_id WHERE 1=1"""
    params=[]
    if req_id: sql+=" AND a.requisition_id=?"; params.append(req_id)
    sql+=" ORDER BY a.updated_at DESC"
    data=rows(sql,params)
    stages=['Applied','Screening','Technical','Offer','Placed','Rejected']
    grouped={s:[] for s in stages}
    for r in data:
        stage=r.get('stage') or 'Applied'
        if stage in grouped: grouped[stage].append(r)
        else: grouped['Applied'].append(r)
    return ok({"by_stage":grouped,"counts":{s:len(grouped[s]) for s in stages},"total":len(data)})

@app.route('/api/applications', methods=['POST'])
@require_auth
def add_application():
    d=request.get_json()
    stage_id=get_db().execute("SELECT id FROM master_application_stages WHERE name='Applied'").fetchone()[0]
    cur=get_db().execute("""INSERT INTO applications(candidate_id,requisition_id,stage_id,expected_salary,recruiter_id,notes)
        VALUES(?,?,?,?,?,?)""",
        (d['candidate_id'],d['requisition_id'],stage_id,d.get('expected_salary'),d.get('recruiter_id'),d.get('notes')))
    get_db().commit(); return ok({"id":cur.lastrowid},"Application created",201)

@app.route('/api/applications/<int:aid>', methods=['GET','PUT'])
@require_auth
def app_detail(aid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT a.*,c.first_name||' '||c.last_name as candidate_name,
            s.name as stage,r.title as role,cl.name as client
            FROM applications a JOIN candidates c ON c.id=a.candidate_id
            JOIN master_application_stages s ON s.id=a.stage_id
            JOIN job_requisitions r ON r.id=a.requisition_id JOIN clients cl ON cl.id=r.client_id
            WHERE a.id=?""",(aid,))
        return ok(r) if r else err("Not found",404)
    d=request.get_json()
    new_stage=d.get('stage')
    if new_stage:
        st=db.execute("SELECT id FROM master_application_stages WHERE name=?",(new_stage,)).fetchone()
        if st: db.execute("UPDATE applications SET stage_id=?,updated_at=datetime('now') WHERE id=?",(st[0],aid))
    if d.get('notes'): db.execute("UPDATE applications SET notes=? WHERE id=?",(d['notes'],aid))
    db.commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════════
# INTERVIEWS
# ═══════════════════════════════════════════════════════
@app.route('/api/interviews', methods=['GET','POST'])
@require_auth
def interviews():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT i.*,f.name as format,
            c.first_name||' '||c.last_name AS candidate_name,
            r.title AS role,cl.name AS client
            FROM interviews i
            JOIN applications a ON a.id=i.application_id
            JOIN candidates c ON c.id=a.candidate_id
            JOIN job_requisitions r ON r.id=a.requisition_id
            JOIN clients cl ON cl.id=r.client_id
            LEFT JOIN master_interview_formats f ON f.id=i.format_id
            ORDER BY i.scheduled_at"""))
    d=request.get_json()
    fmt_id=db.execute("SELECT id FROM master_interview_formats WHERE name=?",(d.get('format','Video'),)).fetchone()
    cur=db.execute("""INSERT INTO interviews(application_id,round,format_id,interviewer,scheduled_at,location_link,notes)
        VALUES(?,?,?,?,?,?,?)""",
        (d['application_id'],d['round'],fmt_id[0] if fmt_id else None,
         d.get('interviewer'),d.get('scheduled_at'),d.get('location_link'),d.get('notes')))
    db.commit(); return ok({"id":cur.lastrowid},"Scheduled",201)

@app.route('/api/interviews/summary')
@require_auth
def int_summary():
    db=get_db()
    return ok({
        "scheduled_this_week":db.execute("SELECT COUNT(*) FROM interviews WHERE date(scheduled_at) BETWEEN date('now') AND date('now','+7 days')").fetchone()[0],
        "awaiting_feedback":db.execute("SELECT COUNT(*) FROM interviews WHERE scorecard_status='Pending'").fetchone()[0],
        "overdue_feedback":db.execute("SELECT COUNT(*) FROM interviews WHERE scorecard_status='Overdue'").fetchone()[0],
        "no_shows":db.execute("SELECT COUNT(*) FROM interviews WHERE decision='No Show'").fetchone()[0],
    })

@app.route('/api/interviews/<int:iid>', methods=['PUT'])
@require_auth
def int_detail(iid):
    d=request.get_json()
    get_db().execute("""UPDATE interviews SET scorecard_status=?,decision=?,notes=?,
        interviewer=?,scheduled_at=? WHERE id=?""",
        (d.get('scorecard_status'),d.get('decision'),d.get('notes'),d.get('interviewer'),d.get('scheduled_at'),iid))
    get_db().commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════════
# ONBOARDING
# ═══════════════════════════════════════════════════════
@app.route('/api/onboarding', methods=['GET','POST'])
@require_auth
def onboarding():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT o.*,t.name as template,
            e.first_name||' '||e.last_name AS employee_name,e.emp_id,e.job_title,c.name AS client_name
            FROM onboarding o JOIN employees e ON e.id=o.employee_id
            LEFT JOIN master_onboarding_templates t ON t.id=o.template_id
            LEFT JOIN clients c ON c.id=e.client_id WHERE o.status!='Completed' ORDER BY o.start_date"""))
    d=request.get_json()
    tpl=db.execute("SELECT id FROM master_onboarding_templates WHERE name=?",(d.get('template','Standard FTE'),)).fetchone()
    cur=db.execute("""INSERT INTO onboarding(employee_id,template_id,buddy_name,start_date,equipment)
        VALUES(?,?,?,?,?)""",
        (d['employee_id'],tpl[0] if tpl else None,d.get('buddy_name'),d.get('start_date'),d.get('equipment')))
    ob_id=cur.lastrowid
    for task,cat in [("Offer letter signed","Documents"),("Background check","Compliance"),
                     ("I-9 / ID verification","Compliance"),("Equipment provisioned","IT"),
                     ("System access setup","IT"),("Benefits enrollment","HR"),
                     ("Day 1 orientation","HR"),("30-day check-in","HR")]:
        db.execute("INSERT INTO onboarding_tasks(onboarding_id,task_name,category) VALUES(?,?,?)",(ob_id,task,cat))
    db.commit(); return ok({"id":ob_id},"Onboarding started",201)

@app.route('/api/onboarding/<int:oid>', methods=['GET','PUT'])
@require_auth
def onb_detail(oid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT o.*,t.name as template,e.first_name||' '||e.last_name as employee_name
            FROM onboarding o JOIN employees e ON e.id=o.employee_id
            LEFT JOIN master_onboarding_templates t ON t.id=o.template_id WHERE o.id=?""",(oid,))
        if not r: return err("Not found",404)
        r['tasks']=rows("SELECT * FROM onboarding_tasks WHERE onboarding_id=? ORDER BY id",(oid,))
        return ok(r)
    d=request.get_json()
    db.execute("""UPDATE onboarding SET progress_pct=?,status=?,day30_status=?,day60_status=?,day90_status=? WHERE id=?""",
               (d.get('progress_pct'),d.get('status'),d.get('day30_status'),d.get('day60_status'),d.get('day90_status'),oid))
    db.commit(); return ok(msg="Updated")

@app.route('/api/onboarding/tasks/<int:tid>', methods=['PUT'])
@require_auth
def toggle_task(tid):
    db=get_db()
    complete=1 if request.get_json().get('is_complete') else 0
    db.execute("UPDATE onboarding_tasks SET is_complete=?,completed_at=? WHERE id=?",
               (complete,datetime.utcnow().isoformat() if complete else None,tid))
    r=db.execute("SELECT onboarding_id FROM onboarding_tasks WHERE id=?",(tid,)).fetchone()
    if r:
        stats=db.execute("SELECT COUNT(*),SUM(is_complete) FROM onboarding_tasks WHERE onboarding_id=?",(r[0],)).fetchone()
        pct=round(stats[1]/stats[0]*100) if stats[0] else 0
        db.execute("UPDATE onboarding SET progress_pct=? WHERE id=?",(pct,r[0]))
    db.commit(); return ok(msg="Task updated")

# ═══════════════════════════════════════════════════════
# INVOICES
# ═══════════════════════════════════════════════════════
@app.route('/api/invoices', methods=['GET','POST'])
@require_auth
def invoices():
    db=get_db()
    if request.method=='GET':
        status=request.args.get('status','')
        sql="""SELECT i.*,c.name AS client_name,s.name AS status,ct.name AS invoice_type,
            CAST(julianday('now')-julianday(i.due_date) AS INTEGER) AS days_overdue
            FROM invoices i JOIN clients c ON c.id=i.client_id
            LEFT JOIN master_invoice_statuses s ON s.id=i.status_id
            LEFT JOIN master_contract_types ct ON ct.id=i.contract_type_id WHERE 1=1"""
        params=[]
        if status: sql+=" AND s.name=?"; params.append(status)
        sql+=" ORDER BY i.created_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    last=db.execute("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1").fetchone()
    num=int(last[0].split('-')[1])+1 if last else 1001
    inv_num=f"INV-{num}"
    st_id=db.execute("SELECT id FROM master_invoice_statuses WHERE name='Draft'").fetchone()[0]
    ct_id=d.get('contract_type_id')
    cur=db.execute("""INSERT INTO invoices(invoice_number,client_id,contract_type_id,period_start,period_end,
        amount,tax_amount,due_date,po_number,notes,status_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (inv_num,d['client_id'],ct_id,d.get('period_start'),d.get('period_end'),
         d.get('amount',0),d.get('tax_amount',0),d.get('due_date'),d.get('po_number'),d.get('notes'),st_id))
    db.commit()
    log_activity("invoices",cur.lastrowid,"created",f"Invoice {inv_num} created",g.user.get('username'))
    db.commit(); return ok({"id":cur.lastrowid,"invoice_number":inv_num},"Invoice created",201)

@app.route('/api/invoices/summary')
@require_auth
def inv_summary():
    db=get_db()
    def q(sql): return db.execute(sql).fetchone()[0]
    total=q("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')")
    paid=q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Paid' AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')")
    outstd=q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name IN ('Sent','Overdue')")
    overdue=q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue'")
    return ok({"total_invoiced":total,"paid":paid,"outstanding":outstd,"overdue":overdue,
               "ar_aging":{
                   "current":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Sent' AND julianday('now')-julianday(i.due_date)<0"),
                   "d30_60":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue' AND julianday('now')-julianday(i.due_date) BETWEEN 0 AND 30"),
                   "d60_90":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue' AND julianday('now')-julianday(i.due_date) BETWEEN 30 AND 60"),
                   "d90_plus":q("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name='Overdue' AND julianday('now')-julianday(i.due_date)>60"),
               }})

@app.route('/api/invoices/<int:iid>', methods=['GET','PUT'])
@require_auth
def inv_detail(iid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT i.*,c.name as client_name,s.name as status FROM invoices i JOIN clients c ON c.id=i.client_id LEFT JOIN master_invoice_statuses s ON s.id=i.status_id WHERE i.id=?",(iid,))
        return ok(r) if r else err("Not found",404)
    d=request.get_json()
    new_status=d.get('status')
    if new_status:
        st=db.execute("SELECT id FROM master_invoice_statuses WHERE name=?",(new_status,)).fetchone()
        if st: db.execute("UPDATE invoices SET status_id=?,updated_at=datetime('now') WHERE id=?",(st[0],iid))
    if d.get('paid_date'): db.execute("UPDATE invoices SET paid_date=?,payment_ref=? WHERE id=?",(d['paid_date'],d.get('payment_ref'),iid))
    if d.get('notes'): db.execute("UPDATE invoices SET notes=? WHERE id=?",(d['notes'],iid))
    db.commit()
    if new_status=='Paid':
        r=db.execute("SELECT invoice_number,amount FROM invoices WHERE id=?",(iid,)).fetchone()
        log_activity("invoices",iid,"paid",f"Invoice {r[0]} paid — ₹{r[1]:,.0f}",g.user.get('username','System'))
        db.commit()
    return ok(msg="Invoice updated")

# ═══════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════
@app.route('/api/reports/financial')
@require_auth
def rpt_financial():
    db=get_db()
    trend=rows("""SELECT strftime('%Y-%m',i.created_at) AS month,strftime('%b',i.created_at) AS label,
        COALESCE(SUM(i.amount),0) AS revenue,
        COALESCE(SUM(CASE WHEN s.name='Paid' THEN i.amount ELSE 0 END),0) AS collected
        FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id
        GROUP BY strftime('%Y-%m',i.created_at) ORDER BY month DESC LIMIT 6""")
    trend.reverse()
    client_rev=rows("""SELECT c.name,COALESCE(SUM(i.amount),0) AS revenue
        FROM clients c LEFT JOIN invoices i ON i.client_id=c.id
        WHERE c.is_active=1 GROUP BY c.id ORDER BY revenue DESC LIMIT 8""")
    rev_mtd=db.execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").fetchone()[0]
    payroll_mtd=db.execute("SELECT COALESCE(SUM(gross_amount),0) FROM payroll_runs WHERE status IN ('Processing','Completed') AND strftime('%Y-%m',run_date)=strftime('%Y-%m','now')").fetchone()[0]
    return ok({"trend":trend,"client_revenue":client_rev,"revenue_mtd":rev_mtd,"payroll_mtd":payroll_mtd,
               "gross_margin":round((rev_mtd-payroll_mtd)/rev_mtd*100,1) if rev_mtd else 0})

@app.route('/api/reports/recruiter')
@require_auth
def rpt_recruiter():
    return ok(rows("""SELECT e.id,e.first_name||' '||e.last_name AS name,
        COUNT(a.id) AS total_apps,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) AS hires,
        SUM(CASE WHEN s.name IN ('Technical','Offer','Placed') THEN 1 ELSE 0 END) AS interviews,
        ROUND(AVG(CASE WHEN r.filled_date IS NOT NULL THEN julianday(r.filled_date)-julianday(r.opened_date) END),1) AS avg_ttf
        FROM employees e JOIN applications a ON a.recruiter_id=e.id
        JOIN master_application_stages s ON s.id=a.stage_id
        JOIN job_requisitions r ON r.id=a.requisition_id
        GROUP BY e.id ORDER BY hires DESC"""))

@app.route('/api/reports/applicants')
@require_auth
def rpt_applicants():
    by_rec=rows("""SELECT e.first_name||' '||e.last_name AS recruiter,COUNT(a.id) AS total,
        SUM(CASE WHEN s.name='Screening' THEN 1 ELSE 0 END) AS screened,
        SUM(CASE WHEN s.name IN ('Technical','Offer','Placed') THEN 1 ELSE 0 END) AS interviewed,
        SUM(CASE WHEN s.name IN ('Offer','Placed') THEN 1 ELSE 0 END) AS offered,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) AS hired
        FROM applications a LEFT JOIN employees e ON e.id=a.recruiter_id
        JOIN master_application_stages s ON s.id=a.stage_id GROUP BY a.recruiter_id ORDER BY hired DESC""")
    by_src=rows("""SELECT cs.name AS source,COUNT(*) AS total,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) AS hired,
        ROUND(SUM(CASE WHEN s.name='Placed' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) AS hire_rate
        FROM applications a JOIN candidates c ON c.id=a.candidate_id
        LEFT JOIN master_candidate_sources cs ON cs.id=c.source_id
        JOIN master_application_stages s ON s.id=a.stage_id
        GROUP BY c.source_id ORDER BY hire_rate DESC""")
    return ok({"by_recruiter":by_rec,"by_source":by_src})

@app.route('/api/reports/clients')
@require_auth
def rpt_clients():
    return ok(rows("""SELECT c.*,ct.name as contract_type,
        (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id) AS total_revenue,
        (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')) AS revenue_mtd,
        (SELECT COUNT(*) FROM employees e WHERE e.client_id=c.id AND e.status='Active') AS active_placements,
        (SELECT COUNT(*) FROM job_requisitions r WHERE r.client_id=c.id AND r.status='Active') AS open_reqs
        FROM clients c LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
        WHERE c.is_active=1 ORDER BY total_revenue DESC"""))

@app.route('/api/reports/vendors')
@require_auth
def rpt_vendors():
    return ok(rows("""SELECT v.*,vc.name as category,
        CASE WHEN v.sla_score>=90 THEN 'Compliant' WHEN v.sla_score>=80 THEN 'Watch' ELSE 'Breach' END AS compliance_status
        FROM vendors v LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
        WHERE v.is_active=1 ORDER BY v.sla_score DESC"""))

@app.route('/api/reports/workforce')
@require_auth
def rpt_workforce():
    by_dept=rows("""SELECT d.name,COUNT(e.id) AS headcount,
        SUM(CASE WHEN et.name='Full-Time' THEN 1 ELSE 0 END) AS fte,
        SUM(CASE WHEN et.name LIKE 'Contractor%' THEN 1 ELSE 0 END) AS contractors
        FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.status IN ('Active','Onboarding')
        LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        WHERE d.is_active=1 GROUP BY d.id ORDER BY headcount DESC""")
    totals=get_db().execute("""SELECT COUNT(*) AS total,
        SUM(CASE WHEN et.name='Full-Time' THEN 1 ELSE 0 END) AS fte,
        SUM(CASE WHEN et.name LIKE 'Contractor%' THEN 1 ELSE 0 END) AS contractors,
        SUM(CASE WHEN e.status='Onboarding' THEN 1 ELSE 0 END) AS onboarding
        FROM employees e LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        WHERE e.status IN ('Active','Onboarding')""").fetchone()
    return ok({"by_department":by_dept,"totals":dict(totals)})

# ═══════════════════════════════════════════════════════
# SOURCING
# ═══════════════════════════════════════════════════════
@app.route('/api/sourcing/stats')
@require_auth
def sourcing_stats():
    return ok(rows("""SELECT cs.name AS source,COUNT(*) AS total,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) AS hired,
        ROUND(SUM(CASE WHEN s.name='Placed' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) AS hire_rate
        FROM candidates c LEFT JOIN master_candidate_sources cs ON cs.id=c.source_id
        LEFT JOIN applications a ON a.candidate_id=c.id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        GROUP BY c.source_id ORDER BY total DESC"""))

# ═══════════════════════════════════════════════════════
# GLOBAL SEARCH & ACTIVITY
# ═══════════════════════════════════════════════════════
@app.route('/api/search')
@require_auth
def search():
    q=request.args.get('q','').strip()
    if len(q)<2: return ok([])
    like=f'%{q}%'
    results=[]
    results+=rows("SELECT id,'employee' AS type,first_name||' '||last_name AS label,job_title AS sub FROM employees WHERE (first_name||' '||last_name LIKE ? OR emp_id LIKE ?) AND status='Active' LIMIT 4",(like,like))
    results+=rows("SELECT id,'client' AS type,name AS label,industry AS sub FROM clients WHERE name LIKE ? AND is_active=1 LIMIT 4",(like,))
    results+=rows("SELECT id,'candidate' AS type,first_name||' '||last_name AS label,current_title AS sub FROM candidates WHERE first_name||' '||last_name LIKE ? AND is_active=1 LIMIT 4",(like,))
    results+=rows("SELECT r.id,'requisition' AS type,r.title AS label,c.name AS sub FROM job_requisitions r JOIN clients c ON c.id=r.client_id WHERE r.title LIKE ? AND r.status='Active' LIMIT 4",(like,))
    return ok(results)

@app.route('/api/activity')
@require_auth
def activity():
    limit=request.args.get('limit',20)
    return ok(rows("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?",(limit,)))

# ═══════════════════════════════════════════════════════
# LOOKUP HELPERS
# ═══════════════════════════════════════════════════════
@app.route('/api/lookup/employees')
@require_auth
def lu_employees():
    return ok(rows("SELECT id,first_name||' '||last_name AS name,emp_id,job_title FROM employees WHERE status='Active' ORDER BY first_name"))

@app.route('/api/lookup/clients')
@require_auth
def lu_clients():
    return ok(rows("SELECT id,name FROM clients WHERE is_active=1 ORDER BY name"))

@app.route('/api/lookup/departments')
@require_auth
def lu_departments():
    return ok(rows("SELECT id,name FROM departments WHERE is_active=1 ORDER BY name"))

@app.route('/api/health')
def health():
    return ok({"status":"ok","app":"McHR&TA","db":DB_PATH})

@app.route('/api/admin/reset-db', methods=['GET','POST'])
def reset_db():
    import os as _os, traceback as _tb
    secret = request.args.get('secret','') or request.headers.get('X-Reset-Secret','')
    if secret != 'mchrta-reset-2026':
        return '''<html><body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
            <h2>McHR&TA — Database Reset</h2>
            <p>Click the button below to reset the database and restore admin login.</p>
            <form method="GET">
              <input type="hidden" name="secret" value="mchrta-reset-2026">
              <button type="submit" style="background:#2d8f3e;color:#fff;padding:12px 24px;border:none;border-radius:6px;font-size:16px;cursor:pointer">
                Reset Database &amp; Restore Admin Login
              </button>
            </form>
        </body></html>'''
    try:
        # Step 1: Close any open DB connections
        if 'db' in g:
            g.db.close()
            g.pop('db', None)
        # Step 2: Delete old DB file
        if _os.path.exists(DB_PATH):
            _os.remove(DB_PATH)
        # Step 3: Recreate fresh
        _bootstrap_db()
        return '''<html><body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
            <h2 style="color:#2d8f3e">&#10003; Database Reset Complete!</h2>
            <p style="font-size:16px">You can now log in with:</p>
            <p style="background:#e8f5eb;border:1px solid #2d8f3e;border-radius:8px;padding:16px;font-size:18px;font-weight:bold">
              Username: admin<br>Password: Admin@123
            </p>
            <a href="/" style="display:inline-block;margin-top:20px;background:#2d8f3e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:16px">
              Go to Login Page &rarr;
            </a>
        </body></html>'''
    except Exception as e:
        err_detail = _tb.format_exc()
        return f'''<html><body style="font-family:sans-serif;padding:40px;background:#fff0f0">
            <h2 style="color:#c0392b">Reset Failed</h2>
            <p><strong>Error:</strong> {str(e)}</p>
            <pre style="background:#f4f5f7;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto">{err_detail}</pre>
            <p>Please share this error with your developer.</p>
        </body></html>'''

# ═══════════════════════════════════════════════════════
# RUN
# ═══════════════════════════════════════════════════════
if __name__ == '__main__':
    import sys
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv)>1 else 5000))
    debug = os.environ.get('FLASK_DEBUG','false').lower()=='true'
    print(f"🚀 McHR&TA starting on http://0.0.0.0:{port}", flush=True)
    app.run(debug=debug, port=port, host='0.0.0.0')
