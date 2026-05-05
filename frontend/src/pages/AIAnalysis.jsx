import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain, AlertTriangle, TrendingUp, Clock,
  Lightbulb, RefreshCw, ChevronDown, ChevronUp,
  BarChart3, Users, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { CAS_INTERPRETATIONS, SCORE_LABEL } from "../data/interpretations";

// ── Variants ──────────────────────────────────────────────────────────────────
const fade = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon: Icon, color = "#00C3FF", title, children }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-xl" style={{ background: `${color}18` }}>
          <Icon className="size-5" style={{ color }} />
        </div>
        <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }) {
  return <div className={`rounded-2xl animate-pulse bg-white/5 ${className}`} />;
}

// ── 1. ArcGauge ───────────────────────────────────────────────────────────────
function ArcGauge({ score }) {
  const [animVal, setAnimVal] = useState(0);

  useEffect(() => {
    setAnimVal(0);
    const t = setTimeout(() => setAnimVal(score), 120);
    return () => clearTimeout(t);
  }, [score]);

  const cx = 140, cy = 145, r = 120;
  const arcLen = Math.PI * r; // half circle length
  const fill = (animVal / 100) * arcLen;

  const gaugeColor = score >= 70 ? "#00FF87" : score >= 40 ? "#FFB86C" : "#FF6B6B";
  // Arc: starts at (cx-r, cy) sweeps through the top to (cx+r, cy)  → large-arc=1 sweep=0 going counter-clockwise through top
  // Actually for SVG: to go from left→top→right (through top), use sweep-flag=0 (CCW) with large-arc=1
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div style={{ maxWidth: 280, margin: "0 auto" }}>
      <svg viewBox="0 0 280 160" style={{ width: "100%", overflow: "visible" }}>
        {/* Background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="#1A3A5C"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* Animated fill arc */}
        <path
          d={arcPath}
          fill="none"
          stroke={gaugeColor}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${fill} ${arcLen + 10}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.4,0,.2,1)" }}
        />
        {/* Score number */}
        <text
          x={cx}
          y={cy - 18}
          textAnchor="middle"
          dominantBaseline="auto"
          fill={gaugeColor}
          fontFamily="'JetBrains Mono', 'Courier New', monospace"
          fontSize={48}
          fontWeight="800"
        >
          {Math.round(animVal)}
        </text>
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          dominantBaseline="auto"
          fill="#64748b"
          fontSize={11}
          letterSpacing={1}
        >
          / 100
        </text>
      </svg>
      <p className="text-center text-xs text-zinc-500 -mt-2 tracking-wide">
        Score de santé financière
      </p>
    </div>
  );
}

// ── 2. MetricCard ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color, isNear }) {
  const large = Math.abs(value ?? 0) > 1_000_000;
  return (
    <div
      className="glass rounded-2xl p-5 flex flex-col gap-2"
      style={isNear ? { borderColor: `${color}40` } : undefined}
    >
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      <div
        className={`font-mono font-extrabold leading-none ${large ? "text-xl" : "text-2xl"}`}
        style={{ color }}
      >
        {nfmt(value)}
      </div>
      {sub && <div className="text-xs text-zinc-500 leading-relaxed">{sub}</div>}
    </div>
  );
}

// ── 3. InterpCard ─────────────────────────────────────────────────────────────
const CAS_SIGN_LABEL = {
  1: { frng: "> 0", bfr: "< 0", tn: "> 0" },
  2: { frng: "> 0", bfr: "> 0 < FRNG", tn: "> 0" },
  3: { frng: "> 0", bfr: "≈ FRNG", tn: "≈ 0" },
  4: { frng: "< 0", bfr: "< 0", tn: "> 0" },
  5: { frng: "< 0", bfr: "> 0", tn: "< 0" },
  6: { frng: "< 0", bfr: "> 0 > FRNG", tn: "< 0" },
  7: { frng: "> 0", bfr: "> FRNG", tn: "< 0" },
};

function InterpCard({ cas, interp, details }) {
  const [open, setOpen] = useState(false);
  const cfg = CAS_INTERPRETATIONS[cas];
  if (!cfg) return null;

  const borderColor =
    cas <= 2 ? "#00FF87" : cas <= 4 ? "#FFB86C" : cas === 7 ? "#FFE066" : "#FF6B6B";
  const bgColor =
    cas <= 2 ? "#00FF8710" : cas <= 4 ? "#FFB86C10" : cas === 7 ? "#FFE06610" : "#FF6B6B10";

  const signs = CAS_SIGN_LABEL[cas] ?? { frng: "?", bfr: "?", tn: "?" };

  return (
    <div
      className="rounded-2xl p-5"
      style={{ border: `1px solid ${borderColor}30`, background: bgColor }}
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl leading-none mt-0.5">{cfg.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-zinc-500 mb-0.5 font-mono">
            CAS {cas} — {cfg.label}
          </div>
          <div className="text-xs font-mono text-zinc-400 mb-2">
            FRNG {signs.frng} · BFR {signs.bfr} · TN {signs.tn}
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed">{interp ?? cfg.text}</p>
        </div>
      </div>

      {details && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs mt-1 transition-colors"
            style={{ color: borderColor }}
          >
            {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            Voir le détail du calcul
          </button>
          <div
            style={{
              maxHeight: open ? 300 : 0,
              overflow: "hidden",
              transition: "max-height 320ms ease",
            }}
          >
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono">
                <span className="text-zinc-500">Capitaux permanents</span>
                <span className="text-right text-zinc-300">{nfmt(details.capitaux_permanents)}</span>
                <span className="text-zinc-500">− Actif immobilisé net</span>
                <span className="text-right text-zinc-300">{nfmt(details.actif_immobilise_net)}</span>
                <span className="text-zinc-400 border-t border-white/5 pt-1">= FRNG</span>
                <span className="text-right pt-1 border-t border-white/5" style={{ color: borderColor }}>
                  {nfmt(details.capitaux_permanents - details.actif_immobilise_net)}
                </span>

                <span className="text-zinc-500 mt-2">Actif courant (hors dispo.)</span>
                <span className="text-right mt-2 text-zinc-300">
                  {nfmt((details.actif_courant ?? 0) - (details.disponibilites ?? 0))}
                </span>
                <span className="text-zinc-500">− Passif courant (hors avances)</span>
                <span className="text-right text-zinc-300">
                  {nfmt((details.passif_courant ?? 0) - (details.avances_bancaires ?? 0))}
                </span>
                <span className="text-zinc-400 border-t border-white/5 pt-1">= BFR</span>
                <span className="text-right pt-1 border-t border-white/5" style={{ color: borderColor }}>
                  {nfmt(
                    (details.actif_courant ?? 0) -
                      (details.disponibilites ?? 0) -
                      ((details.passif_courant ?? 0) - (details.avances_bancaires ?? 0))
                  )}
                </span>

                <span className="text-zinc-500 mt-2">FRNG − BFR</span>
                <span className="text-right mt-2 text-zinc-300">= TN</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 4. CAFCard ────────────────────────────────────────────────────────────────
function CAFCard({ caf, totalProduits }) {
  const [barWidth, setBarWidth] = useState(0);

  const targetWidth = Math.min(
    (Math.abs(caf ?? 0) / Math.max(Math.abs(totalProduits ?? 1), 1)) * 100,
    100
  );
  const barColor = (caf ?? 0) > 0 ? "#00FF87" : (caf ?? 0) < 0 ? "#FF6B6B" : "#FFB86C";
  const status =
    (caf ?? 0) > 0
      ? { emoji: "✅", text: "CAF positive — capacité d'autofinancement assurée" }
      : (caf ?? 0) < 0
      ? { emoji: "❌", text: "CAF négative — risque d'érosion du patrimoine" }
      : { emoji: "⚠️", text: "CAF nulle — aucun excédent disponible" };

  useEffect(() => {
    setBarWidth(0);
    const t = setTimeout(() => setBarWidth(targetWidth), 150);
    return () => clearTimeout(t);
  }, [targetWidth]);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-xl bg-yellow-500/10 shrink-0">
          <Lightbulb className="size-5 text-yellow-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Capacité d'Autofinancement
          </div>
          <div
            className="font-mono font-extrabold text-3xl leading-none"
            style={{ color: barColor }}
          >
            {nfmt(caf)}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
          <span>Part des produits totaux</span>
          <span className="font-mono" style={{ color: barColor }}>
            {targetWidth.toFixed(1)} %
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: "#1A3A5C" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${barWidth}%`,
              backgroundColor: barColor,
              transition: "width 700ms ease",
            }}
          />
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        {status.emoji} {status.text}
      </p>
    </div>
  );
}

// ── 5. CircleGauge ────────────────────────────────────────────────────────────
function CircleGauge({ value, label, color, maxVal = 30 }) {
  const [animVal, setAnimVal] = useState(0);

  useEffect(() => {
    setAnimVal(0);
    const t = setTimeout(() => setAnimVal(value ?? 0), 150);
    return () => clearTimeout(t);
  }, [value]);

  const r = 60;
  const cx = 80, cy = 80;
  const circ = 2 * Math.PI * r;
  const clamped = clamp(animVal, 0, maxVal);
  const filled = (clamped / maxVal) * circ;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 160 160" style={{ width: 160, height: 160 }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#1A3A5C"
          strokeWidth={10}
        />
        {/* Fill — rotated so fill starts at top */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: "rotate(-90deg)",
            transition: "stroke-dasharray 900ms cubic-bezier(.4,0,.2,1)",
          }}
        />
        <text
          x={cx} y={cy + 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="800"
          fontSize={22}
        >
          {(value ?? 0).toFixed(1)}%
        </text>
      </svg>
      <span className="text-xs text-zinc-400 text-center">{label}</span>
    </div>
  );
}

// ── 6. DelayTimeline ──────────────────────────────────────────────────────────
function DelayTimeline({ days, label, maxDays = 180, emoji, interp }) {
  const [animPct, setAnimPct] = useState(0);
  const pct = clamp((days / maxDays) * 100, 0, 100);
  const barColor = days < 60 ? "#00FF87" : days <= 90 ? "#FFB86C" : "#FF6B6B";

  useEffect(() => {
    setAnimPct(0);
    const t = setTimeout(() => setAnimPct(pct), 150);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-semibold text-zinc-200">{label}</span>
        <span className="font-mono font-bold text-lg" style={{ color: barColor }}>
          {days} j
        </span>
      </div>

      {/* Zone bands + bar */}
      <div className="relative h-7 rounded-full overflow-hidden mb-4">
        {/* Colored zones */}
        <div className="absolute inset-0 flex">
          <div style={{ width: "33.3%", background: "#00FF8722" }} />
          <div style={{ width: "16.7%", background: "#FFB86C22" }} />
          <div style={{ width: "50%", background: "#FF6B6B22" }} />
        </div>
        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{
            width: `${animPct}%`,
            backgroundColor: barColor,
            opacity: 0.85,
            transition: "width 700ms ease",
          }}
        />
        {/* Cursor triangle */}
        <div
          className="absolute top-0 bottom-0 flex items-center"
          style={{
            left: `${animPct}%`,
            transition: "left 700ms ease",
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="w-0 h-0"
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: `8px solid ${barColor}`,
            }}
          />
        </div>
      </div>

      {/* Tick marks */}
      <div className="relative flex justify-between text-xs text-zinc-500 font-mono px-0 mb-3">
        <span>0</span>
        <span style={{ position: "absolute", left: "33.3%" }}>60</span>
        <span style={{ position: "absolute", left: "50%" }}>90</span>
        <span>180 j</span>
      </div>

      {emoji && interp && (
        <p className="text-xs text-zinc-400 mt-1">
          {emoji} {interp}
        </p>
      )}
    </div>
  );
}

// ── 7. ComparisonCard ─────────────────────────────────────────────────────────
function ComparisonCard({ dc, df, interp, emoji }) {
  const favorable = df >= dc;
  const diff = Math.abs(dc - df);
  const maxVal = Math.max(dc, df, 30) * 1.15;

  return (
    <div
      className="glass rounded-2xl p-5"
      style={{
        borderColor: favorable ? "#00FF8730" : "#FF6B6B30",
        border: "1px solid",
      }}
    >
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-4">
        Clients vs Fournisseurs
      </div>

      <div className="space-y-3 mb-4">
        {[
          { name: "Délai clients", val: dc, color: dc < 60 ? "#00FF87" : dc <= 90 ? "#FFB86C" : "#FF6B6B" },
          { name: "Délai fournisseurs", val: df, color: df < 60 ? "#00FF87" : df <= 90 ? "#FFB86C" : "#FF6B6B" },
        ].map(({ name, val, color }) => (
          <div key={name}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-400">{name}</span>
              <span className="font-mono font-semibold" style={{ color }}>
                {val} j
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden bg-white/5">
              <div
                className="h-full rounded-full"
                style={{ width: `${(val / maxVal) * 100}%`, backgroundColor: color }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        className="text-xs rounded-xl px-3 py-2"
        style={{
          background: favorable ? "#00FF8712" : "#FF6B6B12",
          color: favorable ? "#00FF87" : "#FF6B6B",
        }}
      >
        {emoji} Écart : {diff} j —{" "}
        {favorable
          ? "Fournisseurs payés après les clients ✓"
          : "Clients payent plus tard que vous payez les fournisseurs ✗"}
      </div>

      {interp && (
        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{interp}</p>
      )}
    </div>
  );
}

// ── 8. RecommendationCard ─────────────────────────────────────────────────────
const PRIORITY_META = {
  high: { label: "🔴 HAUTE", bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400" },
  medium: { label: "🟡 MOYENNE", bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400" },
  low: { label: "🟢 FAIBLE", bg: "bg-green-500/10", border: "border-green-500/20", text: "text-green-400" },
};

function RecommendationCard({ rec, index }) {
  const meta = PRIORITY_META[rec.priority] ?? PRIORITY_META.medium;
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.09, duration: 0.35 }}
      className={`rounded-2xl p-5 border ${meta.bg} ${meta.border}`}
    >
      <div className="flex items-start gap-4">
        <div className="p-2 bg-white/5 rounded-xl shrink-0 mt-0.5">
          <Lightbulb className="size-4 text-yellow-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}
            >
              {meta.label}
            </span>
            {rec.area && (
              <span className="text-xs text-zinc-500">{rec.area}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-white mb-1">{rec.title}</p>
          {rec.action && (
            <p className="text-sm text-zinc-400 leading-relaxed">
              <span className="text-zinc-500">👉 </span>
              {rec.action}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── 9. GlobalScore ────────────────────────────────────────────────────────────
function GlobalScore({ eq, caf: cafData, rent, del }) {
  const cas = eq?.cas;
  const casScore = (cas && CAS_INTERPRETATIONS[cas]?.score) ?? 50;

  const cafVal = cafData?.caf ?? 0;
  const cafScore = cafVal > 0 ? 80 : cafVal < 0 ? 10 : 40;

  const re = rent?.re ?? 0;
  const rf = rent?.rf ?? 0;
  const reScore = re > 5 ? 90 : re >= 1 ? 60 : 20;
  const rfScore = rf > 15 ? 90 : rf >= 5 ? 60 : 20;

  const dc = del?.delai_clients ?? 90;
  const df = del?.delai_fournisseurs ?? 90;
  const dcS = dc < 60 ? 90 : dc <= 90 ? 60 : 20;
  const dfS = df < 60 ? 90 : df <= 90 ? 60 : 20;
  const delayScore = (dcS + dfS) / 2;

  const global = Math.round(
    casScore * 0.35 + cafScore * 0.2 + reScore * 0.15 + rfScore * 0.15 + delayScore * 0.15
  );

  const { label, emoji } = SCORE_LABEL(global);
  const color =
    global >= 70 ? "#00FF87" : global >= 50 ? "#FFB86C" : global >= 30 ? "#FFE066" : "#FF6B6B";

  return (
    <div className="glass rounded-2xl p-6 mt-4 text-center">
      <div className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        Score Global de Santé Financière
      </div>
      <div
        className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-mono font-extrabold text-3xl"
        style={{ background: `${color}18`, color, border: `1.5px solid ${color}40` }}
      >
        <span>{emoji}</span>
        <span>{global}</span>
        <span className="text-base font-normal text-zinc-400">/ 100</span>
        <span className="text-base font-bold">{label}</span>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2 text-xs text-zinc-500 max-w-sm mx-auto">
        {[
          ["Équilibre", casScore, "35%"],
          ["CAF", cafScore, "20%"],
          ["RE", reScore, "15%"],
          ["RF", rfScore, "15%"],
          ["Délais", Math.round(delayScore), "15%"],
        ].map(([k, v, w]) => (
          <div key={k} className="text-center">
            <div className="font-mono font-bold text-white">{v}</div>
            <div className="text-[10px]">{k}</div>
            <div className="text-[9px] text-zinc-600">{w}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="animate-spin"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeOpacity={0.25} />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

// ── Scale icon ────────────────────────────────────────────────────────────────
function Scale(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AIAnalysis() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecs, setAiRecs] = useState(null);

  const load = async (p = period) => {
    setLoading(true);
    setError("");
    setEmpty(false);
    setData(null);
    setAiRecs(null);
    try {
      const r = await api.get(`/ai-analysis?period=${p}`);
      setData(r.data);
    } catch (e) {
      const detail = e.response?.data?.detail ?? "";
      if (
        e.response?.status === 404 ||
        (typeof detail === "string" && detail.toLowerCase().includes("bilan"))
      ) {
        setEmpty(true);
      } else {
        setError(
          typeof detail === "string" && detail
            ? detail
            : "Erreur lors du chargement de l'analyse"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  const handlePeriodChange = (val) => {
    setPeriod(val);
    load(val);
  };

  const generateAI = async () => {
    if (!data) return;
    const eq = data.equilibre_financier;
    const cafData = data.caf;
    const rent = data.rentabilite;
    const del = data.delais;

    const cas = eq?.cas;
    const casScore = (cas && CAS_INTERPRETATIONS[cas]?.score) ?? 50;
    const cafVal = cafData?.caf ?? 0;
    const cafScore = cafVal > 0 ? 80 : cafVal < 0 ? 10 : 40;
    const re = rent?.re ?? 0;
    const rf = rent?.rf ?? 0;
    const reScore = re > 5 ? 90 : re >= 1 ? 60 : 20;
    const rfScore = rf > 15 ? 90 : rf >= 5 ? 60 : 20;
    const dc = del?.delai_clients ?? 90;
    const df = del?.delai_fournisseurs ?? 90;
    const dcS = dc < 60 ? 90 : dc <= 90 ? 60 : 20;
    const dfS = df < 60 ? 90 : df <= 90 ? 60 : 20;
    const score = Math.round(
      casScore * 0.35 + cafScore * 0.2 + reScore * 0.15 + rfScore * 0.15 + ((dcS + dfS) / 2) * 0.15
    );

    setAiLoading(true);
    try {
      const r = await api.post("/analyze-financials", {
        frng: eq?.frng,
        bfr: eq?.bfr,
        tn: eq?.tn,
        cas: eq?.cas,
        caf: cafData?.caf,
        re,
        rf,
        delai_clients: dc,
        delai_fournisseurs: df,
        score,
      });
      const raw = r.data?.recommandations ?? [];
      const priorityMap = { haute: "high", moyenne: "medium", faible: "low" };
      setAiRecs(
        raw.map((rec) => ({
          priority: priorityMap[rec.priorite?.toLowerCase()] ?? "medium",
          title: rec.titre ?? rec.title ?? "",
          action: rec.action ?? "",
          area: rec.area ?? "",
        }))
      );
    } catch {
      toast.error("Impossible de générer les recommandations IA, utilisation des recommandations intégrées.");
      setAiRecs(null);
    } finally {
      setAiLoading(false);
    }
  };

  // Data aliases
  const eq = data?.equilibre_financier;
  const cafData = data?.caf;
  const rent = data?.rentabilite;
  const del = data?.delais;
  const recs = aiRecs ?? data?.recommendations ?? [];

  // Total produits for CAF bar
  const totalProduits =
    Math.abs(cafData?.details?.resultat_net ?? 0) * 3 || 1_000_000;

  return (
    <AppLayout>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fade}
        transition={{ duration: 0.4 }}
      >
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Analyse IA</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Diagnostic financier automatique — équilibre, rentabilité, délais
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#00C3FF]/60 text-white"
            />
            <button
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50"
              style={{ background: "#00C3FF22", color: "#00C3FF", border: "1px solid #00C3FF40" }}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Analyser
            </button>
          </div>
        </div>

        {/* ── Empty state ── */}
        {empty && !loading && (
          <div className="glass rounded-2xl p-10 text-center border border-yellow-500/20 bg-yellow-500/5">
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-lg font-bold text-white mb-2">Bilan non disponible</h2>
            <p className="text-sm text-zinc-400 mb-6 max-w-sm mx-auto">
              Aucune donnée de bilan trouvée pour la période sélectionnée. Complétez votre bilan
              pour obtenir l'analyse financière complète.
            </p>
            <button
              onClick={() => navigate("/financial-statements")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition"
              style={{ background: "#00C3FF22", color: "#00C3FF", border: "1px solid #00C3FF40" }}
            >
              <BarChart3 className="size-4" />
              Compléter le bilan
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="glass rounded-2xl p-6 mb-6 border border-red-500/20 bg-red-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300 mb-1">Erreur d'analyse</p>
                <p className="text-xs text-zinc-400">{error}</p>
                <p className="text-xs text-zinc-500 mt-2">
                  Assurez-vous d'avoir saisi les charges/produits et le bilan dans les États financiers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
            <Skeleton className="h-52" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Skeleton className="h-44" />
              <Skeleton className="h-44" />
            </div>
          </div>
        )}

        {/* ── Content ── */}
        {data && !loading && (
          <>
            {/* ──────────────────────────────────────── */}
            {/* SECTION 1 — Équilibre financier          */}
            {/* ──────────────────────────────────────── */}
            <Section icon={Scale} color="#00FF87" title="1. Équilibre financier">
              {/* Arc gauge + metric cards */}
              <div className="grid sm:grid-cols-4 gap-4 mb-5 items-start">
                {/* Gauge */}
                <div className="glass rounded-2xl p-4 sm:col-span-1 flex flex-col items-center justify-center">
                  <ArcGauge score={CAS_INTERPRETATIONS[eq.cas]?.score ?? 50} />
                  <div className="mt-2 text-center">
                    <span
                      className="inline-block px-3 py-1 rounded-full text-xs font-bold"
                      style={{
                        background: `${CAS_INTERPRETATIONS[eq.cas]?.color ?? "#888"}22`,
                        color: CAS_INTERPRETATIONS[eq.cas]?.color ?? "#888",
                      }}
                    >
                      {CAS_INTERPRETATIONS[eq.cas]?.emoji} {CAS_INTERPRETATIONS[eq.cas]?.label}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <MetricCard
                    label="FRNG — Fonds de roulement"
                    value={eq.frng}
                    sub="Capitaux permanents − Actif immobilisé"
                    color={eq.frng >= 0 ? "#00FF87" : "#FF6B6B"}
                  />
                  <MetricCard
                    label="BFR — Besoin fonds de roulement"
                    value={eq.bfr}
                    sub="Actif courant (hors dispo.) − Passif court (hors avances)"
                    color={eq.bfr <= 0 ? "#00FF87" : eq.bfr < eq.frng ? "#FFB86C" : "#FF6B6B"}
                  />
                  <MetricCard
                    label="TN — Trésorerie nette"
                    value={eq.tn}
                    sub="FRNG − BFR"
                    color={eq.tn >= 0 ? "#00FF87" : "#FF6B6B"}
                  />
                </div>
              </div>

              {/* Interpretation card */}
              <InterpCard
                cas={eq.cas}
                interp={eq.interpretation}
                details={eq.details}
              />
            </Section>

            {/* ──────────────────────────────────────── */}
            {/* SECTION 2 — CAF                          */}
            {/* ──────────────────────────────────────── */}
            <Section icon={TrendingUp} color="#FFB86C" title="2. Capacité d'Autofinancement (CAF)">
              <div className="grid sm:grid-cols-2 gap-4">
                <CAFCard caf={cafData?.caf} totalProduits={totalProduits} />
                {/* Detail breakdown */}
                <div className="glass rounded-2xl p-5">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-4">
                    Composantes du calcul
                  </div>
                  <div className="space-y-2.5 font-mono text-xs">
                    {[
                      ["Résultat net", cafData?.details?.resultat_net],
                      ["+ Dotations amortissements", cafData?.details?.dotations_amortissements],
                      ["− Reprises de dotations", cafData?.details?.reprises],
                      ["+ Val. comptable cessions", cafData?.details?.valeur_compt_cessions],
                      ["− Produits de cession", cafData?.details?.produits_cession],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center">
                        <span className="text-zinc-500">{k}</span>
                        <span className="text-zinc-200 text-right ml-2">
                          {typeof v === "number" ? nfmt(v) : "—"}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-white/5 pt-2 flex justify-between font-bold">
                      <span className="text-zinc-300">= CAF</span>
                      <span style={{ color: (cafData?.caf ?? 0) >= 0 ? "#00FF87" : "#FF6B6B" }}>
                        {nfmt(cafData?.caf)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* ──────────────────────────────────────── */}
            {/* SECTION 3 — Rentabilité                 */}
            {/* ──────────────────────────────────────── */}
            <Section icon={Zap} color="#00C3FF" title="3. Rentabilité">
              <div className="glass rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row items-center justify-around gap-8 mb-6">
                  <div className="flex flex-col items-center gap-2">
                    <CircleGauge
                      value={rent?.re}
                      label="Rentabilité Économique (RE)"
                      color={rent?.re_cas === 1 ? "#00FF87" : rent?.re_cas === 2 ? "#FFB86C" : "#FF6B6B"}
                      maxVal={30}
                    />
                    <p className="text-xs text-zinc-500 max-w-[180px] text-center leading-relaxed">
                      {rent?.re_emoji} {rent?.re_interpretation}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <CircleGauge
                      value={rent?.rf}
                      label="Rentabilité Financière (RF)"
                      color={rent?.rf_cas === 1 ? "#00FF87" : rent?.rf_cas === 2 ? "#FFB86C" : "#FF6B6B"}
                      maxVal={30}
                    />
                    <p className="text-xs text-zinc-500 max-w-[180px] text-center leading-relaxed">
                      {rent?.rf_emoji} {rent?.rf_interpretation}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono text-center border-t border-white/5 pt-4">
                  <div>
                    <div className="text-zinc-500">Résultat net</div>
                    <div className="text-white mt-0.5">{nfmt(rent?.details?.resultat_net)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Total actif</div>
                    <div className="text-white mt-0.5">{nfmt(rent?.details?.total_actif)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Capitaux propres</div>
                    <div className="text-white mt-0.5">{nfmt(rent?.details?.capitaux_propres)}</div>
                  </div>
                </div>
                <div className="text-xs text-zinc-600 text-center mt-3">
                  RE &gt;5% excellent · 1-5% moyen · &lt;1% faible &nbsp;|&nbsp; RF &gt;15%
                  excellent · 5-15% moyen · &lt;5% faible
                </div>
              </div>
            </Section>

            {/* ──────────────────────────────────────── */}
            {/* SECTION 4 — Délais                      */}
            {/* ──────────────────────────────────────── */}
            <Section icon={Clock} color="#FFE066" title="4. Délais de paiement">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <DelayTimeline
                  days={del?.delai_clients ?? 0}
                  label="Délai clients"
                  maxDays={180}
                  emoji={del?.dc_emoji}
                  interp={del?.dc_interpretation}
                />
                <DelayTimeline
                  days={del?.delai_fournisseurs ?? 0}
                  label="Délai fournisseurs"
                  maxDays={180}
                  emoji={del?.df_emoji}
                  interp={del?.df_interpretation}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <ComparisonCard
                  dc={del?.delai_clients ?? 0}
                  df={del?.delai_fournisseurs ?? 0}
                  emoji={del?.comp_emoji}
                  interp={del?.comp_interpretation}
                />
                {/* Formulas */}
                <div className="glass rounded-2xl p-5">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-4">
                    Données de calcul
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    {[
                      ["Créances clients", del?.details?.creances_clients],
                      ["CA HT", del?.details?.ca],
                      ["Dettes fournisseurs", del?.details?.dettes_fournisseurs],
                      ["Achats HT", del?.details?.achats],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-zinc-500">{k}</span>
                        <span className="text-zinc-200">
                          {typeof v === "number" ? nfmt(v) : "—"}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-white/5 pt-2 text-zinc-600 space-y-1">
                      <div>Délai clients = (Créances / CA) × 360</div>
                      <div>Délai fournisseurs = (Dettes / Achats) × 360</div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* ──────────────────────────────────────── */}
            {/* SECTION 5 — Recommandations IA          */}
            {/* ──────────────────────────────────────── */}
            <Section icon={Brain} color="#00C3FF" title="5. Recommandations intelligentes">
              <div className="mb-5">
                <button
                  onClick={generateAI}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition disabled:opacity-60"
                  style={{
                    background: aiLoading ? "#18181b" : "#00C3FF18",
                    color: "#00C3FF",
                    border: "1px solid #00C3FF40",
                  }}
                >
                  {aiLoading ? (
                    <>
                      <Spinner />
                      Génération en cours…
                    </>
                  ) : (
                    <>
                      <Brain className="size-4" />
                      🤖 GÉNÉRER LES RECOMMANDATIONS IA
                    </>
                  )}
                </button>
              </div>

              {recs.length > 0 ? (
                <div className="space-y-3">
                  {recs.map((rec, i) => (
                    <RecommendationCard key={i} rec={rec} index={i} />
                  ))}
                </div>
              ) : (
                !aiLoading && (
                  <div className="glass rounded-2xl p-8 text-center text-zinc-500 text-sm">
                    Cliquez sur le bouton ci-dessus pour générer des recommandations IA personnalisées.
                  </div>
                )
              )}
            </Section>

            {/* ──────────────────────────────────────── */}
            {/* Global Score                            */}
            {/* ──────────────────────────────────────── */}
            <GlobalScore eq={eq} caf={cafData} rent={rent} del={del} />
          </>
        )}
      </motion.div>
    </AppLayout>
  );
}
