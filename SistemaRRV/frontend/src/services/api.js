const API_URL = import.meta.env.VITE_API_URL || 'http://10.254.0.27:8000'

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    })
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ API Error ${response.status}: ${errorText}`)
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`❌ API: ${error.message}`)
    throw error
  }
}

export const api = {
  getMetricas: async () => {
    try { return await fetchAPI('/metricas') }
    catch { return { error: 'Error', total_actas: 0 } }
  },

  getResultadosNacionales: async () => {
    try { return await fetchAPI('/resultados-nacionales') }
    catch { return { error: 'Error', partidos: {}, resultados: {}, totales: {} } }
  },

  getActas: async (estado = null, limit = 50, skip = 0) => {
    try {
      let endpoint = `/actas?limit=${limit}&skip=${skip}`
      if (estado) endpoint += `&estado=${estado}`
      return await fetchAPI(endpoint)
    } catch { return { actas: [], total: 0 } }
  },

  getSMSRecibidos: async () => {
    try { return await fetchAPI('/sms-recibidos') }
    catch { return { sms: [], total: 0 } }
  },

  enviarSMSTest: async (smsData) => {
    try {
      return await fetchAPI('/api/sms/test', {
        method: 'POST',
        body: JSON.stringify(smsData)
      })
    } catch { return { success: false, error: 'Error' } }
  },

  uploadActa: async (file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${API_URL}/recuento-rapido`, { method: 'POST', body: formData })
      return await response.json()
    } catch { return { success: false, error: 'Error' } }
  },

  healthCheck: async () => {
    try { return await fetchAPI('/health') }
    catch { return { status: 'error' } }
  }
}