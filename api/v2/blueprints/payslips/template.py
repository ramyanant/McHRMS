"""
Single-function HTML payslip renderer.

build_payslip_html(ctx, pdf_mode=False) -> str

Layout matches the IQuest reference payslip 1:1:
- IQuest logo top-left, company name + branch address top-right
- Centered Courier-New letter-spaced title: PAY SLIP FOR THE MONTH OF MMMM YYYY
- Right-aligned italic #0000C1 "(Figures in INR)" just under the title
- 5-row Employee details grid (grey label cells, white value cells),
  last row holds PF Number + ESI Number
- Earnings | Amount | Consolidation | Deductions | Amount | Consolidation
  table — bold black headers on WHITE, NO internal vertical borders in
  the body cells, totals row separated by a top rule
- Net Pay box (amount + In Words)
- Loans & Advances 6-column table with two empty rows
- "Information" header bar + empty bordered box
- Centered "::  THIS IS AN ELECTRONICALLY GENERATED ... :: " footer
- Company stamp at the bottom-right

pdf_mode=True uses 'Rs. ' currency prefix (xhtml2pdf default fonts
do not include the rupee glyph U+20B9). HTML preview uses '₹' which
browsers render natively.

ctx shape:
    {
      'organisation':  {'legal_name': str},
      'branch_lines':  list[str],     # right-aligned address lines
      'employee':      {emp_id, name, department, designation, pan,
                        dob, location, lop_days, doj,
                        bank_account, bank_name,
                        pf_number, esi_number},
      'period':        {'title_str': 'PAY SLIP FOR THE MONTH OF APRIL 2026'},
      'amounts':       dict — current month values for AMOUNT_KEYS
      'ytd':           dict — same keys, summed across the Indian FY
      'in_words':      str,
      'logo_uri':      data: URI,
      'stamp_uri':     data: URI,
    }
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from string import Template

# Keys present in both `amounts` (current month) and `ytd` (FY-to-date)
AMOUNT_KEYS = (
    'basic', 'hra', 'conveyance', 'medical', 'special', 'incentive',
    'prof_tax', 'tds', 'insurance', 'pf', 'others_ded', 'esi',
    'total_earnings', 'total_deductions', 'net_salary',
)


def _inr(value, prefix='Rs. '):
    """Indian-grouped currency: 237530 → 'Rs. 2,37,530.00'."""
    if value is None:
        value = 0
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except Exception:
        d = Decimal(0)
    sign = '-' if d < 0 else ''
    d = abs(d)
    int_part = int(d)
    frac_part = int((d - int_part) * 100)
    s = str(int_part)
    if len(s) <= 3:
        grouped = s
    else:
        last3 = s[-3:]
        rest = s[:-3]
        chunks = []
        while len(rest) > 2:
            chunks.append(rest[-2:])
            rest = rest[:-2]
        if rest:
            chunks.append(rest)
        chunks.reverse()
        grouped = ','.join(chunks) + ',' + last3
    return f"{sign}{prefix}{grouped}.{frac_part:02d}"


def _fmt_date(d):
    """date | datetime | ISO str → 'February 22, 1972' (matches reference)."""
    if not d:
        return ''
    if isinstance(d, str):
        try:
            d = datetime.fromisoformat(d).date()
        except Exception:
            return d
    if isinstance(d, datetime):
        d = d.date()
    if isinstance(d, date):
        return d.strftime('%B %d, %Y')
    return str(d)


def _esc(s):
    """Minimal HTML escape for interpolated context strings."""
    if s is None:
        return ''
    return (str(s).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


_CSS = """
@page { size: A4 portrait; margin: 1.2cm 1.4cm; }
body {
  font-family: Calibri, "Segoe UI", Helvetica, sans-serif;
  font-size: 10pt;
  color: #000;
}
table { border-collapse: collapse; width: 100%; }

.header-table td { vertical-align: top; padding: 0; border: 0; }
.header-logo img { width: 4.5cm; }
.header-info { text-align: right; font-size: 10pt; line-height: 1.35; }
.header-info .legal { font-weight: bold; }

.title-row { text-align: center; margin-top: 14pt; }
.title-row .title {
  font-family: "Courier New", Courier, monospace;
  font-weight: bold;
  font-size: 12pt;
  letter-spacing: 3pt;
}
.figures-inr {
  text-align: right;
  font-style: italic;
  color: #0000C1;
  font-size: 9pt;
  margin: 2pt 0 4pt 0;
}

.emp-grid td {
  border: 1px solid #000;
  padding: 4pt 6pt;
  font-size: 9.5pt;
  vertical-align: middle;
}
.emp-grid td.lbl { background-color: #F2F2F2; font-weight: bold; }

.ed { margin-top: 8pt; border: 1px solid #000; }
.ed thead th {
  border-bottom: 1px solid #000;
  padding: 5pt 6pt;
  font-weight: bold;
  text-align: left;
  background-color: #FFFFFF;
}
.ed thead th.amt { text-align: right; }
.ed tbody td {
  padding: 3pt 6pt;
  border: 0;
  font-size: 9.5pt;
}
.ed tbody td.amt {
  text-align: right;
  font-family: "Courier New", Courier, monospace;
}
.ed tfoot td {
  padding: 4pt 6pt;
  border-top: 1px solid #000;
  font-weight: bold;
}
.ed tfoot td.amt {
  text-align: right;
  font-family: "Courier New", Courier, monospace;
}

.net { margin-top: 8pt; }
.net td {
  border: 1px solid #000;
  padding: 4pt 6pt;
  font-size: 9.5pt;
}
.net td.lbl { background-color: #F2F2F2; font-weight: bold; width: 18%; }
.net td.amt {
  font-weight: bold;
  font-family: "Courier New", Courier, monospace;
}
.net td.words { font-weight: bold; }
.net td.spacer { border: 0; height: 0.4cm; }

.loans { margin-top: 12pt; }
.loans th {
  background-color: #F2F2F2;
  font-weight: bold;
  padding: 4pt 6pt;
  border: 1px solid #000;
  text-align: left;
}
.loans td {
  padding: 6pt;
  border: 1px solid #000;
  height: 0.6cm;
}

.info-bar {
  background-color: #FFFFFF;
  font-weight: bold;
  font-size: 11pt;
  padding: 4pt 6pt;
  border: 1px solid #000;
  margin-top: 14pt;
}
.info-box {
  border: 1px solid #000;
  border-top: 0;
  height: 3.5cm;
}

.footer-notice {
  text-align: center;
  font-weight: bold;
  font-size: 9pt;
  margin-top: 18pt;
  letter-spacing: 0.5pt;
}
.stamp { text-align: right; margin-top: 6pt; }
.stamp img { width: 3cm; }
"""


# string.Template is used so the CSS's literal `{}` characters don't need
# escaping. Placeholders use $name / ${name} syntax.
_HTML_TEMPLATE = Template("""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>$css</style>
</head>
<body>

<table class="header-table">
  <tr>
    <td class="header-logo" style="width: 50%;">
      <img src="$logo_uri" />
    </td>
    <td class="header-info">
      <div class="legal">$legal_name</div>
      $branch_html
    </td>
  </tr>
</table>

<div class="title-row"><span class="title">$title_str</span></div>
<div class="figures-inr">(Figures in INR)</div>

<table class="emp-grid">
  <tr>
    <td class="lbl" style="width:14%">Employee Code</td>
    <td style="width:20%">$emp_id</td>
    <td class="lbl" style="width:14%">Employee Name</td>
    <td colspan="3">$emp_name</td>
  </tr>
  <tr>
    <td class="lbl">Department</td><td>$department</td>
    <td class="lbl">Designation</td><td style="width:20%">$designation</td>
    <td class="lbl" style="width:10%">PAN No</td>
    <td style="width:14%">$pan</td>
  </tr>
  <tr>
    <td class="lbl">Date of Birth</td><td>$dob</td>
    <td class="lbl">Location</td><td>$location</td>
    <td class="lbl">LOP</td><td>$lop_days Day(s)</td>
  </tr>
  <tr>
    <td class="lbl">Date of Joining</td><td>$doj</td>
    <td class="lbl">Account Number</td><td>$bank_account</td>
    <td class="lbl">Bank</td><td>$bank_name</td>
  </tr>
  <tr>
    <td class="lbl">PF Number</td><td>$pf_number</td>
    <td class="lbl">ESI Number</td><td colspan="3">$esi_number</td>
  </tr>
</table>

<table class="ed">
  <thead>
    <tr>
      <th style="width:23%">Earnings</th>
      <th class="amt" style="width:12%">Amount</th>
      <th class="amt" style="width:13%">Consolidation</th>
      <th style="width:23%">Deductions</th>
      <th class="amt" style="width:12%">Amount</th>
      <th class="amt" style="width:13%">Consolidation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>BASIC</td>
      <td class="amt">$basic</td>
      <td class="amt">$basic_ytd</td>
      <td>PROFESSIONAL TAX</td>
      <td class="amt">$prof_tax</td>
      <td class="amt">$prof_tax_ytd</td>
    </tr>
    <tr>
      <td>HOUSE RENT ALLOWANCE</td>
      <td class="amt">$hra</td>
      <td class="amt">$hra_ytd</td>
      <td>TAX DEDUCTED AT SOURCE</td>
      <td class="amt">$tds</td>
      <td class="amt">$tds_ytd</td>
    </tr>
    <tr>
      <td>CONVEYANCE ALLOWANCE</td>
      <td class="amt">$conveyance</td>
      <td class="amt">$conveyance_ytd</td>
      <td>INSURANCE</td>
      <td class="amt">$insurance</td>
      <td class="amt">$insurance_ytd</td>
    </tr>
    <tr>
      <td>MEDICAL ALLOWANCE</td>
      <td class="amt">$medical</td>
      <td class="amt">$medical_ytd</td>
      <td>PROVIDENT FUND</td>
      <td class="amt">$pf</td>
      <td class="amt">$pf_ytd</td>
    </tr>
    <tr>
      <td>SPECIAL ALLOWANCE</td>
      <td class="amt">$special</td>
      <td class="amt">$special_ytd</td>
      <td>OTHERS</td>
      <td class="amt">$others_ded</td>
      <td class="amt">$others_ded_ytd</td>
    </tr>
    <tr>
      <td>INCENTIVE</td>
      <td class="amt">$incentive</td>
      <td class="amt">$incentive_ytd</td>
      $esi_cells
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td>Total Earnings</td>
      <td class="amt">$total_earnings</td>
      <td class="amt">$total_earnings_ytd</td>
      <td>Total Deductions</td>
      <td class="amt">$total_deductions</td>
      <td class="amt">$total_deductions_ytd</td>
    </tr>
  </tfoot>
</table>

<table class="net">
  <tr>
    <td class="lbl">Employee Net Pay</td>
    <td class="amt" colspan="5">$net_salary</td>
  </tr>
  <tr>
    <td class="lbl">In Words</td>
    <td class="words" colspan="5">$in_words</td>
  </tr>
  <tr><td class="spacer" colspan="6"></td></tr>
</table>

<table class="loans">
  <thead>
    <tr>
      <th>Loan Type</th>
      <th>EMI</th>
      <th>Loan Amount</th>
      <th>Recovered Amount</th>
      <th>Balance</th>
      <th>For the Month</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>

<div class="info-bar">Information</div>
<div class="info-box">&nbsp;</div>

<div class="footer-notice">::&nbsp;&nbsp;THIS IS AN ELECTRONICALLY GENERATED STATEMENT AND REQUIRES NO SIGNATURE&nbsp;&nbsp;::</div>

<div class="stamp"><img src="$stamp_uri" /></div>

</body>
</html>
""")


def build_payslip_html(ctx, pdf_mode=False):
    prefix = 'Rs. ' if pdf_mode else '₹'  # ₹ in HTML, Rs. in PDF
    org = ctx.get('organisation') or {}
    emp = ctx.get('employee') or {}
    period = ctx.get('period') or {}
    amts = ctx.get('amounts') or {}
    ytd = ctx.get('ytd') or {}

    branch_html = ''.join(
        f'<div>{_esc(line)}</div>' for line in (ctx.get('branch_lines') or [])
    )

    flat = {
        'css': _CSS,
        'logo_uri':   ctx.get('logo_uri', ''),
        'stamp_uri':  ctx.get('stamp_uri', ''),
        'legal_name': _esc(org.get('legal_name', '')),
        'branch_html': branch_html,
        'title_str':  _esc(period.get('title_str', '')),
        'emp_id':     _esc(emp.get('emp_id', '')),
        'emp_name':   _esc(emp.get('name', '')),
        'department': _esc(emp.get('department') or '-'),
        'designation': _esc(emp.get('designation') or '-'),
        'pan':        _esc(emp.get('pan') or '-'),
        'dob':        _esc(_fmt_date(emp.get('dob'))),
        'location':   _esc(emp.get('location') or '-'),
        'lop_days':   _esc(emp.get('lop_days', 0)),
        'doj':        _esc(_fmt_date(emp.get('doj'))),
        'bank_account': _esc(emp.get('bank_account') or '-'),
        'bank_name':  _esc(emp.get('bank_name') or '-'),
        'pf_number':  _esc(emp.get('pf_number') or '-'),
        'esi_number': _esc(emp.get('esi_number') or '-'),
        'in_words':   _esc(ctx.get('in_words', '')),
    }
    for k in AMOUNT_KEYS:
        flat[k] = _inr(amts.get(k, 0), prefix)
        flat[f'{k}_ytd'] = _inr(ytd.get(k, 0), prefix)

    # Sixth deduction row holds ESI only when non-zero (reference April
    # payslip has no ESI line; the column position is left blank).
    try:
        esi_now = Decimal(str(amts.get('esi') or 0))
    except Exception:
        esi_now = Decimal(0)
    if esi_now != 0:
        flat['esi_cells'] = (
            f'<td>ESI</td>'
            f'<td class="amt">{_inr(amts.get("esi", 0), prefix)}</td>'
            f'<td class="amt">{_inr(ytd.get("esi", 0), prefix)}</td>'
        )
    else:
        flat['esi_cells'] = '<td></td><td></td><td></td>'

    return _HTML_TEMPLATE.safe_substitute(**flat)


# Helper-level sanity checks (cheap, run on import).
assert _inr(237530, 'Rs. ') == 'Rs. 2,37,530.00', _inr(237530, 'Rs. ')
assert _inr(9999999, 'Rs. ') == 'Rs. 99,99,999.00'
assert _inr(99999999, 'Rs. ') == 'Rs. 9,99,99,999.00'
assert _inr(1000, 'Rs. ') == 'Rs. 1,000.00'
assert _inr(0, 'Rs. ') == 'Rs. 0.00'
assert _inr(Decimal('1.50'), 'Rs. ') == 'Rs. 1.50'
assert _fmt_date(date(1972, 2, 22)) == 'February 22, 1972'
assert _fmt_date(date(2022, 4, 1)) == 'April 01, 2022'
assert _fmt_date(None) == ''
