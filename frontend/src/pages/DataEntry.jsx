import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft, Check, Plus, TrendingDown, TrendingUp,
  BarChart3, Trash2,
} from "lucide-react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

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

const formSchema = z.object({
  label: z.string().min(1, "Nom requis").max(200, "200 caractères max"),
  amount: z.coerce
    .number({ invalid_type_error: "Montant requis" })
    .positive("Le montant doit être positif"),
  date: z
    .string()
    .min(1, "Date requise")
    .refine((v) => !v || new Date(v) <= new Date(), "Date future non autorisée"),
  comment: z.string().max(300).optional().or(z.literal("")),
});

export default function DataEntry() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ charges: 0, produits: 0 });
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [view, setView] = useState("overview");
  const [entryType, setEntryType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { label: "", amount: "", date: getToday(), comment: "" },
  });
  const comment = watch("comment") || "";

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

  const openWizard = (type = null) => {
    setSaved(false);
    setEntryType(type);
    reset({ label: "", amount: "", date: getToday(), comment: "" });
    setView("form");
  };

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      await api.post("/accounting/entries", {
        label: data.label,
        entry_type: entryType,
        amount: data.amount,
        date: data.date,
        period: data.date.slice(0, 7),
        note: data.comment || null,
      });
      try { navigator.vibrate?.(60); } catch {}
      setSaved(true);
      const typeLabel = entryType === "charge" ? "Charge" : "Produit";
      toast.success(`✓ ${typeLabel} enregistré · ${data.label} · ${nfmt(data.amount)} DA`);
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

  const recentEntries = [...entries]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20);
  const resultat = summary.produits - summary.charges;

  return (
    <AppLayout>
      <AnimatePresence mode="wait" initial={false}>

        {/* ══════════════════════════════════════ OVERVIEW */}
        {view === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-display font-bold">Saisie comptable</h1>
                <p className="text-sm text-zinc-400 mt-1">Charges et produits</p>
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

            {/* Add buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => openWizard("charge")}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-red-400/30 hover:border-red-400/60 bg-red-500/10 text-red-300 font-semibold transition"
              >
                <Plus className="size-4" /> Nouvelle charge
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => openWizard("produit")}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-emerald-400/30 hover:border-emerald-400/60 bg-emerald-500/10 text-emerald-300 font-semibold transition"
              >
                <Plus className="size-4" /> Nouveau produit
              </motion.button>
            </div>

            {/* Entries list */}
            {loadingEntries ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="glass rounded-xl h-16 animate-pulse" />)}
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center">
                <BarChart3 className="size-10 mx-auto mb-3 text-zinc-700" />
                <p className="text-sm text-zinc-500">Aucune saisie pour {period}</p>
              </div>
            ) : (
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                  Saisies — {period}
                </div>
                <div className="space-y-2">
                  {recentEntries.map((e) => (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                        e.entry_type === "charge"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-emerald-500/15 text-emerald-400"
                      }`}>
                        {e.entry_type === "charge" ? "💸" : "💰"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{e.label || e.note || "—"}</div>
                        {e.note && e.label && <div className="text-xs text-zinc-500 truncate">{e.note}</div>}
                        <div className="text-xs text-zinc-600">{e.period}</div>
                      </div>
                      <div className={`text-sm font-mono font-bold shrink-0 ${
                        e.entry_type === "charge" ? "text-red-400" : "text-emerald-400"
                      }`}>
                        {nfmt(e.amount)} DA
                      </div>
                      <button
                        onClick={() => deleteEntry(e.id)}
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
        )}

        {/* ══════════════════════════════════════ FORM */}
        {view === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setView("overview")}
                className="size-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 transition"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div>
                <div className="text-xs text-zinc-500">Nouvelle saisie</div>
                <div className={`text-sm font-bold ${entryType === "charge" ? "text-red-400" : "text-emerald-400"}`}>
                  {entryType === "charge" ? "💸 CHARGE" : "💰 PRODUIT"}
                </div>
              </div>
            </div>

            {/* Success overlay */}
            <AnimatePresence>
              {saved && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/95"
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
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Label */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2 block">
                  {entryType === "charge" ? "Nom de la charge *" : "Nom du produit *"}
                </label>
                <input
                  {...register("label")}
                  type="text"
                  placeholder={entryType === "charge" ? "ex: Loyer, Salaires, Électricité..." : "ex: Vente produit, Prestation..."}
                  className="w-full px-4 py-4 bg-zinc-900 border border-white/10 rounded-xl text-base focus:outline-none focus:border-cyan-400/60 transition"
                  autoFocus
                />
                {errors.label && <p className="text-red-400 text-xs mt-1">{errors.label.message}</p>}
              </div>

              {/* Amount */}
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
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-mono pointer-events-none">DA</span>
                </div>
                {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>}
              </div>

              {/* Date */}
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
                {errors.date && <p className="text-red-400 text-xs mt-1">{errors.date.message}</p>}
              </div>

              {/* Comment */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2 block">
                  Commentaire (optionnel)
                </label>
                <textarea
                  {...register("comment")}
                  placeholder="Note supplémentaire..."
                  maxLength={300}
                  rows={2}
                  className="w-full px-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-cyan-400/60 transition resize-none"
                />
                <div className="text-right text-xs text-zinc-600 mt-1">{comment.length} / 300</div>
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={saving}
                whileTap={{ scale: 0.97 }}
                className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 transition shadow-lg ${
                  entryType === "charge"
                    ? "bg-gradient-to-r from-red-500 to-orange-400 text-white shadow-red-500/20"
                    : "bg-gradient-to-r from-emerald-400 to-cyan-400 text-zinc-950 shadow-emerald-500/20"
                }`}
              >
                {saving ? (
                  <span className="inline-block size-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : (
                  <><Check className="size-5" /> ENREGISTRER</>
                )}
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
