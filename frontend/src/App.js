import React, { useState } from "react";
import "@/i18n";
import "@/index.css";
import { HashRouter as BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Forecasting from "@/pages/Forecasting";
import Reports from "@/pages/Reports";
import Chat from "@/pages/Chat";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import DataEntry from "@/pages/DataEntry";
import Treasury from "@/pages/Treasury";
import FinancialStatements from "@/pages/FinancialStatements";
import AIAnalysis from "@/pages/AIAnalysis";
import { Toaster } from "sonner";
import { setBackendUrl, getStoredBackendUrl } from "@/lib/api";

function BackendSetup() {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const save = () => {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) { setErr("L'URL doit commencer par http:// ou https://"); return; }
    setBackendUrl(trimmed);
  };
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-6">
      <img src="./logo.png" alt="AYMAFIN" className="w-24 h-24 rounded-2xl mb-6 object-contain" />
      <h1 className="text-2xl font-bold mb-2">AYMAFIN</h1>
      <p className="text-white/60 text-sm text-center mb-8">Entrez l'URL de votre serveur backend pour continuer.</p>
      <div className="w-full max-w-sm space-y-3">
        <input
          type="url"
          placeholder="https://votre-backend.com"
          value={url}
          onChange={e => { setUrl(e.target.value); setErr(""); }}
          className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button
          onClick={save}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 transition"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}

export default function App() {
  // If no backend URL is configured at all (no env var, no localStorage), show setup screen
  const needsSetup = !process.env.REACT_APP_BACKEND_URL && !getStoredBackendUrl();
  if (needsSetup) return <BackendSetup />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={
            <ProtectedRoute requireOnboarding={false}>
              <Onboarding />
            </ProtectedRoute>
          } />
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/forecasting" element={
            <ProtectedRoute><Forecasting /></ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute><Reports /></ProtectedRoute>
          } />
          <Route path="/chat" element={
            <ProtectedRoute><Chat /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute requireOnboarding={false}><Settings /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requireOnboarding={false}><Admin /></ProtectedRoute>
          } />
          <Route path="/data-entry" element={
            <ProtectedRoute><DataEntry /></ProtectedRoute>
          } />
          <Route path="/treasury" element={
            <ProtectedRoute><Treasury /></ProtectedRoute>
          } />
          <Route path="/financial-statements" element={
            <ProtectedRoute><FinancialStatements /></ProtectedRoute>
          } />
          <Route path="/ai-analysis" element={
            <ProtectedRoute><AIAnalysis /></ProtectedRoute>
          } />
        </Routes>
        <Toaster position="top-right" theme="dark" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
