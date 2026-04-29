import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { FileText, Download, Plus, Sparkles, Building2 } from "lucide-react";

const BANK_DOTS = {
  generic: "#2563eb", bna: "#0e7c3a", bea: "#1e3a8a", cpa: "#7c2d12", badr: "#15803d",
};

export default function Reports() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bank, setBank] = useState("generic");
  const [downloadingId, setDownloadingId] = useState(null);

  const banks = ["generic", "bna", "bea", "cpa", "badr"];

  const load = () => api.get("/reports").then((r) => setItems(r.data)).catch(() => {});

  useEffect(() => { load(); }, []);

  const generate = async () => {
    setLoading(true);
    try {
      await api.post("/reports");
      await load();
    } finally {
      setLoading(false);
    }
  };

  const download = async (id) => {
    setDownloadingId(id);
    try {
      const res = await api.get(`/reports/${id}/pdf`, {
        responseType: "blob",
        params: { bank, lang: i18n.language || "en" },
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `aymafin-${bank}-${id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4" data-testid="reports-page">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">{t("reports.title")}</h1>
          <p className="mt-2 text-zinc-400">{t("reports.subtitle")}</p>
        </div>
        <button onClick={generate} disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-60 text-white font-medium transition shadow-[0_0_20px_rgba(34,197,94,0.35)]"
          data-testid="reports-generate">
          {loading ? <Sparkles className="size-4 animate-pulse" /> : <Plus className="size-4" />}
          {t("reports.generate")}
        </button>
      </div>

      {/* Bank selector */}
      <div className="glass rounded-2xl p-5 mb-5" data-testid="bank-selector">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">
          <Building2 className="size-4" />
          {t("reports.chooseBank")}
        </div>
        <div className="flex flex-wrap gap-2">
          {banks.map((b) => (
            <button key={b} onClick={() => setBank(b)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition border ${
                bank === b
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/5 border-white/5"
              }`}
              style={bank === b ? { boxShadow: `0 0 20px ${BANK_DOTS[b]}50` } : {}}
              data-testid={`bank-option-${b}`}>
              <span className="size-2 rounded-full" style={{ background: BANK_DOTS[b] }} />
              {t(`banks.${b}`)}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="glass-strong rounded-2xl p-16 text-center" data-testid="reports-empty">
          <FileText className="size-10 mx-auto text-zinc-600" />
          <div className="mt-4 text-zinc-400">{t("reports.empty")}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-5 flex items-center justify-between gap-4 hover:bg-white/[0.06] transition" data-testid={`report-row-${r.id}`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="size-12 rounded-xl grid place-items-center shrink-0"
                     style={{ background: `${BANK_DOTS[bank]}25`, color: BANK_DOTS[bank] }}>
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-white truncate">{r.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    <span className="font-mono">{r.id.slice(0, 8)}</span> · {t("reports.created")} {new Date(r.created_at).toLocaleString()} · {t(`banks.${bank}`).split(" ")[0]}
                  </div>
                </div>
              </div>
              <button onClick={() => download(r.id)} disabled={downloadingId === r.id}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white text-sm transition"
                data-testid={`report-download-${r.id}`}>
                <Download className="size-4" /> {downloadingId === r.id ? t("reports.downloading") : t("reports.download")}
              </button>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
