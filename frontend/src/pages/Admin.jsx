import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import api, { formatApiError } from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../contexts/AuthContext";
import { Users, Building2, FileText, MessageSquare, Trash2, Crown, UserCheck, Sparkles } from "lucide-react";
import { Navigate } from "react-router-dom";

function nfmt(n) {
  const abs = Math.abs(n || 0);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}

const RISK_DOTS = { admin: "#fbbf24", user: "#60a5fa" };

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [s, u] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/users"),
      ]);
      setStats(s.data);
      setUsers(u.data);
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (user && user.role !== "admin") return <Navigate to="/dashboard" replace />;

  const onDelete = async (target) => {
    if (target.id === user.id) {
      alert(t("admin.deleteSelf"));
      return;
    }
    if (!window.confirm(t("admin.confirmDelete") + "\n\n" + target.email)) return;
    try {
      await api.delete(`/admin/users/${target.id}`);
      await load();
    } catch (e) {
      alert(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  return (
    <AppLayout>
      <div className="mb-8" data-testid="admin-page">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-xs font-mono uppercase tracking-[0.2em] mb-3">
          <Crown className="size-3.5" /> Admin
        </div>
        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">{t("admin.title")}</h1>
        <p className="mt-2 text-zinc-400">{t("admin.subtitle")}</p>
      </div>

      {err && <div className="glass-strong rounded-2xl p-6 text-red-400 text-sm" data-testid="admin-error">{err}</div>}

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6" data-testid="admin-stats">
        <Stat label={t("admin.statsUsers")} value={stats?.total_users ?? "—"} icon={Users} accent="text-blue-400" />
        <Stat label={t("admin.statsOnboarded")} value={stats?.onboarded_users ?? "—"} icon={UserCheck} accent="text-green-400" />
        <Stat label={t("admin.statsBusinesses")} value={stats?.total_businesses ?? "—"} icon={Building2} accent="text-purple-400" />
        <Stat label={t("admin.statsReports")} value={stats?.total_reports ?? "—"} icon={FileText} accent="text-orange-400" />
        <Stat label={t("admin.statsChats")} value={stats?.total_chats ?? "—"} icon={MessageSquare} accent="text-cyan-400" />
        <Stat label={t("admin.stats7d")} value={stats?.new_users_7d ?? "—"} icon={Sparkles} accent="text-yellow-400" />
      </div>

      {/* Users table */}
      <div className="glass rounded-2xl overflow-hidden" data-testid="admin-users-table">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">{t("admin.users")} · {users.length}</div>
          {busy && <div className="size-4 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />}
        </div>
        {users.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">{t("admin.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 bg-white/[0.02]">
                  <th className="text-start px-4 py-3 font-normal">{t("admin.thName")}</th>
                  <th className="text-start px-4 py-3 font-normal">{t("admin.thEmail")}</th>
                  <th className="text-start px-4 py-3 font-normal">{t("admin.thRole")}</th>
                  <th className="text-start px-4 py-3 font-normal">{t("admin.thBusiness")}</th>
                  <th className="text-end px-4 py-3 font-normal">{t("admin.thRevenue")}</th>
                  <th className="text-end px-4 py-3 font-normal">{t("admin.thReports")}</th>
                  <th className="text-start px-4 py-3 font-normal">{t("admin.thCreated")}</th>
                  <th className="text-end px-4 py-3 font-normal">{t("admin.thActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <motion.tr key={u.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="border-t border-white/5 hover:bg-white/[0.03] transition"
                    data-testid={`admin-user-row-${u.id}`}>
                    <td className="px-4 py-3 text-white">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono uppercase tracking-[0.15em]"
                            style={{ background: `${RISK_DOTS[u.role] || "#999"}20`, color: RISK_DOTS[u.role] || "#999" }}>
                        {u.role === "admin" && <Crown className="size-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {u.business ? (
                        <div className="flex flex-col">
                          <span className="text-white truncate max-w-xs">{u.business.name}</span>
                          <span className="text-xs text-zinc-500">{u.business.type} · {u.business.country}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs italic">no onboarding</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-white">
                      {u.business ? `${nfmt(u.business.revenue_monthly)} ${u.business.currency}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-zinc-300">{u.reports_count}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500 font-mono">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button onClick={() => onDelete(u)}
                        disabled={u.id === user?.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed text-red-400 text-xs transition"
                        data-testid={`admin-delete-${u.id}`}>
                        <Trash2 className="size-3.5" />
                        {t("admin.delete")}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
        <span>{label}</span>
        <Icon className={`size-4 ${accent}`} />
      </div>
      <div className="mt-2 font-mono font-bold text-2xl tracking-tighter">{value}</div>
    </div>
  );
}
