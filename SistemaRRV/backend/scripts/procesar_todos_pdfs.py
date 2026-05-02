# scripts/procesar_todos_pdfs.py
# v7.0 - pdfplumber primario + EasyOCR fallback para PDFs escaneados/imagen
# Detecta: texto embebido, actas ANULADAS, formularios fisicos escaneados

import os, sys, re, json, hashlib, logging, threading
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field, asdict
from enum import Enum
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pdfplumber
from pymongo import MongoClient

# ============================================================
# CONFIGURACION
# ============================================================
PDF_FOLDER  = os.path.join(os.path.dirname(os.path.dirname(__file__)), "pdfs_entrada")
MONGO_URI   = "mongodb://localhost:27017/"
DB_NAME     = "computo_electoral_rrv"
MAX_WORKERS = 4

DEPTOS_POR_CODIGO = {
    "1": "Chuquisaca",
    "2": "La Paz",
    "3": "Cochabamba",
    "4": "Oruro",
    "5": "Potosi",
    "6": "Tarija",
    "7": "Santa Cruz",
    "8": "Beni",
    "9": "Pando",
}


def _departamento_por_codigo(nro_acta: Optional[str]) -> Optional[str]:
    if not nro_acta:
        return None
    return DEPTOS_POR_CODIGO.get(str(nro_acta)[0])


def _normalizar_departamento(valor: Optional[str]) -> Optional[str]:
    if not valor:
        return None
    limpio = re.sub(r"[^a-zA-Z\s]", " ", valor).lower()
    limpio = re.sub(r"\s+", " ", limpio).strip()
    equivalencias = {
        "chuquisaca": "Chuquisaca",
        "la paz": "La Paz",
        "cochabamba": "Cochabamba",
        "oruro": "Oruro",
        "potosi": "Potosi",
        "potosí": "Potosi",
        "tarija": "Tarija",
        "santa cruz": "Santa Cruz",
        "beni": "Beni",
        "pando": "Pando",
    }
    return equivalencias.get(limpio)
# Zonas del formulario (coordenadas en puntos PDF)
# Formulario estandar: 936x612 (paisaje)
DER_X_MIN, DER_X_MAX = 305, 365   # columna votos candidatos / totales
IZQ_X_MIN, IZQ_X_MAX = 55,  145   # columna estadisticas mesa

ZONAS = {
    "partido1":               (182, 202, DER_X_MIN, DER_X_MAX),
    "partido2":               (202, 226, DER_X_MIN, DER_X_MAX),
    "partido3":               (226, 248, DER_X_MIN, DER_X_MAX),
    "partido4":               (248, 272, DER_X_MIN, DER_X_MAX),
    "votos_validos":          (405, 432, DER_X_MIN, DER_X_MAX),
    "votos_blancos":          (445, 468, DER_X_MIN, DER_X_MAX),
    "votos_nulos":            (468, 492, DER_X_MIN, DER_X_MAX),
    "electores_habilitados":  (444, 468, IZQ_X_MIN, IZQ_X_MAX),
    "papeletas_anfora":       (500, 524, IZQ_X_MIN, IZQ_X_MAX),
    "papeletas_no_utilizadas":(550, 578, IZQ_X_MIN, IZQ_X_MAX),
    "nro_mesa":               (196, 216, IZQ_X_MIN, IZQ_X_MAX),
}

# Dimensiones del formulario estandar en paisaje
STD_W, STD_H = 936.0, 612.0

# ============================================================
# LOGGING
# ============================================================
LOG_DIR = "logs/procesamiento"
os.makedirs(f"{LOG_DIR}/actas_validas",    exist_ok=True)
os.makedirs(f"{LOG_DIR}/actas_observadas", exist_ok=True)
os.makedirs(f"{LOG_DIR}/actas_error",      exist_ok=True)
os.makedirs(f"{LOG_DIR}/actas_anuladas",   exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f"{LOG_DIR}/procesamiento.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def _logger(name, path):
    h = logging.FileHandler(path, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s - %(message)s"))
    lg = logging.getLogger(name)
    lg.setLevel(logging.INFO)
    lg.propagate = False   # no duplicar en procesamiento.log
    lg.addHandler(h)
    return lg

log_validas    = _logger("validas",    f"{LOG_DIR}/actas_validas/actas_validas.log")
log_observadas = _logger("observadas", f"{LOG_DIR}/actas_observadas/actas_observadas.log")
log_anuladas   = _logger("anuladas",   f"{LOG_DIR}/actas_anuladas/actas_anuladas.log")
log_errores    = _logger("errores",    f"{LOG_DIR}/actas_error/actas_error.log")


# ============================================================
# MODELOS
# ============================================================
class EstadoActa(Enum):
    PROCESADA        = "PROCESADA"
    ACTA_OBSERVADA   = "ACTA_OBSERVADA"
    ACTA_ANULADA     = "ACTA_ANULADA"
    ERROR_OCR        = "ERROR_OCR"
    ERROR_VALIDACION = "ERROR_VALIDACION"
    DUPLICADA        = "DUPLICADA"

@dataclass
class DatosActa:
    nro_acta:                Optional[str] = None
    nro_mesa:                int = 0
    departamento:            Optional[str] = None
    provincia:               Optional[str] = None
    municipio:               Optional[str] = None
    recinto:                 Optional[str] = None
    direccion:               Optional[str] = None
    electores_habilitados:   int = 0
    papeletas_anfora:        int = 0
    papeletas_no_utilizadas: int = 0
    partido1:                int = 0
    partido2:                int = 0
    partido3:                int = 0
    partido4:                int = 0
    votos_validos:           int = 0
    votos_blancos:           int = 0
    votos_nulos:             int = 0
    confianza:               float = 0.0
    metodo:                  str = "pdfplumber"
    observaciones:           list = field(default_factory=list)
    tiempo_procesamiento_ms: float = 0.0

@dataclass
class ResultadoProcesamiento:
    archivo: str
    hash:    str
    estado:  EstadoActa
    datos:   DatosActa


# ============================================================
# EXTRACCION DESDE PDF (pdfplumber)
# ============================================================

# Glifos que algunas fuentes/escrituras confunden con digitos
_GLIFO_A_DIGITO = {
    "O": "0",   # letra O → cero  (escritura descuidada)
    "l": "1",   # L minuscula → uno
    "I": "1",   # I mayuscula → uno
    "|": "1",   # barra vertical → uno
    "B": "8",   # letra B → ocho  (escritura descuidada)
}

def _es_digito_o_glifo(texto: str) -> bool:
    return texto.strip().isdigit() or texto.strip() in _GLIFO_A_DIGITO

def _extraer_numero_zona(chars, y1, y2, x1, x2) -> int:
    """Extrae un entero desde los caracteres de una zona del PDF.
    Normaliza glifos ambiguos antes de parsear."""
    candidatos = [
        c for c in chars
        if y1 <= c["top"] <= y2 and x1 <= c["x0"] <= x2
        and _es_digito_o_glifo(c["text"])
    ]
    if not candidatos:
        return 0
    candidatos.sort(key=lambda c: c["x0"])
    num_str = "".join(_GLIFO_A_DIGITO.get(c["text"], c["text"]) for c in candidatos)
    try:
        return int(num_str)
    except ValueError:
        return 0


def _extraer_geo(chars) -> dict:
    """Extrae datos geograficos de la cabecera del formulario."""
    cabecera = [c for c in chars if c["top"] < 160]
    filas: dict[int, list] = {}
    for c in cabecera:
        y_key = round(c["top"] / 7) * 7
        filas.setdefault(y_key, []).append(c)

    lineas = []
    for y_key in sorted(filas):
        fila = sorted(filas[y_key], key=lambda c: c["x0"])
        lineas.append("".join(c["text"] for c in fila).strip())

    geo = {"departamento": None, "provincia": None, "municipio": None,
           "recinto": None, "direccion": None}

    DEPTOS = ["CHUQUISACA","LA PAZ","COCHABAMBA","ORURO","POTOSI",
              "TARIJA","SANTA CRUZ","BENI","PANDO"]
    for linea in lineas:
        lu = linea.upper()
        if any(d in lu for d in DEPTOS) and not geo["departamento"]:
            geo["departamento"] = linea
        elif geo["departamento"] and not geo["provincia"]:
            geo["provincia"] = linea
        elif geo["provincia"] and not geo["municipio"]:
            geo["municipio"] = linea
        elif geo["municipio"] and not geo["recinto"] and (
                "U.E" in lu or "COLEGIO" in lu or "ESCUELA" in lu):
            geo["recinto"] = linea
        elif geo["recinto"] and not geo["direccion"]:
            geo["direccion"] = linea

    return geo


# ============================================================
# OCR FALLBACK (Tesseract — recorte por zona, rapido en CPU)
# ============================================================

# Palabras que indican acta anulada/invalida
_PALABRAS_ANULACION = ["ANULAD", "ANULADO", "ANULADA", "NULADO", "TACHADO", "INVALIDA", "VULAD", "OCALAD"]

# Configuracion Tesseract
_TESS_CMD  = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
_TESS_DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tessdata")
_TESS_CFG_NUM  = "--psm 7 --oem 3 -c tessedit_char_whitelist=0123456789"
_TESS_CFG_TEXT = "--psm 6 --oem 3"


def _ocr_fallback(pdf_path: str, datos: DatosActa) -> tuple:
    """
    Fallback OCR sobre imagen cuando pdfplumber no encuentra votos.
    Usa Tesseract con recorte por zona (rapido, ~5-10s total).
    Casos:
      - 'ANULADO' escrito encima → ACTA_ANULADA
      - Formularios fisicos escaneados → extrae datos por zona
      - Formularios en blanco → ERROR_OCR
    """
    import fitz
    import numpy as np
    import cv2
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = _TESS_CMD
    os.environ["TESSDATA_PREFIX"] = _TESS_DATA

    # ── Renderizar PDF a imagen ────────────────────────────────
    try:
        doc   = fitz.open(pdf_path)
        page  = doc[0]
        w_pt  = page.rect.width
        h_pt  = page.rect.height
        is_portrait = h_pt > w_pt
        is_large    = max(w_pt, h_pt) > 1500
        scale = max(0.5, 1200 / max(w_pt, h_pt)) if is_large else 1.5
        pix   = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        img   = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                    pix.height, pix.width, -1)
        if img.shape[2] == 4:
            img = img[:, :, :3]
        doc.close()
    except Exception as e:
        return EstadoActa.ERROR_OCR, [f"Error renderizando PDF: {e}"]

    if is_portrait:
        img = np.rot90(img, k=-1)   # retrato → paisaje

    img_h, img_w = img.shape[:2]

    # ── Deteccion de acta ANULADA (texto completo) ─────────────
    try:
        texto_total = pytesseract.image_to_string(
            img, lang="spa", config=_TESS_CFG_TEXT
        ).upper()
        if any(p in texto_total for p in _PALABRAS_ANULACION):
            datos.metodo = "ocr_imagen"
            return EstadoActa.ACTA_ANULADA, ["Acta ANULADA detectada por OCR"]
    except Exception:
        pass   # si falla la deteccion de anulada, continuar con extraccion

    # ── Extraccion por zona: recortar → preprocesar → Tesseract ─
    # Zonas en coordenadas absolutas PDF → escalar a imagen
    sx = img_w / STD_W
    sy = img_h / STD_H

    def _leer_zona(y1, y2, x1, x2, max_val=999):
        py1 = max(0,     int(y1 * sy))
        py2 = min(img_h, int(y2 * sy))
        px1 = max(0,     int(x1 * sx))
        px2 = min(img_w, int(x2 * sx))
        zona = img[py1:py2, px1:px2]
        if zona.size == 0:
            return 0
        # Preprocesar: gris + umbral Otsu (igual que el script original)
        gris = cv2.cvtColor(zona, cv2.COLOR_BGR2GRAY)
        _, th = cv2.threshold(gris, 0, 255,
                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        # Padding para que Tesseract no corte borde
        th = cv2.copyMakeBorder(th, 8, 8, 8, 8, cv2.BORDER_CONSTANT, value=255)
        try:
            texto = pytesseract.image_to_string(
                th, config=_TESS_CFG_NUM, lang="spa")
            digitos = re.sub(r"[^0-9]", "", texto)
            if digitos:
                # Aplicar normalizacion de glifos sobre digitos
                val = int("".join(
                    _GLIFO_A_DIGITO.get(c, c) for c in digitos
                    if c.isdigit() or c in _GLIFO_A_DIGITO
                ) or "0")
                if 0 < val <= max_val:
                    return val
        except Exception:
            pass
        return 0

    datos.partido1               = _leer_zona(*ZONAS["partido1"],               max_val=999)
    datos.partido2               = _leer_zona(*ZONAS["partido2"],               max_val=999)
    datos.partido3               = _leer_zona(*ZONAS["partido3"],               max_val=999)
    datos.partido4               = _leer_zona(*ZONAS["partido4"],               max_val=999)
    datos.votos_validos          = _leer_zona(*ZONAS["votos_validos"],          max_val=999)
    datos.votos_blancos          = _leer_zona(*ZONAS["votos_blancos"],          max_val=999)
    datos.votos_nulos            = _leer_zona(*ZONAS["votos_nulos"],            max_val=999)
    datos.electores_habilitados  = _leer_zona(*ZONAS["electores_habilitados"],  max_val=9999)
    datos.papeletas_anfora       = _leer_zona(*ZONAS["papeletas_anfora"],       max_val=9999)
    datos.papeletas_no_utilizadas= _leer_zona(*ZONAS["papeletas_no_utilizadas"],max_val=9999)
    datos.metodo = "ocr_imagen"

    suma = datos.partido1 + datos.partido2 + datos.partido3 + datos.partido4
    if suma == 0 and datos.votos_validos == 0:
        return EstadoActa.ERROR_OCR, ["OCR no encontro datos de votos en las zonas esperadas"]

    return None, ["Datos extraidos por OCR sobre imagen"]   # None → continuar con _validar()


# ============================================================
# PROCESAMIENTO PRINCIPAL DE UN PDF
# ============================================================
def procesar_pdf(pdf_path: str, archivo: str) -> ResultadoProcesamiento:
    import time
    t0 = time.time()

    datos = DatosActa()

    with open(pdf_path, "rb") as f:
        hash_val = hashlib.sha256(f.read()).hexdigest()

    m = re.search(r"acta_(\d+)", archivo)
    datos.nro_acta = m.group(1) if m else None
    datos.departamento = _departamento_por_codigo(datos.nro_acta)

    # ── Paso 1: extraccion por texto embebido (pdfplumber) ────
    try:
        with pdfplumber.open(pdf_path) as pdf:
            page  = pdf.pages[0]
            chars = [c for c in page.chars if c["text"].strip()]

            # Detectar acta ANULADA antes de parsear numeros
            # (el sello "ANULADO" puede caer sobre zonas de votos y generar falsos positivos)
            texto_pagina = "".join(c["text"] for c in chars).upper()
            if any(p in texto_pagina for p in _PALABRAS_ANULACION):
                datos.observaciones.append("Acta ANULADA detectada en texto PDF")
                datos.tiempo_procesamiento_ms = (time.time() - t0) * 1000
                return ResultadoProcesamiento(archivo, hash_val, EstadoActa.ACTA_ANULADA, datos)

            geo = _extraer_geo(chars)
            datos.departamento = datos.departamento or _normalizar_departamento(geo["departamento"])
            datos.provincia    = geo["provincia"]
            datos.municipio    = geo["municipio"]
            datos.recinto      = geo["recinto"]
            datos.direccion    = geo["direccion"]

            datos.nro_mesa = _extraer_numero_zona(chars, *ZONAS["nro_mesa"])

            datos.partido1 = _extraer_numero_zona(chars, *ZONAS["partido1"])
            datos.partido2 = _extraer_numero_zona(chars, *ZONAS["partido2"])
            datos.partido3 = _extraer_numero_zona(chars, *ZONAS["partido3"])
            datos.partido4 = _extraer_numero_zona(chars, *ZONAS["partido4"])

            datos.votos_validos = _extraer_numero_zona(chars, *ZONAS["votos_validos"])
            datos.votos_blancos = _extraer_numero_zona(chars, *ZONAS["votos_blancos"])
            datos.votos_nulos   = _extraer_numero_zona(chars, *ZONAS["votos_nulos"])

            datos.electores_habilitados    = _extraer_numero_zona(chars, *ZONAS["electores_habilitados"])
            datos.papeletas_anfora         = _extraer_numero_zona(chars, *ZONAS["papeletas_anfora"])
            datos.papeletas_no_utilizadas  = _extraer_numero_zona(chars, *ZONAS["papeletas_no_utilizadas"])

    except Exception as e:
        logger.error(f"Error pdfplumber en {archivo}: {e}")
        datos.observaciones.append(f"Error PDF: {e}")

    # ── Paso 2: fallback OCR si no se encontraron votos ───────
    suma = datos.partido1 + datos.partido2 + datos.partido3 + datos.partido4
    if suma == 0 and datos.votos_validos == 0:
        estado_ocr, obs_ocr = _ocr_fallback(pdf_path, datos)
        datos.observaciones.extend(obs_ocr)
        if estado_ocr is not None:
            # Resultado definitivo (ANULADA o ERROR_OCR irresoluble)
            datos.confianza = _calcular_confianza(datos)
            datos.tiempo_procesamiento_ms = (time.time() - t0) * 1000
            return ResultadoProcesamiento(archivo, hash_val, estado_ocr, datos)
        # Si estado_ocr es None, OCR pobló datos.partidoX → continuar con _validar()

    # ── Paso 3: validacion y resultado ───────────────────────
    estado, obs = _validar(datos)
    datos.observaciones.extend(obs)
    datos.confianza = _calcular_confianza(datos)
    datos.tiempo_procesamiento_ms = (time.time() - t0) * 1000

    return ResultadoProcesamiento(archivo, hash_val, estado, datos)


# ============================================================
# VALIDACION Y CONFIANZA
# ============================================================
def _validar(datos: DatosActa):
    obs  = []
    suma = datos.partido1 + datos.partido2 + datos.partido3 + datos.partido4
    uv   = datos.votos_validos

    if suma == 0 and uv == 0:
        return EstadoActa.ERROR_OCR, ["Sin datos de votos"]

    if suma == 0 and uv > 0:
        obs.append(f"Candidatos sin votos pero UV={uv} — posible formulario en blanco u OCR erroneo")
        return EstadoActa.ACTA_OBSERVADA, obs

    if uv == 0 and suma > 0:
        datos.votos_validos = suma
        uv = suma
        obs.append("UV calculado desde suma de partidos")

    if uv > 0 and suma > 0:
        diff = abs(suma - uv)
        if diff == 0:
            pass
        elif diff <= 3:
            obs.append(f"Diferencia leve: {diff} votos")
        elif diff <= 15:
            obs.append(f"Diferencia moderada: {diff} votos")
            return EstadoActa.ACTA_OBSERVADA, obs
        else:
            obs.append(f"Diferencia grave: {diff} votos (suma={suma}, UV={uv})")
            return EstadoActa.ERROR_VALIDACION, obs

    if datos.papeletas_anfora > 0:
        total_calc = uv + datos.votos_blancos + datos.votos_nulos
        if abs(total_calc - datos.papeletas_anfora) > 5:
            obs.append(f"Papeletas inconsistentes: {total_calc} vs {datos.papeletas_anfora}")

    return EstadoActa.PROCESADA, obs


def _calcular_confianza(datos: DatosActa) -> float:
    puntos, total = 0, 7
    if datos.partido1 > 0: puntos += 1
    if datos.partido2 > 0: puntos += 1
    if datos.partido3 > 0: puntos += 1
    if datos.partido4 > 0: puntos += 1
    if datos.votos_validos > 0: puntos += 1
    if datos.electores_habilitados > 0: puntos += 1
    total_v = datos.votos_validos + datos.votos_blancos + datos.votos_nulos
    if datos.papeletas_anfora > 0 and abs(total_v - datos.papeletas_anfora) <= 5:
        puntos += 1
    return round(puntos / total * 100, 1)


# ============================================================
# MONGODB
# ============================================================
class MongoDB:
    def __init__(self):
        self.client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000,
                                  directConnection=True)
        self.client.admin.command("ping")
        self.col = self.client[DB_NAME]["actas_rrv"]
        logger.info("Conectado a MongoDB")

    def limpiar(self):
        self.col.delete_many({})
        logger.info("Coleccion limpiada")

    def guardar(self, r: ResultadoProcesamiento):
        self.col.insert_one({
            "nombre":              r.archivo,
            "hash":                r.hash,
            "estado":              r.estado.value,
            "datos":               asdict(r.datos),
            "fecha_procesamiento": datetime.now(),
        })

    def cerrar(self): self.client.close()
    def total(self):  return self.col.count_documents({})


# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 70)
    print("SISTEMA DE PROCESAMIENTO DE ACTAS v7.0")
    print("pdfplumber + EasyOCR fallback + deteccion ANULADA")
    print("=" * 70)

    try:
        mongo = MongoDB()
    except Exception as e:
        logger.error(f"No se pudo conectar a MongoDB: {e}")
        return

    if not os.path.exists(PDF_FOLDER):
        logger.error(f"Carpeta no encontrada: {PDF_FOLDER}")
        mongo.cerrar()
        return

    archivos = sorted([f for f in os.listdir(PDF_FOLDER) if f.lower().endswith(".pdf")])
    total    = len(archivos)
    logger.info(f"Total PDFs: {total}")
    mongo.limpiar()

    import time
    t0 = time.time()
    contadores = {"procesadas": 0, "observadas": 0, "anuladas": 0, "errores": 0}
    lock = threading.Lock()

    def procesar_y_guardar(i, archivo):
        ruta = os.path.join(PDF_FOLDER, archivo)
        r    = procesar_pdf(ruta, archivo)
        mongo.guardar(r)
        return i, archivo, r

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futuros = {pool.submit(procesar_y_guardar, i, arch): arch
                   for i, arch in enumerate(archivos, 1)}

        for fut in as_completed(futuros):
            try:
                i, archivo, r = fut.result()
                d   = r.datos
                est = r.estado.value

                with lock:
                    metodo_tag = f" [{d.metodo}]" if d.metodo != "pdfplumber" else ""
                    ICONO = {
                        EstadoActa.PROCESADA:        "✅ Guardada",
                        EstadoActa.ACTA_OBSERVADA:   "⚠️  Guardada (observada)",
                        EstadoActa.ACTA_ANULADA:     "🚫 Guardada (ANULADA)",
                        EstadoActa.ERROR_OCR:        "❌ Error OCR",
                        EstadoActa.ERROR_VALIDACION: "❌ Error validación",
                        EstadoActa.DUPLICADA:        "🔁 Duplicada",
                    }.get(r.estado, "❓ Desconocido")

                    obs_str = ""
                    if d.observaciones:
                        obs_str = "\n    Obs: " + "; ".join(d.observaciones)

                    logger.info(
                        f"Procesando: {archivo}\n"
                        f"    Mesa: {d.nro_mesa}  |  Método: {d.metodo}{metodo_tag}\n"
                        f"    Electores: {d.electores_habilitados}, "
                        f"Ánfora: {d.papeletas_anfora}, "
                        f"No usadas: {d.papeletas_no_utilizadas}\n"
                        f"    P1={d.partido1}, P2={d.partido2}, "
                        f"P3={d.partido3}, P4={d.partido4}\n"
                        f"    UV={d.votos_validos}, VB={d.votos_blancos}, "
                        f"VN={d.votos_nulos}  |  conf={d.confianza:.0f}%\n"
                        f"    Estado: {est}{obs_str}\n"
                        f"  {ICONO}"
                    )

                    if r.estado == EstadoActa.PROCESADA:
                        contadores["procesadas"] += 1
                        log_validas.info(
                            json.dumps(asdict(d), ensure_ascii=False, default=str))
                    elif r.estado == EstadoActa.ACTA_OBSERVADA:
                        contadores["observadas"] += 1
                        log_observadas.info(
                            json.dumps(asdict(d), ensure_ascii=False, default=str))
                    elif r.estado == EstadoActa.ACTA_ANULADA:
                        contadores["anuladas"] += 1
                        log_anuladas.info(json.dumps(
                            {"archivo": archivo, "obs": d.observaciones},
                            ensure_ascii=False))
                    else:
                        contadores["errores"] += 1
                        log_errores.info(json.dumps(
                            {"archivo": archivo, "estado": est, "obs": d.observaciones},
                            ensure_ascii=False))

            except Exception as ex:
                logger.error(f"Error en futuro: {ex}")
                with lock:
                    contadores["errores"] += 1

    procesadas = contadores["procesadas"]
    observadas = contadores["observadas"]
    anuladas   = contadores["anuladas"]
    errores    = contadores["errores"]
    tiempo     = time.time() - t0

    print("\n" + "=" * 70)
    print("REPORTE FINAL")
    print("=" * 70)
    print(f"  PROCESADAS  : {procesadas} ({procesadas/total*100:.1f}%)")
    print(f"  OBSERVADAS  : {observadas} ({observadas/total*100:.1f}%)")
    print(f"  ANULADAS    : {anuladas}   ({anuladas/total*100:.1f}%)")
    print(f"  ERRORES     : {errores} ({errores/total*100:.1f}%)")
    print(f"  Tiempo total: {tiempo:.1f}s | {total/tiempo:.1f} actas/seg")
    print(f"  Documentos en MongoDB: {mongo.total()}")

    pipeline = [
        {"$match": {"estado": {"$in": ["PROCESADA", "ACTA_OBSERVADA"]}}},
        {"$group": {
            "_id": None,
            "p1": {"$sum": "$datos.partido1"},
            "p2": {"$sum": "$datos.partido2"},
            "p3": {"$sum": "$datos.partido3"},
            "p4": {"$sum": "$datos.partido4"},
            "uv": {"$sum": "$datos.votos_validos"},
        }}
    ]
    agg = list(mongo.col.aggregate(pipeline))
    if agg:
        v  = agg[0]
        uv = v["uv"] or 1
        print(f"\n  TOTALES NACIONALES (actas validas + observadas):")
        print(f"    Total votos validos : {uv:,}")
        print(f"    P1: {v['p1']:,} ({v['p1']/uv*100:.1f}%)")
        print(f"    P2: {v['p2']:,} ({v['p2']/uv*100:.1f}%)")
        print(f"    P3: {v['p3']:,} ({v['p3']/uv*100:.1f}%)")
        print(f"    P4: {v['p4']:,} ({v['p4']/uv*100:.1f}%)")

    mongo.cerrar()
    print("\nProceso completado.")


if __name__ == "__main__":
    main()


