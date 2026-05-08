"""French Plan Comptable Général — charges (60-69) and produits (70-79)."""

PLAN_COMPTABLE_CHARGES = {
    "60": {
        "name": "Achats",
        "accounts": {
            "601": "Achats stockés - Matières premières et fournitures",
            "602": "Achats stockés - Autres approvisionnements",
            "603": "Variations de stocks",
            "604": "Achat d'études et prestations de services",
            "605": "Achats de matériels, équipements et travaux",
            "606": "Achats non stockés de matières et fournitures",
            "607": "Achats de marchandises",
            "608": "Frais accessoires d'achats",
            "609": "Rabais, remises et ristournes obtenus sur achats",
        },
    },
    "61": {
        "name": "Services extérieurs",
        "accounts": {
            "611": "Sous-traitance générale",
            "612": "Redevances de crédit-bail",
            "613": "Locations",
            "614": "Charges locatives et de co-propriété",
            "615": "Entretiens et réparations",
            "616": "Primes d'assurance",
            "617": "Études et recherches",
            "618": "Divers",
            "619": "RRR obtenus sur services extérieurs",
        },
    },
    "62": {
        "name": "Autres services extérieurs",
        "accounts": {
            "621": "Personnel extérieur à l'association",
            "622": "Rémunérations d'intermédiaires et honoraires",
            "623": "Publicité, publications, relations publiques",
            "624": "Transports de biens et transports collectifs du personnel",
            "625": "Déplacements, missions et réceptions",
            "626": "Frais postaux et de télécommunications",
            "627": "Services bancaires et assimilés",
            "628": "Divers",
            "629": "RRR obtenus sur autres services extérieurs",
        },
    },
    "63": {
        "name": "Impôts, taxes et versements assimilés",
        "accounts": {
            "631": "Impôts, taxes et versements sur rémunérations",
            "633": "Impôts, taxes et versements assimilés (autres)",
        },
    },
    "64": {
        "name": "Charges de personnel",
        "accounts": {
            "641": "Rémunérations du personnel",
            "645": "Charges de sécurité sociale et de prévoyance",
            "647": "Autres charges sociales",
            "648": "Autres charges de personnel",
            "649": "Remboursements de charges de personnel",
        },
    },
    "65": {
        "name": "Autres charges de gestion courante",
        "accounts": {
            "651": "Redevances pour concessions, brevets, licences, droits et valeurs similaires",
            "652": "Valeurs comptables des immobilisations incorporelles et corporelles cédées",
            "653": "Charges de la générosité du public",
            "654": "Pertes sur créances irrécouvrables",
            "655": "Quotes-parts de résultat sur opérations faites en commun",
            "657": "Aides financières",
            "658": "Pénalités et autres charges",
        },
    },
    "66": {
        "name": "Charges financières",
        "accounts": {
            "661": "Charges d'intérêts",
            "664": "Pertes sur créances rattachées à des participations",
            "665": "Escomptes accordés",
            "666": "Pertes de change",
            "667": "Charges nettes sur cessions de valeurs mobilières de placement",
            "668": "Autres charges financières",
        },
    },
    "67": {
        "name": "Charges exceptionnelles",
        "accounts": {
            "672": "Charges sur exercices antérieurs (à reclasser)",
            "678": "Autres charges exceptionnelles",
        },
    },
    "68": {
        "name": "Dotations aux amortissements, dépréciations et provisions",
        "accounts": {
            "681": "Dotations aux amortissements, dépréciations et provisions d'exploitation",
            "686": "Dotations aux amortissements, dépréciations et provisions financières",
            "687": "Dotations aux amortissements, dépréciations et provisions exceptionnelles",
        },
    },
    "69": {
        "name": "Impôts sur les bénéfices",
        "accounts": {
            "695": "Impôts sur les bénéfices",
            "699": "Produits de réduction d'impôts",
        },
    },
}

PLAN_COMPTABLE_PRODUITS = {
    "70": {
        "name": "Ventes de produits finis, prestations de services, marchandises",
        "accounts": {
            "701": "Ventes de produits finis",
            "702": "Ventes de produits intermédiaires",
            "703": "Ventes de produits résiduels",
            "704": "Travaux",
            "705": "Études",
            "706": "Prestations de services",
            "707": "Ventes de marchandises",
            "708": "Produits des activités annexes",
            "709": "RRR accordés par l'association",
        },
    },
    "71": {
        "name": "Production stockée (ou déstockage)",
        "accounts": {
            "713": "Variations de stocks",
        },
    },
    "72": {
        "name": "Production immobilisée",
        "accounts": {
            "721": "Immobilisations incorporelles",
            "722": "Immobilisations corporelles",
        },
    },
    "73": {
        "name": "Concours publics",
        "accounts": {
            "731": "Concours publics",
        },
    },
    "74": {
        "name": "Subventions d'exploitation",
        "accounts": {
            "741": "Subventions d'exploitation",
        },
    },
    "75": {
        "name": "Autres produits de gestion courante",
        "accounts": {
            "751": "Redevances pour concessions, licences, marques, procédés, droits et valeurs similaires",
            "752": "Revenus des immeubles non affectés aux activités de l'association",
            "753": "Versements des fondateurs ou consommation de la dotation",
            "754": "Ressources liées à la générosité du public",
            "755": "Contributions financières",
            "756": "Cotisations",
            "758": "Indemnités et autres produits",
        },
    },
    "76": {
        "name": "Produits financiers",
        "accounts": {
            "761": "Produits des participations",
            "762": "Produits des autres immobilisations financières",
            "763": "Revenus des autres créances",
            "764": "Revenus des valeurs mobilières de placement",
            "765": "Escomptes obtenus",
            "766": "Gains de change",
            "767": "Produits nets sur cession de valeurs mobilières de placement",
            "768": "Autres produits financiers",
        },
    },
    "77": {
        "name": "Produits exceptionnels",
        "accounts": {
            "772": "Produits sur exercices antérieurs (à reclasser)",
            "778": "Autres produits exceptionnels",
        },
    },
    "78": {
        "name": "Reprises sur amortissements, dépréciations, provisions et engagements",
        "accounts": {
            "781": "Reprises sur amortissements, dépréciations et provisions d'exploitation",
            "786": "Reprises sur amortissements, dépréciations et provisions financières",
            "787": "Reprises sur amortissements, dépréciations et provisions exceptionnelles",
        },
    },
    "79": {
        "name": "Transfert de charges",
        "accounts": {
            "791": "Transferts de charges d'exploitation",
            "796": "Transferts de charges financières",
            "797": "Transferts de charges exceptionnelles",
        },
    },
}
