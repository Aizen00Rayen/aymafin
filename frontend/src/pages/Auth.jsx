import React, { useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { ArrowRight, Mail, Lock, User2 } from "lucide-react";

const LOGO = "./logo.png";

export default function Auth() {
  const { t } = useTranslation();
  const { login, register, formatApiError } = useAuth();
  const [params] = useSearchParams();
  const initialMode = params.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const enterDemo = async () => {
    setErr(""); setLoading(true);
    try {
      const data = await login("demo@aymafin.com", "demo123");
      navigate(data.onboarded ? "/dashboard" : "/onboarding", { replace: true });
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const data = mode === "login"
        ? await login(email, password)
        : await register(email, password, name);
      let redirectTo;
      if (data.role === "admin") redirectTo = "/admin";
      else redirectTo = location.state?.from?.pathname || (data.onboarded ? "/dashboard" : "/onboarding");
      navigate(redirectTo, { replace: true });
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#09090b] text-white">
      {/* Left: Form */}
      <div className="flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent)]" />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="relative w-full max-w-md glass-strong rounded-3xl p-8 sm:p-10">
          <Link to="/" className="flex items-center gap-2.5 mb-8" data-testid="auth-brand-link">
            <img src={LOGO} alt="AYMAFIN" className="size-9 rounded-lg" />
            <span className="font-display font-black text-xl tracking-tight">AYMAFIN</span>
          </Link>
          <div className="font-display font-black text-3xl tracking-tighter">
            {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            {mode === "login" ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}
          </p>

          <form className="mt-7 space-y-4" onSubmit={submit}>
            {mode === "register" && (
              <div>
                <label className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">{t("auth.name")}</label>
                <div className="mt-2 relative">
                  <User2 className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                  <input
                    required value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full ps-10 pe-4 py-3 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 outline-none transition"
                    data-testid="auth-name-input" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">{t("auth.email")}</label>
              <div className="mt-2 relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full ps-10 pe-4 py-3 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 outline-none transition"
                  data-testid="auth-email-input" />
              </div>
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">{t("auth.password")}</label>
              <div className="mt-2 relative">
                <Lock className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                <input
                  type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full ps-10 pe-4 py-3 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 outline-none transition"
                  data-testid="auth-password-input" />
              </div>
            </div>

            {err && (
              <div className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2" data-testid="auth-error">
                {err}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-medium px-6 py-3.5 transition shadow-[0_0_25px_rgba(37,99,235,0.4)] active:scale-95"
              data-testid="auth-submit">
              {loading ? "…" : (mode === "login" ? t("auth.submitLogin") : t("auth.submitRegister"))}
              {!loading && <ArrowRight className="size-4" />}
            </button>
          </form>

          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}
            className="mt-5 w-full text-sm text-zinc-400 hover:text-white transition" data-testid="auth-mode-toggle">
            {mode === "login" ? t("auth.switchToRegister") : t("auth.switchToLogin")}
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-zinc-600">ou</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <button
            type="button"
            onClick={enterDemo}
            disabled={loading}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-zinc-300 font-medium px-6 py-3 transition active:scale-95"
            data-testid="auth-demo">
            {loading ? "…" : "Mode démo — voir les données exemple"}
          </button>
        </motion.div>
      </div>

      {/* Right: Visual */}
      <div className="hidden lg:flex relative overflow-hidden border-s border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.15),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="relative m-auto max-w-md p-12">
          <img src={LOGO} alt="" className="size-24 rounded-2xl glow-blue mb-8 animate-float" />
          <div className="font-display font-black text-3xl tracking-tighter">{t("hookLine")}</div>
          <p className="mt-4 text-zinc-400">
            {t("tagline")}
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[t("features.f1Title"), t("features.f3Title"), t("features.f5Title")].map((line) => (
              <li key={line} className="flex items-center gap-3 text-zinc-300">
                <div className="size-1.5 rounded-full bg-green-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
