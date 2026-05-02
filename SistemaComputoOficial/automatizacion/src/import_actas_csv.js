const fs = require("fs");
const path = require("path");
const { readOfficialFile } = require("./read_official_file");
const { buildOfficialPayload } = require("./official_csv_adapter");

const config = require("../config/automation.config.json");

const logsDir = path.join(__dirname, "..", "logs");
const successLogPath = path.join(logsDir, "carga_exitosa.jsonl");
const errorLogPath = path.join(logsDir, "carga_errores.jsonl");
const observedLogPath = path.join(logsDir, "actas_observadas.jsonl");
const duplicatedLogPath = path.join(logsDir, "actas_duplicadas.jsonl");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function writeJsonLine(filePath, data) {
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function isEmpty(value) {
  return value === undefined || value === null || value === "";
}

function validatePayload(payload) {
  const errors = [];

  if (isEmpty(payload.nro_acta)) errors.push("nro_acta es obligatorio");
  if (isEmpty(payload.codigo_mesa)) errors.push("codigo_mesa es obligatorio");
  if (isEmpty(payload.nro_mesa)) errors.push("nro_mesa es obligatorio");
  if (isEmpty(payload.nro_votantes)) errors.push("nro_votantes es obligatorio");

  if (payload.nro_votantes <= 0) {
    errors.push("nro_votantes debe ser mayor a 0");
  }

  if (payload.papeletas_anfora < 0) {
    errors.push("papeletas_anfora no puede ser negativo");
  }

  if (payload.papeletas_no_utilizadas < 0) {
    errors.push("papeletas_no_utilizadas no puede ser negativo");
  }

  const voteFields = [
    ["partido1", payload.votos.partido1],
    ["partido2", payload.votos.partido2],
    ["partido3", payload.votos.partido3],
    ["partido4", payload.votos.partido4],
    ["votos_blancos", payload.votos.votos_blancos],
    ["votos_nulos", payload.votos.votos_nulos],
    ["votos_validos", payload.votos.votos_validos]
  ];

  for (const [field, value] of voteFields) {
    if (value < 0) {
      errors.push(`${field} no puede ser negativo`);
    }
  }

  if (payload.votos.votos_validos !== payload.votos.votos_validos_calculados) {
    errors.push("votos_validos no coincide con la suma de P1+P2+P3+P4");
  }

  if (payload.votos.total_votos !== payload.papeletas_anfora) {
    errors.push("total_votos no coincide con papeletas_anfora");
  }

  if (payload.papeletas_anfora + payload.papeletas_no_utilizadas !== payload.nro_votantes) {
    errors.push("papeletas_anfora + papeletas_no_utilizadas no coincide con nro_votantes");
  }

  if (payload.votos.total_votos > payload.nro_votantes) {
    errors.push("total_votos supera nro_votantes");
  }

  if (payload.apertura.hora < 0 || payload.apertura.hora > 23) {
    errors.push("apertura.hora fuera de rango");
  }

  if (payload.apertura.minutos < 0 || payload.apertura.minutos > 59) {
    errors.push("apertura.minutos fuera de rango");
  }

  if (payload.cierre.hora < 0 || payload.cierre.hora > 23) {
    errors.push("cierre.hora fuera de rango");
  }

  if (payload.cierre.minutos < 0 || payload.cierre.minutos > 59) {
    errors.push("cierre.minutos fuera de rango");
  }

  return errors;
}

function sameOfficialRecord(previous, current) {
  return JSON.stringify(previous.payload) === JSON.stringify(current.payload);
}

async function sendPayload(payload) {
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

async function delay(ms) {
  if (!ms || ms <= 0) return;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const filePath = path.resolve(__dirname, "..", config.csvPath);

  console.log(`Leyendo archivo oficial: ${filePath}`);

  let rows = [];

  try {
    rows = await readOfficialFile(filePath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Filas encontradas: ${rows.length}`);

  let exitosas = 0;
  let fallidas = 0;
  let observadas = 0;
  let duplicadas = 0;

  const actasVistas = new Map();

  for (let index = 0; index < rows.length; index++) {
    const rowNumber = index + 2;
    const rawRow = rows[index];

    try {
      const payload = buildOfficialPayload(
        rawRow,
        rowNumber,
        config.defaultUserId || 1
      );

      const duplicateKey = payload.nro_acta;

      if (actasVistas.has(duplicateKey)) {
        const previous = actasVistas.get(duplicateKey);
        duplicadas++;
        fallidas++;

        writeJsonLine(duplicatedLogPath, {
          type: "ACTA_DUPLICADA_EN_EXCEL",
          nro_acta: payload.nro_acta,
          codigo_mesa: payload.codigo_mesa,
          nro_mesa: payload.nro_mesa,
          previous: {
            rowNumber: previous.rowNumber,
            payload: previous.payload
          },
          current: {
            rowNumber,
            payload
          },
          sameContent: sameOfficialRecord(previous, { rowNumber, payload }),
          message: "Se detecto mas de una fila con el mismo CodigoActa. No se envia automaticamente al computo oficial."
        });

        writeJsonLine(errorLogPath, {
          rowNumber,
          type: "DUPLICATE_ERROR",
          errors: ["CodigoActa duplicado en el Excel"],
          data: rawRow,
          payload
        });

        if (config.stopOnError) break;
        continue;
      }

      actasVistas.set(duplicateKey, {
        rowNumber,
        payload
      });

      const validationErrors = validatePayload(payload);

      if (payload.tipo_observacion !== "SIN_OBSERVACION") {
        observadas++;

        writeJsonLine(observedLogPath, {
          rowNumber,
          nro_acta: payload.nro_acta,
          codigo_territorial: payload.codigo_territorial,
          codigo_recinto: payload.codigo_recinto,
          codigo_mesa: payload.codigo_mesa,
          nro_mesa: payload.nro_mesa,
          nro_votantes: payload.nro_votantes,
          papeletas_anfora: payload.papeletas_anfora,
          papeletas_no_utilizadas: payload.papeletas_no_utilizadas,
          votos: payload.votos,
          transcripcion: payload.transcripcion,
          tipo_observacion: payload.tipo_observacion,
          estado_acta: payload.estado_acta,
          requiere_revision_humana: payload.requiere_revision_humana,
          rawRow,
          type: "ACTA_CON_OBSERVACION_EN_EXCEL"
        });
      }

      if (validationErrors.length > 0) {
        fallidas++;

        writeJsonLine(errorLogPath, {
          rowNumber,
          type: "VALIDATION_ERROR",
          errors: validationErrors,
          data: rawRow,
          payload
        });

        if (config.stopOnError) break;
        continue;
      }

      const result = await sendPayload(payload);

      if (!result.ok) {
        fallidas++;

        writeJsonLine(errorLogPath, {
          rowNumber,
          type: "API_ERROR",
          status: result.status,
          response: result.data,
          data: rawRow,
          payload
        });

        if (config.stopOnError) break;
        continue;
      }

      exitosas++;

      writeJsonLine(successLogPath, {
        rowNumber,
        status: result.status,
        response: result.data,
        payload
      });

      await delay(config.batchDelayMs);
    } catch (error) {
      fallidas++;

      writeJsonLine(errorLogPath, {
        rowNumber,
        type: "UNEXPECTED_ERROR",
        message: error.message,
        data: rawRow
      });

      if (config.stopOnError) break;
    }
  }

  console.log("Carga finalizada");
  console.log(`Total procesadas: ${rows.length}`);
  console.log(`Exitosas: ${exitosas}`);
  console.log(`Fallidas: ${fallidas}`);
  console.log(`Actas observadas: ${observadas}`);
  console.log(`Actas duplicadas: ${duplicadas}`);
  console.log(`Log exitosas: ${successLogPath}`);
  console.log(`Log errores: ${errorLogPath}`);
  console.log(`Log observadas: ${observedLogPath}`);
  console.log(`Log duplicadas: ${duplicatedLogPath}`);
}

main();