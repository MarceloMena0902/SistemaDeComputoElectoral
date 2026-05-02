"""
Router: /api/territorio
Endpoints optimizados para ComboBox en cascada (Departamento > Provincia > Municipio > Recinto > Mesa).
Todas las consultas usan DISTINCT para evitar duplicados.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, distinct, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_read
from app.models import DistribucionTerritorial, MesaElectoral, RecintoElectoral

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/departamentos", summary="Lista única de departamentos")
async def get_departamentos(db: AsyncSession = Depends(get_db_read)):
    rows = (
        await db.execute(
            select(distinct(DistribucionTerritorial.departamento))
            .order_by(DistribucionTerritorial.departamento)
        )
    ).scalars().all()
    return [{"departamento": r} for r in rows]


@router.get("/provincias", summary="Provincias filtradas por departamento")
async def get_provincias(
    depto: str = Query(..., description="Nombre del departamento"),
    db: AsyncSession = Depends(get_db_read),
):
    rows = (
        await db.execute(
            select(distinct(DistribucionTerritorial.provincia))
            .where(DistribucionTerritorial.departamento == depto)
            .order_by(DistribucionTerritorial.provincia)
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No se encontraron provincias para '{depto}'")
    return [{"provincia": r} for r in rows]


@router.get("/municipios", summary="Municipios filtrados por provincia")
async def get_municipios(
    prov: str = Query(..., description="Nombre de la provincia"),
    db: AsyncSession = Depends(get_db_read),
):
    rows = (
        await db.execute(
            select(distinct(DistribucionTerritorial.municipio))
            .where(DistribucionTerritorial.provincia == prov)
            .order_by(DistribucionTerritorial.municipio)
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No se encontraron municipios para '{prov}'")
    return [{"municipio": r} for r in rows]


@router.get("/recintos", summary="Recintos filtrados por municipio")
async def get_recintos(
    mun: str = Query(..., description="Nombre del municipio"),
    db: AsyncSession = Depends(get_db_read),
):
    sql = text("""
        SELECT DISTINCT r.recinto_id, r.nombre_recinto
        FROM recinto_electoral r
        JOIN distribucion_territorial dt ON dt.codigo_territorial = r.codigo_territorial
        WHERE dt.municipio = :mun
        ORDER BY r.nombre_recinto
    """)
    rows = (await db.execute(sql, {"mun": mun})).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No se encontraron recintos para municipio '{mun}'")
    return [{"recinto_id": r["recinto_id"], "nombre_recinto": r["nombre_recinto"]} for r in rows]


@router.get("/mesas", summary="Mesas filtradas por recinto")
async def get_mesas(
    recintoId: int = Query(..., description="ID del recinto electoral"),
    db: AsyncSession = Depends(get_db_read),
):
    rows = (
        await db.execute(
            select(MesaElectoral.codigo_mesa, MesaElectoral.nro_mesa, MesaElectoral.nro_votantes)
            .where(MesaElectoral.recinto_id == recintoId)
            .order_by(MesaElectoral.nro_mesa)
        )
    ).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No se encontraron mesas para recinto_id={recintoId}")
    return [{"codigo_mesa": r["codigo_mesa"], "nro_mesa": r["nro_mesa"], "nro_votantes": r["nro_votantes"]} for r in rows]
