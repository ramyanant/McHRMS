"""Pagination helpers for list endpoints."""
from flask import request

def get_page_params():
    """Extract page, per_page from request args with defaults."""
    page     = max(1, int(request.args.get('page', 1)))
    per_page = min(200, max(5, int(request.args.get('per_page', 25))))
    return page, per_page

def paginate(query_fn, count_fn, page, per_page):
    """
    Execute paginated query.
    query_fn: callable(limit, offset) -> list
    count_fn: callable() -> int
    """
    offset = (page - 1) * per_page
    items  = query_fn(per_page, offset)
    total  = count_fn()
    return {
        "items":      items,
        "total":      total,
        "page":       page,
        "per_page":   per_page,
        "pages":      (total + per_page - 1) // per_page,
        "has_next":   page * per_page < total,
        "has_prev":   page > 1,
    }
