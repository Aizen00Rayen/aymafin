"""Shared config: env loading, Supabase async client, constants."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from supabase._async.client import AsyncClient, create_client as _create_async_client  # noqa: E402

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24 * 7  # 7 days
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15

_db: AsyncClient | None = None


async def get_db() -> AsyncClient:
    global _db
    if _db is None:
        _db = await _create_async_client(SUPABASE_URL, SUPABASE_KEY)
    return _db


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]
