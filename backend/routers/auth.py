"""Auth router: register / login / logout / me — with brute-force lockout."""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

from config import get_db, LOCKOUT_THRESHOLD, LOCKOUT_MINUTES
from auth_utils import (
    hash_password, verify_password, create_access_token,
    set_auth_cookie, clear_auth_cookie, get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str = "user"
    onboarded: bool = False


def _serialize(u: dict) -> UserOut:
    return UserOut(
        id=u["id"], email=u["email"], name=u.get("name", ""),
        role=u.get("role", "user"), onboarded=u.get("onboarded", False),
    )


@router.post("/register", response_model=UserOut)
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    db = await get_db()
    existing = await db.table("users").select("id").eq("email", email).is_("deleted_at", "null").maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": "user",
        "onboarded": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.table("users").insert(user).execute()
    set_auth_cookie(response, create_access_token(user["id"], email))
    return _serialize(user)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower().strip()
    identifier = email
    db = await get_db()

    rec_res = await db.table("login_attempts").select("*").eq("identifier", identifier).maybe_single().execute()
    rec = rec_res.data
    if rec and rec.get("locked_until") and datetime.fromisoformat(rec["locked_until"]) > datetime.now(timezone.utc):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")

    user_res = await db.table("users").select("*").eq("email", email).is_("deleted_at", "null").maybe_single().execute()
    user = user_res.data
    if not user or not verify_password(body.password, user["password_hash"]):
        attempts = (rec.get("attempts", 0) if rec else 0) + 1
        now_iso = datetime.now(timezone.utc).isoformat()
        upsert_doc = {"identifier": identifier, "attempts": attempts, "id": str(uuid.uuid4())}
        if attempts >= LOCKOUT_THRESHOLD:
            upsert_doc["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            upsert_doc["attempts"] = 0
        await db.table("login_attempts").upsert(upsert_doc, on_conflict="identifier").execute()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.table("login_attempts").delete().eq("identifier", identifier).execute()
    set_auth_cookie(response, create_access_token(user["id"], email))
    return _serialize(user)


@router.post("/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return _serialize(user)
