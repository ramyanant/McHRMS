"""Standardised API response helpers."""
from flask import jsonify

def ok(data=None, message="ok", status=200):
    return jsonify({"success": True, "message": message, "data": data}), status

def created(data=None, message="Created"):
    return ok(data, message, 201)

def err(message="Error", status=400, errors=None):
    body = {"success": False, "message": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status

def not_found(entity="Record"):
    return err(f"{entity} not found", 404)

def forbidden(message="Insufficient permissions"):
    return err(message, 403)

def unauthorized():
    return err("Authentication required", 401)
