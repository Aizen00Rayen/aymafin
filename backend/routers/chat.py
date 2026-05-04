"""Chat (mock-intelligent context-aware replies)."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from config import get_db
from auth_utils import get_current_user
from finance import compute_analysis

router = APIRouter(tags=["chat"])


class ChatIn(BaseModel):
    message: str


@router.post("/chat")
async def chat(body: ChatIn, user: dict = Depends(get_current_user)):
    db = await get_db()
    res = await db.table("businesses").select("*").eq("user_id", user["id"]).maybe_single().execute()
    biz = res.data
    msg = body.message.lower().strip()
    if not biz:
        reply = "Veuillez compléter l'onboarding pour que je puisse analyser votre activité."
    else:
        a = compute_analysis(biz)
        if any(k in msg for k in ["risque", "risk"]):
            reply = (
                f"Niveau de risque actuel : {a['risk_level'].upper()} (score {a['risk_score']}/10). "
                f"Marge {a['margin_pct']:.1f}% · Runway {a['runway_months']} mois."
                if a["runway_months"]
                else f"Niveau de risque actuel : {a['risk_level'].upper()}. Activité profitable."
            )
        elif any(k in msg for k in ["marge", "margin", "profit", "bénéfice", "benefice"]):
            reply = f"Profit mensuel : {a['profit_monthly']:.0f} {a['currency']} (marge {a['margin_pct']:.1f}%)."
        elif any(k in msg for k in ["forecast", "prévision", "prevision", "futur"]):
            reply = "J'ai généré 3 scénarios (optimiste +8%/m, réaliste +3%/m, pessimiste -2%/m). Consultez la page Forecasting."
        elif any(k in msg for k in ["banque", "bank", "crédit", "credit", "loan"]):
            reply = "Pour un dossier bancaire algérien : générez le rapport bank-ready depuis la page Reports."
        elif any(k in msg for k in ["recomman", "advice", "conseil"]):
            top = a["recommendations"][0] if a["recommendations"] else None
            reply = f"Recommandation prioritaire : {top['key']}." if top else "Indicateurs sains."
        else:
            reply = (
                f"Voici un résumé : Revenu {a['revenue_monthly']:.0f}, Charges {a['expenses_monthly']:.0f}, "
                f"Profit {a['profit_monthly']:.0f} {a['currency']}, Risque {a['risk_level'].upper()}."
            )
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "message": body.message,
        "reply": reply,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.table("chat_history").insert(record).execute()
    return {"reply": reply, "id": record["id"]}


@router.get("/chat/history")
async def chat_history(user: dict = Depends(get_current_user)):
    db = await get_db()
    res = await db.table("chat_history").select("*").eq("user_id", user["id"]).order("created_at", desc=False).limit(200).execute()
    return res.data or []
