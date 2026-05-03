"""Treasury management — cash flow entries and invoice tracking."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from auth_utils import get_current_user

router = APIRouter(tags=["treasury"])


class TreasuryEntryIn(BaseModel):
    date: str  # "2024-01-15"
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
    status: str = "pending"  # "paid" | "pending" | "overdue"


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/treasury/summary")
async def get_treasury_summary(
    period: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {"user_id": user["id"]}
    if period:
        query["date"] = {"$regex": f"^{period[:7]}"}

    entries = await db.treasury_entries.find(query, {"_id": 0}).to_list(10000)

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

    return {
        "balance": round(total_income - total_expense, 2),
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "monthly": monthly_list,
    }


# ── Treasury entries ──────────────────────────────────────────────────────────

@router.get("/treasury/entries")
async def get_treasury_entries(
    period: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {"user_id": user["id"]}
    if period:
        query["date"] = {"$regex": f"^{period[:7]}"}
    entries = await db.treasury_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries


@router.post("/treasury/entries")
async def create_treasury_entry(body: TreasuryEntryIn, user: dict = Depends(get_current_user)):
    if body.type not in ("income", "expense"):
        raise HTTPException(400, "Le type doit être 'income' ou 'expense'")
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.treasury_entries.insert_one(doc)
    return {"id": doc["id"], "ok": True}


@router.delete("/treasury/entries/{entry_id}")
async def delete_treasury_entry(entry_id: str, user: dict = Depends(get_current_user)):
    res = await db.treasury_entries.delete_one({"id": entry_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Entrée introuvable")
    return {"ok": True}


# ── Invoices ──────────────────────────────────────────────────────────────────

@router.get("/treasury/invoices")
async def get_invoices(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(1000)
    return invoices


@router.post("/treasury/invoices")
async def create_invoice(body: InvoiceIn, user: dict = Depends(get_current_user)):
    if body.type not in ("incoming", "outgoing"):
        raise HTTPException(400, "Le type doit être 'incoming' ou 'outgoing'")
    if body.status not in ("paid", "pending", "overdue"):
        raise HTTPException(400, "Le statut doit être 'paid', 'pending' ou 'overdue'")
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.invoices.insert_one(doc)
    return {"id": doc["id"], "ok": True}


@router.put("/treasury/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: InvoiceIn, user: dict = Depends(get_current_user)):
    res = await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["id"]},
        {"$set": {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Facture introuvable")
    return {"ok": True}


@router.delete("/treasury/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": invoice_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Facture introuvable")
    return {"ok": True}
