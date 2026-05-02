"""
Router: /api/dashboard

GET /api/dashboard/resultados → Totales nacionales
GET /api/dashboard/progreso   → Progreso por territorio
GET /api/dashboard/metricas   → KPIs completos para el frontend
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_read
from app.schemas import (
    EstadoConteo, MetricasDashboard, ProgresoGeo, ResultadosDashboard,
    ThroughputHora, TopError,
)

router = APIRouter()


@router.get(
    "/resultados",
    response_model=ResultadosDashboard,
    summary="Resultados agregados del Cómputo Oficial",
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
           AND a.estado NOT IN ('RECHAZADA','RECHAZADO')
        LEFT JOIN voto_oficial v ON v.id_acta = a.id_acta
    """)
    row = (await db.execute(sql)).mappings().one()
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
    summary="Progreso de carga por territorio",
)
async def get_progreso(db: AsyncSession = Depends(get_db_read)):
    sql = text("""
        SELECT
            dt.codigo_territorial, dt.departamento, dt.municipio, dt.provincia,
            COUNT(DISTINCT m.codigo_mesa)                                            AS total_mesas,
            COUNT(DISTINCT a.id_acta) FILTER (WHERE a.estado NOT IN ('RECHAZADA','RECHAZADO')) AS mesas_procesadas,
            ROUND(
                COUNT(DISTINCT a.id_acta) FILTER (WHERE a.estado NOT IN ('RECHAZADA','RECHAZADO'))
                * 100.0
                / NULLIF(COUNT(DISTINCT m.codigo_mesa), 0),
                2
            ) AS porcentaje_avance
        FROM distribucion_territorial dt
        LEFT JOIN mesa_electoral m   ON m.codigo_territorial = dt.codigo_territorial
        LEFT JOIN acta_oficial a     ON a.codigo_mesa = m.codigo_mesa
        GROUP BY dt.codigo_territorial, dt.departamento, dt.municipio, dt.provincia
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


@router.get(
    "/metricas",
    response_model=MetricasDashboard,
    summary="KPIs completos para el dashboard",
)
async def get_metricas(db: AsyncSession = Depends(get_db_read)):
    # ── Totales generales ──────────────────────────────────────────
    totales_sql = text("""
        SELECT
            COUNT(DISTINCT a.id_acta)                    AS total_actas,
            COUNT(DISTINCT m.codigo_mesa)                AS total_mesas,
            COALESCE(SUM(v.partido1),    0)::BIGINT      AS total_p1,
            COALESCE(SUM(v.partido2),    0)::BIGINT      AS total_p2,
            COALESCE(SUM(v.partido3),    0)::BIGINT      AS total_p3,
            COALESCE(SUM(v.partido4),    0)::BIGINT      AS total_p4,
            COALESCE(SUM(v.votos_validos),  0)::BIGINT   AS total_validos,
            COALESCE(SUM(v.votos_blancos),  0)::BIGINT   AS total_blancos,
            COALESCE(SUM(v.votos_nulos),    0)::BIGINT   AS total_nulos,
            COALESCE(SUM(v.total_votos),    0)::BIGINT   AS total_votos,
            COALESCE(SUM(m.nro_votantes),   0)::BIGINT   AS total_votantes
        FROM mesa_electoral m
        LEFT JOIN acta_oficial a  ON a.codigo_mesa = m.codigo_mesa
        LEFT JOIN voto_oficial v  ON v.id_acta = a.id_acta
    """)

    # ── Por estado ────────────────────────────────────────────────
    estados_sql = text("""
        SELECT estado, COUNT(*) AS total
        FROM acta_oficial
        GROUP BY estado
        ORDER BY total DESC
    """)

    # ── Throughput por hora (últimas 24h) ─────────────────────────
    throughput_sql = text("""
        SELECT
            TO_CHAR(fecha_registro, 'HH24:00') AS hora,
            COUNT(*) AS actas
        FROM acta_oficial
        WHERE fecha_registro >= NOW() - INTERVAL '24 hours'
        GROUP BY hora
        ORDER BY hora
    """)

    # ── Top errores de import ────────────────────────────────────
    top_errors_sql = text("""
        SELECT estado AS tipo, COUNT(*) AS total
        FROM acta_import_detalle
        WHERE estado IN ('RECHAZADA','ERROR')
        GROUP BY estado
        ORDER BY total DESC
        LIMIT 10
    """)

    t_row    = (await db.execute(totales_sql)).mappings().one()
    e_rows   = (await db.execute(estados_sql)).mappings().all()
    th_rows  = (await db.execute(throughput_sql)).mappings().all()
    err_rows = (await db.execute(top_errors_sql)).mappings().all()

    total_mesas  = t_row["total_mesas"] or 1
    total_actas  = t_row["total_actas"] or 0
    total_votantes = int(t_row["total_votantes"] or 0)
    total_votos    = int(t_row["total_votos"] or 0)
    participacion  = round(total_votos * 100.0 / total_votantes, 2) if total_votantes > 0 else 0.0
    porcentaje     = round(total_actas * 100.0 / total_mesas, 2)

    return MetricasDashboard(
        total_actas=total_actas,
        por_estado=[EstadoConteo(estado=r["estado"], total=r["total"]) for r in e_rows],
        total_partido1=int(t_row["total_p1"]),
        total_partido2=int(t_row["total_p2"]),
        total_partido3=int(t_row["total_p3"]),
        total_partido4=int(t_row["total_p4"]),
        total_votos_validos=int(t_row["total_validos"]),
        total_votos_blancos=int(t_row["total_blancos"]),
        total_votos_nulos=int(t_row["total_nulos"]),
        total_votos=total_votos,
        total_votantes=total_votantes,
        participacion_pct=participacion,
        throughput_por_hora=[ThroughputHora(hora=r["hora"], actas=r["actas"]) for r in th_rows],
        top_errores=[TopError(tipo=r["tipo"], total=r["total"]) for r in err_rows],
        porcentaje_avance=porcentaje,
        total_mesas=t_row["total_mesas"] or 0,
    )
