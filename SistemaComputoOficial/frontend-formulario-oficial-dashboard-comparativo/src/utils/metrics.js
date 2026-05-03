export const PARTIES = [
  { key: 'p1', label: 'Daenerys Targaryen', short: 'DT' },
  { key: 'p2', label: 'Sansa Stark',        short: 'SS' },
  { key: 'p3', label: 'Robert Baratheon',   short: 'RB' },
  { key: 'p4', label: 'Tyrion Lannister',   short: 'TL' },
];

export const fmt = (n) => new Intl.NumberFormat('es-BO').format(Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);
export const pct = (value, total, digits = 2) => total ? `${((value * 100) / total).toFixed(digits)}%` : '0.00%';
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function sumFields(data, key) {
  return data.reduce((acc, row) => acc + Number(row[key] || 0), 0);
}

export function totals(data) {
  const p = Object.fromEntries(PARTIES.map(({ key }) => [key, sumFields(data, key)]));
  const votosValidos = p.p1 + p.p2 + p.p3 + p.p4;
  const votosBlancos = sumFields(data, 'votosBlancos');
  const votosNulos = sumFields(data, 'votosNulos');
  const totalVotos = votosValidos + votosBlancos + votosNulos;
  const habilitados = sumFields(data, 'votantesHabilitados');
  return { ...p, votosValidos, votosBlancos, votosNulos, totalVotos, habilitados };
}

export function buildKpis(oficial, rrv) {
  const o = totals(oficial);
  const r = totals(rrv);
  const partyTotals = PARTIES.map((p) => ({ key: p.key, label: p.label, value: o[p.key] })).sort((a, b) => b.value - a.value);
  const obs = oficial.filter((a) => String(a.estado).toUpperCase().includes('OBSERV')).length;
  const inconsistencias = buildInconsistencias(oficial, rrv).length;
  return {
    actasOficial: oficial.length,
    actasRRV: rrv.length,
    avance: oficial.length ? (oficial.length * 100) / Math.max(rrv.length, oficial.length) : 0,
    participacion: o.habilitados ? (o.totalVotos * 100) / o.habilitados : 0,
    diferenciaGlobal: o.totalVotos - r.totalVotos,
    actasObservadas: obs,
    inconsistencias,
    ganador: partyTotals[0]?.label || 'Sin datos',
    margenVictoria: (partyTotals[0]?.value || 0) - (partyTotals[1]?.value || 0),
    oficial: o,
    rrv: r,
  };
}

export function compareParties(oficial, rrv) {
  const o = totals(oficial);
  const r = totals(rrv);
  return PARTIES.map((p) => {
    const diff = o[p.key] - r[p.key];
    return {
      key: p.key,
      name: p.label,
      rrv: r[p.key],
      oficial: o[p.key],
      diff,
      diffPct: r[p.key] ? (diff * 100) / r[p.key] : 0,
      pctOficial: o.votosValidos ? (o[p.key] * 100) / o.votosValidos : 0,
    };
  });
}

export function filterActas(data, filters = {}) {
  const q = String(filters.q || '').trim().toLowerCase();
  const mesa = String(filters.mesa || '').trim();
  const fuente = String(filters.fuente || '').trim().toUpperCase();
  return data.filter((a) => {
    if (filters.departamento && a.departamento !== filters.departamento) return false;
    if (filters.provincia && a.provincia !== filters.provincia) return false;
    if (filters.municipio && a.municipio !== filters.municipio) return false;
    if (filters.recinto && a.recinto !== filters.recinto) return false;
    if (filters.estado && String(a.estado).toUpperCase() !== String(filters.estado).toUpperCase()) return false;
    if (mesa && String(a.nroMesa) !== mesa && String(a.codigoMesa) !== mesa && String(a.codigoActa) !== mesa) return false;
    if (fuente) {
      const rowFuente = String(a.fuente || a.origen || '').toUpperCase();
      if (rowFuente !== fuente) return false;
    }
    if (!q) return true;
    return [a.codigoActa, a.codigoMesa, a.nroActa, a.nroMesa, a.recinto, a.municipio, a.provincia, a.departamento, a.estado, a.fuente, a.origen, a.observacionTecnica]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

export function departmentSummary(oficial, rrv) {
  const names = [...new Set([...oficial.map((a) => a.departamento), ...rrv.map((a) => a.departamento)])].filter(Boolean);
  return names.map((departamento) => {
    const of = oficial.filter((a) => a.departamento === departamento);
    const rr = rrv.filter((a) => a.departamento === departamento);
    const ot = totals(of);
    const rt = totals(rr);
    return {
      departamento,
      oficial: ot.totalVotos,
      rrv: rt.totalVotos,
      diff: ot.totalVotos - rt.totalVotos,
      actasOficial: of.length,
      actasRRV: rr.length,
      participacion: ot.habilitados ? (ot.totalVotos * 100) / ot.habilitados : 0,
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export function timelineByHour(data) {
  const byHour = {};
  for (const a of data) {
    const hour = String(a.fechaRecepcion || a.fechaRegistro || '').slice(11, 13) || '00';
    const label = `${hour}:00`;
    byHour[label] = (byHour[label] || 0) + 1;
  }
  return Object.entries(byHour).sort(([a], [b]) => a.localeCompare(b)).map(([hora, actas]) => ({ hora, actas }));
}

export function buildInconsistencias(oficial, rrv) {
  const rrvMap = new Map(rrv.map((a) => [String(a.codigoActa), a]));
  const rows = [];
  for (const o of oficial) {
    const r = rrvMap.get(String(o.codigoActa));
    if (!r) continue;
    for (const f of [...PARTIES.map((p) => p.key), 'votosBlancos', 'votosNulos', 'totalVotos']) {
      const diff = Number(o[f] || 0) - Number(r[f] || 0);
      if (diff !== 0) {
        rows.push({
          codigoActa: o.codigoActa,
          nroMesa: o.nroMesa,
          departamento: o.departamento,
          municipio: o.municipio,
          recinto: o.recinto,
          campo: f,
          rrv: Number(r[f] || 0),
          oficial: Number(o[f] || 0),
          diff,
          origenRRV: r.origen || 'RRV',
          estadoOficial: o.estado,
          observacionTecnica: o.observacionTecnica || r.observacionTecnica || '',
          criticidad: Math.abs(diff) >= 8 ? 'ALTA' : Math.abs(diff) >= 3 ? 'MEDIA' : 'BAJA',
        });
      }
    }
  }
  return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export function validateOfficialForm(form, existing = []) {
  const issues = [];
  const required = ['nroActa', 'codigoMesa', 'nroMesa', 'codigoTerritorial', 'votantesHabilitados', 'departamento', 'provincia', 'municipio', 'recinto', 'registradoPor'];
  for (const key of required) {
    if (form[key] === undefined || form[key] === null || form[key] === '') {
      issues.push({ type: 'ERROR', text: `Campo obligatorio: ${key}` });
    }
  }

  if (form.nroActa && !/^[A-Za-z0-9\-_.]+$/.test(String(form.nroActa))) {
    issues.push({ type: 'ERROR', text: 'nroActa solo debe contener letras, numeros, guion, punto o guion bajo.' });
  }

  const textFields = ['departamento', 'provincia', 'municipio', 'recinto'];
  for (const key of textFields) {
    if (form[key] && /[<>\{\}\[\]$;`]/.test(String(form[key]))) {
      issues.push({ type: 'ERROR', text: `${key} contiene caracteres no permitidos.` });
    }
  }

  const numeric = ['codigoMesa', 'nroMesa', 'codigoTerritorial', 'votantesHabilitados', 'registradoPor', 'p1', 'p2', 'p3', 'p4', 'votosBlancos', 'votosNulos', 'papeletasAnfora', 'papeletasNoUtilizadas'];
  for (const key of numeric) {
    const raw = form[key];
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    const rawText = String(raw);
    if (!/^\d+$/.test(rawText)) issues.push({ type: 'ERROR', text: `${key} solo acepta numeros enteros positivos, sin letras, decimales ni signos.` });
    const n = Number(rawText);
    if (!Number.isSafeInteger(n)) issues.push({ type: 'ERROR', text: `${key} debe ser un entero seguro.` });
    if (n < 0) issues.push({ type: 'ERROR', text: `${key} no puede ser negativo` });
  }
  if (Number(form.nroMesa || 0) <= 0) issues.push({ type: 'ERROR', text: 'nroMesa debe ser mayor a cero.' });
  if (Number(form.votantesHabilitados || 0) <= 0) issues.push({ type: 'ERROR', text: 'votantesHabilitados debe ser mayor a cero.' });
  const sumaPartidos = ['p1', 'p2', 'p3', 'p4'].reduce((acc, k) => acc + Number(form[k] || 0), 0);
  const totalCalculado = sumaPartidos + Number(form.votosBlancos || 0) + Number(form.votosNulos || 0);
  if (sumaPartidos <= 0) issues.push({ type: 'WARNING', text: 'La suma de votos por partidos es cero o muy baja.' });
  if (totalCalculado > Number(form.votantesHabilitados || 0)) {
    issues.push({ type: 'ERROR', text: `El total de votos (${totalCalculado}) supera votantes habilitados (${form.votantesHabilitados || 0}).` });
  }
  if (Number(form.papeletasAnfora || 0) > 0 && totalCalculado !== Number(form.papeletasAnfora || 0)) {
    issues.push({ type: 'WARNING', text: `Total votos (${totalCalculado}) no coincide con papeletas en anfora (${form.papeletasAnfora}).` });
  }
  if (Number(form.papeletasAnfora || 0) + Number(form.papeletasNoUtilizadas || 0) !== Number(form.votantesHabilitados || 0)) {
    issues.push({ type: 'WARNING', text: 'Papeletas en anfora + no utilizadas no coincide con habilitados.' });
  }
  if (String(form.observacionTecnica || '').trim()) {
    issues.push({ type: 'WARNING', text: 'El acta tiene observacion tecnica informativa. No invalida el registro oficial, pero debe mostrarse en auditoria.' });
  }
  const duplicate = existing.some((a) => String(a.nroActa) === String(form.nroActa) || String(a.codigoActa) === String(form.codigoActa));
  if (duplicate) issues.push({ type: 'WARNING', text: 'Existe un acta con el mismo numero. Se debe tratar como idempotencia/conflicto en backend.' });

  if (!issues.length) issues.push({ type: 'OK', text: 'Acta consistente para enviar al computo oficial.' });
  const hasError = issues.some((i) => i.type === 'ERROR');
  const hasWarning = issues.some((i) => i.type === 'WARNING');
  return {
    issues,
    estadoVisual: hasError ? 'RECHAZADA' : hasWarning ? 'OBSERVADA' : 'PROCESADA',
    totalCalculado,
    votosValidosCalculados: sumaPartidos,
    backendPayload: {
      nro_acta: String(form.nroActa || form.codigoActa || ''),
      codigo_territorial: Number(form.codigoTerritorial || 0),
      codigo_recinto: String(form.codigoRecinto || String(form.codigoMesa || form.codigoActa || '').slice(0, 10)),
      codigo_mesa: Number(form.codigoMesa || form.codigoActa || 0),
      nro_mesa: Number(form.nroMesa || 0),
      nro_mesa_desde_acta: Number(form.nroMesa || 0),
      nro_votantes: Number(form.votantesHabilitados || 0),
      papeletas_anfora: Number(form.papeletasAnfora || totalCalculado || 0),
      papeletas_no_utilizadas: Number(form.papeletasNoUtilizadas || 0),
      votos: {
        partido1: Number(form.p1 || 0),
        partido2: Number(form.p2 || 0),
        partido3: Number(form.p3 || 0),
        partido4: Number(form.p4 || 0),
        votos_blancos: Number(form.votosBlancos || 0),
        votos_nulos: Number(form.votosNulos || 0),
        votos_validos: Number(form.votosValidos || sumaPartidos),
        votos_validos_calculados: sumaPartidos,
        total_votos: totalCalculado,
      },
      registrado_por: Number(form.registradoPor || 1),
      transcripcion: [form.observaciones, form.observacionTecnica ? `Nota tecnica: ${form.observacionTecnica}` : ''].filter(Boolean).join(' | '),
      tipo_observacion: [form.observaciones, form.observacionTecnica].filter(Boolean).length ? 'OBSERVACION_REGISTRADA' : 'SIN_OBSERVACION',
      requiere_revision_humana: hasError || hasWarning,
      estado_acta: hasError ? 'RECHAZADA' : hasWarning ? 'OBSERVADA_PENDIENTE_REVISION' : 'VALIDA',
      apertura: { hora: Number(form.aperturaHora || 8), minutos: Number(form.aperturaMinutos || 0) },
      cierre: { hora: Number(form.cierreHora || 16), minutos: Number(form.cierreMinutos || 0) },
      origen: 'FORMULARIO_OFICIAL_FRONTEND',
    },
  };
}

export function exportJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
