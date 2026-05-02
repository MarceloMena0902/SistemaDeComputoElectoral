/* RRV Bolivia — Datos compartidos
   ============================================================
   Datos preliminares simulados. NO oficiales.
*/
window.RRV = (function () {
  // ───────────────────────── PARTIDOS ─────────────────────────
  const parties = [
    { id: 'P1', name: 'Partido 1', tag: 'Frente Norte',     color: '#3B82F6', dim: '#1E40AF' },
    { id: 'P2', name: 'Partido 2', tag: 'Movimiento Sur',   color: '#EA580C', dim: '#9A3412' },
    { id: 'P3', name: 'Partido 3', tag: 'Alianza Civica',   color: '#8B5CF6', dim: '#5B21B6' },
    { id: 'P4', name: 'Partido 4', tag: 'Unidad Nacional',  color: '#059669', dim: '#065F46' },
  ];

  // ─────────────────────── DEPARTAMENTOS ──────────────────────
  // 9 departamentos. SVG tiene 8 paths (sin Potosí — lo añadimos como tarjeta).
  // Líder, %, votos preliminares, actas procesadas / total
  const departments = [
    { id: 'BO-L', code: 'L', name: 'La Paz',     capital: 'La Paz',     leader: 'P1',
      pct: { P1: 38.4, P2: 24.7, P3: 22.1, P4: 14.8 }, votos: 1287642, actas: 6840, mesas: 8200, participacion: 81.2 },
    { id: 'BO-S', code: 'S', name: 'Santa Cruz', capital: 'Santa Cruz', leader: 'P2',
      pct: { P1: 22.6, P2: 41.3, P3: 19.8, P4: 16.3 }, votos: 1521088, actas: 7120, mesas: 8460, participacion: 78.9 },
    { id: 'BO-C', code: 'C', name: 'Cochabamba', capital: 'Cochabamba', leader: 'P1',
      pct: { P1: 36.1, P2: 27.8, P3: 21.4, P4: 14.7 }, votos: 1043977, actas: 5210, mesas: 6080, participacion: 80.4 },
    { id: 'BO-O', code: 'O', name: 'Oruro',      capital: 'Oruro',      leader: 'P3',
      pct: { P1: 25.3, P2: 19.6, P3: 35.7, P4: 19.4 }, votos:  283541, actas: 1520, mesas: 1810, participacion: 76.8 },
    { id: 'BO-P', code: 'P', name: 'Potosí',     capital: 'Potosí',     leader: 'P3',
      pct: { P1: 21.7, P2: 18.9, P3: 38.2, P4: 21.2 }, votos:  321118, actas: 1810, mesas: 2150, participacion: 74.1 },
    { id: 'BO-H', code: 'H', name: 'Chuquisaca', capital: 'Sucre',      leader: 'P1',
      pct: { P1: 33.4, P2: 24.1, P3: 24.6, P4: 17.9 }, votos:  238412, actas: 1340, mesas: 1620, participacion: 79.3 },
    { id: 'BO-T', code: 'T', name: 'Tarija',     capital: 'Tarija',     leader: 'P2',
      pct: { P1: 19.8, P2: 42.7, P3: 17.6, P4: 19.9 }, votos:  216085, actas: 1190, mesas: 1430, participacion: 81.6 },
    { id: 'BO-B', code: 'B', name: 'Beni',       capital: 'Trinidad',   leader: 'P2',
      pct: { P1: 20.4, P2: 39.8, P3: 18.3, P4: 21.5 }, votos:  171623, actas:  920, mesas: 1170, participacion: 73.4 },
    { id: 'BO-N', code: 'N', name: 'Pando',      capital: 'Cobija',     leader: 'P4',
      pct: { P1: 18.9, P2: 23.7, P3: 22.0, P4: 35.4 }, votos:   62498, actas:  340, mesas:  430, participacion: 71.8 },
  ];

  // ─────────────────── RESULTADOS NACIONALES ──────────────────
  function totalsByParty () {
    const t = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const d of departments) {
      for (const p of Object.keys(t)) t[p] += Math.round(d.votos * d.pct[p] / 100);
    }
    return t;
  }
  const partidoVotos = totalsByParty();
  const totalValidos = Object.values(partidoVotos).reduce((a, b) => a + b, 0);
  const blancos = 142318;
  const nulos   = 198754;
  const national = {
    parties: parties.map(p => ({
      ...p,
      votos: partidoVotos[p.id],
      pct: +(partidoVotos[p.id] / totalValidos * 100).toFixed(2),
    })).sort((a, b) => b.votos - a.votos),
    blancos, nulos,
    totalValidos,
    totalEmitidos: totalValidos + blancos + nulos,
    margenPp: 0,
  };
  national.margenPp = +(national.parties[0].pct - national.parties[1].pct).toFixed(2);

  // ───────────────────────── KPIs ─────────────────────────────
  const kpis = {
    actasRecibidas: departments.reduce((a, d) => a + d.actas, 0),
    actasTotal: 35000,
    votosProcesados: totalValidos,
    participacion: 79.4,
    latenciaSeg: 3.8,
  };

  // ────────────── ACTAS RECIENTES (OCR / SMS) ─────────────────
  const actas = [
    { id: 'A-10482', ciudad: 'Cochabamba', recinto: 'U.E. Ayacucho',     mesa: 'Mesa 021', origen: 'Foto/OCR', estado: 'Publicada',  conf: 97.8, hora: '14:32:11' },
    { id: 'A-10483', ciudad: 'La Paz',     recinto: 'Colegio Don Bosco', mesa: 'Mesa 115', origen: 'SMS',      estado: 'En revisión', conf: 88.2, hora: '14:32:08' },
    { id: 'A-10484', ciudad: 'Santa Cruz', recinto: 'U.E. San Martín',   mesa: 'Mesa 330', origen: 'Foto/OCR', estado: 'Duplicada',   conf: null, hora: '14:32:04' },
    { id: 'A-10485', ciudad: 'Tarija',     recinto: 'Colegio Nacional',  mesa: 'Mesa 009', origen: 'Foto/OCR', estado: 'Validada',    conf: 94.1, hora: '14:31:58' },
    { id: 'A-10486', ciudad: 'La Paz',     recinto: 'U.E. Bolívar',      mesa: 'Mesa 047', origen: 'Foto/OCR', estado: 'Publicada',   conf: 96.3, hora: '14:31:51' },
    { id: 'A-10487', ciudad: 'Oruro',      recinto: 'Colegio Pagador',   mesa: 'Mesa 012', origen: 'SMS',      estado: 'Validada',    conf: 91.5, hora: '14:31:44' },
    { id: 'A-10488', ciudad: 'Santa Cruz', recinto: 'U.E. Florida',      mesa: 'Mesa 208', origen: 'Foto/OCR', estado: 'Publicada',   conf: 98.4, hora: '14:31:39' },
    { id: 'A-10489', ciudad: 'Potosí',     recinto: 'Colegio Pichincha', mesa: 'Mesa 044', origen: 'SMS',      estado: 'En revisión', conf: 86.7, hora: '14:31:31' },
    { id: 'A-10490', ciudad: 'Cochabamba', recinto: 'U.E. Sucre',        mesa: 'Mesa 102', origen: 'Foto/OCR', estado: 'Validada',    conf: 95.2, hora: '14:31:24' },
    { id: 'A-10491', ciudad: 'Beni',       recinto: 'C. Trinidad',       mesa: 'Mesa 008', origen: 'SMS',      estado: 'Pendiente',   conf: null, hora: '14:31:18' },
    { id: 'A-10492', ciudad: 'Pando',      recinto: 'U.E. Cobija',       mesa: 'Mesa 003', origen: 'SMS',      estado: 'Validada',    conf: 89.3, hora: '14:31:12' },
    { id: 'A-10493', ciudad: 'La Paz',     recinto: 'Colegio Ayacucho',  mesa: 'Mesa 084', origen: 'Foto/OCR', estado: 'Publicada',   conf: 97.1, hora: '14:31:05' },
    { id: 'A-10494', ciudad: 'Chuquisaca', recinto: 'U.E. Junín',        mesa: 'Mesa 019', origen: 'Foto/OCR', estado: 'Validada',    conf: 93.6, hora: '14:30:58' },
    { id: 'A-10495', ciudad: 'Tarija',     recinto: 'C. Yacuiba',        mesa: 'Mesa 071', origen: 'SMS',      estado: 'En revisión', conf: 87.9, hora: '14:30:52' },
    { id: 'A-10496', ciudad: 'Santa Cruz', recinto: 'U.E. Warnes',       mesa: 'Mesa 412', origen: 'Foto/OCR', estado: 'Duplicada',   conf: null, hora: '14:30:47' },
    { id: 'A-10497', ciudad: 'Oruro',      recinto: 'C. La Salle',       mesa: 'Mesa 028', origen: 'Foto/OCR', estado: 'Publicada',   conf: 96.8, hora: '14:30:40' },
  ];

  // ────────────── ESTADOS — paleta refinada ──────────────────
  const estadoColores = {
    'Publicada':    { bg: '#DCFCE7', fg: '#166534', dot: '#16A34A' },
    'Validada':     { bg: '#DBEAFE', fg: '#1D4ED8', dot: '#2563EB' },
    'En revisión':  { bg: '#FEF3C7', fg: '#92400E', dot: '#D97706' },
    'Duplicada':    { bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
    'Pendiente':    { bg: '#E5E7EB', fg: '#374151', dot: '#6B7280' },
  };

  // ────────────── PIPELINE ────────────────────────────────────
  const pipeline = [
    { n: 1, t: 'Captura',      sub: 'App móvil / recinto',        detail: 'Foto del acta firmada por jurado' },
    { n: 2, t: 'OCR / SMS',    sub: 'Extracción de votos',        detail: 'Visión computacional + parser SMS' },
    { n: 3, t: 'Validación',   sub: 'Estructura y duplicados',    detail: 'Idempotencia + checks básicos' },
    { n: 4, t: 'Publicación',  sub: 'Dashboard preliminar',       detail: 'Lectura optimizada (CQRS)' },
  ];

  // ────────────── FORMATEO ────────────────────────────────────
  const fmt = {
    n: (n) => new Intl.NumberFormat('es-BO').format(Math.round(n)),
    pct: (n, d = 1) => (n).toFixed(d) + '%',
    pp: (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + ' pp',
  };

  // ────────────── PARTIDO HELPERS ─────────────────────────────
  const partyById = (id) => parties.find(p => p.id === id);

  return {
    parties, partyById,
    departments,
    national,
    kpis,
    actas,
    estadoColores,
    pipeline,
    fmt,
  };
})();
