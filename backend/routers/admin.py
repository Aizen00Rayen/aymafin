"""Admin: stats, users (with single-pass aggregation), soft-delete + restore."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query

from config import db
from auth_utils import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    not_deleted = {"deleted_at": {"$exists": False}}
    total_users = await db.users.count_documents(not_deleted)
    onboarded = await db.users.count_documents({**not_deleted, "onboarded": True})
    total_businesses = await db.businesses.count_documents(not_deleted)
    total_reports = await db.reports.count_documents(not_deleted)
    total_chats = await db.chat_history.count_documents({})
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_7d = await db.users.count_documents({**not_deleted, "created_at": {"$gte": cutoff}})
    deleted_users = await db.users.count_documents({"deleted_at": {"$exists": True}})
    return {
        "total_users": total_users,
        "onboarded_users": onboarded,
        "total_businesses": total_businesses,
        "total_reports": total_reports,
        "total_chats": total_chats,
        "new_users_7d": new_7d,
        "deleted_users": deleted_users,
    }


@router.get("/users")
async def admin_list_users(
    include_deleted: bool = Query(False),
    _: dict = Depends(require_admin),
):
    """Single aggregation pipeline: joins businesses + report counts + chat counts."""
    match = {} if include_deleted else {"deleted_at": {"$exists": False}}
    pipeline = [
        {"$match": match},
        {"$sort": {"created_at": -1}},
        {"$lookup": {
            "from": "businesses",
            "localField": "id",
            "foreignField": "user_id",
            "as": "biz",
        }},
        {"$lookup": {
            "from": "reports",
            "let": {"uid": "$id"},
            "pipeline": [
                {"$match": {"$expr": {"$and": [
                    {"$eq": ["$user_id", "$$uid"]},
                    {"$eq": [{"$type": "$deleted_at"}, "missing"]},
                ]}}},
                {"$count": "n"},
            ],
            "as": "reports_count_arr",
        }},
        {"$lookup": {
            "from": "chat_history",
            "let": {"uid": "$id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$user_id", "$$uid"]}}},
                {"$count": "n"},
            ],
            "as": "chats_count_arr",
        }},
        {"$project": {
            "_id": 0, "id": 1, "email": 1, "name": 1, "role": 1, "onboarded": 1,
            "created_at": 1, "deleted_at": 1,
            "biz": {"$arrayElemAt": ["$biz", 0]},
            "reports_count": {"$ifNull": [{"$arrayElemAt": ["$reports_count_arr.n", 0]}, 0]},
            "chats_count": {"$ifNull": [{"$arrayElemAt": ["$chats_count_arr.n", 0]}, 0]},
        }},
    ]
    rows = await db.users.aggregate(pipeline).to_list(2000)
    out = []
    for r in rows:
        b = r.get("biz")
        revenue = sum(float(s.get("monthly_amount", 0)) for s in (b.get("revenue_streams", []) if b else []))
        expenses = sum(float(e.get("monthly_amount", 0)) for e in (b.get("expenses", []) if b else []))
        out.append({
            "id": r["id"],
            "email": r["email"],
            "name": r.get("name"),
            "role": r.get("role", "user"),
            "onboarded": r.get("onboarded", False),
            "created_at": r.get("created_at"),
            "deleted_at": r.get("deleted_at"),
            "business": {
                "name": b.get("business_name") if b else None,
                "type": b.get("business_type") if b else None,
                "country": b.get("country") if b else None,
                "currency": b.get("currency", "DZD") if b else None,
                "revenue_monthly": round(revenue, 2),
                "expenses_monthly": round(expenses, 2),
                "profit_monthly": round(revenue - expenses, 2),
                "capital": float(b.get("initial_capital", 0)) if b else 0,
            } if b else None,
            "reports_count": r.get("reports_count", 0),
            "chats_count": r.get("chats_count", 0),
        })
    return out


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    """Soft delete: marks deleted_at on user + business + reports. Reversible."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("deleted_at"):
        raise HTTPException(status_code=400, detail="User already deleted")
    now = datetime.now(timezone.utc).isoformat()
    audit = {"deleted_at": now, "deleted_by": admin["id"]}
    await db.users.update_one({"id": user_id}, {"$set": audit})
    await db.businesses.update_many({"user_id": user_id}, {"$set": audit})
    await db.reports.update_many({"user_id": user_id}, {"$set": audit})
    return {"ok": True, "user_id": user_id, "soft_deleted_at": now}


@router.post("/users/{user_id}/restore")
async def admin_restore_user(user_id: str, _: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not target.get("deleted_at"):
        raise HTTPException(status_code=400, detail="User is not deleted")
    unset = {"deleted_at": "", "deleted_by": ""}
    await db.users.update_one({"id": user_id}, {"$unset": unset})
    await db.businesses.update_many({"user_id": user_id}, {"$unset": unset})
    await db.reports.update_many({"user_id": user_id}, {"$unset": unset})
    return {"ok": True, "user_id": user_id, "restored": True}
