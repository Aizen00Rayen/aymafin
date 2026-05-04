"""Vercel entry point — imports the FastAPI app from backend/."""
import sys
import os

# Add the repo root to the path so 'backend' is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
# Also add backend/ itself so intra-backend imports work (config, auth_utils, etc.)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend"))

from backend.app import app  # noqa: F401 — Vercel picks up 'app'
