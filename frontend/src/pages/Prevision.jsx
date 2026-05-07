import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target,
  BarChart3, Zap, RefreshCw, ChevronUp, ChevronDown, Minus,
} from "lucide-react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

const fade = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 } };

function nfmt(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + " Md";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + " M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + " k";
  return Math.round(n).toLocaleString("fr-DZ");
}

function pct(n) { return (n >= 0 ? "+" : "") + n.toFixed(1) + " %"; }

function monthLabel(period) {
  if (!period) return "";
  const [y, m] = period.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("fr-FR", { month: "short", year: "2-digit" });
}

function yearFromMonth(i, startYear) {
  const yr = startYear + Math.floor(i / 12);
  const mo = (i % 12) + 1;
  return `${String(mo).padStart(2, "0")}/${yr}`;
}

// Growth rate (CAGR-style) from array of values
function computeGrowthRate(values) {
  const clean = values.filter((v) => v > 0);
  if (clean.length < 2) return 0;
  const first = clean[0], last = clean[clean.length - 1];
  const monthlyRate = Math.pow(last / first, 1 / (clean.length - 1)) - 1;
  return monthlyRate;
}

// Project N months from last value using monthly rate
function project(lastVal, monthlyRate, n) {
  const out = [];
  let v = lastVal;
  for (let i = 0; i < n; i++) {
    v = v * (1 + monthlyRate);
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}

const SCENARIO_CFG = {
  optimiste:  { revBoost: 0.015,  chgBoost: -0.005, color: "#22c55e", label: "Optimiste",  desc: "Croissance accélérée des produits, maîtrise des charges" },
  realiste:   { revBoost: 0.000,  chgBoost:  0.000, color: "#00c3ff", label: "Réaliste",   desc: "Projection basée sur la tendance observée" },
  pessimiste: { revBoost: -0.010, chgBoost:  0.010, color: "#f59e0b", label: "Pessimiste", desc: "Ralentissement des produits, pression sur les charges" },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#18181b] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="text-zinc-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-zinc-300">{p.name}:</span>
          <span className="font-mono font-bold" style={{ color: p.color }}>{nfmt(p.value)} DA</span>
        </div>
      ))}
    </div>
  );
};

// ── Health score computation ───────────────────────────────────────────────────
function computeHealthScore(hist, revRate, chgRate, avgMargin) {
  let score = 50;
  // Revenue trend
  if (revRate > 0.05) score += 20;
  else if (revRate > 0.02) score += 12;
  else if (revRate > 0) score += 6;
  else if (revRate < -0.05) score -= 20;
  else if (revRate < 0) score -= 10;
  // Margin
  if (avgMargin > 30) score += 20;
  else if (avgMargin > 15) score += 12;
  else if (avgMargin > 5) score += 6;
  else if (avgMargin < 0) score -= 20;
  else if (avgMargin < 5) score -= 8;
  // Charge control
  if (chgRate < revRate) score += 10;
  else if (chgRate > revRate + 0.02) score -= 10;
  // History depth
  if (hist.length >= 6) score += 8;
  else if (hist.length >= 3) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getVerdict(score, revRate, avgMargin) {
  if (score >= 75) return { label: "Excellent", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle, emoji: "🚀" };
  if (score >= 55) return { label: "Prometteur", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/30", icon: TrendingUp, emoji: "📈" };
  if (score >= 40) return { label: "À surveiller", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: AlertTriangle, emoji: "⚠️" };
  return { label: "En difficulté", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: TrendingDown, emoji: "🚨" };
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Prevision() {
  const [periods, setPeriods] = useState([]);
  const [history, setHistory] = useState([]);  // [{period, produits, charges, resultat}]
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState("realiste");
  const [horizon, setHorizon] = useState(24); // months
  const [projData, setProjData] = useState([]);
  const [metrics, setMetrics] = useState(null);

  // Load available periods + TCR for each
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pRes = await api.get("/accounting/periods");
      const allPeriods = (pRes.data || []).slice(0, 12); // last 12 periods
      setPeriods(allPeriods);

      if (allPeriods.length === 0) { setHistory([]); setLoading(false); return; }

      const results = await Promise.all(
        allPeriods.map((p) => api.get(`/accounting/tcr?period=${p}`).then((r) => ({ period: p, ...r.data })).catch(() => null))
      );
      const hist = results
        .filter(Boolean)
        .filter((r) => r.total_produits > 0 || r.total_charges > 0)
        .sort((a, b) => a.period.localeCompare(b.period));
      setHistory(hist);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recompute projections whenever history, scenario, or horizon changes
  useEffect(() => {
    if (history.length === 0) { setProjData([]); setMetrics(null); return; }

    const revValues = history.map((h) => h.total_produits);
    const chgValues = history.map((h) => h.total_charges);
    const baseRevRate = computeGrowthRate(revValues);
    const baseChgRate = computeGrowthRate(chgValues);
    const lastRev = revValues[revValues.length - 1] || 0;
    const lastChg = chgValues[chgValues.length - 1] || 0;
    const avgMargin = history.reduce((s, h) => {
      const m = h.total_produits > 0 ? (h.resultat_net / h.total_produits) * 100 : 0;
      return s + m;
    }, 0) / history.length;

    const cfg = SCENARIO_CFG[scenario];
    const adjRevRate = baseRevRate + cfg.revBoost;
    const adjChgRate = baseChgRate + cfg.chgBoost;

    const projRev = project(lastRev, adjRevRate, horizon);
    const projChg = project(lastChg, adjChgRate, horizon);

    const startYear = new Date().getFullYear();
    const startMonth = new Date().getMonth();

    // Build projection array
    const proj = projRev.map((rev, i) => {
      const chg = projChg[i];
      const mo = (startMonth + i) % 12;
      const yr = startYear + Math.floor((startMonth + i) / 12);
      const label = `${String(mo + 1).padStart(2, "0")}/${yr}`;
      return { month: label, produits: rev, charges: chg, resultat: rev - chg };
    });
    setProjData(proj);

    // Year summaries
    const yearSummaries = [1, 2, 3].map((yr) => {
      const slice = proj.slice((yr - 1) * 12, yr * 12);
      if (slice.length === 0) return null;
      const totRev = slice.reduce((s, m) => s + m.produits, 0);
      const totChg = slice.reduce((s, m) => s + m.charges, 0);
      const totRes = totRev - totChg;
      const margin = totRev > 0 ? (totRes / totRev) * 100 : 0;
      return { year: yr, rev: totRev, chg: totChg, res: totRes, margin };
    }).filter(Boolean);

    const score = computeHealthScore(history, baseRevRate, baseChgRate, avgMargin);
    const verdict = getVerdict(score, baseRevRate, avgMargin);

    setMetrics({
      baseRevRate, baseChgRate, avgMargin, lastRev, lastChg,
      annualRevRate: (Math.pow(1 + baseRevRate, 12) - 1) * 100,
      annualChgRate: (Math.pow(1 + baseChgRate, 12) - 1) * 100,
      score, verdict, yearSummaries,
    });
  }, [history, scenario, horizon]);

  const histChartData = history.map((h) => ({
    month: monthLabel(h.period),
    produits: h.total_produits,
    charges: h.total_charges,
    resultat: h.resultat_net,
  }));

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <RefreshCw className="size-8 text-zinc-600 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (history.length === 0) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <BarChart3 className="size-16 text-zinc-700 mb-4" />
          <h2 className="text-xl font-bold mb-2">Aucune donnée disponible</h2>
          <p className="text-zinc-500 text-sm max-w-sm">
            Saisissez vos charges et produits dans la section <strong>Saisie comptable</strong> pour générer des prévisions.
          </p>
        </div>
      </AppLayout>
    );
  }

  const cfg = SCENARIO_CFG[scenario];

  return (
    <AppLayout>
      <motion.div initial="hidden" animate="visible" variants={fade} transition={{ duration: 0.4 }} className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold">Prévisions</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Basées sur {history.length} période{history.length > 1 ? "s" : ""} de données réelles
            </p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 glass hover:bg-white/10 rounded-xl text-sm transition">
            <RefreshCw className="size-4" /> Actualiser
          </button>
        </div>

        {/* ── Business verdict ── */}
        {metrics && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
            className={`rounded-2xl border p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${metrics.verdict.bg}`}>
            <div className="text-5xl">{metrics.verdict.emoji}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xl font-display font-black ${metrics.verdict.color}`}>{metrics.verdict.label}</span>
                <span className="text-xs text-zinc-500 font-mono">Score {metrics.score}/100</span>
              </div>
              <p className="text-sm text-zinc-300">
                {metrics.score >= 75 && "Votre activité montre une croissance saine. Les projections sont favorables."}
                {metrics.score >= 55 && metrics.score < 75 && "Bonne dynamique. Continuez à surveiller vos marges et charges."}
                {metrics.score >= 40 && metrics.score < 55 && "Tendance mitigée. Des ajustements sont recommandés pour améliorer la rentabilité."}
                {metrics.score < 40 && "Situation préoccupante. Une restructuration des charges et une relance des produits sont nécessaires."}
              </p>
            </div>
            {/* Score bar */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="text-xs text-zinc-500 mb-1">Santé financière</div>
              <div className="w-36 h-3 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.score}%` }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  className="h-full rounded-full"
                  style={{ background: metrics.score >= 75 ? "#22c55e" : metrics.score >= 55 ? "#00c3ff" : metrics.score >= 40 ? "#f59e0b" : "#ef4444" }}
                />
              </div>
              <div className={`text-xl font-display font-black ${metrics.verdict.color}`}>{metrics.score}<span className="text-sm font-normal text-zinc-500">/100</span></div>
            </div>
          </motion.div>
        )}

        {/* ── Key metrics ── */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Croissance Produits", icon: TrendingUp,
                value: pct(metrics.annualRevRate),
                sub: "annualisée",
                color: metrics.annualRevRate >= 0 ? "text-emerald-400" : "text-red-400",
                trend: metrics.annualRevRate >= 0 ? "up" : "down",
              },
              {
                label: "Croissance Charges", icon: TrendingDown,
                value: pct(metrics.annualChgRate),
                sub: "annualisée",
                color: metrics.annualChgRate <= 0 ? "text-emerald-400" : "text-orange-400",
                trend: metrics.annualChgRate >= 0 ? "up" : "down",
              },
              {
                label: "Marge moyenne", icon: Target,
                value: pct(metrics.avgMargin),
                sub: `sur ${history.length} mois`,
                color: metrics.avgMargin >= 20 ? "text-emerald-400" : metrics.avgMargin >= 0 ? "text-cyan-400" : "text-red-400",
                trend: metrics.avgMargin >= 0 ? "up" : "down",
              },
              {
                label: "Dernier Résultat", icon: BarChart3,
                value: nfmt(metrics.lastRev - metrics.lastChg),
                sub: "DA / mois",
                color: (metrics.lastRev - metrics.lastChg) >= 0 ? "text-emerald-400" : "text-red-400",
                trend: (metrics.lastRev - metrics.lastChg) >= 0 ? "up" : "down",
              },
            ].map(({ label, icon: Icon, value, sub, color, trend }, i) => (
              <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className="size-4 text-zinc-500" />
                  {trend === "up" ? <ChevronUp className="size-4 text-emerald-400" /> : trend === "down" ? <ChevronDown className="size-4 text-red-400" /> : <Minus className="size-4 text-zinc-400" />}
                </div>
                <div className="text-xs text-zinc-500 mb-1">{label}</div>
                <div className={`text-base font-display font-bold leading-tight ${color}`}>{value}</div>
                <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Historical performance ── */}
        {histChartData.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h2 className="font-semibold text-sm mb-1">Historique réel</h2>
            <p className="text-xs text-zinc-500 mb-4">Produits vs charges par mois</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={histChartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => nfmt(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="produits" name="Produits" fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.85} />
                <Bar dataKey="charges" name="Charges" fill="#ef4444" radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
            {/* Résultat line mini */}
            <div className="mt-3">
              <div className="text-xs text-zinc-500 mb-2">Résultat net mensuel</div>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={histChartData} margin={{ top: 2, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="resGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00c3ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00c3ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => nfmt(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#ffffff20" strokeDasharray="4 4" />
                  <Area dataKey="resultat" name="Résultat" stroke="#00c3ff" fill="url(#resGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Scenario selector + horizon ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-1">
            {Object.entries(SCENARIO_CFG).map(([key, val]) => (
              <button key={key} onClick={() => setScenario(key)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition border ${
                  scenario === key ? "text-zinc-950 border-transparent" : "glass text-zinc-400 border-white/10 hover:text-white"
                }`}
                style={scenario === key ? { background: val.color } : {}}>
                {val.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[12, 24, 36].map((h) => (
              <button key={h} onClick={() => setHorizon(h)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition border ${
                  horizon === h ? "bg-white/10 text-white border-white/20" : "glass text-zinc-500 border-white/5"
                }`}>
                {h === 12 ? "1 an" : h === 24 ? "2 ans" : "3 ans"}
              </button>
            ))}
          </div>
        </div>

        {/* Scenario description */}
        <div className="text-xs text-zinc-500 -mt-3 px-1">
          <span className="font-semibold" style={{ color: cfg.color }}>{cfg.label} : </span>{cfg.desc}
        </div>

        {/* ── Projection chart ── */}
        {projData.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h2 className="font-semibold text-sm mb-1">Projection — Scénario {cfg.label}</h2>
            <p className="text-xs text-zinc-500 mb-4">{horizon} mois · Produits, charges, résultat projetés</p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={projData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="projRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projChgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false}
                  interval={Math.floor(projData.length / 6)} />
                <YAxis tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={(v) => nfmt(v)} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#ffffff20" />
                <Area dataKey="produits" name="Produits" stroke={cfg.color} fill="url(#projRevGrad)" strokeWidth={2} dot={false} />
                <Area dataKey="charges" name="Charges" stroke="#ef4444" fill="url(#projChgGrad)" strokeWidth={2} dot={false} />
                <Line dataKey="resultat" name="Résultat" stroke="#ffffff" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Year-by-year summary ── */}
        {metrics?.yearSummaries?.length > 0 && (
          <div>
            <h2 className="font-semibold text-sm mb-3">Résumé par année — Scénario {cfg.label}</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {metrics.yearSummaries.map((yr) => {
                const positive = yr.res >= 0;
                return (
                  <motion.div key={yr.year} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: yr.year * 0.08 }}
                    className="glass rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Année {yr.year}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        positive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      }`}>{positive ? "Bénéfice" : "Déficit"}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Produits</span>
                        <span className="font-mono text-emerald-400 font-semibold">{nfmt(yr.rev)} DA</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Charges</span>
                        <span className="font-mono text-red-400 font-semibold">{nfmt(yr.chg)} DA</span>
                      </div>
                      <div className="h-px bg-white/5" />
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-zinc-300">Résultat net</span>
                        <span className={`font-mono ${positive ? "text-emerald-400" : "text-red-400"}`}>{nfmt(yr.res)} DA</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Marge</span>
                        <span className={`font-mono ${yr.margin >= 15 ? "text-emerald-400" : yr.margin >= 0 ? "text-yellow-400" : "text-red-400"}`}>{pct(yr.margin)}</span>
                      </div>
                    </div>
                    {/* Mini margin bar */}
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(0, yr.margin))}%`,
                          background: yr.margin >= 15 ? "#22c55e" : yr.margin >= 0 ? "#f59e0b" : "#ef4444",
                        }} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recommendations ── */}
        {metrics && (
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="size-4 text-yellow-400" />
              <h2 className="font-semibold text-sm">Recommandations stratégiques</h2>
            </div>
            <div className="space-y-3">
              {[
                metrics.annualRevRate < 0 && {
                  icon: "🔴", title: "Relancer les produits",
                  body: `Vos produits diminuent de ${pct(metrics.annualRevRate)} par an. Diversifiez vos sources de revenus ou ajustez votre offre.`,
                },
                metrics.annualChgRate > metrics.annualRevRate && {
                  icon: "🟡", title: "Maîtriser les charges",
                  body: `Les charges croissent plus vite que les produits (${pct(metrics.annualChgRate)} vs ${pct(metrics.annualRevRate)}). Identifiez les postes à optimiser.`,
                },
                metrics.avgMargin < 10 && {
                  icon: "🟠", title: "Améliorer les marges",
                  body: `Votre marge moyenne est de ${pct(metrics.avgMargin)}. Un objectif de 15-20 % est recommandé pour une activité viable.`,
                },
                metrics.avgMargin >= 20 && metrics.annualRevRate > 0 && {
                  icon: "🟢", title: "Capitaliser la croissance",
                  body: `Votre marge de ${pct(metrics.avgMargin)} est solide. Réinvestissez dans le développement pour accélérer la croissance.`,
                },
                history.length < 3 && {
                  icon: "ℹ️", title: "Enrichir l'historique",
                  body: "Seulement " + history.length + " période(s) disponible(s). Plus vous saisissez de données, plus les prévisions seront précises.",
                },
                !metrics.annualRevRate < 0 && !metrics.annualChgRate > metrics.annualRevRate && metrics.avgMargin >= 10 && {
                  icon: "✅", title: "Tendances favorables",
                  body: "Vos indicateurs sont globalement positifs. Maintenez cette dynamique et planifiez votre développement à 2-3 ans.",
                },
              ].filter(Boolean).slice(0, 4).map(({ icon, title, body }, i) => (
                <div key={i} className="flex gap-3 p-3 bg-white/3 rounded-xl">
                  <span className="text-lg shrink-0">{icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 mb-0.5">{title}</div>
                    <div className="text-xs text-zinc-400">{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </motion.div>
    </AppLayout>
  );
}
