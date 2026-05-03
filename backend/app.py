"""AYMAFIN main app — composes routers and runs startup/shutdown."""
import logging
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from config import db, client
from auth_utils import hash_password, verify_password
from routers import auth as auth_router
from routers import business as business_router
from routers import reports as reports_router
from routers import chat as chat_router
from routers import admin as admin_router
from routers import billing as billing_router
from routers import accounting as accounting_router
from routers import treasury as treasury_router
from routers import ai_analysis as ai_analysis_router

logger = logging.getLogger("aymafin")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


async def seed_admin():
    import os
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@aymafin.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "AYMAFIN Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "onboarded": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user: {admin_email}")
    else:
        updates = {}
        if not verify_password(admin_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
        if existing.get("role") != "admin":
            updates["role"] = "admin"
        if updates:
            await db.users.update_one({"email": admin_email}, {"$set": updates})


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("deleted_at")
    await db.businesses.create_index("user_id")
    await db.reports.create_index([("user_id", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    await db.accounting_entries.create_index([("user_id", 1), ("period", 1), ("account_code", 1)])
    await db.bilan_entries.create_index([("user_id", 1), ("period", 1)], unique=True)
    await db.journal_entries.create_index([("user_id", 1), ("date", 1)])
    await db.treasury_entries.create_index([("user_id", 1), ("date", 1)])
    await db.invoices.create_index([("user_id", 1), ("date", -1)])
    await seed_admin()
    yield
    # Shutdown
    client.close()


app = FastAPI(title="AYMAFIN API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router.router)
api_router.include_router(business_router.router)
api_router.include_router(reports_router.router)
api_router.include_router(chat_router.router)
api_router.include_router(admin_router.router)
api_router.include_router(billing_router.router)
api_router.include_router(accounting_router.router)
api_router.include_router(treasury_router.router)
api_router.include_router(ai_analysis_router.router)


@api_router.get("/")
async def root():
    return {"app": "AYMAFIN", "status": "ok"}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Bank-Used", "X-Lang-Used"],
)
