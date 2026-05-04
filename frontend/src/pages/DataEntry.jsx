import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft, Search, Check, Plus, TrendingDown, TrendingUp,
  BarChart3, Copy, Trash2, ChevronRight, X,
} from "lucide-react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { PLAN_COMPTABLE } from "../data/planComptable";

// ── helpers ───────────────────────────────────────────────────────────────────

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function nfmt(n) {
  const num = parseFloat(n) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + " M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + " k";
  return Math.round(num).toLocaleString("fr-DZ");
}

// ── validation ────────────────────────────────────────────────────────────────

const formSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Montant requis" })
    .positive("Le montant doit être positif"),
  date: z
    .string()
    .min(1, "Date requise")
    .refine((v) => !v || new Date(v) <= new Date(), "Date future non autorisée"),
  comment: z.string().max(300, "300 caractères max").optional().or(z.literal("")),
});

// ── sub-components ────────────────────────────────────────────────────────────

function HighlightText({ text, query }) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-cyan-400">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// slide variants for step transitions
const slide = {
  enter: (d) => ({ x: d > 0 ? "100%" : "-80%", opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { type: "tween", duration: 0.25, ease: "easeOut" } },
  exit: (d) => ({ x: d > 0 ? "-40%" : "60%", opacity: 0, transition: { type: "tween", duration: 0.2 } }),
};

// ── main component ────────────────────────────────────────────────────────────

export default function DataEntry() {
  // overview state
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ charges: 0, produits: 0 });
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [view, setView] = useState("overview"); // "overview" | "wizard"

  // wizard state
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [sel, setSel] = useState({
    type: null, classCode: null, classLabel: null, subcode: null, sublabel: null,
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const searchRef = useRef(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: "", date: getToday(), comment: "" },
  });
  const comment = watch("comment") || "";

  // ── data ─────────────────────────────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    if (!period) return;
    setLoadingEntries(true);
    try {
      const r = await api.get(`/accounting/entries?period=${period}`);
      const data = r.data || [];
      setEntries(data);
      let ch = 0, pr = 0;
      data.forEach((e) => {
        const amt = parseFloat(e.amount) || 0;
        if (e.entry_type === "charge") ch += amt;
        else pr += amt;
      });
      setSummary({ charges: ch, produits: pr });
    } catch {}
    finally { setLoadingEntries(false); }
  }, [period]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // auto-focus search when on step 3
  useEffect(() => {
    if (step === 3) setTimeout(() => searchRef.current?.focus(), 350);
  }, [step]);

  // ── navigation ────────────────────────────────────────────────────────────────

  const goTo = useCallback((nextStep, direction) => {
    setDir(direction);
    setStep(nextStep);
    setSearch("");
  }, []);

  const goBack = () => {
    if (step === 1) { setView("overview"); return; }
    if (step === 2) { goTo(1, -1); return; }
    if (step === 3) { goTo(2, -1); return; }
    if (step === 4) {
      const cls = PLAN_COMPTABLE.find((c) => c.code === sel.classCode);
      goTo(cls && cls.subcomptes.length > 0 ? 3 : 2, -1);
    }
  };

  // ── wizard actions ────────────────────────────────────────────────────────────

  const openWizard = (prefill = null) => {
    setSaved(false);
    if (prefill) {
      const code = prefill.account_code;
      const cc = code.length === 2 ? code : code.slice(0, 2);
      const cls = PLAN_COMPTABLE.find((c) => c.code === cc);
      const sub = cls?.subcomptes?.find((s) => s.code === code);
      setSel({
        type: prefill.entry_type,
        classCode: cc,
        classLabel: cls?.label || cc,
        subcode: code,
        sublabel: sub?.label || cls?.label || code,
      });
      reset({ amount: String(prefill.amount || ""), date: getToday(), comment: prefill.note || "" });
      setDir(1); setStep(4);
    } else {
      setSel({ type: null, classCode: null, classLabel: null, subcode: null, sublabel: null });
      reset({ amount: "", date: getToday(), comment: "" });
      setDir(1); setStep(1);
    }
    setView("wizard");
  };

  const selectType = (type) => {
    setSel((s) => ({ ...s, type, classCode: null, classLabel: null, subcode: null, sublabel: null }));
    goTo(2, 1);
  };

  const selectClass = (cls) => {
    if (cls.subcomptes.length === 0) {
      setSel((s) => ({ ...s, classCode: cls.code, classLabel: cls.label, subcode: cls.code, sublabel: cls.label }));
      goTo(4, 1);
    } else {
      setSel((s) => ({ ...s, classCode: cls.code, classLabel: cls.label, subcode: null, sublabel: null }));
      goTo(3, 1);
    }
  };

  const selectSub = (sub) => {
    setSel((s) => ({ ...s, subcode: sub.code, sublabel: sub.label }));
    goTo(4, 1);
  };

  const onSubmit = async (data) => {
    if (!sel.subcode) return;
    setSaving(true);
    try {
      await api.post("/accounting/entries", {
        period: data.date.slice(0, 7),
        account_code: sel.subcode,
        amount: data.amount,
        note: data.comment || null,
      });
      try { navigator.vibrate?.(60); } catch {}
      setSaved(true);
      const label = sel.type === "charge" ? "Charge" : "Produit";
      toast.success(`✓ ${label} enregistré · ${sel.subcode} · ${nfmt(data.amount)} DA`);
      await loadEntries();
      setTimeout(() => { setView("overview"); setSaved(false); }, 1200);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id) => {
    try {
      await api.delete(`/accounting/entries/${id}`);
      toast.success("Entrée supprimée");
      loadEntries();
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────────

  const filteredClasses = PLAN_COMPTABLE.filter((c) => c.type === sel.type);
  const selectedClass = PLAN_COMPTABLE.find((c) => c.code === sel.classCode);
  const filteredSubs = (selectedClass?.subcomptes || []).filter(
    (s) => !search || s.code.includes(search) || s.label.toLowerCase().includes(search.toLowerCase())
  );
  const recentEntries = [...entries]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);
  const resultat = summary.produits - summary.charges;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <AnimatePresence mode="wait" initial={false}>
        {/* ════════════════════════════════════════════════════════ OVERVIEW */}
        {view === "overview" ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-display font-bold">Saisie comptable</h1>
                <p className="text-sm text-zinc-400 mt-1">Plan comptable algérien — Classes 60–79</p>
              </div>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400/50 transition"
              />
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="glass rounded-2xl p-4">
                <TrendingDown className="size-4 text-red-400 mb-2" />
                <div className="text-xs text-zinc-500 mb-1">Charges</div>
                <div className="text-base font-display font-bold text-red-400 leading-tight">{nfmt(summary.charges)}</div>
                <div className="text-xs text-zinc-600">DA</div>
              </div>
              <div className="glass rounded-2xl p-4">
                <TrendingUp className="size-4 text-emerald-400 mb-2" />
                <div className="text-xs text-zinc-500 mb-1">Produits</div>
                <div className="text-base font-display font-bold text-emerald-400 leading-tight">{nfmt(summary.produits)}</div>
                <div className="text-xs text-zinc-600">DA</div>
              </div>
              <div className="glass rounded-2xl p-4">
                <BarChart3 className={`size-4 mb-2 ${resultat >= 0 ? "text-cyan-400" : "text-red-400"}`} />
                <div className="text-xs text-zinc-500 mb-1">Résultat</div>
                <div className={`text-base font-display font-bold leading-tight ${resultat >= 0 ? "text-cyan-400" : "text-red-400"}`}>
                  {resultat >= 0 ? "+" : ""}{nfmt(resultat)}
                </div>
                <div className="text-xs text-zinc-600">DA</div>
              </div>
            </div>

            {/* new entry CTA */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => openWizard()}
              className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl border-2 border-cyan-400/30 hover:border-cyan-400/60 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 text-cyan-300 font-semibold text-base transition mb-6"
            >
              <Plus className="size-5" />
              Nouvelle saisie
            </motion.button>

            {/* entries list */}
            {loadingEntries ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="glass rounded-xl h-16 animate-pulse" />)}
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center">
                <BarChart3 className="size-10 mx-auto mb-3 text-zinc-700" />
                <p className="text-sm text-zinc-500">Aucune saisie pour {period}</p>
                <p className="text-xs mt-1 text-zinc-600">Appuyez sur "Nouvelle saisie" pour commencer</p>
              </div>
            ) : (
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                  Saisies récentes — {period}
                </div>
                <div className="space-y-2">
                  {recentEntries.map((e) => (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold font-mono ${
                        e.entry_type === "charge"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-emerald-500/15 text-emerald-400"
                      }`}>
                        {e.account_code}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold font-mono">{e.account_code}</div>
                        {e.note && <div className="text-xs text-zinc-500 truncate">{e.note}</div>}
                        <div className="text-xs text-zinc-600">{e.period}</div>
                      </div>
                      <div className={`text-sm font-mono font-bold shrink-0 ${
                        e.entry_type === "charge" ? "text-red-400" : "text-emerald-400"
                      }`}>
                        {nfmt(e.amount)} DA
                      </div>
                      <button
                        onClick={() => openWizard(e)}
                        title="Dupliquer"
                        className="size-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-cyan-400/10 hover:text-cyan-400 transition active:scale-90"
                      >
                        <Copy className="size-3.5" />
                      </button>
                      <button
                        onClick={() => deleteEntry(e.id)}
                        title="Supprimer"
                        className="size-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-400/10 hover:text-red-400 transition active:scale-90"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

        ) : (
        /* ═══════════════════════════════════════════════════════ WIZARD */
          <motion.div
            key="wizard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col"
          >
            {/* wizard header — sticky */}
            <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-white/5 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-5">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={goBack}
                  className="size-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 transition"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <div>
                  <div className="text-xs text-zinc-500">Étape {step} / 4</div>
                  <div className="text-sm font-semibold">
                    {step === 1 && "Type d'opération"}
                    {step === 2 && "Classe comptable"}
                    {step === 3 && "Sous-compte"}
                    {step === 4 && "Saisie du montant"}
                  </div>
                </div>
                {sel.type && step > 1 && (
                  <span className={`ml-auto text-xs px-2 py-1 rounded-lg font-medium ${
                    sel.type === "charge" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                  }`}>
                    {sel.type === "charge" ? "💸 CHARGE" : "💰 PRODUIT"}
                  </span>
                )}
              </div>
              {/* progress bar */}
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                  animate={{ width: `${(step / 4) * 100}%` }}
                  transition={{ type: "spring", stiffness: 200, damping: 30 }}
                />
              </div>
            </div>

            {/* step content */}
            <div className="overflow-hidden">
              <AnimatePresence mode="wait" custom={dir} initial={false}>
                <motion.div
                  key={step}
                  custom={dir}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >

                  {/* ─── STEP 1: TYPE ─────────────────────────────────────── */}
                  {step === 1 && (
                    <div className="space-y-4 pt-2">
                      <p className="text-sm text-zinc-400 mb-2">
                        Sélectionnez le type d'opération à enregistrer.
                      </p>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => selectType("charge")}
                        className={`w-full py-10 rounded-2xl border-2 flex flex-col items-center gap-3 transition ${
                          sel.type === "charge"
                            ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_30px_rgba(0,195,255,0.12)]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20"
                        }`}
                      >
                        <span className="text-5xl">💸</span>
                        <div className="text-center">
                          <div className="font-bold text-xl tracking-wide">CHARGE</div>
                          <div className="text-sm text-zinc-400 mt-1">Classes 60 → 69</div>
                        </div>
                      </motion.button>

                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => selectType("produit")}
                        className={`w-full py-10 rounded-2xl border-2 flex flex-col items-center gap-3 transition ${
                          sel.type === "produit"
                            ? "border-emerald-400 bg-emerald-400/10 shadow-[0_0_30px_rgba(0,255,135,0.12)]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20"
                        }`}
                      >
                        <span className="text-5xl">💰</span>
                        <div className="text-center">
                          <div className="font-bold text-xl tracking-wide">PRODUIT</div>
                          <div className="text-sm text-zinc-400 mt-1">Classes 70 → 79</div>
                        </div>
                      </motion.button>
                    </div>
                  )}

                  {/* ─── STEP 2: CLASS ────────────────────────────────────── */}
                  {step === 2 && (
                    <div className="space-y-2 pt-2">
                      {filteredClasses.map((cls) => (
                        <motion.button
                          key={cls.code}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => selectClass(cls)}
                          className="w-full flex items-center gap-4 px-4 py-4 rounded-xl glass hover:bg-white/[0.07] active:bg-white/10 transition text-left"
                        >
                          <span className="font-mono font-bold text-cyan-400 text-lg w-8 shrink-0">
                            {cls.code}
                          </span>
                          <span className="flex-1 text-sm font-medium leading-snug">{cls.label}</span>
                          {cls.subcomptes.length === 0 && (
                            <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded shrink-0">
                              direct
                            </span>
                          )}
                          <ChevronRight className="size-4 text-zinc-500 shrink-0" />
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {/* ─── STEP 3: SUBACCOUNT ──────────────────────────────── */}
                  {step === 3 && (
                    <div>
                      {/* search bar */}
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                        <input
                          ref={searchRef}
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Rechercher... ex: 607 ou location"
                          className="w-full pl-10 pr-10 py-3 bg-zinc-900 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-cyan-400/50 transition"
                        />
                        {search && (
                          <button
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>

                      {filteredSubs.length === 0 ? (
                        <div className="text-center py-14 text-zinc-500">
                          <Search className="size-10 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">Aucun compte trouvé</p>
                          <p className="text-xs mt-1 text-zinc-600">Essayez un autre terme de recherche</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {filteredSubs.map((sub) => (
                            <motion.button
                              key={sub.code}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => selectSub(sub)}
                              className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl glass hover:bg-white/[0.07] transition text-left ${
                                sel.subcode === sub.code
                                  ? "border border-cyan-400/40 bg-cyan-400/5"
                                  : ""
                              }`}
                            >
                              <span className="font-mono font-bold text-cyan-400 text-sm w-10 shrink-0">
                                {sub.code}
                              </span>
                              <span className="flex-1 text-sm leading-snug">
                                <HighlightText text={sub.label} query={search} />
                              </span>
                              {sel.subcode === sub.code && (
                                <Check className="size-4 text-emerald-400 shrink-0" />
                              )}
                            </motion.button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── STEP 4: FORM ─────────────────────────────────────── */}
                  {step === 4 && (
                    <div className="relative">
                      {/* success overlay */}
                      <AnimatePresence>
                        {saved && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/95 rounded-2xl py-20"
                          >
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: [0, 1.15, 1] }}
                              transition={{ duration: 0.4 }}
                              className="size-24 rounded-full bg-emerald-400/20 flex items-center justify-center mb-5"
                            >
                              <Check className="size-12 text-emerald-400" />
                            </motion.div>
                            <div className="text-xl font-bold">Enregistré !</div>
                            <div className="text-sm text-zinc-400 mt-2 text-center px-6">
                              {sel.subcode} · {sel.sublabel}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* selection summary — tap to restart */}
                      <button
                        onClick={() => goTo(1, -1)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl glass mb-5 text-left hover:bg-white/[0.07] transition"
                      >
                        <span className="text-xl shrink-0">
                          {sel.type === "charge" ? "💸" : "💰"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-zinc-500 uppercase tracking-wider">
                            {sel.type === "charge" ? "Charge" : "Produit"}
                          </div>
                          <div className="text-sm font-semibold truncate">
                            {sel.subcode} · {sel.sublabel}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500 shrink-0">Changer →</span>
                      </button>

                      {/* form */}
                      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        {/* amount */}
                        <div>
                          <label className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2 block">
                            Montant (DA) *
                          </label>
                          <div className="relative">
                            <input
                              {...register("amount")}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              className="w-full px-4 py-4 pr-14 bg-zinc-900 border border-white/10 rounded-xl text-xl font-mono focus:outline-none focus:border-cyan-400/60 transition text-right"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-mono pointer-events-none">
                              DA
                            </span>
                          </div>
                          {errors.amount && (
                            <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>
                          )}
                        </div>

                        {/* date */}
                        <div>
                          <label className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2 block">
                            Date *
                          </label>
                          <input
                            {...register("date")}
                            type="date"
                            max={getToday()}
                            className="w-full px-4 py-4 bg-zinc-900 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-cyan-400/60 transition"
                          />
                          {errors.date && (
                            <p className="text-red-400 text-xs mt-1">{errors.date.message}</p>
                          )}
                        </div>

                        {/* comment */}
                        <div>
                          <label className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2 block">
                            💬 Commentaire (optionnel)
                          </label>
                          <textarea
                            {...register("comment")}
                            placeholder="Ajouter une note..."
                            maxLength={300}
                            rows={3}
                            className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-cyan-400/60 transition resize-none"
                          />
                          <div className="text-right text-xs text-zinc-600 mt-1">
                            {comment.length} / 300
                          </div>
                          {errors.comment && (
                            <p className="text-red-400 text-xs mt-1">{errors.comment.message}</p>
                          )}
                        </div>

                        {/* submit */}
                        <motion.button
                          type="submit"
                          disabled={saving}
                          whileTap={{ scale: 0.97 }}
                          className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-zinc-950 font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 transition shadow-[0_0_30px_rgba(0,195,255,0.2)]"
                        >
                          {saving ? (
                            <span className="inline-block size-5 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                          ) : (
                            <><Check className="size-5" /> ENREGISTRER</>
                          )}
                        </motion.button>
                      </form>
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
