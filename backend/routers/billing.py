"""Billing: Stripe Checkout + plan enforcement helpers."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest

from config import get_db
from auth_utils import get_current_user

router = APIRouter(tags=["billing"])

PLANS = {
    "free": {
        "id": "free", "amount": 0.00, "currency": "usd",
        "limits": {"max_reports": 3, "banks": ["generic"], "max_businesses": 1},
        "label_key": "free",
    },
    "pro": {
        "id": "pro", "amount": 9.99, "currency": "usd",
        "limits": {"max_reports": 50, "banks": "all", "max_businesses": 5},
        "label_key": "pro",
    },
    "bank_ready": {
        "id": "bank_ready", "amount": 49.00, "currency": "usd",
        "limits": {"max_reports": -1, "banks": "all", "max_businesses": -1, "white_label": True},
        "label_key": "bank_ready",
    },
}


def _stripe_client(host_url: str) -> StripeCheckout:
    return StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url=f"{host_url}api/webhook/stripe")


def get_effective_tier(user: dict) -> str:
    sub = user.get("subscription") or {}
    tier = sub.get("tier", "free")
    if tier == "free":
        return "free"
    expires = sub.get("expires_at")
    if not expires:
        return "free"
    try:
        if datetime.fromisoformat(expires) > datetime.now(timezone.utc):
            return tier
    except Exception:
        pass
    return "free"


class CheckoutIn(BaseModel):
    plan_id: str
    origin_url: str


@router.get("/billing/plans")
async def list_plans():
    return [{"id": p["id"], "amount": p["amount"], "currency": p["currency"], "limits": p["limits"]} for p in PLANS.values()]


@router.get("/billing/me")
async def my_subscription(user: dict = Depends(get_current_user)):
    tier = get_effective_tier(user)
    sub = user.get("subscription") or {}
    return {"tier": tier, "limits": PLANS[tier]["limits"], "expires_at": sub.get("expires_at"), "raw_tier": sub.get("tier", "free")}


@router.post("/billing/checkout")
async def create_checkout(body: CheckoutIn, request: Request, user: dict = Depends(get_current_user)):
    if body.plan_id not in PLANS or body.plan_id == "free":
        raise HTTPException(status_code=400, detail="Invalid plan")
    plan = PLANS[body.plan_id]
    origin = body.origin_url.rstrip("/")
    stripe = _stripe_client(str(request.base_url))
    metadata = {"user_id": user["id"], "user_email": user["email"], "plan_id": plan["id"], "source": "aymafin_web"}
    req = CheckoutSessionRequest(
        amount=float(plan["amount"]), currency=plan["currency"],
        success_url=f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/pricing", metadata=metadata,
    )
    session = await stripe.create_checkout_session(req)
    db = await get_db()
    await db.table("payment_transactions").insert({
        "id": str(uuid.uuid4()), "session_id": session.session_id,
        "user_id": user["id"], "user_email": user["email"],
        "plan_id": plan["id"], "amount": plan["amount"], "currency": plan["currency"],
        "status": "pending", "payment_status": "unpaid", "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"url": session.url, "session_id": session.session_id}


@router.get("/billing/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    db = await get_db()
    txn_res = await db.table("payment_transactions").select("*").eq("session_id", session_id).eq("user_id", user["id"]).maybe_single().execute()
    if not txn_res.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn = txn_res.data
    if txn.get("status") in ("paid", "expired", "cancelled"):
        return _public_txn(txn)

    stripe = _stripe_client(str(request.base_url))
    cs = await stripe.get_checkout_status(session_id)
    update = {"status": cs.status, "payment_status": cs.payment_status, "amount_total": cs.amount_total, "updated_at": datetime.now(timezone.utc).isoformat()}

    if cs.payment_status == "paid":
        update["status"] = "paid"
        sub = user.get("subscription") or {}
        now = datetime.now(timezone.utc)
        try:
            current_expires = datetime.fromisoformat(sub["expires_at"]) if sub.get("expires_at") else None
        except Exception:
            current_expires = None
        base = current_expires if (current_expires and current_expires > now and sub.get("tier") == txn["plan_id"]) else now
        new_expires = base + timedelta(days=30)
        await db.table("users").update({"subscription": {"tier": txn["plan_id"], "expires_at": new_expires.isoformat(), "last_session_id": session_id, "started_at": sub.get("started_at") or now.isoformat()}}).eq("id", user["id"]).execute()

    await db.table("payment_transactions").update(update).eq("session_id", session_id).execute()
    return _public_txn({**txn, **update})


def _public_txn(txn: dict) -> dict:
    return {"session_id": txn["session_id"], "status": txn.get("status"), "payment_status": txn.get("payment_status"), "plan_id": txn.get("plan_id"), "amount": txn.get("amount"), "currency": txn.get("currency")}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    stripe = _stripe_client(str(request.base_url))
    try:
        evt = await stripe.handle_webhook(body, sig)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {e}")

    if evt.session_id and evt.payment_status == "paid":
        db = await get_db()
        txn_res = await db.table("payment_transactions").select("*").eq("session_id", evt.session_id).maybe_single().execute()
        txn = txn_res.data
        if txn and txn.get("status") != "paid":
            user_id = (evt.metadata or {}).get("user_id") or txn.get("user_id")
            plan_id = (evt.metadata or {}).get("plan_id") or txn.get("plan_id")
            if user_id and plan_id:
                user_res = await db.table("users").select("subscription").eq("id", user_id).maybe_single().execute()
                user = user_res.data or {}
                existing = (user.get("subscription") or {})
                now = datetime.now(timezone.utc)
                try:
                    current_expires = datetime.fromisoformat(existing["expires_at"]) if existing.get("expires_at") else None
                except Exception:
                    current_expires = None
                base = current_expires if (current_expires and current_expires > now and existing.get("tier") == plan_id) else now
                new_expires = base + timedelta(days=30)
                await db.table("users").update({"subscription": {"tier": plan_id, "expires_at": new_expires.isoformat(), "last_session_id": evt.session_id, "started_at": existing.get("started_at") or now.isoformat()}}).eq("id", user_id).execute()
                await db.table("payment_transactions").update({"status": "paid", "payment_status": "paid", "updated_at": now.isoformat()}).eq("session_id", evt.session_id).execute()
    return {"received": True}
