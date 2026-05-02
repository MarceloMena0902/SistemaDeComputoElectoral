const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = 3005;

const automationRoot = path.resolve(__dirname, "..", "..");

let seleniumRunning = false;
let importRunning = false;

let lastSeleniumResult = null;
let lastImportResult = null;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

app.get("/api/automation/status", (req, res) => {
  return res.json({
    success: true,
    seleniumRunning,
    importRunning,
    lastSeleniumResult,
    lastImportResult
  });
});

function runNodeScript(scriptPath, processName, onStart, onFinish) {
  const child = spawn("node", [scriptPath], {
    cwd: automationRoot,
    shell: true
  });

  let output = "";
  let errorOutput = "";

  child.stdout.on("data", (data) => {
    const text = data.toString();
    output += text;
    process.stdout.write(text);
  });

  child.stderr.on("data", (data) => {
    const text = data.toString();
    errorOutput += text;
    process.stderr.write(text);
  });

  child.on("close", (code) => {
    const result = {
      process: processName,
      status: code === 0 ? "FINISHED" : "FAILED",
      exitCode: code,
      finishedAt: new Date().toISOString(),
      output,
      errorOutput
    };

    onFinish(result);
    console.log(`${processName} finalizó con código ${code}`);
  });

  onStart();

  return child;
}

app.post("/api/automation/run-selenium", (req, res) => {
  if (seleniumRunning) {
    return res.status(409).json({
      success: false,
      message: "La automatización Selenium ya está en ejecución."
    });
  }

  lastSeleniumResult = {
    process: "SELENIUM",
    status: "RUNNING",
    startedAt: new Date().toISOString()
  };

  runNodeScript(
    "selenium/src/selenium_import_actas.js",
    "SELENIUM",
    () => {
      seleniumRunning = true;
    },
    (result) => {
      seleniumRunning = false;
      lastSeleniumResult = {
        ...lastSeleniumResult,
        ...result
      };
    }
  );

  return res.json({
    success: true,
    message: "Automatización Selenium iniciada correctamente.",
    note: "Revisa la terminal y los logs de selenium/reports."
  });
});

app.post("/api/automation/run-import", (req, res) => {
  if (importRunning) {
    return res.status(409).json({
      success: false,
      message: "La importación directa ya está en ejecución."
    });
  }

  lastImportResult = {
    process: "IMPORT",
    status: "RUNNING",
    startedAt: new Date().toISOString()
  };

  runNodeScript(
    "src/import_actas_csv.js",
    "IMPORT",
    () => {
      importRunning = true;
    },
    (result) => {
      importRunning = false;
      lastImportResult = {
        ...lastImportResult,
        ...result
      };
    }
  );

  return res.json({
    success: true,
    message: "Importación directa por API iniciada correctamente.",
    note: "Revisa la terminal y los logs de logs/."
  });
});

app.listen(PORT, () => {
  console.log(`Formulario oficial ejecutándose en http://localhost:${PORT}`);
});