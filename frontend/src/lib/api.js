import axios from "axios";

// Runtime backend URL: env var (web build) → localStorage override (mobile)
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
  window.location.reload();
}

export function getStoredBackendUrl() {
  try { return localStorage.getItem("aymafin_backend_url") || ""; } catch { return ""; }
}

// Token storage — used when cookies can't be sent cross-origin from file://
export function saveToken(token) {
  try { localStorage.setItem("aymafin_token", token); } catch {}
}
export function clearToken() {
  try { localStorage.removeItem("aymafin_token"); } catch {}
}
function getToken() {
  try { return localStorage.getItem("aymafin_token") || ""; } catch { return ""; }
}

export const API = `${getBackendUrl()}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Attach Bearer token on every request (fallback for WebView / file:// origin)
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

// If a response sets a token header, persist it
api.interceptors.response.use((response) => {
  const token = response.headers["x-access-token"];
  if (token) saveToken(token);
  return response;
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
