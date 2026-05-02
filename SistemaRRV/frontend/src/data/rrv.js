// src/data/rrv.js - VERSIÃ“N COMPLETA CON DEPARTAMENTOS DINÃMICOS
import { api } from '../services/api'

// ============================================================
// ESTADO GLOBAL
// ============================================================
export let parties = []
export let departments = []
export let national = { parties: [], blancos: 0, nulos: 0, totalValidos: 0, totalEmitidos: 0, margenPp: 0 }
export let officialNational = { parties: [], blancos: 0, nulos: 0 }
export let comparison = []
export let kpis = { actasRecibidas: 0, actasTotal: 35000, votosProcesados: 0, participacion: 79.4, latenciaSeg: 3.8 }
export let actas = []
export let auditEvents = []
export let techMetrics = { throughput: 0, disponibilidad: 99.93, smsPendientes: 0, inconsistencias: 0 }

// PaginaciÃ³n
let paginaActual = 0
const ACTAS_POR_PAGINA = 50
let cargandoMas = false
let hayMasActas = true
let totalActasDB = 0

// Colores por estado
export let estadoColores = {
  'PROCESADA': { bg: '#DCFCE7', fg: '#166534' },
  'PENDIENTE': { bg: '#E5E7EB', fg: '#374151' },
  'PROCESANDO_OCR': { bg: '#DBEAFE', fg: '#1D4ED8' },
  'ERROR_OCR': { bg: '#FEE2E2', fg: '#991B1B' },
  'ACTA_OBSERVADA': { bg: '#FEF3C7', fg: '#92400E' },
  'DUPLICADA': { bg: '#FEE2E2', fg: '#991B1B' },
  'ERROR': { bg: '#FEE2E2', fg: '#991B1B' }
}

export const fmt = {
  n: (n) => new Intl.NumberFormat('es-BO').format(Math.round(n || 0)),
  pct: (n, d = 1) => (n || 0).toFixed(d) + '%',
}

export const partyById = (id) => parties.find(p => p.id === id) || { name: 'Cargando...', color: '#94A3B8' }

// ============================================================
// PARTIDOS
// ============================================================
const PARTY_DEFINITIONS = {
  p1: { id: 'P1', name: 'Daenerys Targaryen', tag: 'DT', color: '#DC2626', dim: '#991B1B' },
  p2: { id: 'P2', name: 'Sansa Stark', tag: 'SS', color: '#7C3AED', dim: '#5B21B6' },
  p3: { id: 'P3', name: 'Robert Baratheon', tag: 'RB', color: '#F59E0B', dim: '#B45309' },
  p4: { id: 'P4', name: 'Tyrion Lannister', tag: 'TL', color: '#10B981', dim: '#065F46' },
}

// ============================================================
// DEPARTAMENTOS DE BOLIVIA (estructura base)
// ============================================================
const DEPT_BASE = {
  'BO-L': { id: 'BO-L', name: 'La Paz', capital: 'La Paz', code: 'LP' },
  'BO-S': { id: 'BO-S', name: 'Santa Cruz', capital: 'Santa Cruz', code: 'SC' },
  'BO-C': { id: 'BO-C', name: 'Cochabamba', capital: 'Cochabamba', code: 'CB' },
  'BO-O': { id: 'BO-O', name: 'Oruro', capital: 'Oruro', code: 'OR' },
  'BO-P': { id: 'BO-P', name: 'Potosi', capital: 'Potosi', code: 'PT' },
  'BO-H': { id: 'BO-H', name: 'Chuquisaca', capital: 'Sucre', code: 'CH' },
  'BO-T': { id: 'BO-T', name: 'Tarija', capital: 'Tarija', code: 'TR' },
  'BO-B': { id: 'BO-B', name: 'Beni', capital: 'Trinidad', code: 'BN' },
  'BO-N': { id: 'BO-N', name: 'Pando', capital: 'Cobija', code: 'PD' },
}

// ============================================================
// MAPEO DE RECINTOS A DEPARTAMENTOS
// ============================================================
function getDepartamentoFromActa(acta) {
  const codigoActa = extraerCodigoTerritorial(acta)
  const deptDesdeCodigo = codigoActa ? mapRecintoToDept(codigoActa) : null

  // El OCR a veces deja texto de direccion/recinto dentro de departamento.
  // Solo confiamos en el nombre cuando coincide con un departamento real.
  const deptDesdeOCR = mapNombreDept(acta.datos?.departamento)
  if (deptDesdeOCR) return deptDesdeOCR

  if (deptDesdeCodigo) return deptDesdeCodigo

  return null
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapNombreDept(nombre) {
  const n = normalizarTexto(nombre)
  const map = {
    'la paz': 'BO-L',
    'santa cruz': 'BO-S',
    'cochabamba': 'BO-C',
    'oruro': 'BO-O',
    'potosi': 'BO-P',
    'chuquisaca': 'BO-H',
    'tarija': 'BO-T',
    'beni': 'BO-B',
    'pando': 'BO-N',
  }
  return map[n] || null
}

function extraerCodigoTerritorial(acta) {
  const candidatos = [
    acta.datos?.nro_acta,
    acta.datos?.codigo_recinto,
    acta.recinto_id,
  ]

  if (acta.nombre) {
    const matchActa = acta.nombre.match(/acta_(\d{10,})/)
    const matchSms = acta.nombre.match(/SMS(?:_TEST)?_(\d{6,})/)
    candidatos.push(matchActa?.[1], matchSms?.[1])
  }

  return candidatos.find(valor => /^\d{2,}/.test(String(valor || ''))) || null
}

function mapRecintoToDept(recintoId) {
  const codigo = String(recintoId || '')
  const prefix2 = codigo.substring(0, 2)
  return mapCodigoToDept(prefix2) || mapCodigoToDept(codigo.substring(0, 1))
}

function mapCodigoToDept(codigo) {
  const map = {
    '1': 'BO-H', '10': 'BO-H',
    '2': 'BO-L', '20': 'BO-L',
    '3': 'BO-C', '30': 'BO-C',
    '4': 'BO-O', '40': 'BO-O',
    '5': 'BO-P', '50': 'BO-P',
    '6': 'BO-T', '60': 'BO-T',
    '7': 'BO-S', '70': 'BO-S',
    '8': 'BO-B', '80': 'BO-B',
    '9': 'BO-N', '90': 'BO-N',
  }
  return map[codigo] || null
}

// ============================================================
// CALCULAR DEPARTAMENTOS DESDE ACTAS REALES
// ============================================================
async function calcularDepartamentosDesdeActas() {
  console.log('ðŸ—ºï¸ Calculando departamentos desde actas...')
  
  try {
    // Obtener todas las actas procesadas (o una muestra grande)
    const data = await api.getActas('PROCESADA', 1000, 0)
    
    if (!data || !data.actas || data.actas.length === 0) {
      console.warn('âš ï¸ No hay actas para calcular departamentos, usando datos por defecto')
      return crearDepartamentosDefault()
    }
    
    // Inicializar contadores por departamento
    const deptStats = {}
    Object.keys(DEPT_BASE).forEach(id => {
      deptStats[id] = {
        ...DEPT_BASE[id],
        p1: 0, p2: 0, p3: 0, p4: 0,
        totalVotos: 0,
        actasCount: 0,
        mesas: new Set(),
        participacion: 0,
        leader: 'P1',
        votos: 0,
      }
    })
    
    let actasAsignadas = 0
    let actasSinDept = 0
    
    // Procesar cada acta
    for (const acta of data.actas) {
      const deptId = getDepartamentoFromActa(acta)
      
      if (deptId && deptStats[deptId]) {
        actasAsignadas++
        const stats = deptStats[deptId]
        
        // Extraer votos
        const votos = extraerVotos(acta)
        
        stats.p1 += votos.p1
        stats.p2 += votos.p2
        stats.p3 += votos.p3
        stats.p4 += votos.p4
        stats.totalVotos += votos.p1 + votos.p2 + votos.p3 + votos.p4
        stats.actasCount++
        
        // Registrar acta/mesa unica por recinto para evitar porcentajes mayores a 100%.
        const mesa = acta.datos?.nro_acta || acta.nombre || [extraerCodigoTerritorial(acta), acta.nro_mesa || acta.datos?.nro_mesa].filter(Boolean).join('-')
        if (mesa) stats.mesas.add(String(mesa))
      } else {
        actasSinDept++
      }
    }
    
    console.log(`ðŸ—ºï¸ Actas asignadas: ${actasAsignadas}, sin departamento: ${actasSinDept}`)
    
    // Convertir a array de departamentos
    const deptArray = Object.values(deptStats).map(stats => {
      // Determinar lÃ­der
      const votosPartidos = [
        { id: 'P1', votos: stats.p1 },
        { id: 'P2', votos: stats.p2 },
        { id: 'P3', votos: stats.p3 },
        { id: 'P4', votos: stats.p4 },
      ]
      votosPartidos.sort((a, b) => b.votos - a.votos)
      
      const leader = votosPartidos[0].id
      const totalVotos = stats.totalVotos || 1
      
      // Calcular porcentajes
      const pct = {
        P1: stats.totalVotos > 0 ? (stats.p1 / totalVotos) * 100 : 0,
        P2: stats.totalVotos > 0 ? (stats.p2 / totalVotos) * 100 : 0,
        P3: stats.totalVotos > 0 ? (stats.p3 / totalVotos) * 100 : 0,
        P4: stats.totalVotos > 0 ? (stats.p4 / totalVotos) * 100 : 0,
      }
      
      const mesasCount = stats.mesas.size || stats.actasCount * 1.2
      const participacion = Math.min(85, Math.max(65, 70 + (stats.actasCount / Math.max(mesasCount, 1)) * 15))
      
      return {
        id: stats.id,
        name: stats.name,
        capital: stats.capital,
        code: stats.code,
        leader,
        pct,
        votos: stats.totalVotos,
        actas: stats.actasCount,
        mesas: Math.round(mesasCount),
        participacion: Math.round(participacion * 10) / 10,
      }
    })
    
    console.log('âœ… Departamentos calculados:', deptArray.map(d => `${d.name}: ${d.actas} actas, ${d.votos} votos, lÃ­der: ${d.leader}`))
    return deptArray
    
  } catch (error) {
    console.error('âŒ Error calculando departamentos:', error)
    return crearDepartamentosDefault()
  }
}

function extraerVotos(acta) {
  if (acta.votos) {
    return {
      p1: acta.votos.partido1 || 0,
      p2: acta.votos.partido2 || 0,
      p3: acta.votos.partido3 || 0,
      p4: acta.votos.partido4 || 0,
    }
  }
  if (acta.datos) {
    return {
      p1: acta.datos.partido1 || acta.datos.p1 || acta.datos.P1 || 0,
      p2: acta.datos.partido2 || acta.datos.p2 || acta.datos.P2 || 0,
      p3: acta.datos.partido3 || acta.datos.p3 || acta.datos.P3 || 0,
      p4: acta.datos.partido4 || acta.datos.p4 || acta.datos.P4 || 0,
    }
  }
  return { p1: 0, p2: 0, p3: 0, p4: 0 }
}

function complementarConDefaults(deptArray) {
  const defaults = crearDepartamentosDefault()
  return deptArray.map(d => {
    if (d.actas > 0) return d
    const def = defaults.find(dd => dd.id === d.id)
    return def || d
  })
}

function crearDepartamentosDefault() {
  return [
    { id: 'BO-L', name: 'La Paz', capital: 'La Paz', code: 'LP', leader: 'P1', pct: { P1: 38.4, P2: 24.7, P3: 22.1, P4: 14.8 }, votos: 1287642, actas: 6840, mesas: 8200, participacion: 81.2 },
    { id: 'BO-S', name: 'Santa Cruz', capital: 'Santa Cruz', code: 'SC', leader: 'P2', pct: { P1: 22.6, P2: 41.3, P3: 19.8, P4: 16.3 }, votos: 1521088, actas: 7120, mesas: 8460, participacion: 78.9 },
    { id: 'BO-C', name: 'Cochabamba', capital: 'Cochabamba', code: 'CB', leader: 'P1', pct: { P1: 36.1, P2: 27.8, P3: 21.4, P4: 14.7 }, votos: 1043977, actas: 5210, mesas: 6080, participacion: 80.4 },
    { id: 'BO-O', name: 'Oruro', capital: 'Oruro', code: 'OR', leader: 'P3', pct: { P1: 25.3, P2: 19.6, P3: 35.7, P4: 19.4 }, votos: 283541, actas: 1520, mesas: 1810, participacion: 76.8 },
    { id: 'BO-P', name: 'Potosi', capital: 'Potosi', code: 'PT', leader: 'P3', pct: { P1: 21.7, P2: 18.9, P3: 38.2, P4: 21.2 }, votos: 321118, actas: 1810, mesas: 2150, participacion: 74.1 },
    { id: 'BO-H', name: 'Chuquisaca', capital: 'Sucre', code: 'CH', leader: 'P1', pct: { P1: 33.4, P2: 24.1, P3: 24.6, P4: 17.9 }, votos: 238412, actas: 1340, mesas: 1620, participacion: 79.3 },
    { id: 'BO-T', name: 'Tarija', capital: 'Tarija', code: 'TR', leader: 'P2', pct: { P1: 19.8, P2: 42.7, P3: 17.6, P4: 19.9 }, votos: 216085, actas: 1190, mesas: 1430, participacion: 81.6 },
    { id: 'BO-B', name: 'Beni', capital: 'Trinidad', code: 'BN', leader: 'P2', pct: { P1: 20.4, P2: 39.8, P3: 18.3, P4: 21.5 }, votos: 171623, actas: 920, mesas: 1170, participacion: 73.4 },
    { id: 'BO-N', name: 'Pando', capital: 'Cobija', code: 'PD', leader: 'P4', pct: { P1: 18.9, P2: 23.7, P3: 22.0, P4: 35.4 }, votos: 62498, actas: 340, mesas: 430, participacion: 71.8 },
  ]
}

// ============================================================
// CARGAR DATOS INICIALES
// ============================================================
export async function loadRealData() {
  console.log('ðŸ”„ Cargando datos desde el backend...')
  
  try {
    // 1. MÃ©tricas
    const metricsData = await api.getMetricas()
    console.log('ðŸ“Š MÃ©tricas:', metricsData)
    
    if (metricsData && !metricsData.error) {
      kpis = {
        actasRecibidas: metricsData.total_actas || 0,
        actasTotal: 35000,
        votosProcesados: metricsData.votos?.validos || 0,
        participacion: 79.4,
        latenciaSeg: 3.8
      }
      techMetrics = {
        throughput: metricsData.procesadas || 0,
        disponibilidad: 99.93,
        smsPendientes: 0,
        inconsistencias: 0
      }
    }
    
    // 2. Resultados nacionales
    const resultadosData = await api.getResultadosNacionales()
    console.log('ðŸ† Resultados:', resultadosData)
    if (resultadosData && !resultadosData.error) {
      updatePartiesFromResultados(resultadosData)
    }
    
    // 3. Calcular departamentos DINÃMICAMENTE desde actas reales
    departments = await calcularDepartamentosDesdeActas()
    console.log('ðŸ—ºï¸ Departamentos:', departments.map(d => d.name))
    
    // 4. Cargar primer lote de actas
    await cargarPrimerLote()
    
    console.log(`âœ… Datos cargados: ${actas.length} actas, ${parties.length} partidos, ${departments.length} departamentos`)
    return { actas, kpis, parties, national, departments }
    
  } catch (error) {
    console.error('âŒ Error:', error)
    return null
  }
}

// ============================================================
// CARGAR PRIMER LOTE
// ============================================================
async function cargarPrimerLote() {
  paginaActual = 0
  actas = []
  hayMasActas = true
  
  try {
    const data = await api.getActas(null, ACTAS_POR_PAGINA, 0)
    
    if (data && data.actas) {
      totalActasDB = data.total || 0
      actas = data.actas.map(a => formatearActa(a))
      paginaActual = 1
      hayMasActas = data.has_more || (actas.length < totalActasDB)
    }
  } catch (error) {
    console.error('âŒ Error:', error)
  }
}

// ============================================================
// CARGAR MÃS ACTAS
// ============================================================
export async function cargarMasActas() {
  if (cargandoMas || !hayMasActas) return false
  
  cargandoMas = true
  const skip = paginaActual * ACTAS_POR_PAGINA
  
  try {
    const data = await api.getActas(null, ACTAS_POR_PAGINA, skip)
    
    if (data && data.actas && data.actas.length > 0) {
      const nuevas = data.actas.map(a => formatearActa(a))
      actas = [...actas, ...nuevas]
      paginaActual++
      hayMasActas = data.has_more || (actas.length < totalActasDB)
      
      cargandoMas = false
      return true
    } else {
      hayMasActas = false
      cargandoMas = false
      return false
    }
  } catch (error) {
    cargandoMas = false
    return false
  }
}

// ============================================================
// FORMATEAR ACTA
// ============================================================
function formatearActa(acta) {
  const deptId = getDepartamentoFromActa(acta)
  const deptNombre = deptId ? DEPT_BASE[deptId]?.name : 'Pendiente'
  
  return {
    id: `A-${acta._id?.slice(-8) || ''}`,
    _id: acta._id,
    nombre: acta.nombre || '-',
    ciudad: deptNombre,
    deptId: deptId,
    recinto: acta.datos?.codigo_recinto || acta.recinto_id || acta.nombre?.substring(0, 30) || 'Sin recinto',
    mesa: `Mesa ${acta.nro_mesa || acta.datos?.nro_mesa || '?'}`,
    origen: acta.source || 'UPLOAD',
    estado: acta.estado || 'PENDIENTE',
    conf: acta.confianza || null,
    hora: acta.fecha_recepcion ? new Date(acta.fecha_recepcion).toLocaleTimeString('es-BO') : '-',
    fecha: acta.fecha_recepcion || null,
    datos: acta.datos || {},
    votos: acta.votos || null,
    validacion: acta.validacion || null,
  }
}

// ============================================================
// UTILIDADES
// ============================================================
export function tieneMasActas() { return hayMasActas }
export function estaCargandoActas() { return cargandoMas }
export function getTotalActasDB() { return totalActasDB }
export function getActasCargadas() { return actas.length }

export async function recargarActas() {
  await cargarPrimerLote()
  return actas
}

export async function cargarTodasLasActas() {
  while (hayMasActas) {
    await cargarMasActas()
    await new Promise(r => setTimeout(r, 100))
  }
  return actas
}

// ============================================================
// PARTIDOS
// ============================================================
function updatePartiesFromResultados(resultadosData) {
  const res = resultadosData.resultados || {}
  const pcts = resultadosData.porcentajes || {}
  const totales = resultadosData.totales || {}
  
  parties = [
    { id: 'P1', name: PARTY_DEFINITIONS.p1.name, tag: PARTY_DEFINITIONS.p1.tag, color: PARTY_DEFINITIONS.p1.color, dim: PARTY_DEFINITIONS.p1.dim, votos: res.p1 || 0, pct: pcts.p1 || 0 },
    { id: 'P2', name: PARTY_DEFINITIONS.p2.name, tag: PARTY_DEFINITIONS.p2.tag, color: PARTY_DEFINITIONS.p2.color, dim: PARTY_DEFINITIONS.p2.dim, votos: res.p2 || 0, pct: pcts.p2 || 0 },
    { id: 'P3', name: PARTY_DEFINITIONS.p3.name, tag: PARTY_DEFINITIONS.p3.tag, color: PARTY_DEFINITIONS.p3.color, dim: PARTY_DEFINITIONS.p3.dim, votos: res.p3 || 0, pct: pcts.p3 || 0 },
    { id: 'P4', name: PARTY_DEFINITIONS.p4.name, tag: PARTY_DEFINITIONS.p4.tag, color: PARTY_DEFINITIONS.p4.color, dim: PARTY_DEFINITIONS.p4.dim, votos: res.p4 || 0, pct: pcts.p4 || 0 },
  ]
  
  national = {
    parties: [...parties],
    blancos: totales.blancos || 0,
    nulos: totales.nulos || 0,
    totalValidos: totales.validos || 0,
    totalEmitidos: (totales.validos || 0) + (totales.blancos || 0) + (totales.nulos || 0),
    margenPp: parties.length > 1 ? Math.abs(parties[0].pct - parties[1].pct) : 0
  }
  
  comparison = parties.map(p => ({
    id: p.id, name: p.name, color: p.color, rrvPct: p.pct, officialPct: p.pct, diffPp: 0
  }))
}

export async function updatePartiesFromBackend() {
  try {
    const resultadosData = await api.getResultadosNacionales()
    if (resultadosData && !resultadosData.error) {
      updatePartiesFromResultados(resultadosData)
    }
  } catch (error) {
    console.error('âŒ Error:', error)
  }
  return parties
}

export async function initializeData() {
  await loadRealData()
}

export const getEstadoColor = (estado) => {
  return estadoColores[estado] || { bg: '#E5E7EB', fg: '#374151' }
}



