"""
Authentication middleware.
- Token-based session auth
- Provides g.user on every authenticated request
"""
import hashlib, secrets, os
from functools import wraps
from flask import request, g, jsonify
from datetime import datetime, timedelta
from ..extensions import db_row1, db_execute


def hash_password(password: str) -> str:
    """
    Hash password with bcrypt if available, fallback to salted SHA-256.
    bcrypt is strongly preferred for production.
    """
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    except ImportError:
        # Salted SHA-256 fallback (still better than unsalted)
        salt = secrets.token_hex(16)
        hashed = hashlib.sha256((salt + password).encode()).hexdigest()
        return f"sha256:{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash, supporting both bcrypt and legacy SHA-256."""
    try:
        import bcrypt
        if stored_hash.startswith('$2'):
            return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except ImportError:
        pass
    
    # Legacy SHA-256 with salt
    if stored_hash.startswith('sha256:'):
        _, salt, hashed = stored_hash.split(':', 2)
        return hashlib.sha256((salt + password).encode()).hexdigest() == hashed
    
    # Legacy unsalted SHA-256 (old records — auto-upgrade on next login)
    return hashlib.sha256(password.encode()).hexdigest() == stored_hash


def get_current_user():
    """Extract and validate auth token from request headers."""
    token = (request.headers.get('X-Auth-Token')
             or request.args.get('token')
             or request.cookies.get('mch_token'))
    if not token:
        return None
    
    user = db_row1("""
        SELECT u.id, u.username, u.email, u.full_name, u.employee_id,
               u.must_change_pwd, u.is_active, r.name as role,
               u.role_id, s.expires_at
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        JOIN master_user_roles r ON r.id = u.role_id
        WHERE s.token = %s AND u.is_active = 1 AND s.expires_at > NOW()
    """, (token,))
    
    return user


def require_auth(f):
    """Decorator: require valid session token."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "Authentication required."}), 401
        g.user = user
        return f(*args, **kwargs)
    return wrapper


def require_role(*roles):
    """Decorator: require authenticated user to have one of the given roles."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"success": False, "message": "Authentication required."}), 401
            if user['role'] not in roles and 'Admin' not in roles:
                if user['role'] != 'Admin':
                    return jsonify({"success": False, "message": "Insufficient permissions."}), 403
            g.user = user
            return f(*args, **kwargs)
        return wrapper
    return decorator


def create_session(user_id: int, ip: str, user_agent: str, hours: int = 8) -> str:
    """Create a new session token for a user."""
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=hours)
    db_execute("""
        INSERT INTO user_sessions (user_id, token, ip_address, user_agent, expires_at)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, token, ip, user_agent, expires))
    return token


def invalidate_session(token: str):
    """Delete a session token."""
    db_execute("DELETE FROM user_sessions WHERE token = %s", (token,))
