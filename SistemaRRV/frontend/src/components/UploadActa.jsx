// src/components/UploadActa.jsx
import { useState } from 'react'
import { api } from '../services/api'

export default function UploadActa({ onSuccess }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setMessage(null)

    try {
      const result = await api.uploadActa(file)
      
      if (result.success) {
        setMessage({ type: 'success', text: `✅ Acta recibida. ID: ${result.acta_id?.slice(-8)}` })
        setFile(null)
        if (onSuccess) onSuccess()
      } else if (result.error === 'DUPLICADA') {
        setMessage({ type: 'warning', text: '⚠️ Esta acta ya fue subida anteriormente' })
      } else {
        setMessage({ type: 'error', text: `❌ ${result.error || 'Error al subir'}` })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Error de conexión' })
    }

    setUploading(false)
  }

  return (
    <div style={{ padding: 16, border: '1px dashed var(--border)', borderRadius: 12, textAlign: 'center' }}>
      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files[0])}
          disabled={uploading}
          id="acta-file"
          style={{ display: 'none' }}
        />
        <label 
          htmlFor="acta-file" 
          style={{ 
            display: 'block', 
            padding: 20, 
            cursor: 'pointer',
            color: file ? 'var(--accent-blue)' : 'var(--text-muted)',
            fontSize: 14
          }}
        >
          {file ? `📎 ${file.name}` : '📁 Click para seleccionar acta (PDF o imagen)'}
        </label>
        <button 
          type="submit" 
          disabled={!file || uploading}
          style={{ 
            padding: '8px 20px', 
            background: file ? '#10B981' : 'var(--border)', 
            border: 'none', 
            borderRadius: 8, 
            color: 'white', 
            fontWeight: 'bold', 
            cursor: file ? 'pointer' : 'not-allowed',
            opacity: uploading ? 0.6 : 1,
            marginTop: 8
          }}
        >
          {uploading ? '⏳ Subiendo...' : '📤 Subir acta'}
        </button>
      </form>
      
      {message && (
        <div style={{ 
          marginTop: 12, 
          padding: 10, 
          borderRadius: 6, 
          fontSize: 13,
          background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 
                      message.type === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
          color: message.type === 'success' ? '#10B981' : 
                 message.type === 'warning' ? '#F59E0B' : '#EF4444'
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}