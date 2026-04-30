import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";

const MAX_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2000;

export default function BillingSuccess() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [phase, setPhase] = useState("polling"); // polling | success | failed | timeout
  const [info, setInfo] = useState(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setPhase("failed");
      return;
    }
    let timer;
    const poll = async () => {
      attemptsRef.current += 1;
      try {
        const { data } = await api.get(`/billing/status/${sessionId}`);
        setInfo(data);
        if (data.payment_status === "paid") {
          await refresh();
          setPhase("success");
          return;
        }
        if (data.status === "expired" || data.status === "cancelled") {
          setPhase("failed");
          return;
        }
      } catch {
        // keep retrying
      }
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setPhase("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
    return () => clearTimeout(timer);
  }, [sessionId, refresh]);

  return (
    <div className="min-h-screen grid place-items-center bg-[#09090b] text-white px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-radial-fade pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="relative glass-strong rounded-3xl p-10 max-w-md w-full text-center"
        data-testid="billing-success-card">
        {phase === "polling" && (
          <>
            <Loader2 className="size-12 mx-auto text-blue-400 animate-spin" />
            <h1 className="mt-5 font-display font-black text-2xl tracking-tighter">{t("billingSuccess.checking")}</h1>
            <p className="mt-2 text-sm text-zinc-400">{t("billingSuccess.checkingHint")}</p>
            <div className="mt-3 text-xs font-mono text-zinc-600">
              {t("billingSuccess.attempt")} {attemptsRef.current}/{MAX_ATTEMPTS}
            </div>
          </>
        )}
        {phase === "success" && (
          <>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.6 }}>
              <CheckCircle2 className="size-14 mx-auto text-green-400 drop-shadow-[0_0_20px_rgba(34,197,94,0.6)]" />
            </motion.div>
            <h1 className="mt-5 font-display font-black text-3xl tracking-tighter">{t("billingSuccess.thanks")}</h1>
            <p className="mt-2 text-zinc-400">{t("billingSuccess.activated", { plan: info?.plan_id?.replace("_", "-").toUpperCase() })}</p>
            {info?.amount != null && (
              <div className="mt-4 inline-block px-3 py-1.5 rounded-full bg-white/5 text-xs font-mono">
                ${Number(info.amount).toFixed(2)} {info.currency?.toUpperCase()} · 30 {t("billingSuccess.days")}
              </div>
            )}
            <button onClick={() => navigate("/dashboard")}
              className="mt-7 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-white font-medium transition shadow-[0_0_25px_rgba(34,197,94,0.4)]"
              data-testid="billing-success-cta">
              {t("billingSuccess.toDashboard")} <ArrowRight className="size-4" />
            </button>
          </>
        )}
        {phase === "failed" && (
          <>
            <XCircle className="size-12 mx-auto text-red-400" />
            <h1 className="mt-5 font-display font-bold text-2xl tracking-tight">{t("billingSuccess.failed")}</h1>
            <p className="mt-2 text-sm text-zinc-400">{t("billingSuccess.failedHint")}</p>
            <button onClick={() => navigate("/pricing")}
              className="mt-6 w-full px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm transition"
              data-testid="billing-fail-cta">
              {t("billingSuccess.backPricing")}
            </button>
          </>
        )}
        {phase === "timeout" && (
          <>
            <Loader2 className="size-12 mx-auto text-yellow-400" />
            <h1 className="mt-5 font-display font-bold text-2xl tracking-tight">{t("billingSuccess.timeout")}</h1>
            <p className="mt-2 text-sm text-zinc-400">{t("billingSuccess.timeoutHint")}</p>
            <button onClick={() => { attemptsRef.current = 0; setPhase("polling"); }}
              className="mt-6 w-full px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition"
              data-testid="billing-retry">
              {t("billingSuccess.retry")}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
