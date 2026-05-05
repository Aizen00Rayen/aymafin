import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Target, BarChart3, ChevronRight, RefreshCw } from "lucide-react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../contexts/AuthContext";
import { PLAN_COMPTABLE } from "../data/planComptable";

// ── helpers ───────────────────────────────────────────────────────────────────

const PERIODS = ["Ce mois", "3 mois", "6 mois", "Année"];

const PIE_COLORS = {
  "60": "#00C3FF", "61": "#00FF87", "62": "#FFB86C", "63": "#9b59b6",
  "64": "#FF79C6", "65": "#FFE066", "66": "#FF6B6B", "67": "#e74c3c",
  "68": "#8B9BAD", "69": "#636e72",
};
const PIE_FALLBACK = ["#2563eb", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4"];

function nfmt(n) {
  const num = parseFloat(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return (num / 1_000_000).toFixed(2) + " M";
  if (abs >= 1_000) return (num / 1_000).toFixed(1) + " k";
  return Math.round(num).toLocaleString("fr-DZ");
}

function getPeriodsForRange(range) {
  const now = new Date();
  const count = range === "Ce mois" ? 1 : range === "3 mois" ? 3 : range === "6 mois" ? 6 : 12;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function monthLabel(period) {
  const [y, m] = period.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("fr-FR", { month: "short" });
}

function classIcon(code) {
  const n = parseInt(code, 10);
  if (n >= 60 && n <= 62) return "🛒";
  if (n === 63) return "🏛";
  if (n === 64) return "👥";
  if (n >= 65 && n <= 69) return "⚙️";
  if (n >= 70 && n <= 72) return "📦";
  if (n >= 73 && n <= 74) return "🏦";
  return "💡";
}

// ── count-up component ────────────────────────────────────────────────────────

function CountUp({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf;
    const start = Date.now();
    const duration = 700;
    const from = 0;
    const step = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.floor(from + value * ease));
      if (p < 1) raf = requestAnimationFrame(step);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{nfmt(display)}</>;
}

// ── custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-zinc-400">{p.name} :</span>
          <span className="font-mono text-white">{nfmt(p.value)} DA</span>
        </div>
      ))}
    </div>
  );
}

// ── data hook ─────────────────────────────────────────────────────────────────

function useDashboard(range) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const months = getPeriodsForRange(range);
      const [results, analysisRes] = await Promise.all([
        Promise.all(months.map((m) =>
          api.get(`/accounting/entries?period=${m}`)
            .then((r) => ({ period: m, entries: r.data || [] }))
            .catch(() => ({ period: m, entries: [] }))
        )),
        api.get("/analysis").catch(() => ({ data: null })),
      ]);

      let totalProduits = 0, totalCharges = 0;
      const byClass = {};
      const byMonth = {};
      const allEntries = [];

      results.forEach(({ period, entries }) => {
        byMonth[period] = { produits: 0, charges: 0 };
        entries.forEach((e) => {
          const amt = parseFloat(e.amount) || 0;
          const cg = String(e.account_code).slice(0, 2);
          if (e.entry_type === "charge") {
            totalCharges += amt;
            byMonth[period].charges += amt;
            byClass[cg] = (byClass[cg] || 0) + amt;
          } else {
            totalProduits += amt;
            byMonth[period].produits += amt;
          }
          allEntries.push({ ...e });
        });
      });

      const chartData = months.map((m) => ({
        month: monthLabel(m),
        produits: Math.round(byMonth[m]?.produits || 0),
        charges: Math.round(byMonth[m]?.charges || 0),
      }));

      const donutData = Object.entries(byClass)
        .map(([code, value]) => ({
          code,
          name: PLAN_COMPTABLE.find((c) => c.code === code)?.label || code,
          value: Math.round(value),
        }))
        .sort((a, b) => b.value - a.value);

      const recent = [...allEntries]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);

      const resultatNet = totalProduits - totalCharges;
      const tauxMarge = totalProduits > 0 ? (resultatNet / totalProduits) * 100 : 0;

      // Fallback business info from analysis
      const biz = analysisRes?.data?.business;

      setData({
        totalProduits, totalCharges, resultatNet, tauxMarge,
        chartData, donutData, recent,
        businessName: biz?.name || "",
        hasAccountingData: allEntries.length > 0,
        // Fallback analysis data for empty state
        analysisData: analysisRes?.data,
      });
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetch(); }, [fetch]);
  return { loading, data, refetch: fetch };
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, color, sub, progress }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 min-w-[160px] flex-shrink-0"
      style={{ borderColor: color + "33" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 text-right leading-tight max-w-[80px]">{label}</span>
      </div>
      <div className="font-mono font-bold text-xl leading-tight" style={{ color }}>
        <CountUp value={typeof value === "number" ? value : 0} />
        {typeof value === "string" && value.includes("%") ? " %" : " DA"}
      </div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: progress > 20 ? "#00FF87" : progress > 5 ? "#FFB86C" : "#FF6B6B" }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState("Ce mois");
  const { loading, data, refetch } = useDashboard(range);

  const totalChargesInt = Math.round(data?.totalCharges || 0);
  const totalProduitsInt = Math.round(data?.totalProduits || 0);
  const resultatInt = Math.round(data?.resultatNet || 0);
  const margeRaw = data?.tauxMarge || 0;

  return (
    <AppLayout>
      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {data?.businessName && (
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
              {data.businessName}
            </div>
          )}
          <h1 className="text-2xl font-display font-bold">
            Bonjour, {user?.name?.split(" ")[0] || "—"} 👋
          </h1>
        </div>
        <button
          onClick={refetch}
          className="size-9 flex items-center justify-center rounded-xl glass hover:bg-white/10 transition active:scale-90"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* period chips */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 no-scrollbar">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setRange(p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              range === p
                ? "bg-cyan-400/15 text-cyan-300 border border-cyan-400/40"
                : "glass text-zinc-400 hover:text-white border border-transparent"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* KPI cards — horizontal scroll */}
      {loading ? (
        <div className="flex gap-3 mb-6 overflow-x-auto no-scrollbar">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-5 min-w-[160px] h-28 animate-pulse flex-shrink-0" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 mb-6 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory">
          <KpiCard
            label="Chiffre d'affaires"
            value={totalProduitsInt}
            icon="📈"
            color="#00C3FF"
            sub={range}
          />
          <KpiCard
            label="Total charges"
            value={totalChargesInt}
            icon="📉"
            color="#FF6B6B"
            sub={range}
          />
          <KpiCard
            label="Résultat net"
            value={resultatInt}
            icon="💎"
            color={resultatInt >= 0 ? "#00FF87" : "#FF6B6B"}
            sub={resultatInt >= 0 ? "Bénéfice" : "Déficit"}
          />
          <KpiCard
            label="Taux de marge"
            value={parseFloat(margeRaw.toFixed(1))}
            icon="🎯"
            color={margeRaw > 20 ? "#00FF87" : margeRaw > 5 ? "#FFB86C" : "#FF6B6B"}
            sub={`${margeRaw > 20 ? "Excellent" : margeRaw > 5 ? "Correct" : "Faible"}`}
            progress={margeRaw}
          />
        </div>
      )}

      {/* area chart */}
      <AnimatePresence mode="wait">
        {!loading && data && (
          <motion.div
            key={range + "area"}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-5 mb-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Évolution</div>
                <div className="font-semibold text-sm mt-0.5">Produits vs Charges</div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-cyan-400" /> Produits
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-red-400" /> Charges
                </span>
              </div>
            </div>
            {data.chartData.every((d) => d.produits === 0 && d.charges === 0) ? (
              <div className="h-44 flex items-center justify-center text-zinc-600 text-sm">
                Aucune donnée pour cette période
              </div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="gradProduits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00C3FF" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#00C3FF" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradCharges" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF6B6B" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#FF6B6B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" stroke="#52525b" fontSize={10} tick={{ fill: "#71717a" }} />
                    <YAxis stroke="#52525b" fontSize={10} tick={{ fill: "#71717a" }} tickFormatter={(v) => nfmt(v)} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="produits" name="Produits" stroke="#00C3FF" strokeWidth={2} fill="url(#gradProduits)" />
                    <Area type="monotone" dataKey="charges" name="Charges" stroke="#FF6B6B" strokeWidth={2} fill="url(#gradCharges)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* donut + legend */}
      {!loading && data?.donutData?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-5 mb-5"
        >
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
            Répartition des charges
          </div>
          <div className="flex gap-4 items-center">
            <div className="w-36 h-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.donutData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={60}
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {data.donutData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[d.code] || PIE_FALLBACK[i % PIE_FALLBACK.length]}
                        stroke="#09090b"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, fontSize: 11 }}
                    formatter={(v) => [`${nfmt(v)} DA`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto max-h-36">
              {data.donutData.map((d, i) => {
                const color = PIE_COLORS[d.code] || PIE_FALLBACK[i % PIE_FALLBACK.length];
                const pct = totalChargesInt > 0 ? ((d.value / totalChargesInt) * 100).toFixed(1) : "0";
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="size-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-zinc-400 truncate flex-1">{d.code} {d.name}</span>
                    <span className="font-mono text-white shrink-0">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* recent transactions */}
      {!loading && data && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Activité récente</div>
            <button
              onClick={() => window.location.hash = "#/data-entry"}
              className="text-xs text-cyan-400 flex items-center gap-1 hover:text-cyan-300 transition"
            >
              Voir tout <ChevronRight className="size-3" />
            </button>
          </div>

          {data.recent.length === 0 ? (
            <div className="py-8 text-center">
              <BarChart3 className="size-8 mx-auto mb-2 text-zinc-700" />
              <p className="text-sm text-zinc-500">Aucune transaction pour {range.toLowerCase()}</p>
              <p className="text-xs text-zinc-600 mt-1">Utilisez la Saisie comptable pour commencer</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recent.map((e) => {
                const cg = String(e.account_code).slice(0, 2);
                const cls = PLAN_COMPTABLE.find((c) => c.code === cg);
                const isCharge = e.entry_type === "charge";
                return (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <div className="size-9 rounded-xl glass flex items-center justify-center text-base shrink-0">
                      {classIcon(cg)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {e.account_code} · {cls?.subcomptes?.find((s) => s.code === e.account_code)?.label || cls?.label || e.account_code}
                      </div>
                      <div className="text-xs text-zinc-500">{e.period}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-mono font-semibold ${isCharge ? "text-red-400" : "text-emerald-400"}`}>
                        {isCharge ? "−" : "+"}{nfmt(e.amount)} DA
                      </div>
                      <div className={`text-xs px-1.5 py-0.5 rounded ${isCharge ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {isCharge ? "CHARGE" : "PRODUIT"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="glass rounded-2xl h-52 animate-pulse" />
          <div className="glass rounded-2xl h-40 animate-pulse" />
          <div className="glass rounded-2xl h-40 animate-pulse" />
        </div>
      )}
    </AppLayout>
  );
}
