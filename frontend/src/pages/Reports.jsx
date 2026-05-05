import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, Calendar, TrendingUp, TrendingDown, BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";

const fade = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

function nfmt(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + " M DA";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + " K DA";
  return n.toLocaleString("fr-DZ") + " DA";
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getDateRangeLabel(type, value) {
  if (!value) return "";
  if (type === "day") {
    const d = new Date(value + "T00:00:00");
    return d.toLocaleDateString("fr-DZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  if (type === "month") {
    const [y, m] = value.split("-");
    return new Date(+y, +m - 1).toLocaleDateString("fr-DZ", { month: "long", year: "numeric" });
  }
  if (type === "year") return `Année ${value}`;
  return value;
}

// ── PDF generation (client-side, no external server) ──────────────────────────
async function generatePDF(reportData, periodLabel) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  let y = 0;

  const col = { cyan: [0, 195, 255], green: [34, 197, 94], red: [239, 68, 68], dark: [15, 15, 20], gray: [100, 116, 139], light: [226, 232, 240], white: [255, 255, 255], bg: [9, 9, 11] };

  // Header background
  doc.setFillColor(...col.bg);
  doc.rect(0, 0, W, 297, "F");

  // Logo area & title
  doc.setFillColor(0, 195, 255, 0.1);
  doc.rect(0, 0, W, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...col.cyan);
  doc.text("AYMAFIN", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(...col.gray);
  doc.text("Rapport financier", 14, 26);
  doc.setFontSize(12);
  doc.setTextColor(...col.white);
  doc.text(periodLabel, W - 14, 18, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(...col.gray);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-DZ")}`, W - 14, 26, { align: "right" });

  // Divider
  doc.setDrawColor(...col.cyan);
  doc.setLineWidth(0.5);
  doc.line(14, 38, W - 14, 38);
  y = 50;

  // ── KPI summary cards ──────────────────────────────────────────────────────
  const cards = [
    { label: "Produits (CA)", value: nfmt(reportData.total_produits), color: col.green },
    { label: "Charges totales", value: nfmt(reportData.total_charges), color: col.red },
    { label: "Résultat net", value: nfmt(reportData.resultat_net), color: reportData.resultat_net >= 0 ? col.green : col.red },
    { label: "Nb. écritures", value: String(reportData.entries?.length ?? 0), color: col.cyan },
  ];

  const cardW = (W - 28 - 9) / 4;
  cards.forEach((c, i) => {
    const x = 14 + i * (cardW + 3);
    doc.setFillColor(30, 30, 35);
    doc.roundedRect(x, y, cardW, 22, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(...col.gray);
    doc.text(c.label, x + 4, y + 7);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...c.color);
    doc.text(c.value, x + 4, y + 16, { maxWidth: cardW - 6 });
    doc.setFont("helvetica", "normal");
  });

  y += 32;

  // ── Charges breakdown ──────────────────────────────────────────────────────
  const drawTable = (title, rows, headerColor) => {
    if (y > 240) { doc.addPage(); doc.setFillColor(...col.bg); doc.rect(0, 0, W, 297, "F"); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...headerColor);
    doc.text(title, 14, y);
    y += 6;

    // Table header
    doc.setFillColor(30, 30, 35);
    doc.rect(14, y, W - 28, 7, "F");
    doc.setFontSize(7);
    doc.setTextColor(...col.gray);
    doc.text("Classe / Compte", 17, y + 5);
    doc.text("Montant", W - 17, y + 5, { align: "right" });
    y += 9;

    doc.setFont("helvetica", "normal");
    for (const row of rows) {
      if (y > 270) { doc.addPage(); doc.setFillColor(...col.bg); doc.rect(0, 0, W, 297, "F"); y = 20; }
      if (row.isClass) {
        doc.setFillColor(20, 30, 45);
        doc.rect(14, y - 3, W - 28, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...col.white);
        doc.text(`${row.code} — ${row.name}`, 17, y + 2);
        doc.setTextColor(...headerColor);
        doc.text(nfmt(row.amount), W - 17, y + 2, { align: "right" });
        doc.setFont("helvetica", "normal");
      } else {
        doc.setFontSize(7.5);
        doc.setTextColor(...col.gray);
        doc.text(`  ${row.code}  ${row.name}`, 20, y + 2, { maxWidth: W - 60 });
        doc.setTextColor(...col.light);
        doc.text(nfmt(row.amount), W - 17, y + 2, { align: "right" });
      }
      doc.setDrawColor(40, 40, 50);
      doc.setLineWidth(0.2);
      doc.line(14, y + 4, W - 14, y + 4);
      y += 7;
    }

    // Subtotal
    doc.setFillColor(30, 40, 55);
    doc.rect(14, y, W - 28, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...col.white);
    doc.text("TOTAL", 17, y + 5.5);
    doc.setTextColor(...headerColor);
    doc.text(nfmt(rows.filter(r => r.isClass).reduce((s, r) => s + (r.amount || 0), 0)), W - 17, y + 5.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 14;
  };

  // Build charge rows
  const chargeRows = [];
  for (const cls of (reportData.charges_detail || [])) {
    if (cls.subtotal === 0) continue;
    chargeRows.push({ isClass: true, code: cls.class, name: cls.name, amount: cls.subtotal });
    for (const acc of (cls.accounts || [])) {
      chargeRows.push({ isClass: false, code: acc.code, name: acc.name, amount: acc.amount });
    }
  }
  if (chargeRows.length) drawTable("CHARGES", chargeRows, col.red);

  // Build produit rows
  const produitRows = [];
  for (const cls of (reportData.produits_detail || [])) {
    if (cls.subtotal === 0) continue;
    produitRows.push({ isClass: true, code: cls.class, name: cls.name, amount: cls.subtotal });
    for (const acc of (cls.accounts || [])) {
      produitRows.push({ isClass: false, code: acc.code, name: acc.name, amount: acc.amount });
    }
  }
  if (produitRows.length) drawTable("PRODUITS", produitRows, col.green);

  // ── Résultat net ──────────────────────────────────────────────────────────
  if (y > 255) { doc.addPage(); doc.setFillColor(...col.bg); doc.rect(0, 0, W, 297, "F"); y = 20; }
  const rnColor = reportData.resultat_net >= 0 ? col.green : col.red;
  doc.setFillColor(20, 40, 25);
  doc.roundedRect(14, y, W - 28, 16, 2, 2, "F");
  doc.setDrawColor(...rnColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, W - 28, 16, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...col.white);
  doc.text("RÉSULTAT NET", 20, y + 10);
  doc.setTextColor(...rnColor);
  doc.text(nfmt(reportData.resultat_net), W - 20, y + 10, { align: "right" });
  y += 22;

  // ── Recent entries list (up to 20) ────────────────────────────────────────
  const entries = (reportData.entries || []).slice(0, 20);
  if (entries.length > 0) {
    if (y > 220) { doc.addPage(); doc.setFillColor(...col.bg); doc.rect(0, 0, W, 297, "F"); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...col.cyan);
    doc.text("DÉTAIL DES ÉCRITURES (20 dernières)", 14, y);
    y += 8;
    doc.setFillColor(30, 30, 35);
    doc.rect(14, y, W - 28, 7, "F");
    doc.setFontSize(7);
    doc.setTextColor(...col.gray);
    doc.text("Date", 17, y + 5);
    doc.text("Compte", 45, y + 5);
    doc.text("Libellé", 75, y + 5);
    doc.text("Montant", W - 17, y + 5, { align: "right" });
    y += 9;
    doc.setFont("helvetica", "normal");
    for (const e of entries) {
      if (y > 275) break;
      doc.setFontSize(7);
      doc.setTextColor(...col.gray);
      doc.text(e.date?.slice(0, 10) ?? "", 17, y + 2);
      doc.text(e.account_code ?? "", 45, y + 2);
      doc.setTextColor(...col.light);
      doc.text((e.account_label ?? e.comment ?? "").slice(0, 35), 75, y + 2);
      doc.setTextColor(e.entry_type === "produit" ? col.green[0] : col.red[0],
                       e.entry_type === "produit" ? col.green[1] : col.red[1],
                       e.entry_type === "produit" ? col.green[2] : col.red[2]);
      doc.text(nfmt(e.amount), W - 17, y + 2, { align: "right" });
      doc.setDrawColor(40, 40, 50);
      doc.line(14, y + 4, W - 14, y + 4);
      y += 6;
    }
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...col.gray);
    doc.text(`AYMAFIN — Rapport financier — Page ${i}/${pageCount}`, W / 2, 292, { align: "center" });
  }

  return doc;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [periodType, setPeriodType] = useState("month"); // day | month | year
  const [periodValue, setPeriodValue] = useState(getCurrentPeriod());
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // When type changes, reset value to a sensible default
  const handleTypeChange = (t) => {
    setPeriodType(t);
    setReportData(null);
    const now = new Date();
    if (t === "day") setPeriodValue(now.toISOString().slice(0, 10));
    else if (t === "month") setPeriodValue(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    else setPeriodValue(String(now.getFullYear()));
  };

  const load = useCallback(async () => {
    if (!periodValue) return;
    setLoading(true);
    setReportData(null);
    try {
      let period = periodValue;
      // For day/year, we query by the month portion or all entries and filter client-side
      if (periodType === "day") {
        period = periodValue.slice(0, 7); // fetch whole month, filter below
      } else if (periodType === "year") {
        // fetch all months of that year by aggregating
        const year = periodValue;
        const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
        const results = await Promise.all(months.map(m =>
          api.get(`/accounting/tcr?period=${m}`).then(r => r.data).catch(() => null)
        ));
        const valid = results.filter(Boolean);
        if (!valid.length) { setReportData(null); setLoading(false); return; }
        // Merge all entries
        const allEntries = await Promise.all(months.map(m =>
          api.get(`/accounting/entries?period=${m}`).then(r => r.data).catch(() => [])
        ));
        const merged = allEntries.flat();
        // Aggregate charges and produits detail
        const chargesMap = {};
        const produitsMap = {};
        let tc = 0, tp = 0;
        for (const d of valid) {
          tc += d.total_charges || 0;
          tp += d.total_produits || 0;
          for (const cls of (d.charges_detail || [])) {
            if (!chargesMap[cls.class]) chargesMap[cls.class] = { ...cls, subtotal: 0, accounts: {} };
            chargesMap[cls.class].subtotal += cls.subtotal;
            for (const acc of (cls.accounts || [])) {
              if (!chargesMap[cls.class].accounts[acc.code]) chargesMap[cls.class].accounts[acc.code] = { ...acc, amount: 0 };
              chargesMap[cls.class].accounts[acc.code].amount += acc.amount;
            }
          }
          for (const cls of (d.produits_detail || [])) {
            if (!produitsMap[cls.class]) produitsMap[cls.class] = { ...cls, subtotal: 0, accounts: {} };
            produitsMap[cls.class].subtotal += cls.subtotal;
            for (const acc of (cls.accounts || [])) {
              if (!produitsMap[cls.class].accounts[acc.code]) produitsMap[cls.class].accounts[acc.code] = { ...acc, amount: 0 };
              produitsMap[cls.class].accounts[acc.code].amount += acc.amount;
            }
          }
        }
        const toArr = (map) => Object.values(map).map(cls => ({ ...cls, accounts: Object.values(cls.accounts) }));
        setReportData({
          total_charges: Math.round(tc * 100) / 100,
          total_produits: Math.round(tp * 100) / 100,
          resultat_net: Math.round((tp - tc) * 100) / 100,
          charges_detail: toArr(chargesMap),
          produits_detail: toArr(produitsMap),
          entries: merged,
        });
        setLoading(false);
        return;
      }

      const [tcrRes, entriesRes] = await Promise.all([
        api.get(`/accounting/tcr?period=${period}`),
        api.get(`/accounting/entries?period=${period}`),
      ]);
      let entries = entriesRes.data || [];
      if (periodType === "day") {
        entries = entries.filter(e => e.date?.slice(0, 10) === periodValue);
      }
      // Recompute totals for day filter
      let tc2 = tcrRes.data.total_charges, tp2 = tcrRes.data.total_produits;
      if (periodType === "day") {
        tc2 = entries.filter(e => e.entry_type === "charge").reduce((s, e) => s + Number(e.amount), 0);
        tp2 = entries.filter(e => e.entry_type === "produit").reduce((s, e) => s + Number(e.amount), 0);
      }
      setReportData({
        ...tcrRes.data,
        total_charges: Math.round(tc2 * 100) / 100,
        total_produits: Math.round(tp2 * 100) / 100,
        resultat_net: Math.round((tp2 - tc2) * 100) / 100,
        entries,
      });
    } catch (e) {
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  }, [periodType, periodValue]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async () => {
    if (!reportData) return;
    setGenerating(true);
    try {
      const label = getDateRangeLabel(periodType, periodValue);
      const doc = await generatePDF(reportData, label);
      const filename = `aymafin-rapport-${periodValue}.pdf`;
      doc.save(filename);
      toast.success("Rapport PDF généré !");
    } catch (e) {
      toast.error("Erreur lors de la génération du PDF");
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const periodLabel = getDateRangeLabel(periodType, periodValue);
  const hasData = reportData && (reportData.total_charges > 0 || reportData.total_produits > 0);

  return (
    <AppLayout>
      <motion.div initial="hidden" animate="visible" variants={fade} transition={{ duration: 0.4 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="text-3xl font-display font-black tracking-tighter">Rapports</h1>
            <p className="text-sm text-zinc-400 mt-1">Générez un PDF de vos données financières par période</p>
          </div>
          <button
            onClick={handleDownload}
            disabled={!hasData || generating}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            style={{
              background: hasData && !generating ? "linear-gradient(135deg, #00C3FF, #00FF87)" : undefined,
              backgroundColor: (!hasData || generating) ? "#18181b" : undefined,
              color: hasData && !generating ? "#050E1A" : "#64748b",
              boxShadow: hasData && !generating ? "0 0 24px rgba(0,195,255,0.3)" : undefined,
            }}
          >
            {generating
              ? <><RefreshCw className="size-4 animate-spin" /> Génération…</>
              : <><Download className="size-4" /> Télécharger PDF</>
            }
          </button>
        </div>

        {/* Period type selector */}
        <div className="glass rounded-2xl p-5 mb-5">
          <div className="text-xs text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Calendar className="size-4" /> Période du rapport
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            {/* Type chips */}
            <div className="flex gap-2">
              {[
                { id: "day", label: "Jour" },
                { id: "month", label: "Mois" },
                { id: "year", label: "Année" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => handleTypeChange(id)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition border"
                  style={{
                    background: periodType === id ? "rgba(0,195,255,0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: periodType === id ? "rgba(0,195,255,0.4)" : "rgba(255,255,255,0.08)",
                    color: periodType === id ? "#00C3FF" : "#94a3b8",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Date picker */}
            <div className="flex-1 min-w-0">
              {periodType === "day" && (
                <input
                  type="date"
                  value={periodValue}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setPeriodValue(e.target.value)}
                  className="bg-[#18181b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C3FF]/50 w-full sm:w-auto"
                />
              )}
              {periodType === "month" && (
                <input
                  type="month"
                  value={periodValue}
                  onChange={e => setPeriodValue(e.target.value)}
                  className="bg-[#18181b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C3FF]/50 w-full sm:w-auto"
                />
              )}
              {periodType === "year" && (
                <select
                  value={periodValue}
                  onChange={e => setPeriodValue(e.target.value)}
                  className="bg-[#18181b] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C3FF]/50 w-full sm:w-auto"
                >
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}
            </div>

            {periodLabel && (
              <div className="text-xs text-zinc-500 sm:ml-2 capitalize">{periodLabel}</div>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[0,1,2,3].map(i => <div key={i} className="glass rounded-2xl h-20 animate-pulse" />)}
            </div>
            <div className="glass rounded-2xl h-48 animate-pulse" />
          </div>
        )}

        {/* No data state */}
        {!loading && !hasData && (
          <div className="glass rounded-2xl p-16 text-center">
            <FileText className="size-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-400 text-sm">Aucune donnée pour cette période.</p>
            <p className="text-zinc-600 text-xs mt-1">Saisissez vos charges et produits dans "Saisie des données".</p>
          </div>
        )}

        {/* Report preview */}
        <AnimatePresence>
          {hasData && !loading && (
            <motion.div
              key={periodValue}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Produits (CA)", value: reportData.total_produits, icon: TrendingUp, color: "#22c55e" },
                  { label: "Charges", value: reportData.total_charges, icon: TrendingDown, color: "#ef4444" },
                  { label: "Résultat net", value: reportData.resultat_net, icon: BarChart3,
                    color: reportData.resultat_net >= 0 ? "#22c55e" : "#ef4444" },
                  { label: "Écritures", value: reportData.entries?.length ?? 0, icon: FileText, color: "#00C3FF", raw: true },
                ].map(({ label, value, icon: Icon, color, raw }) => (
                  <div key={label} className="glass rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="size-4" style={{ color }} />
                      <span className="text-xs text-zinc-500">{label}</span>
                    </div>
                    <div className="font-mono font-bold text-lg leading-none" style={{ color }}>
                      {raw ? value : nfmt(value)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Charges breakdown */}
              {(reportData.charges_detail || []).some(c => c.subtotal > 0) && (
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-red-500/10 border-b border-white/5 flex justify-between">
                    <h3 className="font-semibold text-red-400 text-sm">CHARGES</h3>
                    <span className="font-mono text-sm text-red-400">{nfmt(reportData.total_charges)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(reportData.charges_detail || []).filter(c => c.subtotal > 0).map(cls => (
                        <React.Fragment key={cls.class}>
                          <tr className="bg-white/3 border-b border-white/5">
                            <td className="px-4 py-2 font-medium text-xs text-zinc-300">
                              <span className="font-mono text-red-400 mr-2">{cls.class}</span>{cls.name}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-bold text-red-400">{nfmt(cls.subtotal)}</td>
                          </tr>
                          {(cls.accounts || []).map(acc => (
                            <tr key={acc.code} className="border-b border-white/5">
                              <td className="px-4 py-1.5 text-zinc-500 text-xs pl-8">
                                <span className="font-mono mr-2">{acc.code}</span>{acc.name}
                              </td>
                              <td className="px-4 py-1.5 text-right font-mono text-xs text-zinc-400">{nfmt(acc.amount)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Produits breakdown */}
              {(reportData.produits_detail || []).some(p => p.subtotal > 0) && (
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-green-500/10 border-b border-white/5 flex justify-between">
                    <h3 className="font-semibold text-green-400 text-sm">PRODUITS</h3>
                    <span className="font-mono text-sm text-green-400">{nfmt(reportData.total_produits)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(reportData.produits_detail || []).filter(p => p.subtotal > 0).map(cls => (
                        <React.Fragment key={cls.class}>
                          <tr className="bg-white/3 border-b border-white/5">
                            <td className="px-4 py-2 font-medium text-xs text-zinc-300">
                              <span className="font-mono text-green-400 mr-2">{cls.class}</span>{cls.name}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-bold text-green-400">{nfmt(cls.subtotal)}</td>
                          </tr>
                          {(cls.accounts || []).map(acc => (
                            <tr key={acc.code} className="border-b border-white/5">
                              <td className="px-4 py-1.5 text-zinc-500 text-xs pl-8">
                                <span className="font-mono mr-2">{acc.code}</span>{acc.name}
                              </td>
                              <td className="px-4 py-1.5 text-right font-mono text-xs text-zinc-400">{nfmt(acc.amount)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Result banner */}
              <div
                className="rounded-2xl px-6 py-5 flex justify-between items-center border"
                style={{
                  background: reportData.resultat_net >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  borderColor: reportData.resultat_net >= 0 ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
                }}
              >
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Résultat net</div>
                  <div className="text-xs text-zinc-400">Produits − Charges</div>
                </div>
                <div
                  className="text-3xl font-mono font-black"
                  style={{ color: reportData.resultat_net >= 0 ? "#22c55e" : "#ef4444" }}
                >
                  {nfmt(reportData.resultat_net)}
                </div>
              </div>

              {/* Recent entries preview */}
              {(reportData.entries || []).length > 0 && (
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/5">
                    <h3 className="text-sm font-semibold text-zinc-300">
                      Écritures ({reportData.entries.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                    {reportData.entries.slice(0, 50).map((e, i) => (
                      <div key={e.id ?? i} className="px-5 py-2.5 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-zinc-600 font-mono shrink-0">{e.date?.slice(0, 10)}</span>
                          <span className="font-mono text-zinc-500 shrink-0">{e.account_code}</span>
                          <span className="text-zinc-400 truncate">{e.account_label || e.comment || "—"}</span>
                        </div>
                        <span
                          className="font-mono font-semibold ml-4 shrink-0"
                          style={{ color: e.entry_type === "produit" ? "#22c55e" : "#ef4444" }}
                        >
                          {e.entry_type === "produit" ? "+" : "-"}{nfmt(e.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AppLayout>
  );
}
