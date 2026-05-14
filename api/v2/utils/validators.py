"""Input validation utilities."""
import re
from typing import Any, Dict, List, Optional

class ValidationError(Exception):
    def __init__(self, errors: Dict[str, str]):
        self.errors = errors
        super().__init__(str(errors))

def validate(data: dict, rules: dict) -> dict:
    """
    Validate data against rules.
    rules: { field_name: [rule, ...] }
    
    Rules:
      'required'         — field must be present and non-empty
      'email'            — must be valid email
      'min:N'            — string min length N
      'max:N'            — string max length N
      'numeric'          — must be numeric
      'date'             — must be YYYY-MM-DD
      'in:a,b,c'         — must be one of listed values
    """
    errors = {}
    
    for field, field_rules in rules.items():
        value = data.get(field)
        
        for rule in field_rules:
            if rule == 'required':
                if value is None or str(value).strip() == '':
                    errors[field] = f"{field} is required"
                    break
            
            elif rule == 'email':
                if value and not re.match(r'^[^@]+@[^@]+\.[^@]+$', str(value)):
                    errors[field] = f"{field} must be a valid email address"
            
            elif rule.startswith('min:'):
                n = int(rule.split(':')[1])
                if value and len(str(value)) < n:
                    errors[field] = f"{field} must be at least {n} characters"
            
            elif rule.startswith('max:'):
                n = int(rule.split(':')[1])
                if value and len(str(value)) > n:
                    errors[field] = f"{field} must be at most {n} characters"
            
            elif rule == 'numeric':
                if value is not None:
                    try: float(str(value))
                    except ValueError:
                        errors[field] = f"{field} must be numeric"
            
            elif rule == 'date':
                if value and not re.match(r'^\d{4}-\d{2}-\d{2}$', str(value)):
                    errors[field] = f"{field} must be in YYYY-MM-DD format"
            
            elif rule.startswith('in:'):
                allowed = rule.split(':', 1)[1].split(',')
                if value and str(value) not in allowed:
                    errors[field] = f"{field} must be one of: {', '.join(allowed)}"
    
    if errors:
        raise ValidationError(errors)
    
    return data
