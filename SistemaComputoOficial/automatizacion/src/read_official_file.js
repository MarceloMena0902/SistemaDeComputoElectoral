const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const xlsx = require("xlsx");

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", () => {
        resolve(rows);
      })
      .on("error", reject);
  });
}

function readXlsx(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  return xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false
  });
}

async function readOfficialFile(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`No existe el archivo: ${absolutePath}`);
  }

  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === ".csv") {
    return await readCsv(absolutePath);
  }

  if (extension === ".xlsx" || extension === ".xls") {
    return readXlsx(absolutePath);
  }

  throw new Error(`Formato no soportado: ${extension}`);
}

module.exports = {
  readOfficialFile
};