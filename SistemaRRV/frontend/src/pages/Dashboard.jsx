import { useEffect, useRef } from 'react'
import KPIGrid from '../components/KPIGrid'
import MapBlock from '../components/MapBlock'
import NationalResults from '../components/NationalResults'
import ActasStream from '../components/ActasStream'
import SparklineCard from '../components/SparklineCard'

export default function Dashboard() {
  const rootRef = useRef(null)

  useEffect(() => {
    let ctx
    let mounted = true

    import('gsap').then(({ gsap }) => {
      if (!mounted || !rootRef.current) return

      ctx = gsap.context(() => {
        gsap.set(['.kpi', '.card'], { clearProps: 'opacity,transform' })
        gsap.from('.kpi', {
          y: 18,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.55,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
        })
        gsap.from('.card', {
          y: 24,
          autoAlpha: 0,
          stagger: 0.1,
          duration: 0.65,
          delay: 0.16,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
        })
      }, rootRef)
    }).catch(() => {})

    return () => {
      mounted = false
      ctx?.revert()
    }
  }, [])

  const openDepartment = dept => {
    window.location.hash = `dept?id=${encodeURIComponent(dept.id)}`
  }

  return (
    <div ref={rootRef} className="page-stack">
      <KPIGrid />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 22 }}
        className="dash-row--2-1">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
            <div>
              <div className="card-title">Mapa <em>nacional</em></div>
              <div className="card-sub">Lider por departamento - hover para ver detalle</div>
            </div>
            <a href="#mapa" className="btn">Ver mapa completo →</a>
          </div>
          <MapBlock onSelectDept={openDepartment} />
        </div>

        <div className="card">
          <div style={{ marginBottom: 18 }}>
            <div className="card-title">Resultado <em>nacional</em></div>
            <div className="card-sub">Acumulado preliminar</div>
          </div>
          <NationalResults />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}
        className="dash-row--1-1">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
            <div>
              <div className="card-title">Stream de <em>actas</em></div>
              <div className="card-sub">Ultimas registradas - tiempo real</div>
            </div>
            <a href="#actas" className="btn">Ver tabla completa →</a>
          </div>
          <ActasStream />
        </div>

        <div className="card">
          <div style={{ marginBottom: 18 }}>
            <div className="card-title">Llegada de <em>actas / hora</em></div>
            <div className="card-sub">Curva del dia - captura agregada</div>
          </div>
          <SparklineCard />
        </div>
      </div>

      <div className="disclaimer">
        Datos preliminares NO oficiales - Este RRV es una herramienta de transparencia ciudadana. El computo oficial corre por separado.
      </div>
    </div>
  )
}
