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
    listarActas: '/api/oficial/actas',
    dashboardResultados: '/api/dashboard/resultados',
    dashboardProgreso: '/api/dashboard/progreso',
    dashboardMetricas: '/api/dashboard/metricas',
    auditoria: '/api/auditoria/logs',
    fallosDb: '/api/auditoria/fallos-db',
    automatizacionIniciar: '/api/automatizacion/iniciar',
    automatizacionProgreso: '/api/automatizacion/progreso/{run_id}',
    automatizacionRuns: '/api/automatizacion/runs',
    envioAutomatico: ENABLE_API_SUBMIT ? 'habilitado' : 'deshabilitado (modo demo)',
  },
};

// ─── Transformar item de backend (snake_case) → frontend (camelCase) ──
export function transformActaItem(item) {
  return {
    codigoActa:              String(item.codigo_mesa || item.nro_acta || ''),
    nroActa:                 item.nro_acta || '',
    codigoMesa:              item.codigo_mesa || 0,
    nroMesa:                 item.nro_mesa || 0,
    departamento:            item.departamento || '',
    provincia:               item.provincia || '',
    municipio:               item.municipio || '',
    recinto:                 item.recinto_nombre || '',
    p1:                      item.partido1 || 0,
    p2:                      item.partido2 || 0,
    p3:                      item.partido3 || 0,
    p4:                      item.partido4 || 0,
    votosBlancos:            item.votos_blancos || 0,
    votosNulos:              item.votos_nulos || 0,
    votosValidos:            item.votos_validos || 0,
    totalVotos:              item.total_votos || 0,
    votantesHabilitados:     item.nro_votantes || 0,
    papeletasAnfora:         item.papeletas_anfora || 0,
    papeletasNoUtilizadas:   item.papeletas_no_utilizadas || 0,
    estado:                  item.estado || 'VALIDA',
    fuente:                  'OFICIAL',
    origen:                  item.origen || 'POSTGRESQL',
    observacionTecnica:      item.observacion || '',
    fechaRegistro:           item.fecha_registro || '',
  };
}

// ─── Health ──────────────────────────────────────────────────────
export async function healthOficial() {
  const res = await fetch(`${OFICIAL_BASE}/health`);
  return res.json();
}

// ─── Actas ───────────────────────────────────────────────────────
export async function registrarActaOficial(payload) {
  return request('/api/oficial/actas', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getActasOficiales({ estado, departamento, origen, q, page = 1, limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (estado)       params.set('estado', estado);
  if (departamento) params.set('departamento', departamento);
  if (origen)       params.set('origen', origen);
  if (q)            params.set('q', q);
  params.set('page',  String(page));
  params.set('limit', String(limit));
  const data = await request(`/api/oficial/actas?${params}`);
  return {
    items: (data.items || []).map(transformActaItem),
    total: data.total || 0,
    page:  data.page  || 1,
    limit: data.limit || limit,
  };
}

// ─── Dashboard ───────────────────────────────────────────────────
export async function getResultadosOficiales() {
  return request('/api/dashboard/resultados');
}

export async function getProgresoOficial() {
  return request('/api/dashboard/progreso');
}

export async function getMetricasDashboard() {
  return request('/api/dashboard/metricas');
}

// ─── Auditoría ───────────────────────────────────────────────────
export async function getAuditoriaOficial(limit = 100) {
  return request(`/api/auditoria/logs?limit=${limit}`);
}

// ─── Automatización ──────────────────────────────────────────────
export async function iniciarAutomatizacion() {
  return request('/api/automatizacion/iniciar', { method: 'POST', body: '{}' });
}

export async function getProgresoAutomatizacion(runId) {
  return request(`/api/automatizacion/progreso/${runId}`);
}

export async function getRunsAutomatizacion() {
  return request('/api/automatizacion/runs');
}

export async function getEstadoAutomatizacion() {
  return request('/api/automatizacion/estado');
}

// ─── Util ────────────────────────────────────────────────────────
export async function tryGetJsonFrom(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
