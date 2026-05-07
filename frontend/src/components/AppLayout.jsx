import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, BookOpen, Wallet, BarChart3, Brain,
  FileText, Settings, LogOut, Shield, TrendingUp,
} from "lucide-react";
import Navbar from "./Navbar";

export default function AppLayout({ children }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const items = [
    { to: "/dashboard",            label: "Tableau de bord",   icon: LayoutDashboard, color: "#00C3FF" },
    { to: "/data-entry",           label: "Saisie des données", icon: BookOpen,        color: "#00FF87" },
    { to: "/treasury",             label: "Trésorerie",         icon: Wallet,          color: "#FFB86C" },
    { to: "/financial-statements", label: "États financiers",   icon: BarChart3,       color: "#A78BFA" },
    { to: "/ai-analysis",          label: "Analyse IA",         icon: Brain,           color: "#FF6B6B" },
    { to: "/prevision",            label: "Prévisions",         icon: TrendingUp,      color: "#FF79C6" },
    { to: "/reports",              label: "Rapports PDF",       icon: FileText,        color: "#34D399" },
    { to: "/settings",             label: "Paramètres",         icon: Settings,        color: "#64748B" },
    ...(user?.role === "admin"
      ? [{ to: "/admin", label: "Administration", icon: Shield, color: "#F59E0B" }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <Navbar variant="app" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-10 flex gap-6">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-20 self-start">
          <div className="glass rounded-2xl p-3">
            {/* User info */}
            <div className="px-3 py-3 mb-1">
              <div className="flex items-center gap-3">
                <div
                  className="size-9 rounded-xl grid place-items-center shrink-0"
                  style={{ background: "#00C3FF18", border: "1px solid #00C3FF30" }}
                >
                  <span className="text-sm font-bold text-[#00C3FF]">
                    {(user?.name || user?.email || "?")[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{user?.name || "Utilisateur"}</div>
                  <div className="text-xs text-zinc-500 truncate">{user?.email}</div>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5 mx-3 mb-2" />

            {/* Nav items */}
            <nav className="flex flex-col gap-0.5">
              {items.map(({ to, label, icon: Icon, color }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                      isActive
                        ? "text-white border border-white/10 bg-white/5"
                        : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div
                        className="size-7 rounded-lg grid place-items-center shrink-0 transition-all"
                        style={{
                          background: isActive ? `${color}22` : "transparent",
                          border: `1px solid ${isActive ? color + "44" : "transparent"}`,
                        }}
                      >
                        <Icon className="size-3.5" style={{ color: isActive ? color : undefined }} />
                      </div>
                      <span className="truncate">{label}</span>
                      {isActive && (
                        <div className="ml-auto size-1.5 rounded-full shrink-0" style={{ background: color }} />
                      )}
                    </>
                  )}
                </NavLink>
              ))}

              <div className="h-px bg-white/5 mx-3 my-1" />

              <button
                onClick={async () => { await logout(); navigate("/"); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-500 hover:text-red-400 hover:bg-red-500/5 border border-transparent transition-all"
              >
                <div className="size-7 rounded-lg grid place-items-center shrink-0">
                  <LogOut className="size-3.5" />
                </div>
                Déconnexion
              </button>
            </nav>
          </div>

          <div className="mt-3 text-center">
            <span className="text-xs text-zinc-700 font-mono">AYMAFIN v1.10</span>
          </div>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
