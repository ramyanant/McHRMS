"""
Flask extensions — instantiated here, initialised in app factory.
Import these everywhere instead of creating new instances.
"""
import psycopg2
import psycopg2.extras
import os
from contextlib import contextmanager

# ─── Database ─────────────────────────────────────────────────────────────────

def get_pg_conn():
    """Open a new PostgreSQL connection."""
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    # Railway/Heroku give postgres:// but psycopg2 needs postgresql://
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn

@contextmanager
def get_db():
    """
    Context manager for database access.
    Provides a connection with automatic commit/rollback.
    
    Usage:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(...)
    """
    conn = get_pg_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def db_rows(sql, params=()):
    """Execute a SELECT and return all rows as list of dicts."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(sql, params if params else None)
        return [dict(r) for r in cur.fetchall()]

def db_row1(sql, params=()):
    """Execute a SELECT and return first row as dict, or None."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(sql, params if params else None)
        r = cur.fetchone()
        return dict(r) if r else None

def db_scalar(sql, params=()):
    """Execute a SELECT and return first value of first row."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(sql, params if params else None)
        r = cur.fetchone()
        return list(dict(r).values())[0] if r else 0

def db_execute(sql, params=(), returning=False):
    """
    Execute INSERT/UPDATE/DELETE.
    If returning=True, returns the first column of the first row (e.g. id).
    """
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(sql, params if params else None)
        if returning:
            r = cur.fetchone()
            return dict(r) if r else None
        return True

def db_execute_many(operations):
    """
    Execute multiple SQL operations in a single transaction.
    operations: list of (sql, params) tuples
    All succeed or all roll back.
    """
    with get_db() as conn:
        cur = conn.cursor()
        results = []
        for sql, params in operations:
            cur.execute(sql, params)
            try:
                r = cur.fetchone()
                results.append(dict(r) if r else None)
            except Exception:
                results.append(None)
        return results
