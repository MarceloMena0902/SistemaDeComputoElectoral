const form = document.getElementById("official-form");
const message = document.getElementById("message");

const fields = [
  "partido1",
  "partido2",
  "partido3",
  "partido4",
  "votos_blancos",
  "votos_nulos"
];

function getNumber(id) {
  return Number(document.getElementById(id).value || 0);
}

function updatePreview() {
  const votosValidos =
    getNumber("partido1") +
    getNumber("partido2") +
    getNumber("partido3") +
    getNumber("partido4");

  const totalVotos =
    votosValidos +
    getNumber("votos_blancos") +
    getNumber("votos_nulos");

  document.getElementById("votos_validos_preview").textContent = votosValidos;
  document.getElementById("total_votos_preview").textContent = totalVotos;
}

fields.forEach((id) => {
  document.getElementById(id).addEventListener("input", updatePreview);
});

function showMessage(type, text) {
  message.className = `message ${type}`;
  message.textContent = text;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const votosValidos =
    getNumber("partido1") +
    getNumber("partido2") +
    getNumber("partido3") +
    getNumber("partido4");

  const totalVotos =
    votosValidos +
    getNumber("votos_blancos") +
    getNumber("votos_nulos");

  const nroVotantes = getNumber("nro_votantes");

  if (totalVotos > nroVotantes) {
    showMessage("error", "Error: el total de votos supera el número de votantes habilitados.");
    return;
  }

  const payload = {
    nro_acta: document.getElementById("nro_acta").value,
    codigo_territorial: getNumber("codigo_territorial"),
    codigo_mesa: getNumber("codigo_mesa"),
    nro_mesa: getNumber("nro_mesa"),
    nro_votantes: nroVotantes,
    votos: {
      partido1: getNumber("partido1"),
      partido2: getNumber("partido2"),
      partido3: getNumber("partido3"),
      partido4: getNumber("partido4"),
      votos_blancos: getNumber("votos_blancos"),
      votos_nulos: getNumber("votos_nulos"),
      votos_validos: votosValidos,
      total_votos: totalVotos
    },
    registrado_por: getNumber("registrado_por"),
    origen: "FORMULARIO_OFICIAL_SELENIUM"
  };

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
    document.getElementById("registrado_por").value = "1";
    updatePreview();
  } catch (error) {
    showMessage("error", "No se pudo conectar con el backend oficial.");
  }
});