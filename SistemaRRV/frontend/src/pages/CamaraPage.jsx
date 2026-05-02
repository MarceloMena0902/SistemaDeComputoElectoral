// src/pages/CamaraPage.jsx - Versión sin cámara (solo galería)
import { useState } from 'react'

export default function CamaraPage() {
  const [imagen, setImagen] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)

  const API_URL = import.meta.env.VITE_API_URL ||  'http://172.20.10.2:8000'

  const seleccionarArchivo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImagen(ev.target.result)
      setResultado(null)
    }
    reader.readAsDataURL(file)
  }

  const enviarImagen = async () => {
    if (!imagen) return
    
    setEnviando(true)
    setResultado(null)
    
    try {
      const response = await fetch(`${API_URL}/api/subir-foto-y-procesar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagen_base64: imagen,
          nombre: `acta_recinto_${new Date().toISOString().slice(0,10)}`
        })
      })
      
      const data = await response.json()
      setResultado(data)
    } catch (error) {
      setResultado({ success: false, error: 'Error de conexión' })
    }
    setEnviando(false)
  }

  const limpiar = () => {
    setImagen(null)
    setResultado(null)
  }

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">📸 Subir Acta</div>
        <div className="card-sub">Selecciona una foto del acta electoral para procesarla</div>
      </div>

      {!imagen ? (
        <label style={{
          display: 'block',
          textAlign: 'center',
          padding: 40,
          border: '2px dashed #475569',
          borderRadius: 16,
          cursor: 'pointer',
          color: '#94A3B8',
          fontSize: 18,
          marginBottom: 16
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
          <div>Toca para seleccionar una foto del acta</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>JPG, PNG o PDF</div>
          <input 
            type="file" 
            accept="image/*,.pdf" 
            capture="environment"
            onChange={seleccionarArchivo} 
            style={{ display: 'none' }} 
          />
        </label>
      ) : (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
          <img 
            src={imagen} 
            alt="Previsualización" 
            style={{ 
              maxWidth: '100%', 
              maxHeight: 400, 
              borderRadius: 8,
              marginBottom: 16 
            }} 
          />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={limpiar} style={btn('#64748B')}>
              🗑️ Descartar
            </button>
            <button onClick={enviarImagen} disabled={enviando} style={btn('#10B981', enviando)}>
              {enviando ? '⏳ Enviando...' : '📤 Enviar y procesar'}
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div style={{
          padding: 16,
          borderRadius: 12,
          background: resultado.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${resultado.success ? '#10B981' : '#EF4444'}`,
          color: resultado.success ? '#10B981' : '#EF4444'
        }}>
          {resultado.success ? (
            <div>
              <strong>✅ Acta enviada correctamente</strong>
              {resultado.acta_id && <p style={{ fontSize: 13, marginTop: 4 }}>ID: {resultado.acta_id.slice(-8)}</p>}
              <p style={{ fontSize: 13 }}>Archivo: {resultado.pdf_filename}</p>
              <p style={{ fontSize: 13 }}>Estado: {resultado.estado}</p>
            </div>
          ) : (
            <strong>❌ {resultado.error}</strong>
          )}
        </div>
      )}
    </div>
  )
}

function btn(bg, disabled = false) {
  return {
    padding: '12px 20px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontWeight: 'bold',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1
  }
}