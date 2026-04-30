#!/usr/bin/env python3
"""McHR&TA — Database initialiser and seed loader v2.0"""
import sqlite3, os, hashlib, secrets
DB_PATH = os.path.join(os.path.dirname(__file__), 'hireflow.db')
SCHEMA  = os.path.join(os.path.dirname(__file__), 'schema.sql')

def get_conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.execute("PRAGMA journal_mode = WAL")
    return c

def hash_pw(pw): return hashlib.sha256(pw.encode()).hexdigest()

def init_db():
    conn = get_conn()
    with open(SCHEMA) as f: conn.executescript(f.read())
    conn.commit(); print("✓ Schema applied")
    return conn

def seed_db():
    conn = get_conn()
    if conn.execute("SELECT COUNT(*) FROM master_countries").fetchone()[0] > 0:
        print("✓ Already seeded"); conn.close(); return
    print("🌱 Seeding…")
    c = conn.cursor()

    # ── Master: Countries ────────────────────────────────
    c.executemany("INSERT INTO master_countries(code,name) VALUES(?,?)", [
        ("IN","India"),("US","United States"),("GB","United Kingdom"),
        ("SG","Singapore"),("AE","United Arab Emirates"),("AU","Australia"),
    ])
    # ── Master: States (India) ───────────────────────────
    india_id = c.execute("SELECT id FROM master_countries WHERE code='IN'").fetchone()[0]
    us_id    = c.execute("SELECT id FROM master_countries WHERE code='US'").fetchone()[0]
    c.executemany("INSERT INTO master_states(country_id,code,name) VALUES(?,?,?)", [
        (india_id,"AP","Andhra Pradesh"),(india_id,"KA","Karnataka"),
        (india_id,"MH","Maharashtra"),(india_id,"TN","Tamil Nadu"),
        (india_id,"TS","Telangana"),(india_id,"DL","Delhi"),
        (india_id,"GJ","Gujarat"),(india_id,"WB","West Bengal"),
        (india_id,"RJ","Rajasthan"),(india_id,"UP","Uttar Pradesh"),
        (us_id,"CA","California"),(us_id,"NY","New York"),
        (us_id,"TX","Texas"),(us_id,"WA","Washington"),
    ])
    # ── Master: Employment types ─────────────────────────
    c.executemany("INSERT INTO master_employment_types(name) VALUES(?)", [
        ("Full-Time",),("Contractor (W2)",),("Contractor (C2C)",),
        ("Part-Time",),("Intern",),("Freelance",),
    ])
    # ── Master: Contract types ───────────────────────────
    c.executemany("INSERT INTO master_contract_types(name) VALUES(?)", [
        ("Staff Augmentation",),("Direct Hire",),("Retained Search",),
        ("MSA",),("MSA + SOW",),("Milestone",),
    ])
    # ── Master: Vendor categories ────────────────────────
    c.executemany("INSERT INTO master_vendor_categories(name) VALUES(?)", [
        ("Job Board",),("Background Check",),("Sub-Vendor",),
        ("Technology",),("Legal",),("Payroll",),("Training",),
    ])
    # ── Master: Invoice statuses ─────────────────────────
    c.executemany("INSERT INTO master_invoice_statuses(name,sort_order) VALUES(?,?)", [
        ("Draft",1),("Sent",2),("Paid",3),("Overdue",4),("Cancelled",5),
    ])
    # ── Master: Application stages ───────────────────────
    c.executemany("INSERT INTO master_application_stages(name,sort_order) VALUES(?,?)", [
        ("Applied",1),("Screening",2),("Technical",3),
        ("Offer",4),("Placed",5),("Rejected",6),
    ])
    # ── Master: Interview formats ────────────────────────
    c.executemany("INSERT INTO master_interview_formats(name) VALUES(?)", [
        ("Video",),("Phone",),("In-Person",),("Take-Home Assessment",),
    ])
    # ── Master: Onboarding templates ────────────────────
    c.executemany("INSERT INTO master_onboarding_templates(name) VALUES(?)", [
        ("Standard FTE",),("Contractor",),("Remote Employee",),("Executive",),
    ])
    # ── Master: Candidate sources ────────────────────────
    c.executemany("INSERT INTO master_candidate_sources(name) VALUES(?)", [
        ("LinkedIn",),("Referral",),("Indeed",),("Career Site",),
        ("Agency",),("GitHub",),("Naukri",),("Walk-In",),
    ])
    # ── Master: Payment terms ────────────────────────────
    c.executemany("INSERT INTO master_payment_terms(name,days) VALUES(?,?)", [
        ("Net 15",15),("Net 30",30),("Net 45",45),("Net 60",60),("Due on Receipt",0),
    ])
    # ── Master: Priority levels ──────────────────────────
    c.executemany("INSERT INTO master_priority_levels(name,sort_order) VALUES(?,?)", [
        ("High",1),("Medium",2),("Normal",3),("Low",4),
    ])
    # ── Master: Timesheet statuses ───────────────────────
    c.executemany("INSERT INTO master_timesheet_statuses(name) VALUES(?)", [
        ("Pending",),("Approved",),("Returned",),("Cancelled",),
    ])
    # ── Master: Payroll run types ────────────────────────
    c.executemany("INSERT INTO master_payroll_run_types(name) VALUES(?)", [
        ("Semi-Monthly FTE",),("Contractor Bi-Weekly",),("Monthly",),("Supplemental",),
    ])
    # ── Master: User roles ───────────────────────────────
    c.executemany("INSERT INTO master_user_roles(name,description) VALUES(?,?)", [
        ("Admin","Full system access — all modules, settings, user management"),
        ("HR Manager","HR modules: employees, timesheets, payroll, onboarding"),
        ("Recruiter","ATS modules: jobs, candidates, pipeline, interviews"),
        ("Finance","Finance modules: invoices, billing, reports"),
        ("Employee","Self-service: own timesheets, profile, payslips"),
        ("Client","Client portal: own placements, timesheets, invoices"),
        ("Vendor","Vendor portal: own submissions, SLA reports"),
    ])
    conn.commit()

    # ── Organisation profile ─────────────────────────────
    ts_id = c.execute("SELECT id FROM master_states WHERE code='TS'").fetchone()[0]
    in_id = india_id
    c.execute("""INSERT INTO organisation
        (legal_name,trade_name,email,phone,website,poc_name,poc_email,poc_phone,
         biz_city,biz_state_id,biz_country_id,reg_city,reg_state_id,reg_country_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
        "McRaaN Consulting Private Limited","McHR&TA",
        "info@mcraan.com","+91-40-12345678","https://www.mcraan.com",
        "Sanjay Kumar","sanjay@mcraan.com","+91-9000000001",
        "Hyderabad",ts_id,in_id,"Hyderabad",ts_id,in_id,
    ))
    org_id = c.lastrowid
    c.execute("INSERT INTO organisation_gst(organisation_id,gstin,state_id,is_primary) VALUES(?,?,?,1)",
              (org_id,"36AAAAA0000A1Z5",ts_id))
    c.execute("""INSERT INTO organisation_bank_accounts
        (organisation_id,account_name,bank_name,branch,account_number,ifsc_code,is_primary)
        VALUES(?,?,?,?,?,?,1)""",
        (org_id,"McRaaN Consulting Pvt Ltd","HDFC Bank","Banjara Hills",
         "50200012345678","HDFC0001234"))
    conn.commit()

    # ── Business units & departments ─────────────────────
    for name, desc in [
        ("Technology Services","Engineering, DevOps, QA"),
        ("Staffing Solutions","Talent Acquisition, Onboarding"),
        ("Business Operations","Finance, Legal, Compliance"),
        ("Sales & Marketing","Sales, Marketing, Client Success"),
    ]:
        c.execute("INSERT INTO business_units(name,description) VALUES(?,?)",(name,desc))
    conn.commit()
    bu1 = c.execute("SELECT id FROM business_units WHERE name='Technology Services'").fetchone()[0]
    bu2 = c.execute("SELECT id FROM business_units WHERE name='Staffing Solutions'").fetchone()[0]
    bu3 = c.execute("SELECT id FROM business_units WHERE name='Business Operations'").fetchone()[0]
    bu4 = c.execute("SELECT id FROM business_units WHERE name='Sales & Marketing'").fetchone()[0]
    for name, bu, head, budget, cc in [
        ("Engineering",bu1,"Ravi Kumar",4200000,"CC-001"),
        ("HR & Talent",bu2,"Aisha Kumar",640000,"CC-007"),
        ("Sales",bu4,"Sandra Bloom",2800000,"CC-005"),
        ("Finance",bu3,"Tom Wright",580000,"CC-009"),
        ("Product",bu1,"Leo Chang",920000,"CC-004"),
    ]:
        c.execute("INSERT INTO departments(name,business_unit_id,head_name,budget,cost_center,location) VALUES(?,?,?,?,?,?)",
                  (name,bu,head,budget,cc,"Hyderabad"))
    conn.commit()

    # ── Office locations ─────────────────────────────────
    for name, city, sid, cid, typ, hc in [
        ("Hyderabad (HQ)","Hyderabad",ts_id,in_id,"Headquarters",120),
        ("Mumbai","Mumbai",
         c.execute("SELECT id FROM master_states WHERE code='MH'").fetchone()[0],in_id,"Regional",45),
        ("Bangalore","Bangalore",
         c.execute("SELECT id FROM master_states WHERE code='KA'").fetchone()[0],in_id,"Regional",38),
    ]:
        c.execute("INSERT INTO office_locations(name,city,state_id,country_id,type,headcount) VALUES(?,?,?,?,?,?)",
                  (name,city,sid,cid,typ,hc))
    conn.commit()

    # ── Clients ──────────────────────────────────────────
    ct_sa = c.execute("SELECT id FROM master_contract_types WHERE name='Staff Augmentation'").fetchone()[0]
    ct_dh = c.execute("SELECT id FROM master_contract_types WHERE name='Direct Hire'").fetchone()[0]
    ct_ms = c.execute("SELECT id FROM master_contract_types WHERE name='MSA'").fetchone()[0]
    pt30  = c.execute("SELECT id FROM master_payment_terms WHERE name='Net 30'").fetchone()[0]
    pt45  = c.execute("SELECT id FROM master_payment_terms WHERE name='Net 45'").fetchone()[0]
    for name, ind, ctype, rate, pt, poc, email, mgr, score in [
        ("Acme Inc.","Technology",ct_sa,"$145/hr",pt30,"Brian Cole","brian@acme.com","Aisha Kumar",98),
        ("TechCorp","Finance",ct_ms,"$165/hr",pt30,"Sara Fine","sara@techcorp.com","Carlos Mendez",94),
        ("GloboCorp","Retail",ct_dh,"18% fee",pt45,"Mike Rand","mike@globo.com","Jenny Liu",42),
        ("DataSys","Healthcare",ct_ms,"$135/hr",pt30,"Amy Ling","amy@datasys.com","Dev Rao",86),
        ("NovaTech","Manufacturing",ct_sa,"$120/hr",pt30,"Rob Steel","rob@novatech.com","Sara Hassan",91),
    ]:
        c.execute("""INSERT INTO clients(name,industry,contract_type_id,billing_rate,payment_terms_id,
            primary_contact,contact_email,account_manager,health_score) VALUES(?,?,?,?,?,?,?,?,?)""",
            (name,ind,ctype,rate,pt,poc,email,mgr,score))
    conn.commit()

    # ── Vendors ──────────────────────────────────────────
    vc_jb = c.execute("SELECT id FROM master_vendor_categories WHERE name='Job Board'").fetchone()[0]
    vc_bg = c.execute("SELECT id FROM master_vendor_categories WHERE name='Background Check'").fetchone()[0]
    vc_sv = c.execute("SELECT id FROM master_vendor_categories WHERE name='Sub-Vendor'").fetchone()[0]
    vc_te = c.execute("SELECT id FROM master_vendor_categories WHERE name='Technology'").fetchone()[0]
    for name, cat, poc, email, cend, sla, spend, sladesc in [
        ("LinkedIn Talent",vc_jb,"Sarah M.","sarah@linkedin.com","2026-12-31",97,28000,"Response rate ≥85%"),
        ("Sterling BGC",vc_bg,"John T.","john@sterling.com","2026-06-30",99,14000,"Turnaround within 72 hours"),
        ("TechStaff Inc.",vc_sv,"Mike R.","mike@techstaff.com","2026-03-31",82,185000,"Submittal quality ≥90%"),
        ("Workday HCM",vc_te,"Lisa K.","lisa@workday.com","2027-01-31",100,18000,"99.9% uptime SLA"),
        ("Checkr",vc_bg,"Tom B.","tom@checkr.com","2026-08-31",71,8000,"Turnaround within 48 hours"),
    ]:
        c.execute("""INSERT INTO vendors(name,category_id,primary_contact,contact_email,
            contract_end,sla_score,spend_mtd,sla_description) VALUES(?,?,?,?,?,?,?,?)""",
            (name,cat,poc,email,cend,sla,spend,sladesc))
    conn.commit()

    # ── Employees ────────────────────────────────────────
    dept_eng = c.execute("SELECT id FROM departments WHERE name='Engineering'").fetchone()[0]
    dept_hr  = c.execute("SELECT id FROM departments WHERE name='HR & Talent'").fetchone()[0]
    dept_sal = c.execute("SELECT id FROM departments WHERE name='Sales'").fetchone()[0]
    dept_fin = c.execute("SELECT id FROM departments WHERE name='Finance'").fetchone()[0]
    et_fte   = c.execute("SELECT id FROM master_employment_types WHERE name='Full-Time'").fetchone()[0]
    et_ctr   = c.execute("SELECT id FROM master_employment_types WHERE name='Contractor (C2C)'").fetchone()[0]
    cl_acme  = c.execute("SELECT id FROM clients WHERE name='Acme Inc.'").fetchone()[0]
    cl_nova  = c.execute("SELECT id FROM clients WHERE name='NovaTech'").fetchone()[0]
    for eid, fn, ln, em, title, dept, etype, sal, brate, sd, status in [
        ("EMP-0001","Ravi","Kumar","ravi@mcraan.com","VP Engineering",dept_eng,et_fte,220000,0,"2019-01-15","Active"),
        ("EMP-0002","Aisha","Kumar","aisha@mcraan.com","HR Director",dept_hr,et_fte,180000,0,"2020-02-10","Active"),
        ("EMP-0003","Carlos","Mendez","carlos@mcraan.com","Sr. Recruiter",dept_hr,et_fte,95000,0,"2021-03-22","Active"),
        ("EMP-0004","Sandra","Bloom","sandra@mcraan.com","VP Sales",dept_sal,et_fte,240000,0,"2018-06-01","Active"),
        ("EMP-0005","Marcus","Torres","marcus@mcraan.com","Account Executive",dept_sal,et_fte,110000,145,"2021-06-15","Active"),
        ("CTR-0891","James","Obi","james.obi@ext.com","DevOps Engineer",dept_eng,et_ctr,0,120,"2026-04-21","Active"),
        ("EMP-1284","Priya","Sharma","priya@mcraan.com","Sr. React Developer",dept_eng,et_fte,155000,0,"2026-05-05","Onboarding"),
    ]:
        c.execute("""INSERT INTO employees(emp_id,first_name,last_name,email,job_title,
            department_id,employment_type_id,salary,bill_rate,start_date,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (eid,fn,ln,em,title,dept,etype,sal,brate,sd,status))
    conn.commit()
    # Set client links
    c.execute("UPDATE employees SET client_id=? WHERE emp_id='CTR-0891'",(cl_nova,))
    c.execute("UPDATE employees SET client_id=? WHERE emp_id='EMP-0005'",(cl_acme,))
    conn.commit()

    # ── Users (admin + one per role) ─────────────────────
    role_admin = c.execute("SELECT id FROM master_user_roles WHERE name='Admin'").fetchone()[0]
    role_hr    = c.execute("SELECT id FROM master_user_roles WHERE name='HR Manager'").fetchone()[0]
    role_rec   = c.execute("SELECT id FROM master_user_roles WHERE name='Recruiter'").fetchone()[0]
    role_fin   = c.execute("SELECT id FROM master_user_roles WHERE name='Finance'").fetchone()[0]
    emp_aisha  = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0002'").fetchone()[0]
    emp_carlos = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0003'").fetchone()[0]
    for uname, email, pw, role, emp, fullname in [
        ("admin","admin@mcraan.com","Admin@123",role_admin,None,"System Administrator"),
        ("aisha.kumar","aisha@mcraan.com","HR@123",role_hr,emp_aisha,"Aisha Kumar"),
        ("carlos.mendez","carlos@mcraan.com","Rec@123",role_rec,emp_carlos,"Carlos Mendez"),
    ]:
        c.execute("""INSERT INTO users(username,email,password_hash,role_id,employee_id,full_name)
            VALUES(?,?,?,?,?,?)""",
            (uname,email,hash_pw(pw),role,emp,fullname))
    conn.commit()

    # ── Timesheets ───────────────────────────────────────
    emp_marcus = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0005'").fetchone()[0]
    emp_james  = c.execute("SELECT id FROM employees WHERE emp_id='CTR-0891'").fetchone()[0]
    emp_priya  = c.execute("SELECT id FROM employees WHERE emp_id='EMP-1284'").fetchone()[0]
    ts_pending = c.execute("SELECT id FROM master_timesheet_statuses WHERE name='Pending'").fetchone()[0]
    ts_approved= c.execute("SELECT id FROM master_timesheet_statuses WHERE name='Approved'").fetchone()[0]
    for emp, clt, proj, we, rh, ot, br, status in [
        (emp_marcus,cl_acme,"Acme / Dev Sprint","2026-04-25",40.0,6.5,145.0,ts_pending),
        (emp_james,cl_nova,"NovaTech / DevOps","2026-04-25",40.0,4.0,120.0,ts_pending),
        (emp_priya,cl_acme,"Acme / Development","2026-04-25",40.0,0.0,145.0,ts_pending),
        (emp_marcus,cl_acme,"Acme / Sprint","2026-04-18",40.0,2.0,145.0,ts_approved),
    ]:
        c.execute("""INSERT INTO timesheets(employee_id,client_id,project,week_ending,
            regular_hours,overtime_hours,bill_rate,status_id) VALUES(?,?,?,?,?,?,?,?)""",
            (emp,clt,proj,we,rh,ot,br,status))
    conn.commit()

    # ── Payroll runs ─────────────────────────────────────
    rt_semi = c.execute("SELECT id FROM master_payroll_run_types WHERE name='Semi-Monthly FTE'").fetchone()[0]
    for rd, ps, pe, ec, gross, net, tax, status in [
        ("2026-05-02","2026-04-16","2026-04-30",7,420000,315000,105000,"Processing"),
        ("2026-05-15","2026-05-01","2026-05-15",7,420000,0,0,"Scheduled"),
    ]:
        c.execute("""INSERT INTO payroll_runs(run_date,period_start,period_end,run_type_id,
            employee_count,gross_amount,net_amount,tax_amount,status) VALUES(?,?,?,?,?,?,?,?,?)""",
            (rd,ps,pe,rt_semi,ec,gross,net,tax,status))
    conn.commit()

    # ── Job requisitions ─────────────────────────────────
    pri_high = c.execute("SELECT id FROM master_priority_levels WHERE name='High'").fetchone()[0]
    pri_med  = c.execute("SELECT id FROM master_priority_levels WHERE name='Medium'").fetchone()[0]
    pri_norm = c.execute("SELECT id FROM master_priority_levels WHERE name='Normal'").fetchone()[0]
    emp_ravi = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0001'").fetchone()[0]
    cl_data  = c.execute("SELECT id FROM clients WHERE name='DataSys'").fetchone()[0]
    cl_tech  = c.execute("SELECT id FROM clients WHERE name='TechCorp'").fetchone()[0]
    for title, clt, et, dept, rec, pri, loc, cmin, cmax, od in [
        ("Sr. Software Engineer",cl_acme,ct_sa,dept_eng,emp_ravi,pri_high,"Remote",140000,160000,"2026-04-09"),
        ("Data Engineer",cl_data,ct_sa,dept_eng,emp_carlos,pri_high,"Remote",130000,150000,"2026-04-03"),
        ("Product Manager",cl_tech,ct_dh,dept_fin,emp_carlos,pri_med,"Hyderabad",155000,175000,"2026-04-15"),
        ("DevOps Architect",cl_acme,ct_sa,dept_eng,emp_ravi,pri_med,"Remote",145000,165000,"2026-03-27"),
        ("UX Designer",cl_nova,ct_dh,dept_eng,emp_ravi,pri_norm,"Hyderabad",100000,120000,"2026-04-20"),
    ]:
        c.execute("""INSERT INTO job_requisitions(title,client_id,engagement_type_id,department_id,
            recruiter_id,priority_id,location,comp_min,comp_max,opened_date) VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (title,clt,et,dept,rec,pri,loc,cmin,cmax,od))
    conn.commit()

    # ── Candidates ───────────────────────────────────────
    src_li  = c.execute("SELECT id FROM master_candidate_sources WHERE name='LinkedIn'").fetchone()[0]
    src_ref = c.execute("SELECT id FROM master_candidate_sources WHERE name='Referral'").fetchone()[0]
    src_in  = c.execute("SELECT id FROM master_candidate_sources WHERE name='Indeed'").fetchone()[0]
    src_gh  = c.execute("SELECT id FROM master_candidate_sources WHERE name='GitHub'").fetchone()[0]
    for fn, ln, em, ph, loc, title, yoe, src, skills in [
        ("Ananya","Reddy","ananya@email.com","+91-9001","Hyderabad","Software Engineer",5,src_li,"React,Node.js,TypeScript"),
        ("James","Park","jpark@email.com","+1-555-1002","Remote","Data Engineer",4,src_in,"Python,Spark,Kafka"),
        ("Kevin","Nguyen","kevin@email.com","+1-555-1004","Austin","DevOps Architect",8,src_gh,"AWS,Kubernetes,Terraform"),
        ("Sofia","Patel","sofia@email.com","+1-555-1009","Chicago","Product Manager",9,src_li,"SaaS,B2B,OKRs"),
        ("Keisha","Brown","keisha@email.com","+1-555-1012","New York","UX Designer",6,src_ref,"Figma,Design Systems"),
    ]:
        c.execute("""INSERT INTO candidates(first_name,last_name,email,phone,location,current_title,
            years_exp,source_id,skills) VALUES(?,?,?,?,?,?,?,?,?)""",
            (fn,ln,em,ph,loc,title,yoe,src,skills))
    conn.commit()

    # ── Applications ─────────────────────────────────────
    stage_app  = c.execute("SELECT id FROM master_application_stages WHERE name='Applied'").fetchone()[0]
    stage_scr  = c.execute("SELECT id FROM master_application_stages WHERE name='Screening'").fetchone()[0]
    stage_tech = c.execute("SELECT id FROM master_application_stages WHERE name='Technical'").fetchone()[0]
    req1 = c.execute("SELECT id FROM job_requisitions WHERE title='Sr. Software Engineer'").fetchone()[0]
    req2 = c.execute("SELECT id FROM job_requisitions WHERE title='Data Engineer'").fetchone()[0]
    req3 = c.execute("SELECT id FROM job_requisitions WHERE title='Product Manager'").fetchone()[0]
    req4 = c.execute("SELECT id FROM job_requisitions WHERE title='DevOps Architect'").fetchone()[0]
    req5 = c.execute("SELECT id FROM job_requisitions WHERE title='UX Designer'").fetchone()[0]
    cand1 = c.execute("SELECT id FROM candidates WHERE email='ananya@email.com'").fetchone()[0]
    cand2 = c.execute("SELECT id FROM candidates WHERE email='jpark@email.com'").fetchone()[0]
    cand3 = c.execute("SELECT id FROM candidates WHERE email='kevin@email.com'").fetchone()[0]
    cand4 = c.execute("SELECT id FROM candidates WHERE email='sofia@email.com'").fetchone()[0]
    cand5 = c.execute("SELECT id FROM candidates WHERE email='keisha@email.com'").fetchone()[0]
    for cand, req, stage, sal in [
        (cand1,req1,stage_app,120000),(cand2,req2,stage_app,135000),
        (cand3,req4,stage_scr,145000),(cand4,req3,stage_tech,165000),
        (cand5,req5,stage_scr,110000),
    ]:
        c.execute("INSERT INTO applications(candidate_id,requisition_id,stage_id,expected_salary,recruiter_id) VALUES(?,?,?,?,?)",
                  (cand,req,stage,sal,emp_ravi))
    conn.commit()

    # ── Invoices ─────────────────────────────────────────
    inv_sent    = c.execute("SELECT id FROM master_invoice_statuses WHERE name='Sent'").fetchone()[0]
    inv_paid    = c.execute("SELECT id FROM master_invoice_statuses WHERE name='Paid'").fetchone()[0]
    inv_overdue = c.execute("SELECT id FROM master_invoice_statuses WHERE name='Overdue'").fetchone()[0]
    cl_glob = c.execute("SELECT id FROM clients WHERE name='GloboCorp'").fetchone()[0]
    for num, clt, ctype, ps, pe, amt, due, paid, status in [
        ("INV-1001",cl_acme,ct_sa,"2026-04-16","2026-04-30",84500,"2026-05-15",None,inv_sent),
        ("INV-1002",cl_tech,ct_ms,"2026-04-16","2026-04-30",62000,"2026-05-15","2026-04-27",inv_paid),
        ("INV-1003",cl_glob,ct_dh,None,None,38500,"2026-04-25",None,inv_overdue),
        ("INV-1004",cl_data,ct_ms,"2026-04-01","2026-04-15",51750,"2026-04-30","2026-04-26",inv_paid),
    ]:
        c.execute("""INSERT INTO invoices(invoice_number,client_id,contract_type_id,period_start,
            period_end,amount,due_date,paid_date,status_id) VALUES(?,?,?,?,?,?,?,?,?)""",
            (num,clt,ctype,ps,pe,amt,due,paid,status))
    conn.commit()

    # ── Activity log ─────────────────────────────────────
    admin_id = c.execute("SELECT id FROM users WHERE username='admin'").fetchone()[0]
    for et, eid, act, desc in [
        ("invoices","1","sent","Invoice #INV-1001 sent to Acme Inc. — ₹84,500"),
        ("invoices","2","paid","Payment received — TechCorp ₹62,000 via NEFT"),
        ("invoices","3","overdue","Invoice #INV-1003 overdue — GloboCorp ₹38,500"),
        ("timesheets","1","approved","Timesheet approved for Marcus Torres — 46.5 hrs"),
    ]:
        c.execute("INSERT INTO activity_log(entity_type,entity_id,action,description,user_id,user_name) VALUES(?,?,?,?,?,?)",
                  (et,eid,act,desc,admin_id,"System"))
    conn.commit()
    conn.close()
    print("✓ Seeded successfully")

if __name__ == "__main__":
    init_db(); seed_db()
    print(f"✓ DB ready: {DB_PATH}")
