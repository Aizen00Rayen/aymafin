import React, { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ShieldCheck, LineChart, FileBarChart2, Bot, Languages, Rocket,
  ArrowRight, Sparkles, CheckCircle2,
} from "lucide-react";
import Navbar from "../components/Navbar";

const HeroLogo = lazy(() => import("../components/3D/HeroLogo"));

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }),
};

export default function Landing() {
  const { t } = useTranslation();

  const features = [
    { icon: ShieldCheck, title: t("features.f1Title"), desc: t("features.f1Desc"), color: "text-blue-400" },
    { icon: LineChart, title: t("features.f2Title"), desc: t("features.f2Desc"), color: "text-green-400" },
    { icon: FileBarChart2, title: t("features.f3Title"), desc: t("features.f3Desc"), color: "text-blue-400" },
    { icon: Bot, title: t("features.f4Title"), desc: t("features.f4Desc"), color: "text-green-400" },
    { icon: Languages, title: t("features.f5Title"), desc: t("features.f5Desc"), color: "text-blue-400" },
    { icon: Rocket, title: t("features.f6Title"), desc: t("features.f6Desc"), color: "text-green-400" },
  ];

  const steps = [
    { n: "01", title: t("how.s1Title"), desc: t("how.s1Desc") },
    { n: "02", title: t("how.s2Title"), desc: t("how.s2Desc") },
    { n: "03", title: t("how.s3Title"), desc: t("how.s3Desc") },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white" data-testid="landing-page">
      <Navbar variant="landing" />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-24 lg:pt-24 lg:pb-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <motion.div initial="hidden" animate="show" variants={fadeUp} custom={0}
                className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs text-zinc-300">
                <Sparkles className="size-3.5 text-blue-400" />
                <span className="font-mono uppercase tracking-[0.18em]">{t("hero.eyebrow")}</span>
              </motion.div>
              <motion.h1 initial="hidden" animate="show" variants={fadeUp} custom={1}
                className="mt-6 font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
                <span className="text-gradient">{t("hero.title1")}</span>
                <br />
                <span className="text-gradient-brand">{t("hero.title2")}</span>
              </motion.h1>
              <motion.p initial="hidden" animate="show" variants={fadeUp} custom={2}
                className="mt-6 text-lg text-zinc-400 max-w-xl leading-relaxed">
                {t("hero.subtitle")}
              </motion.p>
              <motion.div initial="hidden" animate="show" variants={fadeUp} custom={3}
                className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/auth?mode=register"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium px-6 py-3.5 transition shadow-[0_0_30px_rgba(37,99,235,0.5)] hover:shadow-[0_0_45px_rgba(37,99,235,0.7)] active:scale-95"
                  data-testid="hero-cta-primary">
                  {t("hero.ctaPrimary")} <ArrowRight className="size-4" />
                </Link>
                <a href="#features"
                  className="inline-flex items-center gap-2 rounded-xl glass-strong text-white font-medium px-6 py-3.5 hover:bg-white/10 transition"
                  data-testid="hero-cta-secondary">
                  {t("hero.ctaSecondary")}
                </a>
              </motion.div>
              <motion.div initial="hidden" animate="show" variants={fadeUp} custom={4}
                className="mt-10 grid grid-cols-3 gap-4 max-w-lg">
                {[
                  { v: "+1,200", l: t("hero.kpiUsers") },
                  { v: "4", l: t("hero.kpiBanks") },
                  { v: "8.4k", l: t("hero.kpiReports") },
                ].map((k) => (
                  <div key={k.l} className="border-s-2 border-white/10 ps-3">
                    <div className="font-mono text-2xl font-bold tracking-tight">{k.v}</div>
                    <div className="text-xs text-zinc-500 mt-1">{k.l}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-[420px] sm:h-[520px] glass-strong rounded-3xl glow-blue overflow-hidden"
              data-testid="hero-3d-container">
              <Suspense fallback={<div className="size-full grid place-items-center text-zinc-500">Loading 3D…</div>}>
                <HeroLogo />
              </Suspense>
              <div className="absolute bottom-4 start-4 end-4 flex items-center justify-between text-xs text-zinc-400">
                <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-green-500 animate-pulse" /> Live preview · Real-time engine</div>
                <div className="font-mono">v1.0</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400 mb-3">{t("hookLine")}</div>
            <h2 className="font-display font-black text-4xl sm:text-5xl tracking-tighter">{t("features.title")}</h2>
            <p className="mt-4 text-zinc-400 text-lg">{t("features.subtitle")}</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <motion.div key={f.title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.5 }}
                className="group glass rounded-2xl p-6 hover:bg-white/[0.06] transition"
                data-testid={`feature-card-${i}`}>
                <div className={`inline-flex size-11 items-center justify-center rounded-xl bg-white/5 ${f.color} mb-4 group-hover:scale-110 transition`}>
                  <f.icon className="size-5" />
                </div>
                <div className="font-display font-bold text-lg">{f.title}</div>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative py-24 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mb-12">{t("how.title")}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <motion.div key={s.n}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5 }}
                className="relative glass-strong rounded-2xl p-8 overflow-hidden">
                <div className="font-mono text-6xl font-black text-white/10 absolute top-4 end-4">{s.n}</div>
                <CheckCircle2 className="size-6 text-green-400 mb-4" />
                <div className="font-display font-bold text-xl">{s.title}</div>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="relative glass-strong rounded-3xl p-12 text-center overflow-hidden glow-green">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.15),transparent_60%)]" />
            <div className="relative">
              <h2 className="font-display font-black text-3xl sm:text-5xl tracking-tighter">{t("cta.title")}</h2>
              <p className="mt-4 text-zinc-400 text-lg max-w-2xl mx-auto">{t("cta.subtitle")}</p>
              <Link to="/auth?mode=register"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-white font-medium px-8 py-4 transition shadow-[0_0_30px_rgba(34,197,94,0.5)] active:scale-95"
                data-testid="cta-button">
                {t("cta.button")} <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-sm text-zinc-500">
          <div>© 2026 AYMAFIN. {t("hookLine")}.</div>
          <div className="font-mono text-xs uppercase tracking-[0.2em]">Algiers · Paris · Dubai</div>
        </div>
      </footer>
    </div>
  );
}
