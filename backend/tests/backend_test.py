"""
AYMAFIN Backend API Tests
Tests cover: auth (register/login/me/logout/lockout), business CRUD,
analysis, forecasts, reports (CRUD + PDF), chat (mock), error paths.
"""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend env file
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@aymafin.com"
ADMIN_PASSWORD = "admin123"

# Unique fresh email for register tests
RUN_TAG = uuid.uuid4().hex[:8]
NEW_EMAIL = f"TEST_e2e_{RUN_TAG}@aymafin.com"
NEW_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def reg_session():
    """Session that registers a fresh user (will hold cookie)."""
    s = requests.Session()
    r = s.post(f"{API}/auth/register",
               json={"email": NEW_EMAIL, "password": NEW_PASSWORD, "name": "E2E Tester"},
               timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed {r.status_code}: {r.text}")
    return s


# ---------- Health ----------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("app") == "AYMAFIN"
        assert body.get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_register_returns_user_and_sets_cookie(self):
        s = requests.Session()
        email = f"TEST_reg_{uuid.uuid4().hex[:6]}@aymafin.com"
        r = s.post(f"{API}/auth/register",
                   json={"email": email, "password": "Passw0rd!", "name": "Reg User"},
                   timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email.lower()
        assert data["name"] == "Reg User"
        assert data["onboarded"] is False
        assert "id" in data
        # Cookie set
        assert "access_token" in s.cookies, f"cookie not set, got: {dict(s.cookies)}"

    def test_register_duplicate_email_400(self, reg_session):
        r = requests.post(f"{API}/auth/register",
                          json={"email": NEW_EMAIL, "password": "x" * 8, "name": "Dup"},
                          timeout=20)
        assert r.status_code == 400

    def test_login_success_sets_cookie(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login",
                   json={"email": NEW_EMAIL, "password": NEW_PASSWORD},
                   timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == NEW_EMAIL.lower()
        assert "access_token" in s.cookies

    def test_login_wrong_password_401(self):
        # use a fresh isolated email so we don't trip the lockout for shared tests
        s = requests.Session()
        email = f"TEST_wrong_{uuid.uuid4().hex[:6]}@aymafin.com"
        s.post(f"{API}/auth/register",
               json={"email": email, "password": "RightPass1!", "name": "WP"},
               timeout=20)
        r = s.post(f"{API}/auth/login",
                   json={"email": email, "password": "wrong-pass"},
                   timeout=20)
        assert r.status_code == 401

    def test_me_with_cookie(self, reg_session):
        r = reg_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == NEW_EMAIL.lower()

    def test_me_without_cookie_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout_clears_cookie(self):
        s = requests.Session()
        s.post(f"{API}/auth/login",
               json={"email": NEW_EMAIL, "password": NEW_PASSWORD}, timeout=15)
        assert "access_token" in s.cookies
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # cookie cleared either via empty value or removal
        token = s.cookies.get("access_token")
        assert not token, f"cookie still set: {token}"
        # me should now be 401
        r2 = s.get(f"{API}/auth/me", timeout=15)
        assert r2.status_code == 401

    def test_brute_force_lockout_429_after_5_fails(self):
        # use unique email to avoid affecting other tests (lockout is keyed by ip:email)
        email = f"TEST_bf_{uuid.uuid4().hex[:6]}@aymafin.com"
        # register first so the user exists
        s = requests.Session()
        s.post(f"{API}/auth/register",
               json={"email": email, "password": "GoodPass1!", "name": "BF"},
               timeout=15)
        # Send 5 wrong-password attempts -> all 401, threshold trips on the 5th
        last = None
        for i in range(5):
            last = requests.post(f"{API}/auth/login",
                                 json={"email": email, "password": "bad-pw"},
                                 timeout=15)
            assert last.status_code == 401, f"attempt {i+1}: {last.status_code} {last.text}"
        # Next attempt (even with right password) should be locked -> 429
        r = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": "GoodPass1!"},
                          timeout=15)
        assert r.status_code == 429, f"expected 429, got {r.status_code} {r.text}"


# ---------- Business ----------
SAMPLE_BUSINESS = {
    "business_name": "TEST_AcmeDZ",
    "business_type": "retail",
    "industry": "fashion",
    "country": "Algeria",
    "currency": "DZD",
    "initial_capital": 5000000,
    "revenue_streams": [
        {"name": "Boutique", "monthly_amount": 800000},
        {"name": "Online",   "monthly_amount": 200000},
    ],
    "expenses": [
        {"name": "Loyer",    "monthly_amount": 150000, "category": "rent"},
        {"name": "Salaires", "monthly_amount": 400000, "category": "payroll"},
        {"name": "Stock",    "monthly_amount": 250000, "category": "cogs"},
    ],
    "employees": 6,
}


class TestBusiness:
    def test_create_business_marks_onboarded(self, reg_session):
        r = reg_session.post(f"{API}/business", json=SAMPLE_BUSINESS, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "id" in body
        # confirm onboarded flag
        me = reg_session.get(f"{API}/auth/me", timeout=15).json()
        assert me["onboarded"] is True

    def test_get_business_returns_data(self, reg_session):
        r = reg_session.get(f"{API}/business", timeout=15)
        assert r.status_code == 200
        biz = r.json()
        assert biz["business_name"] == SAMPLE_BUSINESS["business_name"]
        assert biz["currency"] == "DZD"
        assert len(biz["revenue_streams"]) == 2
        assert len(biz["expenses"]) == 3

    def test_business_unauth_401(self):
        r = requests.get(f"{API}/business", timeout=15)
        assert r.status_code == 401


# ---------- Analysis & Forecasts ----------
class TestAnalysis:
    def test_get_analysis_shape(self, reg_session):
        r = reg_session.get(f"{API}/analysis", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        a = data["analysis"]
        for k in ["revenue_monthly", "expenses_monthly", "profit_monthly",
                  "margin_pct", "burn_rate_monthly", "risk_level", "recommendations"]:
            assert k in a, f"missing key {k}"
        # numeric checks - revenue 1,000,000 expenses 800,000 profit 200,000
        assert a["revenue_monthly"] == 1000000
        assert a["expenses_monthly"] == 800000
        assert a["profit_monthly"] == 200000
        assert "runway_months" in a  # may be None for profitable
        assert isinstance(a["recommendations"], list) and len(a["recommendations"]) >= 1
        # Iter2: recommendations are now [{key, params}] (i18n keys, not raw FR strings)
        for r in a["recommendations"]:
            assert isinstance(r, dict), f"reco should be dict, got {type(r)}: {r}"
            assert "key" in r and isinstance(r["key"], str)
            assert "params" in r and isinstance(r["params"], dict)
        assert a["risk_level"] in ("low", "medium", "high")

        assert isinstance(data["cashflow"], list) and len(data["cashflow"]) == 12
        assert isinstance(data["expense_breakdown"], list)
        # Iter2: activity log is also localized with key/params/ts/type
        assert "activity" in data and isinstance(data["activity"], list) and len(data["activity"]) >= 1
        for act in data["activity"]:
            assert "key" in act and isinstance(act["key"], str)
            assert "params" in act and isinstance(act["params"], dict)
            assert "ts" in act
            assert "type" in act

    def test_forecasts_3_scenarios_12_months(self, reg_session):
        r = reg_session.get(f"{API}/forecasts", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        scen = data["scenarios"]
        assert set(scen.keys()) == {"optimistic", "realistic", "pessimistic"}
        for name, s in scen.items():
            assert len(s) == 12, f"{name} should have 12 months, got {len(s)}"
            for row in s:
                for k in ["month", "revenue", "expenses", "profit", "cash"]:
                    assert k in row


# ---------- Reports ----------
class TestReports:
    def test_create_list_download_pdf(self, reg_session):
        # CREATE
        r = reg_session.post(f"{API}/reports", timeout=20)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        # LIST
        r2 = reg_session.get(f"{API}/reports", timeout=15)
        assert r2.status_code == 200
        items = r2.json()
        ids = [i["id"] for i in items]
        assert rid in ids

        # PDF DOWNLOAD
        r3 = reg_session.get(f"{API}/reports/{rid}/pdf", timeout=30)
        assert r3.status_code == 200
        assert r3.headers.get("content-type", "").startswith("application/pdf")
        assert r3.content[:4] == b"%PDF", "Response is not a PDF"
        assert len(r3.content) > 1000

    def test_pdf_404_for_unknown_id(self, reg_session):
        r = reg_session.get(f"{API}/reports/{uuid.uuid4()}/pdf", timeout=15)
        assert r.status_code == 404


# ---------- Chat ----------
class TestChat:
    def test_chat_reply(self, reg_session):
        r = reg_session.post(f"{API}/chat", json={"message": "Quel est mon risque ?"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "reply" in body and isinstance(body["reply"], str) and len(body["reply"]) > 0

    def test_chat_history_includes_message(self, reg_session):
        # send another message
        reg_session.post(f"{API}/chat", json={"message": "Quelle est ma marge ?"}, timeout=20)
        r = reg_session.get(f"{API}/chat/history", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 2
        assert all("message" in i and "reply" in i for i in items)


# ---------- Iter2: Banks endpoint ----------
class TestBanks:
    def test_list_banks(self, session):
        r = session.get(f"{API}/banks", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        codes = {b["code"] for b in data}
        # Must include all 5 supported banks
        for c in ["generic", "bna", "bea", "cpa", "badr"]:
            assert c in codes, f"missing bank {c} in {codes}"
        for b in data:
            assert "name" in b
            assert "color" in b
            assert "full_name_fr" in b and "full_name_en" in b and "full_name_ar" in b


# ---------- Iter2: Bank-specific PDF templates + lang ----------
class TestBankPdf:
    def test_pdf_bna_fr(self, reg_session):
        # ensure a report exists
        rid = reg_session.post(f"{API}/reports", timeout=15).json()["id"]
        r = reg_session.get(f"{API}/reports/{rid}/pdf", params={"bank": "bna", "lang": "fr"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 3000, f"PDF too small: {len(r.content)}"
        cd = r.headers.get("content-disposition", "")
        assert "aymafin-bna-" in cd
        # Iter3: response headers expose X-Bank-Used + X-Lang-Used
        assert r.headers.get("x-bank-used") == "bna", f"X-Bank-Used header missing/wrong: {dict(r.headers)}"
        assert r.headers.get("x-lang-used") == "fr"

    def test_pdf_badr_ar(self, reg_session):
        rid = reg_session.post(f"{API}/reports", timeout=15).json()["id"]
        r = reg_session.get(f"{API}/reports/{rid}/pdf", params={"bank": "badr", "lang": "ar"}, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 3000
        assert "aymafin-badr-" in r.headers.get("content-disposition", "")

    def test_pdf_cpa_en(self, reg_session):
        rid = reg_session.post(f"{API}/reports", timeout=15).json()["id"]
        r = reg_session.get(f"{API}/reports/{rid}/pdf", params={"bank": "cpa", "lang": "en"}, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 3000

    def test_pdf_invalid_bank_falls_back(self, reg_session):
        rid = reg_session.post(f"{API}/reports", timeout=15).json()["id"]
        r = reg_session.get(f"{API}/reports/{rid}/pdf", params={"bank": "unknown_xyz", "lang": "klingon"}, timeout=30)
        assert r.status_code == 200, f"expected fallback 200, got {r.status_code}: {r.text[:200]}"
        assert r.content[:4] == b"%PDF"
        # Filename should fall back to generic
        assert "aymafin-generic-" in r.headers.get("content-disposition", "")
        # Iter3: headers reflect resolved fallback values
        assert r.headers.get("x-bank-used") == "generic"
        assert r.headers.get("x-lang-used") in ("fr", "en", "ar")


# ---------- Iter3: Legacy snapshot PDF compatibility ----------
class TestLegacyPdf:
    def test_legacy_recommendations_shape_pdf_renders(self, reg_session, admin_session):
        """A report whose snapshot.recommendations is the legacy [{title, detail}]
        list (not the new [{key, params}] shape) must still render to a valid PDF."""
        # Create a normal report first (gives us a doc with the right user_id, etc.)
        rid = reg_session.post(f"{API}/reports", timeout=15).json()["id"]

        # Mutate the report doc directly via a tiny admin-only helper would be ideal,
        # but since none exists we use a backdoor: write to mongo via the python driver.
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from config import db  # noqa: E402

        legacy_snapshot = {
            "revenue_monthly": 1000000,
            "expenses_monthly": 800000,
            "profit_monthly": 200000,
            "margin_pct": 20.0,
            "burn_rate_monthly": 0,
            "runway_months": None,
            "risk_level": "low",
            "risk_score": 30,
            "currency": "DZD",
            "recommendations": [
                {"title": "Réduire les coûts", "detail": "Diminuer les charges fixes de 10%"},
                {"title": "Augmenter le revenu", "detail": "Lancer une nouvelle gamme produits"},
            ],
        }

        async def _patch():
            await db.reports.update_one(
                {"id": rid},
                {"$set": {"snapshot": legacy_snapshot}},
            )
        asyncio.get_event_loop().run_until_complete(_patch()) if False else asyncio.run(_patch())

        # Now download — must NOT 500
        r = reg_session.get(f"{API}/reports/{rid}/pdf", params={"bank": "generic", "lang": "fr"}, timeout=30)
        assert r.status_code == 200, f"legacy snapshot PDF should not 500, got {r.status_code}: {r.text[:300]}"
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1500


# ---------- Iter2: Admin endpoints ----------
class TestAdmin:
    def test_admin_stats_requires_admin(self, reg_session):
        # Non-admin -> 403
        r = reg_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 403, f"expected 403 for non-admin, got {r.status_code}"

    def test_admin_stats_admin_ok(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["total_users", "onboarded_users", "total_businesses", "total_reports", "total_chats", "new_users_7d", "deleted_users"]:
            assert k in data, f"missing {k}"
            assert isinstance(data[k], int), f"{k} should be int, got {type(data[k])}"

    def test_admin_users_requires_admin(self, reg_session):
        r = reg_session.get(f"{API}/admin/users", timeout=15)
        assert r.status_code == 403

    def test_admin_users_admin_ok(self, admin_session):
        r = admin_session.get(f"{API}/admin/users", timeout=15)
        assert r.status_code == 200, r.text
        users = r.json()
        assert isinstance(users, list) and len(users) >= 1
        u0 = users[0]
        for k in ["id", "email", "name", "role", "onboarded", "created_at", "business", "reports_count", "chats_count"]:
            assert k in u0, f"missing field {k} in admin users response"
        # password_hash MUST not leak
        assert "password_hash" not in u0
        # _id must not leak
        assert "_id" not in u0

    def test_admin_cannot_delete_self(self, admin_session):
        me = admin_session.get(f"{API}/auth/me", timeout=15).json()
        r = admin_session.delete(f"{API}/admin/users/{me['id']}", timeout=15)
        assert r.status_code == 400, f"expected 400 self-delete, got {r.status_code}: {r.text}"

    def test_admin_delete_user_cascades(self, admin_session):
        # Create a throwaway user, then delete via admin and verify cascade (soft delete in iter3)
        s = requests.Session()
        email = f"TEST_del_{uuid.uuid4().hex[:6]}@aymafin.com"
        r = s.post(f"{API}/auth/register",
                   json={"email": email, "password": "DelMe123!", "name": "DelMe"},
                   timeout=15)
        assert r.status_code == 200
        target_id = r.json()["id"]
        # add a business so cascade has something to remove
        s.post(f"{API}/business", json=SAMPLE_BUSINESS, timeout=15)
        s.post(f"{API}/reports", timeout=15)
        s.post(f"{API}/chat", json={"message": "hello"}, timeout=15)

        # admin soft-deletes
        r2 = admin_session.delete(f"{API}/admin/users/{target_id}", timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("ok") is True
        assert "soft_deleted_at" in body
        assert body.get("user_id") == target_id

        # Verify user is no longer listed by default
        users = admin_session.get(f"{API}/admin/users", timeout=15).json()
        ids = [u["id"] for u in users]
        assert target_id not in ids

        # With include_deleted=true, user should appear w/ deleted_at field
        users_all = admin_session.get(f"{API}/admin/users", params={"include_deleted": "true"}, timeout=15).json()
        ids_all = [u["id"] for u in users_all]
        assert target_id in ids_all
        deleted_user = next(u for u in users_all if u["id"] == target_id)
        assert deleted_user.get("deleted_at"), "deleted_at should be present"

        # Deleted user cannot login (401)
        s2 = requests.Session()
        rl = s2.post(f"{API}/auth/login", json={"email": email, "password": "DelMe123!"}, timeout=15)
        assert rl.status_code == 401, f"expected 401 for deleted user login, got {rl.status_code}"

        # Re-deleting already-deleted user -> 400 (already deleted)
        r3 = admin_session.delete(f"{API}/admin/users/{target_id}", timeout=15)
        assert r3.status_code == 400, f"expected 400 already-deleted, got {r3.status_code}: {r3.text}"

        # Restore
        r4 = admin_session.post(f"{API}/admin/users/{target_id}/restore", timeout=15)
        assert r4.status_code == 200, r4.text
        body4 = r4.json()
        assert body4.get("ok") is True and body4.get("restored") is True

        # After restore, login works again
        s3 = requests.Session()
        rl2 = s3.post(f"{API}/auth/login", json={"email": email, "password": "DelMe123!"}, timeout=15)
        assert rl2.status_code == 200, f"expected 200 after restore, got {rl2.status_code}"

        # Restore an already-active user -> 400
        r5 = admin_session.post(f"{API}/admin/users/{target_id}/restore", timeout=15)
        assert r5.status_code == 400

    def test_admin_delete_unauth(self, reg_session):
        # Non-admin trying to delete some random id -> 403 (auth check before existence)
        r = reg_session.delete(f"{API}/admin/users/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 403

