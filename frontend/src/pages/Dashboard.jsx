import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../contexts/AuthContext";
import { TrendingUp, TrendingDown, Flame, Clock, ShieldAlert, Lightbulb } from "lucide-react";

const PIE_COLORS = ["#2563eb", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

const RISK_COLOR = {
  low: { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/30" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30" },
  high: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
};

function nfmt(n, currency = "") {
  if (n == null) return "—";
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e9) s = (n / 1e9).toFixed(1) + "B";
  else if (abs >= 1e6) s = (n / 1e6).toFixed(1) + "M";
  else if (abs >= 1e3) s = (n / 1e3).toFixed(1) + "K";
  else s = Math.round(n).toLocaleString();
  return currency ? `${s} ${currency}` : s;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/analysis").then((r) => setData(r.data)).catch((e) => setErr(e.response?.data?.detail || e.message));
  }, []);

  if (err) {
    return (
      <AppLayout>
        <div className="glass-strong rounded-2xl p-8 text-zinc-400" data-testid="dash-error">{String(err)}</div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 h-32 animate-pulse" />
          ))}
        </div>
        <div className="glass rounded-2xl h-80 animate-pulse" />
      </AppLayout>
    );
  }

  const a = data.analysis;
  const risk = RISK_COLOR[a.risk_level] || RISK_COLOR.medium;
  const cur = a.currency;

  return (
    <AppLayout>
      <div className="mb-8" data-testid="dashboard-page">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">{data.business?.name}</div>
        <h1 className="mt-1 font-display font-black text-3xl sm:text-4xl tracking-tighter">
          {t("dashboard.welcome")}, {user?.name?.split(" ")[0] || ""}
        </h1>
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="kpi-grid">
        <KpiCard label={t("dashboard.kpiRevenue")} value={nfmt(a.revenue_monthly, cur)} icon={TrendingUp} accent="text-blue-400" testid="kpi-revenue" />
        <KpiCard label={t("dashboard.kpiProfit")} value={nfmt(a.profit_monthly, cur)} icon={a.profit_monthly >= 0 ? TrendingUp : TrendingDown} accent={a.profit_monthly >= 0 ? "text-green-400" : "text-red-400"} hint={`${t("dashboard.margin")}: ${a.margin_pct.toFixed(1)}%`} testid="kpi-profit" />
        <KpiCard label={t("dashboard.kpiBurn")} value={a.burn_rate_monthly > 0 ? nfmt(a.burn_rate_monthly, cur) : "—"} icon={Flame} accent="text-orange-400" testid="kpi-burn" />
        <KpiCard label={t("dashboard.kpiRunway")} value={a.runway_months != null ? `${a.runway_months} ${t("dashboard.months")}` : t("dashboard.profitable")} icon={Clock} accent="text-purple-400" testid="kpi-runway" />
      </div>

      {/* Risk + Recommendations */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className={`glass-strong rounded-2xl p-6 border ${risk.border}`} data-testid="risk-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <ShieldAlert className="size-4" /> {t("dashboard.riskLevel")}
          </div>
          <div className={`mt-3 inline-flex items-center px-3 py-1.5 rounded-full ${risk.bg} ${risk.text} font-mono text-xs uppercase tracking-[0.2em]`}>
            {t(`risk.${a.risk_level}`)}
          </div>
          <div className="mt-4 font-mono text-5xl font-bold tracking-tighter">{a.risk_score}<span className="text-zinc-500 text-2xl">/10</span></div>
        </div>
        <div className="glass rounded-2xl p-6 lg:col-span-2" data-testid="reco-card">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-4">
            <Lightbulb className="size-4 text-yellow-400" /> {t("dashboard.recommendations")}
          </div>
          <ul className="space-y-3">
            {a.recommendations.map((r, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className="flex gap-3 items-start" data-testid={`reco-item-${i}`}>
                <div className="size-6 mt-0.5 rounded-md bg-[#2563eb]/15 text-blue-400 grid place-items-center text-xs font-mono font-bold shrink-0">{i + 1}</div>
                <div>
                  <div className="font-medium text-white">{t(`recos.${r.key}.title`, r.params || {})}</div>
                  <div className="text-sm text-zinc-400">{t(`recos.${r.key}.detail`, r.params || {})}</div>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-2xl p-6 lg:col-span-2" data-testid="cashflow-chart">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("dashboard.cashflow")}</div>
              <div className="font-display font-bold text-xl mt-1">{nfmt(a.profit_monthly * 12, cur)} <span className="text-zinc-500 text-sm font-sans">/ year</span></div>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cashflow}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke="#52525b" fontSize={11} />
                <YAxis stroke="#52525b" fontSize={11} tickFormatter={(v) => nfmt(v)} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#fff" }} />
                <Area type="monotone" dataKey="revenue" name={t("dashboard.revenue")} stroke="#2563eb" fill="url(#rev)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" name={t("dashboard.expenses")} stroke="#22c55e" fill="url(#exp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-6" data-testid="expense-chart">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-4">{t("dashboard.expenseBreakdown")}</div>
          {data.expense_breakdown.length === 0 ? (
            <div className="h-64 grid place-items-center text-zinc-500 text-sm">No expenses</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.expense_breakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={88} paddingAngle={3}>
                    {data.expense_breakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#0a0a0b" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#fff" }} formatter={(v) => nfmt(v, cur)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-1.5 mt-2">
            {data.expense_breakdown.slice(0, 5).map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-400">
                  <div className="size-2 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {e.name}
                </div>
                <div className="font-mono text-white">{nfmt(e.value, cur)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="glass rounded-2xl p-6" data-testid="activity-card">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-4">{t("dashboard.recentActivity")}</div>
        <ul className="space-y-2">
          {data.activity.map((act) => {
            const params = { ...(act.params || {}) };
            if (params.level) params.level = t(`risk.${params.level}`);
            return (
              <li key={act.id} className="flex items-center justify-between border-b border-white/5 last:border-0 py-2.5">
                <div className="text-sm text-zinc-300">{t(`activityLog.${act.key}`, params)}</div>
                <div className="text-xs text-zinc-500 font-mono">{new Date(act.ts).toLocaleString()}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </AppLayout>
  );
}

function KpiCard({ label, value, icon: Icon, accent = "text-blue-400", hint, testid }) {
  return (
    <div className="glass rounded-2xl p-6 hover:-translate-y-0.5 transition" data-testid={testid}>
      <div className="flex items-center justify-between text-zinc-400 text-xs">
        <div className="font-mono uppercase tracking-[0.18em]">{label}</div>
        <Icon className={`size-4 ${accent}`} />
      </div>
      <div className="mt-3 font-mono font-bold text-3xl tracking-tighter">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
