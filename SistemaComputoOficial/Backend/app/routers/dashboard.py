"""
Router: /api/dashboard

GET /api/dashboard/resultados  → Datos agregados para graficas del Computo Oficial
GET /api/dashboard/progreso    → Porcentaje de avance por ubicacion geografica
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_read
from app.schemas import ProgresoGeo, ResultadosDashboard

router = APIRouter()


@router.get(
    "/resultados",
    response_model=ResultadosDashboard,
    summary="Resultados agregados del Computo Oficial",
    description=(
        "Retorna totales nacionales de votos por partido, blancos, nulos y "
        "total de actas procesadas. Optimizado para graficas del dashboard."
    ),
)
async def get_resultados(db: AsyncSession = Depends(get_db_read)):
    sql = text("""
        SELECT
            COUNT(DISTINCT a.id_acta)               AS total_actas_procesadas,
            COUNT(DISTINCT m.codigo_mesa)            AS total_mesas,
            COALESCE(SUM(v.partido1),    0)::BIGINT  AS total_partido1,
            COALESCE(SUM(v.partido2),    0)::BIGINT  AS total_partido2,
            COALESCE(SUM(v.partido3),    0)::BIGINT  AS total_partido3,
            COALESCE(SUM(v.partido4),    0)::BIGINT  AS total_partido4,
            COALESCE(SUM(v.votos_validos),  0)::BIGINT AS total_votos_validos,
            COALESCE(SUM(v.votos_blancos),  0)::BIGINT AS total_votos_blancos,
            COALESCE(SUM(v.votos_nulos),    0)::BIGINT AS total_votos_nulos,
            COALESCE(SUM(v.total_votos),    0)::BIGINT AS total_votos
        FROM mesa_electoral m
        LEFT JOIN acta_oficial a
            ON a.codigo_mesa = m.codigo_mesa
           AND a.estado = 'PROCESADO'
        LEFT JOIN voto_oficial v ON v.id_acta = a.id_acta
    """)

    row = (await db.execute(sql)).mappings().one()

    # Calculo de porcentaje de avance global
    total_mesas = row["total_mesas"] or 1
    porcentaje  = round(row["total_actas_procesadas"] * 100.0 / total_mesas, 2)

    return ResultadosDashboard(
        total_actas_procesadas=row["total_actas_procesadas"],
        total_mesas=row["total_mesas"],
        porcentaje_avance=porcentaje,
        total_partido1=row["total_partido1"],
        total_partido2=row["total_partido2"],
        total_partido3=row["total_partido3"],
        total_partido4=row["total_partido4"],
        total_votos_validos=row["total_votos_validos"],
        total_votos_blancos=row["total_votos_blancos"],
        total_votos_nulos=row["total_votos_nulos"],
        total_votos=row["total_votos"],
    )


@router.get(
    "/progreso",
    response_model=list[ProgresoGeo],
    summary="Progreso de carga por ubicacion geografica",
    description=(
        "Retorna el porcentaje de avance del cómputo oficial desglosado "
        "por departamento, municipio y provincia."
    ),
)
async def get_progreso(db: AsyncSession = Depends(get_db_read)):
    sql = text("""
        SELECT
            dt.codigo_territorial,
            dt.departamento,
            dt.municipio,
            dt.provincia,
            COUNT(DISTINCT m.codigo_mesa)                                            AS total_mesas,
            COUNT(DISTINCT a.id_acta) FILTER (WHERE a.estado = 'PROCESADO')         AS mesas_procesadas,
            ROUND(
                COUNT(DISTINCT a.id_acta) FILTER (WHERE a.estado = 'PROCESADO')
                * 100.0
                / NULLIF(COUNT(DISTINCT m.codigo_mesa), 0),
                2
            )                                                                        AS porcentaje_avance
        FROM distribucion_territorial dt
        LEFT JOIN mesa_electoral m
            ON m.codigo_territorial = dt.codigo_territorial
        LEFT JOIN acta_oficial a
            ON a.codigo_mesa = m.codigo_mesa
        GROUP BY
            dt.codigo_territorial,
            dt.departamento,
            dt.municipio,
            dt.provincia
        ORDER BY dt.departamento, dt.municipio
    """)

    rows = (await db.execute(sql)).mappings().all()

    return [
        ProgresoGeo(
            codigo_territorial=r["codigo_territorial"],
            departamento=r["departamento"],
            municipio=r["municipio"],
            provincia=r["provincia"],
            total_mesas=r["total_mesas"] or 0,
            mesas_procesadas=r["mesas_procesadas"] or 0,
            porcentaje_avance=float(r["porcentaje_avance"] or 0.0),
        )
        for r in rows
    ]
