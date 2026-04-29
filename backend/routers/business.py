"""Business / Onboarding / Analysis / Forecasts."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from config import db
from auth_utils import get_current_user
from finance import compute_analysis, compute_forecasts

router = APIRouter(tags=["business"])


class BusinessIn(BaseModel):
    business_name: str
    business_type: str
    industry: Optional[str] = None
    country: str = "Algeria"
    currency: str = "DZD"
    initial_capital: float = 0
    revenue_streams: List[Dict[str, Any]] = []
    expenses: List[Dict[str, Any]] = []
    employees: int = 0


@router.post("/business")
async def upsert_business(body: BusinessIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["user_id"] = user["id"]
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    existing = await db.businesses.find_one({"user_id": user["id"]})
    if existing:
        await db.businesses.update_one({"user_id": user["id"]}, {"$set": doc})
        bid = existing["id"]
    else:
        bid = str(uuid.uuid4())
        doc["id"] = bid
        doc["created_at"] = doc["updated_at"]
        await db.businesses.insert_one(doc)
    await db.users.update_one({"id": user["id"]}, {"$set": {"onboarded": True}})
    return {"id": bid, "ok": True}


@router.get("/business")
async def get_business(user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    return biz


@router.get("/analysis")
async def get_analysis(user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business data. Complete onboarding first.")
    analysis = compute_analysis(biz)

    base_rev = analysis["revenue_monthly"]
    base_exp = analysis["expenses_monthly"]
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    seasonality = [0.92, 0.95, 1.00, 1.04, 1.08, 1.10, 1.05, 0.98, 1.02, 1.06, 1.12, 1.18]
    cashflow = []
    for i, m in enumerate(months):
        rv = round(base_rev * seasonality[i], 2)
        ex = round(base_exp * (0.95 + 0.05 * (i % 3)), 2)
        cashflow.append({"month": m, "revenue": rv, "expenses": ex, "profit": round(rv - ex, 2)})

    expense_breakdown = [{
        "name": e.get("name", "Unnamed"),
        "value": float(e.get("monthly_amount", 0)),
        "category": e.get("category", "other"),
    } for e in biz.get("expenses", [])]

    now = datetime.now(timezone.utc).isoformat()
    activity = [
        {"id": str(uuid.uuid4()), "key": "activity_analysis_generated", "params": {}, "type": "analysis", "ts": now},
        {"id": str(uuid.uuid4()), "key": "activity_risk_evaluated", "params": {"level": analysis["risk_level"]}, "type": "risk", "ts": now},
        {"id": str(uuid.uuid4()), "key": "activity_recommendations", "params": {"count": len(analysis["recommendations"])}, "type": "reco", "ts": now},
    ]

    return {
        "analysis": analysis,
        "cashflow": cashflow,
        "expense_breakdown": expense_breakdown,
        "activity": activity,
        "business": {"name": biz.get("business_name"), "type": biz.get("business_type"), "country": biz.get("country")},
    }


@router.get("/forecasts")
async def get_forecasts(months: int = 12, user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business data")
    return {"scenarios": compute_forecasts(biz, months), "currency": biz.get("currency", "DZD")}
