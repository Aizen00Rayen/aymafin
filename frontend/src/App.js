import React from "react";
import "@/i18n";
import "@/index.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

export default function App() {
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
