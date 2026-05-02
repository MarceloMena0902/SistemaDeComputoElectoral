// src/components/ActaStream.jsx
import { useState, useEffect } from 'react'
import { actas as actasGlobal, cargarMasActas, tieneMasActas, estaCargandoActas, getTotalActasDB, getActasCargadas, getEstadoColor, recargarActas } from '../data/rrv'

export default function ActaStream({ autoRefresh = true }) {
  const [actas, setActas] = useState(actasGlobal)
  const [cargando, setCargando] = useState(false)
  const [hayMas, setHayMas] = useState(true)
  const [totalDB, setTotalDB] = useState(0)
  const [cargadas, setCargadas] = useState(0)

  // Sincronizar con el estado global cada 2 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setActas([...actasGlobal])
      setHayMas(tieneMasActas())
      setCargando(estaCargandoActas())
      setTotalDB(getTotalActasDB())
      setCargadas(getActasCargadas())
    }, 2000)
    
    // Inicial
    setActas([...actasGlobal])
    setHayMas(tieneMasActas())
    setTotalDB(getTotalActasDB())
    setCargadas(getActasCargadas())
    
    return () => clearInterval(interval)
  }, [])

  const handleCargarMas = async () => {
    if (cargando || !hayMas) return
    await cargarMasActas()
    setActas([...actasGlobal])
    setHayMas(tieneMasActas())
    setCargadas(getActasCargadas())
  }

  const handleRecargar = async () => {
    await recargarActas()
    setActas([...actasGlobal])
    setHayMas(tieneMasActas())
    setCargadas(getActasCargadas())
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="card-title">📄 Stream de actas</div>
          <div className="card-sub">
            Mostrando {cargadas} de {totalDB} actas totales
            {autoRefresh && <span style={{ marginLeft: 10, fontSize: 10, color: '#10B981' }}>● Auto-refresh</span>}
          </div>
        </div>
        <button 
          onClick={handleRecargar}
          style={{ 
            padding: '6px 12px', 
            background: 'var(--surface)', 
            border: '1px solid var(--border)', 
            borderRadius: 6, 
            cursor: 'pointer',
            fontSize: 11
          }}
        >
          🔄 Refrescar
        </button>
      </div>

      {/* Tabla de actas */}
      <div style={{ maxHeight: 500, overflow: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ 
              borderBottom: '2px solid var(--border)', 
              position: 'sticky', 
              top: 0, 
              background: 'var(--surface)',
              zIndex: 1
            }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', width: '15%' }}>NOMBRE</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', width: '20%' }}>RECINTO</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', width: '10%' }}>MESA</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', width: '10%' }}>ORIGEN</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', width: '12%' }}>ESTADO</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', width: '10%' }}>HORA</th>
            </tr>
          </thead>
          <tbody>
            {actas.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                  Cargando actas...
                </td>
              </tr>
            ) : (
              actas.map((acta, i) => {
                const colorEstado = getEstadoColor(acta.estado)
                return (
                  <tr 
                    key={acta._id || i} 
                    style={{ 
                      borderBottom: '1px dashed var(--border)',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '6px 12px', fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acta.nombre || '-'}
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acta.recinto || '-'}
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: 11 }}>
                      {acta.mesa || '-'}
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 10,
                        fontWeight: 'bold',
                        background: acta.origen === 'SMS' || acta.origen === 'SMS_TEST' 
                          ? 'rgba(59,130,246,0.15)' 
                          : 'rgba(16,185,129,0.15)',
                        color: acta.origen === 'SMS' || acta.origen === 'SMS_TEST' ? '#3B82F6' : '#10B981'
                      }}>
                        {acta.origen || 'UPLOAD'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 10,
                        fontWeight: 'bold',
                        background: colorEstado.bg,
                        color: colorEstado.fg
                      }}>
                        {acta.estado}
                      </span>
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {acta.hora || '-'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Botón CARGAR MÁS */}
      {hayMas && (
        <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
          <button
            onClick={handleCargarMas}
            disabled={cargando}
            style={{
              padding: '10px 40px',
              background: cargando ? 'var(--border)' : '#3B82F6',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontWeight: 'bold',
              cursor: cargando ? 'not-allowed' : 'pointer',
              opacity: cargando ? 0.7 : 1,
              fontSize: 13
            }}
          >
            {cargando ? '⏳ Cargando...' : `📥 Cargar más actas (${cargadas} de ${totalDB})`}
          </button>
        </div>
      )}

      {/* Indicador de que ya se cargaron todas */}
      {!hayMas && actas.length > 0 && (
        <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 12, color: '#10B981' }}>
          ✅ Todas las {actas.length} actas cargadas
        </div>
      )}
    </div>
  )
}