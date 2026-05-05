import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { Menu, X, Globe, ChevronDown } from "lucide-react";

const LOGO = "./logo.png";

const LANGS = [
  { code: "fr", label: "FR", name: "Français" },
  { code: "en", label: "EN", name: "English" },
  { code: "ar", label: "AR", name: "العربية" },
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === i18n.language) || LANGS[0];
  return (
    <div className="relative" data-testid="language-switcher">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition"
        data-testid="language-switcher-button"
      >
        <Globe className="size-4" />
        <span className="font-mono">{current.label}</span>
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 mt-2 w-44 rounded-xl glass-strong p-1 z-50">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => { i18n.changeLanguage(l.code); setOpen(false); }}
                className={`w-full text-start px-3 py-2 rounded-lg text-sm transition ${
                  l.code === current.code ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
                data-testid={`language-option-${l.code}`}
              >
                <span className="font-mono me-2">{l.label}</span>
                {l.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Navbar({ variant = "landing" }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const navItems = variant === "app"
    ? [
        { to: "/dashboard",            label: "Tableau de bord",   testid: "nav-dashboard" },
        { to: "/data-entry",           label: "Saisie",            testid: "nav-data-entry" },
        { to: "/treasury",             label: "Trésorerie",        testid: "nav-treasury" },
        { to: "/financial-statements", label: "États financiers",  testid: "nav-financials" },
        { to: "/ai-analysis",          label: "Analyse IA",        testid: "nav-ai" },
        { to: "/reports",              label: "Rapports PDF",      testid: "nav-reports" },
      ]
    : [
        { href: "#features", label: t("nav.features"), testid: "nav-features" },
        { href: "#how", label: t("nav.howItWorks"), testid: "nav-how" },
      ];

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5" data-testid="brand-logo-link">
          <img src={LOGO} alt="AYMAFIN" className="size-9 rounded-lg" />
          <span className="font-display font-black text-lg tracking-tight">AYMAFIN</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((it) =>
            it.to ? (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm transition ${isActive ? "text-white bg-white/5" : "text-zinc-400 hover:text-white hover:bg-white/5"}`
                }
                data-testid={it.testid}
              >
                {it.label}
              </NavLink>
            ) : (
              <a key={it.href} href={it.href} className="px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition" data-testid={it.testid}>
                {it.label}
              </a>
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <>
              {variant !== "app" && (
                <Link to="/dashboard" className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg text-sm bg-white/10 hover:bg-white/20 text-white transition" data-testid="nav-go-dashboard">
                  {t("nav.dashboard")}
                </Link>
              )}
              <button
                onClick={async () => { await logout(); navigate("/"); }}
                className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 transition"
                data-testid="nav-logout"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <>
              <Link to="/auth" className="hidden sm:inline-flex items-center px-3 py-2 text-sm text-zinc-300 hover:text-white transition" data-testid="nav-login">
                {t("nav.login")}
              </Link>
              <Link to="/auth?mode=register" className="inline-flex items-center px-4 py-2 rounded-lg text-sm bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium transition shadow-[0_0_20px_rgba(37,99,235,0.4)]" data-testid="nav-getstarted">
                {t("nav.getStarted")}
              </Link>
            </>
          )}
          <button onClick={() => setMobileOpen((v) => !v)} className="md:hidden p-2 rounded-lg text-zinc-300 hover:bg-white/5" data-testid="nav-mobile-toggle">
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 bg-[#09090b]/90 backdrop-blur-xl">
          <div className="px-4 py-3 space-y-1">
            {navItems.map((it) =>
              it.to ? (
                <NavLink key={it.to} to={it.to} onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/5">
                  {it.label}
                </NavLink>
              ) : (
                <a key={it.href} href={it.href} onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/5">
                  {it.label}
                </a>
              )
            )}
          </div>
        </div>
      )}
    </header>
  );
}
