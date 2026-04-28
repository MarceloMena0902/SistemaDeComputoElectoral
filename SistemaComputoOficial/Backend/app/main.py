"""
Sistema de Computo Oficial - API Principal
FastAPI + PostgreSQL (Streaming Replication) + HAProxy
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import run_migrations
from app.routers import actas, auditoria, dashboard

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Aplicacion FastAPI ───────────────────────────────────────────
app = FastAPI(
    title="Sistema de Computo Oficial Electoral",
    description=(
        "API para el registro y consulta del Cómputo Oficial. "
        "Implementa alta disponibilidad con PostgreSQL Streaming Replication + HAProxy."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS (permitir dashboard frontend) ──────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Eventos de ciclo de vida ─────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    if settings.RUN_MIGRATIONS:
        logger.info("Ejecutando migraciones de base de datos...")
        try:
            await run_migrations()
        except Exception as exc:
            logger.error(f"Error en migraciones: {exc}")
            raise
    logger.info("API del Computo Oficial lista.")


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("API cerrando conexiones...")


# ─── Routers ──────────────────────────────────────────────────────
app.include_router(actas.router,     prefix="/api",            tags=["Actas Oficiales"])
app.include_router(dashboard.router, prefix="/api/dashboard",  tags=["Dashboard"])
app.include_router(auditoria.router, prefix="/api/auditoria",  tags=["Auditoria"])


# ─── Health check de la API ───────────────────────────────────────
@app.get("/health", tags=["Sistema"])
async def health_check():
    return {"status": "ok", "service": "computo-oficial-api"}


@app.get("/", tags=["Sistema"])
async def root():
    return {
        "service": "Sistema de Computo Oficial Electoral",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "registro_acta":       "POST /api/actas/registro",
            "resultados_dashboard": "GET  /api/dashboard/resultados",
            "progreso_geografico": "GET  /api/dashboard/progreso",
            "auditoria_logs":      "GET  /api/auditoria/logs",
            "fallos_db":           "GET  /api/auditoria/fallos-db",
        },
    }
