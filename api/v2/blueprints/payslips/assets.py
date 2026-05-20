"""
Embedded payslip assets — IQuest logo + company stamp.

PNGs live in the sibling assets/ folder. Loaded once at import time and
exposed as base64 data: URIs ready to drop into <img src="...">.

Logo: prefers organisation.logo_data (if uploaded via /organisation/logo)
and falls back to the embedded IQuest wordmark. Stamp is always embedded.
"""
import base64
import os

_DIR = os.path.join(os.path.dirname(__file__), 'assets')


def _load_b64(name):
    path = os.path.join(_DIR, name)
    try:
        with open(path, 'rb') as f:
            return base64.b64encode(f.read()).decode('ascii')
    except Exception:
        return ''


LOGO_B64 = _load_b64('logo.png')
STAMP_B64 = _load_b64('stamp.png')

LOGO_DATA_URI = f"data:image/png;base64,{LOGO_B64}" if LOGO_B64 else ''
STAMP_DATA_URI = f"data:image/png;base64,{STAMP_B64}" if STAMP_B64 else ''


def get_logo_data_uri(org=None):
    """Org-uploaded logo wins; otherwise fall back to the embedded IQuest logo."""
    if org:
        ld = org.get('logo_data')
        if ld:
            mime = org.get('logo_mime') or 'image/png'
            return f"data:{mime};base64,{ld}"
    return LOGO_DATA_URI


def get_stamp_data_uri():
    return STAMP_DATA_URI
