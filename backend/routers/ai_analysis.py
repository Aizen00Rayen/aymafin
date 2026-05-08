"""AI financial analysis — équilibre financier, CAF, rentabilité, délais, recommandations."""
from fastapi import APIRouter, Depends, HTTPException

from config import get_db
from auth_utils import get_current_user

router = APIRouter(tags=["ai_analysis"])


def _compute_equilibre(bilan: dict) -> dict:
    anc = bilan["actif"]["non_courant"]["total"]
    cp = bilan["passif"]["capitaux_propres"]["total"]
    pnc = bilan["passif"]["non_courant"]["total"]
    capitaux_permanents = cp + pnc
    frng = capitaux_permanents - anc
    ac = bilan["actif"]["courant"]["total"]
    dispo = bilan["actif"]["courant"]["tresorerie"]
    pc = bilan["passif"]["courant"]["total"]
    avances = bilan["passif"]["courant"]["decouvert_bancaire"]
    bfr = (ac - dispo) - (pc - avances)
    tn = frng - bfr
    threshold = abs(max(abs(frng), abs(bfr), abs(tn), 1)) * 0.05
    frng_pos, frng_neg = frng > threshold, frng < -threshold
    bfr_pos, bfr_neg = bfr > threshold, bfr < -threshold
    tn_pos, tn_neg = tn > threshold, tn < -threshold
    if frng_pos and bfr_neg and tn_pos:
        cas, emoji = 1, "✅"
        interpretation = "Situation très favorable : l'entreprise est financièrement stable et dispose d'une trésorerie confortable."
    elif frng_pos and bfr_pos and tn_pos:
        cas, emoji = 2, "✅"
        interpretation = "Situation saine : les ressources couvrent les besoins et permettent de maintenir une trésorerie positive."
    elif frng_pos and bfr_pos and not tn_pos and not tn_neg:
        cas, emoji = 3, "⚠️"
        interpretation = "Situation correcte mais sous pression : les besoins d'exploitation réduisent la trésorerie disponible."
    elif frng_neg and bfr_neg and tn_pos:
        cas, emoji = 4, "⚠️"
        interpretation = "Situation fragile : la trésorerie reste positive grâce au cycle d'exploitation, mais la structure financière est déséquilibrée."
    elif frng_neg and bfr_pos and tn_neg:
        cas, emoji = 5, "🚨"
        interpretation = "Situation difficile : insuffisance de ressources et forte tension de trésorerie."
    elif frng_neg and not bfr_neg and tn_neg:
        cas, emoji = 6, "🚨"
        interpretation = "Situation critique : déséquilibre financier important et manque de liquidités pour couvrir les besoins."
    else:
        cas, emoji = 7, "⚠️"
        interpretation = "Situation d'équilibre précaire : absence de marge de sécurité financière."
    return {"frng": round(frng, 2), "bfr": round(bfr, 2), "tn": round(tn, 2), "cas": cas, "emoji": emoji, "interpretation": interpretation,
            "details": {"actif_immobilise_net": round(anc, 2), "capitaux_permanents": round(capitaux_permanents, 2), "actif_courant": round(ac, 2), "disponibilites": round(dispo, 2), "passif_courant": round(pc, 2), "avances_bancaires": round(avances, 2)}}


def _compute_caf(tcr: dict) -> dict:
    charges = tcr.get("charges_raw", {})
    produits = tcr.get("produits_raw", {})
    resultat = tcr.get("resultat_net", 0)
    dotations = sum(v for k, v in charges.items() if k.startswith("68"))
    reprises = sum(v for k, v in produits.items() if k.startswith("78"))
    val_cessions = charges.get("652", 0)
    produits_cession = produits.get("775", 0)
    caf = resultat + dotations - reprises + val_cessions - produits_cession
    if caf > 0:
        cas, emoji = 1, "✅"
        interpretation = "Capacité d'autofinancement positive. Vous pouvez financer une partie de vos besoins avec vos propres ressources."
    elif caf < 0:
        cas, emoji = 2, "🚨"
        interpretation = "Capacité d'autofinancement négative. Vous ne générez pas assez de ressources et dépendez du financement externe."
    else:
        cas, emoji = 3, "⚠️"
        interpretation = "Pas de capacité d'autofinancement. Vos ressources couvrent juste vos besoins sans marge."
    return {"caf": round(caf, 2), "cas": cas, "emoji": emoji, "interpretation": interpretation,
            "details": {"resultat_net": round(resultat, 2), "dotations_amortissements": round(dotations, 2), "reprises": round(reprises, 2), "valeur_compt_cessions": round(val_cessions, 2), "produits_cession": round(produits_cession, 2)}}


def _compute_rentabilite(tcr: dict, bilan: dict) -> dict:
    resultat = tcr.get("resultat_net", 0)
    total_actif = bilan["actif"]["total"]
    cp = bilan["passif"]["capitaux_propres"]["total"]
    re = (resultat / total_actif * 100) if total_actif else 0
    rf = (resultat / cp * 100) if cp else 0
    re_cas, re_emoji = (1, "✅") if re > 5 else ((2, "⚠️") if re >= 1 else (3, "🚨"))
    re_interp = ["Bonne rentabilité des actifs. Vos ressources sont utilisées efficacement.", "Rentabilité moyenne. L'utilisation des actifs peut être améliorée.", "Rentabilité faible. Vos actifs ne génèrent pas assez de résultats."][re_cas - 1]
    rf_cas, rf_emoji = (1, "✅") if rf > 15 else ((2, "⚠️") if rf >= 5 else (3, "🚨"))
    rf_interp = ["Bon rendement. Votre investissement est bien valorisé.", "Rendement moyen. Il reste une marge d'amélioration.", "Rendement faible. Les capitaux propres ne sont pas assez rentables."][rf_cas - 1]
    return {"re": round(re, 2), "rf": round(rf, 2), "re_cas": re_cas, "re_emoji": re_emoji, "re_interpretation": re_interp, "rf_cas": rf_cas, "rf_emoji": rf_emoji, "rf_interpretation": rf_interp,
            "details": {"resultat_net": round(resultat, 2), "total_actif": round(total_actif, 2), "capitaux_propres": round(cp, 2)}}


def _compute_delais(tcr: dict, bilan: dict) -> dict:
    charges = tcr.get("charges_raw", {})
    produits = tcr.get("produits_raw", {})
    ca = sum(v for k, v in produits.items() if k.startswith("70") and k != "709")
    achats = sum(v for k, v in charges.items() if k.startswith("60") and k not in ("603", "609"))
    creances = bilan["actif"]["courant"]["creances_clients"]
    fournisseurs = bilan["passif"]["courant"]["fournisseurs"]
    dc = (creances / ca * 360) if ca > 0 else 0
    df = (fournisseurs / achats * 360) if achats > 0 else 0
    dc_cas, dc_emoji = (1, "✅") if dc < 60 else ((2, "⚠️") if dc <= 90 else (3, "🚨"))
    dc_interp = ["Vous récupérez rapidement votre argent. La gestion des clients est efficace.", "Vos délais de paiement clients sont corrects mais peuvent être améliorés.", "Vos clients paient lentement. Cela peut créer des problèmes de trésorerie."][dc_cas - 1]
    df_cas, df_emoji = (1, "✅") if df < 60 else ((2, "⚠️") if df <= 90 else (3, "🚨"))
    df_interp = ["Vous payez vos fournisseurs rapidement.", "Vos délais de paiement fournisseurs sont normaux.", "Vous payez vos fournisseurs tardivement. Cela peut affecter vos relations."][df_cas - 1]
    comp_cas, comp_emoji = (1, "⚠️") if dc > df else (2, "✅")
    comp_interp = "Vos clients paient plus lentement que vous payez vos fournisseurs. Cela pèse sur votre trésorerie." if comp_cas == 1 else "Vous bénéficiez du délai fournisseurs pour financer votre activité. Situation favorable."
    return {"delai_clients": round(dc, 1), "delai_fournisseurs": round(df, 1), "dc_cas": dc_cas, "dc_emoji": dc_emoji, "dc_interpretation": dc_interp, "df_cas": df_cas, "df_emoji": df_emoji, "df_interpretation": df_interp, "comp_cas": comp_cas, "comp_emoji": comp_emoji, "comp_interpretation": comp_interp,
            "details": {"ca": round(ca, 2), "achats": round(achats, 2), "creances_clients": round(creances, 2), "dettes_fournisseurs": round(fournisseurs, 2)}}


def _build_recommendations(equilibre, caf, rentabilite, delais) -> list:
    recs = []
    if equilibre["frng"] < 0:
        recs.append({"priority": "high", "area": "Structure financière", "title": "Renforcer les capitaux permanents", "action": "Votre FRNG est négatif. Envisagez d'augmenter vos capitaux propres ou de contracter des emprunts à long terme."})
    if equilibre["bfr"] > 0 and equilibre["tn"] < equilibre["frng"] * 0.2:
        recs.append({"priority": "medium", "area": "Besoin en fonds de roulement", "title": "Réduire le BFR", "action": "Votre BFR est élevé. Réduisez vos délais clients, optimisez les stocks et négociez des délais fournisseurs plus longs."})
    if equilibre["tn"] < 0:
        recs.append({"priority": "high", "area": "Trésorerie", "title": "Améliorer la trésorerie nette", "action": "Votre TN est négative. Envisagez des lignes de crédit CT, accélérez l'encaissement des créances."})
    if caf["caf"] < 0:
        recs.append({"priority": "high", "area": "Autofinancement", "title": "Améliorer la CAF", "action": "Votre CAF est négative. Réduisez vos charges d'exploitation et améliorez votre marge brute."})
    if rentabilite["re"] < 1:
        recs.append({"priority": "medium", "area": "Rentabilité économique", "title": "Améliorer la rentabilité des actifs", "action": "La RE est faible (<1%). Optimisez l'utilisation de vos ressources et cédez les actifs peu productifs."})
    if rentabilite["rf"] < 5:
        recs.append({"priority": "medium", "area": "Rentabilité financière", "title": "Améliorer le rendement des capitaux propres", "action": "La RF est faible (<5%). Optimisez votre structure financière ou améliorez votre résultat net."})
    if delais["delai_clients"] > 90:
        recs.append({"priority": "high", "area": "Gestion clients", "title": "Réduire les délais de paiement clients", "action": "Délai >90j : mettez en place une politique de relance systématique et envisagez l'affacturage."})
    if delais["delai_clients"] > delais["delai_fournisseurs"] and delais["delai_clients"] > 60:
        recs.append({"priority": "medium", "area": "Équilibre délais", "title": "Rééquilibrer les délais de paiement", "action": "Vous encaissez plus lentement que vous payez. Négociez des délais fournisseurs plus longs."})
    if not recs:
        recs.append({"priority": "low", "area": "Général", "title": "Situation financière équilibrée", "action": "Vos indicateurs sont dans les normes. Continuez à surveiller vos ratios et investissez dans la croissance."})
    return recs


@router.get("/ai-analysis")
async def get_full_analysis(period: str, user: dict = Depends(get_current_user)):
    db = await get_db()
    entries_res = await db.table("accounting_entries").select("*").eq("user_id", user["id"]).eq("period", period).execute()
    entries = entries_res.data or []
    charges_raw = {e["account_code"]: e["amount"] for e in entries if e["entry_type"] == "charge"}
    produits_raw = {e["account_code"]: e["amount"] for e in entries if e["entry_type"] == "produit"}
    tcr = {"charges_raw": charges_raw, "produits_raw": produits_raw, "total_charges": sum(charges_raw.values()), "total_produits": sum(produits_raw.values()), "resultat_net": sum(produits_raw.values()) - sum(charges_raw.values())}

    raw_res = await db.table("bilan_entries").select("*").eq("user_id", user["id"]).eq("period", period).maybe_single().execute()
    if not raw_res.data:
        raise HTTPException(404, "Données de bilan introuvables pour cette période. Renseignez d'abord le bilan dans les États Financiers.")
    raw = raw_res.data

    immo_inc_net = raw["immo_incorporelles_brut"] - raw["immo_incorporelles_amort"]
    immo_corp_net = raw["immo_corporelles_brut"] - raw["immo_corporelles_amort"]
    total_anc = raw["ecarts_acquisition"] + immo_inc_net + immo_corp_net + raw["immo_financieres"] + raw["impots_differes_actif"]
    total_ac = raw["stocks"] + raw["creances_clients"] + raw["autres_debiteurs"] + raw["impots_taxes_recuperables"] + raw["tresorerie_actif"]
    total_cp = raw["capital"] + raw["reserves"] + tcr["resultat_net"] + raw["autres_capitaux_propres"]
    total_pnc = raw["emprunts_lt"] + raw["impots_differes_passif"]
    total_pc = raw["fournisseurs"] + raw["dettes_personnel"] + raw["dettes_impots"] + raw["autres_dettes_ct"] + raw["decouvert_bancaire"]

    bilan = {
        "actif": {"non_courant": {"total": total_anc}, "courant": {"total": total_ac, "tresorerie": raw["tresorerie_actif"], "creances_clients": raw["creances_clients"], "stocks": raw["stocks"]}, "total": total_anc + total_ac},
        "passif": {"capitaux_propres": {"total": total_cp}, "non_courant": {"total": total_pnc}, "courant": {"total": total_pc, "decouvert_bancaire": raw["decouvert_bancaire"], "fournisseurs": raw["fournisseurs"]}},
    }

    equilibre = _compute_equilibre(bilan)
    caf = _compute_caf(tcr)
    rentabilite = _compute_rentabilite(tcr, bilan)
    delais = _compute_delais(tcr, bilan)
    recommendations = _build_recommendations(equilibre, caf, rentabilite, delais)
    return {"period": period, "equilibre_financier": equilibre, "caf": caf, "rentabilite": rentabilite, "delais": delais, "recommendations": recommendations}
