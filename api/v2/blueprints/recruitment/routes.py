"""Recruitment / Talent Acquisition Blueprint — v1 schema compatible"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

rec_bp = Blueprint('recruitment', __name__, url_prefix='/api/v1')

# ── Job Requisitions ──────────────────────────────────────────
@rec_bp.route('/recruitment/jobs', methods=['GET'])
@require_auth
def list_jobs():
    page, per_page = get_page_params()
    status = request.args.get('status', '')
    client = request.args.get('client_id', '')
    where, params = ["j.is_active=1"], []
    if status: where.append("j.status=%s"); params.append(status)
    if client: where.append("j.client_id=%s"); params.append(client)
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

    conn = get_pg_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""INSERT INTO job_requisitions
        (title, client_id, engagement_type_id, department_id, recruiter_id,
         priority_id, location, comp_min, comp_max, description, target_start, status)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['title'], d.get('client_id'), d.get('employment_type_id'),
         d.get('department_id'), d.get('assigned_to') or d.get('recruiter_id'),
         d.get('priority_id'), d.get('location'),
         d.get('min_salary') or d.get('comp_min'),
         d.get('max_salary') or d.get('comp_max'),
         d.get('description'), d.get('target_date') or d.get('target_start'),
         d.get('status', 'Active')))
    rid = cur.fetchone()['id']
    conn.close()
    write_audit_log('recruitment', 'CREATE', 'job_requisition', rid, f"Job created: {d['title']}")
    return created({'id': rid})

@rec_bp.route('/recruitment/jobs/<int:rid>', methods=['GET','PUT','DELETE'])
@require_auth
def job_detail(rid):
    job = db_row1("""SELECT j.*, c.name as client_name, d.name as department_name,
        e.first_name||' '||e.last_name as recruiter_name,
        p.name as priority_name
        FROM job_requisitions j
        LEFT JOIN clients c ON c.id=j.client_id
        LEFT JOIN departments d ON d.id=j.department_id
        LEFT JOIN employees e ON e.id=j.recruiter_id
        LEFT JOIN master_priority_levels p ON p.id=j.priority_id
        WHERE j.id=%s AND j.is_active=1""", (rid,))
    if not job: return not_found("Job Requisition")
    if request.method == 'GET':
        job['applications'] = db_rows("""SELECT a.*, c.first_name||' '||c.last_name as candidate_name,
            c.email, c.phone, s.name as stage_name
            FROM applications a
            JOIN candidates c ON c.id=a.candidate_id
            LEFT JOIN master_application_stages s ON s.id=a.stage_id
            WHERE a.requisition_id=%s ORDER BY a.applied_at DESC""", (rid,))
        return ok(job)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['title','status','target_start','description','recruiter_id','priority_id',
                  'comp_min','comp_max','location']
        updates = {k: d[k] for k in fields if k in d}
        # Map frontend field names to v1 names
        if 'target_date' in d: updates['target_start'] = d['target_date']
        if 'assigned_to' in d: updates['recruiter_id'] = d['assigned_to']
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE job_requisitions SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [rid])
        return ok(message="Updated")
    db_execute("UPDATE job_requisitions SET is_active=0, updated_at=NOW() WHERE id=%s", (rid,))
    return ok(message="Deleted")

# ── Candidates ────────────────────────────────────────────────
@rec_bp.route('/candidates', methods=['GET'])
@require_auth
def list_candidates():
    page, per_page = get_page_params()
    search = request.args.get('q','')
    where, params = ["c.is_active=1"], []
    if search:
        where.append("(c.first_name ILIKE %s OR c.last_name ILIKE %s OR c.email ILIKE %s)")
        params += [f'%{search}%'] * 3
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM candidates c WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT c.*, s.name as source_name,
        COUNT(DISTINCT a.id) as application_count,
        MAX(st.name) as latest_stage
        FROM candidates c
        LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        LEFT JOIN applications a ON a.candidate_id=c.id
        LEFT JOIN master_application_stages st ON st.id=a.stage_id
        WHERE {clause} GROUP BY c.id, s.name ORDER BY c.created_at DESC
        LIMIT %s OFFSET %s""", params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@rec_bp.route('/candidates', methods=['POST'])
@require_auth
def create_candidate():
    d = request.get_json() or {}
    try: validate(d, {'first_name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)

    conn = get_pg_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""INSERT INTO candidates
        (first_name, last_name, email, phone, location,
         current_title, years_exp, source_id, linkedin_url, skills)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['first_name'], d.get('last_name',''), d.get('email'), d.get('phone'),
         d.get('current_location') or d.get('location'),
         d.get('current_designation') or d.get('current_title'),
         d.get('total_experience') or d.get('years_exp'),
         d.get('source_id'), d.get('linkedin_url'), d.get('skills')))
    cid = cur.fetchone()['id']

    # Auto-create application if requisition_id provided
    req_id = d.get('requisition_id')
    if req_id:
        sid = db_row1("SELECT id FROM master_application_stages ORDER BY sort_order LIMIT 1")
        if sid:
            cur.execute("INSERT INTO applications (candidate_id, requisition_id, stage_id) VALUES (%s,%s,%s) RETURNING id",
                       (cid, req_id, sid['id']))
    conn.close()
    write_audit_log('recruitment', 'CREATE', 'candidate', cid,
                    f"Candidate added: {d['first_name']} {d.get('last_name','')}")
    return created({'id': cid})

@rec_bp.route('/candidates/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def candidate_detail(cid):
    cand = db_row1("""SELECT c.*, s.name as source_name
        FROM candidates c LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        WHERE c.id=%s AND c.is_active=1""", (cid,))
    if not cand: return not_found("Candidate")
    if request.method == 'GET':
        cand['applications'] = db_rows("""SELECT a.*, j.title as job_title,
            s.name as stage_name, cl.name as client_name
            FROM applications a
            JOIN job_requisitions j ON j.id=a.requisition_id
            LEFT JOIN master_application_stages s ON s.id=a.stage_id
            LEFT JOIN clients cl ON cl.id=j.client_id
            WHERE a.candidate_id=%s ORDER BY a.applied_at DESC""", (cid,))
        cand['interviews'] = db_rows("""SELECT i.*, f.name as format_name
            FROM interviews i
            JOIN applications a ON a.id=i.application_id
            LEFT JOIN master_interview_formats f ON f.id=i.format_id
            WHERE a.candidate_id=%s ORDER BY i.scheduled_at DESC""", (cid,))
        return ok(cand)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['first_name','last_name','email','phone','location','current_title',
                  'years_exp','source_id','linkedin_url','skills','is_active']
        updates = {}
        for k in fields:
            if k in d: updates[k] = d[k]
        # Map frontend names
        if 'current_location' in d: updates['location'] = d['current_location']
        if 'current_designation' in d: updates['current_title'] = d['current_designation']
        if 'total_experience' in d: updates['years_exp'] = d['total_experience']
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE candidates SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [cid])
        return ok(message="Updated")
    db_execute("UPDATE candidates SET is_active=0, updated_at=NOW() WHERE id=%s", (cid,))
    return ok(message="Deleted")

# ── Pipeline (Kanban) ─────────────────────────────────────────
@rec_bp.route('/recruitment/pipeline', methods=['GET'])
@require_auth
def pipeline():
    rid = request.args.get('requisition_id')
    where, params = [], []
    if rid: where.append("a.requisition_id=%s"); params.append(rid)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db_rows(f"""SELECT a.id, a.requisition_id, a.candidate_id, a.notes,
        a.stage_id, s.name as stage_name, s.sort_order,
        c.first_name||' '||c.last_name as candidate_name,
        c.email, c.phone, c.current_title, c.years_exp,
        j.title as job_title
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions j ON j.id=a.requisition_id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        {clause} ORDER BY s.sort_order, a.applied_at""", params)
    stages = db_rows("SELECT * FROM master_application_stages WHERE is_active=1 ORDER BY sort_order")
    return ok({'stages': stages, 'applications': rows})

@rec_bp.route('/applications', methods=['POST'])
@require_auth
def create_application():
    d = request.get_json() or {}
    try: validate(d, {'requisition_id':['required'], 'candidate_id':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    first_stage = db_row1("SELECT id FROM master_application_stages WHERE is_active=1 ORDER BY sort_order LIMIT 1")
    conn = get_pg_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("INSERT INTO applications (requisition_id, candidate_id, stage_id, recruiter_id) VALUES (%s,%s,%s,%s) RETURNING id",
               (d['requisition_id'], d['candidate_id'],
                d.get('stage_id', first_stage['id'] if first_stage else None),
                d.get('assigned_to')))
    aid = cur.fetchone()['id']
    conn.close()
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
    db_execute("UPDATE applications SET stage_id=%s, notes=%s, updated_at=NOW() WHERE id=%s",
              (d.get('stage_id', app['stage_id']), d.get('notes', app['notes']), aid))
    write_audit_log('recruitment', 'UPDATE', 'application', aid, f"Application stage updated")
    return ok(message="Updated")

# ── Interviews ─────────────────────────────────────────────────
@rec_bp.route('/interviews', methods=['GET'])
@require_auth
def list_interviews():
    page, per_page = get_page_params()
    rows = db_rows(f"""SELECT i.*,
        c.first_name||' '||c.last_name as candidate_name,
        j.title as job_title, f.name as format_name
        FROM interviews i
        JOIN applications a ON a.id=i.application_id
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions j ON j.id=a.requisition_id
        LEFT JOIN master_interview_formats f ON f.id=i.format_id
        ORDER BY i.scheduled_at DESC LIMIT %s OFFSET %s""",
        [per_page, (page-1)*per_page])
    return ok(rows)

@rec_bp.route('/interviews', methods=['POST'])
@require_auth
def create_interview():
    d = request.get_json() or {}
    try: validate(d, {'application_id':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    fmt = db_row1("SELECT id FROM master_interview_formats WHERE name=%s LIMIT 1",
                 (d.get('format','Video Call'),))
    conn = get_pg_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""INSERT INTO interviews
        (application_id, round, format_id, interviewer, scheduled_at, location_link)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['application_id'], d.get('round', '1'),
         d.get('format_id') or (fmt['id'] if fmt else None),
         d.get('interviewer') or d.get('interviewer_name',''),
         d.get('scheduled_at'), d.get('meeting_link') or d.get('location_link')))
    iid = cur.fetchone()['id']
    conn.close()
    write_audit_log('recruitment', 'CREATE', 'interview', iid, "Interview scheduled")
    return created({'id': iid})

@rec_bp.route('/interviews/<int:iid>', methods=['GET','PUT'])
@require_auth
def interview_detail(iid):
    iv = db_row1("""SELECT i.*,
        c.first_name||' '||c.last_name as candidate_name,
        j.title as job_title, f.name as format_name
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
         d.get('recommendation') or d.get('decision', iv['decision']),
         d.get('feedback') or d.get('notes', iv['notes']),
         d.get('interviewer', iv['interviewer']),
         d.get('scheduled_at', iv['scheduled_at']), iid))
    return ok(message="Updated")

# ── Offers (new table — if not exists, create) ─────────────────
def _ensure_offers_table():
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS offers (
            id SERIAL PRIMARY KEY,
            candidate_id INTEGER NOT NULL REFERENCES candidates(id),
            requisition_id INTEGER NOT NULL REFERENCES job_requisitions(id),
            application_id INTEGER REFERENCES applications(id),
            designation TEXT, joining_date DATE,
            offered_ctc NUMERIC, offered_basic NUMERIC,
            offer_date DATE, expiry_date DATE,
            status TEXT DEFAULT 'Draft',
            rejection_reason TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
            created_by INTEGER)""")
        conn.close()
    except Exception as e:
        print(f"[offers] {e}", flush=True)

@rec_bp.route('/offers', methods=['GET'])
@require_auth
def list_offers():
    _ensure_offers_table()
    try:
        rows = db_rows("""SELECT o.*, c.first_name||' '||c.last_name as candidate_name,
            j.title as job_title FROM offers o
            JOIN candidates c ON c.id=o.candidate_id
            JOIN job_requisitions j ON j.id=o.requisition_id
            ORDER BY o.created_at DESC""")
        return ok(rows)
    except Exception: return ok([])

@rec_bp.route('/offers', methods=['POST'])
@require_auth
def create_offer():
    _ensure_offers_table()
    d = request.get_json() or {}
    try: validate(d, {'candidate_id':['required'],'requisition_id':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO offers
        (candidate_id, requisition_id, application_id, designation, joining_date,
         offered_ctc, offered_basic, offer_date, expiry_date, status, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['candidate_id'], d['requisition_id'], d.get('application_id'),
         d.get('designation'), d.get('joining_date'), d.get('offered_ctc'),
         d.get('offered_basic'), d.get('offer_date'), d.get('expiry_date'),
         d.get('status','Draft'), g.user['id']), returning=True)
    write_audit_log('recruitment', 'CREATE', 'offer', result['id'], "Offer created")
    return created({'id': result['id']})

@rec_bp.route('/offers/<int:oid>', methods=['GET','PUT'])
@require_auth
def offer_detail(oid):
    _ensure_offers_table()
    offer = db_row1("""SELECT o.*, c.first_name||' '||c.last_name as candidate_name,
        j.title as job_title FROM offers o
        JOIN candidates c ON c.id=o.candidate_id
        JOIN job_requisitions j ON j.id=o.requisition_id
        WHERE o.id=%s""", (oid,))
    if not offer: return not_found("Offer")
    if request.method == 'GET': return ok(offer)
    d = request.get_json() or {}
    db_execute("UPDATE offers SET status=%s, offered_ctc=%s, joining_date=%s, rejection_reason=%s, updated_at=NOW() WHERE id=%s",
              (d.get('status', offer['status']), d.get('offered_ctc', offer['offered_ctc']),
               d.get('joining_date', offer['joining_date']), d.get('rejection_reason'), oid))
    return ok(message="Updated")

# ── Onboarding ─────────────────────────────────────────────────
@rec_bp.route('/onboarding', methods=['GET'])
@require_auth
def list_onboarding():
    rows = db_rows("""SELECT o.*, e.first_name||' '||e.last_name as employee_name,
        e.emp_id, e.job_title
        FROM onboarding o
        JOIN employees e ON e.id=o.employee_id
        ORDER BY o.start_date DESC""")
    return ok(rows)

@rec_bp.route('/onboarding/<int:oid>', methods=['GET','PUT'])
@require_auth
def onboarding_detail(oid):
    onb = db_row1("""SELECT o.*, e.first_name||' '||e.last_name as employee_name
        FROM onboarding o LEFT JOIN employees e ON e.id=o.employee_id
        WHERE o.id=%s""", (oid,))
    if not onb: return not_found("Onboarding")
    if request.method == 'GET':
        onb['tasks'] = db_rows("SELECT * FROM onboarding_tasks WHERE onboarding_id=%s ORDER BY id", (oid,))
        return ok(onb)
    d = request.get_json() or {}
    db_execute("UPDATE onboarding SET status=%s, progress_pct=%s WHERE id=%s",
              (d.get('status', onb['status']), d.get('progress_pct', onb['progress_pct']), oid))
    return ok(message="Updated")

@rec_bp.route('/onboarding/tasks/<int:tid>', methods=['PUT'])
@require_auth
def toggle_task(tid):
    d = request.get_json() or {}
    done = d.get('status') == 'Completed' or d.get('completed', False)
    db_execute("UPDATE onboarding_tasks SET is_complete=%s, completed_at=%s WHERE id=%s",
              (1 if done else 0, 'NOW()' if done else None, tid))
    return ok(message="Updated")

# ── Stats ──────────────────────────────────────────────────────
@rec_bp.route('/recruitment/stats')
@require_auth
def recruitment_stats():
    return ok({
        'open_jobs':     db_row1("SELECT COUNT(*) as n FROM job_requisitions WHERE is_active=1 AND status='Active'")['n'],
        'total_candidates': db_row1("SELECT COUNT(*) as n FROM candidates WHERE is_active=1")['n'],
        'interviews_today': db_row1("SELECT COUNT(*) as n FROM interviews WHERE DATE(scheduled_at)=CURRENT_DATE")['n'],
        'offers_pending':   0,
        'onboarding_pending': db_row1("SELECT COUNT(*) as n FROM onboarding WHERE status='In Progress'")['n'],
        'pipeline_by_stage': db_rows("""SELECT s.name as stage, COUNT(a.id) as count
            FROM master_application_stages s
            LEFT JOIN applications a ON a.stage_id=s.id
            GROUP BY s.id, s.name ORDER BY s.sort_order"""),
    })
