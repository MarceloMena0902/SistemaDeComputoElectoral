const express = require("express");
const path = require("path");

const app = express();
const PORT = 3005;

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Formulario oficial ejecutándose en http://localhost:${PORT}`);
});