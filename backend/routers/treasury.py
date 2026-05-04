"""Treasury management — cash flow entries and invoice tracking."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import get_db
from auth_utils import get_current_user

router = APIRouter(tags=["treasury"])


class TreasuryEntryIn(BaseModel):
    date: str
    label: str
    amount: float
    type: str  # "income" | "expense"
    category: Optional[str] = None


class InvoiceIn(BaseModel):
    invoice_number: str
    name: str
    label: str
    amount: float
    type: str  # "incoming" | "outgoing"
    date: str
    status: str = "pending"


@router.get("/treasury/summary")
async def get_treasury_summary(period: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = await get_db()
    q = db.table("treasury_entries").select("*").eq("user_id", user["id"])
    if period:
        q = q.like("date", f"{period[:7]}%")
    res = await q.execute()
    entries = res.data or []
    total_income = sum(e["amount"] for e in entries if e["type"] == "income")
    total_expense = sum(e["amount"] for e in entries if e["type"] == "expense")
    monthly: dict = {}
    for e in entries:
        m = e["date"][:7]
        if m not in monthly:
            monthly[m] = {"month": m, "income": 0.0, "expense": 0.0}
        if e["type"] == "income":
            monthly[m]["income"] += e["amount"]
        else:
            monthly[m]["expense"] += e["amount"]
    monthly_list = sorted(monthly.values(), key=lambda x: x["month"])
    for row in monthly_list:
        row["income"] = round(row["income"], 2)
        row["expense"] = round(row["expense"], 2)
    return {"balance": round(total_income - total_expense, 2), "total_income": round(total_income, 2), "total_expense": round(total_expense, 2), "monthly": monthly_list}


@router.get("/treasury/entries")
async def get_treasury_entries(period: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = await get_db()
    q = db.table("treasury_entries").select("*").eq("user_id", user["id"])
    if period:
        q = q.like("date", f"{period[:7]}%")
    res = await q.order("date", desc=True).limit(1000).execute()
    return res.data or []


@router.post("/treasury/entries")
async def create_treasury_entry(body: TreasuryEntryIn, user: dict = Depends(get_current_user)):
    if body.type not in ("income", "expense"):
        raise HTTPException(400, "Le type doit être 'income' ou 'expense'")
    db = await get_db()
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.table("treasury_entries").insert(doc).execute()
    return {"id": doc["id"], "ok": True}


@router.delete("/treasury/entries/{entry_id}")
async def delete_treasury_entry(entry_id: str, user: dict = Depends(get_current_user)):
    db = await get_db()
    res = await db.table("treasury_entries").delete().eq("id", entry_id).eq("user_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Entrée introuvable")
    return {"ok": True}


@router.get("/treasury/invoices")
async def get_invoices(user: dict = Depends(get_current_user)):
    db = await get_db()
    res = await db.table("invoices").select("*").eq("user_id", user["id"]).order("date", desc=True).limit(1000).execute()
    return res.data or []


@router.post("/treasury/invoices")
async def create_invoice(body: InvoiceIn, user: dict = Depends(get_current_user)):
    if body.type not in ("incoming", "outgoing"):
        raise HTTPException(400, "Le type doit être 'incoming' ou 'outgoing'")
    if body.status not in ("paid", "pending", "overdue"):
        raise HTTPException(400, "Le statut doit être 'paid', 'pending' ou 'overdue'")
    db = await get_db()
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.table("invoices").insert(doc).execute()
    return {"id": doc["id"], "ok": True}


@router.put("/treasury/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: InvoiceIn, user: dict = Depends(get_current_user)):
    db = await get_db()
    res = await db.table("invoices").update({**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", invoice_id).eq("user_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Facture introuvable")
    return {"ok": True}


@router.delete("/treasury/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    db = await get_db()
    res = await db.table("invoices").delete().eq("id", invoice_id).eq("user_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Facture introuvable")
    return {"ok": True}
