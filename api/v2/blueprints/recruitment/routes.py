"""Recruitment / Talent Acquisition Blueprint"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

rec_bp = Blueprint('recruitment', __name__, url_prefix='/api/v1')

def _req_code():
    last = db_row1("SELECT code FROM job_requisitions ORDER BY id DESC LIMIT 1")
    if last and last['code']:
        try: return f"JR-{int(last['code'].split('-')[1])+1:04d}"
        except: pass
    return "JR-0001"

# ── Job Requisitions ──────────────────────────────────────────
@rec_bp.route('/recruitment/jobs', methods=['GET'])
@require_auth
def list_jobs():
    page, per_page = get_page_params()
    status   = request.args.get('status','')
    client   = request.args.get('client_id','')
    where, params = ["1=1"], []
    if status: where.append("j.status=%s"); params.append(status)
    if client: where.append("j.client_id=%s"); params.append(client)
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM job_requisitions j WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT j.*, c.name as client_name, d.name as department_name,
        p.name as priority_name, e.first_name||' '||e.last_name as assigned_to_name,
        COUNT(a.id) as application_count
        FROM job_requisitions j
        LEFT JOIN clients c ON c.id=j.client_id
        LEFT JOIN departments d ON d.id=j.department_id
        LEFT JOIN master_priority_levels p ON p.id=j.priority_id
        LEFT JOIN employees e ON e.id=j.assigned_to
        LEFT JOIN applications a ON a.requisition_id=j.id
        WHERE {clause} GROUP BY j.id, c.name, d.name, p.name, e.first_name, e.last_name
        ORDER BY j.created_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@rec_bp.route('/recruitment/jobs', methods=['POST'])
@require_auth
def create_job():
    d = request.get_json() or {}
    try: validate(d, {'title': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    code = _req_code()
    result = db_execute("""INSERT INTO job_requisitions
        (code, title, department_id, client_id, project_id, employment_type_id,
         positions, min_experience, max_experience, min_salary, max_salary,
         location, description, requirements, priority_id, status, target_date,
         raised_by, assigned_to, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (code, d['title'], d.get('department_id'), d.get('client_id'), d.get('project_id'),
         d.get('employment_type_id'), d.get('positions',1),
         d.get('min_experience'), d.get('max_experience'),
         d.get('min_salary'), d.get('max_salary'), d.get('location'),
         d.get('description'), d.get('requirements'), d.get('priority_id'),
         d.get('status','Open'), d.get('target_date'),
         d.get('raised_by'), d.get('assigned_to'), g.user['id']), returning=True)
    write_audit_log('recruitment', 'CREATE', 'job_requisition', result['id'], f"Job created: {d['title']}")
    return created({'id': result['id'], 'code': code})

@rec_bp.route('/recruitment/jobs/<int:rid>', methods=['GET','PUT','DELETE'])
@require_auth
def job_detail(rid):
    job = db_row1("""SELECT j.*, c.name as client_name, d.name as department_name,
        e.first_name||' '||e.last_name as assigned_to_name
        FROM job_requisitions j
        LEFT JOIN clients c ON c.id=j.client_id
        LEFT JOIN departments d ON d.id=j.department_id
        LEFT JOIN employees e ON e.id=j.assigned_to
        WHERE j.id=%s AND j.deleted_at IS NULL""", (rid,))
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
        fields = ['title','status','positions','target_date','description','requirements',
                  'assigned_to','priority_id','min_salary','max_salary','location']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE job_requisitions SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [rid])
        write_audit_log('recruitment', 'UPDATE', 'job_requisition', rid, f"Job updated: {job['title']}")
        return ok(message="Updated")
    db_execute("UPDATE job_requisitions SET deleted_at=NOW() WHERE id=%s", (rid,))
    return ok(message="Deleted")

# ── Candidates ────────────────────────────────────────────────
@rec_bp.route('/candidates', methods=['GET'])
@require_auth
def list_candidates():
    page, per_page = get_page_params()
    search = request.args.get('q','')
    where, params = ["c.deleted_at IS NULL"], []
    if search:
        where.append("(c.first_name ILIKE %s OR c.last_name ILIKE %s OR c.email ILIKE %s)")
        params += [f'%{search}%']*3
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM candidates c WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT c.*, s.name as source_name
        FROM candidates c LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        WHERE {clause} ORDER BY c.created_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@rec_bp.route('/candidates', methods=['POST'])
@require_auth
def create_candidate():
    d = request.get_json() or {}
    try: validate(d, {'first_name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO candidates
        (first_name, last_name, email, phone, current_location, current_company,
         current_designation, total_experience, current_ctc, expected_ctc,
         notice_period, skills, linkedin_url, source_id, referred_by, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['first_name'], d.get('last_name'), d.get('email'), d.get('phone'),
         d.get('current_location'), d.get('current_company'), d.get('current_designation'),
         d.get('total_experience'), d.get('current_ctc'), d.get('expected_ctc'),
         d.get('notice_period'), d.get('skills'), d.get('linkedin_url'),
         d.get('source_id'), d.get('referred_by'), g.user['id']), returning=True)
    write_audit_log('recruitment', 'CREATE', 'candidate', result['id'],
                    f"Candidate added: {d['first_name']} {d.get('last_name','')}")
    return created({'id': result['id']})

@rec_bp.route('/candidates/<int:cid>', methods=['GET','PUT','DELETE'])
@require_auth
def candidate_detail(cid):
    cand = db_row1("""SELECT c.*, s.name as source_name
        FROM candidates c LEFT JOIN master_candidate_sources s ON s.id=c.source_id
        WHERE c.id=%s AND c.deleted_at IS NULL""", (cid,))
    if not cand: return not_found("Candidate")
    if request.method == 'GET':
        cand['applications'] = db_rows("""SELECT a.*, j.title as job_title, j.code,
            s.name as stage_name FROM applications a
            JOIN job_requisitions j ON j.id=a.requisition_id
            LEFT JOIN master_application_stages s ON s.id=a.stage_id
            WHERE a.candidate_id=%s ORDER BY a.applied_at DESC""", (cid,))
        cand['interviews'] = db_rows("""SELECT i.*,
            e.first_name||' '||e.last_name as interviewer_name,
            f.name as format_name
            FROM interviews i
            LEFT JOIN employees e ON e.id=i.interviewer_id
            LEFT JOIN master_interview_formats f ON f.id=i.format_id
            WHERE i.candidate_id=%s ORDER BY i.scheduled_at DESC""", (cid,))
        return ok(cand)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['first_name','last_name','email','phone','current_location','current_company',
                  'current_designation','total_experience','current_ctc','expected_ctc',
                  'notice_period','skills','linkedin_url','source_id','status','rating','notes']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            set_clause = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE candidates SET {set_clause}, updated_at=NOW() WHERE id=%s",
                      list(updates.values()) + [cid])
        return ok(message="Updated")
    db_execute("UPDATE candidates SET deleted_at=NOW() WHERE id=%s", (cid,))
    return ok(message="Deleted")

# ── Pipeline ──────────────────────────────────────────────────
@rec_bp.route('/recruitment/pipeline', methods=['GET'])
@require_auth
def pipeline():
    """Kanban-style pipeline: stages with candidate cards."""
    rid = request.args.get('requisition_id')
    where, params = [], []
    if rid: where.append("a.requisition_id=%s"); params.append(rid)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db_rows(f"""SELECT a.id, a.requisition_id, a.candidate_id, a.status, a.notes,
        a.stage_id, s.name as stage_name, s.color as stage_color, s.order_seq,
        c.first_name||' '||c.last_name as candidate_name, c.email, c.phone,
        c.current_designation, c.total_experience, c.expected_ctc, c.notice_period,
        j.title as job_title, j.code as job_code
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        JOIN job_requisitions j ON j.id=a.requisition_id
        LEFT JOIN master_application_stages s ON s.id=a.stage_id
        {clause} ORDER BY s.order_seq, a.applied_at""", params)
    stages = db_rows("SELECT * FROM master_application_stages ORDER BY order_seq")
    return ok({'stages': stages, 'applications': rows})

@rec_bp.route('/applications', methods=['POST'])
@require_auth
def create_application():
    d = request.get_json() or {}
    try: validate(d, {'requisition_id':['required'], 'candidate_id':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    first_stage = db_row1("SELECT id FROM master_application_stages ORDER BY order_seq LIMIT 1")
    result = db_execute("""INSERT INTO applications (requisition_id, candidate_id, stage_id, assigned_to)
        VALUES (%s,%s,%s,%s) RETURNING id""",
        (d['requisition_id'], d['candidate_id'],
         d.get('stage_id', first_stage['id'] if first_stage else None),
         d.get('assigned_to')), returning=True)
    write_audit_log('recruitment', 'CREATE', 'application', result['id'],
                    f"Application created for candidate {d['candidate_id']}")
    return created({'id': result['id']})

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
    db_execute("UPDATE applications SET stage_id=%s, status=%s, notes=%s, updated_at=NOW() WHERE id=%s",
              (d.get('stage_id', app['stage_id']), d.get('status', app['status']),
               d.get('notes', app['notes']), aid))
    write_audit_log('recruitment', 'UPDATE', 'application', aid,
                    f"Application stage changed: {app['stage_name']} -> {d.get('status',app['status'])}")
    return ok(message="Updated")

# ── Interviews ─────────────────────────────────────────────────
@rec_bp.route('/interviews', methods=['GET'])
@require_auth
def list_interviews():
    page, per_page = get_page_params()
    status = request.args.get('status','')
    where, params = ["1=1"], []
    if status: where.append("i.status=%s"); params.append(status)
    clause = " AND ".join(where)
    rows = db_rows(f"""SELECT i.*,
        c.first_name||' '||c.last_name as candidate_name, c.phone as candidate_phone,
        j.title as job_title, j.code as job_code,
        e.first_name||' '||e.last_name as interviewer_name,
        f.name as format_name
        FROM interviews i
        JOIN candidates c ON c.id=i.candidate_id
        LEFT JOIN job_requisitions j ON j.id=i.requisition_id
        LEFT JOIN employees e ON e.id=i.interviewer_id
        LEFT JOIN master_interview_formats f ON f.id=i.format_id
        WHERE {clause} ORDER BY i.scheduled_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok(rows)

@rec_bp.route('/interviews', methods=['POST'])
@require_auth
def create_interview():
    d = request.get_json() or {}
    try: validate(d, {'candidate_id':['required'], 'scheduled_at':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO interviews
        (application_id, requisition_id, candidate_id, interviewer_id, format_id,
         round, scheduled_at, duration_mins, location, meeting_link, status, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d.get('application_id'), d.get('requisition_id'), d['candidate_id'],
         d.get('interviewer_id'), d.get('format_id'), d.get('round',1),
         d['scheduled_at'], d.get('duration_mins',60), d.get('location'),
         d.get('meeting_link'), d.get('status','Scheduled'), g.user['id']), returning=True)
    write_audit_log('recruitment', 'CREATE', 'interview', result['id'], "Interview scheduled")
    return created({'id': result['id']})

@rec_bp.route('/interviews/<int:iid>', methods=['GET','PUT'])
@require_auth
def interview_detail(iid):
    iv = db_row1("""SELECT i.*, c.first_name||' '||c.last_name as candidate_name,
        e.first_name||' '||e.last_name as interviewer_name, f.name as format_name
        FROM interviews i
        JOIN candidates c ON c.id=i.candidate_id
        LEFT JOIN employees e ON e.id=i.interviewer_id
        LEFT JOIN master_interview_formats f ON f.id=i.format_id
        WHERE i.id=%s""", (iid,))
    if not iv: return not_found("Interview")
    if request.method == 'GET': return ok(iv)
    d = request.get_json() or {}
    db_execute("""UPDATE interviews SET status=%s, overall_rating=%s, feedback=%s,
        recommendation=%s, completed_at=%s, updated_at=NOW() WHERE id=%s""",
        (d.get('status',iv['status']), d.get('overall_rating',iv['overall_rating']),
         d.get('feedback',iv['feedback']), d.get('recommendation',iv['recommendation']),
         d.get('completed_at',iv['completed_at']), iid))
    write_audit_log('recruitment', 'UPDATE', 'interview', iid,
                    f"Interview updated: status={d.get('status')}")
    return ok(message="Updated")

# ── Offers ─────────────────────────────────────────────────────
@rec_bp.route('/offers', methods=['GET'])
@require_auth
def list_offers():
    rows = db_rows("""SELECT o.*, c.first_name||' '||c.last_name as candidate_name,
        j.title as job_title, j.code as job_code
        FROM offers o
        JOIN candidates c ON c.id=o.candidate_id
        JOIN job_requisitions j ON j.id=o.requisition_id
        ORDER BY o.created_at DESC""")
    return ok(rows)

@rec_bp.route('/offers', methods=['POST'])
@require_auth
def create_offer():
    d = request.get_json() or {}
    try: validate(d, {'candidate_id':['required'],'requisition_id':['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO offers
        (candidate_id, requisition_id, application_id, designation, department_id,
         joining_date, offered_ctc, offered_basic, offered_hra, offered_allowances,
         employment_type_id, offer_date, expiry_date, status, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (d['candidate_id'], d['requisition_id'], d.get('application_id'),
         d.get('designation'), d.get('department_id'), d.get('joining_date'),
         d.get('offered_ctc'), d.get('offered_basic'), d.get('offered_hra'),
         d.get('offered_allowances'), d.get('employment_type_id'),
         d.get('offer_date'), d.get('expiry_date'), d.get('status','Draft'),
         g.user['id']), returning=True)
    write_audit_log('recruitment', 'CREATE', 'offer', result['id'], "Offer created")
    return created({'id': result['id']})

@rec_bp.route('/offers/<int:oid>', methods=['GET','PUT'])
@require_auth
def offer_detail(oid):
    offer = db_row1("""SELECT o.*, c.first_name||' '||c.last_name as candidate_name,
        j.title as job_title FROM offers o
        JOIN candidates c ON c.id=o.candidate_id
        JOIN job_requisitions j ON j.id=o.requisition_id
        WHERE o.id=%s""", (oid,))
    if not offer: return not_found("Offer")
    if request.method == 'GET': return ok(offer)
    d = request.get_json() or {}
    new_status = d.get('status', offer['status'])
    db_execute("""UPDATE offers SET status=%s, offered_ctc=%s, joining_date=%s,
        expiry_date=%s, rejection_reason=%s, updated_at=NOW() WHERE id=%s""",
        (new_status, d.get('offered_ctc',offer['offered_ctc']),
         d.get('joining_date',offer['joining_date']),
         d.get('expiry_date',offer['expiry_date']),
         d.get('rejection_reason'), oid))
    write_audit_log('recruitment', 'UPDATE', 'offer', oid,
                    f"Offer status: {offer['status']} -> {new_status}")
    return ok(message="Updated")

# ── Onboarding ─────────────────────────────────────────────────
@rec_bp.route('/onboarding', methods=['GET'])
@require_auth
def list_onboarding():
    rows = db_rows("""SELECT o.*,
        c.first_name||' '||c.last_name as candidate_name,
        e.first_name||' '||e.last_name as employee_name,
        j.title as job_title
        FROM onboarding o
        LEFT JOIN candidates c ON c.id=o.candidate_id
        LEFT JOIN employees e ON e.id=o.employee_id
        LEFT JOIN job_requisitions j ON j.id=o.requisition_id
        ORDER BY o.joining_date""")
    return ok(rows)

@rec_bp.route('/onboarding/<int:oid>', methods=['GET','PUT'])
@require_auth
def onboarding_detail(oid):
    onb = db_row1("""SELECT o.*, c.first_name||' '||c.last_name as candidate_name
        FROM onboarding o LEFT JOIN candidates c ON c.id=o.candidate_id
        WHERE o.id=%s""", (oid,))
    if not onb: return not_found("Onboarding")
    if request.method == 'GET':
        onb['tasks'] = db_rows("SELECT * FROM onboarding_tasks WHERE onboarding_id=%s ORDER BY id", (oid,))
        return ok(onb)
    d = request.get_json() or {}
    db_execute("UPDATE onboarding SET status=%s, notes=%s, updated_at=NOW() WHERE id=%s",
              (d.get('status', onb['status']), d.get('notes', onb['notes']), oid))
    return ok(message="Updated")

@rec_bp.route('/onboarding/tasks/<int:tid>', methods=['PUT'])
@require_auth
def toggle_task(tid):
    d = request.get_json() or {}
    db_execute("UPDATE onboarding_tasks SET status=%s, completed_at=%s WHERE id=%s",
              (d.get('status','Completed'),
               'NOW()' if d.get('status') == 'Completed' else None, tid))
    return ok(message="Updated")

# ── Recruitment Dashboard Stats ────────────────────────────────
@rec_bp.route('/recruitment/stats')
@require_auth
def recruitment_stats():
    return ok({
        'open_jobs':          db_row1("SELECT COUNT(*) as n FROM job_requisitions WHERE status='Open' AND deleted_at IS NULL")['n'],
        'total_candidates':   db_row1("SELECT COUNT(*) as n FROM candidates WHERE deleted_at IS NULL")['n'],
        'interviews_today':   db_row1("SELECT COUNT(*) as n FROM interviews WHERE DATE(scheduled_at)=CURRENT_DATE")['n'],
        'offers_pending':     db_row1("SELECT COUNT(*) as n FROM offers WHERE status IN ('Sent','Draft')")['n'],
        'onboarding_pending': db_row1("SELECT COUNT(*) as n FROM onboarding WHERE status='Pending'")['n'],
        'pipeline_by_stage':  db_rows("""SELECT s.name as stage, s.color, COUNT(a.id) as count
            FROM master_application_stages s
            LEFT JOIN applications a ON a.stage_id=s.id
            GROUP BY s.id, s.name, s.color ORDER BY s.order_seq"""),
    })
