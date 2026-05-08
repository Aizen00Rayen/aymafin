"""Reports + bank-themed PDF download."""
import io
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from starlette.responses import StreamingResponse

from config import get_db
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
    db = await get_db()
    res = await db.table("reports").select("*").eq("user_id", user["id"]).is_("deleted_at", "null").order("created_at", desc=True).limit(200).execute()
    return res.data or []


@router.post("/reports")
async def create_report(user: dict = Depends(get_current_user)):
    db = await get_db()
    biz_res = await db.table("businesses").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not biz_res.data:
        raise HTTPException(status_code=404, detail="No business data")
    biz = biz_res.data

    tier = get_effective_tier(user)
    limits = PLANS[tier]["limits"]
    if limits.get("max_reports", -1) != -1:
        count_res = await db.table("reports").select("id", count="exact").eq("user_id", user["id"]).is_("deleted_at", "null").execute()
        existing = count_res.count or 0
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
    await db.table("reports").insert(doc).execute()
    return {"id": rid, "title": doc["title"]}


@router.get("/reports/{report_id}/pdf")
async def download_report(
    report_id: str, bank: str = "generic", lang: str = "en",
    user: dict = Depends(get_current_user),
):
    db = await get_db()
    rep_res = await db.table("reports").select("*").eq("id", report_id).eq("user_id", user["id"]).is_("deleted_at", "null").maybe_single().execute()
    if not rep_res.data:
        raise HTTPException(status_code=404, detail="Report not found")
    rep = rep_res.data

    biz_res = await db.table("businesses").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not biz_res.data:
        raise HTTPException(status_code=404, detail="No business")
    biz = biz_res.data

    analysis = rep.get("snapshot") or compute_analysis(biz)
    forecasts = compute_forecasts(biz, 12)
    bank_code = bank if bank in BANKS else "generic"
    lang_code = lang if lang in PDF_I18N else "en"

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
