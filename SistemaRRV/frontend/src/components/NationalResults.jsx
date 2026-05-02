// src/components/NationalResults.jsx
import { useEffect, useRef, useState } from 'react'
import { national, fmt } from '../data/rrv'

export default function NationalResults() {
  const fillRefs = useRef([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Verificar si hay datos
  const lider = national?.parties?.[0]
  const hasData = lider && national.parties && national.parties.length > 0

  useEffect(() => {
    if (!hasData) {
      // Esperar a que los datos se carguen
      const checkData = setInterval(() => {
        if (national?.parties?.length > 0) {
          setIsLoading(false)
          clearInterval(checkData)
        }
      }, 500)
      return () => clearInterval(checkData)
    } else {
      setIsLoading(false)
    }
  }, [hasData])

  useEffect(() => {
    if (!hasData) return
    
    const frame = requestAnimationFrame(() => {
      fillRefs.current.forEach((el, i) => {
        if (el && national.parties[i]) {
          const pct = (national.parties[i].pct / lider.pct) * 100
          el.style.width = pct + '%'
        }
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [hasData, lider])

  // Mostrar loading mientras carga
  if (isLoading || !hasData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div>Cargando resultados...</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="nat-leader">
            {lider.name}<br />
            <em>{lider.pct?.toFixed(1) || '0'}<span className="pct">%</span></em>
          </div>
        </div>
        <div className="nat-meta">
          MARGEN<br />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            +{national.margenPp?.toFixed(1) || '0'} pp
          </span>
        </div>
      </div>

      {national.parties.map((p, i) => (
        <div key={p.id} className="party-row">
          <div className="party-row__head">
            <div className="party-row__name">
              <span className="party-row__chip" style={{ background: p.color }} />
              <strong>{p.name}</strong>
              <span>{p.tag}</span>
            </div>
            <div className="party-row__pct" style={{ color: p.color }}>
              {p.pct?.toFixed(1) || '0'}<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>%</span>
            </div>
          </div>
          <div className="party-row__bar">
            <div
              className="party-row__fill"
              ref={el => fillRefs.current[i] = el}
              style={{ background: p.color, width: 0 }}
            />
          </div>
          <div className="party-row__meta">
            <span>{fmt.n(p.votos)} VOTOS</span>
            <span>{p.id === lider.id ? 'LÍDER' : '·'}</span>
          </div>
        </div>
      ))}

      <div style={{
        marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)'
      }}>
        <div>
          BLANCOS<br />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text)' }}>
            {fmt.n(national.blancos)}
          </span>
        </div>
        <div>
          NULOS<br />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text)' }}>
            {fmt.n(national.nulos)}
          </span>
        </div>
      </div>
    </div>
  )
}