#!/usr/bin/env python3
"""McHR&TA v4 — Flask REST API"""
import os, hashlib, secrets, json, base64
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

app = Flask(__name__, static_folder=STATIC)
app.config['JSON_SORT_KEYS'] = False
SESSION_HOURS = 12

# ── Bootstrap DB ─────────────────────────────────────────────────────────
def get_pg_conn():
    url = DATABASE_URL
    if not url:
        raise RuntimeError("DATABASE_URL environment variable not set")
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)

def _bootstrap_db():
    print("Bootstrapping PostgreSQL...", flush=True)
    try:
        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT to_regclass('public.master_countries')")
        exists = cur.fetchone()['to_regclass'] is not None
        if exists:
            cur.execute("SELECT COUNT(*) as c FROM master_countries")
            seeded = cur.fetchone()['c'] > 0
        else:
            seeded = False
        if not seeded:
            schema_paths = [
                os.path.join(BASE_DIR,'..','db','schema.sql'),
                os.path.join(BASE_DIR,'db','schema.sql'),
                os.path.join('/app','db','schema.sql'),
            ]
            schema_path = next((p for p in schema_paths if os.path.exists(p)), None)
            if schema_path:
                with open(schema_path) as f:
                    schema_sql = f.read()
                import re as _re
                stmts = [s.strip() for s in schema_sql.split(';') if s.strip() and not s.strip().startswith('--')]
                for stmt in stmts:
                    try:
                        cur.execute(stmt)
                    except Exception as e:
                        if 'already exists' not in str(e).lower():
                            print(f"Schema: {e}", flush=True)
                        conn.autocommit = True
            _seed_pg(cur)
        conn.close()
        print("PostgreSQL ready", flush=True)
    except Exception as e:
        import traceback
        print(f"DB bootstrap error: {e}", flush=True)
        traceback.print_exc()

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
        conn.autocommit = False
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
def ok(data=None,msg="ok",status=200): return jsonify({"success":True,"message":msg,"data":data}),status
def err(msg="Error",status=400):       return jsonify({"success":False,"message":msg}),status
def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()
def log(etype,eid,action,desc,uname="System"):
    _cur().execute("INSERT INTO activity_log(entity_type,entity_id,action,description,user_name) VALUES(%s,%s,%s,%s,%s)",(etype,str(eid),action,desc,uname))

# ── Auth ─────────────────────────────────────────────────────────────────
def get_user():
    token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
    if not token: return None
    db = get_db()
    _cur().execute("DELETE FROM user_sessions WHERE expires_at < NOW()"); get_db().commit()
    sess = _cur().execute("""SELECT u.*,r.name as role_name FROM user_sessions s
        JOIN users u ON u.id=s.user_id JOIN master_user_roles r ON r.id=u.role_id
        WHERE s.token=%s AND s.expires_at>NOW() AND u.is_active=1""",(token,)).fetchone()
    return dict(sess) if sess else None

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
    db=get_db()
    u=_cur().execute("""SELECT u.*,r.name as role_name FROM users u
        JOIN master_user_roles r ON r.id=u.role_id
        WHERE (u.username=%s OR u.email=%s) AND u.is_active=1""",
        (d['username'],d['username'])).fetchone()
    if not u or u['password_hash']!=hash_pw(d['password']):
        return err("Invalid username or password.",401)
    token=secrets.token_urlsafe(32)
    exp=(datetime.utcnow()+timedelta(hours=SESSION_HOURS))
    _cur().execute("INSERT INTO user_sessions(user_id,token,ip_address,user_agent,expires_at) VALUES(%s,%s,%s,%s,%s) RETURNING id",
               (u['id'],token,request.remote_addr,request.headers.get('User-Agent',''),exp))
    _cur().execute("UPDATE users SET last_login=NOW() WHERE id=%s",(u['id'],))
    get_db().commit()
    # Get employee info if linked
    emp = None
    if u['employee_id']:
        emp = row1("SELECT emp_id,reporting_manager_id FROM employees WHERE id=?",(u['employee_id'],))
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
        old=_cur().execute("SELECT password_hash FROM users WHERE id=%s",(g.user['id'],)).fetchone()
        if not old or old[0]!=hash_pw(d.get('old_password','')):
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
    cur=_cur();cur.execute("INSERT INTO users(username,email,password_hash,role_id,employee_id,client_id,vendor_id,full_name,must_change_pwd) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,1)",
        (d['username'],d['email'],hash_pw(d['password']),d['role_id'],
         d.get('employee_id'),d.get('client_id'),d.get('vendor_id'),d.get('full_name')))
    get_db().commit(); return ok({"id":cur['id']},"User created",201)

@app.route('/api/users/<int:uid>', methods=['GET','PUT','DELETE'])
@require_auth
def user_detail(uid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT u.*,r.name as role_name FROM users u JOIN master_user_roles r ON r.id=u.role_id WHERE u.id=?",(uid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        _cur().execute("UPDATE users SET is_active=0 WHERE id=%s",(uid,)); db.commit(); return ok(msg="Deactivated")
    d=request.get_json()
    _cur().execute("UPDATE users SET email=%s,role_id=%s,full_name=%s,is_active=%s,employee_id=%s,client_id=%s,vendor_id=%s WHERE id=%s",
        (d.get('email'),d.get('role_id'),d.get('full_name'),d.get('is_active',1),
         d.get('employee_id'),d.get('client_id'),d.get('vendor_id'),uid))
    if d.get('reset_password'):
        _cur().execute("UPDATE users SET password_hash=%s,must_change_pwd=1 WHERE id=%s",(hash_pw(d['reset_password']),uid))
    get_db().commit(); return ok(msg="Updated")

# ═══════════════════════════════════════════════════
# MASTERS
# ═══════════════════════════════════════════════════
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
            return ok(rows(f"SELECT * FROM {tbl} WHERE country_id=? AND is_active=1 ORDER BY name",(country,)))
        india = _cur().execute("SELECT id FROM master_countries WHERE code='IN'").fetchone()
        if india: return ok(rows(f"SELECT * FROM {tbl} WHERE country_id=? AND is_active=1 ORDER BY name",(india[0],)))
    has_sort = any(r[1]=='sort_order' for r in _cur().execute(f'PRAGMA table_info({tbl})').fetchall())
    order = 'sort_order,name' if has_sort else 'name'
    return ok(rows(f"SELECT * FROM {tbl} WHERE is_active=1 ORDER BY {order}"))


# ═══════════════════════════════════════════════════
# ORGANISATION
# ═══════════════════════════════════════════════════
@app.route('/api/organisation', methods=['GET','PUT'])
@require_auth
def organisation():
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
        org['bank_accounts']=rows("SELECT * FROM organisation_bank_accounts WHERE organisation_id=? AND is_active=1 ORDER BY is_primary DESC",(org['id'],))
        org['labour_certs']=rows("""SELECT lc.*,s.name as state_name
            FROM organisation_labour_certs lc LEFT JOIN master_states s ON s.id=lc.state_id
            WHERE lc.organisation_id=%s AND lc.is_active=1""",(org['id'],))
        org['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM organisation_documents WHERE organisation_id=? AND is_active=1 ORDER BY uploaded_at DESC",(org['id'],))
        return ok(org)
    d=request.get_json()
    existing=_cur().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    fields=['legal_name','trade_name','email','phone','website',
            'reg_address_line1','reg_address_line2','reg_city','reg_state_id','reg_pincode','reg_country_id',
            'biz_address_line1','biz_address_line2','biz_city','biz_state_id','biz_pincode','biz_country_id',
            'poc_name','poc_email','poc_phone','pan','cin','tan','msme_number',
            'iec_code','profession_tax_number','pf_number','esi_number',
            'incorporation_date','financial_year_start']
    vals=[d.get(f) for f in fields]
    if existing:
        _cur().execute("UPDATE organisation SET "+",".join(f+"=%s" for f in fields)+",updated_at=NOW() WHERE id=%s",vals+[existing[0]])
        org_id=existing[0]
    else:
        cur_org=_cur()
        cur_org.execute("INSERT INTO organisation("+",".join(fields)+") VALUES("+",".join(["%s"]*len(fields))+")",vals)
        row=cur_org.fetchone()
        org_id=row['id'] if row else None
    get_db().commit(); log("organisation",org_id,"updated","Organisation profile updated",g.user.get('username','System')); db.commit()
    return ok(msg="Organisation updated")

@app.route('/api/organisation/gst', methods=['POST'])
@require_auth
def add_gst():
    d=request.get_json()
    org=_cur().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up.")
    _cur().execute("INSERT INTO organisation_gst(organisation_id,gstin,state_id,trade_name,registration_date,is_primary) VALUES(%s,%s,%s,%s,%s,%s)",
        (org[0],d['gstin'],d.get('state_id'),d.get('trade_name'),d.get('registration_date'),d.get('is_primary',0)))
    get_db().commit(); return ok(msg="GST added",status=201)

@app.route('/api/organisation/gst/<int:gid>', methods=['PUT','DELETE'])
@require_auth
def gst_detail(gid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE organisation_gst SET is_active=0 WHERE id=%s",(gid,)); db.commit(); return ok(msg="GST removed")
    d=request.get_json()
    _cur().execute("UPDATE organisation_gst SET gstin=%s,state_id=%s,trade_name=%s,registration_date=%s,is_primary=%s WHERE id=%s",
        (d['gstin'],d.get('state_id'),d.get('trade_name'),d.get('registration_date'),d.get('is_primary',0),gid))
    get_db().commit(); return ok(msg="GST updated")

@app.route('/api/organisation/banks', methods=['POST'])
@require_auth
def add_bank():
    d=request.get_json()
    org=_cur().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up.")
    _cur().execute("""INSERT INTO organisation_bank_accounts
        (organisation_id,account_name,bank_name,branch,account_number,ifsc_code,swift_code,account_type,currency,is_primary)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (org[0],d['account_name'],d['bank_name'],d.get('branch'),d['account_number'],
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
    org=_cur().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up.")
    _cur().execute("INSERT INTO organisation_labour_certs(organisation_id,cert_number,issuing_authority,state_id,valid_from,valid_until) VALUES(%s,%s,%s,%s,%s,%s)",
        (org[0],d['cert_number'],d.get('issuing_authority'),d.get('state_id'),d.get('valid_from'),d.get('valid_until')))
    get_db().commit(); return ok(msg="Labour cert added",status=201)

@app.route('/api/organisation/labour-certs/<int:lid>', methods=['PUT','DELETE'])
@require_auth
def labour_cert_detail(lid):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE organisation_labour_certs SET is_active=0 WHERE id=%s",(lid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("UPDATE organisation_labour_certs SET cert_number=%s,issuing_authority=%s,state_id=%s,valid_from=%s,valid_until=%s WHERE id=%s",
        (d['cert_number'],d.get('issuing_authority'),d.get('state_id'),d.get('valid_from'),d.get('valid_until'),lid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/organisation/documents', methods=['GET','POST'])
@require_auth
def org_docs():
    db=get_db()
    org=_cur().execute("SELECT id FROM organisation LIMIT 1").fetchone()
    if not org: return err("Organisation not set up.")
    if request.method=='GET':
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM organisation_documents WHERE organisation_id=? AND is_active=1 ORDER BY uploaded_at DESC",(org[0],)))
    d=request.get_json()
    # file_data is base64 encoded file content
    _cur().execute("INSERT INTO organisation_documents(organisation_id,doc_type,doc_name,file_data,file_size,mime_type) VALUES(%s,%s,%s,%s,%s,%s)",
        (org[0],d['doc_type'],d['doc_name'],d.get('file_data'),d.get('file_size'),d.get('mime_type')))
    get_db().commit(); return ok(msg="Document saved",status=201)

@app.route('/api/organisation/documents/<int:did>', methods=['GET','DELETE'])
@require_auth
def org_doc_detail(did):
    db=get_db()
    if request.method=='DELETE':
        _cur().execute("UPDATE organisation_documents SET is_active=0 WHERE id=%s",(did,)); db.commit(); return ok(msg="Removed")
    # GET returns full file data for download
    r=row1("SELECT * FROM organisation_documents WHERE id=?",(did,))
    return ok(r) if r else err("Not found",404)

# ═══════════════════════════════════════════════════
# ORG STRUCTURE
# ═══════════════════════════════════════════════════
@app.route('/api/org/summary')
@require_auth
def org_summary():
    db=get_db()
    return ok({"departments":_cur().execute("SELECT COUNT(*) FROM departments WHERE is_active=1").fetchone()[0],
               "offices":_cur().execute("SELECT COUNT(*) FROM office_locations WHERE is_active=1").fetchone()[0],
               "business_units":_cur().execute("SELECT COUNT(*) FROM business_units WHERE is_active=1").fetchone()[0],
               "cost_centres":_cur().execute("SELECT COUNT(*) FROM cost_centres WHERE is_active=1").fetchone()[0]})

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
    cur=_cur();cur.execute("INSERT INTO departments(name,business_unit_id,cost_centre_id,head_name,budget,cost_center,location) VALUES(%s,%s,%s,%s,%s,%s,%s)",
        (d['name'],d.get('business_unit_id'),d.get('cost_centre_id'),d.get('head_name'),d.get('budget',0),d.get('cost_center'),d.get('location')))
    get_db().commit(); return ok({"id":cur['id']},"Department created",201)

@app.route('/api/departments/<int:did>', methods=['PUT','DELETE'])
@require_auth
def dept_detail(did):
    db=get_db()
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
    cur=_cur();cur.execute("INSERT INTO business_units(name,description,head_name) VALUES(%s,%s,%s)",(d['name'],d.get('description'),d.get('head_name')))
    get_db().commit(); return ok({"id":cur['id']},"Business unit created",201)

@app.route('/api/business-units/<int:bid>', methods=['PUT','DELETE'])
@require_auth
def bu_detail(bid):
    db=get_db()
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
    cur=_cur();cur.execute("INSERT INTO cost_centres(code,name,business_unit_id,budget) VALUES(%s,%s,%s,%s)",(d['code'],d['name'],d.get('business_unit_id'),d.get('budget',0)))
    get_db().commit(); return ok({"id":cur['id']},"Cost centre created",201)

@app.route('/api/cost-centres/<int:cid>', methods=['PUT','DELETE'])
@require_auth
def cc_detail(cid):
    db=get_db()
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
    cur=_cur();cur.execute("INSERT INTO office_locations(name,city,state_id,country_id,address_line1,pincode,type,headcount) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
        (d['name'],d.get('city'),d.get('state_id'),d.get('country_id'),d.get('address_line1'),d.get('pincode'),d.get('type','Regional'),d.get('headcount',0)))
    get_db().commit(); return ok({"id":cur['id']},"Location created",201)

@app.route('/api/offices/<int:oid>', methods=['PUT','DELETE'])
@require_auth
def office_detail(oid):
    db=get_db()
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
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT c.*,ct.name as contract_type,pt.name as payment_terms,
            s.name as state_name,co.name as country_name,
            e.first_name||' '||e.last_name as account_manager_name,
            (SELECT COUNT(*) FROM job_requisitions r WHERE r.client_id=c.id AND r.status='Active') as open_reqs,
            (SELECT COUNT(*) FROM employees em WHERE em.client_id=c.id AND em.status='Active') as placements,
            (SELECT COALESCE(SUM(amount),0) FROM invoices i WHERE i.client_id=c.id AND TO_CHAR(i.created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')) as revenue_mtd
            FROM clients c
            LEFT JOIN master_contract_types ct ON ct.id=c.contract_type_id
            LEFT JOIN master_payment_terms pt ON pt.id=c.payment_terms_id
            LEFT JOIN master_states s ON s.id=c.state_id
            LEFT JOIN master_countries co ON co.id=c.country_id
            LEFT JOIN employees e ON e.id=c.account_manager_id
            WHERE c.is_active=1 ORDER BY c.name"""))
    d=request.get_json()
    cur=_cur();cur.execute("""INSERT INTO clients(name,industry,contract_type_id,currency,payment_terms_id,
        status,rating,referred_by,
        primary_contact,primary_contact_designation,contact_email,contact_phone,
        billing_contact_name,billing_contact_designation,billing_contact_phone,billing_contact_email,
        address_line1,address_line2,city,state_id,pincode,country_id,
        gstin,pan,account_manager_id,health_score)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (d['name'],d.get('industry'),d.get('contract_type_id'),d.get('currency','INR'),d.get('payment_terms_id'),
         d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('billing_contact_name'),d.get('billing_contact_designation'),d.get('billing_contact_phone'),d.get('billing_contact_email'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),d.get('health_score',80)))
    get_db().commit(); log("clients",cur['id'],"created",f"Client '{d['name']}' added",g.user.get('username')); db.commit()
    return ok({"id":cur['id']},"Client created",201)

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
        r['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM client_documents WHERE client_id=? AND is_active=1 ORDER BY uploaded_at DESC",(cid,))
        return ok(r)
    if request.method=='DELETE':
        _cur().execute("UPDATE clients SET is_active=0 WHERE id=%s",(cid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("""UPDATE clients SET name=%s,industry=%s,contract_type_id=%s,currency=%s,payment_terms_id=%s,
        status=%s,rating=%s,referred_by=%s,
        primary_contact=%s,primary_contact_designation=%s,contact_email=%s,contact_phone=%s,
        billing_contact_name=%s,billing_contact_designation=%s,billing_contact_phone=%s,billing_contact_email=%s,
        address_line1=%s,address_line2=%s,city=%s,state_id=%s,pincode=%s,country_id=%s,
        gstin=%s,pan=%s,account_manager_id=%s,health_score=%s,updated_at=NOW() WHERE id=%s""",
        (d['name'],d.get('industry'),d.get('contract_type_id'),d.get('currency','INR'),d.get('payment_terms_id'),
         d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('billing_contact_name'),d.get('billing_contact_designation'),d.get('billing_contact_phone'),d.get('billing_contact_email'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),d.get('health_score',80),cid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/clients/<int:cid>/documents', methods=['GET','POST'])
@require_auth
def client_docs(cid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM client_documents WHERE client_id=? AND is_active=1 ORDER BY uploaded_at DESC",(cid,)))
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
    r=row1("SELECT * FROM client_documents WHERE id=?",(did,))
    return ok(r) if r else err("Not found",404)

# ═══════════════════════════════════════════════════
# VENDORS
# ═══════════════════════════════════════════════════
@app.route('/api/vendors', methods=['GET','POST'])
@require_auth
def vendors():
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
    cur=_cur();cur.execute("""INSERT INTO vendors(name,category_id,status,rating,referred_by,
        primary_contact,primary_contact_designation,contact_email,contact_phone,
        address_line1,address_line2,city,state_id,pincode,country_id,gstin,pan,
        account_manager_id,bank_account_name,bank_name,bank_branch,bank_account_number,bank_ifsc,bank_swift,bank_account_type,
        contract_end,sla_score,spend_mtd,sla_description)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (d['name'],d.get('category_id'),d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc'),d.get('bank_swift'),d.get('bank_account_type','Current'),
         d.get('contract_end'),d.get('sla_score',90),d.get('spend_mtd',0),d.get('sla_description')))
    get_db().commit(); return ok({"id":cur['id']},"Vendor created",201)

@app.route('/api/vendors/<int:vid>', methods=['GET','PUT','DELETE'])
@require_auth
def vendor_detail(vid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT v.*,vc.name as category,s.name as state_name,c.name as country_name,
            e.first_name||' '||e.last_name as account_manager_name
            FROM vendors v LEFT JOIN master_vendor_categories vc ON vc.id=v.category_id
            LEFT JOIN master_states s ON s.id=v.state_id LEFT JOIN master_countries c ON c.id=v.country_id
            LEFT JOIN employees e ON e.id=v.account_manager_id WHERE v.id=%s""",(vid,))
        if not r: return err("Not found",404)
        r['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM vendor_documents WHERE vendor_id=? AND is_active=1 ORDER BY uploaded_at DESC",(vid,))
        return ok(r)
    if request.method=='DELETE':
        _cur().execute("UPDATE vendors SET is_active=0 WHERE id=%s",(vid,)); db.commit(); return ok(msg="Removed")
    d=request.get_json()
    _cur().execute("""UPDATE vendors SET name=%s,category_id=%s,status=%s,rating=%s,referred_by=%s,
        primary_contact=%s,primary_contact_designation=%s,contact_email=%s,contact_phone=%s,
        address_line1=%s,address_line2=%s,city=%s,state_id=%s,pincode=%s,country_id=%s,gstin=%s,pan=%s,
        account_manager_id=%s,bank_account_name=%s,bank_name=%s,bank_branch=%s,bank_account_number=%s,bank_ifsc=%s,bank_swift=%s,bank_account_type=%s,
        contract_end=%s,sla_score=%s,sla_description=%s,updated_at=NOW() WHERE id=%s""",
        (d['name'],d.get('category_id'),d.get('status','Active'),d.get('rating',0),d.get('referred_by'),
         d.get('primary_contact'),d.get('primary_contact_designation'),d.get('contact_email'),d.get('contact_phone'),
         d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),
         d.get('gstin'),d.get('pan'),d.get('account_manager_id'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc'),d.get('bank_swift'),d.get('bank_account_type','Current'),
         d.get('contract_end'),d.get('sla_score',90),d.get('sla_description'),vid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/vendors/<int:vid>/documents', methods=['GET','POST'])
@require_auth
def vendor_docs(vid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM vendor_documents WHERE vendor_id=? AND is_active=1",(vid,)))
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
    r=row1("SELECT * FROM vendor_documents WHERE id=?",(did,))
    return ok(r) if r else err("Not found",404)


# ═══════════════════════════════════════════════════
# EMPLOYEES
# ═══════════════════════════════════════════════════
@app.route('/api/employees', methods=['GET','POST'])
@require_auth
def employees():
    db=get_db()
    if request.method=='GET':
        q=request.args.get('q',''); status=request.args.get('status',''); et=request.args.get('employment_type','')
        sql="""SELECT e.*,d.name as department_name,et.name as employment_type,
            c.name as client_name,
            m.first_name||' '||m.last_name as manager_name,
            rm.first_name||' '||rm.last_name as reporting_manager_name
            FROM employees e
            LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
            LEFT JOIN clients c ON c.id=e.client_id
            LEFT JOIN employees m ON m.id=e.manager_id
            LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
            WHERE e.is_active=1"""
        params=[]
        if status: sql+=" AND e.status=?"; params.append(status)
        if et: sql+=" AND et.name=?"; params.append(et)
        if q: sql+=" AND (e.first_name||' '||e.last_name LIKE ? OR e.emp_id LIKE ? OR e.job_title LIKE ?)"; params+=[f'%{q}%']*3
        sql+=" ORDER BY e.last_name,e.first_name"
        return ok(rows(sql,params))
    d=request.get_json()
    # Auto-generate emp_id if not provided or check uniqueness
    emp_id = d.get('emp_id','').strip()
    if not emp_id:
        et_row = _cur().execute("SELECT name FROM master_employment_types WHERE id=%s",(d.get('employment_type_id',1),)).fetchone()
        prefix = "CTR" if et_row and "Contractor" in et_row[0] else "EMP"
        n = _cur().execute(f"SELECT COUNT(*) FROM employees WHERE emp_id LIKE '{prefix}-%'").fetchone()[0]
        emp_id = f"{prefix}-{n+1:04d}"
        while _cur().execute("SELECT id FROM employees WHERE emp_id=%s",(emp_id,)).fetchone():
            n+=1; emp_id=f"{prefix}-{n+1:04d}"
    else:
        if _cur().execute("SELECT id FROM employees WHERE emp_id=%s",(emp_id,)).fetchone():
            return err(f"Employee code '{emp_id}' already exists. Please use a different code.")
    cur=_cur();cur.execute("""INSERT INTO employees(emp_id,first_name,middle_name,last_name,email,phone,
        personal_email,personal_phone,job_title,department_id,employment_type_id,
        location,office_location_id,manager_id,reporting_manager_id,client_id,
        salary,bill_rate,billable,billable_amount,start_date,status,referred_by,rating,
        pan,aadhaar,passport_number,pf_number,esi_number,
        bank_account_name,bank_name,bank_branch,bank_account_number,bank_ifsc)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (emp_id,d['first_name'],d.get('middle_name'),d['last_name'],d.get('email'),d.get('phone'),
         d.get('personal_email'),d.get('personal_phone'),d.get('job_title'),d.get('department_id'),d.get('employment_type_id'),
         d.get('location'),d.get('office_location_id'),d.get('manager_id'),d.get('reporting_manager_id'),d.get('client_id'),
         d.get('salary',0),d.get('bill_rate',0),d.get('billable',0),d.get('billable_amount',0),
         d.get('start_date'),d.get('status','Active'),d.get('referred_by'),d.get('rating',0),
         d.get('pan'),d.get('aadhaar'),d.get('passport_number'),d.get('pf_number'),d.get('esi_number'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc')))
    emp_db_id=cur['id']
    # Save addresses
    for atype in ['Current','Permanent']:
        key=atype.lower()
        if d.get(f'{key}_address_line1') or d.get(f'{key}_city'):
            _cur().execute("INSERT INTO employee_addresses(employee_id,address_type,address_line1,address_line2,city,state_id,pincode,country_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                (emp_db_id,atype,d.get(f'{key}_address_line1'),d.get(f'{key}_address_line2'),d.get(f'{key}_city'),d.get(f'{key}_state_id'),d.get(f'{key}_pincode'),d.get(f'{key}_country_id')))
    get_db().commit()
    log("employees",emp_db_id,"hired",f"{d['first_name']} {d['last_name']} ({emp_id}) added",g.user.get('username','System')); db.commit()
    return ok({"id":emp_db_id,"emp_id":emp_id},"Employee created",201)

@app.route('/api/employees/<int:eid>', methods=['GET','PUT','DELETE'])
@require_auth
def employee_detail(eid):
    db=get_db()
    if request.method=='GET':
        r=row1("""SELECT e.*,d.name as department_name,et.name as employment_type,
            c.name as client_name,m.first_name||' '||m.last_name as manager_name,
            rm.first_name||' '||rm.last_name as reporting_manager_name
            FROM employees e LEFT JOIN departments d ON d.id=e.department_id
            LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
            LEFT JOIN clients c ON c.id=e.client_id
            LEFT JOIN employees m ON m.id=e.manager_id
            LEFT JOIN employees rm ON rm.id=e.reporting_manager_id
            WHERE e.id=%s""",(eid,))
        if not r: return err("Not found",404)
        r['addresses']=rows("SELECT * FROM employee_addresses WHERE employee_id=?",(eid,))
        r['emergency_contacts']=rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=?",(eid,))
        r['education']=rows("SELECT * FROM employee_education WHERE employee_id=? ORDER BY sort_order,end_year DESC",(eid,))
        r['experience']=rows("SELECT * FROM employee_experience WHERE employee_id=? ORDER BY sort_order,start_date DESC",(eid,))
        r['documents']=rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM employee_documents WHERE employee_id=? AND is_active=1",(eid,))
        r['payslips']=rows("SELECT month,ctc,net_salary,total_earnings,total_deductions FROM payroll_entries WHERE employee_id=? ORDER BY month DESC LIMIT 12",(eid,))
        return ok(r)
    if request.method=='DELETE':
        _cur().execute("UPDATE employees SET status='Terminated',is_active=0 WHERE id=%s",(eid,)); db.commit(); return ok(msg="Terminated")
    d=request.get_json()
    # Check emp_id uniqueness on update
    new_emp_id=d.get('emp_id','').strip()
    if new_emp_id:
        conflict=_cur().execute("SELECT id FROM employees WHERE emp_id=%s AND id!=%s",(new_emp_id,eid)).fetchone()
        if conflict: return err(f"Employee code '{new_emp_id}' is already used by another employee.")
    _cur().execute("""UPDATE employees SET emp_id=COALESCE(NULLIF(%s,\"\"),emp_id),
        first_name=%s,middle_name=%s,last_name=%s,email=%s,phone=%s,
        personal_email=%s,personal_phone=%s,job_title=%s,department_id=%s,employment_type_id=%s,
        location=%s,office_location_id=%s,manager_id=%s,reporting_manager_id=%s,client_id=%s,
        salary=%s,bill_rate=%s,billable=%s,billable_amount=%s,start_date=%s,status=%s,referred_by=%s,rating=%s,
        pan=%s,aadhaar=%s,passport_number=%s,pf_number=%s,esi_number=%s,
        bank_account_name=%s,bank_name=%s,bank_branch=%s,bank_account_number=%s,bank_ifsc=%s,updated_at=NOW() WHERE id=%s""",
        (new_emp_id,d['first_name'],d.get('middle_name'),d['last_name'],d.get('email'),d.get('phone'),
         d.get('personal_email'),d.get('personal_phone'),d.get('job_title'),d.get('department_id'),d.get('employment_type_id'),
         d.get('location'),d.get('office_location_id'),d.get('manager_id'),d.get('reporting_manager_id'),d.get('client_id'),
         d.get('salary',0),d.get('bill_rate',0),d.get('billable',0),d.get('billable_amount',0),
         d.get('start_date'),d.get('status','Active'),d.get('referred_by'),d.get('rating',0),
         d.get('pan'),d.get('aadhaar'),d.get('passport_number'),d.get('pf_number'),d.get('esi_number'),
         d.get('bank_account_name'),d.get('bank_name'),d.get('bank_branch'),d.get('bank_account_number'),d.get('bank_ifsc'),eid))
    get_db().commit(); return ok(msg="Updated")

# Employee sub-resources
@app.route('/api/employees/<int:eid>/addresses', methods=['GET','POST'])
@require_auth
def emp_addresses(eid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT ea.*,s.name as state_name,c.name as country_name FROM employee_addresses ea LEFT JOIN master_states s ON s.id=ea.state_id LEFT JOIN master_countries c ON c.id=ea.country_id WHERE ea.employee_id=?",(eid,)))
    d=request.get_json()
    # Upsert by type
    existing=_cur().execute("SELECT id FROM employee_addresses WHERE employee_id=%s AND address_type=%s",(eid,d['address_type'])).fetchone()
    if existing:
        _cur().execute("UPDATE employee_addresses SET address_line1=%s,address_line2=%s,city=%s,state_id=%s,pincode=%s,country_id=%s WHERE id=%s",
            (d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id'),existing[0]))
    else:
        _cur().execute("INSERT INTO employee_addresses(employee_id,address_type,address_line1,address_line2,city,state_id,pincode,country_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
            (eid,d['address_type'],d.get('address_line1'),d.get('address_line2'),d.get('city'),d.get('state_id'),d.get('pincode'),d.get('country_id')))
    get_db().commit(); return ok(msg="Address saved")

@app.route('/api/employees/<int:eid>/emergency-contacts', methods=['GET','POST'])
@require_auth
def emp_emergency(eid):
    db=get_db()
    if request.method=='GET':
        return ok(rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=?",(eid,)))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO employee_emergency_contacts(employee_id,name,phone,email,relationship,is_primary) VALUES(%s,%s,%s,%s,%s,%s)",
        (eid,d['name'],d.get('phone'),d.get('email'),d.get('relationship'),d.get('is_primary',0)))
    get_db().commit(); return ok({"id":cur['id']},"Added",201)

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
        return ok(rows("SELECT * FROM employee_education WHERE employee_id=? ORDER BY sort_order,end_year DESC",(eid,)))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO employee_education(employee_id,institution,degree,field_of_study,start_year,end_year,grade) VALUES(%s,%s,%s,%s,%s,%s,%s)",
        (eid,d['institution'],d.get('degree'),d.get('field_of_study'),d.get('start_year'),d.get('end_year'),d.get('grade')))
    get_db().commit(); return ok({"id":cur['id']},"Added",201)

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
        return ok(rows("SELECT * FROM employee_experience WHERE employee_id=? ORDER BY sort_order,start_date DESC",(eid,)))
    d=request.get_json()
    cur=_cur();cur.execute("INSERT INTO employee_experience(employee_id,company,designation,location,start_date,end_date,is_current,description) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
        (eid,d['company'],d.get('designation'),d.get('location'),d.get('start_date'),d.get('end_date'),d.get('is_current',0),d.get('description')))
    get_db().commit(); return ok({"id":cur['id']},"Added",201)

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
        return ok(rows("SELECT id,doc_type,doc_name,file_size,mime_type,uploaded_at FROM employee_documents WHERE employee_id=? AND is_active=1",(eid,)))
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
    r=row1("SELECT * FROM employee_documents WHERE id=?",(did,))
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
        r['addresses']=rows("SELECT * FROM employee_addresses WHERE employee_id=?",(g.user['employee_id'],))
        r['emergency_contacts']=rows("SELECT * FROM employee_emergency_contacts WHERE employee_id=?",(g.user['employee_id'],))
        r['education']=rows("SELECT * FROM employee_education WHERE employee_id=? ORDER BY end_year DESC",(g.user['employee_id'],))
        r['experience']=rows("SELECT * FROM employee_experience WHERE employee_id=? ORDER BY start_date DESC",(g.user['employee_id'],))
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
    st=_cur().execute("SELECT id FROM master_timesheet_statuses WHERE name='Pending'").fetchone()[0]
    cur=_cur();cur.execute("INSERT INTO timesheets(employee_id,client_id,project,week_ending,regular_hours,overtime_hours,bill_rate,status_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
        (g.user['employee_id'],d.get('client_id'),d.get('project'),d['week_ending'],
         d.get('regular_hours',0),d.get('overtime_hours',0),d.get('bill_rate',0),st))
    get_db().commit(); return ok({"id":cur['id']},"Timesheet submitted",201)

@app.route('/api/my/payslips')
@require_auth
def my_payslips():
    if not g.user.get('employee_id'): return err("No employee profile linked.",403)
    return ok(rows("SELECT * FROM payroll_entries WHERE employee_id=? ORDER BY month DESC",(g.user['employee_id'],)))

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
        if status: sql+=" AND s.name=?"; params.append(status)
        sql+=" ORDER BY t.week_ending DESC,t.submitted_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    st=_cur().execute("SELECT id FROM master_timesheet_statuses WHERE name='Pending'").fetchone()[0]
    cur=_cur();cur.execute("INSERT INTO timesheets(employee_id,client_id,project,week_ending,regular_hours,overtime_hours,bill_rate,status_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
        (d['employee_id'],d.get('client_id'),d.get('project'),d['week_ending'],d.get('regular_hours',0),d.get('overtime_hours',0),d.get('bill_rate',0),st))
    get_db().commit(); return ok({"id":cur['id']},"Submitted",201)

@app.route('/api/timesheets/summary')
@require_auth
def ts_summary():
    db=get_db()
    total=_cur().execute("SELECT COALESCE(SUM(total_hours),0) FROM timesheets WHERE week_ending=(SELECT MAX(week_ending) FROM timesheets)").fetchone()[0]
    billable=_cur().execute("SELECT COALESCE(SUM(total_hours),0) FROM timesheets WHERE bill_rate>0 AND week_ending=(SELECT MAX(week_ending) FROM timesheets)").fetchone()[0]
    pending=_cur().execute("SELECT COUNT(*) FROM timesheets t JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE s.name='Pending'").fetchone()[0]
    ot=_cur().execute("SELECT COUNT(*) FROM timesheets t JOIN master_timesheet_statuses s ON s.id=t.status_id WHERE s.name='Pending' AND t.overtime_hours>0").fetchone()[0]
    return ok({"total_hours":total,"billable_hours":billable,"pending_approval":pending,"ot_alerts":ot,"utilization":round(billable/total*100,1) if total else 0})

@app.route('/api/timesheets/<int:tid>', methods=['GET','PUT'])
@require_auth
def ts_detail(tid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT * FROM timesheets WHERE id=?",(tid,)); return ok(r) if r else err("Not found",404)
    d=request.get_json()
    new_status=d.get('status','Pending')
    st=_cur().execute("SELECT id FROM master_timesheet_statuses WHERE name=%s",(new_status,)).fetchone()
    if not st: return err("Invalid status")
    _cur().execute("UPDATE timesheets SET status_id=%s,notes=%s WHERE id=%s",(st[0],d.get('notes'),tid))
    if new_status=='Approved': _cur().execute("UPDATE timesheets SET approved_at=NOW() WHERE id=%s",(tid,))
    get_db().commit()
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
    rt=_cur().execute("SELECT id FROM master_payroll_run_types WHERE name=%s",(d.get('run_type','Semi-Monthly FTE'),)).fetchone()
    cur=_cur();cur.execute("INSERT INTO payroll_runs(run_date,period_start,period_end,run_type_id,employee_count,gross_amount,status) VALUES(%s,%s,%s,%s,%s,%s,'Scheduled')",
        (d['run_date'],d.get('period_start'),d.get('period_end'),rt[0] if rt else None,d.get('employee_count',0),d.get('gross_amount',0)))
    get_db().commit(); return ok({"id":cur['id']},"Scheduled",201)

@app.route('/api/payroll/summary')
@require_auth
def payroll_summary():
    db=get_db()
    et_fte=_cur().execute("SELECT id FROM master_employment_types WHERE name='Full-Time'").fetchone()
    total_sal=_cur().execute("SELECT COALESCE(SUM(salary),0)/12 FROM employees WHERE employment_type_id=%s AND status='Active'",(et_fte[0],) if et_fte else (0,)).fetchone()[0]
    total_ctr=_cur().execute("SELECT COALESCE(SUM(bill_rate),0)*160 FROM employees WHERE employment_type_id!=%s AND status='Active'",(et_fte[0],) if et_fte else (0,)).fetchone()[0]
    return ok({"base_salaries":round(total_sal),"contractor_payments":round(total_ctr),
               "overtime":84000,"benefits":round(total_sal*0.10),"taxes":round((total_sal+total_ctr)*0.0765),"total":round(total_sal+total_ctr+84000)})

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
    if month: sql+=" AND pe.month=?"; params.append(month)
    if et: sql+=" AND et.name LIKE ?"; params.append(f'%{et}%')
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
        if status: sql+=" AND r.status=?"; params.append(status)
        if pri: sql+=" AND p.name=?"; params.append(pri)
        sql+=" ORDER BY p.sort_order,days_open DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    cur=_cur();cur.execute("""INSERT INTO job_requisitions(title,client_id,engagement_type_id,department_id,recruiter_id,priority_id,location,comp_min,comp_max,description,target_start,opened_date)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_DATE)""",
        (d['title'],d['client_id'],d.get('engagement_type_id'),d.get('department_id'),d.get('recruiter_id'),
         d.get('priority_id'),d.get('location'),d.get('comp_min'),d.get('comp_max'),d.get('description'),d.get('target_start')))
    get_db().commit(); return ok({"id":cur['id']},"Created",201)

@app.route('/api/requisitions/<int:rid>', methods=['GET','PUT','DELETE'])
@require_auth
def req_detail(rid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT r.*,c.name as client_name,p.name as priority,et.name as engagement_type FROM job_requisitions r JOIN clients c ON c.id=r.client_id LEFT JOIN master_priority_levels p ON p.id=r.priority_id LEFT JOIN master_contract_types et ON et.id=r.engagement_type_id WHERE r.id=?",(rid,))
        return ok(r) if r else err("Not found",404)
    if request.method=='DELETE':
        _cur().execute("UPDATE job_requisitions SET status='Closed',is_active=0 WHERE id=%s",(rid,)); db.commit(); return ok(msg="Closed")
    d=request.get_json()
    _cur().execute("UPDATE job_requisitions SET title=%s,priority_id=%s,status=%s,location=%s,comp_min=%s,comp_max=%s,description=%s,recruiter_id=%s WHERE id=%s",
        (d['title'],d.get('priority_id'),d.get('status','Active'),d.get('location'),d.get('comp_min'),d.get('comp_max'),d.get('description'),d.get('recruiter_id'),rid))
    get_db().commit(); return ok(msg="Updated")

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
    cur=_cur();cur.execute("INSERT INTO candidates(first_name,last_name,email,phone,location,current_title,years_exp,source_id,skills) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (d['first_name'],d['last_name'],d.get('email'),d.get('phone'),d.get('location'),d.get('current_title'),d.get('years_exp',0),d.get('source_id'),d.get('skills','')))
    get_db().commit(); return ok({"id":cur['id']},"Added",201)

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
    return ok({"by_stage":grouped,"counts":{s:len(grouped[s]) for s in stages},"total":len(data)})

@app.route('/api/applications', methods=['POST'])
@require_auth
def add_application():
    d=request.get_json()
    sid=_cur().execute("SELECT id FROM master_application_stages WHERE name='Applied'").fetchone()[0]
    cur=_cur();cur.execute("INSERT INTO applications(candidate_id,requisition_id,stage_id,expected_salary,recruiter_id) VALUES(%s,%s,%s,%s,%s)",
        (d['candidate_id'],d['requisition_id'],sid,d.get('expected_salary'),d.get('recruiter_id')))
    get_db().commit(); return ok({"id":cur['id']},"Created",201)

@app.route('/api/applications/<int:aid>', methods=['GET','PUT'])
@require_auth
def app_detail(aid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT a.*,c.first_name||' '||c.last_name as candidate_name,s.name as stage,req.title as role FROM applications a JOIN candidates c ON c.id=a.candidate_id LEFT JOIN master_application_stages s ON s.id=a.stage_id JOIN job_requisitions req ON req.id=a.requisition_id WHERE a.id=?",(aid,))
        return ok(r) if r else err("Not found",404)
    d=request.get_json()
    if d.get('stage'):
        st=_cur().execute("SELECT id FROM master_application_stages WHERE name=%s",(d['stage'],)).fetchone()
        if st: _cur().execute("UPDATE applications SET stage_id=%s,updated_at=NOW() WHERE id=%s",(st[0],aid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/interviews', methods=['GET','POST'])
@require_auth
def interviews():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT i.*,f.name as format,c.first_name||' '||c.last_name as candidate_name,r.title as role,cl.name as client
            FROM interviews i JOIN applications a ON a.id=i.application_id JOIN candidates c ON c.id=a.candidate_id
            JOIN job_requisitions r ON r.id=a.requisition_id JOIN clients cl ON cl.id=r.client_id
            LEFT JOIN master_interview_formats f ON f.id=i.format_id ORDER BY i.scheduled_at"""))
    d=request.get_json()
    fmt=_cur().execute("SELECT id FROM master_interview_formats WHERE name=%s",(d.get('format','Video'),)).fetchone()
    cur=_cur();cur.execute("INSERT INTO interviews(application_id,round,format_id,interviewer,scheduled_at,location_link,notes) VALUES(%s,%s,%s,%s,%s,%s,%s)",
        (d['application_id'],d['round'],fmt[0] if fmt else None,d.get('interviewer'),d.get('scheduled_at'),d.get('location_link'),d.get('notes')))
    get_db().commit(); return ok({"id":cur['id']},"Scheduled",201)

@app.route('/api/interviews/summary')
@require_auth
def int_summary():
    db=get_db()
    return ok({"scheduled_this_week":_cur().execute("SELECT COUNT(*) FROM interviews WHERE scheduled_at::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')").fetchone()[0],
               "awaiting_feedback":_cur().execute("SELECT COUNT(*) FROM interviews WHERE scorecard_status='Pending'").fetchone()[0],
               "overdue_feedback":_cur().execute("SELECT COUNT(*) FROM interviews WHERE scorecard_status='Overdue'").fetchone()[0],
               "no_shows":_cur().execute("SELECT COUNT(*) FROM interviews WHERE decision='No Show'").fetchone()[0]})

@app.route('/api/interviews/<int:iid>', methods=['PUT'])
@require_auth
def int_detail(iid):
    d=request.get_json()
    _cur().execute("UPDATE interviews SET scorecard_status=%s,decision=%s,notes=%s,interviewer=%s,scheduled_at=%s WHERE id=%s",
        (d.get('scorecard_status'),d.get('decision'),d.get('notes'),d.get('interviewer'),d.get('scheduled_at'),iid))
    get_db().commit(); return ok(msg="Updated")

@app.route('/api/onboarding', methods=['GET','POST'])
@require_auth
def onboarding():
    db=get_db()
    if request.method=='GET':
        return ok(rows("""SELECT o.*,t.name as template,e.first_name||' '||e.last_name as employee_name,e.emp_id,e.job_title,c.name as client_name
            FROM onboarding o JOIN employees e ON e.id=o.employee_id
            LEFT JOIN master_onboarding_templates t ON t.id=o.template_id
            LEFT JOIN clients c ON c.id=e.client_id WHERE o.status!='Completed' ORDER BY o.start_date"""))
    d=request.get_json()
    tpl=_cur().execute("SELECT id FROM master_onboarding_templates WHERE name=%s",(d.get('template','Standard FTE'),)).fetchone()
    cur=_cur();cur.execute("INSERT INTO onboarding(employee_id,template_id,buddy_name,start_date,equipment) VALUES(%s,%s,%s,%s,%s)",
        (d['employee_id'],tpl[0] if tpl else None,d.get('buddy_name'),d.get('start_date'),d.get('equipment')))
    ob_id=cur['id']
    for task,cat in [("Offer letter signed","Documents"),("Background check","Compliance"),("Equipment provisioned","IT"),("System access setup","IT"),("Benefits enrollment","HR"),("Day 1 orientation","HR"),("30-day check-in","HR")]:
        _cur().execute("INSERT INTO onboarding_tasks(onboarding_id,task_name,category) VALUES(%s,%s,%s)",(ob_id,task,cat))
    get_db().commit(); return ok({"id":ob_id},"Started",201)

@app.route('/api/onboarding/<int:oid>', methods=['GET','PUT'])
@require_auth
def onb_detail(oid):
    db=get_db()
    if request.method=='GET':
        r=row1("SELECT o.*,t.name as template,e.first_name||' '||e.last_name as employee_name FROM onboarding o JOIN employees e ON e.id=o.employee_id LEFT JOIN master_onboarding_templates t ON t.id=o.template_id WHERE o.id=?",(oid,))
        if not r: return err("Not found",404)
        r['tasks']=rows("SELECT * FROM onboarding_tasks WHERE onboarding_id=? ORDER BY id",(oid,))
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
    r=_cur().execute("SELECT onboarding_id FROM onboarding_tasks WHERE id=%s",(tid,)).fetchone()
    if r:
        stats=_cur().execute("SELECT COUNT(*),SUM(is_complete) FROM onboarding_tasks WHERE onboarding_id=%s",(r[0],)).fetchone()
        pct=round((stats['total'] or 0)/(stats['cnt'] or 1)*100) if stats else 0
        _cur().execute("UPDATE onboarding SET progress_pct=%s WHERE id=%s",(pct,r['onboarding_id']))
    get_db().commit(); return ok(msg="Updated")


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
        if status: sql+=" AND s.name=?"; params.append(status)
        sql+=" ORDER BY i.created_at DESC"
        return ok(rows(sql,params))
    d=request.get_json()
    last=_cur().execute("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1").fetchone()
    num=int(last[0].split('-')[1])+1 if last else 1001
    inv_num=f"INV-{num}"
    st=_cur().execute("SELECT id FROM master_invoice_statuses WHERE name='Draft'").fetchone()[0]
    cur=_cur();cur.execute("INSERT INTO invoices(invoice_number,client_id,contract_type_id,period_start,period_end,amount,tax_amount,due_date,po_number,notes,status_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (inv_num,d['client_id'],d.get('contract_type_id'),d.get('period_start'),d.get('period_end'),d.get('amount',0),d.get('tax_amount',0),d.get('due_date'),d.get('po_number'),d.get('notes'),st))
    get_db().commit()
    log("invoices",cur['id'],"created",f"Invoice {inv_num} created",g.user.get('username')); db.commit()
    return ok({"id":cur['id'],"invoice_number":inv_num},"Created",201)

@app.route('/api/invoices/summary')
@require_auth
def inv_summary():
    db=get_db()
    def q(sql): return _cur().execute(sql).fetchone()[0]
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
        r=row1("SELECT i.*,c.name as client_name,s.name as status FROM invoices i JOIN clients c ON c.id=i.client_id LEFT JOIN master_invoice_statuses s ON s.id=i.status_id WHERE i.id=?",(iid,))
        return ok(r) if r else err("Not found",404)
    d=request.get_json()
    if d.get('status'):
        st=_cur().execute("SELECT id FROM master_invoice_statuses WHERE name=%s",(d['status'],)).fetchone()
        if st: _cur().execute("UPDATE invoices SET status_id=%s,updated_at=NOW() WHERE id=%s",(st[0],iid))
    if d.get('paid_date'): _cur().execute("UPDATE invoices SET paid_date=%s,payment_ref=%s WHERE id=%s",(d['paid_date'],d.get('payment_ref'),iid))
    if d.get('notes'): _cur().execute("UPDATE invoices SET notes=%s WHERE id=%s",(d['notes'],iid))
    get_db().commit()
    if d.get('status')=='Paid':
        r=_cur().execute("SELECT invoice_number,amount FROM invoices WHERE id=%s",(iid,)).fetchone()
        log("invoices",iid,"paid",f"Invoice {r[0]} paid — ₹{r[1]:,.0f}",g.user.get('username','System')); db.commit()
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
        GROUP BY TO_CHAR(i.created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 6""")
    trend.reverse()
    client_rev=rows("SELECT c.name,COALESCE(SUM(i.amount),0) as revenue FROM clients c LEFT JOIN invoices i ON i.client_id=c.id WHERE c.is_active=1 GROUP BY c.id ORDER BY revenue DESC LIMIT 8")
    rev_mtd=_cur().execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE TO_CHAR(created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')").fetchone()[0]
    payroll_mtd=_cur().execute("SELECT COALESCE(SUM(gross_amount),0) FROM payroll_runs WHERE status IN ('Processing','Completed') AND TO_CHAR('%Y-%m',run_date)=TO_CHAR(NOW(), 'YYYY-MM')").fetchone()[0]
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
        GROUP BY e.id ORDER BY hires DESC"""))

@app.route('/api/reports/applicants')
@require_auth
def rpt_applicants():
    by_rec=rows("""SELECT e.first_name||' '||e.last_name as recruiter,COUNT(a.id) as total,
        SUM(CASE WHEN s.name='Screening' THEN 1 ELSE 0 END) as screened,
        SUM(CASE WHEN s.name IN ('Technical','Offer','Placed') THEN 1 ELSE 0 END) as interviewed,
        SUM(CASE WHEN s.name IN ('Offer','Placed') THEN 1 ELSE 0 END) as offered,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) as hired
        FROM applications a LEFT JOIN employees e ON e.id=a.recruiter_id
        JOIN master_application_stages s ON s.id=a.stage_id GROUP BY a.recruiter_id ORDER BY hired DESC""")
    by_src=rows("""SELECT cs.name as source,COUNT(*) as total,
        SUM(CASE WHEN s.name='Placed' THEN 1 ELSE 0 END) as hired,
        ROUND(SUM(CASE WHEN s.name='Placed' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) as hire_rate
        FROM applications a JOIN candidates c ON c.id=a.candidate_id
        LEFT JOIN master_candidate_sources cs ON cs.id=c.source_id
        JOIN master_application_stages s ON s.id=a.stage_id GROUP BY c.source_id ORDER BY hire_rate DESC""")
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
        WHERE d.is_active=1 GROUP BY d.id ORDER BY headcount DESC""")
    totals=_cur().execute("""SELECT COUNT(*) as total,
        SUM(CASE WHEN et.name='Full-Time' THEN 1 ELSE 0 END) as fte,
        SUM(CASE WHEN et.name LIKE 'Contractor%' THEN 1 ELSE 0 END) as contractors,
        SUM(CASE WHEN e.status='Onboarding' THEN 1 ELSE 0 END) as onboarding
        FROM employees e LEFT JOIN master_employment_types et ON et.id=e.employment_type_id
        WHERE e.status IN ('Active','Onboarding')""").fetchone()
    return ok({"by_department":by_dept,"totals":dict(totals)})

# ═══════════════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════════════
@app.route('/api/dashboard')
@require_auth
def dashboard():
    db=get_db()
    emp_count=_cur().execute("SELECT COUNT(*) FROM employees WHERE status IN ('Active','Onboarding')").fetchone()[0]
    open_reqs=_cur().execute("SELECT COUNT(*) FROM job_requisitions WHERE status='Active'").fetchone()[0]
    rev_mtd=_cur().execute("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE TO_CHAR(created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')").fetchone()[0]
    pending_inv=_cur().execute("SELECT COALESCE(SUM(amount),0) FROM invoices i JOIN master_invoice_statuses s ON s.id=i.status_id WHERE s.name IN ('Sent','Overdue')").fetchone()[0]
    funnel={}
    for r in _cur().execute("SELECT s.name,COUNT(a.id) FROM master_application_stages s LEFT JOIN applications a ON a.stage_id=s.id GROUP BY s.id ORDER BY s.sort_order").fetchall():
        funnel[r[0]]=r[1]
    top_rec=rows("""SELECT e.first_name||' '||e.last_name as name,COUNT(a.id) as hires
        FROM applications a JOIN employees e ON e.id=a.recruiter_id
        JOIN master_application_stages s ON s.id=a.stage_id WHERE s.name='Placed'
        GROUP BY a.recruiter_id ORDER BY hires DESC LIMIT 5""")
    client_rev=rows("""SELECT c.name,COALESCE(SUM(i.amount),0) as revenue
        FROM clients c LEFT JOIN invoices i ON i.client_id=c.id AND TO_CHAR(i.created_at, 'YYYY-MM')=TO_CHAR(NOW(), 'YYYY-MM')
        WHERE c.is_active=1 GROUP BY c.id ORDER BY revenue DESC LIMIT 6""")
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
        GROUP BY TO_CHAR(i.created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 6""")
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
        GROUP BY c.source_id ORDER BY total DESC"""))

@app.route('/api/search')
@require_auth
def search():
    q=request.args.get('q','').strip()
    if len(q)<2: return ok([])
    like=f'%{q}%'
    results=[]
    results+=rows("SELECT id,'employee' as type,first_name||' '||last_name as label,job_title as sub FROM employees WHERE (first_name||' '||last_name LIKE ? OR emp_id LIKE ?) AND status='Active' LIMIT 4",(like,like))
    results+=rows("SELECT id,'client' as type,name as label,industry as sub FROM clients WHERE name LIKE ? AND is_active=1 LIMIT 4",(like,))
    results+=rows("SELECT id,'candidate' as type,first_name||' '||last_name as label,current_title as sub FROM candidates WHERE first_name||' '||last_name LIKE ? AND is_active=1 LIMIT 4",(like,))
    results+=rows("SELECT r.id,'requisition' as type,r.title as label,c.name as sub FROM job_requisitions r JOIN clients c ON c.id=r.client_id WHERE r.title LIKE ? AND r.status='Active' LIMIT 4",(like,))
    return ok(results)

@app.route('/api/activity')
@require_auth
def activity():
    limit=request.args.get('limit',20)
    return ok(rows("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?",(limit,)))

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
    filename = f"{cfg['filename']}_{datetime.now().TO_CHAR('%Y%m%d_%H%M')}.csv"
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
    filename = f"mchrta_export_{datetime.now().TO_CHAR('%Y%m%d_%H%M')}.zip"
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
    import traceback as _tb
    secret = request.args.get('secret','') or request.headers.get('X-Reset-Secret','')
    if secret != 'mchrta-reset-2026':
        return '''<html><body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
            <h2>McHR&TA — Database Reset</h2>
            <p>Click below to re-seed the PostgreSQL database.</p>
            <form method="GET"><input type="hidden" name="secret" value="mchrta-reset-2026">
            <button type="submit" style="background:#2d8f3e;color:#fff;padding:12px 24px;border:none;border-radius:6px;font-size:16px;cursor:pointer">
              Reset Database &amp; Restore Admin Login
            </button></form>
        </body></html>'''
    try:
        if 'db' in g:
            try: g.db.close()
            except: pass
            g.pop('db', None)

        conn = get_pg_conn()
        conn.autocommit = True
        cur = conn.cursor()

        # Step 1: Drop everything
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
        tables = [r['tablename'] for r in cur.fetchall()]
        if tables:
            cur.execute("DROP TABLE IF EXISTS " + ",".join(tables) + " CASCADE")
            print(f"Dropped: {tables}", flush=True)

        # Step 2: Load and run schema — each statement in its own transaction
        schema_paths = [
            os.path.join(BASE_DIR,'..','db','schema.sql'),
            os.path.join(BASE_DIR,'db','schema.sql'),
            os.path.join('/app','db','schema.sql'),
        ]
        schema_path = next((p for p in schema_paths if os.path.exists(p)), None)
        # Execute schema using psycopg2 with autocommit per statement
        with open(schema_path) as f:
            schema_sql = f.read()

        ok = 0
        errs = []
        # Split and execute each statement individually with its own connection state
        raw_stmts = schema_sql.split(';')
        for raw in raw_stmts:
            stmt = raw.strip()
            if not stmt or stmt.startswith('--') or len(stmt) < 10:
                continue
            try:
                cur.execute(stmt)
                ok += 1
            except Exception as e:
                errs.append(f"{stmt[:60]}: {str(e)[:80]}")
                # After error, need fresh cursor
                try:
                    cur = conn.cursor()
                except:
                    pass
        print(f"Schema: {ok} OK, {len(errs)} errors", flush=True)
        for e in errs[:10]:
            print(f"  ERR: {e}", flush=True)
        # Step 3: Verify tables were created
        cur.execute("SELECT COUNT(*) as c FROM pg_tables WHERE schemaname='public'")
        table_count = cur.fetchone()['c']
        print(f"Tables created: {table_count}", flush=True)

        if table_count < 10:
            raise RuntimeError(f"Schema creation failed — only {table_count} tables created. Check schema.sql FK dependencies.")

        # Step 4: Seed data
        _seed_pg(cur)

        conn.close()
        return '''<html><body style="font-family:sans-serif;padding:40px;background:#f4f5f7">
            <h2 style="color:#2d8f3e">&#10003; Database Reset Complete!</h2>
            <p style="font-size:16px">Login with:</p>
            <p style="background:#e8f5eb;border:1px solid #2d8f3e;border-radius:8px;padding:16px;font-size:18px;font-weight:bold">
              Username: admin<br>Password: Admin@123
            </p>
            <a href="/" style="display:inline-block;margin-top:20px;background:#2d8f3e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:16px">
              Go to Login &rarr;
            </a>
        </body></html>'''
    except Exception as e:
        return f'''<html><body style="font-family:sans-serif;padding:40px">
            <h2 style="color:red">Reset Failed</h2>
            <p><strong>{str(e)}</strong></p>
            <pre style="background:#f4f5f7;padding:12px;font-size:11px;overflow-x:auto">{_tb.format_exc()}</pre>
        </body></html>'''


# ═══════════════════════════════════════════════════
# RUN
# ═══════════════════════════════════════════════════
if __name__ == '__main__':
    import sys
    port=int(os.environ.get('PORT', sys.argv[1] if len(sys.argv)>1 else 5000))
    debug=os.environ.get('FLASK_DEBUG','false').lower()=='true'
    print(f"🚀 McHR&TA v4 starting on http://0.0.0.0:{port}", flush=True)
    app.run(debug=debug, port=port, host='0.0.0.0')
