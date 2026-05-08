"""Admin: stats, users (with join via separate queries), soft-delete + restore."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query

from config import get_db
from auth_utils import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    db = await get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    users_res = await db.table("users").select("id,onboarded,created_at,deleted_at").execute()
    all_users = users_res.data or []
    active = [u for u in all_users if not u.get("deleted_at")]
    deleted = [u for u in all_users if u.get("deleted_at")]

    biz_res = await db.table("businesses").select("id", count="exact").execute()
    rep_res = await db.table("reports").select("id", count="exact").is_("deleted_at", "null").execute()
    chat_res = await db.table("chat_history").select("id", count="exact").execute()

    return {
        "total_users": len(active),
        "onboarded_users": sum(1 for u in active if u.get("onboarded")),
        "total_businesses": biz_res.count or 0,
        "total_reports": rep_res.count or 0,
        "total_chats": chat_res.count or 0,
        "new_users_7d": sum(1 for u in active if u.get("created_at", "") >= cutoff),
        "deleted_users": len(deleted),
    }


@router.get("/users")
async def admin_list_users(
    include_deleted: bool = Query(False),
    _: dict = Depends(require_admin),
):
    db = await get_db()
    q = db.table("users").select("id,email,name,role,onboarded,created_at,deleted_at").order("created_at", desc=True)
    if not include_deleted:
        q = q.is_("deleted_at", "null")
    users_res = await q.execute()
    users = users_res.data or []

    biz_res = await db.table("businesses").select("*").execute()
    businesses = {b["user_id"]: b for b in (biz_res.data or [])}

    rep_res = await db.table("reports").select("user_id", count="exact").is_("deleted_at", "null").execute()
    rep_counts: dict = {}
    for r in (rep_res.data or []):
        rep_counts[r["user_id"]] = rep_counts.get(r["user_id"], 0) + 1

    chat_res = await db.table("chat_history").select("user_id").execute()
    chat_counts: dict = {}
    for c in (chat_res.data or []):
        chat_counts[c["user_id"]] = chat_counts.get(c["user_id"], 0) + 1

    out = []
    for u in users:
        b = businesses.get(u["id"])
        revenue = sum(float(s.get("monthly_amount", 0)) for s in (b.get("revenue_streams") or [] if b else []))
        expenses = sum(float(e.get("monthly_amount", 0)) for e in (b.get("expenses") or [] if b else []))
        out.append({
            "id": u["id"],
            "email": u["email"],
            "name": u.get("name"),
            "role": u.get("role", "user"),
            "onboarded": u.get("onboarded", False),
            "created_at": u.get("created_at"),
            "deleted_at": u.get("deleted_at"),
            "business": {
                "name": b.get("business_name") if b else None,
                "type": b.get("business_type") if b else None,
                "country": b.get("country") if b else None,
                "currency": b.get("currency", "DZD") if b else "DZD",
                "revenue_monthly": round(revenue, 2),
                "expenses_monthly": round(expenses, 2),
                "profit_monthly": round(revenue - expenses, 2),
                "capital": float(b.get("initial_capital", 0)) if b else 0,
            } if b else None,
            "reports_count": rep_counts.get(u["id"], 0),
            "chats_count": chat_counts.get(u["id"], 0),
        })
    return out


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db = await get_db()
    target_res = await db.table("users").select("id,deleted_at").eq("id", user_id).maybe_single().execute()
    if not target_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    if target_res.data.get("deleted_at"):
        raise HTTPException(status_code=400, detail="User already deleted")
    now = datetime.now(timezone.utc).isoformat()
    await db.table("users").update({"deleted_at": now}).eq("id", user_id).execute()
    await db.table("businesses").update({"deleted_at": now}).eq("user_id", user_id).execute()
    await db.table("reports").update({"deleted_at": now}).eq("user_id", user_id).execute()
    return {"ok": True, "user_id": user_id, "soft_deleted_at": now}


@router.post("/users/{user_id}/restore")
async def admin_restore_user(user_id: str, _: dict = Depends(require_admin)):
    db = await get_db()
    target_res = await db.table("users").select("id,deleted_at").eq("id", user_id).maybe_single().execute()
    if not target_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    if not target_res.data.get("deleted_at"):
        raise HTTPException(status_code=400, detail="User is not deleted")
    await db.table("users").update({"deleted_at": None}).eq("id", user_id).execute()
    await db.table("businesses").update({"deleted_at": None}).eq("user_id", user_id).execute()
    await db.table("reports").update({"deleted_at": None}).eq("user_id", user_id).execute()
    return {"ok": True, "user_id": user_id, "restored": True}
