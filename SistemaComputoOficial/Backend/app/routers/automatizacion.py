"""
Router: /api/automatizacion

POST /api/automatizacion/iniciar           → Inicia carga masiva en background
GET  /api/automatizacion/progreso/{run_id} → Estado del run actual
GET  /api/automatizacion/runs              → Historial de runs
"""
import asyncio
import json
import logging
from collections import deque
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionWrite, get_db_read, get_db_write
from app.models import (
    ActaImportDetalle, ActaImportRun,
    ActaOficial, AuditoriaVoto, DistribucionTerritorial,
    MesaElectoral, RecintoElectoral, VotoOficial,
)
from app.schemas import (
    AutomatizacionIniciarResponse,
    AutomatizacionProgresoResponse,
    ProgresoReciente,
)
from app.utils.csv_adapter import build_official_payload, get_department_name, read_data_file
from app.utils.validators import validate_acta

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Estado global del módulo ─────────────────────────────────────
automation_running: bool = False
_active_runs: dict[str, dict] = {}


def _get_run_state(run_id: str) -> dict:
    return _active_runs.get(run_id, {})


# ─── Endpoints ───────────────────────────────────────────────────
@router.post(
    "/iniciar",
    response_model=AutomatizacionIniciarResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Iniciar carga masiva desde CSV",
)
async def iniciar_automatizacion(db: AsyncSession = Depends(get_db_write)):
    global automation_running
    if automation_running:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Ya hay una automatización en progreso.",
        )

    csv_path = settings.get_csv_path()

    run = ActaImportRun(estado="INICIADO", iniciado_en=datetime.utcnow())
    db.add(run)
    await db.commit()
    await db.refresh(run)

    run_id = str(run.id)
    _active_runs[run_id] = {
        "run_id":     run_id,
        "estado":     "INICIADO",
        "total":      0,
        "procesadas": 0,
        "exitosas":   0,
        "errores":    0,
        "observadas": 0,
        "duplicadas": 0,
        "porcentaje": 0.0,
        "recientes":  deque(maxlen=20),
    }
    automation_running = True

    asyncio.create_task(_run_automation(run_id, run.id, csv_path))

    return AutomatizacionIniciarResponse(
        run_id=run_id,
        mensaje=f"Automatización iniciada. run_id={run_id}. CSV: {csv_path}",
    )


@router.get(
    "/progreso/{run_id}",
    response_model=AutomatizacionProgresoResponse,
    summary="Progreso de un run de automatización",
)
async def get_progreso(run_id: str):
    state = _active_runs.get(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' no encontrado.")
    return AutomatizacionProgresoResponse(
        run_id=state["run_id"],
        estado=state["estado"],
        total=state["total"],
        procesadas=state["procesadas"],
        exitosas=state["exitosas"],
        errores=state["errores"],
        observadas=state["observadas"],
        duplicadas=state["duplicadas"],
        porcentaje=state["porcentaje"],
        recientes=[ProgresoReciente(**r) for r in list(state["recientes"])],
    )


@router.get(
    "/runs",
    summary="Historial de runs de automatización",
)
async def list_runs(
    limit:  int = 20,
    db: AsyncSession = Depends(get_db_read),
):
    sql = text("""
        SELECT id, estado, total, exitosas, errores, observadas, duplicadas,
               iniciado_en, completado_en
        FROM acta_import_runs
        ORDER BY iniciado_en DESC
        LIMIT :limit
    """)
    rows = (await db.execute(sql, {"limit": limit})).mappings().all()
    return [dict(r) for r in rows]


@router.get("/estado", summary="Estado actual del módulo de automatización")
async def estado_automatizacion():
    return {"running": automation_running, "active_runs": list(_active_runs.keys())}


# ─── Tarea de fondo ──────────────────────────────────────────────
async def _run_automation(run_id: str, db_run_id: int, csv_path: str):
    global automation_running
    state = _active_runs[run_id]

    try:
        logger.info(f"[Auto {run_id}] Leyendo archivo: {csv_path}")
        rows = await asyncio.to_thread(read_data_file, csv_path)
        total = len(rows)
        state["total"] = total
        state["estado"] = "EN_PROGRESO"
        await _db_update_run(db_run_id, estado="EN_PROGRESO", total=total)
        logger.info(f"[Auto {run_id}] {total} filas leídas.")

        visual_limit = settings.SELENIUM_LIMIT
        visual_rows  = rows[:visual_limit]
        bulk_rows    = rows[visual_limit:]

        # ── Fase 1: visual (simulación lenta) ───────────────────
        for i, raw_row in enumerate(visual_rows):
            result = await _process_row(raw_row, i + 2, run_id, db_run_id)
            _update_counters(state, result)
            state["porcentaje"] = round(state["procesadas"] * 100 / total, 1) if total else 0
            await asyncio.sleep(0.4)   # simula entrada humana

        # ── Fase 2: carga masiva paralela ────────────────────────
        sem = asyncio.Semaphore(settings.BULK_CONCURRENCY)

        async def process_with_sem(raw_row, idx):
            async with sem:
                return await _process_row(raw_row, visual_limit + idx + 2, run_id, db_run_id)

        BATCH = 200
        for batch_start in range(0, len(bulk_rows), BATCH):
            batch = bulk_rows[batch_start: batch_start + BATCH]
            results = await asyncio.gather(
                *[process_with_sem(r, batch_start + j) for j, r in enumerate(batch)],
                return_exceptions=True,
            )
            for res in results:
                if isinstance(res, Exception):
                    state["errores"] += 1
                    state["procesadas"] += 1
                else:
                    _update_counters(state, res)
            state["porcentaje"] = round(state["procesadas"] * 100 / total, 1) if total else 0

        state["estado"] = "COMPLETADO"
        state["porcentaje"] = 100.0
        await _db_update_run(
            db_run_id,
            estado="COMPLETADO",
            exitosas=state["exitosas"],
            errores=state["errores"],
            observadas=state["observadas"],
            duplicadas=state["duplicadas"],
            completado_en=datetime.utcnow(),
        )
        logger.info(
            f"[Auto {run_id}] Completado. "
            f"exitosas={state['exitosas']} errores={state['errores']} "
            f"obs={state['observadas']} dup={state['duplicadas']}"
        )

    except Exception as exc:
        logger.error(f"[Auto {run_id}] Error fatal: {exc}", exc_info=True)
        state["estado"] = f"ERROR: {str(exc)[:200]}"
        await _db_update_run(db_run_id, estado="ERROR")
    finally:
        automation_running = False


def _update_counters(state: dict, result: dict):
    state["procesadas"] += 1
    tipo = result.get("tipo", "ERROR")
    if tipo == "VALIDA":
        state["exitosas"] += 1
    elif tipo == "OBSERVADA_PENDIENTE_REVISION":
        state["exitosas"] += 1
        state["observadas"] += 1
    elif tipo == "DUPLICADA":
        state["duplicadas"] += 1
    else:
        state["errores"] += 1
    state["recientes"].appendleft({
        "nro_acta":      result.get("nro_acta", "?"),
        "estado":        tipo,
        "nro_mesa":      result.get("nro_mesa", 0),
        "p1":            result.get("p1", 0),
        "p2":            result.get("p2", 0),
        "p3":            result.get("p3", 0),
        "p4":            result.get("p4", 0),
        "votos_blancos": result.get("votos_blancos", 0),
        "votos_nulos":   result.get("votos_nulos", 0),
        "total_votos":   result.get("total_votos", 0),
    })


async def _process_row(raw_row: dict, row_number: int, run_id: str, db_run_id: int) -> dict:
    """Procesa una sola fila del CSV: adapta → valida → persiste."""
    try:
        payload = build_official_payload(raw_row, row_number)
    except Exception as exc:
        return {"tipo": "ERROR", "nro_acta": "?", "errors": [f"Adapter error: {exc}"]}

    nro_acta = payload.get("nro_acta", "")
    if not nro_acta:
        return {"tipo": "ERROR", "nro_acta": "?", "errors": ["nro_acta vacío"]}

    v_data = payload["votos"]
    val = validate_acta(
        nro_acta=nro_acta,
        nro_mesa=payload["nro_mesa"],
        codigo_mesa=payload["codigo_mesa"],
        nro_votantes=payload["nro_votantes"],
        papeletas_anfora=payload["papeletas_anfora"],
        papeletas_no_utilizadas=payload["papeletas_no_utilizadas"],
        partido1=v_data["partido1"], partido2=v_data["partido2"],
        partido3=v_data["partido3"], partido4=v_data["partido4"],
        votos_validos=v_data["votos_validos"],
        votos_blancos=v_data["votos_blancos"],
        votos_nulos=v_data["votos_nulos"],
        apertura_hora=payload["apertura"]["hora"],
        apertura_minutos=payload["apertura"]["minutos"],
        cierre_hora=payload["cierre"]["hora"],
        cierre_minutos=payload["cierre"]["minutos"],
        tipo_observacion=payload["tipo_observacion"],
    )

    if not val.valid:
        await _db_log_detalle(db_run_id, nro_acta, "RECHAZADA", val.errors)
        return {"tipo": "RECHAZADA", "nro_acta": nro_acta, "errors": val.errors}

    # Pre-validar sumas aritméticas de votos antes de tocar la DB
    _p1, _p2, _p3, _p4 = v_data["partido1"], v_data["partido2"], v_data["partido3"], v_data["partido4"]
    _vv = v_data["votos_validos"]
    _tv = v_data["total_votos"]
    _vb, _vn = v_data["votos_blancos"], v_data["votos_nulos"]
    if _p1 + _p2 + _p3 + _p4 != _vv:
        return {"tipo": "RECHAZADA", "nro_acta": nro_acta, "errors": [
            f"CHECK votos_validos: {_p1}+{_p2}+{_p3}+{_p4} != {_vv}"
        ]}
    if _vv + _vb + _vn != _tv:
        return {"tipo": "RECHAZADA", "nro_acta": nro_acta, "errors": [
            f"CHECK total_votos: {_vv}+{_vb}+{_vn} != {_tv}"
        ]}

    async with AsyncSessionWrite() as db:
        try:
            # Garantizar jerarquía territorial
            cod_terr    = payload["codigo_territorial"]
            recinto_id  = payload["recinto_id"]
            codigo_mesa = payload["codigo_mesa"]

            if cod_terr > 0:
                dept = get_department_name(cod_terr)
                await db.execute(
                    pg_insert(DistribucionTerritorial).values(
                        codigo_territorial=cod_terr,
                        departamento=dept,
                        municipio=f"Municipio {cod_terr}",
                        provincia=f"Provincia {cod_terr}",
                    ).on_conflict_do_nothing()
                )
                if recinto_id > 0:
                    await db.execute(
                        pg_insert(RecintoElectoral).values(
                            recinto_id=recinto_id,
                            codigo_territorial=cod_terr,
                            nombre_recinto=f"Recinto {recinto_id}",
                            direccion=None,
                            cantidad_mesas=0,
                        ).on_conflict_do_nothing()
                    )
                if codigo_mesa > 0:
                    await db.execute(
                        pg_insert(MesaElectoral).values(
                            codigo_mesa=codigo_mesa,
                            recinto_id=recinto_id if recinto_id > 0 else 10101001,
                            codigo_territorial=cod_terr,
                            nro_mesa=payload["nro_mesa"],
                            nro_votantes=payload["nro_votantes"],
                        ).on_conflict_do_nothing()
                    )
                await db.flush()

            # Insertar acta — ON CONFLICT DO NOTHING + RETURNING para idempotencia
            insert_acta = (
                pg_insert(ActaOficial)
                .values(
                    nro_acta=nro_acta,
                    codigo_mesa=codigo_mesa,
                    estado=val.estado,
                    observacion=(payload["transcripcion"] or "")[:500] or None,
                    origen=payload["origen"],
                    registrado_por=payload["registrado_por"],
                    actualizado_por=payload["registrado_por"],
                )
                .on_conflict_do_nothing(index_elements=["nro_acta"])
                .returning(ActaOficial.id_acta)
            )
            result_acta = await db.execute(insert_acta)
            id_acta_row = result_acta.scalar_one_or_none()
            if id_acta_row is None:
                # Ya existía — duplicado sin error
                await db.rollback()
                await _db_log_detalle(db_run_id, nro_acta, "DUPLICADA", [])
                return {
                    "tipo":          "DUPLICADA",
                    "nro_acta":      nro_acta,
                    "nro_mesa":      payload.get("nro_mesa", 0),
                    "p1":            v_data["partido1"],
                    "p2":            v_data["partido2"],
                    "p3":            v_data["partido3"],
                    "p4":            v_data["partido4"],
                    "votos_blancos": v_data["votos_blancos"],
                    "votos_nulos":   v_data["votos_nulos"],
                    "total_votos":   v_data["total_votos"],
                }
            acta_id = id_acta_row

            voto = VotoOficial(
                id_acta=acta_id,
                partido1=v_data["partido1"], partido2=v_data["partido2"],
                partido3=v_data["partido3"], partido4=v_data["partido4"],
                votos_validos=v_data["votos_validos"],
                votos_blancos=v_data["votos_blancos"],
                votos_nulos=v_data["votos_nulos"],
                total_votos=v_data["total_votos"],
                papeletas_anfora=payload["papeletas_anfora"],
                papeletas_no_utilizadas=payload["papeletas_no_utilizadas"],
                registrado_por=payload["registrado_por"],
                actualizado_por=payload["registrado_por"],
            )
            db.add(voto)
            await db.flush()

            db.add(AuditoriaVoto(
                id_voto=voto.id_voto,
                id_usuario=payload["registrado_por"],
                accion="INSERCION",
                valor_nuevo=f"auto|estado={val.estado}|total={v_data['total_votos']}",
                detalle=f"Carga masiva run_id={run_id}",
            ))
            await db.commit()
            await _db_log_detalle(db_run_id, nro_acta, val.estado, val.warnings)
            return {
                "tipo":          val.estado,
                "nro_acta":      nro_acta,
                "nro_mesa":      payload.get("nro_mesa", 0),
                "p1":            v_data["partido1"],
                "p2":            v_data["partido2"],
                "p3":            v_data["partido3"],
                "p4":            v_data["partido4"],
                "votos_blancos": v_data["votos_blancos"],
                "votos_nulos":   v_data["votos_nulos"],
                "total_votos":   v_data["total_votos"],
            }

        except Exception as exc:
            await db.rollback()
            await _db_log_detalle(db_run_id, nro_acta, "ERROR", [str(exc)])
            logger.debug(f"[Auto] Error al insertar {nro_acta}: {exc}")
            return {"tipo": "ERROR", "nro_acta": nro_acta, "errors": [str(exc)]}


async def _db_update_run(run_id: int, **kwargs):
    try:
        async with AsyncSessionWrite() as db:
            run = await db.get(ActaImportRun, run_id)
            if run:
                for k, v in kwargs.items():
                    setattr(run, k, v)
                await db.commit()
    except Exception as exc:
        logger.warning(f"No se pudo actualizar run {run_id}: {exc}")


async def _db_log_detalle(run_id: int, nro_acta: str, estado: str, errores: list):
    try:
        async with AsyncSessionWrite() as db:
            db.add(ActaImportDetalle(
                run_id=run_id,
                nro_acta=nro_acta,
                estado=estado,
                errores_json=json.dumps(errores) if errores else None,
            ))
            await db.commit()
    except Exception:
        pass  # No interrumpir el flujo principal por un log fallido
