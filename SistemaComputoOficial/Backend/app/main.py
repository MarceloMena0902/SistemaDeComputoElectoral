"""
Sistema de Computo Oficial - API Principal
FastAPI + PostgreSQL (Streaming Replication) + HAProxy
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import run_migrations
from app.routers import actas, auditoria, dashboard, automatizacion, territorio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Sistema de Computo Oficial Electoral",
    description=(
        "API para el registro y consulta del Cómputo Oficial. "
        "PostgreSQL Streaming Replication + HAProxy HA."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    if settings.RUN_MIGRATIONS:
        logger.info("Ejecutando migraciones...")
        try:
            await run_migrations()
        except Exception as exc:
            logger.error(f"Error en migraciones: {exc}")
            raise
    logger.info("API del Computo Oficial lista. v2.0")


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("API cerrando conexiones...")


# ─── Routers ──────────────────────────────────────────────────────
app.include_router(actas.router,           prefix="/api",                    tags=["Actas"])
app.include_router(dashboard.router,       prefix="/api/dashboard",          tags=["Dashboard"])
app.include_router(auditoria.router,       prefix="/api/auditoria",          tags=["Auditoria"])
app.include_router(automatizacion.router,  prefix="/api/automatizacion",     tags=["Automatizacion"])
app.include_router(territorio.router,      prefix="/api/territorio",         tags=["Territorio"])


@app.get("/health", tags=["Sistema"])
async def health_check():
    return {"status": "ok", "service": "computo-oficial-api", "version": "2.0.0"}


@app.get("/", tags=["Sistema"])
async def root():
    return {
        "service": "Sistema de Computo Oficial Electoral",
        "version": "2.0.0",
        "docs": "/docs",
    }
