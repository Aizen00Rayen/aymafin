import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Save, Plus, Trash2, X, Scale, BookOpen, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

const fade = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

function nfmt(n) {
  if (n == null || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + " M DA";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + " K DA";
  return n.toLocaleString("fr-DZ") + " DA";
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const JOURNAL_TYPES = ["OUVERTURE", "ACHATS", "BANQUE", "CAISSE", "STOCKS", "OPERATIONS_DIVERS", "SALAIRES", "VENTES"];

// ── TCR component ─────────────────────────────────────────────────────────────
function TCR({ period }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!period) return;
    api.get(`/accounting/tcr?period=${period}`).then((r) => setData(r.data)).catch(() => setData(null));
  }, [period]);

  if (!data) return (
    <div className="glass rounded-2xl p-12 text-center text-zinc-500">
      <FileSpreadsheet className="size-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">Aucune donnée pour cette période.<br/>Saisissez d'abord vos charges et produits.</p>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Charges */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-red-500/10 border-b border-white/5">
          <h3 className="font-semibold text-red-400 text-sm">CHARGES</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-zinc-500">
              <th className="text-left px-4 py-2">Classe / Compte</th>
              <th className="text-right px-4 py-2">Montant (DA)</th>
            </tr>
          </thead>
          <tbody>
            {data.charges_detail.map((cls) => (
              <React.Fragment key={cls.class}>
                <tr className="bg-white/3 border-b border-white/5">
                  <td className="px-4 py-2 font-medium text-xs text-zinc-300">
                    <span className="font-mono text-[#60a5fa] mr-2">{cls.class}</span>{cls.name}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{nfmt(cls.subtotal)}</td>
                </tr>
                {cls.accounts.map((acc) => (
                  <tr key={acc.code} className="border-b border-white/5 hover:bg-white/2">
                    <td className="px-4 py-1.5 text-zinc-500 text-xs pl-8">
                      <span className="font-mono mr-2">{acc.code}</span>{acc.name}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-xs text-zinc-400">{nfmt(acc.amount)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr className="border-t-2 border-red-500/30">
              <td className="px-4 py-3 font-bold text-red-400 text-sm">TOTAL CHARGES</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-red-400">{nfmt(data.total_charges)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Produits */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-green-500/10 border-b border-white/5">
          <h3 className="font-semibold text-green-400 text-sm">PRODUITS</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-zinc-500">
              <th className="text-left px-4 py-2">Classe / Compte</th>
              <th className="text-right px-4 py-2">Montant (DA)</th>
            </tr>
          </thead>
          <tbody>
            {data.produits_detail.map((cls) => (
              <React.Fragment key={cls.class}>
                <tr className="bg-white/3 border-b border-white/5">
                  <td className="px-4 py-2 font-medium text-xs text-zinc-300">
                    <span className="font-mono text-green-400 mr-2">{cls.class}</span>{cls.name}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{nfmt(cls.subtotal)}</td>
                </tr>
                {cls.accounts.map((acc) => (
                  <tr key={acc.code} className="border-b border-white/5 hover:bg-white/2">
                    <td className="px-4 py-1.5 text-zinc-500 text-xs pl-8">
                      <span className="font-mono mr-2">{acc.code}</span>{acc.name}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-xs text-zinc-400">{nfmt(acc.amount)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr className="border-t-2 border-green-500/30">
              <td className="px-4 py-3 font-bold text-green-400 text-sm">TOTAL PRODUITS</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-green-400">{nfmt(data.total_produits)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Result */}
      <div className="lg:col-span-2 glass rounded-2xl p-5 flex items-center justify-between">
        <span className="font-display font-bold text-lg">RÉSULTAT NET DE L'EXERCICE</span>
        <span className={`text-2xl font-display font-bold ${data.resultat_net >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
          {data.resultat_net >= 0 ? "Bénéfice : " : "Perte : "}{nfmt(Math.abs(data.resultat_net))}
        </span>
      </div>
    </div>
  );
}

// ── Bilan form field ──────────────────────────────────────────────────────────
function BField({ label, field, values, onChange, indent = false }) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-white/5 ${indent ? "pl-4" : ""}`}>
      <span className={`text-xs ${indent ? "text-zinc-500" : "text-zinc-300"}`}>{label}</span>
      <input
        type="number" min="0" step="0.01"
        value={values[field] ?? ""}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-32 bg-[#09090b] border border-white/10 rounded px-2 py-1 text-right text-xs font-mono focus:outline-none focus:border-[#2563eb]/50"
        placeholder="0"
      />
    </div>
  );
}

function BilanRow({ label, value, bold = false, color = "" }) {
  return (
    <tr className="border-b border-white/5">
      <td className={`px-4 py-2 text-xs ${bold ? "font-bold" : "text-zinc-400"} ${color}`}>{label}</td>
      <td className={`px-4 py-2 text-right font-mono text-xs ${bold ? "font-bold" : ""} ${color}`}>{nfmt(value)}</td>
    </tr>
  );
}

// ── Bilan component ───────────────────────────────────────────────────────────
function Bilan({ period }) {
  const [mode, setMode] = useState("view"); // "view" | "edit"
  const [values, setValues] = useState({});
  const [bilan, setBilan] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!period) return;
    api.get(`/accounting/bilan?period=${period}`).then((r) => {
      setBilan(r.data);
    }).catch(() => setBilan(null));
  }, [period]);

  // Also load raw form values from bilan_entries endpoint
  const loadRaw = useCallback(() => {
    if (!period) return;
    // We'll infer form values from the bilan structure
    api.get(`/accounting/bilan?period=${period}`).then((r) => {
      if (!r.data) { setValues({}); return; }
      const b = r.data;
      setValues({
        ecarts_acquisition: b.actif.non_courant.ecarts_acquisition ?? 0,
        immo_incorporelles_brut: b.actif.non_courant.immo_incorporelles?.brut ?? 0,
        immo_incorporelles_amort: b.actif.non_courant.immo_incorporelles?.amort ?? 0,
        immo_corporelles_brut: b.actif.non_courant.immo_corporelles?.brut ?? 0,
        immo_corporelles_amort: b.actif.non_courant.immo_corporelles?.amort ?? 0,
        immo_financieres: b.actif.non_courant.immo_financieres ?? 0,
        impots_differes_actif: b.actif.non_courant.impots_differes ?? 0,
        stocks: b.actif.courant.stocks ?? 0,
        creances_clients: b.actif.courant.creances_clients ?? 0,
        autres_debiteurs: b.actif.courant.autres_debiteurs ?? 0,
        impots_taxes_recuperables: b.actif.courant.impots_taxes ?? 0,
        tresorerie_actif: b.actif.courant.tresorerie ?? 0,
        capital: b.passif.capitaux_propres.capital ?? 0,
        reserves: b.passif.capitaux_propres.reserves ?? 0,
        autres_capitaux_propres: b.passif.capitaux_propres.autres ?? 0,
        emprunts_lt: b.passif.non_courant.emprunts_lt ?? 0,
        impots_differes_passif: b.passif.non_courant.impots_differes ?? 0,
        fournisseurs: b.passif.courant.fournisseurs ?? 0,
        dettes_personnel: b.passif.courant.dettes_personnel ?? 0,
        dettes_impots: b.passif.courant.dettes_impots ?? 0,
        autres_dettes_ct: b.passif.courant.autres_dettes ?? 0,
        decouvert_bancaire: b.passif.courant.decouvert_bancaire ?? 0,
      });
    }).catch(() => {});
  }, [period]);

  useEffect(() => { load(); loadRaw(); }, [load, loadRaw]);

  const handleChange = (field, val) => setValues((v) => ({ ...v, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { period };
      Object.entries(values).forEach(([k, v]) => { payload[k] = parseFloat(v) || 0; });
      await api.post("/accounting/bilan", payload);
      toast.success("Bilan enregistré");
      load();
      loadRaw();
      setMode("view");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-zinc-400">Données bilantielles pour la période {period}</span>
        <div className="flex gap-2">
          <button onClick={() => setMode(mode === "edit" ? "view" : "edit")}
            className="flex items-center gap-2 px-4 py-2 glass hover:bg-white/10 rounded-xl text-sm transition">
            {mode === "edit" ? "Annuler" : "Saisir / Modifier"}
          </button>
          {mode === "edit" && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm transition disabled:opacity-50">
              <Save className="size-4" />
              Enregistrer
            </button>
          )}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* ACTIF form */}
          <div className="glass rounded-2xl p-5">
            <h3 className="font-semibold text-[#60a5fa] text-sm mb-3 pb-2 border-b border-white/5">ACTIF</h3>
            <p className="text-xs text-zinc-500 mb-3 font-semibold uppercase tracking-wide">Actif non courant</p>
            <BField label="Écarts d'acquisition" field="ecarts_acquisition" values={values} onChange={handleChange} indent />
            <BField label="Immob. incorporelles (brut)" field="immo_incorporelles_brut" values={values} onChange={handleChange} indent />
            <BField label="Immob. incorporelles (amort.)" field="immo_incorporelles_amort" values={values} onChange={handleChange} indent />
            <BField label="Immob. corporelles (brut)" field="immo_corporelles_brut" values={values} onChange={handleChange} indent />
            <BField label="Immob. corporelles (amort.)" field="immo_corporelles_amort" values={values} onChange={handleChange} indent />
            <BField label="Immob. financières" field="immo_financieres" values={values} onChange={handleChange} indent />
            <BField label="Impôts différés actif" field="impots_differes_actif" values={values} onChange={handleChange} indent />
            <p className="text-xs text-zinc-500 mt-4 mb-3 font-semibold uppercase tracking-wide">Actif courant</p>
            <BField label="Stocks et en-cours" field="stocks" values={values} onChange={handleChange} indent />
            <BField label="Créances clients" field="creances_clients" values={values} onChange={handleChange} indent />
            <BField label="Autres débiteurs" field="autres_debiteurs" values={values} onChange={handleChange} indent />
            <BField label="Impôts et taxes récupérables" field="impots_taxes_recuperables" values={values} onChange={handleChange} indent />
            <BField label="Trésorerie et équivalents" field="tresorerie_actif" values={values} onChange={handleChange} indent />
          </div>

          {/* PASSIF form */}
          <div className="glass rounded-2xl p-5">
            <h3 className="font-semibold text-[#a78bfa] text-sm mb-3 pb-2 border-b border-white/5">PASSIF</h3>
            <p className="text-xs text-zinc-500 mb-3 font-semibold uppercase tracking-wide">Capitaux propres</p>
            <BField label="Capital" field="capital" values={values} onChange={handleChange} indent />
            <BField label="Réserves" field="reserves" values={values} onChange={handleChange} indent />
            <BField label="Autres capitaux propres" field="autres_capitaux_propres" values={values} onChange={handleChange} indent />
            <p className="text-xs text-zinc-500 mt-4 mb-3 font-semibold uppercase tracking-wide">Passif non courant</p>
            <BField label="Emprunts et dettes LT" field="emprunts_lt" values={values} onChange={handleChange} indent />
            <BField label="Impôts différés passif" field="impots_differes_passif" values={values} onChange={handleChange} indent />
            <p className="text-xs text-zinc-500 mt-4 mb-3 font-semibold uppercase tracking-wide">Passif courant</p>
            <BField label="Fournisseurs" field="fournisseurs" values={values} onChange={handleChange} indent />
            <BField label="Dettes envers le personnel" field="dettes_personnel" values={values} onChange={handleChange} indent />
            <BField label="Dettes fiscales et sociales" field="dettes_impots" values={values} onChange={handleChange} indent />
            <BField label="Autres dettes CT" field="autres_dettes_ct" values={values} onChange={handleChange} indent />
            <BField label="Découverts bancaires" field="decouvert_bancaire" values={values} onChange={handleChange} indent />
          </div>
        </div>
      ) : bilan ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* ACTIF view */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-[#2563eb]/10 border-b border-white/5">
              <h3 className="font-semibold text-[#60a5fa] text-sm">ACTIF</h3>
            </div>
            <table className="w-full">
              <tbody>
                <tr className="bg-white/3 border-b border-white/5">
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Actif non courant</td>
                </tr>
                <BilanRow label="Écarts d'acquisition" value={bilan.actif.non_courant.ecarts_acquisition} indent />
                <BilanRow label={`Immob. incorporelles (net: ${nfmt(bilan.actif.non_courant.immo_incorporelles.net)})`} value={bilan.actif.non_courant.immo_incorporelles.brut} />
                <BilanRow label={`Immob. corporelles (net: ${nfmt(bilan.actif.non_courant.immo_corporelles.net)})`} value={bilan.actif.non_courant.immo_corporelles.brut} />
                <BilanRow label="Immob. financières" value={bilan.actif.non_courant.immo_financieres} />
                <BilanRow label="Impôts différés actif" value={bilan.actif.non_courant.impots_differes} />
                <BilanRow label="TOTAL ACTIF NON COURANT" value={bilan.actif.non_courant.total} bold color="text-[#60a5fa]" />
                <tr className="bg-white/3 border-b border-white/5">
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Actif courant</td>
                </tr>
                <BilanRow label="Stocks et en-cours" value={bilan.actif.courant.stocks} />
                <BilanRow label="Créances clients" value={bilan.actif.courant.creances_clients} />
                <BilanRow label="Autres débiteurs" value={bilan.actif.courant.autres_debiteurs} />
                <BilanRow label="Impôts et taxes récupérables" value={bilan.actif.courant.impots_taxes} />
                <BilanRow label="Trésorerie et équivalents" value={bilan.actif.courant.tresorerie} />
                <BilanRow label="TOTAL ACTIF COURANT" value={bilan.actif.courant.total} bold color="text-[#60a5fa]" />
                <BilanRow label="TOTAL ACTIF" value={bilan.actif.total} bold color="text-white" />
              </tbody>
            </table>
          </div>

          {/* PASSIF view */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-[#a78bfa]/10 border-b border-white/5">
              <h3 className="font-semibold text-[#a78bfa] text-sm">PASSIF</h3>
            </div>
            <table className="w-full">
              <tbody>
                <tr className="bg-white/3 border-b border-white/5">
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Capitaux propres</td>
                </tr>
                <BilanRow label="Capital" value={bilan.passif.capitaux_propres.capital} />
                <BilanRow label="Réserves" value={bilan.passif.capitaux_propres.reserves} />
                <BilanRow label="Résultat net de l'exercice" value={bilan.passif.capitaux_propres.resultat_net} color={bilan.passif.capitaux_propres.resultat_net >= 0 ? "text-green-400" : "text-red-400"} />
                <BilanRow label="Autres capitaux propres" value={bilan.passif.capitaux_propres.autres} />
                <BilanRow label="TOTAL CAPITAUX PROPRES" value={bilan.passif.capitaux_propres.total} bold color="text-[#a78bfa]" />
                <tr className="bg-white/3 border-b border-white/5">
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Passif non courant</td>
                </tr>
                <BilanRow label="Emprunts et dettes LT" value={bilan.passif.non_courant.emprunts_lt} />
                <BilanRow label="Impôts différés passif" value={bilan.passif.non_courant.impots_differes} />
                <BilanRow label="TOTAL PASSIF NON COURANT" value={bilan.passif.non_courant.total} bold color="text-[#a78bfa]" />
                <tr className="bg-white/3 border-b border-white/5">
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Passif courant</td>
                </tr>
                <BilanRow label="Fournisseurs" value={bilan.passif.courant.fournisseurs} />
                <BilanRow label="Dettes envers le personnel" value={bilan.passif.courant.dettes_personnel} />
                <BilanRow label="Dettes fiscales et sociales" value={bilan.passif.courant.dettes_impots} />
                <BilanRow label="Autres dettes CT" value={bilan.passif.courant.autres_dettes} />
                <BilanRow label="Découverts bancaires" value={bilan.passif.courant.decouvert_bancaire} />
                <BilanRow label="TOTAL PASSIF COURANT" value={bilan.passif.courant.total} bold color="text-[#a78bfa]" />
                <BilanRow label="TOTAL PASSIF" value={bilan.passif.total} bold color="text-white" />
              </tbody>
            </table>
          </div>

          {/* Equilibre */}
          <div className={`lg:col-span-2 rounded-xl p-4 flex items-center justify-between text-sm font-medium
            ${Math.abs(bilan.ecart) < 0.01 ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
            <span>{Math.abs(bilan.ecart) < 0.01 ? "✅ Bilan équilibré" : "⚠️ Bilan déséquilibré"}</span>
            {Math.abs(bilan.ecart) >= 0.01 && <span className="font-mono text-red-400">Écart : {nfmt(bilan.ecart)}</span>}
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl p-12 text-center text-zinc-500">
          <Scale className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm mb-4">Aucune donnée de bilan pour cette période.</p>
          <button onClick={() => setMode("edit")} className="px-5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm transition">
            Saisir le bilan
          </button>
        </div>
      )}
    </div>
  );
}

// ── Journal entry modal ───────────────────────────────────────────────────────
function JournalModal({ period, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: period ? `${period}-01` : new Date().toISOString().slice(0, 10),
    journal_type: "ACHATS",
    description: "",
    debit_account: "",
    credit_account: "",
    amount: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.debit_account || !form.credit_account) {
      toast.error("Tous les champs sont obligatoires"); return;
    }
    setSaving(true);
    try {
      await api.post("/accounting/journal", { ...form, amount: parseFloat(form.amount) });
      toast.success("Écriture ajoutée");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="glass-strong rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg">Nouvelle écriture comptable</h3>
          <button onClick={onClose}><X className="size-5 text-zinc-400 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Type de journal</label>
              <select value={form.journal_type} onChange={(e) => setForm({ ...form, journal_type: e.target.value })}
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60">
                {JOURNAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Libellé</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description de l'opération"
              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Compte débit</label>
              <input value={form.debit_account} onChange={(e) => setForm({ ...form, debit_account: e.target.value })}
                placeholder="Ex: 601"
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563eb]/60" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Compte crédit</label>
              <input value={form.credit_account} onChange={(e) => setForm({ ...form, credit_account: e.target.value })}
                placeholder="Ex: 401"
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563eb]/60" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Montant (DA)</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563eb]/60" />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm font-medium transition disabled:opacity-50">
            {saving ? "Enregistrement…" : "Ajouter l'écriture"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Journal component ─────────────────────────────────────────────────────────
function Journal({ period }) {
  const [entries, setEntries] = useState([]);
  const [filterType, setFilterType] = useState("ALL");
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (period) params.append("period", period);
    if (filterType !== "ALL") params.append("journal_type", filterType);
    api.get(`/accounting/journal?${params}`).then((r) => setEntries(r.data)).catch(() => {});
  }, [period, filterType]);

  useEffect(() => { load(); }, [load]);

  const deleteEntry = async (id) => {
    try {
      await api.delete(`/accounting/journal/${id}`);
      toast.success("Écriture supprimée");
      load();
    } catch { toast.error("Erreur"); }
  };

  const JOURNAL_COLORS = {
    OUVERTURE: "text-purple-400",
    ACHATS: "text-red-400",
    BANQUE: "text-blue-400",
    CAISSE: "text-yellow-400",
    STOCKS: "text-orange-400",
    OPERATIONS_DIVERS: "text-zinc-400",
    SALAIRES: "text-pink-400",
    VENTES: "text-green-400",
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterType("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterType === "ALL" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}>
            Tous
          </button>
          {JOURNAL_TYPES.map((t) => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterType === t ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm font-medium transition">
          <Plus className="size-4" /> Écriture
        </button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase">Date</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase">Journal</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase">Libellé</th>
              <th className="text-center px-4 py-3 text-xs text-zinc-500 uppercase">Débit</th>
              <th className="text-center px-4 py-3 text-xs text-zinc-500 uppercase">Crédit</th>
              <th className="text-right px-4 py-3 text-xs text-zinc-500 uppercase">Montant</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">Aucune écriture</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-white/5 hover:bg-white/3 transition">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{e.date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold ${JOURNAL_COLORS[e.journal_type] || "text-zinc-400"}`}>{e.journal_type}</span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-200 text-xs max-w-[200px] truncate">{e.description}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-[#60a5fa]">{e.debit_account}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-[#a78bfa]">{e.credit_account}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-medium">{nfmt(e.amount)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => deleteEntry(e.id)} className="text-zinc-600 hover:text-red-400 transition">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && <JournalModal period={period} onClose={() => setShowModal(false)} onSaved={load} />}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FinancialStatements() {
  const [tab, setTab] = useState("bilan");
  const [period, setPeriod] = useState(getCurrentPeriod());

  const tabs = [
    { id: "bilan", label: "Bilan", icon: Scale },
    { id: "tcr", label: "TCR", icon: FileSpreadsheet },
    { id: "journal", label: "Journal", icon: BookOpen },
  ];

  return (
    <AppLayout>
      <motion.div initial="hidden" animate="visible" variants={fade} transition={{ duration: 0.4 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold">États financiers</h1>
            <p className="text-sm text-zinc-400 mt-1">Bilan · TCR · Journal comptable</p>
          </div>
          <input
            type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition ${
                tab === id
                  ? "bg-[#2563eb]/15 text-white border border-[#2563eb]/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}>
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "bilan" && <Bilan period={period} />}
        {tab === "tcr" && <TCR period={period} />}
        {tab === "journal" && <Journal period={period} />}
      </motion.div>
    </AppLayout>
  );
}
