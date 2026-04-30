const form = document.getElementById("official-form");
const message = document.getElementById("message");

const voteFields = [
  "partido1",
  "partido2",
  "partido3",
  "partido4",
  "votos_blancos",
  "votos_nulos",
  "votos_validos",
  "total_votos",
  "nro_votantes",
  "papeletas_anfora",
  "papeletas_no_utilizadas"
];

function getNumber(id) {
  const element = document.getElementById(id);
  return Number(element?.value || 0);
}

function getText(id) {
  const element = document.getElementById(id);
  return String(element?.value || "").trim();
}

function setValue(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.value = value;
  }
}

function calculateVotosValidos() {
  return (
    getNumber("partido1") +
    getNumber("partido2") +
    getNumber("partido3") +
    getNumber("partido4")
  );
}

function calculateTotalVotos() {
  return (
    calculateVotosValidos() +
    getNumber("votos_blancos") +
    getNumber("votos_nulos")
  );
}

function updatePreview() {
  const votosValidosCalculados = calculateVotosValidos();
  const totalVotosCalculado = calculateTotalVotos();
  const controlPapeletas =
    getNumber("papeletas_anfora") + getNumber("papeletas_no_utilizadas");

  document.getElementById("votos_validos_preview").textContent = votosValidosCalculados;
  document.getElementById("total_votos_preview").textContent = totalVotosCalculado;
  document.getElementById("control_papeletas_preview").textContent = controlPapeletas;
}

voteFields.forEach((id) => {
  const element = document.getElementById(id);

  if (element) {
    element.addEventListener("input", updatePreview);
  }
});

function showMessage(type, text) {
  message.className = `message ${type}`;
  message.textContent = text;
}

function validateOfficialPayload(payload) {
  const errors = [];

  if (!payload.nro_acta) errors.push("El número de acta es obligatorio.");
  if (!payload.codigo_territorial) errors.push("El código territorial es obligatorio.");
  if (!payload.codigo_mesa) errors.push("El código de mesa es obligatorio.");
  if (!payload.nro_mesa) errors.push("El número de mesa es obligatorio.");
  if (!payload.nro_votantes) errors.push("El número de votantes habilitados es obligatorio.");

  const votos = payload.votos;

  const numericFields = [
    ["Votantes habilitados", payload.nro_votantes],
    ["Papeletas en ánfora", payload.papeletas_anfora],
    ["Papeletas no utilizadas", payload.papeletas_no_utilizadas],
    ["Partido 1", votos.partido1],
    ["Partido 2", votos.partido2],
    ["Partido 3", votos.partido3],
    ["Partido 4", votos.partido4],
    ["Votos blancos", votos.votos_blancos],
    ["Votos nulos", votos.votos_nulos],
    ["Votos válidos", votos.votos_validos],
    ["Total votos", votos.total_votos]
  ];

  for (const [label, value] of numericFields) {
    if (Number.isNaN(Number(value))) {
      errors.push(`${label} debe ser numérico.`);
    }

    if (Number(value) < 0) {
      errors.push(`${label} no puede ser negativo.`);
    }
  }

  if (votos.total_votos > payload.nro_votantes) {
    errors.push("El total de votos supera el número de votantes habilitados.");
  }

  if (payload.papeletas_anfora > payload.nro_votantes) {
    errors.push("Las papeletas en ánfora superan el número de votantes habilitados.");
  }

  if (payload.papeletas_anfora + payload.papeletas_no_utilizadas !== payload.nro_votantes) {
    errors.push("Papeletas en ánfora + papeletas no utilizadas no coincide con votantes habilitados.");
  }

  if (votos.votos_validos !== votos.votos_validos_calculados) {
    errors.push("Los votos válidos no coinciden con la suma de P1 + P2 + P3 + P4.");
  }

  if (votos.total_votos !== payload.papeletas_anfora) {
    errors.push("El total de votos no coincide con las papeletas en ánfora.");
  }

  if (payload.apertura.hora < 0 || payload.apertura.hora > 23) {
    errors.push("La hora de apertura está fuera de rango.");
  }

  if (payload.apertura.minutos < 0 || payload.apertura.minutos > 59) {
    errors.push("Los minutos de apertura están fuera de rango.");
  }

  if (payload.cierre.hora < 0 || payload.cierre.hora > 23) {
    errors.push("La hora de cierre está fuera de rango.");
  }

  if (payload.cierre.minutos < 0 || payload.cierre.minutos > 59) {
    errors.push("Los minutos de cierre están fuera de rango.");
  }

  return errors;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const votosValidosCalculados = calculateVotosValidos();
  const totalVotosCalculado = calculateTotalVotos();

  const observaciones = getText("observaciones") || getText("transcripcion");

  const payload = {
    nro_acta: getText("nro_acta"),
    codigo_territorial: getNumber("codigo_territorial"),
    codigo_recinto: getText("codigo_recinto"),
    codigo_mesa: getNumber("codigo_mesa"),
    nro_mesa: getNumber("nro_mesa"),
    nro_votantes: getNumber("nro_votantes"),
    papeletas_anfora: getNumber("papeletas_anfora"),
    papeletas_no_utilizadas: getNumber("papeletas_no_utilizadas"),

    votos: {
      partido1: getNumber("partido1"),
      partido2: getNumber("partido2"),
      partido3: getNumber("partido3"),
      partido4: getNumber("partido4"),
      votos_blancos: getNumber("votos_blancos"),
      votos_nulos: getNumber("votos_nulos"),
      votos_validos: getNumber("votos_validos"),
      votos_validos_calculados: votosValidosCalculados,
      total_votos: getNumber("total_votos")
    },

    registrado_por: getNumber("registrado_por"),

    transcripcion: observaciones,
    tipo_observacion: getText("tipo_observacion") || "SIN_OBSERVACION",
    estado_acta: getText("estado_acta") || "VALIDA",
    requiere_revision_humana: getText("requiere_revision_humana") === "true",

    apertura: {
      hora: getNumber("apertura_hora"),
      minutos: getNumber("apertura_minutos")
    },

    cierre: {
      hora: getNumber("cierre_hora"),
      minutos: getNumber("cierre_minutos")
    },

    origen: "FORMULARIO_OFICIAL_SELENIUM"
  };

  if (!payload.votos.votos_validos) {
    payload.votos.votos_validos = votosValidosCalculados;
  }

  if (!payload.votos.total_votos) {
    payload.votos.total_votos = totalVotosCalculado;
  }

  const validationErrors = validateOfficialPayload(payload);

  if (validationErrors.length > 0) {
    showMessage("error", `Acta rechazada por validaciones oficiales: ${validationErrors.join(" | ")}`);
    return;
  }

  try {
    const response = await fetch("http://localhost:4000/api/oficial/actas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage("error", data.message || "No se pudo registrar el acta.");
      return;
    }

    showMessage("success", `Acta registrada correctamente: ${data.nro_acta}`);
    form.reset();

    setValue("registrado_por", "1");
    setValue("tipo_observacion", "SIN_OBSERVACION");
    setValue("estado_acta", "VALIDA");
    setValue("requiere_revision_humana", "false");

    updatePreview();
  } catch (error) {
    showMessage("error", "No se pudo conectar con el backend oficial.");
  }
});

updatePreview();