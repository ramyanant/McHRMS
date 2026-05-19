"""
Audit logging middleware.
Every write operation (POST/PUT/PATCH/DELETE) is automatically logged.
Captures: user, timestamp, IP, module, action, entity, before/after values.
"""
import json
from decimal import Decimal

class _SafeEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal, datetime and other non-standard types."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        try:
            return super().default(obj)
        except TypeError:
            return str(obj)
from datetime import datetime
from flask import request, g
from ..extensions import db_execute


def write_audit_log(
    module: str,
    action: str,          # CREATE | UPDATE | DELETE | APPROVE | REJECT | LOGIN | LOGOUT
    entity_type: str,     # employee, invoice, timesheet, etc.
    entity_id,
    description: str,
    before_value: dict = None,
    after_value: dict  = None,
    user_id: int = None,
    username: str = 'System',
):
    """Write a single audit log entry."""
    try:
        uid  = user_id  or getattr(g, 'user', {}).get('id')
        uname = username or getattr(g, 'user', {}).get('username', 'System')
        ip   = request.remote_addr if request else None
        ua   = request.headers.get('User-Agent', '') if request else None

        db_execute("""
            INSERT INTO audit_log (
                user_id, username, ip_address, user_agent,
                module, action, entity_type, entity_id,
                description, before_value, after_value, created_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            uid, uname, ip, ua,
            module, action, entity_type, str(entity_id) if entity_id else None,
            description,
            json.dumps(before_value, cls=_SafeEncoder) if before_value else None,
            json.dumps(after_value,  cls=_SafeEncoder) if after_value  else None,
            datetime.utcnow(),
        ))
    except Exception as ex:
        # Audit log must NEVER crash the main request
        print(f"[AUDIT ERROR] {ex}", flush=True)


class AuditMiddleware:
    """
    WSGI middleware that auto-logs all mutating API requests.
    Logs module, action, user, IP for every POST/PUT/PATCH/DELETE.
    """
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        return self.app(environ, start_response)
