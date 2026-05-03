import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, TrendingUp, FileText, MessageSquareText, Settings, LogOut, Shield,
  BookOpen, Wallet, BarChart3, Brain,
} from "lucide-react";
import Navbar from "./Navbar";

const LOGO = "https://customer-assets.emergentagent.com/job_b01d42a3-f1ae-4d66-b970-d5ac0810ddbf/artifacts/2vbg1kvr_logo.png";

export default function AppLayout({ children }) {
  const { t } = useTranslation();
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const items = [
    { to: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, tid: "side-dashboard" },
    { to: "/data-entry", label: "Saisie des données", icon: BookOpen, tid: "side-data-entry" },
    { to: "/treasury", label: "Trésorerie", icon: Wallet, tid: "side-treasury" },
    { to: "/financial-statements", label: "États financiers", icon: BarChart3, tid: "side-financial" },
    { to: "/ai-analysis", label: "Analyse IA", icon: Brain, tid: "side-ai" },
    { to: "/forecasting", label: t("nav.forecasting"), icon: TrendingUp, tid: "side-forecasting" },
    { to: "/reports", label: t("nav.reports"), icon: FileText, tid: "side-reports" },
    { to: "/chat", label: t("nav.chat"), icon: MessageSquareText, tid: "side-chat" },
    { to: "/settings", label: t("nav.settings"), icon: Settings, tid: "side-settings" },
    ...(user?.role === "admin" ? [{ to: "/admin", label: t("admin.nav"), icon: Shield, tid: "side-admin" }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <Navbar variant="app" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-10 flex gap-6">
        <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-20 self-start">
          <div className="glass rounded-2xl p-3">
            <div className="px-3 py-2 mb-2">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{t("dashboard.welcome")}</div>
              <div className="font-display font-bold truncate">{user?.name || user?.email}</div>
            </div>
            <nav className="flex flex-col gap-1">
              {items.map(({ to, label, icon: Icon, tid }) => (
                <NavLink
                  key={to}
                  to={to}
                  data-testid={tid}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                      isActive
                        ? "bg-[#2563eb]/15 text-white border border-[#2563eb]/30"
                        : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                    }`
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={async () => { await logout(); navigate("/"); }}
                className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent transition"
                data-testid="side-logout"
              >
                <LogOut className="size-4" />
                {t("nav.logout")}
              </button>
            </nav>
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
