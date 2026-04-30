"""Reports + bank-themed PDF download."""
import io
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from starlette.responses import StreamingResponse

from config import db
from auth_utils import get_current_user
from finance import compute_analysis, compute_forecasts
from pdf_builder import build_pdf
from i18n_data import BANKS, PDF_I18N
from routers.billing import get_effective_tier, PLANS

router = APIRouter(tags=["reports"])


@router.get("/banks")
async def list_banks():
    return [{
        "code": k, "name": v["name"],
        "full_name_fr": v["full_name_fr"], "full_name_en": v["full_name_en"], "full_name_ar": v["full_name_ar"],
        "color": v["color"],
    } for k, v in BANKS.items()]


@router.get("/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    items = await db.reports.find(
        {"user_id": user["id"], "deleted_at": {"$exists": False}}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return items


@router.post("/reports")
async def create_report(user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business data")
    # Plan gate: max_reports
    tier = get_effective_tier(user)
    limits = PLANS[tier]["limits"]
    if limits.get("max_reports", -1) != -1:
        existing = await db.reports.count_documents(
            {"user_id": user["id"], "deleted_at": {"$exists": False}},
        )
        if existing >= limits["max_reports"]:
            raise HTTPException(
                status_code=402,
                detail={"code": "report_limit_reached", "tier": tier, "max": limits["max_reports"]},
            )
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "user_id": user["id"],
        "title": f"Bank-Ready Report — {biz.get('business_name', 'AYMAFIN')}",
        "kind": "bank_ready",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "snapshot": compute_analysis(biz),
    }
    await db.reports.insert_one(doc)
    return {"id": rid, "title": doc["title"]}


@router.get("/reports/{report_id}/pdf")
async def download_report(
    report_id: str, bank: str = "generic", lang: str = "en",
    user: dict = Depends(get_current_user),
):
    rep = await db.reports.find_one(
        {"id": report_id, "user_id": user["id"], "deleted_at": {"$exists": False}}, {"_id": 0},
    )
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business")
    analysis = rep.get("snapshot") or compute_analysis(biz)
    forecasts = compute_forecasts(biz, 12)
    bank_code = bank if bank in BANKS else "generic"
    lang_code = lang if lang in PDF_I18N else "en"
    # Enforce plan-based bank gating
    tier = get_effective_tier(user)
    allowed = PLANS[tier]["limits"].get("banks", ["generic"])
    if allowed != "all" and bank_code not in allowed:
        raise HTTPException(
            status_code=402,
            detail={"code": "bank_locked", "tier": tier, "bank": bank_code, "allowed": allowed},
        )
    pdf_bytes = build_pdf(biz, analysis, forecasts, lang=lang_code, bank_code=bank_code)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="aymafin-{bank_code}-{report_id}.pdf"',
            "X-Bank-Used": bank_code,
            "X-Lang-Used": lang_code,
        },
    )
