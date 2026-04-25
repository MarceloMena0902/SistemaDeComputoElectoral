import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

const client = axios.create({ baseURL: BASE_URL, timeout: 60_000 });

export interface UploadActaParams {
  imageUri: string;
  mesaId: number;
  pipeline: string;
  usuarioId: number;
  latitud?: number;
  longitud?: number;
}

export async function uploadActa(params: UploadActaParams) {
  const form = new FormData();

  form.append("imagen", {
    uri: params.imageUri,
    name: "acta.jpg",
    type: "image/jpeg",
  } as any);

  form.append("mesa_id", String(params.mesaId));
  form.append("pipeline", params.pipeline);
  form.append("usuario_id", String(params.usuarioId));
  if (params.latitud != null) form.append("latitud", String(params.latitud));
  if (params.longitud != null) form.append("longitud", String(params.longitud));

  const res = await client.post("/actas/procesar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return res.data;
}

export async function fetchProgreso() {
  const res = await client.get("/progreso");
  return res.data;
}

export async function fetchComparativa() {
  const res = await client.get("/resultados/comparativa");
  return res.data;
}
