import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Send, Sparkles, Bot, User2 } from "lucide-react";

export default function Chat() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    api.get("/chat/history").then((r) => {
      const flat = [];
      r.data.forEach((m) => {
        flat.push({ role: "user", content: m.message });
        flat.push({ role: "ai", content: m.reply });
      });
      setMessages(flat);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput(""); setLoading(true);
    try {
      const { data } = await api.post("/chat", { message: msg });
      setMessages((m) => [...m, { role: "ai", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "ai", content: "…" }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = t("chat.suggestions", { returnObjects: true });

  return (
    <AppLayout>
      <div className="mb-6" data-testid="chat-page">
        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">{t("chat.title")}</h1>
        <p className="mt-2 text-zinc-400">{t("chat.subtitle")}</p>
      </div>

      <div className="glass-strong rounded-2xl flex flex-col h-[70vh]">
        <div className="flex-1 overflow-y-auto p-6 space-y-4" data-testid="chat-messages">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="size-14 rounded-2xl bg-[#2563eb]/15 text-blue-400 grid place-items-center">
                <Sparkles className="size-6" />
              </div>
              <div className="text-zinc-400 text-sm max-w-md">{t("chat.subtitle")}</div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {Array.isArray(suggestions) && suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs text-zinc-300 transition"
                    data-testid={`chat-suggestion-${s.slice(0, 10)}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "ai" && <div className="size-8 rounded-lg bg-[#22c55e]/15 text-green-400 grid place-items-center shrink-0"><Bot className="size-4" /></div>}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[#2563eb] text-white"
                  : "bg-white/5 text-zinc-200 border border-white/5"
              }`}>
                {m.content}
              </div>
              {m.role === "user" && <div className="size-8 rounded-lg bg-white/5 text-zinc-400 grid place-items-center shrink-0"><User2 className="size-4" /></div>}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="size-8 rounded-lg bg-[#22c55e]/15 text-green-400 grid place-items-center"><Bot className="size-4" /></div>
              <div className="bg-white/5 rounded-2xl px-4 py-2.5 border border-white/5">
                <div className="flex gap-1">
                  <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce" />
                  <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-white/5 p-3 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("chat.placeholder")}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 outline-none transition text-sm"
            data-testid="chat-input" />
          <button type="submit" disabled={loading || !input.trim()}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-sm font-medium transition"
            data-testid="chat-send">
            <Send className="size-4" />
            <span className="hidden sm:inline">{t("chat.send")}</span>
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
