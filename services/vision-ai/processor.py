"""
Procesador de imágenes de actas electorales.

Pipeline:
  1. Carga de imagen con OpenCV
  2. Detección de calidad (varianza del Laplaciano → blur score)
  3. Detección del contorno del acta (rectángulo)
  4. Corrección de perspectiva (warp transform)
  5. Pre-procesamiento: escala de grises, CLAHE, umbralización adaptativa
  6. OCR con EasyOCR (español)
  7. Post-procesamiento: mapeo de regiones → partidos → votos
  8. Validación de coherencia matemática
"""

import multiprocessing
import os
import re
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from loguru import logger


# ==============================================================
#  Excepciones
# ==============================================================
class CalidadInsuficienteError(Exception):
    """Se lanza cuando la imagen no cumple el umbral mínimo de calidad."""


# ==============================================================
#  Constantes
# ==============================================================
BLUR_THRESHOLD = 80.0        # Varianza mínima del Laplaciano (≥ = imagen nítida)
MIN_CONTOUR_AREA = 50_000    # Área mínima del contorno del acta (px²)
OCR_IDIOMAS = ["es"]         # EasyOCR: solo español

# Partidos esperados en las actas bolivianas (orden en la boleta)
PARTIDOS_CODIGOS = [
    "MAS-IPSP", "CC", "CREEMOS", "FPV", "MTS",
    "UCS", "21F", "PDC", "PANBOL", "MNR",
]


# ==============================================================
#  Funciones de pre-procesamiento (OpenCV)
# ==============================================================

def calcular_blur_score(imagen_gray: np.ndarray) -> float:
    """
    Calcula la nitidez de la imagen usando la varianza del Laplaciano.
    Valores bajos = borrosa. Umbral recomendado: > 80.
    """
    return float(cv2.Laplacian(imagen_gray, cv2.CV_64F).var())


def detectar_contorno_acta(imagen: np.ndarray) -> Optional[np.ndarray]:
    """
    Detecta el contorno rectangular del acta electoral.
    Retorna las 4 esquinas o None si no se encuentra.
    """
    gray = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 200)

    # Dilatar bordes para cerrar gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    edged = cv2.dilate(edged, kernel, iterations=2)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    for contour in contours[:5]:
        area = cv2.contourArea(contour)
        if area < MIN_CONTOUR_AREA:
            continue

        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)

        if len(approx) == 4:
            return approx.reshape(4, 2)

    return None


def ordenar_puntos(pts: np.ndarray) -> np.ndarray:
    """Ordena las 4 esquinas: [top-left, top-right, bottom-right, bottom-left]."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left: menor suma
    rect[2] = pts[np.argmax(s)]   # bottom-right: mayor suma
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right: menor diferencia
    rect[3] = pts[np.argmax(diff)]  # bottom-left: mayor diferencia
    return rect


def corregir_perspectiva(imagen: np.ndarray, puntos: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Aplica transformación de perspectiva para obtener vista frontal del acta.
    Retorna (imagen_corregida, angulo_estimado).
    """
    rect = ordenar_puntos(puntos)
    tl, tr, br, bl = rect

    # Calcular dimensiones del output
    ancho_sup = np.linalg.norm(tr - tl)
    ancho_inf = np.linalg.norm(br - bl)
    ancho = int(max(ancho_sup, ancho_inf))

    alto_izq = np.linalg.norm(bl - tl)
    alto_der = np.linalg.norm(br - tr)
    alto = int(max(alto_izq, alto_der))

    dst = np.array([
        [0, 0],
        [ancho - 1, 0],
        [ancho - 1, alto - 1],
        [0, alto - 1],
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(imagen, M, (ancho, alto))

    # Estimar ángulo de inclinación
    vector = tr - tl
    angulo = float(np.degrees(np.arctan2(vector[1], vector[0])))

    return warped, angulo


def preprocesar_para_ocr(imagen: np.ndarray) -> np.ndarray:
    """
    Pre-procesa la imagen para maximizar la precisión del OCR:
    1. Escala de grises
    2. CLAHE (mejora de contraste adaptativo)
    3. Eliminación de ruido bilateral
    4. Umbralización adaptativa de Otsu
    """
    gray = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)

    # CLAHE para mejorar contraste en zonas con sombras
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Filtro bilateral: elimina ruido preservando bordes
    denoised = cv2.bilateralFilter(gray, 9, 75, 75)

    # Umbralización de Otsu para binarizar
    _, thresh = cv2.threshold(
        denoised, 0, 255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )

    return thresh


# ==============================================================
#  Clase ActaProcessor
# ==============================================================

class ActaProcessor:
    """
    Orquesta el pipeline completo de procesamiento de actas.
    El modelo EasyOCR se carga una única vez (costoso en memoria).
    """

    def __init__(self, workers: int = 4):
        self.workers = workers
        self._reader = None
        logger.info(f"ActaProcessor iniciado con {workers} workers")

    def _get_reader(self):
        """Inicialización lazy del modelo EasyOCR."""
        if self._reader is None:
            import easyocr
            self._reader = easyocr.Reader(OCR_IDIOMAS, gpu=False, verbose=False)
            logger.info("Modelo EasyOCR cargado")
        return self._reader

    def procesar_acta(self, ruta_imagen: str, acta_uuid: str) -> dict:
        """
        Ejecuta el pipeline completo para una imagen de acta.

        Args:
            ruta_imagen: Ruta al archivo de imagen original
            acta_uuid: UUID único para nombrar el archivo procesado

        Returns:
            dict con calidad_imagen, angulo_correccion, partidos, advertencias, etc.
        """
        advertencias = []
        angulo_correccion = 0.0

        # --- Cargar imagen ---
        imagen = cv2.imread(ruta_imagen)
        if imagen is None:
            raise ValueError(f"No se pudo cargar la imagen: {ruta_imagen}")

        gray = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)

        # --- Calcular calidad (blur) ---
        blur_score = calcular_blur_score(gray)
        calidad = min(100.0, blur_score / BLUR_THRESHOLD * 100)
        logger.debug(f"[{acta_uuid}] Blur score: {blur_score:.2f}, Calidad: {calidad:.1f}%")

        if blur_score < BLUR_THRESHOLD:
            raise CalidadInsuficienteError(
                f"Imagen muy borrosa (score={blur_score:.1f}, mínimo={BLUR_THRESHOLD}). "
                "Por favor, tome una foto más nítida del acta."
            )

        # --- Detectar y corregir perspectiva ---
        contorno = detectar_contorno_acta(imagen)
        if contorno is not None:
            imagen_corregida, angulo_correccion = corregir_perspectiva(imagen, contorno)
            logger.debug(f"[{acta_uuid}] Perspectiva corregida, ángulo: {angulo_correccion:.1f}°")
        else:
            imagen_corregida = imagen
            advertencias.append("No se detectó el contorno rectangular del acta; se usó imagen completa")
            logger.warning(f"[{acta_uuid}] Contorno no detectado")

        # --- Pre-procesar para OCR ---
        imagen_ocr = preprocesar_para_ocr(imagen_corregida)

        # Guardar imagen procesada
        upload_dir = Path(ruta_imagen).parent.parent / "processed"
        ruta_procesada = str(upload_dir / f"{acta_uuid}_processed.jpg")
        cv2.imwrite(ruta_procesada, imagen_ocr)

        # --- Ejecutar OCR ---
        reader = self._get_reader()
        resultados_ocr = reader.readtext(
            imagen_ocr,
            detail=1,           # Incluye bounding box y confianza
            paragraph=False,
            width_ths=0.7,
            height_ths=0.5,
        )
        logger.debug(f"[{acta_uuid}] OCR retornó {len(resultados_ocr)} tokens")

        # --- Post-procesar: extraer datos del acta ---
        datos = self._extraer_datos_acta(resultados_ocr, imagen_corregida.shape)

        return {
            "calidad_imagen": round(calidad, 2),
            "angulo_correccion": round(angulo_correccion, 2),
            "imagen_procesada": ruta_procesada,
            "partidos": datos["partidos"],
            "total_votos_validos": datos.get("total_votos_validos"),
            "total_votos_blancos": datos.get("total_votos_blancos"),
            "total_votos_nulos": datos.get("total_votos_nulos"),
            "total_votos_emitidos": datos.get("total_votos_emitidos"),
            "advertencias": advertencias + datos.get("advertencias", []),
        }

    def _extraer_datos_acta(
        self, resultados_ocr: list, forma_imagen: tuple
    ) -> dict:
        """
        Mapea los tokens del OCR a la estructura del acta boliviana.

        Estrategia:
        - Divide la imagen en zonas verticales (cada partido ocupa una franja)
        - Para cada zona, busca el número más confiable
        - Extrae los totales del pie de página del acta
        """
        alto, ancho = forma_imagen[:2]
        partidos_resultado = {}
        advertencias = []

        # Agrupar tokens por posición vertical (zona del acta)
        # El acta tiene ~10 filas de partidos ocupando el 60% central
        zona_inicio_y = int(alto * 0.20)
        zona_fin_y = int(alto * 0.85)
        altura_zona = (zona_fin_y - zona_inicio_y) / len(PARTIDOS_CODIGOS)

        for i, partido_codigo in enumerate(PARTIDOS_CODIGOS):
            y_min = zona_inicio_y + i * altura_zona
            y_max = y_min + altura_zona

            # Buscar tokens numéricos en la columna derecha de esta zona
            votos_candidatos = []
            for (bbox, texto, confianza) in resultados_ocr:
                cx = (bbox[0][0] + bbox[2][0]) / 2
                cy = (bbox[0][1] + bbox[2][1]) / 2

                # Solo la columna derecha (últimos 40% del ancho = casillas de votos)
                if cx < ancho * 0.60:
                    continue
                if not (y_min <= cy <= y_max):
                    continue

                # Limpiar texto y verificar que es número
                texto_limpio = re.sub(r"[^0-9]", "", texto)
                if texto_limpio and len(texto_limpio) <= 4:
                    votos_candidatos.append((int(texto_limpio), confianza))

            if votos_candidatos:
                # Tomar el valor con mayor confianza
                votos_candidatos.sort(key=lambda x: x[1], reverse=True)
                votos, confianza = votos_candidatos[0]
            else:
                votos = 0
                confianza = 0.0
                advertencias.append(f"No se encontraron votos para {partido_codigo}")

            partidos_resultado[partido_codigo] = {
                "votos": votos,
                "votos_ocr": votos,
                "confianza": round(confianza * 100, 2),
            }

        # Extraer totales del pie del acta
        totales = self._extraer_totales(resultados_ocr, alto, ancho)

        return {
            "partidos": partidos_resultado,
            "advertencias": advertencias,
            **totales,
        }

    def _extraer_totales(self, resultados_ocr: list, alto: int, ancho: int) -> dict:
        """Extrae los votos totales (válidos, blancos, nulos, emitidos) del pie del acta."""
        zona_pie_y = int(alto * 0.85)
        numeros_pie = []

        for (bbox, texto, confianza) in resultados_ocr:
            cy = (bbox[0][1] + bbox[2][1]) / 2
            if cy < zona_pie_y:
                continue
            texto_limpio = re.sub(r"[^0-9]", "", texto)
            if texto_limpio and confianza > 0.5:
                numeros_pie.append((int(texto_limpio), (bbox[0][0] + bbox[2][0]) / 2))

        # Ordenar por posición X (izquierda a derecha)
        numeros_pie.sort(key=lambda x: x[1])

        totales = {}
        if len(numeros_pie) >= 4:
            totales["total_votos_validos"]  = numeros_pie[0][0]
            totales["total_votos_blancos"]  = numeros_pie[1][0]
            totales["total_votos_nulos"]    = numeros_pie[2][0]
            totales["total_votos_emitidos"] = numeros_pie[3][0]

        return totales


# ==============================================================
#  Función para uso con ProcessPoolExecutor (módulo-level)
# ==============================================================
def _procesar_en_proceso(ruta_imagen: str, acta_uuid: str) -> dict:
    """Wrapper para ejecutar en un proceso separado."""
    processor = ActaProcessor(workers=1)
    return processor.procesar_acta(ruta_imagen, acta_uuid)
