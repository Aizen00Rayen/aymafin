"""Auth helpers (password hashing, JWT, get_current_user, require_admin)."""
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import Request, Response, HTTPException, Depends
from config import get_db, jwt_secret, JWT_ALGORITHM, ACCESS_TTL_MIN


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token,
        httponly=True, secure=True, samesite="none",
        max_age=ACCESS_TTL_MIN * 60, path="/",
    )
    # Also expose token in header so mobile WebView can persist it in localStorage
    response.headers["X-Access-Token"] = token
    response.headers["Access-Control-Expose-Headers"] = "X-Access-Token, X-Bank-Used, X-Lang-Used"


def clear_auth_cookie(response: Response):
    response.delete_cookie("access_token", path="/")


_USER_SELECT = "id,email,name,role,onboarded,created_at,subscription"


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        db = await get_db()
        res = await db.table("users").select(_USER_SELECT).eq("id", payload["sub"]).is_("deleted_at", "null").maybe_single().execute()
        if not res.data:
            raise HTTPException(status_code=401, detail="User not found")
        return res.data
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
