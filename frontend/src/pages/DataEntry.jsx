import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Save, Trash2, BookOpen, Package } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

const fade = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

function nfmt(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " K";
  return Math.round(n).toLocaleString("fr-DZ");
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Account class section ────────────────────────────────────────────────────
function ClassSection({ classCode, classInfo, values, onChange, onSave, saving }) {
  const [open, setOpen] = useState(false);
  const subtotal = Object.entries(classInfo.accounts).reduce(
    (s, [code]) => s + (parseFloat(values[code]) || 0),
    0
  );

  return (
    <div className="glass rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono bg-[#2563eb]/20 text-[#60a5fa] px-2 py-0.5 rounded">
            {classCode}
          </span>
          <span className="font-medium text-sm">{classInfo.name}</span>
        </div>
        <div className="flex items-center gap-3">
          {subtotal > 0 && (
            <span className="text-xs text-zinc-400 font-mono">{nfmt(subtotal)} DA</span>
          )}
          {open ? <ChevronDown className="size-4 text-zinc-400" /> : <ChevronRight className="size-4 text-zinc-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 py-4 space-y-3">
          {Object.entries(classInfo.accounts).map(([code, name]) => (
            <div key={code} className="flex items-center gap-3">
              <span className="font-mono text-xs text-zinc-500 w-10 shrink-0">{code}</span>
              <span className="text-sm text-zinc-300 flex-1 min-w-0 truncate" title={name}>{name}</span>
              <div className="relative shrink-0">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={values[code] ?? ""}
                  onChange={(e) => onChange(code, e.target.value)}
                  className="w-36 bg-[#18181b] border border-white/10 rounded-lg px-3 py-1.5 text-right text-sm font-mono focus:outline-none focus:border-[#2563eb]/60 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">DA</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3 border-t border-white/5">
            <span className="text-xs text-zinc-500">
              Sous-total classe {classCode} : <span className="text-white font-mono">{nfmt(subtotal)} DA</span>
            </span>
            <button
              onClick={() => onSave(classCode, classInfo.accounts)}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg text-xs font-medium transition disabled:opacity-50"
            >
              <Save className="size-3" />
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DataEntry() {
  const [tab, setTab] = useState("charges");
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [plan, setPlan] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ charges: 0, produits: 0 });

  // Load chart of accounts
  useEffect(() => {
    api.get("/accounting/plan").then((r) => setPlan(r.data)).catch(() => {});
  }, []);

  // Load existing entries for the period
  const loadEntries = useCallback(() => {
    if (!period) return;
    api.get(`/accounting/entries?period=${period}`).then((r) => {
      const map = {};
      let charges = 0, produits = 0;
      r.data.forEach((e) => {
        map[e.account_code] = e.amount;
        if (e.entry_type === "charge") charges += e.amount;
        else produits += e.amount;
      });
      setValues(map);
      setSummary({ charges, produits });
    }).catch(() => {});
  }, [period]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleChange = (code, val) => {
    setValues((v) => ({ ...v, [code]: val }));
  };

  const handleSave = async (classCode, accounts) => {
    setSaving(true);
    try {
      const promises = Object.keys(accounts)
        .filter((code) => values[code] !== undefined && values[code] !== "")
        .map((code) =>
          api.post("/accounting/entries", {
            period,
            account_code: code,
            amount: parseFloat(values[code]) || 0,
          })
        );
      await Promise.all(promises);
      toast.success(`Classe ${classCode} enregistrée`);
      loadEntries();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const promises = Object.entries(values)
        .filter(([, v]) => v !== "" && v !== undefined)
        .map(([code, amount]) =>
          api.post("/accounting/entries", {
            period,
            account_code: code,
            amount: parseFloat(amount) || 0,
          })
        );
      await Promise.all(promises);
      toast.success("Toutes les données enregistrées");
      loadEntries();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const planData = plan ? (tab === "charges" ? plan.charges : plan.produits) : {};
  const resultat = summary.produits - summary.charges;

  return (
    <AppLayout>
      <motion.div initial="hidden" animate="visible" variants={fade} transition={{ duration: 0.4 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold">Saisie des données</h1>
            <p className="text-sm text-zinc-400 mt-1">Charges (60–69) et produits (70–79) du plan comptable</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60"
            />
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm font-medium transition disabled:opacity-50"
            >
              <Save className="size-4" />
              Tout enregistrer
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="glass rounded-2xl p-5">
            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total charges</div>
            <div className="text-xl font-display font-bold text-red-400">{nfmt(summary.charges)} DA</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total produits</div>
            <div className="text-xl font-display font-bold text-green-400">{nfmt(summary.produits)} DA</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Résultat net</div>
            <div className={`text-xl font-display font-bold ${resultat >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
              {resultat >= 0 ? "+" : ""}{nfmt(resultat)} DA
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setTab("charges")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition ${
              tab === "charges"
                ? "bg-red-500/15 text-red-400 border border-red-500/30"
                : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            <Trash2 className="size-4" />
            Charges (60–69)
          </button>
          <button
            onClick={() => setTab("produits")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition ${
              tab === "produits"
                ? "bg-green-500/15 text-green-400 border border-green-500/30"
                : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            <Package className="size-4" />
            Produits (70–79)
          </button>
        </div>

        {/* Account classes */}
        {!plan ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-xl h-14 animate-pulse" />
            ))}
          </div>
        ) : Object.keys(planData).length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center text-zinc-500">
            <BookOpen className="size-10 mx-auto mb-3 opacity-40" />
            <p>Plan comptable non disponible</p>
          </div>
        ) : (
          <div>
            {Object.entries(planData).map(([classCode, classInfo]) => (
              <ClassSection
                key={classCode}
                classCode={classCode}
                classInfo={classInfo}
                values={values}
                onChange={handleChange}
                onSave={handleSave}
                saving={saving}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
}
