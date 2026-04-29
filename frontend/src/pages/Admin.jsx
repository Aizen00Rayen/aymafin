import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import api, { formatApiError } from "../lib/api";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../contexts/AuthContext";
import {
  Users, Building2, FileText, MessageSquare, Trash2, Crown, UserCheck,
  Sparkles, Search, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Archive,
  ShieldAlert, ChevronRight,
} from "lucide-react";
import { Navigate } from "react-router-dom";

function nfmt(n) {
  const abs = Math.abs(n || 0);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}

const ROLE_META = {
  admin: { dot: "#fbbf24", label: "Admin" },
  user: { dot: "#60a5fa", label: "User" },
};

export default function Admin() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [confirmTarget, setConfirmTarget] = useState(null);

  const load = async () => {
    setBusy(true);
    try {
      const [s, u] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/users", { params: { include_deleted: showDeleted } }),
      ]);
      setStats(s.data);
      setUsers(u.data);
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showDeleted]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = users;
    if (q) {
      arr = arr.filter((u) =>
        (u.email || "").toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q) ||
        (u.business?.name || "").toLowerCase().includes(q),
      );
    }
    const dirMul = sort.dir === "asc" ? 1 : -1;
    const getter = (u) => {
      switch (sort.key) {
        case "email": return (u.email || "").toLowerCase();
        case "name": return (u.name || "").toLowerCase();
        case "revenue": return u.business?.revenue_monthly ?? -1;
        case "reports": return u.reports_count ?? 0;
        case "created_at":
        default: return u.created_at || "";
      }
    };
    return [...arr].sort((a, b) => {
      const va = getter(a); const vb = getter(b);
      if (va < vb) return -1 * dirMul;
      if (va > vb) return 1 * dirMul;
      return 0;
    });
  }, [users, search, sort]);

  if (user && user.role !== "admin") return <Navigate to="/dashboard" replace />;

  const toggleSort = (key) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  const onDelete = async (target) => {
    setConfirmTarget(null);
    try {
      await api.delete(`/admin/users/${target.id}`);
      await load();
    } catch (e) {
      alert(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const onRestore = async (target) => {
    try {
      await api.post(`/admin/users/${target.id}/restore`);
      await load();
    } catch (e) {
      alert(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const SortIcon = ({ k }) => {
    if (sort.key !== k) return <ArrowUpDown className="size-3 opacity-40" />;
    return sort.dir === "asc" ? <ArrowUp className="size-3 text-blue-400" /> : <ArrowDown className="size-3 text-blue-400" />;
  };

  return (
    <AppLayout>
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4" data-testid="admin-page">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-300 text-[10px] font-mono uppercase tracking-[0.22em] mb-3 border border-yellow-500/20">
            <Crown className="size-3" /> Admin Console
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">{t("admin.title")}</h1>
          <p className="mt-2 text-zinc-400 max-w-xl">{t("admin.subtitle")}</p>
        </div>
        <button onClick={load} disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 text-zinc-300 text-sm transition border border-white/5"
          data-testid="admin-refresh">
          <Sparkles className={`size-4 ${busy ? "animate-pulse text-blue-400" : ""}`} /> Refresh
        </button>
      </div>

      {err && <div className="glass-strong rounded-2xl p-6 mb-4 text-red-400 text-sm" data-testid="admin-error">{err}</div>}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6" data-testid="admin-stats">
        <Stat label={t("admin.statsUsers")} value={stats?.total_users} icon={Users} accent="from-blue-500/20 to-blue-500/0" iconColor="text-blue-400" testid="stat-users" />
        <Stat label={t("admin.statsOnboarded")} value={stats?.onboarded_users} icon={UserCheck} accent="from-green-500/20 to-green-500/0" iconColor="text-green-400" testid="stat-onboarded" />
        <Stat label={t("admin.statsBusinesses")} value={stats?.total_businesses} icon={Building2} accent="from-purple-500/20 to-purple-500/0" iconColor="text-purple-400" testid="stat-businesses" />
        <Stat label={t("admin.statsReports")} value={stats?.total_reports} icon={FileText} accent="from-orange-500/20 to-orange-500/0" iconColor="text-orange-400" testid="stat-reports" />
        <Stat label={t("admin.statsChats")} value={stats?.total_chats} icon={MessageSquare} accent="from-cyan-500/20 to-cyan-500/0" iconColor="text-cyan-400" testid="stat-chats" />
        <Stat label={t("admin.stats7d")} value={stats?.new_users_7d} icon={Sparkles} accent="from-yellow-500/20 to-yellow-500/0" iconColor="text-yellow-400" testid="stat-new7d" trend={stats?.new_users_7d > 0 ? "up" : null} />
      </div>

      {/* Toolbar */}
      <div className="glass rounded-2xl p-3 mb-4 flex items-center gap-3 flex-wrap" data-testid="admin-toolbar">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.thEmail") + " / " + t("admin.thName") + " / " + t("admin.thBusiness")}
            className="w-full ps-10 pe-3 py-2 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 outline-none transition text-sm"
            data-testid="admin-search" />
        </div>
        <button onClick={() => setShowDeleted((v) => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition border ${
            showDeleted ? "bg-red-500/10 text-red-300 border-red-500/30" : "bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border-white/5"
          }`}
          data-testid="admin-toggle-deleted">
          <Archive className="size-4" />
          {showDeleted ? `Showing deleted (${stats?.deleted_users ?? 0})` : `Show deleted (${stats?.deleted_users ?? 0})`}
        </button>
        <div className="text-xs text-zinc-500 font-mono uppercase tracking-[0.18em] px-2" data-testid="admin-count-display">
          {filtered.length} / {users.length}
        </div>
      </div>

      {/* Users table */}
      <div className="glass rounded-2xl overflow-hidden" data-testid="admin-users-table">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-zinc-500">
            <Users className="size-10 mx-auto mb-3 text-zinc-700" />
            <div>{search ? "No matches" : t("admin.empty")}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-950/80 backdrop-blur-md z-10">
                <tr className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                  <Th onClick={() => toggleSort("name")}><span className="flex items-center gap-1">{t("admin.thName")}<SortIcon k="name" /></span></Th>
                  <Th onClick={() => toggleSort("email")}><span className="flex items-center gap-1">{t("admin.thEmail")}<SortIcon k="email" /></span></Th>
                  <Th>{t("admin.thRole")}</Th>
                  <Th>{t("admin.thBusiness")}</Th>
                  <Th align="end" onClick={() => toggleSort("revenue")}><span className="flex items-center justify-end gap-1">{t("admin.thRevenue")}<SortIcon k="revenue" /></span></Th>
                  <Th align="end" onClick={() => toggleSort("reports")}><span className="flex items-center justify-end gap-1">{t("admin.thReports")}<SortIcon k="reports" /></span></Th>
                  <Th onClick={() => toggleSort("created_at")}><span className="flex items-center gap-1">{t("admin.thCreated")}<SortIcon k="created_at" /></span></Th>
                  <Th align="end">{t("admin.thActions")}</Th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((u, i) => {
                    const meta = ROLE_META[u.role] || ROLE_META.user;
                    const initials = (u.name || u.email || "?").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
                    const deleted = !!u.deleted_at;
                    const isSelf = u.id === user?.id;
                    return (
                      <motion.tr key={u.id}
                        layout
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(i * 0.015, 0.3) }}
                        className={`border-t border-white/5 transition group ${deleted ? "opacity-50" : "hover:bg-white/[0.025]"}`}
                        data-testid={`admin-user-row-${u.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg grid place-items-center text-xs font-mono font-bold shrink-0"
                                 style={{ background: `${meta.dot}25`, color: meta.dot }}>
                              {initials}
                            </div>
                            <span className="text-white font-medium">{u.name || "—"}</span>
                            {isSelf && <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">(you)</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 font-mono text-xs">
                          <span className={deleted ? "line-through" : ""}>{u.email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-[0.15em] border"
                                style={{ background: `${meta.dot}15`, color: meta.dot, borderColor: `${meta.dot}40` }}>
                            {u.role === "admin" && <Crown className="size-3" />}
                            {meta.label}
                          </span>
                          {!u.onboarded && !deleted && (
                            <span className="ms-2 text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">pending</span>
                          )}
                          {deleted && (
                            <span className="ms-2 text-[10px] font-mono uppercase tracking-[0.15em] text-red-400">deleted</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">
                          {u.business ? (
                            <div className="flex flex-col">
                              <span className="text-white truncate max-w-[200px]">{u.business.name}</span>
                              <span className="text-xs text-zinc-500">{u.business.type} · {u.business.country}</span>
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-white">
                          {u.business
                            ? <>{nfmt(u.business.revenue_monthly)} <span className="text-zinc-500 text-xs">{u.business.currency}</span></>
                            : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-end font-mono text-zinc-300">{u.reports_count}</td>
                        <td className="px-4 py-3 text-xs text-zinc-500 font-mono whitespace-nowrap">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString(i18n.language) : "—"}
                        </td>
                        <td className="px-4 py-3 text-end whitespace-nowrap">
                          {deleted ? (
                            <button onClick={() => onRestore(u)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs transition"
                              data-testid={`admin-restore-${u.id}`}>
                              <RotateCcw className="size-3.5" /> Restore
                            </button>
                          ) : (
                            <button onClick={() => setConfirmTarget(u)}
                              disabled={isSelf}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/15 disabled:opacity-30 disabled:cursor-not-allowed text-red-400 text-xs transition opacity-0 group-hover:opacity-100"
                              data-testid={`admin-delete-${u.id}`}>
                              <Trash2 className="size-3.5" /> {t("admin.delete")}
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {confirmTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setConfirmTarget(null)}>
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong rounded-3xl p-7 max-w-md w-full"
              data-testid="admin-delete-modal">
              <div className="size-12 rounded-2xl bg-red-500/15 text-red-400 grid place-items-center mb-4">
                <ShieldAlert className="size-6" />
              </div>
              <h3 className="font-display font-bold text-xl tracking-tight">{t("admin.confirmDelete")}</h3>
              <div className="mt-3 text-sm text-zinc-400">
                <div className="font-mono text-white">{confirmTarget.email}</div>
                <div className="text-xs mt-1">{confirmTarget.name} · {confirmTarget.reports_count} reports · {confirmTarget.chats_count} chats</div>
              </div>
              <div className="mt-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs flex items-start gap-2">
                <ChevronRight className="size-3.5 shrink-0 mt-0.5" />
                Soft delete — user data is archived and can be restored from the deleted list.
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button onClick={() => setConfirmTarget(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm transition"
                  data-testid="admin-delete-cancel">
                  {t("common.cancel")}
                </button>
                <button onClick={() => onDelete(confirmTarget)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition shadow-[0_0_25px_rgba(239,68,68,0.4)]"
                  data-testid="admin-delete-confirm">
                  <Trash2 className="size-4" /> {t("admin.delete")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}

function Th({ children, onClick, align = "start" }) {
  const cls = `px-4 py-3 font-normal cursor-${onClick ? "pointer" : "default"} hover:text-zinc-300 transition text-${align === "end" ? "end" : "start"}`;
  return (
    <th className={cls} onClick={onClick}>{children}</th>
  );
}

function Stat({ label, value, icon: Icon, accent = "from-blue-500/20 to-blue-500/0", iconColor = "text-blue-400", testid, trend }) {
  return (
    <div className="relative glass rounded-2xl p-4 overflow-hidden hover:-translate-y-0.5 transition" data-testid={testid}>
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-50 pointer-events-none`} />
      <div className="relative flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
        <span>{label}</span>
        <Icon className={`size-4 ${iconColor}`} />
      </div>
      <div className="relative mt-2 flex items-baseline gap-2">
        <div className="font-mono font-bold text-2xl tracking-tighter">{value ?? "—"}</div>
        {trend === "up" && <span className="text-[10px] font-mono text-green-400">↑</span>}
      </div>
    </div>
  );
}
