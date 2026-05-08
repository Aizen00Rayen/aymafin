// Plan Comptable Algérien — Classes 60-79

export const PLAN_COMPTABLE = [
  {
    code: "60",
    label: "Achats",
    type: "charge",
    subcomptes: [
      { code: "601", label: "Achats stockés - Matières premières et fournitures" },
      { code: "602", label: "Achats stockés - Autres approvisionnements" },
      { code: "603", label: "Variations de stocks" },
      { code: "604", label: "Achat d'études et prestations de services" },
      { code: "605", label: "Achats de matériels, équipements et travaux" },
      { code: "606", label: "Achats non stockés de matières et fournitures" },
      { code: "607", label: "Achats de marchandises" },
      { code: "608", label: "Frais accessoires d'achats" },
      { code: "609", label: "Rabais, remises et ristournes obtenus sur achats" },
    ],
  },
  {
    code: "61",
    label: "Services extérieurs",
    type: "charge",
    subcomptes: [
      { code: "611", label: "Sous-traitance générale" },
      { code: "612", label: "Redevances de crédit-bail" },
      { code: "613", label: "Locations" },
      { code: "614", label: "Charges locatives et de co-propriété" },
      { code: "615", label: "Entretiens et réparations" },
      { code: "616", label: "Primes d'assurance" },
      { code: "617", label: "Etudes et recherches" },
      { code: "618", label: "Divers" },
      { code: "619", label: "RRR obtenus sur services extérieurs" },
    ],
  },
  {
    code: "62",
    label: "Autres services extérieurs",
    type: "charge",
    subcomptes: [
      { code: "621", label: "Personnel extérieur à l'association" },
      { code: "622", label: "Rémunérations d'intermédiaires et honoraires" },
      { code: "623", label: "Publicité, publications, relations publiques" },
      { code: "624", label: "Transports de biens et transports collectifs du personnel" },
      { code: "625", label: "Déplacements, missions et réceptions" },
      { code: "626", label: "Frais postaux et de télécommunications" },
      { code: "627", label: "Services bancaires et assimilés" },
      { code: "628", label: "Divers" },
      { code: "629", label: "RRR obtenus sur autres services extérieurs" },
    ],
  },
  {
    code: "63",
    label: "Impôts, taxes et versements assimilés",
    type: "charge",
    subcomptes: [],
  },
  {
    code: "64",
    label: "Charges de personnel",
    type: "charge",
    subcomptes: [
      { code: "641", label: "Rémunérations du personnel" },
      { code: "645", label: "Charges de sécurité sociale et de prévoyance" },
      { code: "647", label: "Autres charges sociales" },
      { code: "648", label: "Autres charges de personnel" },
      { code: "649", label: "Remboursements de charges de personnel" },
    ],
  },
  {
    code: "65",
    label: "Autres charges de gestion courante",
    type: "charge",
    subcomptes: [
      { code: "651", label: "Redevances pour concessions, brevets, licences" },
      { code: "652", label: "Valeurs comptables des immobilisations cédées" },
      { code: "653", label: "Charges de la générosité du public" },
      { code: "654", label: "Pertes sur créances irrécouvrables" },
      { code: "655", label: "Quotes-parts de résultat sur opérations faites en commun" },
      { code: "657", label: "Aides financières" },
      { code: "658", label: "Pénalités et autres charges" },
    ],
  },
  {
    code: "66",
    label: "Charges financières",
    type: "charge",
    subcomptes: [
      { code: "661", label: "Charges d'intérêts" },
      { code: "664", label: "Pertes sur créances rattachées à des participations" },
      { code: "665", label: "Escomptes accordés" },
      { code: "666", label: "Pertes de change" },
      { code: "667", label: "Charges nettes sur cessions de valeurs mobilières de placement" },
      { code: "668", label: "Autres charges financières" },
    ],
  },
  {
    code: "67",
    label: "Charges exceptionnelles",
    type: "charge",
    subcomptes: [
      { code: "672", label: "Charges sur exercices antérieurs (à reclasser)" },
      { code: "678", label: "Autres charges exceptionnelles" },
    ],
  },
  {
    code: "68",
    label: "Dotations aux amortissements, dépréciations, provisions",
    type: "charge",
    subcomptes: [],
  },
  {
    code: "69",
    label: "Impôts sur les bénéfices",
    type: "charge",
    subcomptes: [],
  },
  {
    code: "70",
    label: "Ventes de produits finis, prestations, marchandises",
    type: "produit",
    subcomptes: [
      { code: "701", label: "Ventes de produits finis" },
      { code: "702", label: "Ventes de produits intermédiaires" },
      { code: "703", label: "Ventes de produits résiduels" },
      { code: "704", label: "Travaux" },
      { code: "705", label: "Etudes" },
      { code: "706", label: "Prestations de services" },
      { code: "707", label: "Ventes de marchandises" },
      { code: "708", label: "Produits des activités annexes" },
      { code: "709", label: "RRR accordés par l'association" },
    ],
  },
  {
    code: "71",
    label: "Production stockée (ou déstockage)",
    type: "produit",
    subcomptes: [
      { code: "713", label: "Variations de stocks" },
    ],
  },
  {
    code: "72",
    label: "Production immobilisée",
    type: "produit",
    subcomptes: [
      { code: "721", label: "Immobilisations incorporelles" },
      { code: "722", label: "Immobilisations corporelles" },
    ],
  },
  {
    code: "73",
    label: "Concours publics",
    type: "produit",
    subcomptes: [],
  },
  {
    code: "74",
    label: "Subventions d'exploitation",
    type: "produit",
    subcomptes: [],
  },
  {
    code: "75",
    label: "Autres produits de gestion courante",
    type: "produit",
    subcomptes: [
      { code: "751", label: "Redevances pour concessions, licences, marques" },
      { code: "752", label: "Revenus des immeubles non affectés aux activités" },
      { code: "753", label: "Versements des fondateurs ou consommation de la dotation" },
      { code: "754", label: "Ressources liées à la générosité du public" },
      { code: "755", label: "Contributions financières" },
      { code: "756", label: "Cotisations" },
      { code: "758", label: "Indemnités et autres produits" },
    ],
  },
  {
    code: "76",
    label: "Produits financiers",
    type: "produit",
    subcomptes: [
      { code: "761", label: "Produits des participations" },
      { code: "762", label: "Produits des autres immobilisations financières" },
      { code: "763", label: "Revenus des autres créances" },
      { code: "764", label: "Revenus des valeurs mobilières de placement" },
      { code: "765", label: "Escomptes obtenus" },
      { code: "766", label: "Gains de change" },
      { code: "767", label: "Produits nets sur cession de VMP" },
      { code: "768", label: "Autres produits financiers" },
    ],
  },
  {
    code: "77",
    label: "Produits exceptionnels",
    type: "produit",
    subcomptes: [
      { code: "772", label: "Produits sur exercices antérieurs (à reclasser)" },
      { code: "778", label: "Autres produits exceptionnels" },
    ],
  },
  {
    code: "78",
    label: "Reprises sur amortissements, dépréciations, provisions",
    type: "produit",
    subcomptes: [],
  },
  {
    code: "79",
    label: "Transfert de charges",
    type: "produit",
    subcomptes: [],
  },
];

export function inferJournalType(groupCode) {
  const g = parseInt(groupCode, 10);
  if (g >= 60 && g <= 62) return "ACHATS";
  if (g === 64) return "SALAIRES";
  if (g >= 70 && g <= 75) return "VENTES";
  if (g === 66 || g === 76) return "BANQUE";
  return "OPERATIONS_DIVERS";
}
