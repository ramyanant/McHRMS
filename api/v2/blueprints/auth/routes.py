"""Authentication Blueprint — login, logout, me, change-password"""
from flask import Blueprint, request, g
from datetime import datetime
from ...extensions import db_row1, db_execute, get_pg_conn
from ...middleware.auth import (verify_password, hash_password, create_session, invalidate_session)
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err
from ...utils.validators import validate, ValidationError

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v2/auth')


def _ensure_user_columns():
    """Add missing columns to users table using raw autocommit connection."""
    try:
        conn = get_pg_conn()
        conn.autocommit = True  # DDL must run outside transaction
        cur = conn.cursor()
        migrations = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS business_unit_id INTEGER",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_by INTEGER",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by INTEGER",
        ]
        for sql in migrations:
            try:
                cur.execute(sql)
                print(f"[migration] OK: {sql[:60]}", flush=True)
            except Exception as ex:
                print(f"[migration] skip: {ex}", flush=True)
        conn.close()
        print("[migration] Done", flush=True)
    except Exception as e:
        print(f"[auth] migration error: {e}", flush=True)

_columns_ensured = False

def ensure_columns_once():
    global _columns_ensured
    if not _columns_ensured:
        _ensure_user_columns()
        _columns_ensured = True


@auth_bp.route('/login', methods=['POST'])
def login():
    # Ensure columns exist (idempotent, runs only once per process)
    ensure_columns_once()

    d = request.get_json() or {}
    try:
        validate(d, {'username': ['required'], 'password': ['required']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)

    username = d['username'].strip()
    password = d['password']

    user = db_row1("""
        SELECT u.id, u.username, u.email, u.full_name, u.is_active,
               u.password_hash, u.employee_id, u.must_change_pwd,
               u.login_attempts, u.locked_until,
               r.name as role_name, u.role_id
        FROM users u
        JOIN master_user_roles r ON r.id = u.role_id
        WHERE (u.username = %s OR u.email = %s)
    """, (username, username))

    if not user:
        return err("Invalid username or password.", 401)

    # Handle is_active — may be integer (1) or boolean
    is_active = user.get('is_active')
    if is_active is not None and str(is_active) in ('0', 'False', 'false'):
        return err("Account is inactive. Contact your administrator.", 403)

    # Check lockout — column may be None if just added
    locked_until = user.get('locked_until')
    if locked_until and locked_until > datetime.utcnow():
        return err("Account temporarily locked due to too many failed attempts. Try again later.", 429)

    # Verify password
    if not verify_password(password, user['password_hash']):
        attempts = (user.get('login_attempts') or 0) + 1
        try:
            if attempts >= 5:
                db_execute("UPDATE users SET login_attempts=0, locked_until=NOW() + INTERVAL '15 minutes' WHERE id=%s", (user['id'],))
            else:
                db_execute("UPDATE users SET login_attempts=%s WHERE id=%s", (attempts, user['id']))
        except Exception: pass
        write_audit_log('auth', 'LOGIN_FAILED', 'user', user['id'], f"Failed login: {username}")
        if attempts >= 5:
            return err("Too many failed attempts. Account locked for 15 minutes.", 429)
        return err("Invalid username or password.", 401)

    # Reset attempts on success — fallback if columns don't exist yet
    try:
        db_execute("UPDATE users SET login_attempts=0, locked_until=NULL, last_login=NOW() WHERE id=%s", (user['id'],))
    except Exception:
        try:
            db_execute("UPDATE users SET last_login=NOW() WHERE id=%s", (user['id'],))
        except Exception:
            pass

    # Auto-upgrade legacy unsalted hash
    ph = user['password_hash']
    if not ph.startswith('$2') and not ph.startswith('sha256:'):
        try:
            db_execute("UPDATE users SET password_hash=%s WHERE id=%s", (hash_password(password), user['id']))
        except Exception: pass

    token = create_session(user['id'], request.remote_addr, request.headers.get('User-Agent', ''))

    # Employee info
    emp = None
    if user['employee_id']:
        emp = db_row1("SELECT emp_id, reporting_manager_id FROM employees WHERE id=%s", (user['employee_id'],))

    write_audit_log('auth', 'LOGIN', 'user', user['id'], f"Login: {username}")

    return ok({
        "token": token,
        "user": {
            "id":             user['id'],
            "username":       user['username'],
            "email":          user['email'],
            "full_name":      user['full_name'],
            "role":           user['role_name'],
            "role_id":        user['role_id'],
            "employee_id":    user['employee_id'],
            "must_change_pwd": bool(user.get('must_change_pwd')),
            "emp":            emp,
        }
    })


@auth_bp.route('/logout', methods=['POST'])
def logout():
    token = request.headers.get('X-Auth-Token')
    if token:
        invalidate_session(token)
        user = getattr(g, 'user', None)
        if user:
            write_audit_log('auth', 'LOGOUT', 'user', user['id'], f"Logout: {user['username']}")
    return ok(message="Logged out")


@auth_bp.route('/me')
def me():
    from ...middleware.auth import get_current_user
    user = get_current_user()
    if not user:
        return err("Not authenticated", 401)
    emp = None
    if user.get('employee_id'):
        emp = db_row1("SELECT emp_id, reporting_manager_id FROM employees WHERE id=%s", (user['employee_id'],))
    return ok({
        "id": user['id'], "username": user['username'], "email": user['email'],
        "full_name": user['full_name'], "role": user['role'], "role_id": user['role_id'],
        "employee_id": user['employee_id'], "emp": emp,
    })


@auth_bp.route('/change-password', methods=['POST'])
def change_password():
    from ...middleware.auth import get_current_user
    user = get_current_user()
    if not user:
        return err("Not authenticated", 401)
    d = request.get_json() or {}
    try:
        validate(d, {'current_password': ['required'], 'new_password': ['required', 'min:8']})
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)
    stored = db_row1("SELECT password_hash FROM users WHERE id=%s", (user['id'],))
    if not stored or not verify_password(d['current_password'], stored['password_hash']):
        return err("Current password is incorrect.", 400)
    db_execute("UPDATE users SET password_hash=%s, must_change_pwd=FALSE WHERE id=%s",
               (hash_password(d['new_password']), user['id']))
    write_audit_log('auth', 'PASSWORD_CHANGED', 'user', user['id'], "Password changed")
    return ok(message="Password changed successfully")
