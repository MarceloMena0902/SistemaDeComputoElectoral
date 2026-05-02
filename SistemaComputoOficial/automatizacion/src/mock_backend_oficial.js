const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 4000;

app.use(cors({
  origin: "http://localhost:3005",
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "10mb" }));

const actasRegistradas = new Map();

function isEmpty(value) {
  return value === undefined || value === null || value === "";
}

function validateBackendPayload(body) {
  const errors = [];

  if (isEmpty(body.nro_acta)) errors.push("nro_acta es obligatorio");
  if (isEmpty(body.codigo_mesa)) errors.push("codigo_mesa es obligatorio");
  if (isEmpty(body.nro_mesa)) errors.push("nro_mesa es obligatorio");
  if (isEmpty(body.nro_votantes)) errors.push("nro_votantes es obligatorio");
  if (!body.votos) errors.push("votos es obligatorio");

  if (errors.length > 0) return errors;

  if (body.nro_votantes <= 0) {
    errors.push("nro_votantes debe ser mayor a 0");
  }

  if (body.papeletas_anfora < 0) {
    errors.push("papeletas_anfora no puede ser negativo");
  }

  if (body.papeletas_no_utilizadas < 0) {
    errors.push("papeletas_no_utilizadas no puede ser negativo");
  }

  const voteFields = [
    ["partido1", body.votos.partido1],
    ["partido2", body.votos.partido2],
    ["partido3", body.votos.partido3],
    ["partido4", body.votos.partido4],
    ["votos_blancos", body.votos.votos_blancos],
    ["votos_nulos", body.votos.votos_nulos],
    ["votos_validos", body.votos.votos_validos]
  ];

  for (const [field, value] of voteFields) {
    if (value < 0) {
      errors.push(`${field} no puede ser negativo`);
    }
  }

  if (body.votos.votos_validos !== body.votos.votos_validos_calculados) {
    errors.push("votos_validos no coincide con la suma de P1+P2+P3+P4");
  }

  if (body.votos.total_votos !== body.papeletas_anfora) {
    errors.push("total_votos no coincide con papeletas_anfora");
  }

  if (body.papeletas_anfora + body.papeletas_no_utilizadas !== body.nro_votantes) {
    errors.push("papeletas_anfora + papeletas_no_utilizadas no coincide con nro_votantes");
  }

  if (body.votos.total_votos > body.nro_votantes) {
    errors.push("total_votos supera nro_votantes");
  }

  if (body.nro_mesa_desde_acta !== undefined && body.nro_mesa_desde_acta !== body.nro_mesa) {
    errors.push("nro_mesa no coincide con los ultimos digitos de CodigoActa");
  }

  if (!body.apertura || body.apertura.hora < 0 || body.apertura.hora > 23) {
    errors.push("apertura.hora fuera de rango");
  }

  if (!body.apertura || body.apertura.minutos < 0 || body.apertura.minutos > 59) {
    errors.push("apertura.minutos fuera de rango");
  }

  if (!body.cierre || body.cierre.hora < 0 || body.cierre.hora > 23) {
    errors.push("cierre.hora fuera de rango");
  }

  if (!body.cierre || body.cierre.minutos < 0 || body.cierre.minutos > 59) {
    errors.push("cierre.minutos fuera de rango");
  }

  return errors;
}

app.get("/", (req, res) => {
  return res.json({
    service: "Mock Backend Oficial",
    status: "running",
    totalRegistradas: actasRegistradas.size,
    endpoints: {
      listActas: "GET /api/oficial/actas",
      registerActa: "POST /api/oficial/actas",
      resetActas: "DELETE /api/oficial/actas"
    }
  });
});

app.post("/api/oficial/actas", (req, res) => {
  const body = req.body;

  const validationErrors = validateBackendPayload(body);

  if (validationErrors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Acta rechazada por validaciones oficiales",
      errors: validationErrors,
      nro_acta: body.nro_acta || null
    });
  }

  if (actasRegistradas.has(body.nro_acta)) {
    return res.status(409).json({
      success: false,
      message: "Acta duplicada",
      nro_acta: body.nro_acta
    });
  }

  actasRegistradas.set(body.nro_acta, {
    ...body,
    receivedAt: new Date().toISOString()
  });

  return res.status(201).json({
    success: true,
    message: "Acta oficial registrada correctamente",
    nro_acta: body.nro_acta,
    codigo_mesa: body.codigo_mesa,
    tipo_observacion: body.tipo_observacion || "SIN_OBSERVACION",
    estado_acta: body.estado_acta || "VALIDA",
    requiere_revision_humana: Boolean(body.requiere_revision_humana),
    totalRegistradas: actasRegistradas.size
  });
});

app.get("/api/oficial/actas", (req, res) => {
  return res.json({
    total: actasRegistradas.size,
    data: Array.from(actasRegistradas.values())
  });
});

app.delete("/api/oficial/actas", (req, res) => {
  actasRegistradas.clear();

  return res.json({
    success: true,
    message: "Mock backend limpiado correctamente",
    totalRegistradas: actasRegistradas.size
  });
});

function getDepartamentoByCodigoTerritorial(codigoTerritorial) {
  const code = String(codigoTerritorial || "");

  const firstDigit = code.charAt(0);

  const departments = {
    "1": "Chuquisaca",
    "2": "La Paz",
    "3": "Cochabamba",
    "4": "Oruro",
    "5": "Potosí",
    "6": "Tarija",
    "7": "Santa Cruz",
    "8": "Beni",
    "9": "Pando"
  };

  return departments[firstDigit] || "Sin departamento";
}

function buildDashboardSummary() {
  const actas = Array.from(actasRegistradas.values());

  const summary = {
    totalActas: actas.length,
    validas: 0,
    observadas: 0,
    totalVotos: 0,
    votosValidos: 0,
    votosBlancos: 0,
    votosNulos: 0,
    partidos: {
      partido1: 0,
      partido2: 0,
      partido3: 0,
      partido4: 0
    }
  };

  for (const acta of actas) {
    if (acta.estado_acta === "OBSERVADA_PENDIENTE_REVISION" || acta.requiere_revision_humana) {
      summary.observadas++;
    } else {
      summary.validas++;
    }

    summary.partidos.partido1 += Number(acta.votos?.partido1 || 0);
    summary.partidos.partido2 += Number(acta.votos?.partido2 || 0);
    summary.partidos.partido3 += Number(acta.votos?.partido3 || 0);
    summary.partidos.partido4 += Number(acta.votos?.partido4 || 0);

    summary.votosValidos += Number(acta.votos?.votos_validos || 0);
    summary.votosBlancos += Number(acta.votos?.votos_blancos || 0);
    summary.votosNulos += Number(acta.votos?.votos_nulos || 0);
    summary.totalVotos += Number(acta.votos?.total_votos || 0);
  }

  return summary;
}

function buildDepartmentSummary() {
  const actas = Array.from(actasRegistradas.values());
  const departments = new Map();

  for (const acta of actas) {
    const departamento = getDepartamentoByCodigoTerritorial(acta.codigo_territorial);

    if (!departments.has(departamento)) {
      departments.set(departamento, {
        departamento,
        totalActas: 0,
        validas: 0,
        observadas: 0,
        totalVotos: 0
      });
    }

    const item = departments.get(departamento);

    item.totalActas++;
    item.totalVotos += Number(acta.votos?.total_votos || 0);

    if (acta.estado_acta === "OBSERVADA_PENDIENTE_REVISION" || acta.requiere_revision_humana) {
      item.observadas++;
    } else {
      item.validas++;
    }
  }

  return Array.from(departments.values()).sort((a, b) => {
    return b.totalActas - a.totalActas;
  });
}

app.get("/api/oficial/dashboard/resumen", (req, res) => {
  return res.json({
    success: true,
    data: buildDashboardSummary()
  });
});

app.get("/api/oficial/dashboard/departamentos", (req, res) => {
  return res.json({
    success: true,
    data: buildDepartmentSummary()
  });
});

app.listen(PORT, () => {
  console.log(`Mock backend oficial ejecutándose en http://localhost:${PORT}`);
});