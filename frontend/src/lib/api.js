import axios from "axios";

// Runtime backend URL: env var (web build) → localStorage override (mobile) → fallback
function getBackendUrl() {
  const env = process.env.REACT_APP_BACKEND_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const stored = localStorage.getItem("aymafin_backend_url");
    if (stored) return stored.replace(/\/$/, "");
  } catch {}
  return "";
}

export function setBackendUrl(url) {
  try { localStorage.setItem("aymafin_backend_url", url.replace(/\/$/, "")); } catch {}
  // Reload so axios instance picks up new base URL
  window.location.reload();
}

export function getStoredBackendUrl() {
  try { return localStorage.getItem("aymafin_backend_url") || ""; } catch { return ""; }
}

export const API = `${getBackendUrl()}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export default api;

export function formatApiError(detail) {
  if (detail == null) return "Une erreur est survenue.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" · ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
