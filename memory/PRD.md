# AYMAFIN — Product Requirements Document

## Original Problem Statement
Build AYMAFIN — an AI-powered financial decision engine SaaS for Algerian SMEs (and beyond), with a unique hook: **"Bank-ready financial reports for Algerian SMEs"**. Multilingual (FR default / EN / AR with RTL), dark-mode minimalist SaaS aesthetic, animated 3D-style hero, real PDF reports, 12-month forecasting (3 scenarios), AI chat assistant.

## Stack (adapted to platform)
- Frontend: React 19 + Tailwind + shadcn/ui + framer-motion + recharts + react-i18next
- Backend: FastAPI + MongoDB (motor) + JWT (httpOnly cookies) + bcrypt + reportlab (PDF)
- 3D: Originally Three.js / R3F — switched to framer-motion CSS-animated logo (R3F 9 / drei 10 incompatible with React 19.0)

## User Personas
- **Algerian SME owner / CFO**: needs bank-ready dossiers (BNA, BEA, CPA, BADR), works in FR/AR
- **Startup founder**: needs runway, burn rate, scenario forecasts
- **Bank analyst**: receives the generated PDF for credit decisions

## Core Requirements (static)
1. JWT auth (register / login / me / logout) with brute-force lockout
2. Onboarding wizard (4 steps: company / revenue streams / expenses / capital)
3. Decision engine (margin, burn, runway, risk score 0–10, recommendations)
4. 12-month forecasting (optimistic / realistic / pessimistic)
5. Bank-ready PDF reports (real download, reportlab, investor-style layout)
6. Mock-intelligent AI chat (deterministic, context-aware)
7. Multi-language FR (default) / EN / AR + RTL

## What's Implemented (2026-04-29 — iteration 3)
- ✅ **Backend refactor**: `server.py` reduced to 5-line shim. Code split into `config.py`, `auth_utils.py`, `finance.py`, `pdf_builder.py`, `i18n_data.py` and `routers/{auth,business,reports,chat,admin}.py` — composed in `app.py` with FastAPI `lifespan` handler. Each router < 100 lines.
- ✅ **PDF builder bug fix** (`_resolve_reco`): handles BOTH new `{key, params}` and legacy `{title, detail}` recommendation snapshots — old reports no longer 500.
- ✅ **Soft delete** (admin): `DELETE /api/admin/users/{id}` cascades `{deleted_at, deleted_by}` to user/business/reports. Reads default-filter deleted. `?include_deleted=true` shows them. `POST /api/admin/users/{id}/restore` reverses. Deleted users get 401 on login.
- ✅ **Aggregation perf**: `/api/admin/users` is a single `$lookup` pipeline (was N+1 count_documents).
- ✅ **Admin UI polish**: gradient stat cards (with deleted_users + 7d trend), search box, sortable columns (name/email/revenue/reports/created), avatar initials, role/state chips, pending tag, deleted toggle, restore action, soft-delete confirm modal, hover-to-reveal delete, refresh button.
- ✅ Frontend: animated hero, i18n FR/EN/AR + RTL, dashboard, forecasting, reports (5 banks), chat, settings, admin
- ✅ Tested: **31/31 backend tests + 100% frontend flows** (testing_agent_v3 iteration_3)
- ✅ X-Bank-Used / X-Lang-Used response headers exposed via CORS

## Test Credentials
See `/app/memory/test_credentials.md`.

## Known Limitations / Backlog (P1/P2)
- **P2** — Real LLM integration (Claude/GPT) for context-aware chat & smart recommendations (currently rule-based per user choice)
- **P2** — Localize recommendations strings per language (currently FR only)
- **P2** — Migrate FastAPI startup/shutdown to lifespan handlers
- **P2** — Cookie `secure=True` in production
- **P2** — True 3D R3F hero (blocked by React 19 incompatibility — revisit when fiber 9 stabilizes for React 19.0)
- **P2** — Forgot password flow
- **P2** — Multi-business support per user
- **P1** — Subscription tiers (free / pro / bank-ready) with Stripe billing
- **P1** — Export to Excel (in addition to PDF)
- **P1** — Bank-specific PDF templates (BNA / BEA / CPA / BADR variants)

## Next Tasks
1. Add Stripe-based subscription tiers (revenue-driving)
2. Localize recommendations + add real LLM-driven advice
3. Add a "Share with my banker" link (token-protected report URL) to drive virality among Algerian SMEs
