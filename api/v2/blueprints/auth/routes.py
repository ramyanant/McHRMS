"""
Authentication Blueprint
Handles: login, logout, me, change-password, forgot-password
"""
from flask import Blueprint, request, g
from datetime import datetime
from ...extensions import db_row1, db_execute
from ...middleware.auth import (
    verify_password, hash_password, create_session, invalidate_session
)
from ...middleware.audit import write_audit_log
from ...utils.responses import ok, err
from ...utils.validators import validate, ValidationError

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate user and return session token."""
    d = request.get_json() or {}
    
    try:
        validate(d, {
            'username': ['required'],
            'password': ['required'],
        })
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)
    
    username = d['username'].strip()
    password = d['password']
    
    # Check for account lockout
    user = db_row1("""
        SELECT u.*, r.name as role_name
        FROM users u
        JOIN master_user_roles r ON r.id = u.role_id
        WHERE (u.username = %s OR u.email = %s)
    """, (username, username))
    
    if not user:
        return err("Invalid username or password.", 401)
    
    if not user['is_active']:
        return err("Account is inactive. Contact your administrator.", 403)
    
    # Check lockout
    if user.get('locked_until') and user['locked_until'] > datetime.utcnow():
        return err("Account temporarily locked due to too many failed attempts. Try again later.", 429)
    
    # Verify password
    if not verify_password(password, user['password_hash']):
        # Increment failed attempts
        attempts = (user.get('login_attempts') or 0) + 1
        lockout_sql = ""
        params = [attempts, user['id']]
        
        if attempts >= 5:
            lockout_sql = ", locked_until = NOW() + INTERVAL '15 minutes', login_attempts = 0"
            params = [attempts, user['id']]
        
        db_execute(
            f"UPDATE users SET login_attempts = %s{lockout_sql} WHERE id = %s",
            params
        )
        
        write_audit_log('auth', 'LOGIN_FAILED', 'user', user['id'],
                        f"Failed login attempt for {username}")
        
        if attempts >= 5:
            return err("Too many failed attempts. Account locked for 15 minutes.", 429)
        return err("Invalid username or password.", 401)
    
    # Auto-upgrade legacy unsalted hash
    if not user['password_hash'].startswith('$2') and not user['password_hash'].startswith('sha256:'):
        new_hash = hash_password(password)
        db_execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user['id']))
    
    # Reset login attempts on success
    db_execute("UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = %s", (user['id'],))
    
    # Create session
    token = create_session(
        user['id'],
        request.remote_addr,
        request.headers.get('User-Agent', ''),
    )
    
    # Get employee info if linked
    emp = None
    if user['employee_id']:
        emp = db_row1(
            "SELECT emp_id, reporting_manager_id FROM employees WHERE id = %s",
            (user['employee_id'],)
        )
    
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
            "must_change_pwd": bool(user['must_change_pwd']),
            "emp":            emp,
        }
    })


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Invalidate current session."""
    token = request.headers.get('X-Auth-Token')
    if token:
        invalidate_session(token)
        # Get user for audit
        user = getattr(g, 'user', None)
        if user:
            write_audit_log('auth', 'LOGOUT', 'user', user['id'], f"Logout: {user['username']}")
    return ok(message="Logged out")


@auth_bp.route('/me')
def me():
    """Return current authenticated user info."""
    from ...middleware.auth import get_current_user
    user = get_current_user()
    if not user:
        return err("Not authenticated", 401)
    
    emp = None
    if user.get('employee_id'):
        emp = db_row1(
            "SELECT emp_id, reporting_manager_id FROM employees WHERE id = %s",
            (user['employee_id'],)
        )
    
    return ok({
        "id":          user['id'],
        "username":    user['username'],
        "email":       user['email'],
        "full_name":   user['full_name'],
        "role":        user['role'],
        "role_id":     user['role_id'],
        "employee_id": user['employee_id'],
        "emp":         emp,
    })


@auth_bp.route('/change-password', methods=['POST'])
def change_password():
    """Change password for authenticated user."""
    from ...middleware.auth import get_current_user, require_auth
    user = get_current_user()
    if not user:
        return err("Not authenticated", 401)
    
    d = request.get_json() or {}
    try:
        validate(d, {
            'current_password': ['required'],
            'new_password':     ['required', 'min:8'],
        })
    except ValidationError as e:
        return err("Validation failed", 400, e.errors)
    
    stored = db_row1("SELECT password_hash FROM users WHERE id = %s", (user['id'],))
    if not stored or not verify_password(d['current_password'], stored['password_hash']):
        return err("Current password is incorrect.", 400)
    
    new_hash = hash_password(d['new_password'])
    db_execute(
        "UPDATE users SET password_hash = %s, must_change_pwd = FALSE WHERE id = %s",
        (new_hash, user['id'])
    )
    
    write_audit_log('auth', 'PASSWORD_CHANGED', 'user', user['id'], "Password changed")
    return ok(message="Password changed successfully")
