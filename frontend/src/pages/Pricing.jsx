import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api, { formatApiError } from "../lib/api";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { Check, Crown, Rocket, Sparkles, ArrowRight, Building2 } from "lucide-react";

const TIER_META = {
  free: { icon: Sparkles, accent: "#60a5fa", glow: "rgba(96,165,250,0.25)" },
  pro: { icon: Rocket, accent: "#22c55e", glow: "rgba(34,197,94,0.35)", popular: true },
  bank_ready: { icon: Crown, accent: "#fbbf24", glow: "rgba(251,191,36,0.35)" },
};

export default function Pricing() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/billing/plans").then((r) => setPlans(r.data)).catch(() => {});
    if (user) api.get("/billing/me").then((r) => setMe(r.data)).catch(() => {});
  }, [user]);

  const upgrade = async (planId) => {
    if (!user) {
      navigate("/auth?mode=register");
      return;
    }
    setErr(""); setBusy(planId);
    try {
      const { data } = await api.post("/billing/checkout", {
        plan_id: planId,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white relative" data-testid="pricing-page">
      <Navbar variant="landing" />
      <div className="absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_top,black,transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-radial-fade pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs font-mono uppercase tracking-[0.2em] text-zinc-300 mb-6">
            <Sparkles className="size-3.5 text-blue-400" /> {t("pricing.eyebrow")}
          </div>
          <h1 className="font-display font-black text-5xl sm:text-6xl tracking-tighter">
            <span className="text-gradient">{t("pricing.titleA")}</span>{" "}
            <span className="text-gradient-brand">{t("pricing.titleB")}</span>
          </h1>
          <p className="mt-5 text-lg text-zinc-400">{t("pricing.subtitle")}</p>
        </div>

        {err && (
          <div className="mt-6 mx-auto max-w-md text-center text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2"
               data-testid="pricing-error">
            {err}
          </div>
        )}

        <div className="mt-12 grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {plans.map((p, i) => {
            const meta = TIER_META[p.id] || TIER_META.free;
            const Icon = meta.icon;
            const current = me?.tier === p.id;
            return (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className={`relative glass-strong rounded-3xl p-7 flex flex-col ${meta.popular ? "ring-1 ring-green-500/30" : ""}`}
                style={meta.popular ? { boxShadow: `0 0 40px ${meta.glow}` } : {}}
                data-testid={`plan-card-${p.id}`}>
                {meta.popular && (
                  <div className="absolute -top-3 start-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-green-500 text-black text-[10px] font-mono uppercase tracking-[0.2em] font-bold">
                    {t("pricing.popular")}
                  </div>
                )}
                {current && (
                  <div className="absolute -top-3 end-5 px-3 py-1 rounded-full bg-blue-500 text-white text-[10px] font-mono uppercase tracking-[0.2em] font-bold">
                    {t("pricing.current")}
                  </div>
                )}
                <div className="size-12 rounded-2xl grid place-items-center mb-4"
                     style={{ background: `${meta.accent}20`, color: meta.accent }}>
                  <Icon className="size-5" />
                </div>
                <div className="font-display font-black text-2xl tracking-tight">{t(`pricing.${p.id}.name`)}</div>
                <p className="mt-2 text-sm text-zinc-400">{t(`pricing.${p.id}.tagline`)}</p>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-mono text-5xl font-black tracking-tighter">
                    ${Number(p.amount).toFixed(p.amount % 1 === 0 ? 0 : 2)}
                  </span>
                  <span className="text-sm text-zinc-500">/ {t("pricing.month")}</span>
                </div>

                <ul className="mt-7 space-y-3 text-sm flex-1">
                  {(t(`pricing.${p.id}.features`, { returnObjects: true }) || []).map((f, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-zinc-300">
                      <Check className="size-4 mt-0.5 shrink-0" style={{ color: meta.accent }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button onClick={() => p.id === "free" ? null : upgrade(p.id)}
                  disabled={busy === p.id || current || p.id === "free"}
                  className={`mt-7 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    meta.popular
                      ? "bg-[#22c55e] hover:bg-[#16a34a] text-white shadow-[0_0_25px_rgba(34,197,94,0.4)]"
                      : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
                  }`}
                  data-testid={`plan-cta-${p.id}`}>
                  {busy === p.id ? "…" : (
                    current ? t("pricing.currentLabel") :
                    p.id === "free" ? t("pricing.freeLabel") :
                    <>{t("pricing.choose")} <ArrowRight className="size-4" /></>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-zinc-400 mb-3">
            <Building2 className="size-3.5 text-blue-400" /> {t("pricing.banksHint")}
          </div>
          <div className="text-sm text-zinc-500">
            <Link to="/" className="hover:text-white transition">← {t("pricing.backHome")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
