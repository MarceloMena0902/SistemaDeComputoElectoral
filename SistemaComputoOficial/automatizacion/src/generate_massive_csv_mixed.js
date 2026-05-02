const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(__dirname, "..", "data", "actas_oficiales_transcripcion_3000_mixto.csv");
const totalRows = 3000;
const errorEvery = 10;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad(value, size) {
  return String(value).padStart(size, "0");
}

const headers = [
  "nro_acta",
  "codigo_territorial",
  "codigo_mesa",
  "nro_mesa",
  "nro_votantes",
  "partido1",
  "partido2",
  "partido3",
  "partido4",
  "votos_blancos",
  "votos_nulos",
  "registrado_por"
];

const territorios = [
  10101, 10102, 10103, 10201, 10202,
  10301, 10302, 10303, 10304, 10401,
  10402, 10403, 10404, 10405, 10501
];

const lines = [headers.join(",")];

let validRows = 0;
let invalidRows = 0;

for (let i = 1; i <= totalRows; i++) {
  const codigoTerritorial = territorios[(i - 1) % territorios.length];
  const recintoCorrelativo = Math.floor((i - 1) / 20) + 1;
  const nroMesa = ((i - 1) % 20) + 1;

  const recintoId = `${codigoTerritorial}${pad(recintoCorrelativo, 3)}`;
  const codigoMesa = `${recintoId}${pad(nroMesa, 3)}`;
  const nroVotantes = randomInt(150, 950);

  let partido1 = randomInt(0, Math.floor(nroVotantes * 0.25));
  let partido2 = randomInt(0, Math.floor(nroVotantes * 0.25));
  let partido3 = randomInt(0, Math.floor(nroVotantes * 0.20));
  let partido4 = randomInt(0, Math.floor(nroVotantes * 0.20));
  let votosBlancos = randomInt(0, Math.floor(nroVotantes * 0.05));
  let votosNulos = randomInt(0, Math.floor(nroVotantes * 0.05));

  let totalVotos = partido1 + partido2 + partido3 + partido4 + votosBlancos + votosNulos;

  while (totalVotos > nroVotantes) {
    partido1 = Math.floor(partido1 * 0.8);
    partido2 = Math.floor(partido2 * 0.8);
    partido3 = Math.floor(partido3 * 0.8);
    partido4 = Math.floor(partido4 * 0.8);
    votosBlancos = Math.floor(votosBlancos * 0.8);
    votosNulos = Math.floor(votosNulos * 0.8);
    totalVotos = partido1 + partido2 + partido3 + partido4 + votosBlancos + votosNulos;
  }

  const shouldBeInvalid = i % errorEvery === 0;

  if (shouldBeInvalid) {
    partido1 = nroVotantes;
    partido2 = randomInt(20, 80);
    partido3 = randomInt(10, 60);
    partido4 = randomInt(10, 60);
    votosBlancos = randomInt(5, 30);
    votosNulos = randomInt(5, 30);
    invalidRows++;
  } else {
    validRows++;
  }

  const nroActa = shouldBeInvalid
    ? `ACTA-ERROR-${codigoMesa}`
    : `ACTA-${codigoMesa}`;

  lines.push([
    nroActa,
    codigoTerritorial,
    codigoMesa,
    nroMesa,
    nroVotantes,
    partido1,
    partido2,
    partido3,
    partido4,
    votosBlancos,
    votosNulos,
    1
  ].join(","));
}

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");

console.log(`CSV mixto generado: ${outputPath}`);
console.log(`Filas generadas: ${totalRows}`);
console.log(`Filas válidas esperadas: ${validRows}`);
console.log(`Filas inválidas esperadas: ${invalidRows}`);