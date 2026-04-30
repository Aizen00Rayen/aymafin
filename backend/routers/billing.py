"""Billing: Stripe Checkout + payment polling + plan enforcement helpers."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

from config import db
from auth_utils import get_current_user

router = APIRouter(tags=["billing"])

# Server-side fixed plans (NEVER trust client amounts).
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
    api_key = os.environ["STRIPE_API_KEY"]
    return StripeCheckout(api_key=api_key, webhook_url=f"{host_url}api/webhook/stripe")


def get_effective_tier(user: dict) -> str:
    """Return current effective tier — falls back to 'free' if subscription expired."""
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


async def get_plan_limits_for_user(user: dict) -> dict:
    return PLANS[get_effective_tier(user)]["limits"]


# ---------- Public endpoints ----------
class CheckoutIn(BaseModel):
    plan_id: str
    origin_url: str  # window.location.origin from frontend


@router.get("/billing/plans")
async def list_plans():
    return [
        {"id": p["id"], "amount": p["amount"], "currency": p["currency"], "limits": p["limits"]}
        for p in PLANS.values()
    ]


@router.get("/billing/me")
async def my_subscription(user: dict = Depends(get_current_user)):
    tier = get_effective_tier(user)
    sub = user.get("subscription") or {}
    return {
        "tier": tier,
        "limits": PLANS[tier]["limits"],
        "expires_at": sub.get("expires_at"),
        "raw_tier": sub.get("tier", "free"),  # what was paid (may be expired)
    }


@router.post("/billing/checkout")
async def create_checkout(body: CheckoutIn, request: Request, user: dict = Depends(get_current_user)):
    if body.plan_id not in PLANS or body.plan_id == "free":
        raise HTTPException(status_code=400, detail="Invalid plan")
    plan = PLANS[body.plan_id]
    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pricing"

    host_url = str(request.base_url)  # ends with '/'
    stripe = _stripe_client(host_url)

    metadata = {
        "user_id": user["id"],
        "user_email": user["email"],
        "plan_id": plan["id"],
        "source": "aymafin_web",
    }
    req = CheckoutSessionRequest(
        amount=float(plan["amount"]),
        currency=plan["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )
    session = await stripe.create_checkout_session(req)

    # Record pending transaction BEFORE redirect (idempotency anchor)
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "user_id": user["id"],
        "user_email": user["email"],
        "plan_id": plan["id"],
        "amount": plan["amount"],
        "currency": plan["currency"],
        "status": "pending",
        "payment_status": "unpaid",
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"url": session.url, "session_id": session.session_id}


@router.get("/billing/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    txn = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["id"]}, {"_id": 0},
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Idempotent: if already finalized, return cached state
    if txn.get("status") in ("paid", "expired", "cancelled"):
        return _public_txn(txn)

    host_url = str(request.base_url)
    stripe = _stripe_client(host_url)
    cs = await stripe.get_checkout_status(session_id)

    update = {
        "status": cs.status,
        "payment_status": cs.payment_status,
        "amount_total": cs.amount_total,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if cs.payment_status == "paid":
        update["status"] = "paid"
        # Grant 30 days from now (or extend current)
        existing_sub = user.get("subscription") or {}
        now = datetime.now(timezone.utc)
        current_expires = None
        try:
            current_expires = datetime.fromisoformat(existing_sub["expires_at"]) if existing_sub.get("expires_at") else None
        except Exception:
            current_expires = None
        base = current_expires if (current_expires and current_expires > now and existing_sub.get("tier") == txn["plan_id"]) else now
        new_expires = base + timedelta(days=30)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "subscription": {
                    "tier": txn["plan_id"],
                    "expires_at": new_expires.isoformat(),
                    "last_session_id": session_id,
                    "started_at": existing_sub.get("started_at") or now.isoformat(),
                },
            }},
        )

    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update})
    txn = {**txn, **update}
    return _public_txn(txn)


def _public_txn(txn: dict) -> dict:
    return {
        "session_id": txn["session_id"],
        "status": txn.get("status"),
        "payment_status": txn.get("payment_status"),
        "plan_id": txn.get("plan_id"),
        "amount": txn.get("amount"),
        "currency": txn.get("currency"),
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url)
    stripe = _stripe_client(host_url)
    try:
        evt = await stripe.handle_webhook(body, sig)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {e}")

    if evt.session_id and evt.payment_status == "paid":
        txn = await db.payment_transactions.find_one({"session_id": evt.session_id})
        if txn and txn.get("status") != "paid":
            user_id = (evt.metadata or {}).get("user_id") or txn.get("user_id")
            plan_id = (evt.metadata or {}).get("plan_id") or txn.get("plan_id")
            if user_id and plan_id:
                user = await db.users.find_one({"id": user_id})
                now = datetime.now(timezone.utc)
                existing = (user or {}).get("subscription") or {}
                current_expires = None
                try:
                    current_expires = datetime.fromisoformat(existing["expires_at"]) if existing.get("expires_at") else None
                except Exception:
                    current_expires = None
                base = current_expires if (current_expires and current_expires > now and existing.get("tier") == plan_id) else now
                new_expires = base + timedelta(days=30)
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"subscription": {
                        "tier": plan_id,
                        "expires_at": new_expires.isoformat(),
                        "last_session_id": evt.session_id,
                        "started_at": existing.get("started_at") or now.isoformat(),
                    }}},
                )
                await db.payment_transactions.update_one(
                    {"session_id": evt.session_id},
                    {"$set": {"status": "paid", "payment_status": "paid",
                              "updated_at": now.isoformat()}},
                )
    return {"received": True}
