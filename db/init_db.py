#!/usr/bin/env python3
"""McHR&TA v4 — Database initialiser and seeder"""
import sqlite3, os, hashlib
DB   = os.path.join(os.path.dirname(__file__), 'hireflow.db')
SCH  = os.path.join(os.path.dirname(__file__), 'schema.sql')

def get_conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA journal_mode=WAL")
    return c

def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()

def init_db():
    conn = get_conn()
    with open(SCH) as f: conn.executescript(f.read())
    conn.commit(); print("✓ Schema applied"); return conn

def seed_db():
    conn = get_conn()
    if conn.execute("SELECT COUNT(*) FROM master_countries").fetchone()[0] > 0:
        print("✓ Already seeded"); conn.close(); return
    print("🌱 Seeding v4…")
    c = conn.cursor()

    # Countries
    for code,name in [("IN","India"),("US","United States"),("GB","United Kingdom"),
                       ("SG","Singapore"),("AE","UAE"),("AU","Australia"),("DE","Germany")]:
        c.execute("INSERT INTO master_countries(code,name) VALUES(?,?)",(code,name))
    conn.commit()
    in_id = c.execute("SELECT id FROM master_countries WHERE code='IN'").fetchone()[0]
    us_id = c.execute("SELECT id FROM master_countries WHERE code='US'").fetchone()[0]

    # All Indian states
    india_states = [
        ('AN','Andaman & Nicobar Islands'),('AP','Andhra Pradesh'),('AR','Arunachal Pradesh'),
        ('AS','Assam'),('BR','Bihar'),('CH','Chandigarh'),('CG','Chhattisgarh'),
        ('DN','Dadra & Nagar Haveli & Daman & Diu'),('DL','Delhi'),('GA','Goa'),('GJ','Gujarat'),
        ('HR','Haryana'),('HP','Himachal Pradesh'),('JK','Jammu & Kashmir'),('JH','Jharkhand'),
        ('KA','Karnataka'),('KL','Kerala'),('LA','Ladakh'),('LD','Lakshadweep'),
        ('MP','Madhya Pradesh'),('MH','Maharashtra'),('MN','Manipur'),('ML','Meghalaya'),
        ('MZ','Mizoram'),('NL','Nagaland'),('OD','Odisha'),('PY','Puducherry'),
        ('PB','Punjab'),('RJ','Rajasthan'),('SK','Sikkim'),('TN','Tamil Nadu'),
        ('TS','Telangana'),('TR','Tripura'),('UP','Uttar Pradesh'),('UK','Uttarakhand'),('WB','West Bengal'),
    ]
    c.executemany("INSERT INTO master_states(country_id,code,name) VALUES(?,?,?)",
                  [(in_id,code,name) for code,name in india_states])
    for code,name in [('CA','California'),('NY','New York'),('TX','Texas'),('WA','Washington'),('IL','Illinois')]:
        c.execute("INSERT INTO master_states(country_id,code,name) VALUES(?,?,?)",(us_id,code,name))
    conn.commit()

    ts_id = c.execute("SELECT id FROM master_states WHERE code='TS'").fetchone()[0]
    mh_id = c.execute("SELECT id FROM master_states WHERE code='MH'").fetchone()[0]
    ka_id = c.execute("SELECT id FROM master_states WHERE code='KA'").fetchone()[0]

    # Employment types
    for n in ["Full-Time","Contractor (C2C)","Contractor (W2)","Part-Time","Intern","Freelance"]:
        c.execute("INSERT INTO master_employment_types(name) VALUES(?)",(n,))
    # Contract types
    for n in ["Staff Augmentation","Direct Hire","Retained Search","MSA","MSA + SOW","Milestone"]:
        c.execute("INSERT INTO master_contract_types(name) VALUES(?)",(n,))
    # Vendor categories
    for n in ["Job Board","Background Check","Sub-Vendor","Technology","Legal","Payroll","Training"]:
        c.execute("INSERT INTO master_vendor_categories(name) VALUES(?)",(n,))
    # Invoice statuses
    for n,s in [("Draft",1),("Sent",2),("Paid",3),("Overdue",4),("Cancelled",5)]:
        c.execute("INSERT INTO master_invoice_statuses(name,sort_order) VALUES(?,?)",(n,s))
    # Application stages
    for n,s in [("Applied",1),("Screening",2),("Technical",3),("Offer",4),("Placed",5),("Rejected",6)]:
        c.execute("INSERT INTO master_application_stages(name,sort_order) VALUES(?,?)",(n,s))
    # Interview formats
    for n in ["Video","Phone","In-Person","Take-Home Assessment"]:
        c.execute("INSERT INTO master_interview_formats(name) VALUES(?)",(n,))
    # Onboarding templates
    for n in ["Standard FTE","Contractor","Remote Employee","Executive"]:
        c.execute("INSERT INTO master_onboarding_templates(name) VALUES(?)",(n,))
    # Candidate sources
    for n in ["LinkedIn","Referral","Indeed","Career Site","Agency","GitHub","Naukri","Walk-In"]:
        c.execute("INSERT INTO master_candidate_sources(name) VALUES(?)",(n,))
    # Payment terms
    for n,d in [("Net 15",15),("Net 30",30),("Net 45",45),("Net 60",60),("Due on Receipt",0)]:
        c.execute("INSERT INTO master_payment_terms(name,days) VALUES(?,?)",(n,d))
    # Priority levels
    for n,s in [("High",1),("Medium",2),("Normal",3),("Low",4)]:
        c.execute("INSERT INTO master_priority_levels(name,sort_order) VALUES(?,?)",(n,s))
    # Timesheet statuses
    for n in ["Pending","Approved","Returned","Cancelled"]:
        c.execute("INSERT INTO master_timesheet_statuses(name) VALUES(?)",(n,))
    # Payroll run types
    for n in ["Semi-Monthly FTE","Contractor Bi-Weekly","Monthly","Supplemental"]:
        c.execute("INSERT INTO master_payroll_run_types(name) VALUES(?)",(n,))
    # User roles
    for n,d in [
        ("Admin","Full system access"),
        ("HR Manager","HR & people modules"),
        ("Recruiter","ATS & talent modules"),
        ("Finance","Finance & billing"),
        ("Employee","Self-service portal"),
        ("Client","Client portal"),
        ("Vendor","Vendor portal"),
    ]: c.execute("INSERT INTO master_user_roles(name,description) VALUES(?,?)",(n,d))
    # Relationship types
    for n in ["Spouse","Parent","Sibling","Child","Friend","Colleague","Other"]:
        c.execute("INSERT INTO master_relationship_types(name) VALUES(?)",(n,))
    conn.commit()

    # Org profile
    c.execute("""INSERT INTO organisation(legal_name,trade_name,email,phone,website,
        poc_name,poc_email,poc_phone,
        biz_city,biz_state_id,biz_country_id,biz_pincode,
        reg_city,reg_state_id,reg_country_id,reg_pincode,
        pan,tan)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
        "McRaaN Consulting Private Limited","McHR&TA",
        "info@mcraan.com","+91-40-12345678","https://www.mcraan.com",
        "Sanjay Kumar","sanjay@mcraan.com","+91-9000000001",
        "Hyderabad",ts_id,in_id,"500034",
        "Hyderabad",ts_id,in_id,"500034",
        "AAGCM1234A","HYDA12345B"))
    org_id = c.lastrowid
    c.execute("INSERT INTO organisation_gst(organisation_id,gstin,state_id,trade_name,is_primary) VALUES(?,?,?,?,1)",
              (org_id,"36AAGCM1234A1Z5",ts_id,"McRaaN Consulting Private Limited"))
    c.execute("""INSERT INTO organisation_bank_accounts
        (organisation_id,account_name,bank_name,branch,account_number,ifsc_code,is_primary)
        VALUES(?,?,?,?,?,?,1)""",
        (org_id,"McRaaN Consulting Pvt Ltd","HDFC Bank","Banjara Hills","50200012345678","HDFC0001234"))
    conn.commit()

    # Business units & cost centres
    for name,desc in [
        ("Technology Services","Engineering, DevOps, QA"),
        ("Staffing Solutions","Talent Acquisition, Onboarding"),
        ("Business Operations","Finance, Legal, Compliance"),
        ("Sales & Marketing","Sales, Marketing, Client Success"),
    ]: c.execute("INSERT INTO business_units(name,description) VALUES(?,?)",(name,desc))
    conn.commit()
    bu_tech = c.execute("SELECT id FROM business_units WHERE name='Technology Services'").fetchone()[0]
    bu_hr   = c.execute("SELECT id FROM business_units WHERE name='Staffing Solutions'").fetchone()[0]
    bu_biz  = c.execute("SELECT id FROM business_units WHERE name='Business Operations'").fetchone()[0]
    bu_sal  = c.execute("SELECT id FROM business_units WHERE name='Sales & Marketing'").fetchone()[0]

    for code,name,bu,budget in [
        ("CC-001","Engineering",bu_tech,4200000),
        ("CC-007","HR & Talent",bu_hr,640000),
        ("CC-005","Sales",bu_sal,2800000),
        ("CC-009","Finance",bu_biz,580000),
        ("CC-004","Product",bu_tech,920000),
    ]: c.execute("INSERT INTO cost_centres(code,name,business_unit_id,budget) VALUES(?,?,?,?)",(code,name,bu,budget))
    conn.commit()

    cc_eng = c.execute("SELECT id FROM cost_centres WHERE code='CC-001'").fetchone()[0]
    cc_hr  = c.execute("SELECT id FROM cost_centres WHERE code='CC-007'").fetchone()[0]
    cc_sal = c.execute("SELECT id FROM cost_centres WHERE code='CC-005'").fetchone()[0]
    cc_fin = c.execute("SELECT id FROM cost_centres WHERE code='CC-009'").fetchone()[0]

    for name,bu,cc,head,budget in [
        ("Engineering",bu_tech,cc_eng,"Ravi Kumar",4200000),
        ("HR & Talent",bu_hr,cc_hr,"Aisha Kumar",640000),
        ("Sales",bu_sal,cc_sal,"Sandra Bloom",2800000),
        ("Finance",bu_biz,cc_fin,"Tom Wright",580000),
        ("Product",bu_tech,cc_eng,"Leo Chang",920000),
    ]: c.execute("INSERT INTO departments(name,business_unit_id,cost_centre_id,head_name,budget) VALUES(?,?,?,?,?)",
                 (name,bu,cc,head,budget))
    conn.commit()

    for name,city,sid,cid,typ,hc in [
        ("Hyderabad (HQ)","Hyderabad",ts_id,in_id,"Headquarters",120),
        ("Mumbai","Mumbai",mh_id,in_id,"Regional",45),
        ("Bangalore","Bangalore",ka_id,in_id,"Regional",38),
    ]: c.execute("INSERT INTO office_locations(name,city,state_id,country_id,type,headcount) VALUES(?,?,?,?,?,?)",
                 (name,city,sid,cid,typ,hc))
    conn.commit()

    # Clients
    ct_sa = c.execute("SELECT id FROM master_contract_types WHERE name='Staff Augmentation'").fetchone()[0]
    ct_dh = c.execute("SELECT id FROM master_contract_types WHERE name='Direct Hire'").fetchone()[0]
    ct_ms = c.execute("SELECT id FROM master_contract_types WHERE name='MSA'").fetchone()[0]
    pt30  = c.execute("SELECT id FROM master_payment_terms WHERE name='Net 30'").fetchone()[0]
    pt45  = c.execute("SELECT id FROM master_payment_terms WHERE name='Net 45'").fetchone()[0]
    for name,ind,ctype,curr,pt,poc,email,score,status,rating in [
        ("Acme Inc.","Technology",ct_sa,"USD",pt30,"Brian Cole","brian@acme.com",98,"Active",5),
        ("TechCorp","Finance",ct_ms,"USD",pt30,"Sara Fine","sara@techcorp.com",94,"Active",4),
        ("GloboCorp","Retail",ct_dh,"INR",pt45,"Mike Rand","mike@globo.com",42,"At Risk",2),
        ("DataSys","Healthcare",ct_ms,"INR",pt30,"Amy Ling","amy@datasys.com",86,"Active",4),
        ("NovaTech","Manufacturing",ct_sa,"INR",pt30,"Rob Steel","rob@novatech.com",91,"Active",5),
    ]: c.execute("""INSERT INTO clients(name,industry,contract_type_id,currency,payment_terms_id,
        primary_contact,contact_email,health_score,status,rating) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (name,ind,ctype,curr,pt,poc,email,score,status,rating))
    conn.commit()

    # Vendors
    vc_jb = c.execute("SELECT id FROM master_vendor_categories WHERE name='Job Board'").fetchone()[0]
    vc_bg = c.execute("SELECT id FROM master_vendor_categories WHERE name='Background Check'").fetchone()[0]
    vc_sv = c.execute("SELECT id FROM master_vendor_categories WHERE name='Sub-Vendor'").fetchone()[0]
    vc_te = c.execute("SELECT id FROM master_vendor_categories WHERE name='Technology'").fetchone()[0]
    for name,cat,poc,email,cend,sla,spend,sladesc,status,rating in [
        ("LinkedIn Talent",vc_jb,"Sarah M.","sarah@linkedin.com","2026-12-31",97,28000,"Response ≥85%","Active",5),
        ("Sterling BGC",vc_bg,"John T.","john@sterling.com","2026-06-30",99,14000,"Turnaround 72hr","Active",5),
        ("TechStaff Inc.",vc_sv,"Mike R.","mike@techstaff.com","2026-03-31",82,185000,"Quality ≥90%","Active",3),
        ("Workday HCM",vc_te,"Lisa K.","lisa@workday.com","2027-01-31",100,18000,"99.9% uptime","Active",5),
        ("Checkr",vc_bg,"Tom B.","tom@checkr.com","2026-08-31",71,8000,"Turnaround 48hr","Watch",2),
    ]: c.execute("""INSERT INTO vendors(name,category_id,primary_contact,contact_email,
        contract_end,sla_score,spend_mtd,sla_description,status,rating) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (name,cat,poc,email,cend,sla,spend,sladesc,status,rating))
    conn.commit()

    # Employees
    dept_eng = c.execute("SELECT id FROM departments WHERE name='Engineering'").fetchone()[0]
    dept_hr  = c.execute("SELECT id FROM departments WHERE name='HR & Talent'").fetchone()[0]
    dept_sal = c.execute("SELECT id FROM departments WHERE name='Sales'").fetchone()[0]
    dept_fin = c.execute("SELECT id FROM departments WHERE name='Finance'").fetchone()[0]
    et_fte   = c.execute("SELECT id FROM master_employment_types WHERE name='Full-Time'").fetchone()[0]
    et_ctr   = c.execute("SELECT id FROM master_employment_types WHERE name='Contractor (C2C)'").fetchone()[0]
    cl_acme  = c.execute("SELECT id FROM clients WHERE name='Acme Inc.'").fetchone()[0]
    cl_nova  = c.execute("SELECT id FROM clients WHERE name='NovaTech'").fetchone()[0]

    for eid,fn,mn,ln,em,title,dept,etype,sal,br,sd,status in [
        ("EMP-0001","Ravi",None,"Kumar","ravi@mcraan.com","VP Engineering",dept_eng,et_fte,220000,0,"2019-01-15","Active"),
        ("EMP-0002","Aisha",None,"Kumar","aisha@mcraan.com","HR Director",dept_hr,et_fte,180000,0,"2020-02-10","Active"),
        ("EMP-0003","Carlos",None,"Mendez","carlos@mcraan.com","Sr. Recruiter",dept_hr,et_fte,95000,0,"2021-03-22","Active"),
        ("EMP-0004","Sandra",None,"Bloom","sandra@mcraan.com","VP Sales",dept_sal,et_fte,240000,0,"2018-06-01","Active"),
        ("EMP-0005","Marcus","A","Torres","marcus@mcraan.com","Account Executive",dept_sal,et_fte,110000,145,"2021-06-15","Active"),
        ("CTR-0001","James",None,"Obi","james.obi@ext.com","DevOps Engineer",dept_eng,et_ctr,0,120,"2026-04-21","Active"),
        ("EMP-0006","Priya",None,"Sharma","priya@mcraan.com","Sr. React Developer",dept_eng,et_fte,155000,0,"2026-05-05","Onboarding"),
    ]: c.execute("""INSERT INTO employees(emp_id,first_name,middle_name,last_name,email,job_title,
        department_id,employment_type_id,salary,bill_rate,start_date,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (eid,fn,mn,ln,em,title,dept,etype,sal,br,sd,status))
    conn.commit()

    ravi_id   = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0001'").fetchone()[0]
    aisha_id  = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0002'").fetchone()[0]
    marcus_id = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0005'").fetchone()[0]
    james_id  = c.execute("SELECT id FROM employees WHERE emp_id='CTR-0001'").fetchone()[0]
    priya_id  = c.execute("SELECT id FROM employees WHERE emp_id='EMP-0006'").fetchone()[0]

    # Set reporting managers
    c.execute("UPDATE employees SET reporting_manager_id=? WHERE emp_id='EMP-0005'",(ravi_id,))
    c.execute("UPDATE employees SET reporting_manager_id=?,client_id=? WHERE emp_id='CTR-0001'",(ravi_id,cl_nova))
    c.execute("UPDATE employees SET reporting_manager_id=?,client_id=? WHERE emp_id='EMP-0005'",(ravi_id,cl_acme))

    # Emergency contacts
    c.execute("""INSERT INTO employee_emergency_contacts(employee_id,name,phone,relationship,is_primary)
        VALUES(?,?,?,?,1)""",(aisha_id,"Ravi Kumar","+91-9000000001","Spouse"))
    c.execute("""INSERT INTO employee_emergency_contacts(employee_id,name,phone,relationship,is_primary)
        VALUES(?,?,?,?,1)""",(marcus_id,"Priya Torres","+91-9000000002","Spouse"))

    # Education
    c.execute("""INSERT INTO employee_education(employee_id,institution,degree,field_of_study,start_year,end_year)
        VALUES(?,?,?,?,?,?)""",(ravi_id,"IIT Hyderabad","B.Tech","Computer Science",2011,2015))
    c.execute("""INSERT INTO employee_education(employee_id,institution,degree,field_of_study,start_year,end_year)
        VALUES(?,?,?,?,?,?)""",(aisha_id,"XLRI Jamshedpur","MBA","Human Resources",2014,2016))

    # Experience
    c.execute("""INSERT INTO employee_experience(employee_id,company,designation,start_date,end_date,is_current)
        VALUES(?,?,?,?,?,0)""",(ravi_id,"Infosys","Software Engineer","2015-07-01","2019-01-10"))
    conn.commit()

    # Users
    role_admin = c.execute("SELECT id FROM master_user_roles WHERE name='Admin'").fetchone()[0]
    role_hr    = c.execute("SELECT id FROM master_user_roles WHERE name='HR Manager'").fetchone()[0]
    role_rec   = c.execute("SELECT id FROM master_user_roles WHERE name='Recruiter'").fetchone()[0]
    role_emp   = c.execute("SELECT id FROM master_user_roles WHERE name='Employee'").fetchone()[0]

    for uname,email,pw,role,emp in [
        ("admin","admin@mcraan.com","Admin@123",role_admin,None),
        ("aisha.kumar","aisha@mcraan.com","HR@123",role_hr,aisha_id),
        ("carlos.mendez","carlos@mcraan.com","Rec@123",role_rec,None),
        ("marcus.torres","marcus@mcraan.com","Emp@123",role_emp,marcus_id),
    ]: c.execute("""INSERT INTO users(username,email,password_hash,role_id,employee_id,full_name)
        VALUES(?,?,?,?,?,?)""",
        (uname,email,hashlib.sha256(pw.encode()).hexdigest(),role,emp,
         uname.replace('.',' ').title()))
    conn.commit()

    # Timesheets
    ts_pend = c.execute("SELECT id FROM master_timesheet_statuses WHERE name='Pending'").fetchone()[0]
    ts_appr = c.execute("SELECT id FROM master_timesheet_statuses WHERE name='Approved'").fetchone()[0]
    for emp,clt,proj,we,rh,ot,br,status in [
        (marcus_id,cl_acme,"Acme / Sprint 12","2026-04-25",40.0,6.5,145.0,ts_pend),
        (james_id,cl_nova,"NovaTech / DevOps","2026-04-25",40.0,4.0,120.0,ts_pend),
        (priya_id,cl_acme,"Acme / UI Dev","2026-04-25",40.0,0.0,145.0,ts_pend),
        (marcus_id,cl_acme,"Acme / Sprint 11","2026-04-18",40.0,2.0,145.0,ts_appr),
    ]: c.execute("""INSERT INTO timesheets(employee_id,client_id,project,week_ending,
        regular_hours,overtime_hours,bill_rate,status_id) VALUES(?,?,?,?,?,?,?,?)""",
        (emp,clt,proj,we,rh,ot,br,status))
    conn.commit()

    # Payroll runs
    rt = c.execute("SELECT id FROM master_payroll_run_types WHERE name='Semi-Monthly FTE'").fetchone()[0]
    for rd,ps,pe,ec,gross,net,tax,status in [
        ("2026-05-02","2026-04-16","2026-04-30",7,420000,315000,105000,"Processing"),
        ("2026-05-15","2026-05-01","2026-05-15",7,420000,0,0,"Scheduled"),
    ]: c.execute("""INSERT INTO payroll_runs(run_date,period_start,period_end,run_type_id,
        employee_count,gross_amount,net_amount,tax_amount,status) VALUES(?,?,?,?,?,?,?,?,?)""",
        (rd,ps,pe,rt,ec,gross,net,tax,status))
    conn.commit()

    # Payroll entries for Apr 2026
    run_id = c.execute("SELECT id FROM payroll_runs WHERE run_date='2026-05-02'").fetchone()[0]
    for emp_id,ctc,basic,hra,med,spec,oth,inc,pt,pf_e,pf_er,mi,tds,esi_e,esi_er in [
        (ravi_id,   220000,18333,7333,1250,3500,500,10000,200,2200,2200,1000,4500,0,0),
        (aisha_id,  180000,15000,6000,1000,2500,400,5000, 200,1800,1800,1000,3000,0,0),
        (marcus_id, 110000,9166, 3666,750, 1500,250,3000, 200,1100,1100,750, 1200,0,0),
        (priya_id,  155000,12916,5166,900, 2200,350,0,    200,1550,1550,900, 2200,0,0),
    ]:
        total_earn = basic+hra+med+spec+oth+inc
        lop=0; net_sal = total_earn - (pt+pf_e+mi+tds)
        total_ded = pt+pf_e+mi+tds
        c.execute("""INSERT INTO payroll_entries(payroll_run_id,employee_id,month,
            ctc,basic,hra,medical_allowance,special_allowance,other_allowances,incentive,
            total_earnings,profession_tax,pf_employee,pf_employer,medical_insurance,
            tds,total_deductions,net_salary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id,emp_id,"2026-04",ctc,basic,hra,med,spec,oth,inc,
             total_earn,pt,pf_e,pf_er,mi,tds,total_ded,net_sal))
    conn.commit()

    # Job reqs, candidates, applications
    pri_hi = c.execute("SELECT id FROM master_priority_levels WHERE name='High'").fetchone()[0]
    pri_md = c.execute("SELECT id FROM master_priority_levels WHERE name='Medium'").fetchone()[0]
    cl_data = c.execute("SELECT id FROM clients WHERE name='DataSys'").fetchone()[0]
    cl_tech = c.execute("SELECT id FROM clients WHERE name='TechCorp'").fetchone()[0]
    for title,clt,et,dept,rec,pri,loc,cmin,cmax,od in [
        ("Sr. Software Engineer",cl_acme,ct_sa,dept_eng,ravi_id,pri_hi,"Remote",1400000,1600000,"2026-04-09"),
        ("Data Engineer",cl_data,ct_sa,dept_eng,None,pri_hi,"Remote",1300000,1500000,"2026-04-03"),
        ("Product Manager",cl_tech,ct_dh,dept_fin,None,pri_md,"Hyderabad",1550000,1750000,"2026-04-15"),
    ]: c.execute("""INSERT INTO job_requisitions(title,client_id,engagement_type_id,department_id,
        recruiter_id,priority_id,location,comp_min,comp_max,opened_date) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (title,clt,et,dept,rec,pri,loc,cmin,cmax,od))
    conn.commit()

    src_li = c.execute("SELECT id FROM master_candidate_sources WHERE name='LinkedIn'").fetchone()[0]
    src_rf = c.execute("SELECT id FROM master_candidate_sources WHERE name='Referral'").fetchone()[0]
    for fn,ln,em,loc,title,yoe,src,skills in [
        ("Ananya","Reddy","ananya@email.com","Hyderabad","Software Engineer",5,src_li,"React,Node.js,TypeScript"),
        ("James","Park","jpark@email.com","Remote","Data Engineer",4,src_li,"Python,Spark,Kafka"),
        ("Sofia","Patel","sofia@email.com","Chicago","Product Manager",9,src_rf,"SaaS,B2B,OKRs"),
    ]: c.execute("""INSERT INTO candidates(first_name,last_name,email,location,current_title,
        years_exp,source_id,skills) VALUES(?,?,?,?,?,?,?,?)""",
        (fn,ln,em,loc,title,yoe,src,skills))
    conn.commit()

    stage_app = c.execute("SELECT id FROM master_application_stages WHERE name='Applied'").fetchone()[0]
    stage_scr = c.execute("SELECT id FROM master_application_stages WHERE name='Screening'").fetchone()[0]
    req1 = c.execute("SELECT id FROM job_requisitions WHERE title='Sr. Software Engineer'").fetchone()[0]
    req2 = c.execute("SELECT id FROM job_requisitions WHERE title='Data Engineer'").fetchone()[0]
    cand1 = c.execute("SELECT id FROM candidates WHERE email='ananya@email.com'").fetchone()[0]
    cand2 = c.execute("SELECT id FROM candidates WHERE email='jpark@email.com'").fetchone()[0]
    for cand,req,stage in [(cand1,req1,stage_app),(cand2,req2,stage_scr)]:
        c.execute("INSERT INTO applications(candidate_id,requisition_id,stage_id) VALUES(?,?,?)",(cand,req,stage))
    conn.commit()

    # Invoices
    inv_sent    = c.execute("SELECT id FROM master_invoice_statuses WHERE name='Sent'").fetchone()[0]
    inv_paid    = c.execute("SELECT id FROM master_invoice_statuses WHERE name='Paid'").fetchone()[0]
    inv_overdue = c.execute("SELECT id FROM master_invoice_statuses WHERE name='Overdue'").fetchone()[0]
    cl_glob = c.execute("SELECT id FROM clients WHERE name='GloboCorp'").fetchone()[0]
    for num,clt,ctype,ps,pe,amt,due,paid,status in [
        ("INV-1001",cl_acme,ct_sa,"2026-04-16","2026-04-30",84500,"2026-05-15",None,inv_sent),
        ("INV-1002",cl_tech,ct_ms,"2026-04-16","2026-04-30",62000,"2026-05-15","2026-04-27",inv_paid),
        ("INV-1003",cl_glob,ct_dh,None,None,38500,"2026-04-25",None,inv_overdue),
    ]: c.execute("""INSERT INTO invoices(invoice_number,client_id,contract_type_id,period_start,
        period_end,amount,due_date,paid_date,status_id) VALUES(?,?,?,?,?,?,?,?,?)""",
        (num,clt,ctype,ps,pe,amt,due,paid,status))
    conn.commit()

    # Activity log
    admin_id = c.execute("SELECT id FROM users WHERE username='admin'").fetchone()[0]
    for et,eid,act,desc in [
        ("invoices","1","sent","Invoice #INV-1001 sent to Acme Inc. — ₹84,500"),
        ("invoices","2","paid","Payment received — TechCorp ₹62,000 via NEFT"),
        ("timesheets","1","submitted","Timesheet submitted by Marcus Torres — 46.5 hrs"),
    ]: c.execute("INSERT INTO activity_log(entity_type,entity_id,action,description,user_id,user_name) VALUES(?,?,?,?,?,?)",
               (et,eid,act,desc,admin_id,"System"))
    conn.commit()
    conn.close()
    print("✓ v4 seed complete")

if __name__ == "__main__":
    init_db(); seed_db()
    print(f"✓ DB ready: {DB}")
