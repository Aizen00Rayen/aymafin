import React, { useEffect, useRef, useState, useCallback } from "react";
import api from "../lib/api";
import AppLayout from "../components/AppLayout";
import { Send, Sparkles, Bot, User2, Trash2, RefreshCw } from "lucide-react";

const SUGGESTIONS = [
  "Quel est mon résultat net ce mois-ci ?",
  "Comment réduire mes charges ?",
  "Analyse ma rentabilité",
  "Comment améliorer ma trésorerie ?",
  "Quels sont mes produits ce mois ?",
  "Donne-moi des conseils pour mon business",
];

function MessageText({ content }) {
  return (
    <span className="whitespace-pre-wrap break-words">{content}</span>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get("/chat/history").then((r) => {
      const flat = [];
      (r.data || []).forEach((m) => {
        if (m.message) flat.push({ role: "user", content: m.message });
        if (m.reply) flat.push({ role: "ai", content: m.reply });
      });
      setMessages(flat);
    }).catch(() => {}).finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setLoading(true);
    try {
      const { data } = await api.post("/chat", { message: msg });
      setMessages((m) => [...m, { role: "ai", content: data.reply || "…" }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", content: "Une erreur est survenue. Réessayez." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading]);

  const clearHistory = async () => {
    if (!window.confirm("Effacer toute la conversation ?")) return;
    setClearing(true);
    try {
      await api.delete("/chat/history");
      setMessages([]);
    } catch {}
    setClearing(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isEmpty = messages.length === 0 && historyLoaded;

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="size-10 rounded-xl grid place-items-center" style={{ background: "#7C3AED18", border: "1px solid #7C3AED44" }}>
              <Sparkles className="size-5" style={{ color: "#A78BFA" }} />
            </div>
            <div>
              <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tighter">Chat IA</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-zinc-500">AYMA · Conseillère financière IA</span>
              </div>
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            disabled={clearing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
          >
            {clearing ? <RefreshCw className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            <span className="hidden sm:inline">Effacer</span>
          </button>
        )}
      </div>

      {/* Chat window */}
      <div className="glass rounded-2xl flex flex-col" style={{ height: "calc(100vh - 240px)", minHeight: "400px" }}>
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isEmpty && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-5 py-8">
              <div className="size-16 rounded-2xl grid place-items-center" style={{ background: "#7C3AED18", border: "1px solid #7C3AED30" }}>
                <Bot className="size-7" style={{ color: "#A78BFA" }} />
              </div>
              <div>
                <p className="text-white font-semibold text-base mb-1">Bonjour ! Je suis AYMA</p>
                <p className="text-zinc-500 text-sm max-w-sm">
                  Votre assistante financière IA. Posez-moi vos questions sur votre rentabilité, vos charges, vos revenus ou votre trésorerie.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-3 py-1.5 rounded-full text-xs text-zinc-300 hover:text-white transition-all border border-white/10 hover:border-white/20 hover:bg-white/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "ai" && (
                <div className="size-8 rounded-lg grid place-items-center shrink-0 mt-0.5" style={{ background: "#7C3AED18", border: "1px solid #7C3AED30" }}>
                  <Bot className="size-4" style={{ color: "#A78BFA" }} />
                </div>
              )}
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-tr-sm bg-[#2563eb] text-white"
                    : "rounded-tl-sm bg-white/5 text-zinc-200 border border-white/8"
                }`}
              >
                <MessageText content={m.content} />
              </div>
              {m.role === "user" && (
                <div className="size-8 rounded-lg bg-white/5 grid place-items-center shrink-0 mt-0.5">
                  <User2 className="size-4 text-zinc-400" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="size-8 rounded-lg grid place-items-center shrink-0 mt-0.5" style={{ background: "#7C3AED18", border: "1px solid #7C3AED30" }}>
                <Bot className="size-4" style={{ color: "#A78BFA" }} />
              </div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white/5 border border-white/8">
                <div className="flex gap-1 items-center h-4">
                  <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-white/5 p-3">
          {!isEmpty && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SUGGESTIONS.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded-full text-[11px] text-zinc-500 hover:text-white transition border border-white/8 hover:border-white/20 hover:bg-white/5 disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Posez votre question… (Entrée pour envoyer)"
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-950/60 border border-white/10 focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 outline-none transition text-sm text-white placeholder-zinc-600 resize-none"
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl disabled:opacity-40 text-white text-sm font-medium transition-all"
              style={{ background: input.trim() && !loading ? "#7C3AED" : "#7C3AED66" }}
            >
              <Send className="size-4" />
              <span className="hidden sm:inline">Envoyer</span>
            </button>
          </div>
          <p className="text-[10px] text-zinc-700 mt-1.5 text-center">AYMA peut faire des erreurs — vérifiez les informations importantes</p>
        </div>
      </div>
    </AppLayout>
  );
}
