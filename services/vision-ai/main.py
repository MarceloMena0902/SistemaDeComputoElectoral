"""
Sistema Nacional de Cómputo Electoral - Bolivia
Servicio de Visión Artificial / OCR
FastAPI + OpenCV + EasyOCR
"""

import asyncio
import hashlib
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import aiofiles
import asyncpg
import redis.asyncio as aioredis
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel

from processor import ActaProcessor, CalidadInsuficienteError

# ==============================================================
#  Configuración
# ==============================================================
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://electoral_user:Electoral2024!@postgres:5432/electoral_db"
    redis_url: str = "redis://redis:6379/0"
    upload_dir: str = "/app/uploads"
    workers: int = 4
    log_level: str = "info"
    max_file_size_mb: int = 15

    class Config:
        env_file = ".env"

settings = Settings()
UPLOAD_DIR = Path(settings.upload_dir)


# ==============================================================
#  Estado de la aplicación (conexiones reutilizables)
# ==============================================================
class AppState:
    db_pool: Optional[asyncpg.Pool] = None
    redis: Optional[aioredis.Redis] = None
    processor: Optional[ActaProcessor] = None

app_state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicializa y cierra recursos al arrancar/detener la app."""
    logger.info("Iniciando Vision-AI Service...")

    # Crear directorios de uploads
    (UPLOAD_DIR / "original").mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "processed").mkdir(parents=True, exist_ok=True)

    # Pool de conexiones PostgreSQL
    app_state.db_pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    logger.info("Pool PostgreSQL creado")

    # Conexión Redis
    app_state.redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Conexión Redis establecida")

    # Inicializar procesador OCR (carga el modelo EasyOCR una vez)
    app_state.processor = ActaProcessor(workers=settings.workers)
    logger.info("Procesador OCR inicializado")

    yield

    # Cleanup
    if app_state.db_pool:
        await app_state.db_pool.close()
    if app_state.redis:
        await app_state.redis.aclose()
    logger.info("Vision-AI Service detenido")


# ==============================================================
#  Aplicación FastAPI
# ==============================================================
app = FastAPI(
    title="Electoral Vision AI",
    description="Servicio OCR para actas electorales bolivianas",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================
#  Modelos de respuesta
# ==============================================================
class ResultadoOCR(BaseModel):
    acta_uuid: str
    mesa_id: int
    pipeline: str
    calidad_imagen: float
    angulo_correccion: float
    total_votos_validos: Optional[int]
    total_votos_blancos: Optional[int]
    total_votos_nulos: Optional[int]
    total_votos_emitidos: Optional[int]
    resultados_partidos: dict[str, dict]
    advertencias: list[str]
    imagen_procesada_url: str


class HealthResponse(BaseModel):
    status: str
    db: str
    redis: str
    ocr: str


# ==============================================================
#  Endpoints
# ==============================================================

@app.get("/health", response_model=HealthResponse, tags=["Sistema"])
async def health_check():
    """Verifica el estado de todos los componentes del servicio."""
    checks = {"status": "ok", "db": "ok", "redis": "ok", "ocr": "ok"}

    try:
        async with app_state.db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
    except Exception as e:
        checks["db"] = f"error: {e}"
        checks["status"] = "degraded"

    try:
        await app_state.redis.ping()
    except Exception as e:
        checks["redis"] = f"error: {e}"
        checks["status"] = "degraded"

    if app_state.processor is None:
        checks["ocr"] = "no inicializado"
        checks["status"] = "degraded"

    return checks


@app.post("/actas/procesar", response_model=ResultadoOCR, tags=["OCR"])
async def procesar_acta(
    imagen: UploadFile = File(..., description="Fotografía del acta electoral"),
    mesa_id: int = Form(..., description="ID de la mesa electoral"),
    pipeline: str = Form(..., description="RRV o COMPUTO_OFICIAL"),
    usuario_id: Optional[int] = Form(None),
    latitud: Optional[float] = Form(None),
    longitud: Optional[float] = Form(None),
):
    """
    Endpoint principal: recibe la imagen de un acta, la procesa con OCR
    y guarda los resultados en la base de datos.

    Flujo:
    1. Validar tamaño y tipo de archivo
    2. Calcular hash SHA-256 (detectar duplicados)
    3. Verificar en Redis si ya fue procesada (cache)
    4. Pre-procesar con OpenCV (perspectiva, ruido, contraste)
    5. Ejecutar EasyOCR en proceso paralelo
    6. Validar coherencia de los datos extraídos
    7. Persistir en PostgreSQL con auditoría
    8. Retornar resultados al orquestador n8n
    """
    # --- 1. Validación básica ---
    if pipeline not in ("RRV", "COMPUTO_OFICIAL"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="pipeline debe ser 'RRV' o 'COMPUTO_OFICIAL'",
        )

    content_type = imagen.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Solo se aceptan archivos de imagen",
        )

    # --- 2. Leer bytes y calcular hash ---
    imagen_bytes = await imagen.read()
    if len(imagen_bytes) > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"La imagen supera el límite de {settings.max_file_size_mb}MB",
        )

    hash_imagen = hashlib.sha256(imagen_bytes).hexdigest()

    # --- 3. Verificar duplicados en Redis ---
    cache_key = f"acta:hash:{hash_imagen}"
    cached = await app_state.redis.get(cache_key)
    if cached:
        logger.warning(f"Imagen duplicada detectada. Hash: {hash_imagen[:16]}...")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta imagen ya fue procesada anteriormente",
        )

    # --- 4. Guardar imagen original ---
    acta_uuid = str(uuid.uuid4())
    ext = Path(imagen.filename or "acta.jpg").suffix or ".jpg"
    ruta_original = UPLOAD_DIR / "original" / f"{acta_uuid}{ext}"

    async with aiofiles.open(ruta_original, "wb") as f:
        await f.write(imagen_bytes)

    # --- 5 & 6. Procesar OCR (CPU-bound, corre en executor) ---
    loop = asyncio.get_event_loop()
    try:
        resultado_ocr = await loop.run_in_executor(
            None,
            app_state.processor.procesar_acta,
            str(ruta_original),
            acta_uuid,
        )
    except CalidadInsuficienteError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        logger.exception(f"Error en OCR para acta {acta_uuid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno durante el procesamiento OCR",
        )

    # --- 7. Persistir en PostgreSQL ---
    try:
        async with app_state.db_pool.acquire() as conn:
            async with conn.transaction():
                # Insertar acta
                acta_id = await conn.fetchval(
                    """
                    INSERT INTO actas (
                        uuid, mesa_id, pipeline, estado,
                        imagen_original, imagen_procesada, hash_imagen,
                        calidad_imagen, angulo_correccion,
                        total_votos_validos, total_votos_blancos,
                        total_votos_nulos, total_votos_emitidos,
                        latitud_envio, longitud_envio, usuario_id, procesada_en
                    ) VALUES (
                        $1, $2, $3, 'EN_PROCESO',
                        $4, $5, $6,
                        $7, $8,
                        $9, $10, $11, $12,
                        $13, $14, $15, NOW()
                    )
                    ON CONFLICT (mesa_id, pipeline, eleccion_tipo) DO UPDATE
                        SET estado = 'EN_PROCESO', updated_at = NOW()
                    RETURNING id
                    """,
                    acta_uuid,
                    mesa_id,
                    pipeline,
                    str(ruta_original),
                    resultado_ocr.get("imagen_procesada"),
                    hash_imagen,
                    resultado_ocr["calidad_imagen"],
                    resultado_ocr["angulo_correccion"],
                    resultado_ocr.get("total_votos_validos"),
                    resultado_ocr.get("total_votos_blancos"),
                    resultado_ocr.get("total_votos_nulos"),
                    resultado_ocr.get("total_votos_emitidos"),
                    latitud,
                    longitud,
                    usuario_id,
                )

                # Insertar resultados por partido
                for partido_codigo, datos in resultado_ocr["partidos"].items():
                    partido_id = await conn.fetchval(
                        "SELECT id FROM partidos_politicos WHERE codigo = $1",
                        partido_codigo,
                    )
                    if partido_id:
                        await conn.execute(
                            """
                            INSERT INTO resultados_votos
                                (acta_id, partido_id, votos, votos_ocr, confianza_ocr)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (acta_id, partido_id) DO UPDATE
                                SET votos = $3, votos_ocr = $4, confianza_ocr = $5,
                                    updated_at = NOW()
                            """,
                            acta_id,
                            partido_id,
                            datos["votos"],
                            datos["votos_ocr"],
                            datos["confianza"],
                        )

    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un acta registrada para esta mesa y pipeline",
        )
    except Exception as e:
        logger.exception(f"Error DB para acta {acta_uuid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al guardar en base de datos",
        )

    # --- 8. Cachear hash en Redis (TTL 24h) ---
    await app_state.redis.setex(cache_key, 86400, acta_uuid)

    return ResultadoOCR(
        acta_uuid=acta_uuid,
        mesa_id=mesa_id,
        pipeline=pipeline,
        calidad_imagen=resultado_ocr["calidad_imagen"],
        angulo_correccion=resultado_ocr["angulo_correccion"],
        total_votos_validos=resultado_ocr.get("total_votos_validos"),
        total_votos_blancos=resultado_ocr.get("total_votos_blancos"),
        total_votos_nulos=resultado_ocr.get("total_votos_nulos"),
        total_votos_emitidos=resultado_ocr.get("total_votos_emitidos"),
        resultados_partidos=resultado_ocr["partidos"],
        advertencias=resultado_ocr.get("advertencias", []),
        imagen_procesada_url=f"/uploads/processed/{acta_uuid}_processed.jpg",
    )


@app.get("/actas/{acta_uuid}/estado", tags=["OCR"])
async def estado_acta(acta_uuid: str):
    """Consulta el estado de procesamiento de un acta por su UUID."""
    async with app_state.db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT uuid, estado, calidad_imagen, procesada_en FROM actas WHERE uuid = $1",
            acta_uuid,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Acta no encontrada")
    return dict(row)


@app.get("/resultados/departamento/{dept_codigo}", tags=["Resultados"])
async def resultados_por_departamento(dept_codigo: str, pipeline: str = "RRV"):
    """Retorna los votos consolidados por partido para un departamento."""
    async with app_state.db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT partido, color_hex, total_votos, actas_computadas, pct_actas_procesadas
            FROM v_resultados_departamento
            WHERE dept_codigo = $1 AND pipeline = $2
            ORDER BY total_votos DESC
            """,
            dept_codigo.upper(),
            pipeline,
        )
    return [dict(r) for r in rows]


@app.get("/resultados/comparativa", tags=["Resultados"])
async def comparativa_pipelines():
    """Compara RRV vs Cómputo Oficial para todos los partidos."""
    async with app_state.db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM v_comparativa_pipelines")
    return [dict(r) for r in rows]


@app.get("/progreso", tags=["Resultados"])
async def progreso_computo():
    """Retorna el porcentaje de avance por departamento y pipeline."""
    async with app_state.db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM v_progreso_computo ORDER BY dept_codigo, pipeline")
    return [dict(r) for r in rows]
