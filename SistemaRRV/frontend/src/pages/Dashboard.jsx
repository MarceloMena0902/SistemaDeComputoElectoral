// src/pages/Dashboard.jsx
import { useEffect, useState, useCallback } from 'react'
import { api } from '../services/api'
import SMSManager from '../components/SMSManager'
import MapBlock from '../components/MapBlock'

const iconPaths = {
  chart: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  file: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 13h6 M9 17h6',
  check: 'M5 12l4 4L19 6',
  alert: 'M12 3l9 16H3z M12 8v5 M12 17h.01',
  close: 'M6 6l12 12M18 6L6 18',
  phone: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M11 18h2',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6',
  ballot: 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',
}

function SvgIcon({ name, color = 'currentColor', size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name] || iconPaths.chart} />
    </svg>
  )
}

export default function Dashboard() {
  const [metricas, setMetricas] = useState({
    total_actas: 0, procesadas: 0, pendientes: 0, errores: 0,
    observadas: 0, sms_recibidos: 0
  })
  const [resultadosNacionales, setResultadosNacionales] = useState(null)
  const [ultimasActas, setUltimasActas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)

  const cargarDatos = useCallback(async () => {
    try {
      const [metricasData, resultadosData, actasData] = await Promise.all([
        api.getMetricas(),
        api.getResultadosNacionales(),
        api.getActas(null, 20)
      ])

      console.log('Metricas:', metricasData)
      console.log('Resultados:', resultadosData)

      if (!metricasData.error) setMetricas(metricasData)
      if (!resultadosData.error) setResultadosNacionales(resultadosData)
      if (actasData.actas) setUltimasActas(actasData.actas)

      setUltimaActualizacion(new Date().toLocaleTimeString())
      setError(null)
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
    const interval = setInterval(cargarDatos, 30000)
    return () => clearInterval(interval)
  }, [cargarDatos])

  const nombresPartidos = resultadosNacionales?.partidos || {
    p1: { nombre: 'Daenerys Targaryen', color: '#DC2626', sigla: 'DT' },
    p2: { nombre: 'Sansa Stark', color: '#7C3AED', sigla: 'SS' },
    p3: { nombre: 'Robert Baratheon', color: '#F59E0B', sigla: 'RB' },
    p4: { nombre: 'Tyrion Lannister', color: '#10B981', sigla: 'TL' },
  }

  const resultados = resultadosNacionales?.resultados || { p1: 0, p2: 0, p3: 0, p4: 0 }
  const porcentajes = resultadosNacionales?.porcentajes || { p1: 0, p2: 0, p3: 0, p4: 0 }
  const totales = resultadosNacionales?.totales || { validos: 0, blancos: 0, nulos: 0 }
  const totalActas = resultadosNacionales?.total_actas || 0
  const actasConVotos = resultadosNacionales?.actas_con_votos || 0

  const openDepartment = dept => {
    window.location.hash = `dept?id=${encodeURIComponent(dept.id)}`
  }

  if (cargando) {
    return (
      <div className="dashboard-loading">
        <SvgIcon name="refresh" size={34} />
        <h2>Cargando datos del sistema...</h2>
      </div>
    )
  }

  return (
    <div className="dashboard-real" style={{ padding: 20 }}>
      <div className="dashboard-status" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20, padding: '10px 16px', background: 'var(--surface)',
        borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap', gap: 10
      }}>
        <div className="dashboard-status__title">
          <span className="dashboard-inline-icon"><SvgIcon name="chart" size={18} /></span>
          <span style={{ fontWeight: 'bold', fontSize: 14 }}>Dashboard en vivo</span>
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Recuento Rapido de Votos - datos preliminares NO oficiales
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: error ? '#EF4444' : '#10B981', fontWeight: 'bold' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? '#EF4444' : '#10B981', display: 'inline-block' }} />
            {error ? 'ERROR' : 'EN VIVO'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Actualizado - {ultimaActualizacion || '--:--:--'}</span>
          <button onClick={cargarDatos} className="dashboard-refresh" style={{ padding: '4px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
            <SvgIcon name="refresh" size={13} /> Actualizar
          </button>
        </div>
      </div>

      <div className="dashboard-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <MetricaCard titulo="TOTAL ACTAS" valor={metricas.total_actas} color="#3B82F6" icon="file" />
        <MetricaCard titulo="PROCESADAS" valor={metricas.procesadas} color="#10B981" icon="check" />
        <MetricaCard titulo="OBSERVADAS" valor={metricas.observadas} color="#F59E0B" icon="alert" />
        <MetricaCard titulo="ERRORES" valor={metricas.errores} color="#EF4444" icon="close" />
        <MetricaCard titulo="SMS" valor={metricas.sms_recibidos} color="#8B5CF6" icon="phone" />
      </div>

      <section className="card dashboard-map-card">
        <div className="dashboard-map-card__head">
          <div>
            <div className="card-title">Mapa <em>nacional</em></div>
            <div className="card-sub">Lider por departamento - click para ver detalle</div>
          </div>
          <a href="#mapa" className="btn">Ver mapa completo</a>
        </div>
        <MapBlock onSelectDept={openDepartment} />
      </section>

      <SMSManager onSuccess={cargarDatos} />

      <div className="card dashboard-results-card" style={{ marginBottom: 24 }}>
        <div className="card-title"><SvgIcon name="ballot" size={21} /> RESULTADOS POR PARTIDO</div>
        <div className="card-sub">
          Basado en {totalActas} actas ({actasConVotos} con votos)
        </div>

        <div className="dashboard-party-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16 }}>
          {['p1', 'p2', 'p3', 'p4'].map(key => (
            <ResultadoPartido
              key={key}
              nombre={nombresPartidos[key]?.nombre || key}
              sigla={nombresPartidos[key]?.sigla || ''}
              votos={resultados[key] || 0}
              porcentaje={porcentajes[key] || 0}
              color={nombresPartidos[key]?.color || '#94A3B8'}
            />
          ))}
        </div>

        <div className="dashboard-totals-grid" style={{
          marginTop: 20, padding: 16, background: 'var(--bg-2)', borderRadius: 8,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, textAlign: 'center'
        }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#3B82F6' }}>{totales.validos?.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Votos validos</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#94A3B8' }}>{totales.blancos?.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Votos blancos</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#EF4444' }}>{totales.nulos?.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Votos nulos</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#10B981' }}>{totalActas}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Actas totales</div>
          </div>
        </div>
      </div>

      <div className="card dashboard-stream-card" style={{ marginBottom: 24 }}>
        <div className="card-title"><SvgIcon name="file" size={21} /> Stream de actas</div>
        <div className="card-sub">Ultimas registradas</div>

        <div style={{ maxHeight: 400, overflow: 'auto', marginTop: 12 }}>
          {ultimasActas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No hay actas</div>
          ) : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10 }}>NOMBRE</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10 }}>ORIGEN</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10 }}>ESTADO</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10 }}>HORA</th>
                </tr>
              </thead>
              <tbody>
                {ultimasActas.map((acta, i) => (
                  <tr key={acta._id || i} style={{ borderBottom: '1px dashed var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acta.nombre || '-'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10,
                        background: acta.source === 'SMS' || acta.source === 'SMS_TEST' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                        color: acta.source === 'SMS' || acta.source === 'SMS_TEST' ? '#3B82F6' : '#10B981' }}>
                        {acta.source || 'UPLOAD'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10,
                        background: acta.estado === 'PROCESADA' ? 'rgba(16,185,129,0.15)' : acta.estado === 'ACTA_OBSERVADA' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                        color: acta.estado === 'PROCESADA' ? '#10B981' : acta.estado === 'ACTA_OBSERVADA' ? '#F59E0B' : '#EF4444' }}>
                        {acta.estado || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)' }}>
                      {acta.fecha_recepcion ? new Date(acta.fecha_recepcion).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="dashboard-disclaimer" style={{ textAlign: 'center', padding: 16, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
        Datos preliminares NO oficiales - Este RRV es una herramienta de transparencia ciudadana.
      </div>
    </div>
  )
}

function MetricaCard({ titulo, valor, color, icon }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', borderLeft: `4px solid ${color}`, color }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <SvgIcon name={icon} color={color} size={14} /> {titulo}
      </div>
      <div style={{ fontSize: 36, fontWeight: 'bold', color }}>{valor.toLocaleString()}</div>
    </div>
  )
}

function ResultadoPartido({ nombre, sigla, votos, porcentaje, color }) {
  return (
    <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 20, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 16, fontWeight: 'bold', color, marginBottom: 2 }}>{nombre}</div>
      {sigla && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{votos.toLocaleString()} votos</div>}
      <div style={{ fontSize: 32, fontWeight: 'bold', color }}>{votos.toLocaleString()}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{porcentaje}%</div>
      <div style={{ marginTop: 8, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(porcentaje, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}
