const OFICIAL_BASE = import.meta.env.VITE_OFICIAL_API_URL || 'http://localhost:4000';
export const RRV_BASE = import.meta.env.VITE_RRV_API_URL || '';
export const RRV_ENABLED = Boolean(RRV_BASE);
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

// ─── Territorio (cascade ComboBox) ───────────────────────────
export async function getTerritorioDepartamentos() {
  return request('/api/territorio/departamentos');
}

export async function getTerritorioProvincias(depto) {
  return request(`/api/territorio/provincias?depto=${encodeURIComponent(depto)}`);
}

export async function getTerritorioMunicipios(prov) {
  return request(`/api/territorio/municipios?prov=${encodeURIComponent(prov)}`);
}

export async function getTerritorioRecintos(mun) {
  return request(`/api/territorio/recintos?mun=${encodeURIComponent(mun)}`);
}

export async function getTerritorioMesas(recintoId) {
  return request(`/api/territorio/mesas?recintoId=${recintoId}`);
}

// ─── Util ────────────────────────────────────────────────────────
export async function tryGetJsonFrom(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── RRV (Recuento Rápido de Votos — cluster MongoDB) ────────────
async function rrvFetch(path) {
  const res = await fetch(`${RRV_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`RRV HTTP ${res.status}`);
  return res.json();
}

/**
 * Transforma un documento de acta del cluster RRV (MongoDB) al formato
 * normalizado que usan filterActas / buildKpis / buildInconsistencias.
 * Los votos pueden venir aplanados o anidados en item.votos / item.datos_ocr.
 */
export function transformRrvActa(item, index) {
  const v = item.votos || item.datos_ocr || item;
  return {
    codigoActa:          String(item._id || item.codigo_acta || item.nro_acta || `RRV-${index}`),
    nroActa:             item.nro_acta || item.nombre || String(item._id || `RRV-${index}`),
    codigoMesa:          Number(item.codigo_mesa  || 0),
    nroMesa:             Number(item.nro_mesa     || 0),
    codigoTerritorial:   Number(item.codigo_territorial || 0),
    departamento:        item.departamento  || '',
    provincia:           item.provincia     || '',
    municipio:           item.municipio     || '',
    recinto:             item.recinto || item.nombre_recinto || '',
    votantesHabilitados: Number(item.nro_votantes || item.votantes_habilitados || 0),
    p1:           Number(v.partido1  ?? v.p1 ?? 0),
    p2:           Number(v.partido2  ?? v.p2 ?? 0),
    p3:           Number(v.partido3  ?? v.p3 ?? 0),
    p4:           Number(v.partido4  ?? v.p4 ?? 0),
    votosBlancos: Number(v.votos_blancos ?? v.votosBlancos ?? 0),
    votosNulos:   Number(v.votos_nulos   ?? v.votosNulos   ?? 0),
    votosValidos: Number(v.votos_validos ?? v.votosValidos ?? 0),
    totalVotos:   Number(v.total_votos   ?? v.totalVotos   ?? 0),
    estado:             item.estado  || 'PROCESADA',
    fuente:             'RRV',
    origen:             item.source  || item.origen || 'RRV',
    fechaRecepcion:     item.fecha_recepcion || item.fechaRecepcion || '',
    observacionTecnica: item.observacion || item.observacionTecnica || '',
  };
}

export async function getRrvMetricas() {
  return rrvFetch('/metricas');
}

export async function getRrvResultadosNacionales() {
  return rrvFetch('/resultados-nacionales');
}

export async function getRrvActas(limit = 500, skip = 0) {
  const data = await rrvFetch(`/actas?limit=${limit}&skip=${skip}`);
  const raw = data.actas || data.items || [];
  return { actas: raw.map(transformRrvActa), total: data.total || raw.length };
}
