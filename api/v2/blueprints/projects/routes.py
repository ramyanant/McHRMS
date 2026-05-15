"""Projects Blueprint — full project lifecycle with resources, milestones, risks"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err, created, not_found
from ...utils.validators import validate, ValidationError
from ...utils.pagination import get_page_params

projects_bp = Blueprint('projects', __name__, url_prefix='/api/v1')

def _ensure_projects():
    """Ensure project tables exist (created dynamically in v1)."""
    try:
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY, project_code TEXT UNIQUE, name TEXT NOT NULL,
            short_name TEXT, project_type TEXT DEFAULT 'T&M', category TEXT,
            description TEXT, status TEXT DEFAULT 'Draft', priority TEXT DEFAULT 'Medium',
            client_id INTEGER REFERENCES clients(id), account_manager_id INTEGER REFERENCES employees(id),
            project_manager_id INTEGER REFERENCES employees(id), department_id INTEGER REFERENCES departments(id),
            business_unit_id INTEGER REFERENCES business_units(id), cost_centre_id INTEGER REFERENCES cost_centres(id),
            start_date DATE, end_date DATE, go_live_date DATE, budget NUMERIC DEFAULT 0,
            budget_currency TEXT DEFAULT 'INR', estimated_revenue NUMERIC DEFAULT 0,
            billing_type TEXT DEFAULT 'T&M', billing_cycle TEXT DEFAULT 'Monthly',
            rate_card TEXT, po_number TEXT, contract_value NUMERIC DEFAULT 0,
            sow_reference TEXT, health_score INTEGER DEFAULT 80, completion_pct INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS project_resources (
            id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
            employee_id INTEGER NOT NULL REFERENCES employees(id), role TEXT,
            allocation_pct INTEGER DEFAULT 100, bill_rate NUMERIC DEFAULT 0, cost_rate NUMERIC DEFAULT 0,
            start_date DATE, end_date DATE, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS project_milestones (
            id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
            title TEXT NOT NULL, description TEXT, due_date DATE, completion_date DATE,
            status TEXT DEFAULT 'Pending', deliverable TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS project_risks (
            id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
            title TEXT NOT NULL, description TEXT, probability TEXT DEFAULT 'Medium',
            impact TEXT DEFAULT 'Medium', mitigation TEXT, status TEXT DEFAULT 'Open',
            owner_id INTEGER REFERENCES employees(id), is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
        )""")
        conn.close()
    except Exception as e:
        print(f"[projects] table ensure: {e}", flush=True)

@projects_bp.route('/projects', methods=['GET'])
@require_auth
def list_projects():
    _ensure_projects()
    page, per_page = get_page_params()
    status    = request.args.get('status', '')
    client_id = request.args.get('client_id', '')
    search    = request.args.get('q', '')
    where, params = ["p.is_active=1"], []
    if status:    where.append("p.status=%s");    params.append(status)
    if client_id: where.append("p.client_id=%s"); params.append(client_id)
    if search:
        where.append("(p.name ILIKE %s OR p.project_code ILIKE %s)")
        params += [f'%{search}%']*2
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM projects p WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT p.*, c.name as client_name,
        pm.first_name||' '||pm.last_name as pm_name,
        am.first_name||' '||am.last_name as am_name,
        (SELECT COUNT(*) FROM project_resources pr WHERE pr.project_id=p.id AND pr.is_active=1) as resource_count
        FROM projects p
        LEFT JOIN clients c ON c.id=p.client_id
        LEFT JOIN employees pm ON pm.id=p.project_manager_id
        LEFT JOIN employees am ON am.id=p.account_manager_id
        WHERE {clause} ORDER BY p.updated_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@projects_bp.route('/projects', methods=['POST'])
@require_auth
def create_project():
    _ensure_projects()
    d = request.get_json() or {}
    try: validate(d, {'name': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    # Auto-generate project code
    last = db_row1("SELECT project_code FROM projects WHERE project_code LIKE 'PRJ-%' ORDER BY id DESC LIMIT 1")
    code = f"PRJ-{(int(last['project_code'].split('-')[1])+1):04d}" if last and last['project_code'] else "PRJ-0001"
    conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
    cur.execute("""INSERT INTO projects
        (project_code, name, short_name, project_type, category, description, status, priority,
         client_id, account_manager_id, project_manager_id, department_id, business_unit_id,
         cost_centre_id, start_date, end_date, go_live_date, budget, budget_currency,
         estimated_revenue, billing_type, billing_cycle, rate_card, po_number,
         contract_value, sow_reference, health_score)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (code, d['name'], d.get('short_name'), d.get('project_type','T&M'), d.get('category'),
         d.get('description'), d.get('status','Draft'), d.get('priority','Medium'),
         d.get('client_id'), d.get('account_manager_id'), d.get('project_manager_id'),
         d.get('department_id'), d.get('business_unit_id'), d.get('cost_centre_id'),
         d.get('start_date'), d.get('end_date'), d.get('go_live_date'),
         d.get('budget',0), d.get('budget_currency','INR'), d.get('estimated_revenue',0),
         d.get('billing_type','T&M'), d.get('billing_cycle','Monthly'),
         d.get('rate_card'), d.get('po_number'), d.get('contract_value',0),
         d.get('sow_reference'), d.get('health_score',80)))
    pid = cur.fetchone()['id']; conn.close()
    write_audit_log('projects', 'CREATE', 'project', pid, f"Project created: {d['name']}")
    return created({'id': pid, 'code': code})

@projects_bp.route('/projects/<int:pid>', methods=['GET','PUT','DELETE'])
@require_auth
def project_detail(pid):
    _ensure_projects()
    proj = db_row1("""SELECT p.*, c.name as client_name,
        pm.first_name||' '||pm.last_name as pm_name,
        am.first_name||' '||am.last_name as am_name,
        d.name as department_name, b.name as bu_name
        FROM projects p
        LEFT JOIN clients c ON c.id=p.client_id
        LEFT JOIN employees pm ON pm.id=p.project_manager_id
        LEFT JOIN employees am ON am.id=p.account_manager_id
        LEFT JOIN departments d ON d.id=p.department_id
        LEFT JOIN business_units b ON b.id=p.business_unit_id
        WHERE p.id=%s AND p.is_active=1""", (pid,))
    if not proj: return not_found("Project")
    if request.method == 'GET':
        proj['resources']   = db_rows("""SELECT pr.*, e.first_name||' '||e.last_name as employee_name,
            e.emp_id, e.job_title FROM project_resources pr
            JOIN employees e ON e.id=pr.employee_id WHERE pr.project_id=%s AND pr.is_active=1""", (pid,))
        proj['milestones']  = db_rows("SELECT * FROM project_milestones WHERE project_id=%s AND is_active=1 ORDER BY due_date", (pid,))
        proj['risks']       = db_rows("SELECT * FROM project_risks WHERE project_id=%s AND is_active=1", (pid,))
        proj['timesheets']  = db_rows("""SELECT t.*, e.first_name||' '||e.last_name as employee_name,
            s.name as status FROM timesheets t
            LEFT JOIN employees e ON e.id=t.employee_id
            LEFT JOIN master_timesheet_statuses s ON s.id=t.status_id
            WHERE t.project=%s ORDER BY t.week_ending DESC LIMIT 20""", (proj['name'],))
        return ok(proj)
    if request.method == 'PUT':
        d = request.get_json() or {}
        fields = ['name','short_name','project_type','category','description','status','priority',
                  'client_id','account_manager_id','project_manager_id','department_id',
                  'business_unit_id','cost_centre_id','start_date','end_date','go_live_date',
                  'budget','estimated_revenue','billing_type','billing_cycle','rate_card',
                  'po_number','contract_value','sow_reference','health_score','completion_pct']
        updates = {k: d[k] for k in fields if k in d}
        if updates:
            sc = ', '.join(f"{k}=%s" for k in updates)
            db_execute(f"UPDATE projects SET {sc}, updated_at=NOW() WHERE id=%s", list(updates.values())+[pid])
        write_audit_log('projects','UPDATE','project',pid,f"Project updated: {proj['name']}")
        return ok(message="Updated")
    db_execute("UPDATE projects SET is_active=0, updated_at=NOW() WHERE id=%s", (pid,))
    return ok(message="Deleted")

# Resources
@projects_bp.route('/projects/<int:pid>/resources', methods=['POST'])
@require_auth
def add_resource(pid):
    _ensure_projects()
    d = request.get_json() or {}
    try: validate(d, {'employee_id': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    # Check not already on project
    existing = db_row1("SELECT id FROM project_resources WHERE project_id=%s AND employee_id=%s AND is_active=1", (pid, d['employee_id']))
    if existing: return err("Employee already on this project")
    result = db_execute("""INSERT INTO project_resources (project_id, employee_id, role, allocation_pct, bill_rate, cost_rate, start_date, end_date)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (pid, d['employee_id'], d.get('role'), d.get('allocation_pct',100),
         d.get('bill_rate',0), d.get('cost_rate',0), d.get('start_date'), d.get('end_date')), returning=True)
    return created({'id': result['id']})

@projects_bp.route('/projects/resources/<int:rid>', methods=['PUT','DELETE'])
@require_auth
def manage_resource(rid):
    if request.method == 'DELETE':
        db_execute("UPDATE project_resources SET is_active=0 WHERE id=%s", (rid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("UPDATE project_resources SET role=%s, allocation_pct=%s, bill_rate=%s, end_date=%s WHERE id=%s",
              (d.get('role'), d.get('allocation_pct',100), d.get('bill_rate',0), d.get('end_date'), rid))
    return ok(message="Updated")

# Milestones
@projects_bp.route('/projects/<int:pid>/milestones', methods=['POST'])
@require_auth
def add_milestone(pid):
    _ensure_projects()
    d = request.get_json() or {}
    try: validate(d, {'title': ['required']})
    except ValidationError as e: return err("Validation failed", 400, e.errors)
    result = db_execute("""INSERT INTO project_milestones (project_id, title, description, due_date, status, deliverable)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
        (pid, d['title'], d.get('description'), d.get('due_date'), d.get('status','Pending'), d.get('deliverable')), returning=True)
    return created({'id': result['id']})

@projects_bp.route('/projects/milestones/<int:mid>', methods=['PUT','DELETE'])
@require_auth
def manage_milestone(mid):
    if request.method == 'DELETE':
        db_execute("UPDATE project_milestones SET is_active=0 WHERE id=%s", (mid,))
        return ok(message="Removed")
    d = request.get_json() or {}
    db_execute("UPDATE project_milestones SET title=%s, status=%s, due_date=%s, completion_date=%s WHERE id=%s",
              (d.get('title'), d.get('status'), d.get('due_date'), d.get('completion_date'), mid))
    return ok(message="Updated")

# Lookup
@projects_bp.route('/lookup/projects')
@require_auth
def lookup_projects():
    _ensure_projects()
    return ok(db_rows("SELECT id, project_code, name FROM projects WHERE is_active=1 ORDER BY name"))
