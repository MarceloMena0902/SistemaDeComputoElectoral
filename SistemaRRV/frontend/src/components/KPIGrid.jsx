// src/components/KPIGrid.jsx
import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function KPIGrid() {
  const [metrics, setMetrics] = useState({
    total_actas: 0,
    procesadas: 0,
    pendientes: 0,
    errores: 0
  })

  const fetchMetrics = async () => {
    try {
      const data = await api.getMetricas()
      setMetrics({
        total_actas: data.total_actas || 0,
        procesadas: data.procesadas || 0,
        pendientes: data.pendientes || 0,
        errores: data.errores || 0,
        revision_humana: data.revision_humana || 0
      })
    } catch (error) {
      console.error('Error fetching metrics:', error)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 5000)
    return () => clearInterval(interval)
  }, [])

  const metricsList = [
    { label: 'TODAS', value: metrics.total_actas, note: '100.0% del total', color: '#94A3B8' },
    { label: 'PROCESADAS', value: metrics.procesadas, note: `${((metrics.procesadas / metrics.total_actas) * 100).toFixed(1) || 0}%`, color: '#16A34A' },
    { label: 'PENDIENTES', value: metrics.pendientes, note: `${((metrics.pendientes / metrics.total_actas) * 100).toFixed(1) || 0}%`, color: '#2563EB' },
    { label: 'ERRORES', value: metrics.errores, note: `${((metrics.errores / metrics.total_actas) * 100).toFixed(1) || 0}%`, color: '#DC2626' }
  ]

  return (
    <div className="kpi-grid">
      {metricsList.map(m => (
        <div key={m.label} className="kpi" style={{ '--kpi-color': m.color }}>
          <span>{m.label}</span>
          <strong>{m.value}</strong>
          <small>{m.note}</small>
        </div>
      ))}
    </div>
  )
}