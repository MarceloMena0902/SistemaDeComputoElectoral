"""
Router: /api/auditoria

GET  /api/auditoria/logs              → Historial de inserciones por usuario
GET  /api/auditoria/logs/{id_usuario} → Logs filtrados por usuario
GET  /api/auditoria/fallos-db         → Historial de fallos del cluster
POST /api/auditoria/fallos-db         → Registrar nuevo fallo detectado
PUT  /api/auditoria/fallos-db/{id}    → Marcar fallo como resuelto
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_read, get_db_write
from app.models import AuditoriaVoto, FalloDB
from app.schemas import AuditoriaLog, FalloDBRequest, FalloDBResponse

router = APIRouter()


@router.get(
    "/logs",
    response_model=list[AuditoriaLog],
    summary="Historial de inserciones de actas por usuario",
)
async def get_audit_logs(
    limit:      int           = Query(default=100, ge=1, le=1000),
    offset:     int           = Query(default=0, ge=0),
    accion:     Optional[str] = Query(default=None, description="Filtrar por accion: INSERCION, CONFLICTO_DATOS, RECHAZO_VALIDACION"),
    db: AsyncSession = Depends(get_db_read),
):
    sql = text("""
        SELECT
            av.id_auditoria,
            av.id_voto,
            u.nombre_usuario,
            av.accion,
            av.campo_modificado,
            av.valor_anterior,
            av.valor_nuevo,
            av.detalle,
            av.fecha_accion
        FROM auditoria_voto av
        LEFT JOIN usuario u ON u.id_usuario = av.id_usuario
        WHERE (:accion IS NULL OR av.accion = :accion)
        ORDER BY av.fecha_accion DESC
        LIMIT :limit OFFSET :offset
    """)

    rows = (await db.execute(sql, {"accion": accion, "limit": limit, "offset": offset})).mappings().all()

    return [
        AuditoriaLog(
            id_auditoria=r["id_auditoria"],
            id_voto=r["id_voto"],
            nombre_usuario=r["nombre_usuario"],
            accion=r["accion"],
            campo_modificado=r["campo_modificado"],
            valor_anterior=r["valor_anterior"],
            valor_nuevo=r["valor_nuevo"],
            detalle=r["detalle"],
            fecha_accion=r["fecha_accion"],
        )
        for r in rows
    ]


@router.get(
    "/logs/{id_usuario}",
    response_model=list[AuditoriaLog],
    summary="Logs de auditoria de un usuario especifico",
)
async def get_audit_logs_by_user(
    id_usuario: int,
    limit:  int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_read),
):
    sql = text("""
        SELECT
            av.id_auditoria,
            av.id_voto,
            u.nombre_usuario,
            av.accion,
            av.campo_modificado,
            av.valor_anterior,
            av.valor_nuevo,
            av.detalle,
            av.fecha_accion
        FROM auditoria_voto av
        LEFT JOIN usuario u ON u.id_usuario = av.id_usuario
        WHERE av.id_usuario = :id_usuario
        ORDER BY av.fecha_accion DESC
        LIMIT :limit OFFSET :offset
    """)

    rows = (await db.execute(sql, {"id_usuario": id_usuario, "limit": limit, "offset": offset})).mappings().all()

    return [
        AuditoriaLog(
            id_auditoria=r["id_auditoria"],
            id_voto=r["id_voto"],
            nombre_usuario=r["nombre_usuario"],
            accion=r["accion"],
            campo_modificado=r["campo_modificado"],
            valor_anterior=r["valor_anterior"],
            valor_nuevo=r["valor_nuevo"],
            detalle=r["detalle"],
            fecha_accion=r["fecha_accion"],
        )
        for r in rows
    ]


@router.get(
    "/fallos-db",
    response_model=list[FalloDBResponse],
    summary="Historial de fallos del cluster de base de datos",
)
async def get_fallos_db(
    solo_pendientes: bool = Query(default=False, description="Si True, retorna solo fallos no resueltos"),
    limit:  int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_read),
):
    stmt = (
        select(FalloDB)
        .order_by(FalloDB.fecha_fallo.desc())
        .limit(limit)
        .offset(offset)
    )
    if solo_pendientes:
        stmt = stmt.where(FalloDB.resuelto == False)  # noqa: E712

    result = await db.execute(stmt)
    fallos = result.scalars().all()

    return [
        FalloDBResponse(
            id_fallo=f.id_fallo,
            nodo=f.nodo,
            tipo_fallo=f.tipo_fallo,
            detalle=f.detalle,
            fecha_fallo=f.fecha_fallo,
            resuelto=f.resuelto,
            fecha_resolucion=f.fecha_resolucion,
        )
        for f in fallos
    ]


@router.post(
    "/fallos-db",
    response_model=FalloDBResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un fallo detectado en el cluster",
)
async def registrar_fallo_db(
    data: FalloDBRequest,
    db: AsyncSession = Depends(get_db_write),
):
    fallo = FalloDB(
        nodo=data.nodo,
        tipo_fallo=data.tipo_fallo,
        detalle=data.detalle,
    )
    db.add(fallo)
    await db.commit()
    await db.refresh(fallo)

    return FalloDBResponse(
        id_fallo=fallo.id_fallo,
        nodo=fallo.nodo,
        tipo_fallo=fallo.tipo_fallo,
        detalle=fallo.detalle,
        fecha_fallo=fallo.fecha_fallo,
        resuelto=fallo.resuelto,
        fecha_resolucion=fallo.fecha_resolucion,
    )


@router.put(
    "/fallos-db/{id_fallo}/resolver",
    response_model=FalloDBResponse,
    summary="Marcar un fallo como resuelto",
)
async def resolver_fallo_db(
    id_fallo: int,
    db: AsyncSession = Depends(get_db_write),
):
    fallo = await db.get(FalloDB, id_fallo)
    if fallo is None:
        raise HTTPException(status_code=404, detail=f"Fallo {id_fallo} no encontrado.")

    fallo.resuelto = True
    fallo.fecha_resolucion = datetime.utcnow()
    await db.commit()
    await db.refresh(fallo)

    return FalloDBResponse(
        id_fallo=fallo.id_fallo,
        nodo=fallo.nodo,
        tipo_fallo=fallo.tipo_fallo,
        detalle=fallo.detalle,
        fecha_fallo=fallo.fecha_fallo,
        resuelto=fallo.resuelto,
        fecha_resolucion=fallo.fecha_resolucion,
    )
