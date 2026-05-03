import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, Plus, Trash2, FileText, X, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

const fade = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

function nfmt(n) {
  if (n == null) return "0";
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e9) s = (n / 1e9).toFixed(2) + " G";
  else if (abs >= 1e6) s = (n / 1e6).toFixed(2) + " M";
  else if (abs >= 1e3) s = (n / 1e3).toFixed(1) + " K";
  else s = n.toFixed(2);
  return s + " DA";
}

const STATUS_LABELS = { paid: "Payée", pending: "En attente", overdue: "En retard" };
const STATUS_COLORS = {
  paid: "bg-green-500/15 text-green-400 border border-green-500/30",
  pending: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  overdue: "bg-red-500/15 text-red-400 border border-red-500/30",
};

// ── Entry modal ───────────────────────────────────────────────────────────────
function EntryModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    label: "",
    amount: "",
    type: "income",
    category: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.label || !form.amount) { toast.error("Renseignez le libellé et le montant"); return; }
    setSaving(true);
    try {
      await api.post("/treasury/entries", { ...form, amount: parseFloat(form.amount) });
      toast.success("Entrée ajoutée");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="glass-strong rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg">Nouvelle entrée de trésorerie</h3>
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
              <label className="text-xs text-zinc-400 mb-1 block">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60">
                <option value="income">Entrée</option>
                <option value="expense">Sortie</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Libellé</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Description de l'opération"
              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Montant (DA)</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563eb]/60" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Catégorie</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ex: Ventes, Salaires…"
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm font-medium transition disabled:opacity-50">
            {saving ? "Enregistrement…" : "Ajouter"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Invoice modal ─────────────────────────────────────────────────────────────
function InvoiceModal({ invoice, onClose, onSaved }) {
  const editing = !!invoice;
  const [form, setForm] = useState(invoice || {
    invoice_number: "",
    name: "",
    label: "",
    amount: "",
    type: "incoming",
    date: new Date().toISOString().slice(0, 10),
    status: "pending",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const required = ["invoice_number", "name", "label", "amount"];
    if (required.some((k) => !form[k])) { toast.error("Renseignez tous les champs obligatoires"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/treasury/invoices/${invoice.id}`, { ...form, amount: parseFloat(form.amount) });
        toast.success("Facture mise à jour");
      } else {
        await api.post("/treasury/invoices", { ...form, amount: parseFloat(form.amount) });
        toast.success("Facture ajoutée");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="glass-strong rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg">{editing ? "Modifier la facture" : "Nouvelle facture"}</h3>
          <button onClick={onClose}><X className="size-5 text-zinc-400 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">N° Facture *</label>
              <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                placeholder="FAC-2024-001"
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563eb]/60" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Nom *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Client ou fournisseur"
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Libellé *</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Description de la facture"
              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Montant (DA) *</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563eb]/60" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60">
                <option value="incoming">Entrante</option>
                <option value="outgoing">Sortante</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Statut</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60">
                <option value="pending">En attente</option>
                <option value="paid">Payée</option>
                <option value="overdue">En retard</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full bg-[#18181b] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563eb]/60" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm font-medium transition disabled:opacity-50">
            {saving ? "Enregistrement…" : editing ? "Mettre à jour" : "Ajouter"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Treasury() {
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(null); // null | {} | invoice obj
  const [tab, setTab] = useState("overview");

  const loadAll = useCallback(() => {
    api.get("/treasury/summary").then((r) => setSummary(r.data)).catch(() => {});
    api.get("/treasury/entries").then((r) => setEntries(r.data)).catch(() => {});
    api.get("/treasury/invoices").then((r) => setInvoices(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const deleteEntry = async (id) => {
    try {
      await api.delete(`/treasury/entries/${id}`);
      toast.success("Entrée supprimée");
      loadAll();
    } catch { toast.error("Erreur de suppression"); }
  };

  const deleteInvoice = async (id) => {
    try {
      await api.delete(`/treasury/invoices/${id}`);
      toast.success("Facture supprimée");
      loadAll();
    } catch { toast.error("Erreur de suppression"); }
  };

  return (
    <AppLayout>
      <motion.div initial="hidden" animate="visible" variants={fade} transition={{ duration: 0.4 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold">Trésorerie</h1>
            <p className="text-sm text-zinc-400 mt-1">Suivi des flux financiers et des factures</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowEntryModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl text-sm font-medium transition">
              <Plus className="size-4" /> Entrée
            </button>
            <button onClick={() => setInvoiceModal({})}
              className="flex items-center gap-2 px-4 py-2 glass hover:bg-white/10 rounded-xl text-sm font-medium transition">
              <FileText className="size-4" /> Facture
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="size-4 text-[#2563eb]" />
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Solde trésorerie</span>
            </div>
            <div className={`text-2xl font-display font-bold ${(summary?.balance ?? 0) >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
              {summary ? nfmt(summary.balance) : "—"}
            </div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="size-4 text-green-400" />
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Total entrées</span>
            </div>
            <div className="text-2xl font-display font-bold text-green-400">
              {summary ? nfmt(summary.total_income) : "—"}
            </div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="size-4 text-red-400" />
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Total sorties</span>
            </div>
            <div className="text-2xl font-display font-bold text-red-400">
              {summary ? nfmt(summary.total_expense) : "—"}
            </div>
          </div>
        </div>

        {/* Chart */}
        {summary?.monthly?.length > 0 && (
          <div className="glass rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Entrées et sorties par mois</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={summary.monthly} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10 }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(v) => [`${v.toLocaleString("fr-DZ")} DA`]}
                />
                <Legend />
                <Bar dataKey="income" name="Entrées" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Sorties" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {["overview", "invoices"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                tab === t
                  ? "bg-[#2563eb]/15 text-white border border-[#2563eb]/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}>
              {t === "overview" ? "Mouvements" : "Factures"}
            </button>
          ))}
        </div>

        {/* Movements table */}
        {tab === "overview" && (
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Libellé</th>
                  <th className="text-left px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Catégorie</th>
                  <th className="text-right px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Montant</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500">Aucun mouvement enregistré</td></tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/3 transition">
                      <td className="px-5 py-3 font-mono text-xs text-zinc-400">{e.date}</td>
                      <td className="px-5 py-3 text-zinc-200">{e.label}</td>
                      <td className="px-5 py-3 text-zinc-500 text-xs">{e.category || "—"}</td>
                      <td className={`px-5 py-3 text-right font-mono font-medium ${e.type === "income" ? "text-green-400" : "text-red-400"}`}>
                        {e.type === "income" ? "+" : "-"}{nfmt(e.amount)}
                      </td>
                      <td className="px-5 py-3 text-right">
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
        )}

        {/* Invoices table */}
        {tab === "invoices" && (
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">N° Facture</th>
                  <th className="text-left px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Nom</th>
                  <th className="text-left px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Libellé</th>
                  <th className="text-left px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Montant</th>
                  <th className="text-center px-5 py-3 text-xs text-zinc-500 uppercase tracking-wide">Statut</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-zinc-500">Aucune facture enregistrée</td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/3 transition">
                      <td className="px-5 py-3 font-mono text-xs text-[#60a5fa]">{inv.invoice_number}</td>
                      <td className="px-5 py-3 font-medium">{inv.name}</td>
                      <td className="px-5 py-3 text-zinc-400 text-xs max-w-[200px] truncate">{inv.label}</td>
                      <td className="px-5 py-3 font-mono text-xs text-zinc-400">{inv.date}</td>
                      <td className={`px-5 py-3 text-right font-mono font-medium ${inv.type === "incoming" ? "text-green-400" : "text-red-400"}`}>
                        {nfmt(inv.amount)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status]}`}>
                          {STATUS_LABELS[inv.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right flex items-center justify-end gap-2">
                        <button onClick={() => setInvoiceModal(inv)} className="text-zinc-600 hover:text-[#2563eb] transition">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => deleteInvoice(inv.id)} className="text-zinc-600 hover:text-red-400 transition">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {showEntryModal && <EntryModal onClose={() => setShowEntryModal(false)} onSaved={loadAll} />}
      {invoiceModal !== null && (
        <InvoiceModal
          invoice={invoiceModal?.id ? invoiceModal : null}
          onClose={() => setInvoiceModal(null)}
          onSaved={loadAll}
        />
      )}
    </AppLayout>
  );
}
