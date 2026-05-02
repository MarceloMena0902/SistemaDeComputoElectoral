"""
Router: /api/actas  y  /api/oficial/actas

POST /api/actas/registro          → Registro manual (plano)
POST /api/oficial/actas           → Registro desde frontend/automatización (payload anidado)
GET  /api/oficial/actas           → Listado con filtros y paginación
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_read, get_db_write
from app.models import ActaOficial, AuditoriaVoto, MesaElectoral, RecintoElectoral, DistribucionTerritorial, VotoOficial
from app.schemas import (
    ActaListItem, ActaListResponse, ActaOficialPayload,
    ActaRegistroRequest, ActaRegistroResponse,
)
from app.utils.csv_adapter import get_department_name
from app.utils.validators import (
    ESTADO_DUPLICADA, ESTADO_RECHAZADA,
    build_conflict_detail, is_idempotent_duplicate, validate_acta,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Importación lazy para evitar ciclo circular con automatizacion.py
def _is_automation_running() -> bool:
    try:
        from app.routers.automatizacion import automation_running
        return automation_running
    except ImportError:
        return False


# ─── Helpers de infraestructura ──────────────────────────────────
async def _ensure_territorial(db: AsyncSession, codigo_territorial: int) -> None:
    """Crea distribucion_territorial si no existe (para datos fuera del seed)."""
    dept = get_department_name(codigo_territorial)
    stmt = pg_insert(DistribucionTerritorial).values(
        codigo_territorial=codigo_territorial,
        departamento=dept,
        municipio=f"Municipio {codigo_territorial}",
        provincia=f"Provincia {codigo_territorial}",
    ).on_conflict_do_nothing(index_elements=["codigo_territorial"])
    await db.execute(stmt)


async def _ensure_recinto(db: AsyncSession, recinto_id: int, codigo_territorial: int) -> None:
    """Crea recinto_electoral si no existe."""
    stmt = pg_insert(RecintoElectoral).values(
        recinto_id=recinto_id,
        codigo_territorial=codigo_territorial,
        nombre_recinto=f"Recinto {recinto_id}",
        direccion=None,
        cantidad_mesas=0,
    ).on_conflict_do_nothing(index_elements=["recinto_id"])
    await db.execute(stmt)


async def _ensure_mesa(
    db: AsyncSession,
    codigo_mesa: int,
    recinto_id: int,
    codigo_territorial: int,
    nro_mesa: int,
    nro_votantes: int,
) -> None:
    """Crea o actualiza mesa_electoral."""
    stmt = pg_insert(MesaElectoral).values(
        codigo_mesa=codigo_mesa,
        recinto_id=recinto_id,
        codigo_territorial=codigo_territorial,
        nro_mesa=nro_mesa,
        nro_votantes=nro_votantes,
    ).on_conflict_do_nothing(index_elements=["codigo_mesa"])
    await db.execute(stmt)


# ─── Lógica central de registro ──────────────────────────────────
async def _registrar_acta(
    nro_acta: str,
    codigo_mesa: int,
    recinto_id: int,
    codigo_territorial: int,
    nro_mesa: int,
    nro_votantes: int,
    papeletas_anfora: int,
    papeletas_no_utilizadas: int,
    partido1: int,
    partido2: int,
    partido3: int,
    partido4: int,
    votos_validos: int,
    votos_blancos: int,
    votos_nulos: int,
    total_votos: int,
    apertura_hora: int,
    apertura_minutos: int,
    cierre_hora: int,
    cierre_minutos: int,
    tipo_observacion: str,
    observacion: Optional[str],
    origen: str,
    registrado_por: int,
    db: AsyncSession,
) -> ActaRegistroResponse:

    # ── 1. Validar ────────────────────────────────────────────────
    val = validate_acta(
        nro_acta=nro_acta,
        nro_mesa=nro_mesa,
        codigo_mesa=codigo_mesa,
        nro_votantes=nro_votantes,
        papeletas_anfora=papeletas_anfora,
        papeletas_no_utilizadas=papeletas_no_utilizadas,
        partido1=partido1, partido2=partido2,
        partido3=partido3, partido4=partido4,
        votos_validos=votos_validos,
        votos_blancos=votos_blancos,
        votos_nulos=votos_nulos,
        apertura_hora=apertura_hora,
        apertura_minutos=apertura_minutos,
        cierre_hora=cierre_hora,
        cierre_minutos=cierre_minutos,
        tipo_observacion=tipo_observacion,
    )

    if not val.valid:
        audit_fail = AuditoriaVoto(
            id_usuario=registrado_por,
            accion="RECHAZO_VALIDACION",
            detalle=f"Acta {nro_acta}: " + "; ".join(val.errors),
            fecha_accion=datetime.utcnow(),
        )
        db.add(audit_fail)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"errores": val.errors, "advertencias": val.warnings},
        )

    # ── 2. Garantizar jerarquía territorial ───────────────────────
    await _ensure_territorial(db, codigo_territorial)
    await _ensure_recinto(db, recinto_id, codigo_territorial)
    await _ensure_mesa(db, codigo_mesa, recinto_id, codigo_territorial, nro_mesa, nro_votantes)
    await db.flush()

    # ── 3. Idempotencia / duplicado ───────────────────────────────
    acta_existente = (
        await db.execute(select(ActaOficial).where(ActaOficial.nro_acta == nro_acta))
    ).scalar_one_or_none()

    if acta_existente is not None:
        voto_existente = (
            await db.execute(select(VotoOficial).where(VotoOficial.id_acta == acta_existente.id_acta))
        ).scalar_one_or_none()

        new_dict = {
            "partido1": partido1, "partido2": partido2,
            "partido3": partido3, "partido4": partido4,
            "votos_blancos": votos_blancos, "votos_nulos": votos_nulos,
        }

        if voto_existente and is_idempotent_duplicate(voto_existente, new_dict):
            return ActaRegistroResponse(
                id_acta=acta_existente.id_acta,
                nro_acta=acta_existente.nro_acta,
                estado=ESTADO_DUPLICADA,
                id_voto=voto_existente.id_voto,
                votos_validos=voto_existente.votos_validos,
                total_votos=voto_existente.total_votos,
                idempotente=True,
                message="Acta ya registrada previamente con datos idénticos.",
                warnings=val.warnings,
            )
        else:
            detalle = build_conflict_detail(voto_existente, new_dict) if voto_existente else "Sin voto previo"
            conflict_audit = AuditoriaVoto(
                id_voto=voto_existente.id_voto if voto_existente else None,
                id_usuario=registrado_por,
                accion="CONFLICTO_DATOS",
                campo_modificado="multiples",
                valor_anterior=str({c: getattr(voto_existente, c) for c in new_dict} if voto_existente else {}),
                valor_nuevo=str(new_dict),
                detalle=detalle,
            )
            db.add(conflict_audit)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Acta '{nro_acta}' ya existe con datos diferentes. {detalle}",
            )

    # ── 4. Inserción transaccional ────────────────────────────────
    try:
        acta = ActaOficial(
            nro_acta=nro_acta,
            codigo_mesa=codigo_mesa,
            estado=val.estado,
            observacion=observacion,
            origen=origen,
            registrado_por=registrado_por,
            actualizado_por=registrado_por,
        )
        db.add(acta)
        await db.flush()

        voto = VotoOficial(
            id_acta=acta.id_acta,
            partido1=partido1, partido2=partido2,
            partido3=partido3, partido4=partido4,
            votos_validos=votos_validos,
            votos_blancos=votos_blancos,
            votos_nulos=votos_nulos,
            total_votos=total_votos,
            papeletas_anfora=papeletas_anfora,
            papeletas_no_utilizadas=papeletas_no_utilizadas,
            registrado_por=registrado_por,
            actualizado_por=registrado_por,
        )
        db.add(voto)
        await db.flush()

        auditoria = AuditoriaVoto(
            id_voto=voto.id_voto,
            id_usuario=registrado_por,
            accion="INSERCION",
            valor_nuevo=(
                f"total={total_votos}, p1={partido1}, p2={partido2}, "
                f"p3={partido3}, p4={partido4}, estado={val.estado}"
            ),
            detalle=f"Registro acta {nro_acta} | origen={origen}",
        )
        db.add(auditoria)
        await db.commit()

        logger.info(f"Acta {nro_acta} registrada. id={acta.id_acta} estado={val.estado}")
        return ActaRegistroResponse(
            id_acta=acta.id_acta,
            nro_acta=acta.nro_acta,
            estado=val.estado,
            id_voto=voto.id_voto,
            votos_validos=votos_validos,
            total_votos=total_votos,
            idempotente=False,
            message="Acta registrada exitosamente.",
            warnings=val.warnings,
        )
    except Exception as exc:
        await db.rollback()
        logger.error(f"Error al registrar acta {nro_acta}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno al registrar acta: {str(exc)}",
        )


# ─── POST /api/oficial/actas  (payload anidado: frontend + automatización) ──
@router.post(
    "/oficial/actas",
    response_model=ActaRegistroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar acta (payload completo)",
)
async def registrar_acta_oficial(
    data: ActaOficialPayload,
    db: AsyncSession = Depends(get_db_write),
):
    if _is_automation_running():
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Automatización en progreso. Espere a que finalice para registrar manualmente.",
        )

    v = data.votos
    recinto_id = int(data.codigo_recinto) if data.codigo_recinto.isdigit() else data.codigo_mesa // 1000

    return await _registrar_acta(
        nro_acta=data.nro_acta,
        codigo_mesa=data.codigo_mesa,
        recinto_id=recinto_id,
        codigo_territorial=data.codigo_territorial or int(str(data.codigo_mesa)[:5]) if len(str(data.codigo_mesa)) >= 5 else 10101,
        nro_mesa=data.nro_mesa,
        nro_votantes=data.nro_votantes,
        papeletas_anfora=data.papeletas_anfora,
        papeletas_no_utilizadas=data.papeletas_no_utilizadas,
        partido1=v.partido1, partido2=v.partido2,
        partido3=v.partido3, partido4=v.partido4,
        votos_validos=v.votos_validos,
        votos_blancos=v.votos_blancos,
        votos_nulos=v.votos_nulos,
        total_votos=v.total_votos,
        apertura_hora=data.apertura.hora,
        apertura_minutos=data.apertura.minutos,
        cierre_hora=data.cierre.hora,
        cierre_minutos=data.cierre.minutos,
        tipo_observacion=data.tipo_observacion,
        observacion=(data.transcripcion or "")[:500] or None,
        origen=data.origen,
        registrado_por=data.registrado_por,
        db=db,
    )


# ─── POST /api/actas/registro  (payload plano, compatibilidad) ───
@router.post(
    "/actas/registro",
    response_model=ActaRegistroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar acta (payload plano)",
)
async def registrar_acta(
    data: ActaRegistroRequest,
    db: AsyncSession = Depends(get_db_write),
):
    if _is_automation_running():
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Automatización en progreso.",
        )

    votos_validos = data.partido1 + data.partido2 + data.partido3 + data.partido4
    total_votos   = votos_validos + data.votos_blancos + data.votos_nulos
    recinto_id    = data.codigo_mesa // 1000

    return await _registrar_acta(
        nro_acta=data.nro_acta,
        codigo_mesa=data.codigo_mesa,
        recinto_id=recinto_id,
        codigo_territorial=data.codigo_territorial,
        nro_mesa=data.nro_mesa,
        nro_votantes=data.nro_votantes,
        papeletas_anfora=total_votos,
        papeletas_no_utilizadas=max(0, data.nro_votantes - total_votos),
        partido1=data.partido1, partido2=data.partido2,
        partido3=data.partido3, partido4=data.partido4,
        votos_validos=votos_validos,
        votos_blancos=data.votos_blancos,
        votos_nulos=data.votos_nulos,
        total_votos=total_votos,
        apertura_hora=8, apertura_minutos=0,
        cierre_hora=16,  cierre_minutos=0,
        tipo_observacion="SIN_OBSERVACION",
        observacion=data.observacion,
        origen="FORMULARIO_MANUAL",
        registrado_por=data.registrado_por,
        db=db,
    )


# ─── GET /api/oficial/actas  (listado con filtros) ───────────────
@router.get(
    "/oficial/actas",
    response_model=ActaListResponse,
    summary="Listado de actas con filtros y paginación",
)
async def listar_actas(
    estado:       Optional[str] = Query(default=None),
    departamento: Optional[str] = Query(default=None),
    origen:       Optional[str] = Query(default=None),
    q:            Optional[str] = Query(default=None, description="Buscar en nro_acta"),
    page:         int           = Query(default=1, ge=1),
    limit:        int           = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db_read),
):
    offset = (page - 1) * limit

    sql = text("""
        SELECT
            a.id_acta, a.nro_acta, a.codigo_mesa, m.nro_mesa, m.nro_votantes,
            a.estado, a.observacion, a.origen, a.fecha_registro,
            dt.departamento, dt.municipio, dt.provincia,
            re.nombre_recinto,
            COALESCE(v.partido1, 0)                AS partido1,
            COALESCE(v.partido2, 0)                AS partido2,
            COALESCE(v.partido3, 0)                AS partido3,
            COALESCE(v.partido4, 0)                AS partido4,
            COALESCE(v.votos_validos, 0)           AS votos_validos,
            COALESCE(v.votos_blancos, 0)           AS votos_blancos,
            COALESCE(v.votos_nulos, 0)             AS votos_nulos,
            COALESCE(v.total_votos, 0)             AS total_votos,
            COALESCE(v.papeletas_anfora, 0)        AS papeletas_anfora,
            COALESCE(v.papeletas_no_utilizadas, 0) AS papeletas_no_utilizadas
        FROM acta_oficial a
        JOIN mesa_electoral m            ON m.codigo_mesa = a.codigo_mesa
        JOIN distribucion_territorial dt ON dt.codigo_territorial = m.codigo_territorial
        LEFT JOIN recinto_electoral re   ON re.recinto_id = m.recinto_id
        LEFT JOIN voto_oficial v         ON v.id_acta = a.id_acta
        WHERE (:estado IS NULL       OR a.estado = :estado)
          AND (:departamento IS NULL OR dt.departamento = :departamento)
          AND (:origen IS NULL       OR a.origen = :origen)
          AND (:q IS NULL            OR a.nro_acta ILIKE :q_like)
        ORDER BY a.fecha_registro DESC
        LIMIT :limit OFFSET :offset
    """)

    count_sql = text("""
        SELECT COUNT(*) FROM acta_oficial a
        JOIN mesa_electoral m            ON m.codigo_mesa = a.codigo_mesa
        JOIN distribucion_territorial dt ON dt.codigo_territorial = m.codigo_territorial
        WHERE (:estado IS NULL       OR a.estado = :estado)
          AND (:departamento IS NULL OR dt.departamento = :departamento)
          AND (:origen IS NULL       OR a.origen = :origen)
          AND (:q IS NULL            OR a.nro_acta ILIKE :q_like)
    """)

    params = {
        "estado":       estado,
        "departamento": departamento,
        "origen":       origen,
        "q":            q,
        "q_like":       f"%{q}%" if q else None,
        "limit":        limit,
        "offset":       offset,
    }

    rows  = (await db.execute(sql,       params)).mappings().all()
    total = (await db.execute(count_sql, params)).scalar()

    items = [
        ActaListItem(
            id_acta=r["id_acta"],
            nro_acta=r["nro_acta"],
            codigo_mesa=r["codigo_mesa"],
            nro_mesa=r["nro_mesa"],
            nro_votantes=r["nro_votantes"],
            estado=r["estado"],
            observacion=r["observacion"],
            origen=r["origen"],
            fecha_registro=r["fecha_registro"],
            departamento=r["departamento"],
            municipio=r["municipio"],
            provincia=r["provincia"],
            recinto_nombre=r["recinto_nombre"],
            partido1=r["partido1"],
            partido2=r["partido2"],
            partido3=r["partido3"],
            partido4=r["partido4"],
            votos_validos=r["votos_validos"],
            votos_blancos=r["votos_blancos"],
            votos_nulos=r["votos_nulos"],
            total_votos=r["total_votos"],
            papeletas_anfora=r["papeletas_anfora"],
            papeletas_no_utilizadas=r["papeletas_no_utilizadas"],
        )
        for r in rows
    ]

    return ActaListResponse(items=items, total=total or 0, page=page, limit=limit)
