import { useEffect, useRef } from 'react'
import { kpis, fmt } from '../data/rrv'

const actasPct = (kpis.actasRecibidas / kpis.actasTotal * 100)

const KPIS = [
  {
    label: 'Actas procesadas',
    value: fmt.n(kpis.actasRecibidas),
    unit: `/ ${fmt.n(kpis.actasTotal)}`,
    barW: actasPct,
    sub: [`${actasPct.toFixed(1)}% completado`, '+12 / min'],
  },
  {
    label: 'Votos contabilizados',
    value: fmt.n(kpis.votosProcesados / 1000),
    unit: 'mil',
    barW: 74,
    sub: ['74% del padrón estimado', '↗'],
  },
  {
    label: 'Participación',
    value: kpis.participacion,
    unit: '%',
    barW: kpis.participacion,
    sub: ['turnout estimado', '+0.4 vs 2020'],
  },
  {
    label: 'Latencia mediana',
    value: kpis.latenciaSeg,
    unit: 's',
    barW: 38,
    sub: ['captura → publicación', 'SLA <5s ✓'],
  },
]

export default function KPIGrid() {
  const fillRefs = useRef([])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fillRefs.current.forEach((el, i) => {
        if (el) el.style.width = KPIS[i].barW + '%'
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="kpi-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: 16,
    }}>
      {KPIS.map((k, i) => (
        <div key={k.label} className="kpi">
          <div className="kpi__label">{k.label}</div>
          <div className="kpi__value">
            {k.value}<span className="unit">{k.unit}</span>
          </div>
          <div className="kpi__bar">
            <div
              className="kpi__bar-fill"
              ref={el => fillRefs.current[i] = el}
              style={{ width: 0 }}
            />
          </div>
          <div className="kpi__sub">
            <span>{k.sub[0]}</span>
            <span>{k.sub[1]}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
