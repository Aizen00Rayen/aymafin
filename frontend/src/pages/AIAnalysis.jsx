import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, Clock, Users,
  Lightbulb, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

const fade = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nfmt(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e9) s = (n / 1e9).toFixed(2) + " G";
  else if (abs >= 1e6) s = (n / 1e6).toFixed(2) + " M";
  else if (abs >= 1e3) s = (n / 1e3).toFixed(1) + " K";
  else s = n.toLocaleString("fr-DZ");
  return s + " DA";
}

const PRIORITY_STYLES = {
  high: "border-red-500/30 bg-red-500/5",
  medium: "border-yellow-500/30 bg-yellow-500/5",
  low: "border-green-500/30 bg-green-500/5",
};

const PRIORITY_LABELS = { high: "Priorité haute", medium: "Priorité moyenne", low: "Priorité basse" };

const PRIORITY_BADGE = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-yellow-500/15 text-yellow-400",
  low: "bg-green-500/15 text-green-400",
};

// ── Indicator card ────────────────────────────────────────────────────────────
function IndicatorCard({ emoji, label, value, sub, color = "text-white", detailRows }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
          <div className={`text-2xl font-display font-bold ${color}`}>
            {emoji} {value}
          </div>
        </div>
      </div>
      {sub && <p className="text-xs text-zinc-400 leading-relaxed">{sub}</p>}
      {detailRows && (
        <div className="mt-3">
          <button onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition">
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            Détails de calcul
          </button>
          {expanded && (
            <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
              {detailRows.map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-zinc-500">{k}</span>
                  <span className="font-mono text-zinc-300">{typeof v === "number" ? nfmt(v) : v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-[#2563eb]/10 rounded-xl">
          <Icon className="size-5 text-[#60a5fa]" />
        </div>
        <h2 className="text-lg font-display font-bold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Gauge bar ─────────────────────────────────────────────────────────────────
function GaugeBar({ value, min = 0, max = 100, label, color = "#2563eb" }) {
  const pct = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>{label}</span>
        <span className="font-mono text-white">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Delay comparison ──────────────────────────────────────────────────────────
function DelayComparison({ dc, df }) {
  const maxDays = Math.max(dc, df, 90) * 1.1;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-sm font-semibold mb-4">Comparaison délais (en jours)</div>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-zinc-400">Délai clients</span>
            <span className={`font-mono font-semibold ${dc < 60 ? "text-green-400" : dc <= 90 ? "text-yellow-400" : "text-red-400"}`}>
              {dc} j
            </span>
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(dc / maxDays) * 100}%`, backgroundColor: dc < 60 ? "#22c55e" : dc <= 90 ? "#f59e0b" : "#ef4444" }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-zinc-400">Délai fournisseurs</span>
            <span className={`font-mono font-semibold ${df < 60 ? "text-green-400" : df <= 90 ? "text-yellow-400" : "text-red-400"}`}>
              {df} j
            </span>
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(df / maxDays) * 100}%`, backgroundColor: df < 60 ? "#22c55e" : df <= 90 ? "#f59e0b" : "#ef4444" }} />
          </div>
        </div>
        <div className="text-xs text-zinc-500 border-t border-white/5 pt-3">
          Référence : &lt;60j excellent · 60-90j correct · &gt;90j à améliorer
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AIAnalysis() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (p = period) => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const r = await api.get(`/ai-analysis?period=${p}`);
      setData(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Erreur lors du chargement de l'analyse");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const handlePeriodChange = (val) => {
    setPeriod(val);
    load(val);
  };

  const eq = data?.equilibre_financier;
  const caf = data?.caf;
  const rent = data?.rentabilite;
  const del = data?.delais;
  const recs = data?.recommendations || [];

  return (
    <AppLayout>
      <motion.div initial="hidden" animate="visible" variants={fade} transition={{ duration: 0.4 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold">Analyse IA</h1>
            <p className="text-sm text-zinc-400 mt-1">Analyse financière automatique et recommandations intelligentes</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={period} onChange={(e) => handlePeriodChange(e.target.value)}
              className="bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
            <button onClick={() => load()} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm font-medium transition disabled:opacity-50">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Analyser
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="glass rounded-2xl p-6 mb-6 border border-yellow-500/20 bg-yellow-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-300 mb-1">Données insuffisantes</p>
                <p className="text-xs text-zinc-400">{error}</p>
                <p className="text-xs text-zinc-500 mt-2">
                  Assurez-vous d'avoir saisi vos charges/produits dans "Saisie des données" et le bilan dans "États financiers".
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => <div key={i} className="glass rounded-2xl h-32 animate-pulse" />)}
            </div>
            <div className="glass rounded-2xl h-48 animate-pulse" />
            <div className="glass rounded-2xl h-48 animate-pulse" />
          </div>
        )}

        {data && (
          <>
            {/* 1. Équilibre financier */}
            <Section icon={Scale} title="1. Équilibre financier">
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <IndicatorCard
                  emoji={eq.frng >= 0 ? "✅" : "🚨"}
                  label="FRNG — Fonds de roulement net global"
                  value={nfmt(eq.frng)}
                  color={eq.frng >= 0 ? "text-green-400" : "text-red-400"}
                  sub="Capitaux permanents − Actif immobilisé net"
                  detailRows={[
                    ["Capitaux permanents", eq.details.capitaux_permanents],
                    ["Actif immobilisé net", eq.details.actif_immobilise_net],
                  ]}
                />
                <IndicatorCard
                  emoji={eq.bfr <= 0 ? "✅" : eq.bfr < eq.frng ? "⚠️" : "🚨"}
                  label="BFR — Besoin en fonds de roulement"
                  value={nfmt(eq.bfr)}
                  color={eq.bfr <= 0 ? "text-green-400" : eq.bfr < eq.frng ? "text-yellow-400" : "text-red-400"}
                  sub="(Actif courant − Dispo.) − (Passif courant − Avances)"
                  detailRows={[
                    ["Actif courant", eq.details.actif_courant],
                    ["Disponibilités", eq.details.disponibilites],
                    ["Passif courant", eq.details.passif_courant],
                    ["Avances bancaires", eq.details.avances_bancaires],
                  ]}
                />
                <IndicatorCard
                  emoji={eq.tn >= 0 ? "✅" : "🚨"}
                  label="TN — Trésorerie nette"
                  value={nfmt(eq.tn)}
                  color={eq.tn >= 0 ? "text-green-400" : "text-red-400"}
                  sub="FRNG − BFR"
                />
              </div>
              <div className={`glass rounded-2xl p-5 border ${
                eq.cas <= 2 ? "border-green-500/20" : eq.cas <= 4 ? "border-yellow-500/20" : "border-red-500/20"
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{eq.emoji}</span>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Cas {eq.cas} — Interprétation</div>
                    <p className="text-sm text-zinc-200 leading-relaxed">{eq.interpretation}</p>
                  </div>
                </div>
              </div>
            </Section>

            {/* 2. CAF */}
            <Section icon={TrendingUp} title="2. Capacité d'autofinancement (CAF)">
              <div className="grid sm:grid-cols-2 gap-4">
                <IndicatorCard
                  emoji={caf.emoji}
                  label="CAF"
                  value={nfmt(caf.caf)}
                  color={caf.cas === 1 ? "text-green-400" : caf.cas === 2 ? "text-red-400" : "text-yellow-400"}
                  sub={caf.interpretation}
                  detailRows={[
                    ["Résultat net", caf.details.resultat_net],
                    ["+ Dotations amortissements", caf.details.dotations_amortissements],
                    ["− Reprises", caf.details.reprises],
                    ["+ Valeur comptable cessions", caf.details.valeur_compt_cessions],
                    ["− Produits de cession", caf.details.produits_cession],
                  ]}
                />
                <div className="glass rounded-2xl p-5 flex flex-col justify-center">
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Formule CAF</div>
                  <div className="font-mono text-xs space-y-1 text-zinc-400">
                    <div className="text-white">CAF =</div>
                    <div className="pl-4">Résultat net</div>
                    <div className="pl-4">+ Dotations aux amortissements</div>
                    <div className="pl-4">− Reprises de dotations</div>
                    <div className="pl-4">+ Valeur comptable des cessions</div>
                    <div className="pl-4">− Produits de cession d'actif</div>
                    <div className="pl-4">− Quote-parts subventions virées</div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 3. Rentabilité */}
            <Section icon={TrendingUp} title="3. Analyse de la rentabilité">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <IndicatorCard
                  emoji={rent.re_emoji}
                  label="RE — Rentabilité économique"
                  value={`${rent.re.toFixed(2)}%`}
                  color={rent.re_cas === 1 ? "text-green-400" : rent.re_cas === 2 ? "text-yellow-400" : "text-red-400"}
                  sub={rent.re_interpretation}
                  detailRows={[
                    ["Résultat net", rent.details.resultat_net],
                    ["Total actif", rent.details.total_actif],
                    ["Formule", "Résultat net / Total actif × 100"],
                  ]}
                />
                <IndicatorCard
                  emoji={rent.rf_emoji}
                  label="RF — Rentabilité financière"
                  value={`${rent.rf.toFixed(2)}%`}
                  color={rent.rf_cas === 1 ? "text-green-400" : rent.rf_cas === 2 ? "text-yellow-400" : "text-red-400"}
                  sub={rent.rf_interpretation}
                  detailRows={[
                    ["Résultat net", rent.details.resultat_net],
                    ["Capitaux propres", rent.details.capitaux_propres],
                    ["Formule", "Résultat net / Capitaux propres × 100"],
                  ]}
                />
              </div>
              <div className="glass rounded-2xl p-5 space-y-4">
                <GaugeBar value={rent.re} min={-5} max={20} label="Rentabilité économique (RE)" color={rent.re_cas === 1 ? "#22c55e" : rent.re_cas === 2 ? "#f59e0b" : "#ef4444"} />
                <GaugeBar value={rent.rf} min={-10} max={30} label="Rentabilité financière (RF)" color={rent.rf_cas === 1 ? "#22c55e" : rent.rf_cas === 2 ? "#f59e0b" : "#ef4444"} />
                <div className="text-xs text-zinc-500 border-t border-white/5 pt-3">
                  RE : &gt;5% excellent · 1-5% moyen · &lt;1% faible &nbsp;|&nbsp; RF : &gt;15% excellent · 5-15% moyen · &lt;5% faible
                </div>
              </div>
            </Section>

            {/* 4. Délais */}
            <Section icon={Clock} title="4. Analyse des délais de paiement">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <IndicatorCard
                  emoji={del.dc_emoji}
                  label="Délai clients"
                  value={`${del.delai_clients} jours`}
                  color={del.dc_cas === 1 ? "text-green-400" : del.dc_cas === 2 ? "text-yellow-400" : "text-red-400"}
                  sub={del.dc_interpretation}
                  detailRows={[
                    ["Créances clients", del.details.creances_clients],
                    ["CA HT", del.details.ca],
                    ["Formule", "(Créances / CA) × 360"],
                  ]}
                />
                <IndicatorCard
                  emoji={del.df_emoji}
                  label="Délai fournisseurs"
                  value={`${del.delai_fournisseurs} jours`}
                  color={del.df_cas === 1 ? "text-green-400" : del.df_cas === 2 ? "text-yellow-400" : "text-red-400"}
                  sub={del.df_interpretation}
                  detailRows={[
                    ["Dettes fournisseurs", del.details.dettes_fournisseurs],
                    ["Achats HT", del.details.achats],
                    ["Formule", "(Dettes / Achats) × 360"],
                  ]}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <DelayComparison dc={del.delai_clients} df={del.delai_fournisseurs} />
                <div className={`glass rounded-2xl p-5 border ${del.comp_cas === 2 ? "border-green-500/20" : "border-yellow-500/20"}`}>
                  <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Comparaison</div>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{del.comp_emoji}</span>
                    <p className="text-sm text-zinc-300 leading-relaxed">{del.comp_interpretation}</p>
                  </div>
                </div>
              </div>
            </Section>

            {/* 5. Recommandations */}
            <Section icon={Lightbulb} title="5. Recommandations intelligentes">
              <div className="space-y-3">
                {recs.map((rec, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`rounded-2xl p-5 border ${PRIORITY_STYLES[rec.priority]}`}>
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-white/5 rounded-xl shrink-0">
                        <Lightbulb className="size-4 text-[#60a5fa]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">{rec.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_BADGE[rec.priority]}`}>
                            {PRIORITY_LABELS[rec.priority]}
                          </span>
                          <span className="text-xs text-zinc-500">{rec.area}</span>
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed">{rec.action}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Section>
          </>
        )}
      </motion.div>
    </AppLayout>
  );
}

// Named export for Scale icon used in Bilan section
function Scale(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  );
}
