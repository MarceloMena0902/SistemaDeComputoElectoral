function normalizeKey(key) {
  return String(key || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_");
}

function normalizeRow(row) {
  const normalized = {};

  for (const [key, value] of Object.entries(row)) {
    const cleanKey = normalizeKey(key);
    normalized[cleanKey] = typeof value === "string" ? value.trim() : value;
  }

  return normalized;
}

function pick(row, aliases, defaultValue = "") {
  for (const alias of aliases) {
    const key = normalizeKey(alias);

    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return defaultValue;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return 0;

  const cleanValue = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");

  const numberValue = Number(cleanValue);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function toInteger(value) {
  return Math.trunc(toNumber(value));
}

function normalizeLongCode(value) {
  if (value === undefined || value === null) return "";

  let text = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");

  if (!text) return "";

  if (/^\d+$/.test(text)) {
    return text;
  }

  if (/^\d+\.0+$/.test(text)) {
    return text.split(".")[0];
  }

  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(text)) {
    const numberValue = Number(text);

    if (!Number.isFinite(numberValue)) return "";

    return numberValue.toFixed(0);
  }

  const onlyDigits = text.replace(/\D/g, "");
  return onlyDigits;
}

function cleanObservationText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeObservationText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectObservationType(text) {
  const value = normalizeObservationText(text);

  if (!value) return "SIN_OBSERVACION";

  if (value.includes("inconsistencia aritmetica")) {
    return "INCONSISTENCIA_ARITMETICA";
  }

  if (value.includes("papeletas no autorizadas")) {
    return "PAPELETAS_NO_AUTORIZADAS";
  }

  if (value.includes("fecha incorrecta")) {
    return "FECHA_INCORRECTA";
  }

  if (value.includes("delegado")) {
    return "AUSENCIA_DELEGADOS";
  }

  if (value.includes("apertura") || value.includes("cierre")) {
    return "FALTA_DATOS_APERTURA_CIERRE";
  }

  if (
    value.includes("transcripcion") ||
    value.includes("tachadura") ||
    value.includes("enmienda") ||
    value.includes("corre y vale")
  ) {
    return "ERROR_TRANSCRIPCION";
  }

  if (value.includes("firma") || value.includes("huella")) {
    return "FALTA_FIRMA_HUELLA";
  }

  if (value.includes("90")) return "DOCUMENTO_GIRADO_90";
  if (value.includes("180")) return "DOCUMENTO_GIRADO_180";
  if (value.includes("270")) return "DOCUMENTO_GIRADO_270";

  if (value.includes("comprimido")) return "DOCUMENTO_COMPRIMIDO";
  if (value.includes("anulado")) return "ACTA_ANULADA";

  if (value.includes("formulario") || value.includes("documentos no aprobados") || value.includes("formatos no aprobados")) {
    return "FORMULARIO_NO_OFICIAL";
  }

  if (value.includes("borrado")) return "DATOS_BORRADOS";
  if (value.includes("duplicado")) return "ACTA_DUPLICADA";

  if (
    value.includes("clonado") ||
    value.includes("conado") ||
    value.includes("clon")
  ) {
    return "ACTA_CLONADA";
  }

  if (value.includes("mesa") && value.includes("no existe")) {
    return "MESA_NO_EXISTE";
  }

  if (value.includes("mesa") && value.includes("lugar distinto")) {
    return "MESA_EN_LUGAR_DISTINTO";
  }

  if (value.includes("cambiado") || value.includes("cambio")) {
    return "DATOS_CAMBIADOS";
  }

  return "OBSERVACION_GENERAL";
}

function isCriticalObservation(tipoObservacion) {
  const criticalTypes = new Set([
    "ACTA_ANULADA",
    "FORMULARIO_NO_OFICIAL",
    "PAPELETAS_NO_AUTORIZADAS",
    "DATOS_BORRADOS",
    "ACTA_DUPLICADA",
    "ACTA_CLONADA",
    "MESA_NO_EXISTE",
    "MESA_EN_LUGAR_DISTINTO",
    "DATOS_CAMBIADOS",
    "FALTA_FIRMA_HUELLA",
    "FECHA_INCORRECTA",
    "ERROR_TRANSCRIPCION",
    "AUSENCIA_DELEGADOS",
    "FALTA_DATOS_APERTURA_CIERRE",
    "INCONSISTENCIA_ARITMETICA"
  ]);

  return criticalTypes.has(tipoObservacion);
}

function buildOfficialPayload(rawRow, rowNumber = 1, defaultUserId = 1) {
  const row = normalizeRow(rawRow);

  const codigoActa = normalizeLongCode(pick(row, [
    "CodigoActa",
    "codigoacta",
    "codigo_acta",
    "nro_acta",
    "NroActa",
    "acta"
  ]));

  const nroMesa = toInteger(pick(row, [
    "NroMesa",
    "nromesa",
    "nro_mesa",
    "numero_mesa",
    "mesa"
  ]));

  const votantesHabilitados = toInteger(pick(row, [
    "VotantesHabilitados",
    "votanteshabilitados",
    "votantes_habilitados",
    "nro_votantes",
    "NroVotantes",
    "habilitados"
  ]));

  const papeletasAnfora = toInteger(pick(row, [
    "PapeletasAnfora",
    "papeletasanfora",
    "papeletas_anfora"
  ]));

  const papeletasNoUtilizadas = toInteger(pick(row, [
    "PapeltasNoUtilizadas",
    "PapeletasNoUtilizadas",
    "papeltasnoutilizadas",
    "papeletas_no_utilizadas"
  ]));

  const partido1 = toInteger(pick(row, ["P1", "p1", "partido1"]));
  const partido2 = toInteger(pick(row, ["P2", "p2", "partido2"]));
  const partido3 = toInteger(pick(row, ["P3", "p3", "partido3"]));
  const partido4 = toInteger(pick(row, ["P4", "p4", "partido4"]));

  const votosValidosExcel = toInteger(pick(row, [
    "VotosValidos",
    "votosvalidos",
    "votos_validos"
  ]));

  const votosBlancos = toInteger(pick(row, [
    "VotosBlancos",
    "votosblancos",
    "votos_blancos"
  ]));

  const votosNulos = toInteger(pick(row, [
    "VotosNulos",
    "votosnulos",
    "votos_nulos"
  ]));

  const observacionesPrincipal = cleanObservationText(pick(row, [
    "Observaciones",
    "observaciones",
    "observacion",
    "transcripciones",
    "transcripcion"
  ], ""));

  const observacionesExtra = cleanObservationText(pick(row, [
    "__EMPTY",
    "Unnamed: 13",
    "unnamed_13",
    "empty"
  ], ""));

  const observaciones = [observacionesPrincipal, observacionesExtra]
    .filter(Boolean)
    .join(" | ");

  const aperturaHora = toInteger(pick(row, [
    "AperturaHora",
    "aperturahora",
    "apertura_hora"
  ]));

  const aperturaMinutos = toInteger(pick(row, [
    "AperturaMinutos",
    "aperturaminutos",
    "apertura_minutos"
  ]));

  const cierreHora = toInteger(pick(row, [
    "CierreHora",
    "cierrehora",
    "cierre_hora"
  ]));

  const cierreMinutos = toInteger(pick(row, [
    "CierreMinutos",
    "cierreminutos",
    "cierre_minutos"
  ]));

  const votosValidosCalculados = partido1 + partido2 + partido3 + partido4;
  const votosValidos = votosValidosExcel;
  const totalVotos = votosValidos + votosBlancos + votosNulos;

  const codigoTerritorial = codigoActa.length >= 5 ? toInteger(codigoActa.substring(0, 5)) : 0;
  const codigoRecinto = codigoActa.length >= 10 ? codigoActa.substring(0, 10) : "";
  const nroMesaDesdeActa = codigoActa.length >= 3 ? toInteger(codigoActa.slice(-3)) : 0;

  const tipoObservacion = detectObservationType(observaciones);

  const tieneObservacion = tipoObservacion !== "SIN_OBSERVACION";

  const requiereRevisionHumana = tieneObservacion || isCriticalObservation(tipoObservacion);

  const estadoActa = requiereRevisionHumana
    ? "OBSERVADA_PENDIENTE_REVISION"
    : "VALIDA";

  return {
    row_number: rowNumber,
    nro_acta: codigoActa,
    codigo_territorial: codigoTerritorial,
    codigo_recinto: codigoRecinto,
    codigo_mesa: toInteger(codigoActa),
    nro_mesa: nroMesa,
    nro_mesa_desde_acta: nroMesaDesdeActa,
    nro_votantes: votantesHabilitados,

    papeletas_anfora: papeletasAnfora,
    papeletas_no_utilizadas: papeletasNoUtilizadas,

    votos: {
      partido1,
      partido2,
      partido3,
      partido4,
      votos_blancos: votosBlancos,
      votos_nulos: votosNulos,
      votos_validos: votosValidos,
      votos_validos_calculados: votosValidosCalculados,
      total_votos: totalVotos
    },

    registrado_por: defaultUserId,

    transcripcion: observaciones,
    tipo_observacion: tipoObservacion,
    requiere_revision_humana: requiereRevisionHumana,
    estado_acta: estadoActa,

    apertura: {
      hora: aperturaHora,
      minutos: aperturaMinutos
    },

    cierre: {
      hora: cierreHora,
      minutos: cierreMinutos
    },

    origen: "EXCEL_OFICIAL_AUTOMATIZADO"
  };
}

module.exports = {
  buildOfficialPayload,
  normalizeRow,
  normalizeKey,
  normalizeLongCode,
  detectObservationType,
  isCriticalObservation
};