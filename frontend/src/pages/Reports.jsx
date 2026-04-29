import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api, { API } from "../lib/api";
import AppLayout from "../components/AppLayout";
import { FileText, Download, Plus, Sparkles } from "lucide-react";

export default function Reports() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

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
    const res = await api.get(`/reports/${id}/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = `aymafin-report-${id}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
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
                <div className="size-12 rounded-xl bg-[#2563eb]/15 text-blue-400 grid place-items-center shrink-0">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-white truncate">{r.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    <span className="font-mono">{r.id.slice(0, 8)}</span> · {t("reports.created")} {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <button onClick={() => download(r.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm transition"
                data-testid={`report-download-${r.id}`}>
                <Download className="size-4" /> {t("reports.download")}
              </button>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
