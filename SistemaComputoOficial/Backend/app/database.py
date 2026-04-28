"""
Configuracion de motores de base de datos y sesiones async.

- engine       → conexion de ESCRITURA (va por HAProxy puerto 5000 → solo PRIMARY)
- engine_read  → conexion de LECTURA   (va por HAProxy puerto 5001 → cualquier nodo)
"""
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import text

from app.config import settings

logger = logging.getLogger(__name__)

# ─── Motor de escritura (Primary via HAProxy) ─────────────────────
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# ─── Motor de lectura (any node via HAProxy) ──────────────────────
engine_read = create_async_engine(
    settings.DATABASE_URL_READ,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionWrite = sessionmaker(engine,       class_=AsyncSession, expire_on_commit=False)
AsyncSessionRead  = sessionmaker(engine_read,  class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db_write() -> AsyncSession:
    """Dependencia FastAPI: sesion de escritura."""
    async with AsyncSessionWrite() as session:
        yield session


async def get_db_read() -> AsyncSession:
    """Dependencia FastAPI: sesion de lectura."""
    async with AsyncSessionRead() as session:
        yield session


async def run_migrations() -> None:
    """Ejecuta los archivos SQL de migracion al iniciar la aplicacion."""
    migrations_dir = Path(__file__).parent.parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    async with engine.begin() as conn:
        for sql_file in sql_files:
            logger.info(f"Ejecutando migracion: {sql_file.name}")
            sql = sql_file.read_text(encoding="utf-8")
            # Ejecutar todo el archivo como bloque unico
            await conn.execute(text(sql))

    logger.info(f"Migraciones completadas: {len(sql_files)} archivo(s).")
