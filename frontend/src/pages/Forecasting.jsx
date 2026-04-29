import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

const SCEN_COLORS = { optimistic: "#22c55e", realistic: "#2563eb", pessimistic: "#71717a" };

function nfmt(n) {
  const abs = Math.abs(n || 0);
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}

export default function Forecasting() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [active, setActive] = useState("realistic");

  useEffect(() => {
    api.get("/forecasts").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) {
    return (
      <AppLayout>
        <div className="glass-strong rounded-2xl h-96 animate-pulse" />
      </AppLayout>
    );
  }

  const merged = data.scenarios.realistic.map((row, i) => ({
    month: `M${row.month}`,
    optimistic: data.scenarios.optimistic[i].cash,
    realistic: data.scenarios.realistic[i].cash,
    pessimistic: data.scenarios.pessimistic[i].cash,
  }));

  const series = data.scenarios[active];
  const startCash = series[0]?.cash || 0;
  const endCash = series[series.length - 1]?.cash || 0;

  return (
    <AppLayout>
      <div className="mb-8" data-testid="forecasting-page">
        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">{t("forecast.title")}</h1>
        <p className="mt-2 text-zinc-400">{t("forecast.subtitle")}</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {["optimistic", "realistic", "pessimistic"].map((s) => (
          <button key={s} onClick={() => setActive(s)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition border ${
              active === s
                ? "bg-white/10 text-white border-white/20"
                : "bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/5 border-white/5"
            }`}
            style={active === s ? { boxShadow: `0 0 20px ${SCEN_COLORS[s]}40` } : {}}
            data-testid={`scenario-${s}`}>
            <span className="inline-block size-2 rounded-full me-2" style={{ background: SCEN_COLORS[s] }} />
            {t(`forecast.${s}`)}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <KpiBox label={t("forecast.cash")} value={nfmt(endCash) + " " + data.currency} accent={SCEN_COLORS[active]} />
        <KpiBox label="Δ 12m" value={(endCash - startCash >= 0 ? "+" : "") + nfmt(endCash - startCash) + " " + data.currency} accent={endCash >= startCash ? "#22c55e" : "#ef4444"} />
        <KpiBox label={t("forecast.profit")} value={nfmt(series[series.length - 1].profit) + " " + data.currency} accent="#2563eb" />
      </div>

      <div className="glass rounded-2xl p-6 mb-6" data-testid="forecast-chart-cash">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-4">{t("forecast.cash")} · 12m</div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke="#52525b" fontSize={11} />
              <YAxis stroke="#52525b" fontSize={11} tickFormatter={nfmt} />
              <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#fff" }} formatter={(v) => `${nfmt(v)} ${data.currency}`} />
              <Legend />
              <Line type="monotone" dataKey="optimistic" stroke={SCEN_COLORS.optimistic} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="realistic" stroke={SCEN_COLORS.realistic} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="pessimistic" stroke={SCEN_COLORS.pessimistic} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass rounded-2xl p-6" data-testid="forecast-chart-rev">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-4">{t("forecast.revenue")} & {t("forecast.profit")} · {t(`forecast.${active}`)}</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series.map((r) => ({ month: `M${r.month}`, revenue: r.revenue, profit: r.profit }))}>
              <defs>
                <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SCEN_COLORS[active]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={SCEN_COLORS[active]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke="#52525b" fontSize={11} />
              <YAxis stroke="#52525b" fontSize={11} tickFormatter={nfmt} />
              <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#fff" }} formatter={(v) => `${nfmt(v)} ${data.currency}`} />
              <Area type="monotone" dataKey="revenue" stroke={SCEN_COLORS[active]} fill="url(#rev2)" strokeWidth={2} />
              <Area type="monotone" dataKey="profit" stroke="#22c55e" fill="none" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
}

function KpiBox({ label, value, accent }) {
  return (
    <div className="glass rounded-2xl p-5 border-s-2" style={{ borderInlineStartColor: accent }}>
      <div className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 font-mono font-bold text-2xl tracking-tighter">{value}</div>
    </div>
  );
}
