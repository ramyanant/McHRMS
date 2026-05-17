"""Recruitment / Talent Acquisition — complete v1-compatible implementation"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

rec_bp = Blueprint('recruitment', __name__, url_prefix='/api/v1')

# ═══════════════════════════════════════════════════════════════
# JOB REQUISITIONS
# ═══════════════════════════════════════════════════════════════
@rec_bp.route('/recruitment/jobs', methods=['GET'])
@require_auth
def list_jobs():
    page, per_page = get_page_params()
    status = request.args.get('status',''); client = request.args.get('client_id','')
    search = request.args.get('q','')
    where, params = ["j.is_active=1"], []
    if status: where.append("j.status=%s"); params.append(status)
    if client: where.append("j.client_id=%s"); params.append(client)
    if search:
        where.append("j.title ILIKE %s"); params.append(f'%{search}%')
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM job_requisitions j WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT j.*, c.name as client_name, d.name as department_name,
        p.name as priority_name, e.first_name||' '||e.last_name as recruiter_name,
        (SELECT COUNT(*) FROM applications a WHERE a.requisition_id=j.id) as application_count
        FROM job_requisitions j
        LEFT JOIN clients c ON c.id=j.client_id
        LEFT JOIN departments d ON d.id=j.department_id
        LEFT JOIN master_priority_levels p ON p.id=j.priority_id
        LEFT JOIN employees e ON e.id=j.recruiter_id
        WHERE {clause} ORDER BY j.created_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@rec_bp.route('/recruitment/jobs', methods=['POST'])
@require_auth
def create_job():
    d = request.get_json() or {}
    try: validate(d, {'title': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("""INSERT INTO job_requisitions
        (title, client_id, engagement_type_id, department_id, recruiter_id, priority_id,
         location, comp_min, comp_max, description, requirements, target_start, status,
         work_mode, min_experience, max_experience, positions, budget, job_type, notice_period, assigned_to)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['title'], d.get('client_id'), d.get('employment_type_id') or d.get('engagement_type_id'),
         d.get('department_id'), d.get('recruiter_id'), d.get('priority_id'),
         d.get('location'), d.get('comp_min') or d.get('min_salary'),
         d.get('comp_max') or d.get('max_salary'),
         d.get('description'), d.get('requirements'), d.get('target_start') or d.get('target_date'),
         d.get('status','Active'),
         d.get('work_mode','On-Site'), d.get('min_experience',0), d.get('max_experience'),
         d.get('positions',1), d.get('budget',0), d.get('job_type','Permanent'),
         d.get('notice_period'), d.get('assigned_to')))
    rid = cur.fetchone()['id']; conn.close()
    write_audit_log('recruitment','CREATE','job_requisition',rid,f"Job: {d['title']}")
    return created({'id': rid})

@rec_bp.route('/recruitment/jobs/<int:rid>', methods=['GET','PUT','DELETE'])
@require_auth
def job_detail(rid):
    job = db_row1("""SELECT j.*, c.name as client_name, d.name as department_name,
        e.first_name||' '||e.last_name as recruiter_name, p.name as priority_name
        FROM job_requisitions j
        LEFT JOIN clients c ON c.id=j.client_id
        LEFT JOIN departments d ON d.id=j.department_id
        LEFT JOIN employees e ON e.id=j.recruiter_id
        LEFT JOIN master_priority_levels p ON p.id=j.priority_id
        WHERE j.id=%s AND j.is_active=1""", (rid,))
    if not job: return not_found("Job Requisition")
    if request.method == 'GET':
        job['applications'] = db_rows("""SELECT a.*, c.first_name||' '||c.last_name as candidate_name,
            c.email, c.phone, c.current_title, c.years_exp, s.name as stage_name
            FROM applications a
            JOIN candidates c ON c.id=a.candidate_id
            LEFT JOIN master_application_stages s ON s.id=a.stage_id
            WHERE a.requisition_id=%s ORDER BY a.applied_at DESC""", (rid,))
        return ok(job)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['title','status','positions','target_start','description','requirements',
                  'recruiter_id','priority_id','comp_min','comp_max','location',
                  'work_mode','min_experience','max_experience','budget','job_type',
                  'notice_period','department_id','client_id','assigned_to']
        updates = {k: d[k] for k in fields if k in d}
        if 'target_date' in d: updates['target_start'] = d['target_date']
        if updates:
            sc = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE job_requisitions SET {sc},updated_at=NOW() WHERE id=%s",
                      list(updates.values())+[rid])
        return ok(message="Updated")
    db_execute("UPDATE job_requisitions SET is_active=0,updated_at=NOW() WHERE id=%s",(rid,))
    return ok(message="Deleted")

# ═══════════════════════════════════════════════════════════════
# CANDIDATES
# ═══════════════════════════════════════════════════════════════
@rec_bp.route('/candidates', methods=['GET'])
@require_auth
def list_candidates():
    page, per_page = get_page_params()
    search = request.args.get('q','')
    where, params = ["c.is_active=1"], []
    if search:
        where.append("(c.first_name||' '||c.last_name ILIKE %s OR c.email ILIKE %s OR c.current_title ILIKE %s)")
        params += [f'%{search}%']*3
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM candidates c WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT c.*, s.name as source_name,
        e.first_name||' '||e.last_name as recruiter_name,
        COUNT(DISTINCT a.id) as application_count,
        MAX(st.name) as latest_stage
        FROM candidates c
        LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        LEFT JOIN employees e ON e.id=c.recruiter_id
        LEFT JOIN applications a ON a.candidate_id=c.id
        LEFT JOIN master_application_stages st ON st.id=a.stage_id
        WHERE {clause} GROUP BY c.id, s.name, e.first_name, e.last_name
        ORDER BY c.created_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@rec_bp.route('/candidates', methods=['POST'])
@require_auth
def create_candidate():
    d = request.get_json() or {}
    try: validate(d, {'first_name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("""INSERT INTO candidates
        (first_name, middle_name, last_name, email, phone, location,
         current_title, current_company, years_exp, current_ctc, expected_ctc,
         notice_period, source_id, linkedin_url, resume_url, skills,
         gender, nationality, pan, aadhaar, recruiter_id, status, rating, notes, availability)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['first_name'], d.get('middle_name'), d.get('last_name',''),
         d.get('email'), d.get('phone'),
         d.get('current_location') or d.get('location'),
         d.get('current_designation') or d.get('current_title'),
         d.get('current_company'),
         d.get('total_experience') or d.get('years_exp') or 0,
         d.get('current_ctc'), d.get('expected_ctc'),
         d.get('notice_period'), d.get('source_id'), d.get('linkedin_url'),
         d.get('resume_url'), d.get('skills'),
         d.get('gender'), d.get('nationality','Indian'),
         d.get('pan'), d.get('aadhaar'),
         d.get('recruiter_id') or g.user.get('employee_id'),
         d.get('status','Active'), d.get('rating','Good'), d.get('notes'),
         d.get('availability','Looking for Change')))
    cid = cur.fetchone()['id']
    # Auto-create application if requisition_id provided
    req_id = d.get('requisition_id')
    app_id = None
    if req_id:
        sid = db_row1("SELECT id FROM master_application_stages ORDER BY sort_order LIMIT 1")
        cur.execute("INSERT INTO applications (candidate_id,requisition_id,stage_id,recruiter_id) VALUES (%s,%s,%s,%s) RETURNING id",
                   (cid, req_id, sid['id'] if sid else None, d.get('recruiter_id') or g.user.get('employee_id')))
        app_id = cur.fetchone()['id']
    conn.close()
    write_audit_log('recruitment','CREATE','candidate',cid,f"Candidate: {d['first_name']} {d.get('last_name','')}")
    return created({'id': cid, 'application_id': app_id})

@rec_bp.route('/candidates/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def candidate_detail(cid):
    cand = db_row1("""SELECT c.*, s.name as source_name,
        e.first_name||' '||e.last_name as recruiter_name
        FROM candidates c
        LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        LEFT JOIN employees e ON e.id=c.recruiter_id
        WHERE c.id=%s AND c.is_active=1""", (cid,))
    if not cand: return not_found("Candidate")
    if request.method == 'GET':
        cand['applications'] = db_rows("""SELECT a.*, j.title as job_title, j.location,
            c.name as client_name, s.name as stage_name
            FROM applications a
            JOIN job_requisitions j ON j.id=a.requisition_id
            LEFT JOIN clients c ON c.id=j.client_id
            LEFT JOIN master_application_stages s ON s.id=a.stage_id
            WHERE a.candidate_id=%s ORDER BY a.applied_at DESC""", (cid,))
        cand['interviews'] = db_rows("""SELECT i.*, f.name as format_name
            FROM interviews i
            JOIN applications a ON a.id=i.application_id
            LEFT JOIN master_interview_formats f ON f.id=i.format_id
            WHERE a.candidate_id=%s ORDER BY i.scheduled_at DESC""", (cid,))
        return ok(cand)
    if request.method == 'DELETE':
        db_execute("UPDATE candidates SET is_active=0,updated_at=NOW() WHERE id=%s",(cid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    fields = ['first_name','middle_name','last_name','email','phone','location',
              'current_title','current_company','years_exp','current_ctc','expected_ctc',
              'notice_period','source_id','linkedin_url','resume_url','skills',
              'gender','nationality','pan','aadhaar','recruiter_id','status','rating','notes']
    updates = {}
    for k in fields:
        if k in d: updates[k] = d[k]
    if 'current_location' in d:     updates['location']       = d['current_location']
    if 'current_designation' in d:  updates['current_title']  = d['current_designation']
    if 'total_experience' in d:     updates['years_exp']      = d['total_experience']
    if updates:
        sc = ', '.join(f"{k}=%s" for k in updates)
        db_execute(f"UPDATE candidates SET {sc},updated_at=NOW() WHERE id=%s",
                  list(updates.values())+[cid])
    return ok(message="Updated")

# ═══════════════════════════════════════════════════════════════
# APPLICATIONS / PIPELINE
# ═══════════════════════════════════════════════════════════════
@rec_bp.route('/applications', methods=['POST'])
@require_auth
def create_application():
    d = request.get_json() or {}
    try: validate(d, {'candidate_id':['required'],'requisition_id':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    # Check duplicate
    existing = db_row1("SELECT id FROM applications WHERE candidate_id=%s AND requisition_id=%s",
                      (d['candidate_id'], d['requisition_id']))
    if existing: return err("Candidate already applied to this job")
    first_stage = db_row1("SELECT id FROM master_application_stages ORDER BY sort_order LIMIT 1")
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("INSERT INTO applications (candidate_id,requisition_id,stage_id,expected_salary,recruiter_id,notes) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
               (d['candidate_id'], d['requisition_id'],
                d.get('stage_id', first_stage['id'] if first_stage else None),
                d.get('expected_salary'), d.get('recruiter_id') or g.user.get('employee_id'),
                d.get('notes')))
    aid = cur.fetchone()['id']; conn.close()
    write_audit_log('recruitment','CREATE','application',aid,"Application created")
    return created({'id': aid})

@rec_bp.route('/applications/<int:aid>', methods=['GET','PUT'])
@require_auth
def application_detail(aid):
    app = db_row1("""SELECT a.*, c.first_name||' '||c.last_name as candidate_name,
        j.title as job_title, s.name as stage_name
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions j ON j.id=a.requisition_id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        WHERE a.id=%s""", (aid,))
    if not app: return not_found("Application")
    if request.method == 'GET': return ok(app)
    d = request.get_json() or {}
    if 'stage_id' in d or 'stage_name' in d:
        stage_id = d.get('stage_id')
        if not stage_id and d.get('stage_name'):
            s = db_row1("SELECT id FROM master_application_stages WHERE name=%s",(d['stage_name'],))
            if s: stage_id = s['id']
        if stage_id:
            db_execute("UPDATE applications SET stage_id=%s,notes=%s,updated_at=NOW() WHERE id=%s",
                      (stage_id, d.get('notes', app['notes']), aid))
    if d.get('rejection_reason'):
        db_execute("UPDATE applications SET rejection_reason=%s,updated_at=NOW() WHERE id=%s",
                  (d['rejection_reason'], aid))
    write_audit_log('recruitment','UPDATE','application',aid,"Application updated")
    return ok(message="Updated")

@rec_bp.route('/recruitment/pipeline', methods=['GET'])
@require_auth
def pipeline():
    req_id = request.args.get('requisition_id','')
    where, params = [], []
    if req_id: where.append("a.requisition_id=%s"); params.append(req_id)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db_rows(f"""SELECT a.id, a.requisition_id, a.candidate_id, a.notes,
        a.stage_id, s.name as stage_name, s.sort_order,
        c.first_name||' '||c.last_name as candidate_name,
        c.email, c.phone, c.current_title, c.years_exp,
        c.expected_ctc, c.notice_period,
        j.title as job_title, cl.name as client_name,
        src.name as source
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions j ON j.id=a.requisition_id
        LEFT JOIN clients cl ON cl.id=j.client_id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        LEFT JOIN master_candidate_sources src ON src.id=c.source_id
        {clause} ORDER BY s.sort_order, a.applied_at""", params)
    stages = db_rows("SELECT * FROM master_application_stages WHERE is_active=1 ORDER BY sort_order")
    return ok({'stages': stages, 'applications': rows})

# ═══════════════════════════════════════════════════════════════
# INTERVIEWS
# ═══════════════════════════════════════════════════════════════
@rec_bp.route('/interviews', methods=['GET'])
@require_auth
def list_interviews():
    rows = db_rows("""SELECT i.*, f.name as format_name,
        c.first_name||' '||c.last_name as candidate_name,
        c.phone as candidate_phone, c.email as candidate_email,
        j.title as job_title, cl.name as client_name,
        a.id as application_id
        FROM interviews i
        JOIN applications a ON a.id=i.application_id
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions j ON j.id=a.requisition_id
        LEFT JOIN clients cl ON cl.id=j.client_id
        LEFT JOIN master_interview_formats f ON f.id=i.format_id
        ORDER BY i.scheduled_at DESC""")
    return ok(rows)

@rec_bp.route('/interviews', methods=['POST'])
@require_auth
def create_interview():
    d = request.get_json() or {}
    # If candidate_id + job_id sent (from Interviews page), auto-create/find application
    app_id = d.get('application_id')
    if not app_id and d.get('candidate_id') and d.get('job_id'):
        existing = db_row1("SELECT id FROM applications WHERE candidate_id=%s AND requisition_id=%s LIMIT 1",
                           (d['candidate_id'], d['job_id']))
        if existing:
            app_id = existing['id']
        else:
            # Auto-create application
            stage = db_row1("SELECT id FROM master_application_stages ORDER BY id LIMIT 1")
            conn2 = get_pg_conn(); conn2.autocommit = True; cur2 = conn2.cursor()
            cur2.execute("INSERT INTO applications (candidate_id, requisition_id, stage_id) VALUES (%s,%s,%s) RETURNING id",
                        (d['candidate_id'], d['job_id'], stage['id'] if stage else 1))
            app_id = cur2.fetchone()['id']; conn2.close()
    if not app_id:
        return err("application_id or (candidate_id + job_id) required", 400)
    if not d.get('round'):
        return err("round is required", 400)
    fmt = db_row1("SELECT id FROM master_interview_formats WHERE name=%s LIMIT 1",
                 (d.get('format','Video Call'),))
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("""INSERT INTO interviews
        (application_id, round, format_id, interviewer, scheduled_at, location_link, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (app_id, str(d['round']),
         d.get('format_id') or (fmt['id'] if fmt else None),
         d.get('interviewer') or d.get('interviewer_name',''),
         d.get('scheduled_at'), d.get('meeting_link') or d.get('location_link'),
         d.get('notes')))
    iid = cur.fetchone()['id']; conn.close()
    write_audit_log('recruitment','CREATE','interview',iid,"Interview scheduled")
    return created({'id': iid})

@rec_bp.route('/interviews/<int:iid>', methods=['GET','PUT'])
@require_auth
def interview_detail(iid):
    iv = db_row1("""SELECT i.*, f.name as format_name,
        c.first_name||' '||c.last_name as candidate_name,
        j.title as job_title, a.id as application_id
        FROM interviews i
        JOIN applications a ON a.id=i.application_id
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions j ON j.id=a.requisition_id
        LEFT JOIN master_interview_formats f ON f.id=i.format_id
        WHERE i.id=%s""", (iid,))
    if not iv: return not_found("Interview")
    if request.method == 'GET': return ok(iv)
    d = request.get_json() or {}
    db_execute("""UPDATE interviews SET scorecard_status=%s, decision=%s, notes=%s,
        interviewer=%s, scheduled_at=%s WHERE id=%s""",
        (d.get('scorecard_status', iv['scorecard_status']),
         d.get('decision') or d.get('recommendation', iv['decision']),
         d.get('feedback') or d.get('notes', iv['notes']),
         d.get('interviewer', iv['interviewer']),
         d.get('scheduled_at', iv['scheduled_at']), iid))
    write_audit_log('recruitment','UPDATE','interview',iid,f"Interview updated: {d.get('decision','')}")
    return ok(message="Updated")

# ═══════════════════════════════════════════════════════════════
# OFFERS
# ═══════════════════════════════════════════════════════════════
def _ensure_offers():
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS offers (
            id SERIAL PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
            requisition_id INTEGER NOT NULL REFERENCES job_requisitions(id),
            application_id INTEGER REFERENCES applications(id),
            designation TEXT, department_id INTEGER REFERENCES departments(id),
            joining_date DATE, offered_ctc NUMERIC, offered_basic NUMERIC, offered_hra NUMERIC,
            offered_allowances NUMERIC, employment_type_id INTEGER, offer_date DATE,
            expiry_date DATE, status TEXT DEFAULT 'Draft',
            offer_letter_data TEXT, offer_letter_name TEXT,
            acceptance_date DATE, rejection_date DATE, rejection_reason TEXT,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), created_by INTEGER)""")
        conn.close()
    except Exception as e:
        print(f"[offers] {e}", flush=True)

@rec_bp.route('/offers', methods=['GET'])
@require_auth
def list_offers():
    _ensure_offers()
    try:
        rows = db_rows("""SELECT o.*, c.first_name||' '||c.last_name as candidate_name,
            c.email, c.phone, j.title as job_title, cl.name as client_name
            FROM offers o
            JOIN candidates c ON c.id=o.candidate_id
            JOIN job_requisitions j ON j.id=o.requisition_id
            LEFT JOIN clients cl ON cl.id=j.client_id
            ORDER BY o.created_at DESC""")
        return ok(rows)
    except Exception: return ok([])

@rec_bp.route('/offers', methods=['POST'])
@require_auth
def create_offer():
    _ensure_offers()
    d = request.get_json() or {}
    try: validate(d, {'candidate_id':['required'],'requisition_id':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO offers
        (candidate_id,requisition_id,application_id,designation,department_id,
         joining_date,offered_ctc,offered_basic,offered_hra,offered_allowances,
         employment_type_id,offer_date,expiry_date,status,created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['candidate_id'],d['requisition_id'],d.get('application_id'),
         d.get('designation'),d.get('department_id'),d.get('joining_date'),
         d.get('offered_ctc'),d.get('offered_basic'),d.get('offered_hra'),
         d.get('offered_allowances'),d.get('employment_type_id'),
         d.get('offer_date'),d.get('expiry_date'),d.get('status','Draft'),
         g.user['id']), returning=True)
    write_audit_log('recruitment','CREATE','offer',result['id'],"Offer created")
    return created({'id': result['id']})

@rec_bp.route('/offers/<int:oid>', methods=['GET','PUT'])
@require_auth
def offer_detail(oid):
    _ensure_offers()
    offer = db_row1("""SELECT o.*, c.first_name||' '||c.last_name as candidate_name,
        c.email, c.phone, j.title as job_title, cl.name as client_name
        FROM offers o
        JOIN candidates c ON c.id=o.candidate_id
        JOIN job_requisitions j ON j.id=o.requisition_id
        LEFT JOIN clients cl ON cl.id=j.client_id
        WHERE o.id=%s""", (oid,))
    if not offer: return not_found("Offer")
    if request.method == 'GET': return ok(offer)
    d = request.get_json() or {}
    db_execute("""UPDATE offers SET status=%s, offered_ctc=%s, joining_date=%s,
        expiry_date=%s, rejection_reason=%s, offer_date=%s, updated_at=NOW() WHERE id=%s""",
        (d.get('status',offer['status']), d.get('offered_ctc',offer['offered_ctc']),
         d.get('joining_date',offer['joining_date']), d.get('expiry_date',offer['expiry_date']),
         d.get('rejection_reason'), d.get('offer_date',offer['offer_date']), oid))
    write_audit_log('recruitment','UPDATE','offer',oid,f"Offer: {d.get('status','')}")
    return ok(message="Updated")

# ═══════════════════════════════════════════════════════════════
# ONBOARDING
# ═══════════════════════════════════════════════════════════════
@rec_bp.route('/onboarding', methods=['GET'])
@require_auth
def list_onboarding():
    rows = db_rows("""SELECT o.*,
        e.first_name||' '||e.last_name as employee_name, e.emp_id,
        ca.first_name||' '||ca.last_name as candidate_name,
        t.name as template
        FROM onboarding o
        LEFT JOIN employees e ON e.id=o.employee_id
        LEFT JOIN candidates ca ON ca.id=o.candidate_id
        LEFT JOIN master_onboarding_templates t ON t.id=o.template_id
        ORDER BY o.start_date""")
    return ok(rows)

@rec_bp.route('/onboarding', methods=['POST'])
@require_auth
def create_onboarding():
    d = request.get_json() or {}
    emp_id  = d.get('employee_id')
    cand_id = d.get('candidate_id')
    if not emp_id and not cand_id: return err("employee_id or candidate_id required")
    # Ensure columns exist
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        for sql in [
            "ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS candidate_id INTEGER REFERENCES candidates(id)",
            "ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS person_type TEXT DEFAULT 'employee'",
            "ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS notes TEXT",
        ]:
            try: cur.execute(sql)
            except: pass
        # Make employee_id nullable so candidates can be onboarded
        try: cur.execute("ALTER TABLE onboarding ALTER COLUMN employee_id DROP NOT NULL")
        except Exception: pass
        tpl = db_row1("SELECT id FROM master_onboarding_templates WHERE name=%s",
                     (d.get('template','Standard'),))
        cur.execute("""INSERT INTO onboarding
            (employee_id,candidate_id,person_type,template_id,buddy_name,start_date,notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (emp_id or None, cand_id or None,
             'candidate' if cand_id else 'employee',
             tpl['id'] if tpl else None, d.get('buddy_name'), d.get('start_date'), d.get('notes')))
        oid = cur.fetchone()['id']
        # Create default tasks
        tasks = [("Offer letter signed","Documents"),("Background check","Compliance"),
                 ("Equipment provisioned","IT"),("System access setup","IT"),
                 ("ID/Badge issued","Admin"),("Day 1 orientation","HR"),("30-day check-in","HR")]
        for task, cat in tasks:
            cur.execute("INSERT INTO onboarding_tasks (onboarding_id,task_name,category) VALUES (%s,%s,%s)",
                       (oid, task, cat))
        conn.close()
    except Exception as ex:
        return err(str(ex))
    return created({'id': oid})

@rec_bp.route('/onboarding/<int:oid>', methods=['GET','PUT'])
@require_auth
def onboarding_detail(oid):
    onb = db_row1("""SELECT o.*,
        e.first_name||' '||e.last_name as employee_name,
        ca.first_name||' '||ca.last_name as candidate_name,
        t.name as template
        FROM onboarding o
        LEFT JOIN employees e ON e.id=o.employee_id
        LEFT JOIN candidates ca ON ca.id=o.candidate_id
        LEFT JOIN master_onboarding_templates t ON t.id=o.template_id
        WHERE o.id=%s""", (oid,))
    if not onb: return not_found("Onboarding")
    if request.method == 'GET':
        onb['tasks'] = db_rows("SELECT * FROM onboarding_tasks WHERE onboarding_id=%s ORDER BY id",(oid,))
        return ok(onb)
    d = request.get_json() or {}
    db_execute("UPDATE onboarding SET status=%s, progress_pct=%s, notes=%s WHERE id=%s",
              (d.get('status',onb['status']), d.get('progress_pct',onb.get('progress_pct',0)),
               d.get('notes',onb.get('notes')), oid))
    return ok(message="Updated")

@rec_bp.route('/onboarding/tasks/<int:tid>', methods=['PUT'])
@require_auth
def toggle_task(tid):
    d = request.get_json() or {}
    done = 1 if d.get('is_complete') or d.get('status') == 'Completed' else 0
    db_execute("UPDATE onboarding_tasks SET is_complete=%s,completed_at=%s WHERE id=%s",
              (done, 'NOW()' if done else None, tid))
    # Update progress
    r = db_row1("SELECT onboarding_id FROM onboarding_tasks WHERE id=%s",(tid,))
    if r:
        stats = db_row1("SELECT COUNT(*) as cnt, COALESCE(SUM(is_complete),0) as done FROM onboarding_tasks WHERE onboarding_id=%s",(r['onboarding_id'],))
        if stats and stats['cnt']:
            pct = round(float(stats['done'])/float(stats['cnt'])*100)
            db_execute("UPDATE onboarding SET progress_pct=%s WHERE id=%s",(pct, r['onboarding_id']))
    return ok(message="Updated")

# ═══════════════════════════════════════════════════════════════
# STATS
# ═══════════════════════════════════════════════════════════════
@rec_bp.route('/recruitment/stats')
@require_auth
def recruitment_stats():
    return ok({
        'open_jobs':         db_row1("SELECT COUNT(*) as n FROM job_requisitions WHERE is_active=1 AND status='Active'")['n'],
        'total_candidates':  db_row1("SELECT COUNT(*) as n FROM candidates WHERE is_active=1")['n'],
        'interviews_today':  db_row1("SELECT COUNT(*) as n FROM interviews WHERE DATE(scheduled_at)=CURRENT_DATE")['n'],
        'pipeline_by_stage': db_rows("""SELECT s.name as stage, s.sort_order, COUNT(a.id) as count
            FROM master_application_stages s
            LEFT JOIN applications a ON a.stage_id=s.id
            GROUP BY s.id,s.name,s.sort_order ORDER BY s.sort_order"""),
        'offers_pending':    0,
        'onboarding_pending':db_row1("SELECT COUNT(*) as n FROM onboarding WHERE status='In Progress'")['n'],
    })
