// ── CAS_INTERPRETATIONS ───────────────────────────────────────────────────────
// Keys 1-7 correspond to the 7 equilibre financier cases diagnosed by the backend.
export const CAS_INTERPRETATIONS = {
  1: {
    emoji: '✅',
    label: 'Très favorable',
    color: '#00FF87',
    score: 95,
    text: "Situation très favorable : l'entreprise dispose d'un FRNG positif couvrant un BFR négatif, générant une trésorerie nette confortablement positive. L'autofinancement est solide et la structure financière est saine.",
  },
  2: {
    emoji: '✅',
    label: 'Saine',
    color: '#00FF87',
    score: 80,
    text: "Situation saine : les ressources permanentes couvrent les besoins d'exploitation et permettent de maintenir une trésorerie positive. L'équilibre financier est respecté.",
  },
  3: {
    emoji: '⚠️',
    label: 'Sous pression',
    color: '#FFB86C',
    score: 60,
    text: "Situation correcte mais sous pression : les besoins d'exploitation sont élevés et la trésorerie nette est quasi nulle. Un choc imprévu pourrait déstabiliser l'équilibre.",
  },
  4: {
    emoji: '⚠️',
    label: 'Fragile',
    color: '#FFB86C',
    score: 45,
    text: "Situation fragile : la trésorerie reste positive grâce au cycle court, mais le FRNG négatif indique un déséquilibre structurel à corriger rapidement.",
  },
  5: {
    emoji: '❌',
    label: 'Difficile',
    color: '#FF6B6B',
    score: 25,
    text: "Situation difficile : insuffisance de ressources permanentes et forte tension sur la trésorerie. Des mesures correctives urgentes s'imposent (augmentation de capital, cession d'actifs).",
  },
  6: {
    emoji: '❌',
    label: 'Critique',
    color: '#FF6B6B',
    score: 10,
    text: "Situation critique : déséquilibre financier majeur. L'entreprise ne peut couvrir ni ses immobilisations ni ses besoins d'exploitation. Risque élevé de cessation de paiement.",
  },
  7: {
    emoji: '⚠️',
    label: 'Précaire',
    color: '#FFE066',
    score: 35,
    text: "Situation d'équilibre précaire : absence de marge de sécurité financière. Tout choc conjoncturel peut déstabiliser la trésorerie et mettre en péril la continuité.",
  },
};

// ── SCORE_LABEL ───────────────────────────────────────────────────────────────
// Returns a label + emoji for a global financial health score (0–100).
export function SCORE_LABEL(score) {
  if (score >= 90) return { label: 'Excellent', emoji: '🏆' };
  if (score >= 70) return { label: 'Bien', emoji: '✅' };
  if (score >= 50) return { label: 'Moyen', emoji: '⚠️' };
  if (score >= 30) return { label: 'Fragile', emoji: '🔶' };
  return { label: 'Critique', emoji: '🚨' };
}
