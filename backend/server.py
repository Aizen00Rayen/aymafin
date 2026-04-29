from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import uuid
import logging
import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

# ---------- Setup ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="AYMAFIN API")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24 * 7  # 7 days for friendly demo
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15

logger = logging.getLogger("aymafin")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


# ---------- Models ----------
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


class BusinessIn(BaseModel):
    business_name: str
    business_type: str  # e.g. "retail", "services", "manufacturing", "tech", "agriculture"
    industry: Optional[str] = None
    country: str = "Algeria"
    currency: str = "DZD"
    initial_capital: float = 0
    revenue_streams: List[Dict[str, Any]] = []  # [{name, monthly_amount}]
    expenses: List[Dict[str, Any]] = []  # [{name, monthly_amount, category}]
    employees: int = 0


class ChatIn(BaseModel):
    message: str


# ---------- Helpers ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


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
        httponly=True, secure=False, samesite="lax",
        max_age=ACCESS_TTL_MIN * 60, path="/",
    )


def clear_auth_cookie(response: Response):
    response.delete_cookie("access_token", path="/")


def serialize_user(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        email=u["email"],
        name=u.get("name", ""),
        role=u.get("role", "user"),
        onboarded=u.get("onboarded", False),
    )


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
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------- Auth Endpoints ----------
@api_router.post("/auth/register", response_model=UserOut)
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
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
    await db.users.insert_one(user)
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return serialize_user(user)


@api_router.post("/auth/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    # Behind K8s ingress, request.client.host is unreliable. Key the lockout
    # primarily on email so attempts always aggregate.
    identifier = email

    # Brute force lockout
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("locked_until") and datetime.fromisoformat(rec["locked_until"]) > datetime.now(timezone.utc):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        # increment attempts
        attempts = (rec.get("attempts", 0) if rec else 0) + 1
        update = {"identifier": identifier, "attempts": attempts, "updated_at": datetime.now(timezone.utc).isoformat()}
        if attempts >= LOCKOUT_THRESHOLD:
            update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            update["attempts"] = 0
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"identifier": identifier})
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return serialize_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    clear_auth_cookie(response)
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


# ---------- Business / Onboarding ----------
@api_router.post("/business")
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


@api_router.get("/business")
async def get_business(user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        return None
    return biz


# ---------- Financial Engine (Mock AI) ----------
def compute_analysis(biz: dict) -> dict:
    revenue = sum(float(r.get("monthly_amount", 0)) for r in biz.get("revenue_streams", []))
    expenses = sum(float(e.get("monthly_amount", 0)) for e in biz.get("expenses", []))
    profit = revenue - expenses
    margin = (profit / revenue * 100) if revenue > 0 else 0
    capital = float(biz.get("initial_capital", 0) or 0)
    burn_rate = max(expenses - revenue, 0)
    runway_months = (capital / burn_rate) if burn_rate > 0 else None  # None = profitable

    # Risk scoring
    risk_score = 0
    if margin < 0:
        risk_score += 3
    elif margin < 10:
        risk_score += 2
    elif margin < 25:
        risk_score += 1
    if runway_months is not None and runway_months < 6:
        risk_score += 3
    elif runway_months is not None and runway_months < 12:
        risk_score += 1
    if revenue == 0:
        risk_score += 3
    if len(biz.get("revenue_streams", [])) <= 1:
        risk_score += 1

    risk_level = "low" if risk_score <= 1 else ("medium" if risk_score <= 4 else "high")

    # Recommendations (Algerian SME flavoured) — returned as i18n keys + params
    # so the frontend / PDF can localize them based on user language.
    recs = []
    if margin < 15:
        recs.append({"key": "improve_margin", "params": {}})
    if runway_months is not None and runway_months < 9:
        recs.append({"key": "secure_financing", "params": {"runway": round(runway_months, 1)}})
    if len(biz.get("revenue_streams", [])) <= 1:
        recs.append({"key": "diversify_revenue", "params": {}})
    if expenses > 0 and revenue > 0:
        top = max(biz.get("expenses", []), key=lambda x: float(x.get("monthly_amount", 0)), default=None)
        if top and float(top.get("monthly_amount", 0)) / max(expenses, 1) > 0.4:
            recs.append({"key": "optimize_expense", "params": {"name": top["name"]}})
    if not recs:
        recs.append({"key": "scale_up", "params": {}})

    return {
        "revenue_monthly": round(revenue, 2),
        "expenses_monthly": round(expenses, 2),
        "profit_monthly": round(profit, 2),
        "margin_pct": round(margin, 2),
        "burn_rate_monthly": round(burn_rate, 2),
        "runway_months": round(runway_months, 1) if runway_months is not None else None,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "recommendations": recs,
        "currency": biz.get("currency", "DZD"),
    }


def compute_forecasts(biz: dict, months: int = 12) -> dict:
    revenue = sum(float(r.get("monthly_amount", 0)) for r in biz.get("revenue_streams", []))
    expenses = sum(float(e.get("monthly_amount", 0)) for e in biz.get("expenses", []))
    capital = float(biz.get("initial_capital", 0) or 0)

    scenarios = {
        "optimistic": {"rev_growth": 0.08, "exp_growth": 0.02},  # 8%/m revenue, 2%/m expenses
        "realistic":  {"rev_growth": 0.03, "exp_growth": 0.02},
        "pessimistic":{"rev_growth": -0.02, "exp_growth": 0.04},
    }
    out = {}
    for name, p in scenarios.items():
        series = []
        rev, exp, cash = revenue, expenses, capital
        for m in range(1, months + 1):
            rev = rev * (1 + p["rev_growth"])
            exp = exp * (1 + p["exp_growth"])
            cash = cash + (rev - exp)
            series.append({
                "month": m,
                "revenue": round(rev, 2),
                "expenses": round(exp, 2),
                "profit": round(rev - exp, 2),
                "cash": round(cash, 2),
            })
        out[name] = series
    return out


@api_router.get("/analysis")
async def get_analysis(user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business data. Complete onboarding first.")
    analysis = compute_analysis(biz)
    # Simulate cashflow & expense breakdown for charts
    base_rev = analysis["revenue_monthly"]
    base_exp = analysis["expenses_monthly"]
    cashflow = []
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    seasonality = [0.92, 0.95, 1.00, 1.04, 1.08, 1.10, 1.05, 0.98, 1.02, 1.06, 1.12, 1.18]
    for i, m in enumerate(months):
        rv = round(base_rev * seasonality[i], 2)
        ex = round(base_exp * (0.95 + 0.05 * (i % 3)), 2)
        cashflow.append({"month": m, "revenue": rv, "expenses": ex, "profit": round(rv - ex, 2)})

    expense_breakdown = []
    for e in biz.get("expenses", []):
        expense_breakdown.append({
            "name": e.get("name", "Unnamed"),
            "value": float(e.get("monthly_amount", 0)),
            "category": e.get("category", "other"),
        })

    activity = [
        {"id": str(uuid.uuid4()), "key": "activity_analysis_generated", "params": {}, "type": "analysis", "ts": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "key": "activity_risk_evaluated", "params": {"level": analysis['risk_level']}, "type": "risk", "ts": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "key": "activity_recommendations", "params": {"count": len(analysis['recommendations'])}, "type": "reco", "ts": datetime.now(timezone.utc).isoformat()},
    ]

    return {
        "analysis": analysis,
        "cashflow": cashflow,
        "expense_breakdown": expense_breakdown,
        "activity": activity,
        "business": {"name": biz.get("business_name"), "type": biz.get("business_type"), "country": biz.get("country")},
    }


@api_router.get("/forecasts")
async def get_forecasts(months: int = 12, user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business data")
    return {"scenarios": compute_forecasts(biz, months), "currency": biz.get("currency", "DZD")}


# ---------- Reports ----------
@api_router.get("/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    items = await db.reports.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api_router.post("/reports")
async def create_report(user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business data")
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


# ---------- i18n & Bank dictionaries (used by PDF and chat) ----------
PDF_I18N = {
    "fr": {
        "title": "Rapport Financier prêt pour la Banque",
        "business": "Entreprise", "type": "Type", "country": "Pays", "currency": "Devise",
        "generated": "Généré le",
        "exec_summary": "Résumé exécutif",
        "indicator": "Indicateur", "value": "Valeur",
        "rev_m": "Revenu mensuel", "exp_m": "Charges mensuelles", "profit_m": "Profit mensuel",
        "margin": "Marge brute", "burn": "Burn rate (mensuel)",
        "runway": "Runway", "months": "mois", "profitable": "Rentable",
        "risk": "Niveau de risque",
        "recos": "Recommandations",
        "forecast_title": "Prévision 12 mois (scénario réaliste)",
        "month": "Mois", "rev": "Revenu", "exp": "Charges", "profit": "Profit", "cash": "Trésorerie",
        "lender_notes": "Notes pour le prêteur",
        "rec": {
            "improve_margin": ("Améliorer la marge brute", "Renégocier vos contrats fournisseurs et viser une marge brute > 25%, standard exigé par la plupart des banques algériennes."),
            "secure_financing": ("Sécuriser un financement", "Préparer un dossier de crédit (compte d'exploitation prévisionnel + bilan) — runway actuel: {runway} mois."),
            "diversify_revenue": ("Diversifier les revenus", "Une dépendance à un seul flux de revenus augmente le risque. Ajoutez 1 à 2 streams complémentaires."),
            "optimize_expense": ("Optimiser '{name}'", "Cette ligne représente plus de 40% de vos charges. Identifier des leviers de réduction."),
            "scale_up": ("Préparer le passage à l'échelle", "Indicateurs sains. Définir un plan d'investissement 12 mois pour accélérer la croissance."),
        },
        "activity": {
            "activity_analysis_generated": "Analyse mensuelle générée",
            "activity_risk_evaluated": "Risque évalué: {level}",
            "activity_recommendations": "{count} recommandation(s) disponibles",
        },
    },
    "en": {
        "title": "Bank-Ready Financial Report",
        "business": "Business", "type": "Type", "country": "Country", "currency": "Currency",
        "generated": "Generated",
        "exec_summary": "Executive Summary",
        "indicator": "Indicator", "value": "Value",
        "rev_m": "Monthly Revenue", "exp_m": "Monthly Expenses", "profit_m": "Monthly Profit",
        "margin": "Gross Margin", "burn": "Burn Rate (monthly)",
        "runway": "Runway", "months": "months", "profitable": "Profitable",
        "risk": "Risk Level",
        "recos": "Recommendations",
        "forecast_title": "12-Month Forecast (Realistic Scenario)",
        "month": "Month", "rev": "Revenue", "exp": "Expenses", "profit": "Profit", "cash": "Cash",
        "lender_notes": "Notes for the Lender",
        "rec": {
            "improve_margin": ("Improve gross margin", "Renegotiate supplier contracts and target a gross margin > 25%, the standard expected by most Algerian banks."),
            "secure_financing": ("Secure financing", "Prepare a credit file (forecast P&L + balance sheet) — current runway: {runway} months."),
            "diversify_revenue": ("Diversify revenue", "Reliance on a single revenue stream increases risk. Add 1–2 complementary streams."),
            "optimize_expense": ("Optimize '{name}'", "This line represents over 40% of your expenses. Identify reduction levers."),
            "scale_up": ("Prepare to scale", "Healthy indicators. Define a 12-month investment plan to accelerate growth."),
        },
        "activity": {
            "activity_analysis_generated": "Monthly analysis generated",
            "activity_risk_evaluated": "Risk evaluated: {level}",
            "activity_recommendations": "{count} recommendation(s) available",
        },
    },
    "ar": {
        "title": "تقرير مالي جاهز للبنك",
        "business": "الشركة", "type": "النوع", "country": "البلد", "currency": "العملة",
        "generated": "أُنشئ في",
        "exec_summary": "الملخص التنفيذي",
        "indicator": "المؤشر", "value": "القيمة",
        "rev_m": "الإيراد الشهري", "exp_m": "المصروفات الشهرية", "profit_m": "الربح الشهري",
        "margin": "الهامش الإجمالي", "burn": "معدل الإنفاق (شهري)",
        "runway": "المدة المالية", "months": "أشهر", "profitable": "مربح",
        "risk": "مستوى المخاطر",
        "recos": "التوصيات",
        "forecast_title": "توقعات 12 شهر (السيناريو الواقعي)",
        "month": "الشهر", "rev": "الإيراد", "exp": "المصروفات", "profit": "الربح", "cash": "السيولة",
        "lender_notes": "ملاحظات للمقرض",
        "rec": {
            "improve_margin": ("تحسين الهامش الإجمالي", "أعد التفاوض على عقود الموردين واستهدف هامشًا إجماليًا > 25%، وهو المعيار المطلوب من معظم البنوك الجزائرية."),
            "secure_financing": ("تأمين التمويل", "حضّر ملف ائتمان (حساب استغلال تقديري + ميزانية) — المدة المالية الحالية: {runway} أشهر."),
            "diversify_revenue": ("تنويع الإيرادات", "الاعتماد على مصدر إيراد واحد يزيد المخاطر. أضف 1 إلى 2 من المصادر التكميلية."),
            "optimize_expense": ("تحسين '{name}'", "يمثل هذا البند أكثر من 40% من مصروفاتك. حدد روافع التخفيض."),
            "scale_up": ("الاستعداد للتوسع", "مؤشرات صحية. ضع خطة استثمار 12 شهرًا لتسريع النمو."),
        },
        "activity": {
            "activity_analysis_generated": "تم إنشاء التحليل الشهري",
            "activity_risk_evaluated": "تم تقييم المخاطر: {level}",
            "activity_recommendations": "{count} توصية متاحة",
        },
    },
}

# Algerian bank profiles (color, full name, FR/EN/AR labels, cover note)
BANKS = {
    "generic": {
        "name": "AYMAFIN",
        "full_name_fr": "Rapport générique", "full_name_en": "Generic Report", "full_name_ar": "تقرير عام",
        "color": "#2563eb", "accent": "#22c55e",
        "tagline_fr": "Rapport prêt pour dépôt bancaire (toutes banques)",
        "tagline_en": "Bank-ready financial report (any bank)",
        "tagline_ar": "تقرير مالي جاهز لأي بنك",
    },
    "bna": {
        "name": "BNA",
        "full_name_fr": "Banque Nationale d'Algérie", "full_name_en": "National Bank of Algeria", "full_name_ar": "البنك الوطني الجزائري",
        "color": "#0e7c3a", "accent": "#fbbf24",
        "tagline_fr": "Dossier de crédit conforme aux exigences BNA — Direction des Crédits PME",
        "tagline_en": "Credit file aligned with BNA SME credit-desk requirements",
        "tagline_ar": "ملف ائتمان متوافق مع متطلبات BNA لقطاع المؤسسات الصغيرة والمتوسطة",
    },
    "bea": {
        "name": "BEA",
        "full_name_fr": "Banque Extérieure d'Algérie", "full_name_en": "External Bank of Algeria", "full_name_ar": "بنك الجزائر الخارجي",
        "color": "#1e3a8a", "accent": "#ef4444",
        "tagline_fr": "Dossier de crédit conforme à la grille d'analyse BEA — Direction du Financement",
        "tagline_en": "Credit file aligned with BEA analysis grid — Financing Department",
        "tagline_ar": "ملف ائتمان متوافق مع شبكة تحليل BEA — قسم التمويل",
    },
    "cpa": {
        "name": "CPA",
        "full_name_fr": "Crédit Populaire d'Algérie", "full_name_en": "Popular Credit of Algeria", "full_name_ar": "القرض الشعبي الجزائري",
        "color": "#7c2d12", "accent": "#f59e0b",
        "tagline_fr": "Dossier conforme aux exigences CPA pour le financement des PME",
        "tagline_en": "File aligned with CPA SME financing requirements",
        "tagline_ar": "ملف متوافق مع متطلبات CPA لتمويل المؤسسات الصغيرة والمتوسطة",
    },
    "badr": {
        "name": "BADR",
        "full_name_fr": "Banque de l'Agriculture et du Développement Rural", "full_name_en": "Agriculture and Rural Development Bank", "full_name_ar": "بنك الفلاحة والتنمية الريفية",
        "color": "#15803d", "accent": "#84cc16",
        "tagline_fr": "Dossier orienté Agriculture & Développement Rural — éligibilité BADR",
        "tagline_en": "Agriculture & Rural Development-oriented file — BADR eligibility",
        "tagline_ar": "ملف موجه نحو الفلاحة والتنمية الريفية — أهلية BADR",
    },
}


def _build_pdf(biz: dict, analysis: dict, forecasts: dict, lang: str = "en", bank_code: str = "generic") -> bytes:
    L = PDF_I18N.get(lang, PDF_I18N["en"])
    B = BANKS.get(bank_code, BANKS["generic"])
    bank_color = colors.HexColor(B["color"])
    bank_accent = colors.HexColor(B["accent"])
    bank_full = B.get(f"full_name_{lang}", B["full_name_en"])
    bank_tagline = B.get(f"tagline_{lang}", B["tagline_en"])

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=22, textColor=colors.HexColor("#0a0a0b"), spaceAfter=6)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#52525b"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=bank_color, spaceBefore=14, spaceAfter=8)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#18181b"))
    bank_band = ParagraphStyle("band", parent=styles["Normal"], fontSize=11, textColor=colors.white, alignment=1)

    story = []
    # Bank-coloured header band
    band_table = Table([[Paragraph(f"<b>{B['name']}</b>  ·  {bank_full}", bank_band)]], colWidths=[17*cm])
    band_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bank_color),
        ("TOPPADDING", (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ]))
    story.append(band_table)
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(f"AYMAFIN — {L['title']}", title_style))
    story.append(Paragraph(f"<i>{bank_tagline}</i>", ParagraphStyle("tag", parent=sub_style, textColor=bank_accent, fontSize=9)))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        f"{L['business']}: <b>{biz.get('business_name','—')}</b> · {L['type']}: {biz.get('business_type','—')} · "
        f"{L['country']}: {biz.get('country','Algeria')} · {L['currency']}: {biz.get('currency','DZD')}", sub_style))
    story.append(Paragraph(f"{L['generated']}: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", sub_style))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(L["exec_summary"], h2))
    cur = analysis["currency"]
    runway_str = (f"{analysis['runway_months']} {L['months']}"
                  if analysis["runway_months"] is not None else L["profitable"])
    summary_data = [
        [L["indicator"], L["value"]],
        [L["rev_m"], f"{analysis['revenue_monthly']:,.0f} {cur}"],
        [L["exp_m"], f"{analysis['expenses_monthly']:,.0f} {cur}"],
        [L["profit_m"], f"{analysis['profit_monthly']:,.0f} {cur}"],
        [L["margin"], f"{analysis['margin_pct']:.1f} %"],
        [L["burn"], f"{analysis['burn_rate_monthly']:,.0f} {cur}"],
        [L["runway"], runway_str],
        [L["risk"], analysis["risk_level"].upper()],
    ]
    t = Table(summary_data, colWidths=[7*cm, 8*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), bank_color),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e4e4e7")),
        ("ALIGN", (1,1), (1,-1), "RIGHT"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f4f4f5")]),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(t)

    story.append(Paragraph(L["recos"], h2))
    for r in analysis["recommendations"]:
        title_tpl, detail_tpl = L["rec"].get(r["key"], ("", ""))
        try:
            title = title_tpl.format(**(r.get("params") or {}))
            detail = detail_tpl.format(**(r.get("params") or {}))
        except Exception:
            title, detail = title_tpl, detail_tpl
        story.append(Paragraph(f"<b>{title}</b> — {detail}", body))
        story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph(L["forecast_title"], h2))
    scen = forecasts.get("realistic", [])[:12]
    f_data = [[L["month"], f"{L['rev']} ({cur})", f"{L['exp']} ({cur})", f"{L['profit']} ({cur})", f"{L['cash']} ({cur})"]]
    for row in scen:
        f_data.append([str(row["month"]), f"{row['revenue']:,.0f}", f"{row['expenses']:,.0f}", f"{row['profit']:,.0f}", f"{row['cash']:,.0f}"])
    ft = Table(f_data, colWidths=[1.5*cm, 3.5*cm, 3.5*cm, 3.5*cm, 3.5*cm])
    ft.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), bank_accent),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("GRID", (0,0), (-1,-1), 0.4, colors.HexColor("#e4e4e7")),
        ("ALIGN", (1,1), (-1,-1), "RIGHT"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f4f4f5")]),
    ]))
    story.append(ft)

    story.append(PageBreak())
    story.append(Paragraph(L["lender_notes"], h2))
    notes = {
        "fr": f"Ce rapport est produit par le moteur de décision automatisé d'AYMAFIN à l'attention de {bank_full} ({B['name']}). "
              f"La méthodologie combine les déclarations mensuelles de revenus/charges avec des prévisions stress-testées sur 3 scénarios. "
              f"Les chiffres doivent être recoupés avec les états financiers audités avant la décision finale.",
        "en": f"This report is produced by AYMAFIN's automated decision engine for {bank_full} ({B['name']}). "
              f"The methodology combines monthly revenue/expense self-declarations with stress-tested forecasts across 3 scenarios. "
              f"Figures should be cross-referenced with audited financial statements before final underwriting.",
        "ar": f"يُنتج هذا التقرير بواسطة محرك القرارات الآلي لـ AYMAFIN لصالح {bank_full} ({B['name']}). "
              f"تجمع المنهجية بين التصريحات الشهرية بالإيرادات والمصروفات وتوقعات اختُبرت ضد الضغط عبر 3 سيناريوهات. "
              f"يجب التحقق من الأرقام مقابل البيانات المالية المراجعة قبل اتخاذ القرار النهائي.",
    }.get(lang, "")
    story.append(Paragraph(notes, body))
    doc.build(story)
    return buf.getvalue()


@api_router.get("/banks")
async def list_banks():
    """List supported bank templates for PDF generation."""
    return [{"code": k, "name": v["name"], "full_name_fr": v["full_name_fr"], "full_name_en": v["full_name_en"], "full_name_ar": v["full_name_ar"], "color": v["color"]} for k, v in BANKS.items()]


@api_router.get("/reports/{report_id}/pdf")
async def download_report(report_id: str, bank: str = "generic", lang: str = "en", user: dict = Depends(get_current_user)):
    rep = await db.reports.find_one({"id": report_id, "user_id": user["id"]}, {"_id": 0})
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="No business")
    analysis = rep.get("snapshot") or compute_analysis(biz)
    forecasts = compute_forecasts(biz, 12)
    bank_code = bank if bank in BANKS else "generic"
    lang_code = lang if lang in PDF_I18N else "en"
    pdf_bytes = _build_pdf(biz, analysis, forecasts, lang=lang_code, bank_code=bank_code)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="aymafin-{bank_code}-{report_id}.pdf"'},
    )


# ---------- Admin ----------
async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    onboarded = await db.users.count_documents({"onboarded": True})
    total_businesses = await db.businesses.count_documents({})
    total_reports = await db.reports.count_documents({})
    total_chats = await db.chat_history.count_documents({})
    # Last 7 days new users
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_7d = await db.users.count_documents({"created_at": {"$gte": cutoff}})
    return {
        "total_users": total_users,
        "onboarded_users": onboarded,
        "total_businesses": total_businesses,
        "total_reports": total_reports,
        "total_chats": total_chats,
        "new_users_7d": new_7d,
    }


@api_router.get("/admin/users")
async def admin_list_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    user_ids = [u["id"] for u in users]
    bizs = await db.businesses.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)
    biz_by_user = {b["user_id"]: b for b in bizs}
    out = []
    for u in users:
        b = biz_by_user.get(u["id"])
        reports_count = await db.reports.count_documents({"user_id": u["id"]})
        chats_count = await db.chat_history.count_documents({"user_id": u["id"]})
        revenue = sum(float(r.get("monthly_amount", 0)) for r in (b.get("revenue_streams", []) if b else []))
        expenses = sum(float(e.get("monthly_amount", 0)) for e in (b.get("expenses", []) if b else []))
        out.append({
            "id": u["id"],
            "email": u["email"],
            "name": u.get("name"),
            "role": u.get("role", "user"),
            "onboarded": u.get("onboarded", False),
            "created_at": u.get("created_at"),
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
            "reports_count": reports_count,
            "chats_count": chats_count,
        })
    return out


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": user_id})
    await db.businesses.delete_many({"user_id": user_id})
    await db.reports.delete_many({"user_id": user_id})
    await db.chat_history.delete_many({"user_id": user_id})
    return {"ok": True, "deleted_user": user_id}


# ---------- Chat (mock intelligent) ----------
@api_router.post("/chat")
async def chat(body: ChatIn, user: dict = Depends(get_current_user)):
    biz = await db.businesses.find_one({"user_id": user["id"]}, {"_id": 0})
    msg = body.message.lower().strip()
    if not biz:
        reply = "Veuillez compléter l'onboarding pour que je puisse analyser votre activité."
    else:
        a = compute_analysis(biz)
        if any(k in msg for k in ["risque", "risk"]):
            reply = f"Niveau de risque actuel : {a['risk_level'].upper()} (score {a['risk_score']}/10). " \
                    f"Marge {a['margin_pct']:.1f}% · Runway {a['runway_months']} mois." if a['runway_months'] else \
                    f"Niveau de risque actuel : {a['risk_level'].upper()}. Activité profitable."
        elif any(k in msg for k in ["marge", "margin", "profit", "bénéfice", "benefice"]):
            reply = f"Profit mensuel : {a['profit_monthly']:.0f} {a['currency']} (marge {a['margin_pct']:.1f}%)."
        elif any(k in msg for k in ["forecast", "prévision", "prevision", "futur"]):
            reply = "J'ai généré 3 scénarios (optimiste +8%/m, réaliste +3%/m, pessimiste -2%/m). Consultez la page Forecasting."
        elif any(k in msg for k in ["banque", "bank", "crédit", "credit", "loan"]):
            reply = "Pour un dossier bancaire algérien : générez le rapport bank-ready depuis la page Reports. Il contient marge, runway, scénarios et recommandations."
        elif any(k in msg for k in ["recomman", "advice", "conseil"]):
            top = a["recommendations"][0] if a["recommendations"] else None
            reply = f"Recommandation prioritaire : {top['title']} — {top['detail']}" if top else "Indicateurs sains."
        else:
            reply = f"Voici un résumé : Revenu {a['revenue_monthly']:.0f}, Charges {a['expenses_monthly']:.0f}, " \
                    f"Profit {a['profit_monthly']:.0f} {a['currency']}, Risque {a['risk_level'].upper()}."
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "message": body.message,
        "reply": reply,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_history.insert_one(record)
    return {"reply": reply, "id": record["id"]}


@api_router.get("/chat/history")
async def chat_history(user: dict = Depends(get_current_user)):
    items = await db.chat_history.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return items


# ---------- Health ----------
@api_router.get("/")
async def root():
    return {"app": "AYMAFIN", "status": "ok"}


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.businesses.create_index("user_id")
    await db.reports.create_index([("user_id", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@aymafin.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "AYMAFIN Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "onboarded": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}})
    elif existing.get("role") != "admin":
        await db.users.update_one({"email": admin_email}, {"$set": {"role": "admin"}})


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
