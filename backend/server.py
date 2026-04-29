"""Compatibility shim for supervisor (`uvicorn server:app`).
The real application is split into config.py, auth_utils.py, finance.py,
pdf_builder.py, i18n_data.py and routers/* — composed in app.py.
"""
import sys
from pathlib import Path

# Ensure /app/backend is on the path (supervisor already cwds here, but be safe)
sys.path.insert(0, str(Path(__file__).parent))

from app import app  # noqa: F401,E402
