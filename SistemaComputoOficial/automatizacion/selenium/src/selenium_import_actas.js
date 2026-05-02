const fs = require("fs");
const path = require("path");
const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const { readOfficialFile } = require("../../src/read_official_file");
const { buildOfficialPayload } = require("../../src/official_csv_adapter");

const config = require("../../config/automation.config.json");

const reportsDir = path.join(__dirname, "..", "reports");
const screenshotsDir = path.join(__dirname, "..", "screenshots");

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const successReportPath = path.join(reportsDir, "selenium_exitosas.jsonl");
const errorReportPath = path.join(reportsDir, "selenium_errores.jsonl");
const observedReportPath = path.join(reportsDir, "selenium_observadas.jsonl");
const duplicateReportPath = path.join(reportsDir, "selenium_duplicadas.jsonl");

function resetReport(filePath) {
  fs.writeFileSync(filePath, "", "utf8");
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

  if (!payload.votos) {
    errors.push("votos es obligatorio");
    return errors;
  }

  const numericFields = [
    ["nro_votantes", payload.nro_votantes],
    ["papeletas_anfora", payload.papeletas_anfora],
    ["papeletas_no_utilizadas", payload.papeletas_no_utilizadas],
    ["partido1", payload.votos.partido1],
    ["partido2", payload.votos.partido2],
    ["partido3", payload.votos.partido3],
    ["partido4", payload.votos.partido4],
    ["votos_blancos", payload.votos.votos_blancos],
    ["votos_nulos", payload.votos.votos_nulos],
    ["votos_validos", payload.votos.votos_validos],
    ["total_votos", payload.votos.total_votos]
  ];

  for (const [field, value] of numericFields) {
    if (Number.isNaN(Number(value))) {
      errors.push(`${field} debe ser numerico`);
    }

    if (Number(value) < 0) {
      errors.push(`${field} no puede ser negativo`);
    }
  }

  if (payload.nro_votantes <= 0) {
    errors.push("nro_votantes debe ser mayor a 0");
  }

  if (payload.votos.total_votos > payload.nro_votantes) {
    errors.push("total_votos supera nro_votantes");
  }

  if (payload.papeletas_anfora > payload.nro_votantes) {
    errors.push("papeletas_anfora supera nro_votantes");
  }

  if (
    payload.papeletas_anfora + payload.papeletas_no_utilizadas !==
    payload.nro_votantes
  ) {
    errors.push("papeletas_anfora + papeletas_no_utilizadas no coincide con nro_votantes");
  }

  if (payload.votos.votos_validos !== payload.votos.votos_validos_calculados) {
    errors.push("votos_validos no coincide con la suma de partidos");
  }

  if (payload.votos.total_votos !== payload.papeletas_anfora) {
    errors.push("total_votos no coincide con papeletas_anfora");
  }

  if (
    payload.nro_mesa_desde_acta !== undefined &&
    payload.nro_mesa_desde_acta !== 0 &&
    payload.nro_mesa !== payload.nro_mesa_desde_acta
  ) {
    errors.push("nro_mesa no coincide con el numero final del CodigoActa");
  }

  if (!payload.apertura) {
    errors.push("apertura es obligatoria");
  } else {
    if (payload.apertura.hora < 0 || payload.apertura.hora > 23) {
      errors.push("apertura.hora fuera de rango");
    }

    if (payload.apertura.minutos < 0 || payload.apertura.minutos > 59) {
      errors.push("apertura.minutos fuera de rango");
    }
  }

  if (!payload.cierre) {
    errors.push("cierre es obligatorio");
  } else {
    if (payload.cierre.hora < 0 || payload.cierre.hora > 23) {
      errors.push("cierre.hora fuera de rango");
    }

    if (payload.cierre.minutos < 0 || payload.cierre.minutos > 59) {
      errors.push("cierre.minutos fuera de rango");
    }
  }

  return errors;
}

async function clearAndTypeIfExists(driver, id, value) {
  const elements = await driver.findElements(By.id(id));

  if (elements.length === 0) {
    return false;
  }

  const element = elements[0];

  await driver.executeScript(
    `
    const el = arguments[0];
    const value = arguments[1];

    el.scrollIntoView({ block: "center", inline: "nearest" });

    if (el.disabled) {
      el.disabled = false;
    }

    if (el.readOnly) {
      el.readOnly = false;
    }

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.textContent = value;
    }
    `,
    element,
    String(value ?? "")
  );

  return true;
}

async function setSelectValueIfExists(driver, id, value) {
  const elements = await driver.findElements(By.id(id));

  if (elements.length === 0) {
    return false;
  }

  const element = elements[0];

  await driver.executeScript(
    "arguments[0].scrollIntoView({ block: 'center', inline: 'nearest' });",
    element
  );

  await element.sendKeys(String(value));

  return true;
}

async function takeScreenshot(driver, filename) {
  const image = await driver.takeScreenshot();
  const screenshotPath = path.join(screenshotsDir, filename);
  fs.writeFileSync(screenshotPath, image, "base64");
  return screenshotPath;
}

async function fillForm(driver, payload) {
  await clearAndTypeIfExists(driver, "nro_acta", payload.nro_acta);
  await clearAndTypeIfExists(driver, "codigo_territorial", payload.codigo_territorial);
  await clearAndTypeIfExists(driver, "codigo_recinto", payload.codigo_recinto);
  await clearAndTypeIfExists(driver, "codigo_mesa", payload.codigo_mesa);
  await clearAndTypeIfExists(driver, "nro_mesa", payload.nro_mesa);
  await clearAndTypeIfExists(driver, "nro_votantes", payload.nro_votantes);
  await clearAndTypeIfExists(driver, "registrado_por", payload.registrado_por);

  await clearAndTypeIfExists(driver, "papeletas_anfora", payload.papeletas_anfora);
  await clearAndTypeIfExists(driver, "papeletas_no_utilizadas", payload.papeletas_no_utilizadas);

  await clearAndTypeIfExists(driver, "partido1", payload.votos.partido1);
  await clearAndTypeIfExists(driver, "partido2", payload.votos.partido2);
  await clearAndTypeIfExists(driver, "partido3", payload.votos.partido3);
  await clearAndTypeIfExists(driver, "partido4", payload.votos.partido4);
  await clearAndTypeIfExists(driver, "votos_blancos", payload.votos.votos_blancos);
  await clearAndTypeIfExists(driver, "votos_nulos", payload.votos.votos_nulos);
  await clearAndTypeIfExists(driver, "votos_validos", payload.votos.votos_validos);
  await clearAndTypeIfExists(driver, "total_votos", payload.votos.total_votos);

  await clearAndTypeIfExists(driver, "apertura_hora", payload.apertura?.hora);
  await clearAndTypeIfExists(driver, "apertura_minutos", payload.apertura?.minutos);
  await clearAndTypeIfExists(driver, "cierre_hora", payload.cierre?.hora);
  await clearAndTypeIfExists(driver, "cierre_minutos", payload.cierre?.minutos);

  await clearAndTypeIfExists(driver, "observaciones", payload.transcripcion);
  await clearAndTypeIfExists(driver, "transcripcion", payload.transcripcion);
  await clearAndTypeIfExists(driver, "tipo_observacion", payload.tipo_observacion);
  await clearAndTypeIfExists(driver, "estado_acta", payload.estado_acta);

  await setSelectValueIfExists(
    driver,
    "requiere_revision_humana",
    payload.requiere_revision_humana ? "true" : "false"
  );

  const button = await driver.findElement(By.id("btn_registrar"));

  await driver.executeScript(
    `
    const btn = arguments[0];
    btn.scrollIntoView({ block: "center", inline: "nearest" });
    btn.click();
    `,
    button
  );
}

async function waitForMessage(driver) {
  const messageElement = await driver.wait(
    until.elementLocated(By.id("message")),
    10000
  );

  await driver.wait(async () => {
    const text = await messageElement.getText();
    return text && text.trim().length > 0;
  }, 10000);

  const className = await messageElement.getAttribute("class");
  const text = await messageElement.getText();

  return {
    className,
    text
  };
}

function sameOfficialRecord(previous, current) {
  return JSON.stringify(previous.payload) === JSON.stringify(current.payload);
}

async function main() {
  resetReport(successReportPath);
  resetReport(errorReportPath);
  resetReport(observedReportPath);
  resetReport(duplicateReportPath);

  const filePath = path.resolve(__dirname, "..", "..", config.csvPath);

  let rows = [];

  try {
    rows = await readOfficialFile(filePath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Filas encontradas en archivo oficial: ${rows.length}`);

  const limit = Number(config.seleniumLimit || rows.length);
  const rowsToProcess = rows.slice(0, limit);

  console.log(`Filas a procesar con Selenium: ${rowsToProcess.length}`);

  const options = new chrome.Options();
  options.addArguments("--start-maximized");

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  let exitosas = 0;
  let fallidas = 0;
  let observadas = 0;
  let duplicadas = 0;

  const actasProcesadas = new Map();
  const startTime = Date.now();

  try {
    await driver.get("http://localhost:3005");
    await driver.wait(until.elementLocated(By.id("official-form")), 10000);

    for (let index = 0; index < rowsToProcess.length; index++) {
      const rowNumber = index + 2;
      const rawRow = rowsToProcess[index];

      try {
        const payload = buildOfficialPayload(
          rawRow,
          rowNumber,
          config.defaultUserId || 1
        );

        if (actasProcesadas.has(payload.nro_acta)) {
          const previous = actasProcesadas.get(payload.nro_acta);
          duplicadas++;
          fallidas++;

          writeJsonLine(duplicateReportPath, {
            rowNumber,
            type: "DUPLICATE_IN_EXCEL",
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

          writeJsonLine(errorReportPath, {
            rowNumber,
            type: "DUPLICATE_ERROR",
            errors: ["CodigoActa duplicado en el Excel"],
            data: rawRow,
            payload
          });

          if (config.stopOnError) break;
          continue;
        }

        actasProcesadas.set(payload.nro_acta, {
          rowNumber,
          payload
        });

        const validationErrors = validatePayload(payload);

        if (payload.tipo_observacion !== "SIN_OBSERVACION") {
          observadas++;

          writeJsonLine(observedReportPath, {
            rowNumber,
            type: "ACTA_CON_OBSERVACION_EN_EXCEL",
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
            rawRow
          });
        }

        if (validationErrors.length > 0) {
          fallidas++;

          writeJsonLine(errorReportPath, {
            rowNumber,
            type: "VALIDATION_ERROR",
            errors: validationErrors,
            data: rawRow,
            payload
          });

          if (config.stopOnError) break;
          continue;
        }

        await fillForm(driver, payload);

        const result = await waitForMessage(driver);

        if (result.className.includes("success")) {
          exitosas++;

          writeJsonLine(successReportPath, {
            rowNumber,
            message: result.text,
            payload
          });
        } else {
          fallidas++;

          const screenshotPath = await takeScreenshot(
            driver,
            `error_fila_${rowNumber}.png`
          );

          writeJsonLine(errorReportPath, {
            rowNumber,
            type: "FORM_ERROR",
            message: result.text,
            screenshotPath,
            data: rawRow,
            payload
          });

          if (config.stopOnError) break;
        }
      } catch (error) {
        fallidas++;

        const screenshotPath = await takeScreenshot(
          driver,
          `error_fila_${rowNumber}.png`
        );

        writeJsonLine(errorReportPath, {
          rowNumber,
          type: "SELENIUM_ERROR",
          message: error.message,
          screenshotPath,
          data: rawRow
        });

        if (config.stopOnError) break;
      }
    }
  } finally {
    await driver.quit();
  }

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("Carga visual Selenium finalizada");
  console.log(`Total procesadas: ${rowsToProcess.length}`);
  console.log(`Exitosas: ${exitosas}`);
  console.log(`Fallidas: ${fallidas}`);
  console.log(`Actas observadas: ${observadas}`);
  console.log(`Actas duplicadas: ${duplicadas}`);
  console.log(`Tiempo total: ${totalTimeSeconds} segundos`);
  console.log(`Log exitosas: ${successReportPath}`);
  console.log(`Log errores: ${errorReportPath}`);
  console.log(`Log observadas: ${observedReportPath}`);
  console.log(`Log duplicadas: ${duplicateReportPath}`);
}

main();