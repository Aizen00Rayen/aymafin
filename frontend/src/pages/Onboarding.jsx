import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ArrowRight, ArrowLeft, Plus, Trash2, Building2, TrendingUp, Wallet, Coins } from "lucide-react";

const TYPES = ["retail", "services", "manufacturing", "tech", "agriculture", "other"];
const CURRENCIES = ["DZD", "EUR", "USD", "MAD", "TND"];

export default function Onboarding() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    business_name: "",
    business_type: "services",
    country: "Algeria",
    currency: "DZD",
    initial_capital: 0,
    revenue_streams: [{ name: "", monthly_amount: 0 }],
    expenses: [{ name: "", monthly_amount: 0, category: "operations" }],
    employees: 0,
  });

  const update = (k, v) => setForm({ ...form, [k]: v });

  const addStream = () => setForm({ ...form, revenue_streams: [...form.revenue_streams, { name: "", monthly_amount: 0 }] });
  const updStream = (i, k, v) => {
    const a = [...form.revenue_streams]; a[i] = { ...a[i], [k]: v };
    setForm({ ...form, revenue_streams: a });
  };
  const rmStream = (i) => setForm({ ...form, revenue_streams: form.revenue_streams.filter((_, j) => j !== i) });

  const addExp = () => setForm({ ...form, expenses: [...form.expenses, { name: "", monthly_amount: 0, category: "operations" }] });
  const updExp = (i, k, v) => {
    const a = [...form.expenses]; a[i] = { ...a[i], [k]: v };
    setForm({ ...form, expenses: a });
  };
  const rmExp = (i) => setForm({ ...form, expenses: form.expenses.filter((_, j) => j !== i) });

  const finish = async () => {
    setErr(""); setSaving(true);
    try {
      const payload = {
        ...form,
        initial_capital: Number(form.initial_capital) || 0,
        revenue_streams: form.revenue_streams
          .filter((r) => r.name.trim())
          .map((r) => ({ ...r, monthly_amount: Number(r.monthly_amount) || 0 })),
        expenses: form.expenses
          .filter((e) => e.name.trim())
          .map((e) => ({ ...e, monthly_amount: Number(e.monthly_amount) || 0 })),
      };
      await api.post("/business", payload);
      await refresh();
      navigate("/dashboard");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const stepIcon = [Building2, TrendingUp, Wallet, Coins][step - 1];
  const StepIcon = stepIcon;

  return (
    <div className="min-h-screen bg-[#09090b] text-white relative overflow-hidden" data-testid="onboarding-page">
      <div className="absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent)]" />
      <div className="absolute inset-0 bg-radial-fade" />
      <div className="relative max-w-3xl mx-auto px-4 py-12 lg:py-20">
        <div className="flex items-center justify-between mb-8">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            {t("onboarding.step")} {step} {t("onboarding.of")} 4
          </div>
          <div className="flex gap-1.5" data-testid="onboarding-steps">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-[#2563eb] w-8" : "bg-white/10 w-4"}`} />
            ))}
          </div>
        </div>

        <div className="glass-strong rounded-3xl p-8 sm:p-10">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#2563eb]/15 text-blue-400 mb-4">
            <StepIcon className="size-5" />
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={step}
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3 }}>
              <h2 className="font-display font-black text-3xl tracking-tighter">
                {t(`onboarding.s${step}.title`)}
              </h2>
              <p className="mt-2 text-zinc-400">{t(`onboarding.s${step}.subtitle`)}</p>

              <div className="mt-8 space-y-5">
                {step === 1 && (
                  <>
                    <Field label={t("onboarding.businessName")} value={form.business_name} onChange={(v) => update("business_name", v)} testid="ob-name" />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <SelectField label={t("onboarding.businessType")} value={form.business_type} onChange={(v) => update("business_type", v)}
                        options={TYPES.map((tp) => ({ value: tp, label: t(`onboarding.types.${tp}`) }))} testid="ob-type" />
                      <Field label={t("onboarding.country")} value={form.country} onChange={(v) => update("country", v)} testid="ob-country" />
                    </div>
                    <SelectField label={t("onboarding.currency")} value={form.currency} onChange={(v) => update("currency", v)}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} testid="ob-currency" />
                  </>
                )}
                {step === 2 && (
                  <div className="space-y-3">
                    {form.revenue_streams.map((r, i) => (
                      <div key={i} className="flex gap-2 items-end">
                        <Field className="flex-1" label={t("onboarding.streamName")} value={r.name} onChange={(v) => updStream(i, "name", v)} testid={`ob-stream-name-${i}`} />
                        <Field className="w-44" type="number" label={`${t("onboarding.amount")} (${form.currency})`} value={r.monthly_amount} onChange={(v) => updStream(i, "monthly_amount", v)} testid={`ob-stream-amount-${i}`} />
                        <button onClick={() => rmStream(i)} className="size-11 grid place-items-center rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition" data-testid={`ob-stream-rm-${i}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={addStream} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm transition" data-testid="ob-stream-add">
                      <Plus className="size-4" /> {t("onboarding.addStream")}
                    </button>
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-3">
                    {form.expenses.map((e, i) => (
                      <div key={i} className="flex gap-2 items-end">
                        <Field className="flex-1" label={t("onboarding.expenseName")} value={e.name} onChange={(v) => updExp(i, "name", v)} testid={`ob-exp-name-${i}`} />
                        <Field className="w-44" type="number" label={`${t("onboarding.amount")} (${form.currency})`} value={e.monthly_amount} onChange={(v) => updExp(i, "monthly_amount", v)} testid={`ob-exp-amount-${i}`} />
                        <button onClick={() => rmExp(i)} className="size-11 grid place-items-center rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition" data-testid={`ob-exp-rm-${i}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={addExp} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm transition" data-testid="ob-exp-add">
                      <Plus className="size-4" /> {t("onboarding.addExpense")}
                    </button>
                  </div>
                )}
                {step === 4 && (
                  <Field type="number" label={`${t("onboarding.capital")} (${form.currency})`} value={form.initial_capital} onChange={(v) => update("initial_capital", v)} testid="ob-capital" />
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {err && <div className="mt-4 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2" data-testid="ob-error">{err}</div>}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 text-sm transition"
              data-testid="ob-back">
              <ArrowLeft className="size-4" /> {t("onboarding.back")}
            </button>
            {step < 4 ? (
              <button onClick={() => setStep((s) => Math.min(4, s + 1))}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium transition shadow-[0_0_20px_rgba(37,99,235,0.35)]"
                data-testid="ob-next">
                {t("onboarding.next")} <ArrowRight className="size-4" />
              </button>
            ) : (
              <button onClick={finish} disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-60 text-white font-medium transition shadow-[0_0_20px_rgba(34,197,94,0.35)]"
                data-testid="ob-finish">
                {saving ? "…" : t("onboarding.finish")} <ArrowRight className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", className = "", testid }) {
  return (
    <div className={className}>
      <label className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full px-4 py-3 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 outline-none transition"
        data-testid={testid} />
    </div>
  );
}

function SelectField({ label, value, onChange, options, testid }) {
  return (
    <div>
      <label className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full px-4 py-3 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 outline-none transition"
        data-testid={testid}>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
        ))}
      </select>
    </div>
  );
}
