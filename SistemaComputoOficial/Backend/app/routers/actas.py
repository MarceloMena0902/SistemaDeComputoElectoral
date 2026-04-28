"""
Router: /api/actas

POST /api/actas/registro          → Registro transaccional de acta oficial
POST /api/oficial/actas           → Alias para compatibilidad con automatizacion
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_write
from app.models import ActaOficial, AuditoriaVoto, MesaElectoral, VotoOficial
from app.schemas import ActaRegistroRequest, ActaRegistroResponse
from app.utils.validators import (
    build_conflict_detail,
    is_idempotent_duplicate,
    validate_arithmetic,
)

logger = logging.getLogger(__name__)
router = APIRouter()


async def _proceso_registro_acta(
    data: ActaRegistroRequest,
    db: AsyncSession,
) -> ActaRegistroResponse:
    """
    Logica central de registro de acta con:
      1. Validacion aritmetica
      2. Upsert de mesa_electoral
      3. Check de idempotencia
      4. Insercion transaccional acta + voto + auditoria
    """
    votos_validos = data.partido1 + data.partido2 + data.partido3 + data.partido4
    total_votos   = votos_validos + data.votos_blancos + data.votos_nulos

    # ─── 1. Validacion aritmetica ──────────────────────────────────
    val = validate_arithmetic(
        data.partido1, data.partido2, data.partido3, data.partido4,
        data.votos_blancos, data.votos_nulos, data.nro_votantes,
    )
    if not val.valid:
        # Registrar fallo de validacion en auditoria
        audit_fail = AuditoriaVoto(
            id_usuario=data.registrado_por,
            accion="RECHAZO_VALIDACION",
            detalle=f"Acta {data.nro_acta}: " + "; ".join(val.errors),
            fecha_accion=datetime.utcnow(),
        )
        db.add(audit_fail)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"errores": val.errors, "advertencias": val.warnings},
        )

    if val.warnings:
        logger.warning(f"Acta {data.nro_acta}: {val.warnings}")

    # ─── 2. Upsert de mesa_electoral ──────────────────────────────
    mesa = await db.get(MesaElectoral, data.codigo_mesa)
    if mesa is None:
        mesa = MesaElectoral(
            codigo_mesa=data.codigo_mesa,
            recinto_id=data.codigo_mesa // 1000,   # aproximacion: recinto = mesa / 1000
            codigo_territorial=data.codigo_territorial,
            nro_mesa=data.nro_mesa,
            nro_votantes=data.nro_votantes,
        )
        db.add(mesa)
        await db.flush()
    elif mesa.nro_votantes != data.nro_votantes:
        mesa.nro_votantes = data.nro_votantes

    # ─── 3. Check de idempotencia ─────────────────────────────────
    acta_existente = (
        await db.execute(
            select(ActaOficial).where(ActaOficial.nro_acta == data.nro_acta)
        )
    ).scalar_one_or_none()

    if acta_existente is not None:
        voto_existente = (
            await db.execute(
                select(VotoOficial).where(VotoOficial.id_acta == acta_existente.id_acta)
            )
        ).scalar_one_or_none()

        new_data_dict = {
            "partido1": data.partido1, "partido2": data.partido2,
            "partido3": data.partido3, "partido4": data.partido4,
            "votos_blancos": data.votos_blancos, "votos_nulos": data.votos_nulos,
        }

        if voto_existente and is_idempotent_duplicate(voto_existente, new_data_dict):
            # Acta identica → respuesta idempotente
            logger.info(f"Acta {data.nro_acta} ya registrada (idempotente).")
            return ActaRegistroResponse(
                id_acta=acta_existente.id_acta,
                nro_acta=acta_existente.nro_acta,
                estado=acta_existente.estado,
                id_voto=voto_existente.id_voto,
                votos_validos=voto_existente.votos_validos,
                total_votos=voto_existente.total_votos,
                idempotente=True,
                message="Acta ya registrada previamente con datos identicos.",
            )
        else:
            # Acta con datos distintos → conflicto
            detalle = build_conflict_detail(voto_existente, new_data_dict) if voto_existente else "Sin voto previo"
            conflict_audit = AuditoriaVoto(
                id_voto=voto_existente.id_voto if voto_existente else None,
                id_usuario=data.registrado_por,
                accion="CONFLICTO_DATOS",
                campo_modificado="multiples",
                valor_anterior=str({c: getattr(voto_existente, c) for c in new_data_dict} if voto_existente else {}),
                valor_nuevo=str(new_data_dict),
                detalle=detalle,
            )
            db.add(conflict_audit)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Acta '{data.nro_acta}' ya existe con datos diferentes. {detalle}",
            )

    # ─── 4. Insercion transaccional ───────────────────────────────
    try:
        # 4a. Crear acta_oficial
        acta = ActaOficial(
            nro_acta=data.nro_acta,
            codigo_mesa=data.codigo_mesa,
            estado="PROCESADO",
            observacion=data.observacion,
            registrado_por=data.registrado_por,
            actualizado_por=data.registrado_por,
        )
        db.add(acta)
        await db.flush()  # Obtener id_acta generado

        # 4b. Crear voto_oficial
        voto = VotoOficial(
            id_acta=acta.id_acta,
            partido1=data.partido1,
            partido2=data.partido2,
            partido3=data.partido3,
            partido4=data.partido4,
            votos_validos=votos_validos,
            votos_blancos=data.votos_blancos,
            votos_nulos=data.votos_nulos,
            total_votos=total_votos,
            registrado_por=data.registrado_por,
            actualizado_por=data.registrado_por,
        )
        db.add(voto)
        await db.flush()

        # 4c. Registrar en auditoria_voto
        auditoria = AuditoriaVoto(
            id_voto=voto.id_voto,
            id_usuario=data.registrado_por,
            accion="INSERCION",
            campo_modificado=None,
            valor_anterior=None,
            valor_nuevo=f"total={total_votos}, p1={data.partido1}, p2={data.partido2}, "
                        f"p3={data.partido3}, p4={data.partido4}",
            detalle=f"Registro inicial de acta {data.nro_acta}",
        )
        db.add(auditoria)

        await db.commit()
        logger.info(f"Acta {data.nro_acta} registrada correctamente. id_acta={acta.id_acta}")

        return ActaRegistroResponse(
            id_acta=acta.id_acta,
            nro_acta=acta.nro_acta,
            estado=acta.estado,
            id_voto=voto.id_voto,
            votos_validos=votos_validos,
            total_votos=total_votos,
            idempotente=False,
            message="Acta registrada exitosamente.",
        )

    except Exception as exc:
        await db.rollback()
        logger.error(f"Error al registrar acta {data.nro_acta}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno al registrar acta: {str(exc)}",
        )


# ─── Endpoint principal ───────────────────────────────────────────
@router.post(
    "/actas/registro",
    response_model=ActaRegistroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar acta oficial",
    description=(
        "Inserta transaccionalmente los datos de un acta electoral. "
        "Valida la aritmetica de votos e implementa idempotencia: "
        "si el acta ya existe con datos identicos retorna 200 sin reinsertar."
    ),
)
async def registrar_acta(
    data: ActaRegistroRequest,
    db: AsyncSession = Depends(get_db_write),
):
    return await _proceso_registro_acta(data, db)


# ─── Alias de compatibilidad con el modulo de automatizacion ─────
@router.post(
    "/oficial/actas",
    response_model=ActaRegistroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="[Alias] Registrar acta (compatibilidad automatizacion)",
    include_in_schema=True,
)
async def registrar_acta_alias(
    data: ActaRegistroRequest,
    db: AsyncSession = Depends(get_db_write),
):
    """Alias del endpoint principal para compatibilidad con el modulo de automatizacion n8n."""
    return await _proceso_registro_acta(data, db)
