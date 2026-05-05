import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, LineChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, Plus, Trash2,
  FileText, X, Pencil, Search, Check, Clock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

// ── helpers ───────────────────────────────────────────────────────────────────

const TPERIODS = ["7 jours", "Ce mois", "3 mois", "6 mois", "1 an"];

function nfmt(n) {
  if (n == null) return "0";
  const num = parseFloat(n);
  const abs = Math.abs(num);
  let s;
  if (abs >= 1_000_000) s = (num / 1_000_000).toFixed(2) + " M";
  else if (abs >= 1_000) s = (num / 1_000).toFixed(1) + " k";
  else s = Math.abs(num) < 1 ? num.toFixed(2) : Math.round(num).toLocaleString("fr-DZ");
  return s + " DA";
}

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  return diff;
}

function invoiceStatus(inv) {
  if (inv.status === "paid") return "paid";
  const due = inv.due_date || inv.date;
  if (due && daysDiff(due) > 0) return "overdue";
  return "pending";
}

const STATUS_META = {
  paid:    { label: "Payée",      color: "#00FF87", bg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25", icon: Check },
  pending: { label: "En attente", color: "#FFB86C", bg: "bg-orange-500/10 text-orange-400 border border-orange-500/25",   icon: Clock },
  overdue: { label: "En retard",  color: "#FF6B6B", bg: "bg-red-500/10 text-red-400 border border-red-500/25",            icon: AlertTriangle },
};

function autoInvoiceNo(invoices) {
  const year = new Date().getFullYear();
  const count = (invoices || []).filter((i) => i.invoice_number?.startsWith(`FAC-${year}`)).length;
  return `FAC-${year}-${String(count + 1).padStart(3, "0")}`;
}

// ── Entry modal ───────────────────────────────────────────────────────────────

function EntryModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    label: "", amount: "", type: "income", category: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.label || !form.amount) { toast.error("Libellé et montant requis"); return; }
    setSaving(true);
    try {
      await api.post("/treasury/entries", { ...form, amount: parseFloat(form.amount) });
      toast.success("Entrée ajoutée");
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };
  const inp = "w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-cyan-400/50 transition";
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="glass-strong rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg">Nouvelle entrée</h3>
          <button onClick={onClose}><X className="size-5 text-zinc-400" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inp}>
                <option value="income">💚 Entrée</option>
                <option value="expense">🔴 Sortie</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Libellé *</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Description de l'opération" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Montant (DA) *</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                inputMode="decimal" placeholder="0.00" className={inp + " font-mono"} />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Catégorie</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ex: Ventes…" className={inp} />
            </div>
          </div>
          <motion.button type="submit" disabled={saving} whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-zinc-950 font-bold text-sm disabled:opacity-60 transition">
            {saving ? "Enregistrement…" : "Ajouter"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Invoice modal ─────────────────────────────────────────────────────────────

function InvoiceModal({ invoice, invoices, onClose, onSaved }) {
  const editing = !!invoice?.id;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => invoice?.id ? invoice : {
    invoice_number: autoInvoiceNo(invoices),
    name: "", label: "", amount: "",
    type: "incoming",
    date: today,
    due_date: "",
    status: "pending",
  });
  const [saving, setSaving] = useState(false);
  const inp = "w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-cyan-400/50 transition";

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.label || !form.amount) { toast.error("Nom, libellé et montant requis"); return; }
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editing) {
        await api.put(`/treasury/invoices/${invoice.id}`, payload);
        toast.success("Facture mise à jour");
      } else {
        await api.post("/treasury/invoices", payload);
        try { navigator.vibrate?.(50); } catch {}
        toast.success(`✓ Facture ${form.invoice_number} créée`);
      }
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="glass-strong rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg">{editing ? "Modifier" : "Nouvelle facture"}</h3>
          <button onClick={onClose}><X className="size-5 text-zinc-400" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">N° Facture</label>
              <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                className={inp + " font-mono"} />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inp}>
                <option value="incoming">Entrante</option>
                <option value="outgoing">Sortante</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Nom client *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="SARL Bennani" className={inp} />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Libellé *</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Prestation de service…" className={inp} />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Montant (DA) *</label>
            <input type="number" min="0" step="0.01" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              inputMode="decimal" placeholder="0.00" className={inp + " font-mono"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Date émission</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Date échéance</label>
              <input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inp} />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Statut</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inp}>
              <option value="pending">En attente</option>
              <option value="paid">Payée</option>
            </select>
          </div>
          <motion.button type="submit" disabled={saving} whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-zinc-950 font-bold text-sm disabled:opacity-60 transition">
            {saving ? "Enregistrement…" : editing ? "Mettre à jour" : "CRÉER LA FACTURE"}
          </motion.button>
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
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [tab, setTab] = useState("overview");
  const [tperiod, setTperiod] = useState("Ce mois");
  const [invFilter, setInvFilter] = useState("Toutes");
  const [invSearch, setInvSearch] = useState("");

  const loadAll = useCallback(() => {
    api.get("/treasury/summary").then((r) => setSummary(r.data)).catch(() => {});
    api.get("/treasury/entries").then((r) => setEntries(r.data)).catch(() => {});
    api.get("/treasury/invoices").then((r) => setInvoices(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const deleteEntry = async (id) => {
    if (!window.confirm("Supprimer cet entrée ?")) return;
    try {
      await api.delete(`/treasury/entries/${id}`);
      toast.success("Entrée supprimée"); loadAll();
    } catch { toast.error("Erreur de suppression"); }
  };

  const deleteInvoice = async (id) => {
    if (!window.confirm("Supprimer cette facture ?")) return;
    try {
      await api.delete(`/treasury/invoices/${id}`);
      toast.success("Facture supprimée"); loadAll();
    } catch { toast.error("Erreur de suppression"); }
  };

  const markPaid = async (inv) => {
    try {
      await api.put(`/treasury/invoices/${inv.id}`, { ...inv, status: "paid" });
      toast.success("Facture marquée payée");
      loadAll();
    } catch { toast.error("Erreur"); }
  };

  // ── derived ─────────────────────────────────────────────────────────────────

  const balance = summary?.balance ?? 0;
  const sparkData = (summary?.monthly || []).slice(-7).map((m) => ({
    x: m.month,
    y: m.income - m.expense,
  }));

  // Bar chart data based on period filter
  const chartData = (summary?.monthly || []).map((m) => ({
    month: m.month?.slice(5) || m.month,
    Entrées: Math.round(m.income || 0),
    Sorties: Math.round(m.expense || 0),
  }));

  // Invoice status counts
  const invWithStatus = invoices.map((i) => ({ ...i, _status: invoiceStatus(i) }));
  const statusCount = {
    Payées: invWithStatus.filter((i) => i._status === "paid").length,
    "En attente": invWithStatus.filter((i) => i._status === "pending").length,
    "En retard": invWithStatus.filter((i) => i._status === "overdue").length,
  };

  const filteredInvoices = invWithStatus
    .filter((i) => {
      if (invFilter === "Payées") return i._status === "paid";
      if (invFilter === "En attente") return i._status === "pending";
      if (invFilter === "En retard") return i._status === "overdue";
      return true;
    })
    .filter((i) => {
      if (!invSearch) return true;
      const q = invSearch.toLowerCase();
      return (
        i.invoice_number?.toLowerCase().includes(q) ||
        i.name?.toLowerCase().includes(q) ||
        i.label?.toLowerCase().includes(q)
      );
    });

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {/* header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold">Trésorerie</h1>
            <p className="text-sm text-zinc-400 mt-1">Flux financiers et factures</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowEntryModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-400/30 text-cyan-300 text-sm font-medium transition active:scale-95">
              <Plus className="size-4" /> Entrée
            </button>
            <button onClick={() => setInvoiceModal({})}
              className="flex items-center gap-2 px-4 py-2.5 glass rounded-xl text-sm font-medium transition active:scale-95">
              <FileText className="size-4" /> Facture
            </button>
          </div>
        </div>

        {/* HERO BALANCE */}
        <div className={`rounded-2xl p-6 mb-5 border relative overflow-hidden ${
          balance > 0
            ? "bg-emerald-500/5 border-emerald-400/20"
            : balance < 0
            ? "bg-red-500/5 border-red-400/20"
            : "glass border-white/10"
        }`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,255,135,0.05),transparent_60%)]" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="size-5 text-zinc-400" />
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">Solde de trésorerie</span>
            </div>
            <div className={`font-mono font-bold text-4xl tracking-tight mb-3 ${
              balance > 0 ? "text-emerald-400" : balance < 0 ? "text-red-400" : "text-zinc-300"
            }`}>
              {balance >= 0 ? "+" : ""}{nfmt(balance)}
            </div>
            {/* sparkline */}
            {sparkData.length > 1 && (
              <div className="h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                    <Line
                      type="monotone"
                      dataKey="y"
                      stroke={balance >= 0 ? "#00FF87" : "#FF6B6B"}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* metric row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="glass rounded-2xl p-4 text-center">
            <TrendingUp className="size-4 text-emerald-400 mx-auto mb-1.5" />
            <div className="text-xs text-zinc-500 mb-1">Entrées</div>
            <div className="text-sm font-mono font-bold text-emerald-400">{summary ? nfmt(summary.total_income) : "—"}</div>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <TrendingDown className="size-4 text-red-400 mx-auto mb-1.5" />
            <div className="text-xs text-zinc-500 mb-1">Sorties</div>
            <div className="text-sm font-mono font-bold text-red-400">{summary ? nfmt(summary.total_expense) : "—"}</div>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <AlertTriangle className="size-4 text-orange-400 mx-auto mb-1.5" />
            <div className="text-xs text-zinc-500 mb-1">En retard</div>
            <div className="text-sm font-mono font-bold text-orange-400">{statusCount["En retard"]}</div>
          </div>
        </div>

        {/* bar chart */}
        {chartData.length > 0 && (
          <div className="glass rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Entrées / Sorties</div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-cyan-400" /> Entrées</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-400" /> Sorties</span>
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={36} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, fontSize: 11 }}
                    formatter={(v) => [`${v.toLocaleString("fr-DZ")} DA`]}
                  />
                  <Bar dataKey="Entrées" fill="#00C3FF" radius={[4, 4, 0, 0]} opacity={0.85} />
                  <Bar dataKey="Sorties" fill="#FF6B6B" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-2 mb-4">
          {["overview", "invoices"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                tab === t
                  ? "bg-cyan-400/10 text-cyan-300 border border-cyan-400/30"
                  : "text-zinc-400 hover:text-white glass border border-transparent"
              }`}>
              {t === "overview" ? "Mouvements" : `Factures${statusCount["En retard"] > 0 ? ` (${statusCount["En retard"]} 🔴)` : ""}`}
            </button>
          ))}
        </div>

        {/* ── MOVEMENTS ── */}
        {tab === "overview" && (
          <div className="glass rounded-2xl overflow-hidden">
            {entries.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">
                <Wallet className="size-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucun mouvement enregistré</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className={`size-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
                      e.type === "income" ? "bg-emerald-500/10" : "bg-red-500/10"
                    }`}>
                      {e.type === "income" ? "💚" : "🔴"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{e.label}</div>
                      <div className="text-xs text-zinc-500">{e.date}{e.category ? ` · ${e.category}` : ""}</div>
                    </div>
                    <div className={`text-sm font-mono font-bold shrink-0 ${e.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                      {e.type === "income" ? "+" : "−"}{nfmt(e.amount)}
                    </div>
                    <button onClick={() => deleteEntry(e.id)}
                      className="size-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-400/10 hover:text-red-400 transition active:scale-90">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── INVOICES ── */}
        {tab === "invoices" && (
          <div>
            {/* search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
              <input
                type="text"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Rechercher N° facture, client, libellé…"
                className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-cyan-400/50 transition"
              />
            </div>

            {/* status filter chips */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
              {["Toutes", "Payées", "En attente", "En retard"].map((f) => {
                const count = f === "Toutes" ? invoices.length : statusCount[f] ?? 0;
                return (
                  <button key={f} onClick={() => setInvFilter(f)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                      invFilter === f
                        ? "bg-cyan-400/15 text-cyan-300 border border-cyan-400/40"
                        : "glass text-zinc-400 border border-transparent"
                    }`}>
                    {f} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                  </button>
                );
              })}
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="glass rounded-2xl py-12 text-center text-zinc-500">
                <FileText className="size-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucune facture{invFilter !== "Toutes" ? ` "${invFilter}"` : ""}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map((inv) => {
                  const st = STATUS_META[inv._status];
                  const due = inv.due_date || inv.date;
                  const daysAgo = due ? daysDiff(due) : null;
                  return (
                    <motion.div key={inv.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className="glass rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="font-mono text-sm font-bold text-cyan-400">{inv.invoice_number}</span>
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-lg ${st.bg}`}>{st.label}</span>
                        </div>
                        <div className="text-sm font-mono font-bold text-white shrink-0">{nfmt(inv.amount)}</div>
                      </div>
                      <div className="text-sm font-medium">👤 {inv.name}</div>
                      <div className="text-xs text-zinc-500 mt-1 truncate">📝 {inv.label}</div>
                      {due && (
                        <div className="text-xs text-zinc-500 mt-1">
                          📅 Échéance: {due}
                          {daysAgo !== null && daysAgo > 0 && inv._status !== "paid" && (
                            <span className="text-red-400 ml-2">il y a {daysAgo} j</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        {inv._status !== "paid" && (
                          <button onClick={() => markPaid(inv)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-medium hover:bg-emerald-400/20 transition active:scale-95">
                            <Check className="size-3" /> Marquer payée
                          </button>
                        )}
                        <button onClick={() => setInvoiceModal(inv)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs font-medium transition active:scale-95">
                          <Pencil className="size-3" /> Modifier
                        </button>
                        <button onClick={() => deleteInvoice(inv.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition active:scale-95 ml-auto">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {showEntryModal && <EntryModal onClose={() => setShowEntryModal(false)} onSaved={loadAll} />}
      {invoiceModal !== null && (
        <InvoiceModal
          invoice={invoiceModal?.id ? invoiceModal : null}
          invoices={invoices}
          onClose={() => setInvoiceModal(null)}
          onSaved={loadAll}
        />
      )}
    </AppLayout>
  );
}
