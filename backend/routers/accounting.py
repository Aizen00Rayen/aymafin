"""Accounting entries (charges 60-69, produits 70-79), bilan entries, TCR, journal."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from auth_utils import get_current_user
from plan_comptable import PLAN_COMPTABLE_CHARGES, PLAN_COMPTABLE_PRODUITS

router = APIRouter(tags=["accounting"])

JOURNAL_TYPES = ["OUVERTURE", "ACHATS", "BANQUE", "CAISSE", "STOCKS", "OPERATIONS_DIVERS", "SALAIRES", "VENTES"]


class AccountingEntryIn(BaseModel):
    period: str  # "2024-01"
    account_code: str
    amount: float
    note: Optional[str] = None


class BilanEntryIn(BaseModel):
    period: str
    # Actif non courant
    ecarts_acquisition: float = 0
    immo_incorporelles_brut: float = 0
    immo_incorporelles_amort: float = 0
    immo_corporelles_brut: float = 0
    immo_corporelles_amort: float = 0
    immo_financieres: float = 0
    impots_differes_actif: float = 0
    # Actif courant
    stocks: float = 0
    creances_clients: float = 0
    autres_debiteurs: float = 0
    impots_taxes_recuperables: float = 0
    tresorerie_actif: float = 0
    # Capitaux propres
    capital: float = 0
    reserves: float = 0
    autres_capitaux_propres: float = 0
    # Passif non courant
    emprunts_lt: float = 0
    impots_differes_passif: float = 0
    # Passif courant
    fournisseurs: float = 0
    dettes_personnel: float = 0
    dettes_impots: float = 0
    autres_dettes_ct: float = 0
    decouvert_bancaire: float = 0


class JournalEntryIn(BaseModel):
    date: str  # "2024-01-15"
    journal_type: str
    description: str
    debit_account: str
    credit_account: str
    amount: float


def _build_bilan_struct(raw: dict, resultat_net: float) -> dict:
    immo_inc_net = raw["immo_incorporelles_brut"] - raw["immo_incorporelles_amort"]
    immo_corp_net = raw["immo_corporelles_brut"] - raw["immo_corporelles_amort"]
    total_anc = (raw["ecarts_acquisition"] + immo_inc_net + immo_corp_net
                 + raw["immo_financieres"] + raw["impots_differes_actif"])
    total_ac = (raw["stocks"] + raw["creances_clients"] + raw["autres_debiteurs"]
                + raw["impots_taxes_recuperables"] + raw["tresorerie_actif"])
    total_actif = total_anc + total_ac

    total_cp = raw["capital"] + raw["reserves"] + resultat_net + raw["autres_capitaux_propres"]
    total_pnc = raw["emprunts_lt"] + raw["impots_differes_passif"]
    total_pc = (raw["fournisseurs"] + raw["dettes_personnel"] + raw["dettes_impots"]
                + raw["autres_dettes_ct"] + raw["decouvert_bancaire"])
    total_passif = total_cp + total_pnc + total_pc

    return {
        "actif": {
            "non_courant": {
                "ecarts_acquisition": raw["ecarts_acquisition"],
                "immo_incorporelles": {
                    "brut": raw["immo_incorporelles_brut"],
                    "amort": raw["immo_incorporelles_amort"],
                    "net": immo_inc_net,
                },
                "immo_corporelles": {
                    "brut": raw["immo_corporelles_brut"],
                    "amort": raw["immo_corporelles_amort"],
                    "net": immo_corp_net,
                },
                "immo_financieres": raw["immo_financieres"],
                "impots_differes": raw["impots_differes_actif"],
                "total": round(total_anc, 2),
            },
            "courant": {
                "stocks": raw["stocks"],
                "creances_clients": raw["creances_clients"],
                "autres_debiteurs": raw["autres_debiteurs"],
                "impots_taxes": raw["impots_taxes_recuperables"],
                "tresorerie": raw["tresorerie_actif"],
                "total": round(total_ac, 2),
            },
            "total": round(total_actif, 2),
        },
        "passif": {
            "capitaux_propres": {
                "capital": raw["capital"],
                "reserves": raw["reserves"],
                "resultat_net": round(resultat_net, 2),
                "autres": raw["autres_capitaux_propres"],
                "total": round(total_cp, 2),
            },
            "non_courant": {
                "emprunts_lt": raw["emprunts_lt"],
                "impots_differes": raw["impots_differes_passif"],
                "total": round(total_pnc, 2),
            },
            "courant": {
                "fournisseurs": raw["fournisseurs"],
                "dettes_personnel": raw["dettes_personnel"],
                "dettes_impots": raw["dettes_impots"],
                "autres_dettes": raw["autres_dettes_ct"],
                "decouvert_bancaire": raw["decouvert_bancaire"],
                "total": round(total_pc, 2),
            },
            "total": round(total_passif, 2),
        },
        "ecart": round(total_actif - total_passif, 2),
    }


@router.get("/accounting/plan")
async def get_plan_comptable():
    return {"charges": PLAN_COMPTABLE_CHARGES, "produits": PLAN_COMPTABLE_PRODUITS}


@router.get("/accounting/periods")
async def list_periods(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": "$period"}},
        {"$sort": {"_id": -1}},
    ]
    results = await db.accounting_entries.aggregate(pipeline).to_list(100)
    bilan_periods = await db.bilan_entries.distinct("period", {"user_id": user["id"]})
    periods = sorted(set([r["_id"] for r in results] + bilan_periods), reverse=True)
    return periods


# ── Accounting entries (charges & produits) ──────────────────────────────────

@router.get("/accounting/entries")
async def get_entries(
    period: str,
    entry_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {"user_id": user["id"], "period": period}
    if entry_type:
        query["entry_type"] = entry_type
    entries = await db.accounting_entries.find(query, {"_id": 0}).to_list(1000)
    return entries


@router.post("/accounting/entries")
async def upsert_entry(body: AccountingEntryIn, user: dict = Depends(get_current_user)):
    code = body.account_code
    if code and code[0] == "6":
        entry_type = "charge"
    elif code and code[0] == "7":
        entry_type = "produit"
    else:
        raise HTTPException(400, "Le code compte doit commencer par 6 (charge) ou 7 (produit)")

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.accounting_entries.find_one(
        {"user_id": user["id"], "period": body.period, "account_code": body.account_code}
    )
    if existing:
        await db.accounting_entries.update_one(
            {"id": existing["id"]},
            {"$set": {"amount": body.amount, "note": body.note, "updated_at": now}},
        )
        return {"id": existing["id"], "ok": True}

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "period": body.period,
        "account_code": body.account_code,
        "entry_type": entry_type,
        "amount": body.amount,
        "note": body.note,
        "created_at": now,
        "updated_at": now,
    }
    await db.accounting_entries.insert_one(doc)
    return {"id": doc["id"], "ok": True}


@router.delete("/accounting/entries/{entry_id}")
async def delete_entry(entry_id: str, user: dict = Depends(get_current_user)):
    res = await db.accounting_entries.delete_one({"id": entry_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Entrée introuvable")
    return {"ok": True}


# ── TCR ───────────────────────────────────────────────────────────────────────

@router.get("/accounting/tcr")
async def get_tcr(period: str, user: dict = Depends(get_current_user)):
    entries = await db.accounting_entries.find(
        {"user_id": user["id"], "period": period}, {"_id": 0}
    ).to_list(1000)

    charges: dict = {}
    produits: dict = {}
    for e in entries:
        if e["entry_type"] == "charge":
            charges[e["account_code"]] = e["amount"]
        else:
            produits[e["account_code"]] = e["amount"]

    total_charges = sum(charges.values())
    total_produits = sum(produits.values())

    # Group by class (60, 61, …, 70, 71, …)
    def group_by_class(data: dict, plan: dict) -> List[dict]:
        rows = []
        for cls, info in plan.items():
            subtotal = sum(v for k, v in data.items() if k.startswith(cls))
            accounts = [
                {"code": k, "name": info["accounts"][k], "amount": data.get(k, 0)}
                for k in info["accounts"]
                if data.get(k, 0) != 0
            ]
            rows.append({"class": cls, "name": info["name"], "subtotal": round(subtotal, 2), "accounts": accounts})
        return rows

    return {
        "period": period,
        "charges_detail": group_by_class(charges, PLAN_COMPTABLE_CHARGES),
        "produits_detail": group_by_class(produits, PLAN_COMPTABLE_PRODUITS),
        "charges_raw": charges,
        "produits_raw": produits,
        "total_charges": round(total_charges, 2),
        "total_produits": round(total_produits, 2),
        "resultat_net": round(total_produits - total_charges, 2),
    }


# ── Bilan ─────────────────────────────────────────────────────────────────────

@router.get("/accounting/bilan")
async def get_bilan(period: str, user: dict = Depends(get_current_user)):
    raw = await db.bilan_entries.find_one({"user_id": user["id"], "period": period}, {"_id": 0})
    if not raw:
        return None

    entries = await db.accounting_entries.find(
        {"user_id": user["id"], "period": period}, {"_id": 0}
    ).to_list(1000)
    resultat_net = (
        sum(e["amount"] for e in entries if e["entry_type"] == "produit")
        - sum(e["amount"] for e in entries if e["entry_type"] == "charge")
    )
    return _build_bilan_struct(raw, resultat_net)


@router.post("/accounting/bilan")
async def upsert_bilan(body: BilanEntryIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["user_id"] = user["id"]
    now = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = now
    existing = await db.bilan_entries.find_one({"user_id": user["id"], "period": body.period})
    if existing:
        await db.bilan_entries.update_one({"user_id": user["id"], "period": body.period}, {"$set": doc})
        return {"ok": True}
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now
    await db.bilan_entries.insert_one(doc)
    return {"id": doc["id"], "ok": True}


# ── Journal ───────────────────────────────────────────────────────────────────

@router.get("/accounting/journal")
async def get_journal(
    period: Optional[str] = None,
    journal_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {"user_id": user["id"]}
    if period:
        query["date"] = {"$regex": f"^{period}"}
    if journal_type:
        query["journal_type"] = journal_type
    entries = await db.journal_entries.find(query, {"_id": 0}).sort("date", 1).to_list(2000)
    return entries


@router.post("/accounting/journal")
async def create_journal_entry(body: JournalEntryIn, user: dict = Depends(get_current_user)):
    if body.journal_type not in JOURNAL_TYPES:
        raise HTTPException(400, f"Type de journal invalide. Valeurs acceptées: {', '.join(JOURNAL_TYPES)}")
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.journal_entries.insert_one(doc)
    return {"id": doc["id"], "ok": True}


@router.delete("/accounting/journal/{entry_id}")
async def delete_journal_entry(entry_id: str, user: dict = Depends(get_current_user)):
    res = await db.journal_entries.delete_one({"id": entry_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Écriture de journal introuvable")
    return {"ok": True}
