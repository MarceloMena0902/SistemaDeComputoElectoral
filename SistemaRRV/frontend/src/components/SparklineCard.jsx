import { useEffect, useRef } from 'react'

const PTS = [4, 8, 14, 22, 35, 58, 78, 95, 110, 128, 142, 138, 130, 118, 102, 90, 80, 72, 66, 60]

export default function SparklineCard() {
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const timer = setTimeout(() => {
      const W = host.clientWidth || 400
      const H = 60
      const max = Math.max(...PTS)
      const xs = i => (i / (PTS.length - 1)) * W
      const ys = v => H - (v / max) * H
      const line = PTS.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(v)}`).join(' ')
      const area = line + ` L ${W} ${H} L 0 ${H} Z`
      host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;overflow:visible">
        <path class="area" d="${area}"/>
        <path d="${line}"/>
      </svg>`
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div>
      <div className="sparkline" ref={hostRef} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)', letterSpacing: '0.12em' }}>
            PICO ACTAS / MIN
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', marginTop: 4 }}>
            142<span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>/min</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
            Hora pico · 16:00–17:00
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)', letterSpacing: '0.12em' }}>
            REVISIÓN MANUAL
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', marginTop: 4, color: '#D97706' }}>
            8.4<span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>%</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
            cola humana
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)', letterSpacing: '0.12em' }}>
            DUPLICADAS
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', marginTop: 4, color: '#DC2626' }}>
            0.6<span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>%</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
            descartadas auto
          </div>
        </div>
      </div>
    </div>
  )
}
