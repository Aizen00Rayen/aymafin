import React from "react";
import { useTranslation } from "react-i18next";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../contexts/AuthContext";
import { Mail, Globe, ShieldCheck } from "lucide-react";

const LANGS = [{ code: "fr", name: "Français" }, { code: "en", name: "English" }, { code: "ar", name: "العربية" }];

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  return (
    <AppLayout>
      <div className="mb-8" data-testid="settings-page">
        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">{t("settings.title")}</h1>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-6">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-4">{t("settings.account")}</div>
          <div className="space-y-3">
            <Row icon={Mail} label="Email" value={user?.email} />
            <Row icon={ShieldCheck} label="Role" value={user?.role} />
          </div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 mb-4">{t("settings.language")}</div>
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => i18n.changeLanguage(l.code)}
                className={`px-4 py-2 rounded-xl text-sm transition border ${
                  i18n.language === l.code
                    ? "bg-[#2563eb]/15 text-white border-[#2563eb]/40"
                    : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border-white/5"
                }`}
                data-testid={`settings-lang-${l.code}`}>
                {l.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
      <Icon className="size-4 text-zinc-500" />
      <div className="text-xs text-zinc-500 w-24 font-mono uppercase tracking-[0.18em]">{label}</div>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}
