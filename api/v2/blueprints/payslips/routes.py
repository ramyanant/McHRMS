"""
Payslips Blueprint — list, JSON, HTML, PDF, ZIP.

All endpoints sit under /api/v2/payslips/. A single _can_view() guard
applies role-based visibility:

  Admin / HR Manager / Finance Manager  → all employees
  Anyone with direct reports             → self + direct reports
  Anyone else (incl. Employee)          → own only

YTD Consolidation is computed at render time across the Indian financial
year (April → March) containing the entry's pay period, inclusive of
the entry's own month. No schema changes.

Legacy column resolution: where the live DB carries both an older and a
newer name for the same field (e.g. esi vs esi_employee), the
newer/more-specific column wins when non-zero; the legacy one is the
fallback. See LEGACY_PAIRS below.
"""
from decimal import Decimal
from io import BytesIO
import zipfile

from flask import Blueprint, request, g, Response

from ...extensions import db_rows, db_row1
from ...middleware.auth import require_auth, require_role
from ...utils.responses import ok, err, not_found, forbidden

from .template import build_payslip_html, AMOUNT_KEYS
from .num_to_words import inr_in_words
from .assets import get_logo_data_uri, get_stamp_data_uri

payslips_bp = Blueprint('payslips', __name__, url_prefix='/api/v2')

_PRIVILEGED_ROLES = ('Admin', 'HR Manager', 'Finance Manager')

_MONTH_NAMES = [
    '', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]


# ─────────────────────────────────────────────────────────────────────
# Legacy column resolution — newer/more-specific column wins
# ─────────────────────────────────────────────────────────────────────

def _pick(entry, primary, fallback):
    """primary's value if it's non-zero/non-None; else fallback's; else 0."""
    val = entry.get(primary)
    if val is not None:
        try:
            if Decimal(str(val)) != 0:
                return val
        except Exception:
            pass
    return entry.get(fallback) or 0


def _normalize_entry(entry):
    """Map a payroll_entries row (joined or not) to template `amounts` shape."""
    return {
        'basic':            entry.get('basic') or 0,
        'hra':              entry.get('hra') or 0,
        'conveyance':       entry.get('conveyance') or 0,
        'medical':          _pick(entry, 'medical_allowance', 'medical'),
        'special':          _pick(entry, 'special_allowance', 'special'),
        'incentive':        entry.get('incentive') or 0,
        'prof_tax':         _pick(entry, 'profession_tax', 'prof_tax'),
        'tds':              entry.get('tds') or 0,
        'insurance':        _pick(entry, 'medical_insurance', 'medical_deduction'),
        'pf':               _pick(entry, 'pf_employee', 'epf'),
        'others_ded':       entry.get('other_deductions') or 0,
        'esi':              _pick(entry, 'esi_employee', 'esi'),
        'total_earnings':   _pick(entry, 'total_earnings', 'gross_salary'),
        'total_deductions': entry.get('total_deductions') or 0,
        'net_salary':       entry.get('net_salary') or 0,
    }


def _compute_ytd(employee_id, year, month):
    """Sum each AMOUNT_KEYS column across the Indian FY containing (year,month),
    up to and including the entry's own month."""
    if month >= 4:
        fy_start_year, fy_end_year = year, year + 1
    else:
        fy_start_year, fy_end_year = year - 1, year
    cutoff = year * 100 + month
    rows = db_rows("""
        SELECT pe.*
        FROM payroll_entries pe
        JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
        WHERE pe.employee_id = %s
          AND (
              (pr.year = %s AND pr.month >= 4)
              OR
              (pr.year = %s AND pr.month <= 3)
          )
          AND (pr.year * 100 + pr.month) <= %s
    """, (employee_id, fy_start_year, fy_end_year, cutoff))
    totals = {k: Decimal(0) for k in AMOUNT_KEYS}
    for row in rows:
        norm = _normalize_entry(row)
        for k, v in norm.items():
            try:
                totals[k] += Decimal(str(v or 0))
            except Exception:
                pass
    return totals


# ─────────────────────────────────────────────────────────────────────
# Access control
# ─────────────────────────────────────────────────────────────────────

def _get_caller_emp_id():
    emp_id = g.user.get('employee_id')
    if emp_id:
        return emp_id
    email = g.user.get('email')
    if email:
        emp = db_row1("SELECT id FROM employees WHERE email=%s AND is_active=1", (email,))
        if emp:
            return emp['id']
    return None


def _can_view(target_employee_id):
    if g.user.get('role') in _PRIVILEGED_ROLES:
        return True
    caller_emp_id = _get_caller_emp_id()
    if not caller_emp_id:
        return False
    if caller_emp_id == target_employee_id:
        return True
    rel = db_row1("""SELECT 1 FROM employees
        WHERE id=%s AND reporting_manager_id=%s AND is_active=1""",
        (target_employee_id, caller_emp_id))
    return bool(rel)


# ─────────────────────────────────────────────────────────────────────
# Render context loader
# ─────────────────────────────────────────────────────────────────────

def _safe_filename_part(s):
    return ''.join(c for c in str(s or '') if c.isalnum() or c in ' -._') or 'NA'


def _filename_for(meta):
    """YYYY-MM Payslip - EmpID - Firstname Lastname.pdf"""
    fname = (_safe_filename_part(meta['first_name']) + ' ' +
             _safe_filename_part(meta['last_name'])).strip()
    return (f"{meta['year']}-{meta['month']:02d} Payslip - "
            f"{_safe_filename_part(meta['emp_id_str'])} - {fname}.pdf")


def _load_entry_context(entry_id):
    entry = db_row1("""
        SELECT pe.*,
               pr.month AS run_month, pr.year AS run_year, pr.run_date,
               e.id AS emp_pk, e.emp_id AS emp_code,
               e.first_name, e.middle_name, e.last_name,
               COALESCE(e.designation, e.job_title) AS designation,
               e.pan, e.dob, e.start_date,
               e.bank_name, e.bank_account_number, e.bank_ifsc,
               e.pf_number, e.esi_number,
               e.office_location_id, e.department_id,
               d.name AS department_name,
               l.name AS location_name,
               l.address_line1 AS loc_addr1,
               l.address AS loc_addr_alt,
               l.city AS loc_city, l.state AS loc_state,
               l.pincode AS loc_pincode, l.country AS loc_country
        FROM payroll_entries pe
        JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
        JOIN employees e ON e.id = pe.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN office_locations l ON l.id = e.office_location_id
        WHERE pe.id = %s
    """, (entry_id,))
    if not entry:
        return None

    org = db_row1("""SELECT id, legal_name, trade_name, brand_name,
                            logo_data, logo_mime,
                            reg_address_line1, reg_address_line2,
                            reg_city, reg_pincode
                     FROM organisation LIMIT 1""") or {}

    branch_lines = []
    addr_line = entry.get('loc_addr1') or entry.get('loc_addr_alt')
    if addr_line:
        # Allow embedded newlines or " | " to render as separate lines.
        for piece in str(addr_line).replace(' | ', '\n').splitlines():
            piece = piece.strip()
            if piece:
                branch_lines.append(piece)
    city_state_parts = []
    if entry.get('loc_city'):
        city_state_parts.append(entry['loc_city'])
    if entry.get('loc_state'):
        city_state_parts.append(entry['loc_state'])
    city_state = ', '.join(city_state_parts)
    if entry.get('loc_pincode'):
        city_state = (city_state + ' ' if city_state else '') + entry['loc_pincode']
    country = (entry.get('loc_country') or 'INDIA').upper()
    last = (city_state + ' ' + country).strip() if city_state else country
    if last:
        branch_lines.append(last)

    # If office_locations had nothing, fall back to organisation's registered
    # address so the header isn't blank.
    if not branch_lines and org:
        for k in ('reg_address_line1', 'reg_address_line2'):
            v = org.get(k)
            if v:
                branch_lines.append(v)
        if org.get('reg_city') or org.get('reg_pincode'):
            tail = ' '.join(p for p in [org.get('reg_city'), org.get('reg_pincode')] if p)
            if tail:
                branch_lines.append(tail + ' INDIA')

    month = int(entry['run_month']) if entry.get('run_month') else 1
    year  = int(entry['run_year'])  if entry.get('run_year')  else 0
    title_str = f"PAY SLIP FOR THE MONTH OF {_MONTH_NAMES[month]} {year}"

    amounts = _normalize_entry(entry)
    ytd = _compute_ytd(entry['emp_pk'], year, month)
    in_words = inr_in_words(amounts.get('net_salary') or 0)

    name_parts = [entry.get('first_name'), entry.get('middle_name'), entry.get('last_name')]
    full_name = ' '.join(p for p in name_parts if p)
    lop = entry.get('lop_days')
    if not lop:
        lop = entry.get('loss_of_pay') or 0

    return {
        'organisation': {'legal_name': org.get('legal_name', '') if org else ''},
        'branch_lines': branch_lines,
        'employee': {
            'emp_id':       entry.get('emp_code') or '',
            'name':         full_name,
            'department':   entry.get('department_name') or '',
            'designation':  entry.get('designation') or '',
            'pan':          entry.get('pan') or '',
            'dob':          entry.get('dob'),
            'location':     entry.get('location_name') or '',
            'lop_days':     lop,
            'doj':          entry.get('start_date'),
            'bank_account': entry.get('bank_account_number') or '',
            'bank_name':    entry.get('bank_name') or '',
            'pf_number':    entry.get('pf_number') or '',
            'esi_number':   entry.get('esi_number') or '',
        },
        'period':    {'title_str': title_str},
        'amounts':   amounts,
        'ytd':       ytd,
        'in_words':  in_words,
        'logo_uri':  get_logo_data_uri(org),
        'stamp_uri': get_stamp_data_uri(),
        '_meta': {
            'entry_id':    entry['id'],
            'employee_id': entry['emp_pk'],
            'year':        year,
            'month':       month,
            'first_name':  entry.get('first_name') or '',
            'last_name':   entry.get('last_name') or '',
            'emp_id_str':  entry.get('emp_code') or '',
        },
    }


# ─────────────────────────────────────────────────────────────────────
# PDF rendering (xhtml2pdf)
# ─────────────────────────────────────────────────────────────────────

def _render_pdf(html_str):
    """xhtml2pdf HTML → PDF bytes. Returns None on failure."""
    try:
        from xhtml2pdf import pisa
    except ImportError:
        return None
    buf = BytesIO()
    try:
        result = pisa.CreatePDF(html_str, dest=buf, encoding='utf-8')
        if result.err:
            return None
        return buf.getvalue()
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────

@payslips_bp.route('/payslips/list', methods=['GET'])
@require_auth
def list_payslips():
    role = g.user.get('role')
    privileged = role in _PRIVILEGED_ROLES

    requested_emp = request.args.get('employee_id', type=int)
    year   = request.args.get('year', type=int)
    month  = request.args.get('month', type=int)
    status = request.args.get('status')

    where = ['1=1']
    params = []

    if privileged:
        if requested_emp:
            where.append('pe.employee_id = %s')
            params.append(requested_emp)
    else:
        caller_emp_id = _get_caller_emp_id()
        if not caller_emp_id:
            return ok({'items': [], 'total': 0})
        reportees = db_rows("""SELECT id FROM employees
            WHERE reporting_manager_id=%s AND is_active=1""", (caller_emp_id,))
        visible_ids = [caller_emp_id] + [r['id'] for r in reportees]
        if requested_emp:
            if requested_emp not in visible_ids:
                return forbidden()
            where.append('pe.employee_id = %s')
            params.append(requested_emp)
        else:
            placeholders = ','.join(['%s'] * len(visible_ids))
            where.append(f'pe.employee_id IN ({placeholders})')
            params.extend(visible_ids)

    if year:
        where.append('pr.year = %s'); params.append(year)
    if month:
        where.append('pr.month = %s'); params.append(month)
    if status:
        where.append('pr.status = %s'); params.append(status)

    sql = f"""
        SELECT pe.id AS entry_id, pe.payroll_run_id AS run_id,
               pr.year, pr.month, pr.run_date, pr.status,
               pe.lop_days, pe.loss_of_pay, pe.net_salary,
               pe.employee_id, e.emp_id,
               e.first_name||' '||e.last_name AS employee_name
        FROM payroll_entries pe
        JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
        JOIN employees e ON e.id = pe.employee_id
        WHERE {' AND '.join(where)}
        ORDER BY pr.year DESC, pr.month DESC, e.first_name
    """
    rows = db_rows(sql, params)
    for r in rows:
        r['ym']       = f"{r['year']}-{int(r['month']):02d}" if r.get('month') else ''
        r['lop_days'] = r.get('lop_days') or r.get('loss_of_pay') or 0
    return ok({'items': rows, 'total': len(rows)})


@payslips_bp.route('/payslips/<int:entry_id>/json', methods=['GET'])
@require_auth
def payslip_json(entry_id):
    ctx = _load_entry_context(entry_id)
    if not ctx:
        return not_found("Payslip")
    if not _can_view(ctx['_meta']['employee_id']):
        return forbidden()
    # Strip large base64 data URIs from JSON; expose presence flags instead.
    out = {k: v for k, v in ctx.items() if k not in ('logo_uri', 'stamp_uri')}
    out['has_logo']  = bool(ctx.get('logo_uri'))
    out['has_stamp'] = bool(ctx.get('stamp_uri'))
    out['filename']  = _filename_for(ctx['_meta'])
    return ok(out)


@payslips_bp.route('/payslips/<int:entry_id>/html', methods=['GET'])
@require_auth
def payslip_html(entry_id):
    ctx = _load_entry_context(entry_id)
    if not ctx:
        return not_found("Payslip")
    if not _can_view(ctx['_meta']['employee_id']):
        return forbidden()
    return Response(build_payslip_html(ctx, pdf_mode=False), mimetype='text/html')


@payslips_bp.route('/payslips/<int:entry_id>/pdf', methods=['GET'])
@require_auth
def payslip_pdf(entry_id):
    ctx = _load_entry_context(entry_id)
    if not ctx:
        return not_found("Payslip")
    if not _can_view(ctx['_meta']['employee_id']):
        return forbidden()
    pdf_bytes = _render_pdf(build_payslip_html(ctx, pdf_mode=True))
    if not pdf_bytes:
        return err("PDF rendering failed (xhtml2pdf unavailable or template error)", 500)
    filename = _filename_for(ctx['_meta'])
    return Response(pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@payslips_bp.route('/payslips/runs/<int:rid>/zip', methods=['GET'])
@require_auth
@require_role('Admin', 'HR Manager', 'Finance Manager')
def payslips_zip(rid):
    pr = db_row1("SELECT month, year FROM payroll_runs WHERE id=%s", (rid,))
    if not pr:
        return not_found("Payroll run")

    emp_filter = ''
    params = [rid]
    employee_ids_param = request.args.get('employee_ids', '')
    if employee_ids_param:
        ids = [int(x) for x in employee_ids_param.split(',') if x.strip().isdigit()]
        if ids:
            placeholders = ','.join(['%s'] * len(ids))
            emp_filter = f' AND pe.employee_id IN ({placeholders})'
            params.extend(ids)

    entries = db_rows(f"""
        SELECT pe.id AS entry_id
        FROM payroll_entries pe
        WHERE pe.payroll_run_id = %s {emp_filter}
        ORDER BY pe.id
    """, params)
    if not entries:
        return not_found("No payslips for this run")

    ym = f"{pr['year']}-{int(pr['month']):02d}"
    zip_name = f"{ym} Payslips.zip"

    buf = BytesIO()
    rendered = 0
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for row in entries:
            ctx = _load_entry_context(row['entry_id'])
            if not ctx:
                continue
            pdf_bytes = _render_pdf(build_payslip_html(ctx, pdf_mode=True))
            if not pdf_bytes:
                continue
            zf.writestr(_filename_for(ctx['_meta']), pdf_bytes)
            rendered += 1

    if rendered == 0:
        return err("PDF rendering failed for all entries", 500)

    return Response(buf.getvalue(),
        mimetype='application/zip',
        headers={'Content-Disposition': f'attachment; filename="{zip_name}"'})
