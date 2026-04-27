const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const configPath = path.join(__dirname, "..", "config", "automation.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const csvPath = path.resolve(__dirname, "..", config.csvPath);
const successLogPath = path.resolve(__dirname, "..", "logs", "carga_exitosa.jsonl");
const errorLogPath = path.resolve(__dirname, "..", "logs", "carga_errores.jsonl");

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function buildPayload(row) {
  const partido1 = toNumber(row.partido1);
  const partido2 = toNumber(row.partido2);
  const partido3 = toNumber(row.partido3);
  const partido4 = toNumber(row.partido4);
  const votosBlancos = toNumber(row.votos_blancos);
  const votosNulos = toNumber(row.votos_nulos);
  const nroVotantes = toNumber(row.nro_votantes || row.NroVotantes);

  const votosValidos = partido1 + partido2 + partido3 + partido4;
  const totalVotos = votosValidos + votosBlancos + votosNulos;

  return {
    nro_acta: row.nro_acta,
    codigo_territorial: toNumber(row.codigo_territorial || row.CodigoTerritorial),
    codigo_mesa: toNumber(row.codigo_mesa || row.CodigoMesa),
    nro_mesa: toNumber(row.nro_mesa || row.Mesa),
    nro_votantes: nroVotantes,
    votos: {
      partido1,
      partido2,
      partido3,
      partido4,
      votos_blancos: votosBlancos,
      votos_nulos: votosNulos,
      votos_validos: votosValidos,
      total_votos: totalVotos
    },
    registrado_por: toNumber(row.registrado_por || config.defaultUserId),
    origen: "CARGA_MASIVA_AUTOMATIZADA"
  };
}

function validatePayload(payload) {
  const errors = [];

  if (!payload.nro_acta) errors.push("nro_acta vacío");
  if (!payload.codigo_mesa) errors.push("codigo_mesa vacío");
  if (!payload.codigo_territorial) errors.push("codigo_territorial vacío");
  if (!payload.nro_mesa) errors.push("nro_mesa vacío");

  if (payload.nro_votantes < 0) errors.push("nro_votantes inválido");

  for (const [field, value] of Object.entries(payload.votos)) {
    if (value < 0) {
      errors.push(`${field} no puede ser negativo`);
    }
  }

  const sumaPartidos =
    payload.votos.partido1 +
    payload.votos.partido2 +
    payload.votos.partido3 +
    payload.votos.partido4;

  if (payload.votos.votos_validos !== sumaPartidos) {
    errors.push("Inconsistencia aritmética en votos_validos");
  }

  const totalCalculado =
    payload.votos.votos_validos +
    payload.votos.votos_blancos +
    payload.votos.votos_nulos;

  if (payload.votos.total_votos !== totalCalculado) {
    errors.push("Inconsistencia aritmética en total_votos");
  }

  if (payload.votos.total_votos > payload.nro_votantes) {
    errors.push("total_votos supera nro_votantes");
  }

  return errors;
}

function appendJsonLine(filePath, data) {
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToBackend(payload) {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

async function processRows(rows) {
  let total = 0;
  let success = 0;
  let failed = 0;

  for (const row of rows) {
    total++;

    const payload = buildPayload(row);
    const validationErrors = validatePayload(payload);

    if (validationErrors.length > 0) {
      failed++;

      appendJsonLine(errorLogPath, {
        type: "VALIDATION_ERROR",
        rowNumber: total,
        errors: validationErrors,
        payload
      });

      if (config.stopOnError) break;
      continue;
    }

    try {
      const result = await sendToBackend(payload);

      if (result.ok) {
        success++;

        appendJsonLine(successLogPath, {
          rowNumber: total,
          status: result.status,
          response: result.data,
          payload
        });
      } else {
        failed++;

        appendJsonLine(errorLogPath, {
          type: "HTTP_ERROR",
          rowNumber: total,
          status: result.status,
          response: result.data,
          payload
        });

        if (config.stopOnError) break;
      }
    } catch (error) {
      failed++;

      appendJsonLine(errorLogPath, {
        type: "CONNECTION_ERROR",
        rowNumber: total,
        message: error.message,
        payload
      });

      if (config.stopOnError) break;
    }

    if (config.batchDelayMs > 0) {
      await delay(config.batchDelayMs);
    }
  }

  console.log("Carga finalizada");
  console.log(`Total procesadas: ${total}`);
  console.log(`Exitosas: ${success}`);
  console.log(`Fallidas: ${failed}`);
}

function readCsv() {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error(`No existe el archivo CSV: ${csvPath}`);
    process.exit(1);
  }

  fs.writeFileSync(successLogPath, "", "utf8");
  fs.writeFileSync(errorLogPath, "", "utf8");

  console.log(`Leyendo CSV: ${csvPath}`);
  const rows = await readCsv();

  console.log(`Filas encontradas: ${rows.length}`);
  await processRows(rows);
}

main();