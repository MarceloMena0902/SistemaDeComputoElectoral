const OFICIAL_BASE = import.meta.env.VITE_OFICIAL_API_URL || 'http://localhost:4000';
const RRV_BASE = import.meta.env.VITE_RRV_API_URL || '';
export const ENABLE_API_SUBMIT = import.meta.env.VITE_ENABLE_API_SUBMIT === 'true';

async function request(path, options = {}) {
  const res = await fetch(`${OFICIAL_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = await res.text(); }
    const error = new Error(`HTTP ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return res.json();
}

export const apiInfo = {
  oficialBase: OFICIAL_BASE,
  rrvBase: RRV_BASE || 'no configurado',
  endpoints: {
    registrarActa: '/api/oficial/actas',
    registrarActaPrincipal: '/api/actas/registro',
    dashboardResultados: '/api/dashboard/resultados',
    dashboardProgreso: '/api/dashboard/progreso',
    auditoria: '/api/auditoria/logs',
    fallosDb: '/api/auditoria/fallos-db',
    rrvPendiente: '/api/rrv/resultados o /api/rrv/actas',
    envioAutomatico: ENABLE_API_SUBMIT ? 'habilitado por VITE_ENABLE_API_SUBMIT=true' : 'deshabilitado por defecto',
  },
};

export async function healthOficial() {
  const res = await fetch(`${OFICIAL_BASE}/health`);
  return res.json();
}

export async function registrarActaOficial(payload) {
  return request('/api/oficial/actas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getResultadosOficiales() {
  return request('/api/dashboard/resultados');
}

export async function getProgresoOficial() {
  return request('/api/dashboard/progreso');
}

export async function getAuditoriaOficial(limit = 100) {
  return request(`/api/auditoria/logs?limit=${limit}`);
}

export async function tryGetJsonFrom(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
