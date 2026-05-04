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

const PLAN_CHARGES: Record<string, { name: string; accounts: Record<string, string> }> = {
  "60": { name: "Achats", accounts: { "601": "Achats stockés - Matières premières", "602": "Achats stockés - Autres approvisionnements", "603": "Variations de stocks", "604": "Achat d'études et prestations de services", "605": "Achats de matériels, équipements et travaux", "606": "Achats non stockés de matières et fournitures", "607": "Achats de marchandises", "608": "Frais accessoires d'achats", "609": "Rabais, remises et ristournes obtenus sur achats" } },
  "61": { name: "Services extérieurs", accounts: { "611": "Sous-traitance générale", "612": "Redevances de crédit-bail", "613": "Locations", "614": "Charges locatives et de co-propriété", "615": "Entretiens et réparations", "616": "Primes d'assurance", "617": "Études et recherches", "618": "Divers", "619": "RRR obtenus sur services extérieurs" } },
  "62": { name: "Autres services extérieurs", accounts: { "621": "Personnel extérieur", "622": "Rémunérations d'intermédiaires et honoraires", "623": "Publicité, publications, relations publiques", "624": "Transports de biens et collectifs", "625": "Déplacements, missions et réceptions", "626": "Frais postaux et télécommunications", "627": "Services bancaires", "628": "Divers", "629": "RRR obtenus sur autres services" } },
  "63": { name: "Impôts, taxes et versements assimilés", accounts: { "631": "Impôts, taxes sur rémunérations", "633": "Impôts, taxes assimilés" } },
  "64": { name: "Charges de personnel", accounts: { "641": "Rémunérations du personnel", "645": "Charges de sécurité sociale", "647": "Autres charges sociales", "648": "Autres charges de personnel" } },
  "65": { name: "Autres charges de gestion courante", accounts: { "651": "Redevances pour concessions", "652": "Valeur comptable des éléments d'actif cédés", "654": "Pertes sur créances irrécouvrables", "658": "Autres charges de gestion courante" } },
  "66": { name: "Charges financières", accounts: { "661": "Charges d'intérêts", "664": "Pertes sur créances liées aux participations", "665": "Escomptes accordés", "666": "Pertes de change", "668": "Autres charges financières" } },
  "67": { name: "Charges exceptionnelles", accounts: { "671": "Charges exceptionnelles sur opérations de gestion", "672": "Charges sur exercices antérieurs", "678": "Autres charges exceptionnelles" } },
  "68": { name: "Dotations aux amortissements et dépréciations", accounts: { "681": "Dotations aux amortissements d'exploitation", "686": "Dotations aux amortissements financières", "687": "Dotations aux amortissements exceptionnelles" } },
  "69": { name: "Impôts sur les bénéfices", accounts: { "695": "Impôts sur les bénéfices", "699": "Produits - report en arrière des déficits" } }
};

const PLAN_PRODUITS: Record<string, { name: string; accounts: Record<string, string> }> = {
  "70": { name: "Ventes de produits fabriqués, prestations de services", accounts: { "701": "Ventes de produits finis", "702": "Ventes de produits intermédiaires", "703": "Ventes de produits résiduels", "704": "Travaux", "705": "Études", "706": "Prestations de services", "707": "Ventes de marchandises", "708": "Produits des activités annexes", "709": "RRR accordés" } },
  "71": { name: "Production stockée", accounts: { "713": "Variations de stocks" } },
  "72": { name: "Production immobilisée", accounts: { "721": "Immobilisations incorporelles", "722": "Immobilisations corporelles" } },
  "73": { name: "Concours publics", accounts: { "731": "Concours publics" } },
  "74": { name: "Subventions d'exploitation", accounts: { "741": "Subventions d'exploitation" } },
  "75": { name: "Autres produits de gestion courante", accounts: { "751": "Redevances concessions", "752": "Revenus des immeubles", "755": "Contributions financières", "756": "Cotisations", "758": "Indemnités et autres produits" } },
  "76": { name: "Produits financiers", accounts: { "761": "Produits des participations", "762": "Produits des immobilisations financières", "764": "Revenus valeurs mobilières", "765": "Escomptes obtenus", "766": "Gains de change", "768": "Autres produits financiers" } },
  "77": { name: "Produits exceptionnels", accounts: { "772": "Produits sur exercices antérieurs", "775": "Produits de cessions d'éléments d'actif", "778": "Autres produits exceptionnels" } },
  "78": { name: "Reprises sur amortissements et dépréciations", accounts: { "781": "Reprises d'exploitation", "786": "Reprises financières", "787": "Reprises exceptionnelles" } },
  "79": { name: "Transfert de charges", accounts: { "791": "Transferts d'exploitation", "796": "Transferts financiers", "797": "Transferts exceptionnels" } }
};

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
  if (method === "GET" && path === "/accounting/plan") return json({ charges: PLAN_CHARGES, produits: PLAN_PRODUITS }, 200, {}, origin);
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
    const code = String(body.account_code || "");
    const etype = code[0] === "6" ? "charge" : code[0] === "7" ? "produit" : null;
    if (!etype) return err("Code compte invalide (doit commencer par 6 ou 7)", 400, origin);
    const now = new Date().toISOString();
    const existing = await db.from("accounting_entries").select("id").eq("user_id", uid).eq("period", body.period).eq("account_code", code).maybeSingle();
    if (existing.data) {
      await db.from("accounting_entries").update({ amount: body.amount, note: body.note, updated_at: now }).eq("id", (existing.data as Record<string,unknown>).id);
      return json({ id: (existing.data as Record<string,unknown>).id, ok: true }, 200, {}, origin);
    }
    const id = crypto.randomUUID();
    await db.from("accounting_entries").insert({ id, user_id: uid, period: body.period, account_code: code, entry_type: etype, amount: body.amount, note: body.note || null, created_at: now, updated_at: now });
    return json({ id, ok: true }, 200, {}, origin);
  }
  if (method === "DELETE" && path.startsWith("/accounting/entries/")) {
    await db.from("accounting_entries").delete().eq("id", path.split("/")[3]).eq("user_id", uid);
    return json({ ok: true }, 200, {}, origin);
  }
  if (method === "GET" && path === "/accounting/tcr") {
    const res = await db.from("accounting_entries").select("*").eq("user_id", uid).eq("period", period);
    const entries = (res.data || []) as Array<Record<string,unknown>>;
    const charges: Record<string,number> = {}, produits: Record<string,number> = {};
    for (const e of entries) { if (e.entry_type === "charge") charges[String(e.account_code)] = Number(e.amount); else produits[String(e.account_code)] = Number(e.amount); }
    const groupByClass = (data: Record<string,number>, plan: typeof PLAN_CHARGES) => Object.entries(plan).map(([cls, info]) => ({ class: cls, name: info.name, subtotal: Math.round(Object.entries(data).filter(([k]) => k.startsWith(cls)).reduce((s,[,v]) => s+v, 0)*100)/100, accounts: Object.entries(info.accounts).filter(([k]) => (data[k]||0) !== 0).map(([k,n]) => ({ code: k, name: n, amount: data[k]||0 })) }));
    const tc = Object.values(charges).reduce((s,v) => s+v, 0), tp = Object.values(produits).reduce((s,v) => s+v, 0);
    return json({ period, charges_detail: groupByClass(charges, PLAN_CHARGES), produits_detail: groupByClass(produits, PLAN_PRODUITS), charges_raw: charges, produits_raw: produits, total_charges: Math.round(tc*100)/100, total_produits: Math.round(tp*100)/100, resultat_net: Math.round((tp-tc)*100)/100 }, 200, {}, origin);
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
    const charges_raw: Record<string,number> = {}, produits_raw: Record<string,number> = {};
    for (const e of entries) { if (e.entry_type==="charge") charges_raw[String(e.account_code)]=Number(e.amount); else produits_raw[String(e.account_code)]=Number(e.amount); }
    const tc = Object.values(charges_raw).reduce((s,v)=>s+v,0), tp = Object.values(produits_raw).reduce((s,v)=>s+v,0);
    const tcr = { charges_raw, produits_raw, total_charges: tc, total_produits: tp, resultat_net: tp-tc };
    const rawRes = await db.from("bilan_entries").select("*").eq("user_id", uid).eq("period", period).maybeSingle();
    if (!rawRes.data) return err("Données de bilan introuvables pour cette période.", 404, origin);
    const raw = rawRes.data as Record<string,number>;
    const iinc = raw.immo_incorporelles_brut - raw.immo_incorporelles_amort;
    const icorp = raw.immo_corporelles_brut - raw.immo_corporelles_amort;
    const anc = raw.ecarts_acquisition + iinc + icorp + raw.immo_financieres + raw.impots_differes_actif;
    const ac = raw.stocks + raw.creances_clients + raw.autres_debiteurs + raw.impots_taxes_recuperables + raw.tresorerie_actif;
    const cp = raw.capital + raw.reserves + tcr.resultat_net + raw.autres_capitaux_propres;
    const pnc = raw.emprunts_lt + raw.impots_differes_passif;
    const pc = raw.fournisseurs + raw.dettes_personnel + raw.dettes_impots + raw.autres_dettes_ct + raw.decouvert_bancaire;
    const frng = (cp+pnc) - anc, dispo = raw.tresorerie_actif, avances = raw.decouvert_bancaire;
    const bfr = (ac - dispo) - (pc - avances), tn = frng - bfr;
    const thr = Math.abs(Math.max(Math.abs(frng),Math.abs(bfr),Math.abs(tn),1))*0.05;
    const cas_e = frng>thr&&bfr<-thr&&tn>thr?1:frng>thr&&bfr>thr&&tn>thr?2:frng>thr&&bfr>thr&&tn>-thr&&tn<thr?3:frng<-thr&&bfr<-thr&&tn>thr?4:frng<-thr&&bfr>thr&&tn<-thr?5:frng<-thr&&tn<-thr?6:7;
    const emojis=["✅","✅","⚠️","⚠️","🚨","🚨","⚠️"], interps=["Situation très favorable","Situation saine","Situation correcte mais sous pression","Situation fragile","Situation difficile","Situation critique","Équilibre précaire"];
    const equilibre = { frng: Math.round(frng*100)/100, bfr: Math.round(bfr*100)/100, tn: Math.round(tn*100)/100, cas: cas_e, emoji: emojis[cas_e-1], interpretation: interps[cas_e-1] };
    const dotations = Object.entries(charges_raw).filter(([k])=>k.startsWith("68")).reduce((s,[,v])=>s+v,0);
    const reprises = Object.entries(produits_raw).filter(([k])=>k.startsWith("78")).reduce((s,[,v])=>s+v,0);
    const caf_val = tcr.resultat_net + dotations - reprises + (charges_raw["652"]||0) - (produits_raw["775"]||0);
    const caf = { caf: Math.round(caf_val*100)/100, cas: caf_val>0?1:caf_val<0?2:3, emoji: caf_val>0?"✅":caf_val<0?"🚨":"⚠️", interpretation: caf_val>0?"CAF positive":caf_val<0?"CAF négative":"CAF nulle" };
    const re = (anc+ac)>0?(tcr.resultat_net/(anc+ac)*100):0, rf = cp>0?(tcr.resultat_net/cp*100):0;
    const rentabilite = { re: Math.round(re*100)/100, rf: Math.round(rf*100)/100, re_cas: re>5?1:re>=1?2:3, re_emoji: re>5?"✅":re>=1?"⚠️":"🚨", re_interpretation: re>5?"Bonne rentabilité":re>=1?"Rentabilité moyenne":"Rentabilité faible", rf_cas: rf>15?1:rf>=5?2:3, rf_emoji: rf>15?"✅":rf>=5?"⚠️":"🚨", rf_interpretation: rf>15?"Bon rendement":rf>=5?"Rendement moyen":"Rendement faible" };
    const ca = Object.entries(produits_raw).filter(([k])=>k.startsWith("70")&&k!=="709").reduce((s,[,v])=>s+v,0);
    const achats = Object.entries(charges_raw).filter(([k])=>k.startsWith("60")&&!["603","609"].includes(k)).reduce((s,[,v])=>s+v,0);
    const dc = ca>0?(raw.creances_clients/ca*360):0, df = achats>0?(raw.fournisseurs/achats*360):0;
    const delais = { delai_clients: Math.round(dc*10)/10, delai_fournisseurs: Math.round(df*10)/10, dc_cas: dc<60?1:dc<=90?2:3, dc_emoji: dc<60?"✅":dc<=90?"⚠️":"🚨", dc_interpretation: dc<60?"Délai clients rapide":dc<=90?"Délai clients correct":"Clients paient lentement", df_cas: df<60?1:df<=90?2:3, df_emoji: df<60?"✅":df<=90?"⚠️":"🚨", df_interpretation: df<60?"Paiement fournisseurs rapide":"Délai fournisseurs normal", comp_cas: dc>df?1:2, comp_emoji: dc>df?"⚠️":"✅", comp_interpretation: dc>df?"Clients paient plus lentement que fournisseurs":"Situation favorable" };
    const recs = [];
    if (frng<0) recs.push({priority:"high",area:"Structure financière",title:"Renforcer les capitaux permanents",action:"FRNG négatif. Augmentez capitaux propres ou emprunts LT."});
    if (tn<0) recs.push({priority:"high",area:"Trésorerie",title:"Améliorer la trésorerie nette",action:"TN négative. Lignes de crédit CT ou accélérez encaissement."});
    if (caf_val<0) recs.push({priority:"high",area:"Autofinancement",title:"Améliorer la CAF",action:"CAF négative. Réduisez charges et améliorez marge brute."});
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
    const res = await db.from("chat_history").select("*").eq("user_id", uid).order("created_at",{ascending:true}).limit(200);
    return json(res.data || [], 200, {}, origin);
  }
  if (method === "POST" && path === "/chat") {
    const body = await req.json();
    const msg = String(body.message || "").trim();
    if (!msg) return err("Message vide", 400, origin);
    const now = new Date().toISOString();
    await db.from("chat_history").insert({ id: crypto.randomUUID(), user_id: uid, message: msg, reply: "", created_at: now });
    const reply = "Analyse en cours... Veuillez configurer votre clé Gemini dans les paramètres du serveur.";
    await db.from("chat_history").update({ reply }).eq("user_id", uid).eq("created_at", now);
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
    if (p.startsWith("/admin")) return await handleAdmin(method, p, req, origin);
    if (p.startsWith("/chat")) return await handleChat(method, p, req, origin);
    if (p.startsWith("/billing")) return await handleBilling(method, p, req, origin);
    return err("Not found", 404, origin);
  } catch (e) {
    console.error("[FATAL]", e);
    return err("Erreur interne du serveur", 500, origin);
  }
});
