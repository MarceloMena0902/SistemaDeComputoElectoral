const express = require("express");

const app = express();
const PORT = 4000;

app.use(express.json());

const actasRegistradas = new Map();


app.get("/", (req, res) => {
  return res.json({
    service: "Mock Backend Oficial",
    status: "running",
    endpoints: {
      listActas: "GET /api/oficial/actas",
      registerActa: "POST /api/oficial/actas"
    }
  });
});

app.post("/api/oficial/actas", (req, res) => {
  const body = req.body;

  if (!body.nro_acta || !body.codigo_mesa || !body.votos) {
    return res.status(400).json({
      success: false,
      message: "Datos incompletos del acta"
    });
  }

  if (actasRegistradas.has(body.nro_acta)) {
    return res.status(409).json({
      success: false,
      message: "Acta duplicada",
      nro_acta: body.nro_acta
    });
  }

  actasRegistradas.set(body.nro_acta, {
    ...body,
    receivedAt: new Date().toISOString()
  });

  return res.status(201).json({
    success: true,
    message: "Acta oficial registrada correctamente",
    nro_acta: body.nro_acta,
    codigo_mesa: body.codigo_mesa,
    totalRegistradas: actasRegistradas.size
  });
});

app.get("/api/oficial/actas", (req, res) => {
  return res.json({
    total: actasRegistradas.size,
    data: Array.from(actasRegistradas.values())
  });
});

app.listen(PORT, () => {
  console.log(`Mock backend oficial ejecutándose en http://localhost:${PORT}`);
});