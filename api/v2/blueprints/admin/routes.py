"""Admin Blueprint — users, roles, audit logs, system settings"""
from flask import Blueprint, request, g
from ...extensions import db_rows, db_row1, db_execute, get_pg_conn
from ...middleware.auth import require_auth, require_role
from ...utils.responses import ok, err, not_found
from ...utils.pagination import get_page_params

admin_bp = Blueprint('admin', __name__, url_prefix='/api/v2/admin')

@admin_bp.route('/audit-logs')
@require_auth
@require_role('Admin')
def audit_logs():
    page, per_page = get_page_params()
    module      = request.args.get('module','')
    action      = request.args.get('action','')
    entity_type = request.args.get('entity_type','')
    user_id     = request.args.get('user_id','')
    where, params = ["1=1"], []
    if module:      where.append("module=%s");      params.append(module)
    if action:      where.append("action=%s");      params.append(action)
    if entity_type: where.append("entity_type=%s"); params.append(entity_type)
    if user_id:     where.append("user_id=%s");     params.append(user_id)
    clause = " AND ".join(where)
    total  = db_row1(f"SELECT COUNT(*) as n FROM audit_log WHERE {clause}", params)['n']
    rows   = db_rows(f"""SELECT * FROM audit_log WHERE {clause}
        ORDER BY created_at DESC LIMIT %s OFFSET %s""",
        params + [per_page, (page-1)*per_page])
    return ok({"items": rows, "total": total, "page": page, "per_page": per_page,
               "pages": (total+per_page-1)//per_page})

@admin_bp.route('/health')
def health():
    try:
        conn = get_pg_conn(); cur = conn.cursor(); cur.execute("SELECT 1"); conn.close()
        db_ok = True
    except Exception: db_ok = False
    return ok({"db": "connected" if db_ok else "error", "version": "2.0.0"})

@admin_bp.route('/notifications/unread-count')
@require_auth
def unread_count():
    n = db_row1("SELECT COUNT(*) as n FROM notifications WHERE user_id=%s AND is_read=FALSE",
                (g.user['id'],))
    return ok({'count': n['n']})

@admin_bp.route('/notifications')
@require_auth
def notifications():
    rows = db_rows("""SELECT * FROM notifications WHERE user_id=%s
        ORDER BY created_at DESC LIMIT 50""", (g.user['id'],))
    return ok(rows)

@admin_bp.route('/notifications/<int:nid>/read', methods=['PUT'])
@require_auth
def mark_read(nid):
    db_execute("UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE id=%s AND user_id=%s",
              (nid, g.user['id']))
    return ok(message="Marked read")

@admin_bp.route('/notifications/read-all', methods=['PUT'])
@require_auth
def mark_all_read():
    db_execute("UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE user_id=%s AND is_read=FALSE",
              (g.user['id'],))
    return ok(message="All marked read")

@admin_bp.route('/settings')
@require_auth
@require_role('Admin')
def get_settings():
    rows = db_rows("SELECT key, value, description FROM app_settings ORDER BY key")
    return ok({r['key']: r['value'] for r in rows})

@admin_bp.route('/settings', methods=['PUT'])
@require_auth
@require_role('Admin')
def update_settings():
    d = request.get_json() or {}
    for key, value in d.items():
        db_execute("""INSERT INTO app_settings (key, value, updated_by, updated_at)
            VALUES (%s,%s,%s,NOW())
            ON CONFLICT(key) DO UPDATE SET value=%s, updated_by=%s, updated_at=NOW()""",
            (key, str(value), g.user['id'], str(value), g.user['id']))
    return ok(message="Settings saved")


@admin_bp.route('/admin/flush-data', methods=['POST'])
@require_auth
def flush_data():
    """Flush all transactional data — ADMIN ONLY, requires confirmation code."""
    if g.user.get('role') not in ['Admin', 'System Administrator', 'Super Admin']:
        return err("Admin access required", 403)
    d = request.get_json() or {}
    if d.get('confirm') != 'FLUSH-ALL-DATA':
        return err("Invalid confirmation code. Send {confirm: 'FLUSH-ALL-DATA'}", 400)
    try:
        from ...extensions import get_pg_conn
        conn = get_pg_conn(); conn.autocommit = True; cur = conn.cursor()
        # Delete all transactional data, preserve master/config tables
        tables = [
            'payroll_entries', 'payroll_runs',
            'onboarding_tasks', 'onboarding',
            'offers', 'interviews', 'applications',
            'employee_leaves', 'timesheets',
            'invoice_line_items', 'invoices',
            'bills',
            'project_documents', 'project_milestones', 'project_resources', 'projects',
            'vendor_documents', 'vendors',
            'client_documents', 'clients',
            'employee_documents', 'employees',
            'users',
            'candidates', 'job_requisitions',
            'audit_logs',
        ]
        for t in tables:
            try: cur.execute(f"DELETE FROM {t}")
            except Exception as ex: print(f"[flush] skip {t}: {ex}")
        conn.close()
        return ok(message="All data flushed. System ready for fresh start.")
    except Exception as ex:
        return err(str(ex))
