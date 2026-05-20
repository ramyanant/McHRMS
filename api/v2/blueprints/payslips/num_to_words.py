"""
Indian numbering system → words.

Output format matches the IQuest payslip reference exactly:
    "Rupees Two Lakh Thirty Seven Thousand Five Hundred and Thirty and Paisa Zero Only"

Groupings: Crore (10^7), Lakh (10^5), Thousand (10^3), Hundred (10^2).
"and" appears only before the final tens-units chunk when a higher grouping
precedes it (e.g. "Five Hundred and Thirty", but "Thirty Seven Thousand").
"""
from decimal import Decimal, ROUND_HALF_UP

_UNITS = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _two(n):
    """Words for 0..99 (no leading 'Zero' for 0; caller handles that)."""
    if n < 20:
        return _UNITS[n]
    t, u = divmod(n, 10)
    return _TENS[t] + ((' ' + _UNITS[u]) if u else '')


def _int_words(n):
    """Words for any non-negative integer (Indian groupings)."""
    if n == 0:
        return 'Zero'
    parts = []
    crore, n = divmod(n, 10_000_000)
    if crore:
        # Recurse so amounts > 99 crore still render correctly.
        parts.append(_int_words(crore) + ' Crore')
    lakh, n = divmod(n, 100_000)
    if lakh:
        parts.append(_two(lakh) + ' Lakh')
    thousand, n = divmod(n, 1_000)
    if thousand:
        parts.append(_two(thousand) + ' Thousand')
    hundred, n = divmod(n, 100)
    if hundred:
        parts.append(_two(hundred) + ' Hundred')
    if n:
        parts.append(('and ' if parts else '') + _two(n))
    return ' '.join(parts)


def inr_in_words(value):
    """Decimal/float/int → 'Rupees ... and Paisa ... Only' (Indian system)."""
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    sign = '-' if value < 0 else ''
    value = abs(value)
    rupees = int(value)
    paisa = int((value - rupees).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) * 100)
    if paisa == 100:
        rupees += 1
        paisa = 0
    return f"{sign}Rupees {_int_words(rupees)} and Paisa {_int_words(paisa)} Only"


# Inline self-tests — match the reference payslip exactly.
assert inr_in_words(237530) == \
    "Rupees Two Lakh Thirty Seven Thousand Five Hundred and Thirty and Paisa Zero Only", \
    inr_in_words(237530)
assert inr_in_words(0) == "Rupees Zero and Paisa Zero Only"
assert inr_in_words(Decimal('1.50')) == "Rupees One and Paisa Fifty Only"
assert inr_in_words(100) == "Rupees One Hundred and Paisa Zero Only"
assert inr_in_words(100000) == "Rupees One Lakh and Paisa Zero Only"
assert inr_in_words(10000000) == "Rupees One Crore and Paisa Zero Only"
assert inr_in_words(Decimal('123456789.99')) == \
    "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred and Eighty Nine and Paisa Ninety Nine Only"
assert inr_in_words(Decimal('0.99')) == "Rupees Zero and Paisa Ninety Nine Only"
# Half-up rounding: 0.005 → 0.01 → Paisa One
assert inr_in_words(Decimal('0.005')) == "Rupees Zero and Paisa One Only"
