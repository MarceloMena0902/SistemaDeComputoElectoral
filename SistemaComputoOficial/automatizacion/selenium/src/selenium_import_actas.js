const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Builder, By, until } = require("selenium-webdriver");

const configPath = path.join(__dirname, "..", "..", "config", "automation.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const csvPath = path.resolve(__dirname, "..", "..", config.csvPath);
const resultLogPath = path.resolve(__dirname, "..", "reports", "resultado_selenium.jsonl");
const errorLogPath = path.resolve(__dirname, "..", "reports", "errores_selenium.jsonl");

const FORM_URL = "http://localhost:3005";

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function appendJsonLine(filePath, data) {
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
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

function buildRow(row) {
  return {
    nro_acta: row.nro_acta,
    codigo_territorial: String(row.codigo_territorial || row.CodigoTerritorial || ""),
    codigo_mesa: String(row.codigo_mesa || row.CodigoMesa || ""),
    nro_mesa: String(row.nro_mesa || row.Mesa || ""),
    nro_votantes: String(row.nro_votantes || row.NroVotantes || ""),
    partido1: String(row.partido1 || 0),
    partido2: String(row.partido2 || 0),
    partido3: String(row.partido3 || 0),
    partido4: String(row.partido4 || 0),
    votos_blancos: String(row.votos_blancos || 0),
    votos_nulos: String(row.votos_nulos || 0),
    registrado_por: String(row.registrado_por || config.defaultUserId || 1)
  };
}

function validateBeforeForm(data) {
  const errors = [];

  const p1 = toNumber(data.partido1);
  const p2 = toNumber(data.partido2);
  const p3 = toNumber(data.partido3);
  const p4 = toNumber(data.partido4);
  const blancos = toNumber(data.votos_blancos);
  const nulos = toNumber(data.votos_nulos);
  const nroVotantes = toNumber(data.nro_votantes);

  const votosValidos = p1 + p2 + p3 + p4;
  const totalVotos = votosValidos + blancos + nulos;

  if (!data.nro_acta) errors.push("nro_acta vacío");
  if (!data.codigo_mesa) errors.push("codigo_mesa vacío");
  if (!data.codigo_territorial) errors.push("codigo_territorial vacío");
  if (!data.nro_mesa) errors.push("nro_mesa vacío");

  if (nroVotantes < 0) errors.push("nro_votantes inválido");
  if (p1 < 0) errors.push("partido1 negativo");
  if (p2 < 0) errors.push("partido2 negativo");
  if (p3 < 0) errors.push("partido3 negativo");
  if (p4 < 0) errors.push("partido4 negativo");
  if (blancos < 0) errors.push("votos_blancos negativo");
  if (nulos < 0) errors.push("votos_nulos negativo");
  if (totalVotos > nroVotantes) errors.push("total_votos supera nro_votantes");

  return errors;
}

async function clearAndType(driver, id, value) {
  const input = await driver.findElement(By.id(id));
  await input.clear();
  await input.sendKeys(value);
}

async function fillForm(driver, data) {
  await clearAndType(driver, "nro_acta", data.nro_acta);
  await clearAndType(driver, "codigo_territorial", data.codigo_territorial);
  await clearAndType(driver, "codigo_mesa", data.codigo_mesa);
  await clearAndType(driver, "nro_mesa", data.nro_mesa);
  await clearAndType(driver, "nro_votantes", data.nro_votantes);
  await clearAndType(driver, "registrado_por", data.registrado_por);

  await clearAndType(driver, "partido1", data.partido1);
  await clearAndType(driver, "partido2", data.partido2);
  await clearAndType(driver, "partido3", data.partido3);
  await clearAndType(driver, "partido4", data.partido4);
  await clearAndType(driver, "votos_blancos", data.votos_blancos);
  await clearAndType(driver, "votos_nulos", data.votos_nulos);

  await driver.findElement(By.id("btn_registrar")).click();
}

async function waitForResult(driver) {
  const message = await driver.wait(until.elementLocated(By.id("message")), 5000);
  await driver.wait(async () => {
    const text = await message.getText();
    return text && text.trim().length > 0;
  }, 5000);

  const text = await message.getText();
  const className = await message.getAttribute("class");

  return {
    success: className.includes("success"),
    message: text
  };
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error(`No existe el CSV: ${csvPath}`);
    process.exit(1);
  }

  fs.writeFileSync(resultLogPath, "", "utf8");
  fs.writeFileSync(errorLogPath, "", "utf8");

  const rows = await readCsv();

  console.log(`Filas encontradas para Selenium: ${rows.length}`);

  const driver = await new Builder().forBrowser("chrome").build();

  let total = 0;
  let success = 0;
  let failed = 0;

  const startedAt = Date.now();

  try {
    await driver.get(FORM_URL);

    for (const row of rows) {
      total++;

      const data = buildRow(row);
      const validationErrors = validateBeforeForm(data);

      if (validationErrors.length > 0) {
        failed++;

        appendJsonLine(errorLogPath, {
          rowNumber: total,
          type: "VALIDATION_ERROR",
          errors: validationErrors,
          data
        });

        continue;
      }

      try {
        await fillForm(driver, data);
        const result = await waitForResult(driver);

        if (result.success) {
          success++;

          appendJsonLine(resultLogPath, {
            rowNumber: total,
            nro_acta: data.nro_acta,
            message: result.message
          });
        } else {
          failed++;

          appendJsonLine(errorLogPath, {
            rowNumber: total,
            type: "FORM_ERROR",
            nro_acta: data.nro_acta,
            message: result.message
          });
        }
      } catch (error) {
        failed++;

        appendJsonLine(errorLogPath, {
          rowNumber: total,
          type: "SELENIUM_ERROR",
          nro_acta: data.nro_acta,
          message: error.message
        });

        await driver.takeScreenshot().then((image) => {
          const screenshotPath = path.resolve(
            __dirname,
            "..",
            "screenshots",
            `error_row_${total}.png`
          );
          fs.writeFileSync(screenshotPath, image, "base64");
        });
      }
    }
  } finally {
    const finishedAt = Date.now();
    const elapsedSeconds = ((finishedAt - startedAt) / 1000).toFixed(2);

    console.log("Carga visual Selenium finalizada");
    console.log(`Total procesadas: ${total}`);
    console.log(`Exitosas: ${success}`);
    console.log(`Fallidas: ${failed}`);
    console.log(`Tiempo total: ${elapsedSeconds} segundos`);

    await driver.quit();
  }
}

main();