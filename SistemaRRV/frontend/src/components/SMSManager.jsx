// src/components/SMSManager.jsx
import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function SMSManager({ onSuccess }) {
  const [smsHistory, setSmsHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  
  // Datos del SMS de prueba
  const [testSMS, setTestSMS] = useState({
    from_number: "+59171234567",
    recinto_id: "1020100041",
    mesa: "3",
    p1: "10",
    p2: "4",
    p3: "9",
    p4: "28",
    uv: "53",
    vb: "2",
    vn: "3",
    vnu: "41",
    token: "abc123"
  })

  // Cargar historial de SMS
  const cargarHistorial = async () => {
    setRefreshing(true)
    try {
      const data = await api.getSMSRecibidos()
      if (data.sms) setSmsHistory(data.sms)
    } catch (error) {
      console.error('Error cargando SMS:', error)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    cargarHistorial()
    const interval = setInterval(cargarHistorial, 10000)
    return () => clearInterval(interval)
  }, [])

  const generarMensaje = () => {
    return `RECINTO:${testSMS.recinto_id} MESA:${testSMS.mesa} P1:${testSMS.p1} P2:${testSMS.p2} P3:${testSMS.p3} P4:${testSMS.p4} UV:${testSMS.uv} VB:${testSMS.vb} VN:${testSMS.vn} VNU:${testSMS.vnu} TOKEN:${testSMS.token}`
  }

  const enviarSMSTest = async () => {
    setLoading(true)
    setTestResult(null)
    
    try {
      const result = await api.enviarSMSTest({
        from_number: testSMS.from_number,
        body: generarMensaje()
      })
      setTestResult(result)
      if (result.success) {
        cargarHistorial()
        onSuccess?.()
      }
    } catch (error) {
      setTestResult({ success: false, error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="card-title">📱 Gestión de <em>SMS</em></div>
      <div className="card-sub">Envío simulado y seguimiento de mensajes reales</div>

      {/* ============================================================ */}
      {/* INSTRUCCIONES PARA SMS REALES */}
      {/* ============================================================ */}
      <div style={{ 
        background: 'rgba(59, 130, 246, 0.1)', 
        borderLeft: '3px solid #3B82F6', 
        padding: '12px 16px', 
        borderRadius: 8,
        marginBottom: 20,
        marginTop: 16
      }}>
        <strong>📱 ¿Cómo enviar un SMS real?</strong>
        <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          Desde tu <strong>teléfono celular</strong>, envía un mensaje de texto al número <strong>+13613261754</strong> con el formato:
        </p>
        <code style={{ 
          display: 'block', 
          background: 'var(--bg)', 
          padding: 8, 
          borderRadius: 6, 
          fontSize: 11,
          marginTop: 8,
          wordBreak: 'break-all'
        }}>
          RECINTO:1020100041 MESA:3 P1:10 P2:4 P3:9 P4:28 UV:53 VB:2 VN:3 VNU:41 TOKEN:abc123
        </code>
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          ⚠️ El SMS será procesado automáticamente y aparecerá en el historial abajo.
        </p>
      </div>

      {/* ============================================================ */}
      {/* SIMULADOR DE SMS (para pruebas locales) */}
      {/* ============================================================ */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: 12, 
        padding: 16,
        marginBottom: 24
      }}>
        <h4 style={{ marginBottom: 12, fontFamily: 'var(--font-display)' }}>🧪 Simulador de SMS (pruebas locales)</h4>
        
        {/* Recinto y Mesa */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-faint)' }}>RECINTO ID</label>
            <input 
              value={testSMS.recinto_id} 
              onChange={e => setTestSMS({...testSMS, recinto_id: e.target.value})}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-faint)' }}>MESA</label>
            <input 
              value={testSMS.mesa} 
              onChange={e => setTestSMS({...testSMS, mesa: e.target.value})}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-faint)' }}>TOKEN</label>
            <input 
              value={testSMS.token} 
              onChange={e => setTestSMS({...testSMS, token: e.target.value})}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
        </div>

        {/* Votos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 10 }}>P1 (MAS)</label>
            <input value={testSMS.p1} onChange={e => setTestSMS({...testSMS, p1: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10 }}>P2 (CREEMOS)</label>
            <input value={testSMS.p2} onChange={e => setTestSMS({...testSMS, p2: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10 }}>P3 (CC)</label>
            <input value={testSMS.p3} onChange={e => setTestSMS({...testSMS, p3: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10 }}>P4 (FPV)</label>
            <input value={testSMS.p4} onChange={e => setTestSMS({...testSMS, p4: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
        </div>

        {/* Totales */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 10 }}>UV (Votos Válidos)</label>
            <input value={testSMS.uv} onChange={e => setTestSMS({...testSMS, uv: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10 }}>VB (Blancos)</label>
            <input value={testSMS.vb} onChange={e => setTestSMS({...testSMS, vb: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10 }}>VN (Nulos)</label>
            <input value={testSMS.vn} onChange={e => setTestSMS({...testSMS, vn: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <div>
            <label style={{ fontSize: 10 }}>VNU (No usadas)</label>
            <input value={testSMS.vnu} onChange={e => setTestSMS({...testSMS, vnu: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
        </div>

        {/* Mensaje generado */}
        <div style={{ background: 'var(--bg-2)', padding: 10, borderRadius: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>MENSAJE GENERADO:</span>
          <code style={{ display: 'block', fontSize: 10, wordBreak: 'break-all', marginTop: 4 }}>{generarMensaje()}</code>
        </div>

        <button 
          onClick={enviarSMSTest} 
          disabled={loading}
          style={{ 
            width: '100%', 
            padding: 10, 
            background: '#10B981', 
            border: 'none', 
            borderRadius: 8, 
            color: 'white', 
            fontWeight: 'bold', 
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Procesando...' : '📱 Enviar SMS simulado (prueba local)'}
        </button>

        {testResult && (
          <div style={{ 
            marginTop: 12, 
            padding: 10, 
            borderRadius: 6, 
            background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderLeft: `3px solid ${testResult.success ? '#10B981' : '#EF4444'}`
          }}>
            {testResult.success ? (
              <>
                <strong>✅ Acta recibida!</strong>
                <p style={{ fontSize: 11, marginTop: 4 }}>ID: {testResult.acta_id}</p>
                {testResult.errores?.length > 0 && (
                  <div style={{ marginTop: 6, padding: 6, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 4, fontSize: 11 }}>
                    ⚠️ {testResult.errores.join(', ')}
                  </div>
                )}
              </>
            ) : (
              <strong>❌ Error: {testResult.error}</strong>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* HISTORIAL DE SMS RECIBIDOS */}
      {/* ============================================================ */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>📜 Historial de SMS recibidos</h4>
          <button 
            onClick={cargarHistorial} 
            disabled={refreshing}
            style={{ 
              padding: '4px 10px', 
              background: 'transparent', 
              border: '1px solid var(--border)', 
              borderRadius: 6, 
              cursor: 'pointer', 
              fontSize: 11,
              opacity: refreshing ? 0.6 : 1
            }}
          >
            {refreshing ? '🔄' : '🔄 Refrescar'}
          </button>
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '120px 140px 1fr 80px',
          gap: 10,
          padding: '10px 0',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-faint)'
        }}>
          <span>FECHA</span>
          <span>NÚMERO</span>
          <span>RECINTO</span>
          <span>ESTADO</span>
        </div>
        
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {smsHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No hay SMS recibidos aún.
              <br />
              <small>Envía un SMS real desde tu celular al +13613261754</small>
            </div>
          ) : (
            smsHistory.map(sms => (
              <div key={sms._id} style={{ 
                display: 'grid', 
                gridTemplateColumns: '120px 140px 1fr 80px',
                gap: 10,
                padding: '10px 0',
                borderBottom: '1px dashed var(--border)',
                fontSize: 12,
                alignItems: 'center'
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(sms.fecha_recepcion).toLocaleTimeString()}</span>
                <span style={{ fontSize: 11 }}>{sms.from_number}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-blue)' }}>{sms.recinto_id || '-'}</span>
                <span style={{ 
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontSize: 10,
                  background: sms.procesado ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: sms.procesado ? '#10B981' : '#F59E0B',
                  width: 'fit-content'
                }}>
                  {sms.procesado ? '✅ Procesado' : '⏳ Pendiente'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}