import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const JWT_SECRET = "4f433fff-8ca3-48e8-9b1e-99a43dd413ba";
const ACCESS_TTL = 60 * 60 * 24 * 7;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

function getDB() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error(`Missing env: SUPABASE_URL=${!!url} SUPABASE_SERVICE_ROLE_KEY=${!!key}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

async function signJWT(sub: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub, email, type: "access", iat: now, exp: now + ACCESS_TTL };
  const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const msg = `${b64url(header)}.${b64url(payload)}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${msg}.${sigB64}`;
}

async function verifyJWT(token: string): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const [hb64, pb64, sb64] = parts;
  const msg = `${hb64}.${pb64}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sig = Uint8Array.from(atob(sb64.replace(/-/g, "+").replace(/_/g, "/")).split("").map(c => c.charCodeAt(0)));
  const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(msg));
  if (!ok) throw new Error("Invalid signature");
  const p = JSON.parse(atob(pb64.replace(/-/g, "+").replace(/_/g, "/")));
  if (p.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  if (p.type !== "access") throw new Error("Invalid token type");
  return p;
}

function corsHeaders(origin: string | null) {
  const o = origin || "null";
  const allowed = ["http://localhost:3000", "http://localhost:8000", "null", "file://"];
  const allowOrigin = allowed.includes(o) || o.endsWith(".vercel.app") ? o : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Expose-Headers": "X-Access-Token",
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin), ...extra },
  });
}

function err(detail: string, status = 400, origin: string | null = null) {
  return json({ detail }, status, {}, origin);
}

async function getUser(req: Request): Promise<Record<string, unknown>> {
  let token = "";
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/access_token=([^;]+)/);
  if (m) token = m[1];
  if (!token) {
    const auth = req.headers.get("authorization") || "";
    if (auth.startsWith("Bearer ")) token = auth.slice(7);
  }
  if (!token) throw new Error("Not authenticated");
  const payload = await verifyJWT(token);
  const db = getDB();
  const res = await db.from("users").select("id,email,name,role,onboarded,created_at,subscription").eq("id", payload.sub as string).is("deleted_at", null).maybeSingle();
  if (res.error) throw new Error(`DB error: ${res.error.message}`);
  if (!res.data) throw new Error("User not found");
  return res.data as Record<string, unknown>;
}


function computeAnalysis(biz: Record<string, unknown>) {
  const streams = (biz.revenue_streams as Array<Record<string, unknown>>) || [];
  const exps = (biz.expenses as Array<Record<string, unknown>>) || [];
  const revenue = streams.reduce((s, r) => s + parseFloat(String(r.monthly_amount || 0)), 0);
  const expenses = exps.reduce((s, e) => s + parseFloat(String(e.monthly_amount || 0)), 0);
  const profit = revenue - expenses;
  const margin = revenue > 0 ? (profit / revenue * 100) : 0;
  const capital = parseFloat(String(biz.initial_capital || 0));
  const burnRate = Math.max(expenses - revenue, 0);
  const runwayMonths = burnRate > 0 ? capital / burnRate : null;
  let riskScore = 0;
  if (margin < 0) riskScore += 3; else if (margin < 10) riskScore += 2; else if (margin < 25) riskScore += 1;
  if (runwayMonths !== null && runwayMonths < 6) riskScore += 3; else if (runwayMonths !== null && runwayMonths < 12) riskScore += 1;
  if (revenue === 0) riskScore += 3;
  if (streams.length <= 1) riskScore += 1;
  const riskLevel = riskScore <= 1 ? "low" : riskScore <= 4 ? "medium" : "high";
  const recs = [];
  if (margin < 15) recs.push({ key: "improve_margin", params: {} });
  if (runwayMonths !== null && runwayMonths < 9) recs.push({ key: "secure_financing", params: { runway: Math.round(runwayMonths * 10) / 10 } });
  if (streams.length <= 1) recs.push({ key: "diversify_revenue", params: {} });
  if (!recs.length) recs.push({ key: "scale_up", params: {} });
  return { revenue_monthly: Math.round(revenue * 100) / 100, expenses_monthly: Math.round(expenses * 100) / 100, profit_monthly: Math.round(profit * 100) / 100, margin_pct: Math.round(margin * 100) / 100, burn_rate_monthly: Math.round(burnRate * 100) / 100, runway_months: runwayMonths !== null ? Math.round(runwayMonths * 10) / 10 : null, risk_level: riskLevel, risk_score: riskScore, recommendations: recs, currency: String(biz.currency || "DZD") };
}

function computeForecasts(biz: Record<string, unknown>, months = 12) {
  const streams = (biz.revenue_streams as Array<Record<string, unknown>>) || [];
  const exps = (biz.expenses as Array<Record<string, unknown>>) || [];
  const baseRev = streams.reduce((s, r) => s + parseFloat(String(r.monthly_amount || 0)), 0);
  const baseExp = exps.reduce((s, e) => s + parseFloat(String(e.monthly_amount || 0)), 0);
  const capital = parseFloat(String(biz.initial_capital || 0));
  const scenarios: Record<string, { rev_growth: number; exp_growth: number }> = { optimistic: { rev_growth: 0.08, exp_growth: 0.02 }, realistic: { rev_growth: 0.03, exp_growth: 0.02 }, pessimistic: { rev_growth: -0.02, exp_growth: 0.04 } };
  const out: Record<string, unknown[]> = {};
  for (const [name, p] of Object.entries(scenarios)) {
    let rev = baseRev, exp = baseExp, cash = capital;
    out[name] = Array.from({ length: months }, (_, i) => { rev *= 1 + p.rev_growth; exp *= 1 + p.exp_growth; cash += rev - exp; return { month: i + 1, revenue: Math.round(rev * 100) / 100, expenses: Math.round(exp * 100) / 100, profit: Math.round((rev - exp) * 100) / 100, cash: Math.round(cash * 100) / 100 }; });
  }
  return out;
}

async function handleAuth(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  if (method === "POST" && path === "/register") {
    try {
      const body = await req.json();
      const email = String(body.email || "").toLowerCase().trim();
      if (!email || !body.password || !body.name) return err("Email, password et nom requis", 400, origin);
      if (String(body.password).length < 6) return err("Mot de passe trop court (min 6)", 400, origin);
      const db = getDB();
      const existing = await db.from("users").select("id").eq("email", email).is("deleted_at", null).maybeSingle();
      if (existing.error) { console.error("[register] db error:", existing.error); return err("Erreur base de données", 500, origin); }
      if (existing.data) return err("Email déjà enregistré", 400, origin);
      const id = crypto.randomUUID();
      const hash = await bcrypt.hash(String(body.password), 10);
      const ins = await db.from("users").insert({ id, email, name: String(body.name).trim(), password_hash: hash, role: "user", onboarded: false, created_at: new Date().toISOString() });
      if (ins.error) { console.error("[register] insert error:", ins.error); return err("Erreur insertion: " + ins.error.message, 500, origin); }
      const token = await signJWT(id, email);
      return json({ id, email, name: String(body.name).trim(), role: "user", onboarded: false }, 200, { "X-Access-Token": token, "Set-Cookie": `access_token=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${ACCESS_TTL}` }, origin);
    } catch (e) {
      console.error("[register] exception:", e);
      return err("Erreur: " + String((e as Error).message), 500, origin);
    }
  }
  if (method === "POST" && path === "/login") {
    try {
      const body = await req.json();
      const email = String(body.email || "").toLowerCase().trim();
      const db = getDB();
      const rec = await db.from("login_attempts").select("*").eq("identifier", email).maybeSingle();
      const attempt = rec.data as Record<string, unknown> | null;
      if (attempt?.locked_until && new Date(attempt.locked_until as string) > new Date()) return err("Trop de tentatives. Réessayez plus tard.", 429, origin);
      const userRes = await db.from("users").select("*").eq("email", email).is("deleted_at", null).maybeSingle();
      if (userRes.error) { console.error("[login] db error:", userRes.error); return err("Erreur base de données", 500, origin); }
      const user = userRes.data as Record<string, unknown> | null;
      const valid = user ? await bcrypt.compare(String(body.password || ""), String(user.password_hash || "")) : false;
      if (!user || !valid) {
        const count = ((attempt?.attempts as number) || 0) + 1;
        const upsertDoc: Record<string, unknown> = { id: crypto.randomUUID(), identifier: email, attempts: count };
        if (count >= LOCKOUT_THRESHOLD) { upsertDoc.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString(); upsertDoc.attempts = 0; }
        await db.from("login_attempts").upsert(upsertDoc, { onConflict: "identifier" });
        return err("Email ou mot de passe invalide", 401, origin);
      }
      await db.from("login_attempts").delete().eq("identifier", email);
      const token = await signJWT(String(user.id), email);
      return json({ id: user.id, email: user.email, name: user.name, role: user.role || "user", onboarded: user.onboarded || false }, 200, { "X-Access-Token": token, "Set-Cookie": `access_token=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${ACCESS_TTL}` }, origin);
    } catch (e) {
      console.error("[login] exception:", e);
      return err("Erreur: " + String((e as Error).message), 500, origin);
    }
  }
  if (method === "POST" && path === "/logout") {
    return json({ ok: true }, 200, { "Set-Cookie": "access_token=; Path=/; HttpOnly; Max-Age=0" }, origin);
  }
  if (method === "GET" && path === "/me") {
    try {
      const user = await getUser(req);
      return json({ id: user.id, email: user.email, name: user.name, role: user.role || "user", onboarded: user.onboarded || false }, 200, {}, origin);
    } catch (e) { return err(String((e as Error).message), 401, origin); }
  }
  return err("Not found", 404, origin);
}

async function handleBusiness(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  const db = getDB();
  if (method === "GET" && path === "/business") {
    const res = await db.from("businesses").select("*").eq("user_id", String(user.id)).maybeSingle();
    return json(res.data, 200, {}, origin);
  }
  if (method === "POST" && path === "/business") {
    const body = await req.json();
    const doc = { ...body, user_id: user.id, updated_at: new Date().toISOString() };
    const existing = await db.from("businesses").select("id").eq("user_id", String(user.id)).maybeSingle();
    if (existing.data) { await db.from("businesses").update(doc).eq("user_id", String(user.id)); }
    else { doc.id = crypto.randomUUID(); doc.created_at = doc.updated_at; await db.from("businesses").insert(doc); }
    await db.from("users").update({ onboarded: true }).eq("id", String(user.id));
    return json({ ok: true }, 200, {}, origin);
  }
  if (method === "GET" && path === "/analysis") {
    const res = await db.from("businesses").select("*").eq("user_id", String(user.id)).maybeSingle();
    if (!res.data) return err("Aucune donnée. Complétez l'onboarding.", 404, origin);
    const biz = res.data as Record<string, unknown>;
    const analysis = computeAnalysis(biz);
    const rev = analysis.revenue_monthly, exp = analysis.expenses_monthly;
    const seasonality = [0.92, 0.95, 1.00, 1.04, 1.08, 1.10, 1.05, 0.98, 1.02, 1.06, 1.12, 1.18];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const cashflow = months.map((m, i) => { const rv = Math.round(rev * seasonality[i] * 100)/100; const ex = Math.round(exp * (0.95 + 0.05*(i%3)) * 100)/100; return { month: m, revenue: rv, expenses: ex, profit: Math.round((rv-ex)*100)/100 }; });
    const expense_breakdown = ((biz.expenses as Array<Record<string,unknown>>) || []).map(e => ({ name: String(e.name||"Unnamed"), value: parseFloat(String(e.monthly_amount||0)), category: String(e.category||"other") }));
    return json({ analysis, cashflow, expense_breakdown, activity: [], business: { name: biz.business_name, type: biz.business_type, country: biz.country } }, 200, {}, origin);
  }
  if (method === "GET" && path === "/forecasts") {
    const res = await db.from("businesses").select("*").eq("user_id", String(user.id)).maybeSingle();
    if (!res.data) return err("Aucune donnée", 404, origin);
    return json({ scenarios: computeForecasts(res.data as Record<string,unknown>), currency: (res.data as Record<string,unknown>).currency || "DZD" }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

async function handleAccounting(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  const db = getDB();
  const uid = String(user.id);
  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "";
  if (method === "GET" && path === "/accounting/plan") return json({ charges: {}, produits: {} }, 200, {}, origin);
  if (method === "GET" && path === "/accounting/periods") {
    const ae = await db.from("accounting_entries").select("period").eq("user_id", uid);
    const be = await db.from("bilan_entries").select("period").eq("user_id", uid);
    const periods = [...new Set([...(ae.data||[]).map((r: Record<string,unknown>) => r.period), ...(be.data||[]).map((r: Record<string,unknown>) => r.period)])].filter(Boolean).sort().reverse();
    return json(periods, 200, {}, origin);
  }
  if (method === "GET" && path === "/accounting/entries") {
    let q = db.from("accounting_entries").select("*").eq("user_id", uid).eq("period", period);
    const et = url.searchParams.get("entry_type"); if (et) q = q.eq("entry_type", et);
    const res = await q;
    return json(res.data || [], 200, {}, origin);
  }
  if (method === "POST" && path === "/accounting/entries") {
    const body = await req.json();
    if (!body.amount || !body.date || !body.entry_type || !body.label) return err("amount, date, entry_type, label requis", 400, origin);
    const etype = String(body.entry_type);
    if (!["charge", "produit"].includes(etype)) return err("entry_type doit être 'charge' ou 'produit'", 400, origin);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const ins = await db.from("accounting_entries").insert({ id, user_id: uid, period: body.period || String(body.date).slice(0, 7), label: String(body.label), entry_type: etype, amount: body.amount, date: body.date, note: body.note || null, created_at: now, updated_at: now });
    if (ins.error) return err("Erreur insertion: " + ins.error.message, 500, origin);
    return json({ id, ok: true }, 200, {}, origin);
  }
  if (method === "DELETE" && path.startsWith("/accounting/entries/")) {
    await db.from("accounting_entries").delete().eq("id", path.split("/")[3]).eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }
  if (method === "GET" && path === "/accounting/tcr") {
    const res = await db.from("accounting_entries").select("*").eq("user_id", uid).eq("period", period);
    const entries = (res.data || []) as Array<Record<string,unknown>>;
    const charges_list = entries.filter(e => e.entry_type === "charge").map(e => ({ id: e.id, label: String(e.label || e.note || ""), amount: Number(e.amount), date: e.date }));
    const produits_list = entries.filter(e => e.entry_type === "produit").map(e => ({ id: e.id, label: String(e.label || e.note || ""), amount: Number(e.amount), date: e.date }));
    const tc = charges_list.reduce((s, e) => s + e.amount, 0);
    const tp = produits_list.reduce((s, e) => s + e.amount, 0);
    return json({ period, charges_list, produits_list, total_charges: Math.round(tc*100)/100, total_produits: Math.round(tp*100)/100, resultat_net: Math.round((tp-tc)*100)/100 }, 200, {}, origin);
  }
  if (method === "GET" && path === "/accounting/bilan") {
    const raw = (await db.from("bilan_entries").select("*").eq("user_id", uid).eq("period", period).maybeSingle()).data as Record<string,number>|null;
    if (!raw) return json(null, 200, {}, origin);
    const entries = (await db.from("accounting_entries").select("entry_type,amount").eq("user_id", uid).eq("period", period)).data || [];
    const rn = (entries as Array<Record<string,unknown>>).reduce((s,e) => s + (e.entry_type === "produit" ? 1 : e.entry_type === "charge" ? -1 : 0) * Number(e.amount), 0);
    return json(buildBilan(raw, rn), 200, {}, origin);
  }
  if (method === "POST" && path === "/accounting/bilan") {
    const body = await req.json();
    const doc = { ...body, user_id: uid, updated_at: new Date().toISOString() };
    const existing = await db.from("bilan_entries").select("id").eq("user_id", uid).eq("period", body.period).maybeSingle();
    if (existing.data) { await db.from("bilan_entries").update(doc).eq("user_id", uid).eq("period", body.period); return json({ ok: true }, 200, {}, origin); }
    doc.id = crypto.randomUUID(); doc.created_at = doc.updated_at;
    await db.from("bilan_entries").insert(doc);
    return json({ id: doc.id, ok: true }, 200, {}, origin);
  }
  if (method === "GET" && path === "/accounting/journal") {
    const jtype = url.searchParams.get("journal_type");
    let q = db.from("journal_entries").select("*").eq("user_id", uid);
    if (period) q = q.like("date", `${period}%`);
    if (jtype) q = q.eq("journal_type", jtype);
    const res = await q.order("date", { ascending: true }).limit(2000);
    return json(res.data || [], 200, {}, origin);
  }
  if (method === "POST" && path === "/accounting/journal") {
    const body = await req.json();
    const JTYPES = ["OUVERTURE","ACHATS","BANQUE","CAISSE","STOCKS","OPERATIONS_DIVERS","SALAIRES","VENTES"];
    if (!JTYPES.includes(body.journal_type)) return err(`Type invalide. Valeurs: ${JTYPES.join(", ")}`, 400, origin);
    const id = crypto.randomUUID();
    await db.from("journal_entries").insert({ id, user_id: uid, ...body, created_at: new Date().toISOString() });
    return json({ id, ok: true }, 200, {}, origin);
  }
  if (method === "DELETE" && path.startsWith("/accounting/journal/")) {
    await db.from("journal_entries").delete().eq("id", path.split("/")[3]).eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

function buildBilan(raw: Record<string,number>, rn: number) {
  const iinc = raw.immo_incorporelles_brut - raw.immo_incorporelles_amort;
  const icorp = raw.immo_corporelles_brut - raw.immo_corporelles_amort;
  const anc = raw.ecarts_acquisition + iinc + icorp + raw.immo_financieres + raw.impots_differes_actif;
  const ac = raw.stocks + raw.creances_clients + raw.autres_debiteurs + raw.impots_taxes_recuperables + raw.tresorerie_actif;
  const cp = raw.capital + raw.reserves + rn + raw.autres_capitaux_propres;
  const pnc = raw.emprunts_lt + raw.impots_differes_passif;
  const pc = raw.fournisseurs + raw.dettes_personnel + raw.dettes_impots + raw.autres_dettes_ct + raw.decouvert_bancaire;
  const r2 = (n: number) => Math.round(n*100)/100;
  return { actif: { non_courant: { ecarts_acquisition: raw.ecarts_acquisition, immo_incorporelles: { brut: raw.immo_incorporelles_brut, amort: raw.immo_incorporelles_amort, net: iinc }, immo_corporelles: { brut: raw.immo_corporelles_brut, amort: raw.immo_corporelles_amort, net: icorp }, immo_financieres: raw.immo_financieres, impots_differes: raw.impots_differes_actif, total: r2(anc) }, courant: { stocks: raw.stocks, creances_clients: raw.creances_clients, autres_debiteurs: raw.autres_debiteurs, impots_taxes: raw.impots_taxes_recuperables, tresorerie: raw.tresorerie_actif, total: r2(ac) }, total: r2(anc+ac) }, passif: { capitaux_propres: { capital: raw.capital, reserves: raw.reserves, resultat_net: r2(rn), autres: raw.autres_capitaux_propres, total: r2(cp) }, non_courant: { emprunts_lt: raw.emprunts_lt, impots_differes: raw.impots_differes_passif, total: r2(pnc) }, courant: { fournisseurs: raw.fournisseurs, dettes_personnel: raw.dettes_personnel, dettes_impots: raw.dettes_impots, autres_dettes: raw.autres_dettes_ct, decouvert_bancaire: raw.decouvert_bancaire, total: r2(pc) }, total: r2(cp+pnc+pc) }, ecart: r2(anc+ac - cp-pnc-pc) };
}

async function handleTreasury(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  const db = getDB();
  const uid = String(user.id);
  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "";
  if (method === "GET" && path === "/treasury/summary") {
    let q = db.from("treasury_entries").select("*").eq("user_id", uid);
    if (period) q = q.like("date", `${period.slice(0,7)}%`);
    const entries = (await q).data as Array<Record<string,unknown>> || [];
    const inc = entries.filter(e => e.type === "income").reduce((s,e) => s+Number(e.amount), 0);
    const exp = entries.filter(e => e.type === "expense").reduce((s,e) => s+Number(e.amount), 0);
    const monthly: Record<string,{month:string,income:number,expense:number}> = {};
    for (const e of entries) { const m = String(e.date).slice(0,7); if (!monthly[m]) monthly[m] = {month:m,income:0,expense:0}; if (e.type==="income") monthly[m].income+=Number(e.amount); else monthly[m].expense+=Number(e.amount); }
    return json({ balance: Math.round((inc-exp)*100)/100, total_income: Math.round(inc*100)/100, total_expense: Math.round(exp*100)/100, monthly: Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month)) }, 200, {}, origin);
  }
  if (method === "GET" && path === "/treasury/entries") {
    let q = db.from("treasury_entries").select("*").eq("user_id", uid);
    if (period) q = q.like("date", `${period.slice(0,7)}%`);
    const res = await q.order("date", {ascending:false}).limit(1000);
    return json(res.data || [], 200, {}, origin);
  }
  if (method === "POST" && path === "/treasury/entries") {
    const body = await req.json();
    if (!["income","expense"].includes(body.type)) return err("Type invalide", 400, origin);
    const id = crypto.randomUUID();
    await db.from("treasury_entries").insert({ id, user_id: uid, ...body, created_at: new Date().toISOString() });
    return json({ id, ok: true }, 200, {}, origin);
  }
  if (method === "DELETE" && path.startsWith("/treasury/entries/")) {
    await db.from("treasury_entries").delete().eq("id", path.split("/")[3]).eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }
  if (method === "GET" && path === "/treasury/invoices") {
    const res = await db.from("invoices").select("*").eq("user_id", uid).order("date",{ascending:false}).limit(1000);
    return json(res.data || [], 200, {}, origin);
  }
  if (method === "POST" && path === "/treasury/invoices") {
    const body = await req.json();
    if (!["incoming","outgoing"].includes(body.type)) return err("Type invalide", 400, origin);
    const id = crypto.randomUUID();
    await db.from("invoices").insert({ id, user_id: uid, ...body, created_at: new Date().toISOString() });
    return json({ id, ok: true }, 200, {}, origin);
  }
  if (method === "PUT" && path.startsWith("/treasury/invoices/")) {
    const body = await req.json();
    await db.from("invoices").update({ ...body, updated_at: new Date().toISOString() }).eq("id", path.split("/")[3]).eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }
  if (method === "DELETE" && path.startsWith("/treasury/invoices/")) {
    await db.from("invoices").delete().eq("id", path.split("/")[3]).eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

async function handleReports(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  const db = getDB();
  const uid = String(user.id);
  if (method === "GET" && path === "/reports") {
    const res = await db.from("reports").select("*").eq("user_id", uid).is("deleted_at", null).order("created_at",{ascending:false});
    return json(res.data || [], 200, {}, origin);
  }
  if (method === "POST" && path === "/reports") {
    const body = await req.json();
    const id = crypto.randomUUID();
    await db.from("reports").insert({ id, user_id: uid, ...body, created_at: new Date().toISOString() });
    return json({ id, ok: true }, 200, {}, origin);
  }
  if (method === "DELETE" && path.startsWith("/reports/")) {
    await db.from("reports").update({ deleted_at: new Date().toISOString() }).eq("id", path.split("/")[2]).eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

async function handleAIAnalysis(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  const db = getDB();
  const uid = String(user.id);
  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "";
  if (method === "GET" && path === "/ai-analysis") {
    const entries = ((await db.from("accounting_entries").select("*").eq("user_id", uid).eq("period", period)).data || []) as Array<Record<string,unknown>>;
    const tc = entries.filter(e=>e.entry_type==="charge").reduce((s,e)=>s+Number(e.amount),0);
    const tp = entries.filter(e=>e.entry_type==="produit").reduce((s,e)=>s+Number(e.amount),0);
    const resultat_net = tp - tc;
    const rawRes = await db.from("bilan_entries").select("*").eq("user_id", uid).eq("period", period).maybeSingle();
    if (!rawRes.data) return err("Données de bilan introuvables pour cette période.", 404, origin);
    const raw = rawRes.data as Record<string,number>;
    const iinc = raw.immo_incorporelles_brut - raw.immo_incorporelles_amort;
    const icorp = raw.immo_corporelles_brut - raw.immo_corporelles_amort;
    const anc = raw.ecarts_acquisition + iinc + icorp + raw.immo_financieres + raw.impots_differes_actif;
    const ac = raw.stocks + raw.creances_clients + raw.autres_debiteurs + raw.impots_taxes_recuperables + raw.tresorerie_actif;
    const cp = raw.capital + raw.reserves + resultat_net + raw.autres_capitaux_propres;
    const pnc = raw.emprunts_lt + raw.impots_differes_passif;
    const pc = raw.fournisseurs + raw.dettes_personnel + raw.dettes_impots + raw.autres_dettes_ct + raw.decouvert_bancaire;
    const frng = (cp+pnc) - anc, dispo = raw.tresorerie_actif, avances = raw.decouvert_bancaire;
    const bfr = (ac - dispo) - (pc - avances), tn = frng - bfr;
    const thr = Math.abs(Math.max(Math.abs(frng),Math.abs(bfr),Math.abs(tn),1))*0.05;
    const cas_e = frng>thr&&bfr<-thr&&tn>thr?1:frng>thr&&bfr>thr&&tn>thr?2:frng>thr&&bfr>thr&&tn>-thr&&tn<thr?3:frng<-thr&&bfr<-thr&&tn>thr?4:frng<-thr&&bfr>thr&&tn<-thr?5:frng<-thr&&tn<-thr?6:7;
    const emojis=["✅","✅","⚠️","⚠️","🚨","🚨","⚠️"], interps=["Situation très favorable","Situation saine","Situation correcte mais sous pression","Situation fragile","Situation difficile","Situation critique","Équilibre précaire"];
    const equilibre = { frng: Math.round(frng*100)/100, bfr: Math.round(bfr*100)/100, tn: Math.round(tn*100)/100, cas: cas_e, emoji: emojis[cas_e-1], interpretation: interps[cas_e-1] };
    const caf_val = resultat_net;
    const caf = { caf: Math.round(caf_val*100)/100, cas: caf_val>0?1:caf_val<0?2:3, emoji: caf_val>0?"✅":caf_val<0?"🚨":"⚠️", interpretation: caf_val>0?"Résultat positif":caf_val<0?"Résultat négatif":"Résultat nul" };
    const re = (anc+ac)>0?(resultat_net/(anc+ac)*100):0, rf = cp>0?(resultat_net/cp*100):0;
    const rentabilite = { re: Math.round(re*100)/100, rf: Math.round(rf*100)/100, re_cas: re>5?1:re>=1?2:3, re_emoji: re>5?"✅":re>=1?"⚠️":"🚨", re_interpretation: re>5?"Bonne rentabilité":re>=1?"Rentabilité moyenne":"Rentabilité faible", rf_cas: rf>15?1:rf>=5?2:3, rf_emoji: rf>15?"✅":rf>=5?"⚠️":"🚨", rf_interpretation: rf>15?"Bon rendement":rf>=5?"Rendement moyen":"Rendement faible" };
    const dc = tp>0?(raw.creances_clients/tp*360):0, df = tc>0?(raw.fournisseurs/tc*360):0;
    const delais = { delai_clients: Math.round(dc*10)/10, delai_fournisseurs: Math.round(df*10)/10, dc_cas: dc<60?1:dc<=90?2:3, dc_emoji: dc<60?"✅":dc<=90?"⚠️":"🚨", dc_interpretation: dc<60?"Délai clients rapide":dc<=90?"Délai clients correct":"Clients paient lentement", df_cas: df<60?1:df<=90?2:3, df_emoji: df<60?"✅":df<=90?"⚠️":"🚨", df_interpretation: df<60?"Paiement fournisseurs rapide":"Délai fournisseurs normal", comp_cas: dc>df?1:2, comp_emoji: dc>df?"⚠️":"✅", comp_interpretation: dc>df?"Clients paient plus lentement que fournisseurs":"Situation favorable" };
    const recs = [];
    if (frng<0) recs.push({priority:"high",area:"Structure financière",title:"Renforcer les capitaux permanents",action:"FRNG négatif. Augmentez capitaux propres ou emprunts LT."});
    if (tn<0) recs.push({priority:"high",area:"Trésorerie",title:"Améliorer la trésorerie nette",action:"TN négative. Lignes de crédit CT ou accélérez encaissement."});
    if (caf_val<0) recs.push({priority:"high",area:"Résultat",title:"Améliorer le résultat net",action:"Résultat négatif. Réduisez charges et améliorez chiffre d'affaires."});
    if (re<1) recs.push({priority:"medium",area:"Rentabilité",title:"Améliorer la rentabilité des actifs",action:"RE<1%. Optimisez utilisation des ressources."});
    if (dc>90) recs.push({priority:"high",area:"Gestion clients",title:"Réduire délais clients",action:"Délai >90j: relances systématiques et affacturage."});
    if (!recs.length) recs.push({priority:"low",area:"Général",title:"Situation équilibrée",action:"Indicateurs dans les normes. Continuez à surveiller."});
    return json({ period, equilibre_financier: equilibre, caf, rentabilite, delais, recommendations: recs }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

async function handleAdmin(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  if (String(user.role) !== "admin") return err("Admin requis", 403, origin);
  const db = getDB();
  const uid = String(user.id);
  if (method === "GET" && path === "/admin/stats") {
    const users = (await db.from("users").select("id,onboarded,created_at,deleted_at")).data || [];
    const active = (users as Array<Record<string,unknown>>).filter(u => !u.deleted_at);
    const bizCount = ((await db.from("businesses").select("id", { count: "exact", head: true })).count) || 0;
    return json({ total_users: active.length, onboarded_users: active.filter(u=>u.onboarded).length, total_businesses: bizCount, new_users_7d: active.filter(u=>new Date(String(u.created_at))>new Date(Date.now()-7*86400000)).length }, 200, {}, origin);
  }
  if (method === "GET" && path === "/admin/users") {
    const url = new URL(req.url);
    let q = db.from("users").select("id,email,name,role,onboarded,created_at,deleted_at").order("created_at",{ascending:false});
    if (url.searchParams.get("include_deleted") !== "true") q = q.is("deleted_at", null);
    return json((await q).data || [], 200, {}, origin);
  }
  if (method === "DELETE" && path.startsWith("/admin/users/")) {
    const tid = path.split("/")[3];
    if (tid === uid) return err("Impossible de se supprimer soi-même", 400, origin);
    await db.from("users").update({ deleted_at: new Date().toISOString() }).eq("id", tid);
    return json({ ok: true }, 200, {}, origin);
  }
  if (method === "POST" && path.includes("/restore")) {
    await db.from("users").update({ deleted_at: null }).eq("id", path.split("/")[3]);
    return json({ ok: true }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

async function handleChat(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  const db = getDB();
  const uid = String(user.id);

  if (method === "GET" && path === "/chat/history") {
    const res = await db.from("chat_history").select("*").eq("user_id", uid).order("created_at", { ascending: true }).limit(200);
    return json(res.data || [], 200, {}, origin);
  }

  if (method === "DELETE" && path === "/chat/history") {
    await db.from("chat_history").delete().eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }

  if (method === "POST" && path === "/chat") {
    const body = await req.json();
    const msg = String(body.message || "").trim();
    if (!msg) return err("Message vide", 400, origin);

    // Fetch recent conversation history (last 10 exchanges) for context
    const histRes = await db.from("chat_history").select("message,reply").eq("user_id", uid).order("created_at", { ascending: false }).limit(10);
    const recentHistory = ((histRes.data || []) as Array<Record<string, string>>).reverse();

    // Fetch financial context: last 3 periods TCR
    const periodsRes = await db.from("accounting_entries").select("period").eq("user_id", uid);
    const bilanPeriods = await db.from("bilan_entries").select("period").eq("user_id", uid);
    const periods = [...new Set([
      ...(periodsRes.data || []).map((r: Record<string, unknown>) => String(r.period)),
      ...(bilanPeriods.data || []).map((r: Record<string, unknown>) => String(r.period)),
    ])].filter(Boolean).sort().reverse();

    let financialContext = "";
    if (periods.length > 0) {
      const tcrLines: string[] = [];
      for (const period of periods.slice(0, 3)) {
        const entries = ((await db.from("accounting_entries").select("entry_type,amount,label").eq("user_id", uid).eq("period", period)).data || []) as Array<Record<string, unknown>>;
        const tc = entries.filter(e => e.entry_type === "charge").reduce((s, e) => s + Number(e.amount), 0);
        const tp = entries.filter(e => e.entry_type === "produit").reduce((s, e) => s + Number(e.amount), 0);
        tcrLines.push(`  - ${period} : Produits = ${Math.round(tp).toLocaleString("fr-DZ")} DA | Charges = ${Math.round(tc).toLocaleString("fr-DZ")} DA | Résultat net = ${Math.round(tp - tc).toLocaleString("fr-DZ")} DA`);
      }
      financialContext = `\n\nDonnées financières réelles (${periods.length} période(s)) :\n${tcrLines.join("\n")}`;
    }

    // Treasury summary
    const trsRes = await db.from("treasury_entries").select("type,amount").eq("user_id", uid);
    const trs = (trsRes.data || []) as Array<Record<string, unknown>>;
    if (trs.length > 0) {
      const inc = trs.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
      const exp = trs.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      financialContext += `\nTrésorerie globale : Entrées = ${Math.round(inc).toLocaleString("fr-DZ")} DA | Sorties = ${Math.round(exp).toLocaleString("fr-DZ")} DA | Solde = ${Math.round(inc - exp).toLocaleString("fr-DZ")} DA`;
    }

    // Business profile
    const bizRes = await db.from("businesses").select("business_name,business_type,country").eq("user_id", uid).maybeSingle();
    const biz = bizRes.data as Record<string, unknown> | null;
    const bizContext = biz ? `Entreprise : ${biz.business_name || "N/A"} | Secteur : ${biz.business_type || "N/A"} | Pays : ${biz.country || "Algérie"}` : "Aucun profil entreprise configuré.";

    const msgId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.from("chat_history").insert({ id: msgId, user_id: uid, message: msg, reply: "", created_at: now });

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    let reply = "";

    if (apiKey) {
      try {
        const systemPrompt = `Tu es AYMA, assistante financière IA pour les PME algériennes. Tu es experte en comptabilité SCF algérienne, en analyse financière et en gestion d'entreprise. Tu réponds toujours en français, de façon professionnelle, claire et actionnable.

${bizContext}${financialContext}

Instructions :
- Utilise les données financières réelles ci-dessus pour répondre précisément
- Si une donnée manque, dis-le et indique où la saisir dans l'application
- Réponds en 2-4 paragraphes max, sois concise et directe
- Utilise des chiffres précis quand tu en as
- Donne toujours une recommandation concrète`;

        const messages: Array<{ role: string; content: string }> = [];
        for (const h of recentHistory) {
          if (h.message) messages.push({ role: "user", content: h.message });
          if (h.reply) messages.push({ role: "assistant", content: h.reply });
        }
        messages.push({ role: "user", content: msg });

        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, system: systemPrompt, messages }),
        });
        if (resp.ok) {
          const aiData = await resp.json() as Record<string, unknown>;
          const content = (aiData.content as Array<Record<string, unknown>>)?.[0]?.text as string;
          if (content) reply = content;
        }
      } catch (e) {
        console.error("[chat] Claude error:", e);
      }
    }

    if (!reply) {
      const q = msg.toLowerCase();
      const hasData = financialContext.length > 0;
      if (q.includes("chiffre") || q.includes("revenu") || q.includes("produit") || q.includes("vente")) {
        reply = hasData ? `Voici vos revenus récents :${financialContext}\n\nPour une analyse détaillée, consultez la page "États financiers" ou "Analyse IA".` : "Vous n'avez pas encore de données financières. Allez dans 'Saisie des données' pour enregistrer vos produits.";
      } else if (q.includes("charge") || q.includes("dépense") || q.includes("coût")) {
        reply = hasData ? `Voici vos charges :${financialContext}\n\nIdentifiez les postes les plus importants pour optimiser vos dépenses.` : "Aucune charge enregistrée. Utilisez 'Saisie des données' pour commencer.";
      } else if (q.includes("résultat") || q.includes("bénéfice") || q.includes("profit") || q.includes("perte")) {
        reply = hasData ? `Résultats nets :${financialContext}` : "Saisissez vos produits et charges pour calculer le résultat net.";
      } else if (q.includes("trésor") || q.includes("liquidité") || q.includes("cash")) {
        reply = hasData ? `Situation de trésorerie :${financialContext}` : "Allez dans 'Trésorerie' pour enregistrer vos mouvements de caisse.";
      } else {
        reply = hasData
          ? `Bonjour ! Je suis AYMA, votre assistante financière.${financialContext}\n\nPosez-moi des questions sur votre rentabilité, vos charges, vos revenus ou votre trésorerie.`
          : "Bonjour ! Je suis AYMA. Je n'ai pas encore de données financières pour votre entreprise. Commencez par saisir vos données dans 'Saisie des données', puis je pourrai vous donner des conseils personnalisés.";
      }
    }

    await db.from("chat_history").update({ reply }).eq("id", msgId);
    return json({ reply }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

async function handleBilling(method: string, path: string, req: Request, origin: string | null): Promise<Response> {
  const PLANS = { free: { id: "free", amount: 0, currency: "usd", limits: { max_reports: 3, banks: ["generic"], max_businesses: 1 } }, pro: { id: "pro", amount: 9.99, currency: "usd", limits: { max_reports: 50, banks: "all", max_businesses: 5 } }, bank_ready: { id: "bank_ready", amount: 49, currency: "usd", limits: { max_reports: -1, banks: "all", max_businesses: -1 } } };
  if (method === "GET" && path === "/billing/plans") return json(Object.values(PLANS).map(p => ({ id: p.id, amount: p.amount, currency: p.currency, limits: p.limits })), 200, {}, origin);
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  if (method === "GET" && path === "/billing/me") {
    const sub = (user.subscription as Record<string,unknown>) || {};
    const tier = String(sub.tier || "free");
    const plan = (PLANS as Record<string,typeof PLANS.free>)[tier] || PLANS.free;
    return json({ tier, limits: plan.limits, expires_at: sub.expires_at || null }, 200, {}, origin);
  }
  return err("Not found", 404, origin);
}

async function handleAnalyzeFinancials(method: string, req: Request, origin: string | null): Promise<Response> {
  if (method !== "POST") return err("Méthode non autorisée", 405, origin);
  let user: Record<string, unknown>;
  try { user = await getUser(req); } catch (e) { return err(String((e as Error).message), 401, origin); }
  const body = await req.json();
  const { frng, bfr, tn, cas, caf, re, rf, delai_clients, delai_fournisseurs, score, langue = "fr" } = body as Record<string, unknown>;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (apiKey) {
    try {
      const systemPrompt = `Tu es AYMA, conseiller financier expert pour les PME et startups algériennes. Réponds uniquement en ${langue === "ar" ? "arabe" : langue === "en" ? "anglais" : "français"}. Fournis des recommandations concrètes et actionnables basées sur les ratios financiers fournis. Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans texte avant ou après.`;
      const userPrompt = `Voici les ratios financiers de l'entreprise :
FRNG = ${frng} DA, BFR = ${bfr} DA, TN = ${tn} DA (Cas ${cas})
CAF = ${caf} DA, RE = ${re}%, RF = ${rf}%
Délai clients = ${delai_clients} jours, Délai fournisseurs = ${delai_fournisseurs} jours
Score de santé = ${score}/100

Génère 4 à 5 recommandations prioritaires sous ce format JSON exact :
{"recommandations":[{"priorite":"haute|moyenne|faible","titre":"...","detail":"...","action":"..."}]}`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (resp.ok) {
        const aiData = await resp.json() as Record<string, unknown>;
        const content = (aiData.content as Array<Record<string, unknown>>)?.[0]?.text as string;
        if (content) {
          const parsed = JSON.parse(content);
          // Save to ai_analyses table
          const db = getDB();
          await db.from("ai_analyses").insert({
            id: crypto.randomUUID(),
            user_id: String(user.id),
            frng: Number(frng), bfr: Number(bfr), tn: Number(tn),
            cas_equilibre: Number(cas), caf: Number(caf),
            re: Number(re), rf: Number(rf),
            delai_clients: Number(delai_clients), delai_fourn: Number(delai_fournisseurs),
            score_sante: Number(score),
            recommandations: parsed.recommandations,
            created_at: new Date().toISOString(),
          }).catch(() => {/* ignore save errors */});
          return json(parsed, 200, {}, origin);
        }
      }
    } catch (e) {
      console.error("[analyze-financials] Claude error:", e);
    }
  }

  // Fallback: rule-based recommendations
  const recs: Array<Record<string, string>> = [];
  if (Number(frng) < 0) recs.push({ priorite: "haute", titre: "Renforcer les capitaux permanents", detail: `Votre FRNG de ${Number(frng).toLocaleString("fr-DZ")} DA est négatif, indiquant que vos ressources permanentes ne couvrent pas vos actifs immobilisés.`, action: "Envisagez une augmentation de capital, des emprunts à long terme ou la cession d'actifs non stratégiques." });
  if (Number(tn) < 0) recs.push({ priorite: "haute", titre: "Améliorer la trésorerie nette", detail: `Votre trésorerie nette est négative (${Number(tn).toLocaleString("fr-DZ")} DA), créant un risque de défaut de paiement à court terme.`, action: "Négociez des lignes de crédit court terme et accélérez l'encaissement de vos créances clients." });
  if (Number(caf) < 0) recs.push({ priorite: "haute", titre: "Améliorer la capacité d'autofinancement", detail: "Votre CAF négative indique que l'activité ne génère pas suffisamment de ressources pour se financer elle-même.", action: "Réduisez les charges fixes, améliorez la marge brute et négociez de meilleures conditions d'achat." });
  if (Number(re) < 1) recs.push({ priorite: "moyenne", titre: "Optimiser la rentabilité économique", detail: `Votre rentabilité économique de ${Number(re).toFixed(2)}% est inférieure au seuil minimal de 1%.`, action: "Optimisez l'utilisation de vos actifs : réduisez les stocks dormants et améliorer le taux d'utilisation des équipements." });
  if (Number(delai_clients) > 90) recs.push({ priorite: "haute", titre: "Réduire les délais de paiement clients", detail: `Vos clients paient en moyenne en ${delai_clients} jours, bien au-delà du seuil optimal de 60 jours.`, action: "Mettez en place des relances automatiques à J+30 et J+60, et envisagez l'affacturage pour les créances importantes." });
  else if (Number(delai_clients) > Number(delai_fournisseurs)) recs.push({ priorite: "moyenne", titre: "Équilibrer les délais clients / fournisseurs", detail: `Vous encaissez en ${delai_clients}j mais payez en ${delai_fournisseurs}j, créant un décalage de trésorerie de ${Math.round(Number(delai_clients) - Number(delai_fournisseurs))} jours.`, action: "Négociez des délais de paiement plus longs avec vos fournisseurs ou accélérez l'encaissement client." });
  if (recs.length === 0) recs.push({ priorite: "faible", titre: "Maintenir l'équilibre financier", detail: "Vos indicateurs financiers sont globalement dans les normes. Continuez à surveiller régulièrement vos ratios.", action: "Planifiez des analyses trimestrielles et anticipez les besoins de financement pour votre croissance." });
  return json({ recommandations: recs }, 200, {}, origin);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const url = new URL(req.url);
  let p = url.pathname;
  const fnMatch = p.match(/^\/functions\/v1\/api(.*)/);
  p = fnMatch ? (fnMatch[1] || "/") : p;
  const apiMatch = p.match(/^\/api(.*)/);
  p = apiMatch ? (apiMatch[1] || "/") : p;
  if (!p || p === "") p = "/";
  const method = req.method.toUpperCase();
  try {
    if (p === "/") return json({ app: "AYMAFIN", status: "ok", version: 4 }, 200, {}, origin);
    if (p.startsWith("/auth")) return await handleAuth(method, p.slice(5) || "/", req, origin);
    if (p === "/business" || p === "/analysis" || p === "/forecasts") return await handleBusiness(method, p, req, origin);
    if (p.startsWith("/accounting")) return await handleAccounting(method, p, req, origin);
    if (p.startsWith("/treasury")) return await handleTreasury(method, p, req, origin);
    if (p.startsWith("/reports")) return await handleReports(method, p, req, origin);
    if (p === "/ai-analysis") return await handleAIAnalysis(method, p, req, origin);
    if (p === "/analyze-financials") return await handleAnalyzeFinancials(method, req, origin);
    if (p.startsWith("/admin")) return await handleAdmin(method, p, req, origin);
    if (p.startsWith("/chat")) return await handleChat(method, p, req, origin);
    if (p.startsWith("/billing")) return await handleBilling(method, p, req, origin);
    return err("Not found", 404, origin);
  } catch (e) {
    console.error("[FATAL]", e);
    return err("Erreur interne du serveur", 500, origin);
  }
});
