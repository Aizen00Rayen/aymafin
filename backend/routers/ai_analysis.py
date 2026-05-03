"""AI financial analysis — équilibre financier, CAF, rentabilité, délais, recommandations."""
from fastapi import APIRouter, Depends, HTTPException

from config import db
from auth_utils import get_current_user

router = APIRouter(tags=["ai_analysis"])


# ── Computation helpers ───────────────────────────────────────────────────────

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

    # Determine situation case
    threshold = abs(max(frng, bfr, tn, 1)) * 0.05  # 5% tolerance for "≈0"
    frng_pos = frng > threshold
    frng_neg = frng < -threshold
    bfr_pos = bfr > threshold
    bfr_neg = bfr < -threshold
    tn_pos = tn > threshold
    tn_neg = tn < -threshold

    if frng_pos and bfr_neg and tn_pos:
        cas, emoji = 1, "✅"
        interpretation = ("Situation très favorable : l'entreprise est financièrement stable "
                          "et dispose d'une trésorerie confortable grâce à des ressources suffisantes "
                          "et un cycle d'exploitation générateur de liquidités.")
    elif frng_pos and bfr_pos and tn_pos:
        cas, emoji = 2, "✅"
        interpretation = ("Situation saine : les ressources couvrent les besoins "
                          "et permettent de maintenir une trésorerie positive.")
    elif frng_pos and bfr_pos and not tn_pos and not tn_neg:
        cas, emoji = 3, "⚠️"
        interpretation = ("Situation correcte mais sous pression : les besoins d'exploitation "
                          "réduisent la trésorerie disponible.")
    elif frng_neg and bfr_neg and tn_pos:
        cas, emoji = 4, "⚠️"
        interpretation = ("Situation fragile : la trésorerie reste positive grâce au cycle "
                          "d'exploitation, mais la structure financière est déséquilibrée.")
    elif frng_neg and bfr_pos and tn_neg:
        cas, emoji = 5, "🚨"
        interpretation = ("Situation difficile : insuffisance de ressources "
                          "et forte tension de trésorerie.")
    elif frng_neg and not bfr_neg and tn_neg:
        cas, emoji = 6, "🚨"
        interpretation = ("Situation critique : déséquilibre financier important "
                          "et manque de liquidités pour couvrir les besoins.")
    else:
        cas, emoji = 7, "⚠️"
        interpretation = ("Situation d'équilibre précaire : "
                          "absence de marge de sécurité financière.")

    return {
        "frng": round(frng, 2),
        "bfr": round(bfr, 2),
        "tn": round(tn, 2),
        "cas": cas,
        "emoji": emoji,
        "interpretation": interpretation,
        "details": {
            "actif_immobilise_net": round(anc, 2),
            "capitaux_permanents": round(capitaux_permanents, 2),
            "actif_courant": round(ac, 2),
            "disponibilites": round(dispo, 2),
            "passif_courant": round(pc, 2),
            "avances_bancaires": round(avances, 2),
        },
    }


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
        interpretation = ("Capacité d'autofinancement positive. Vous pouvez financer une partie "
                          "de vos besoins avec vos propres ressources.")
    elif caf < 0:
        cas, emoji = 2, "🚨"
        interpretation = ("Capacité d'autofinancement négative. Vous ne générez pas assez de "
                          "ressources et dépendez du financement externe.")
    else:
        cas, emoji = 3, "⚠️"
        interpretation = ("Pas de capacité d'autofinancement. Vos ressources couvrent juste "
                          "vos besoins sans marge.")

    return {
        "caf": round(caf, 2),
        "cas": cas,
        "emoji": emoji,
        "interpretation": interpretation,
        "details": {
            "resultat_net": round(resultat, 2),
            "dotations_amortissements": round(dotations, 2),
            "reprises": round(reprises, 2),
            "valeur_compt_cessions": round(val_cessions, 2),
            "produits_cession": round(produits_cession, 2),
        },
    }


def _compute_rentabilite(tcr: dict, bilan: dict) -> dict:
    resultat = tcr.get("resultat_net", 0)
    total_actif = bilan["actif"]["total"]
    cp = bilan["passif"]["capitaux_propres"]["total"]

    re = (resultat / total_actif * 100) if total_actif else 0
    rf = (resultat / cp * 100) if cp else 0

    if re > 5:
        re_cas, re_emoji = 1, "✅"
        re_interp = "Bonne rentabilité des actifs. Vos ressources sont utilisées efficacement."
    elif re >= 1:
        re_cas, re_emoji = 2, "⚠️"
        re_interp = "Rentabilité moyenne. L'utilisation des actifs peut être améliorée."
    else:
        re_cas, re_emoji = 3, "🚨"
        re_interp = "Rentabilité faible. Vos actifs ne génèrent pas assez de résultats."

    if rf > 15:
        rf_cas, rf_emoji = 1, "✅"
        rf_interp = "Bon rendement. Votre investissement est bien valorisé."
    elif rf >= 5:
        rf_cas, rf_emoji = 2, "⚠️"
        rf_interp = "Rendement moyen. Il reste une marge d'amélioration."
    else:
        rf_cas, rf_emoji = 3, "🚨"
        rf_interp = "Rendement faible. Les capitaux propres ne sont pas assez rentables."

    return {
        "re": round(re, 2),
        "rf": round(rf, 2),
        "re_cas": re_cas,
        "re_emoji": re_emoji,
        "re_interpretation": re_interp,
        "rf_cas": rf_cas,
        "rf_emoji": rf_emoji,
        "rf_interpretation": rf_interp,
        "details": {
            "resultat_net": round(resultat, 2),
            "total_actif": round(total_actif, 2),
            "capitaux_propres": round(cp, 2),
        },
    }


def _compute_delais(tcr: dict, bilan: dict) -> dict:
    charges = tcr.get("charges_raw", {})
    produits = tcr.get("produits_raw", {})

    ca = sum(v for k, v in produits.items() if k.startswith("70") and k != "709")
    achats = sum(v for k, v in charges.items() if k.startswith("60") and k not in ("603", "609"))

    creances = bilan["actif"]["courant"]["creances_clients"]
    fournisseurs = bilan["passif"]["courant"]["fournisseurs"]

    dc = (creances / ca * 360) if ca > 0 else 0
    df = (fournisseurs / achats * 360) if achats > 0 else 0

    if dc < 60:
        dc_cas, dc_emoji = 1, "✅"
        dc_interp = "Vous récupérez rapidement votre argent. La gestion des clients est efficace."
    elif dc <= 90:
        dc_cas, dc_emoji = 2, "⚠️"
        dc_interp = "Vos délais de paiement clients sont corrects mais peuvent être améliorés."
    else:
        dc_cas, dc_emoji = 3, "🚨"
        dc_interp = "Vos clients paient lentement. Cela peut créer des problèmes de trésorerie."

    if df < 60:
        df_cas, df_emoji = 1, "✅"
        df_interp = "Vous payez vos fournisseurs rapidement."
    elif df <= 90:
        df_cas, df_emoji = 2, "⚠️"
        df_interp = "Vos délais de paiement fournisseurs sont normaux."
    else:
        df_cas, df_emoji = 3, "🚨"
        df_interp = "Vous payez vos fournisseurs tardivement. Cela peut affecter vos relations."

    if dc > df:
        comp_cas, comp_emoji = 1, "⚠️"
        comp_interp = ("Vos clients paient plus lentement que vous payez vos fournisseurs. "
                       "Cela pèse sur votre trésorerie.")
    else:
        comp_cas, comp_emoji = 2, "✅"
        comp_interp = ("Vous bénéficiez du délai fournisseurs pour financer votre activité. "
                       "Situation favorable.")

    return {
        "delai_clients": round(dc, 1),
        "delai_fournisseurs": round(df, 1),
        "dc_cas": dc_cas,
        "dc_emoji": dc_emoji,
        "dc_interpretation": dc_interp,
        "df_cas": df_cas,
        "df_emoji": df_emoji,
        "df_interpretation": df_interp,
        "comp_cas": comp_cas,
        "comp_emoji": comp_emoji,
        "comp_interpretation": comp_interp,
        "details": {
            "ca": round(ca, 2),
            "achats": round(achats, 2),
            "creances_clients": round(creances, 2),
            "dettes_fournisseurs": round(fournisseurs, 2),
        },
    }


def _build_recommendations(equilibre: dict, caf: dict, rentabilite: dict, delais: dict) -> list:
    recs = []

    if equilibre["frng"] < 0:
        recs.append({
            "priority": "high", "area": "Structure financière",
            "title": "Renforcer les capitaux permanents",
            "action": ("Votre fonds de roulement net global est négatif. Envisagez d'augmenter "
                       "vos capitaux propres (apport, résultat mis en réserve) ou de contracter "
                       "des emprunts à long terme pour financer vos actifs immobilisés."),
        })

    if equilibre["bfr"] > 0 and equilibre["tn"] < equilibre["frng"] * 0.2:
        recs.append({
            "priority": "medium", "area": "Besoin en fonds de roulement",
            "title": "Réduire le BFR",
            "action": ("Votre BFR est élevé par rapport au FRNG. Travaillez à réduire vos "
                       "délais de paiement clients, optimisez la rotation des stocks et négociez "
                       "des délais plus longs avec vos fournisseurs."),
        })

    if equilibre["tn"] < 0:
        recs.append({
            "priority": "high", "area": "Trésorerie",
            "title": "Améliorer la trésorerie nette",
            "action": ("Votre trésorerie nette est négative. Envisagez des lignes de crédit "
                       "court terme, accélérez l'encaissement des créances ou cédez des actifs "
                       "non stratégiques."),
        })

    if caf["caf"] < 0:
        recs.append({
            "priority": "high", "area": "Autofinancement",
            "title": "Améliorer la capacité d'autofinancement",
            "action": ("Votre CAF est négative. Réduisez vos charges d'exploitation, augmentez "
                       "vos prix de vente et cherchez à améliorer votre marge brute."),
        })

    if rentabilite["re"] < 1:
        recs.append({
            "priority": "medium", "area": "Rentabilité économique",
            "title": "Améliorer la rentabilité des actifs",
            "action": ("La rentabilité économique est faible (< 1%). Optimisez l'utilisation "
                       "de vos ressources, envisagez la cession d'actifs peu productifs et "
                       "améliorez votre efficacité opérationnelle."),
        })

    if rentabilite["rf"] < 5:
        recs.append({
            "priority": "medium", "area": "Rentabilité financière",
            "title": "Améliorer le rendement des capitaux propres",
            "action": ("Votre rentabilité financière est faible (< 5%). Optimisez votre "
                       "structure financière en utilisant davantage l'effet de levier si votre "
                       "situation le permet, ou améliorez votre résultat net."),
        })

    if delais["delai_clients"] > 90:
        recs.append({
            "priority": "high", "area": "Gestion clients",
            "title": "Réduire les délais de paiement clients",
            "action": ("Vos clients paient très lentement (> 90 jours). Mettez en place une "
                       "politique de relance systématique, proposez des escomptes pour paiement "
                       "rapide et envisagez l'affacturage pour les créances importantes."),
        })

    if delais["delai_clients"] > delais["delai_fournisseurs"] and delais["delai_clients"] > 60:
        recs.append({
            "priority": "medium", "area": "Équilibre clients/fournisseurs",
            "title": "Rééquilibrer les délais de paiement",
            "action": ("Vous encaissez vos clients plus lentement que vous payez vos "
                       "fournisseurs. Négociez des délais plus longs avec vos fournisseurs "
                       "ou raccourcissez vos délais d'encaissement clients."),
        })

    if not recs:
        recs.append({
            "priority": "low", "area": "Général",
            "title": "Situation financière équilibrée",
            "action": ("Vos indicateurs financiers sont dans les normes. Continuez à surveiller "
                       "vos ratios et envisagez d'investir dans la croissance ou l'innovation "
                       "pour renforcer votre position concurrentielle."),
        })

    return recs


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/ai-analysis")
async def get_full_analysis(period: str, user: dict = Depends(get_current_user)):
    # Load accounting entries
    entries = await db.accounting_entries.find(
        {"user_id": user["id"], "period": period}, {"_id": 0}
    ).to_list(1000)

    charges_raw = {e["account_code"]: e["amount"] for e in entries if e["entry_type"] == "charge"}
    produits_raw = {e["account_code"]: e["amount"] for e in entries if e["entry_type"] == "produit"}
    total_charges = sum(charges_raw.values())
    total_produits = sum(produits_raw.values())
    tcr = {
        "charges_raw": charges_raw,
        "produits_raw": produits_raw,
        "total_charges": total_charges,
        "total_produits": total_produits,
        "resultat_net": total_produits - total_charges,
    }

    # Load bilan
    raw = await db.bilan_entries.find_one({"user_id": user["id"], "period": period})
    if not raw:
        raise HTTPException(
            404,
            "Données de bilan introuvables pour cette période. "
            "Veuillez d'abord renseigner les données du bilan dans les États Financiers.",
        )

    immo_inc_net = raw["immo_incorporelles_brut"] - raw["immo_incorporelles_amort"]
    immo_corp_net = raw["immo_corporelles_brut"] - raw["immo_corporelles_amort"]
    total_anc = (raw["ecarts_acquisition"] + immo_inc_net + immo_corp_net
                 + raw["immo_financieres"] + raw["impots_differes_actif"])
    total_ac = (raw["stocks"] + raw["creances_clients"] + raw["autres_debiteurs"]
                + raw["impots_taxes_recuperables"] + raw["tresorerie_actif"])
    total_cp = raw["capital"] + raw["reserves"] + tcr["resultat_net"] + raw["autres_capitaux_propres"]
    total_pnc = raw["emprunts_lt"] + raw["impots_differes_passif"]
    total_pc = (raw["fournisseurs"] + raw["dettes_personnel"] + raw["dettes_impots"]
                + raw["autres_dettes_ct"] + raw["decouvert_bancaire"])

    bilan = {
        "actif": {
            "non_courant": {"total": total_anc},
            "courant": {
                "total": total_ac,
                "tresorerie": raw["tresorerie_actif"],
                "creances_clients": raw["creances_clients"],
                "stocks": raw["stocks"],
            },
            "total": total_anc + total_ac,
        },
        "passif": {
            "capitaux_propres": {"total": total_cp},
            "non_courant": {"total": total_pnc},
            "courant": {
                "total": total_pc,
                "decouvert_bancaire": raw["decouvert_bancaire"],
                "fournisseurs": raw["fournisseurs"],
            },
        },
    }

    equilibre = _compute_equilibre(bilan)
    caf = _compute_caf(tcr)
    rentabilite = _compute_rentabilite(tcr, bilan)
    delais = _compute_delais(tcr, bilan)
    recommendations = _build_recommendations(equilibre, caf, rentabilite, delais)

    return {
        "period": period,
        "equilibre_financier": equilibre,
        "caf": caf,
        "rentabilite": rentabilite,
        "delais": delais,
        "recommendations": recommendations,
    }
