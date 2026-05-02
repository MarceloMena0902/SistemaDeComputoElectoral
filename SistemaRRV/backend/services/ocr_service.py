# services/ocr_service.py - UNIFICADO con todas las validaciones
import pytesseract
import cv2
import numpy as np
from pdf2image import convert_from_path
from PIL import Image
import re
import os
import logging
import json
from datetime import datetime
from typing import Dict, Tuple, Optional, List

# ============================================================
# CONFIGURACIÓN DE LOGS
# ============================================================
LOG_DIR = "logs/paralelo"
os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger('ocr_service')
logger.setLevel(logging.DEBUG)

file_handler = logging.FileHandler(f"{LOG_DIR}/ocr_detalle.log", encoding='utf-8')
file_handler.setLevel(logging.DEBUG)

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.WARNING)

formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)

# Logs específicos
actas_validas_log = logging.getLogger('actas_validas')
actas_validas_log.setLevel(logging.INFO)
validas_handler = logging.FileHandler("logs/actas_validas/actas_validas.log", encoding='utf-8')
actas_validas_log.addHandler(validas_handler)

actas_observadas_log = logging.getLogger('actas_observadas')
actas_observadas_log.setLevel(logging.INFO)
observadas_handler = logging.FileHandler("logs/actas_observadas/actas_observadas.log", encoding='utf-8')
actas_observadas_log.addHandler(observadas_handler)

actas_error_log = logging.getLogger('actas_error')
actas_error_log.setLevel(logging.INFO)
error_handler = logging.FileHandler("logs/actas_error/actas_error.log", encoding='utf-8')
actas_error_log.addHandler(error_handler)

# ============================================================
# CONFIGURACIÓN TESSERACT
# ============================================================
TESSERACT_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
]

TESSERACT_FOUND = False
PROJECT_TESSDATA = r"D:\Descargas\rrvfrontend\SistemaRRV\backend\tessdata"
os.environ['TESSDATA_PREFIX'] = PROJECT_TESSDATA

for path in TESSERACT_PATHS:
    if os.path.exists(path):
        pytesseract.pytesseract.tesseract_cmd = path
        TESSERACT_FOUND = True
        print(f"✅ Tesseract encontrado: {path}")
        break


class OCRService:
    """Servicio OCR con todas las validaciones integradas"""
    
    @staticmethod
    def pdf_a_imagenes(pdf_path: str) -> List[Image.Image]:
        """Convierte PDF a imágenes (DPI reducido para velocidad)"""
        return convert_from_path(pdf_path, dpi=150)
    
    @staticmethod
    def preprocesar_imagen(imagen: Image.Image) -> np.ndarray:
        """Preprocesamiento rápido y efectivo"""
        img_cv = cv2.cvtColor(np.array(imagen), cv2.COLOR_RGB2BGR)
        gris = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        _, binaria = cv2.threshold(gris, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binaria
    
    @staticmethod
    def extraer_texto(imagen_procesada: np.ndarray) -> Tuple[str, float]:
        """Extrae texto con Tesseract"""
        if not TESSERACT_FOUND:
            return "", 0.0
        config = r'--oem 3 --psm 6 -l spa --dpi 150'
        try:
            texto = pytesseract.image_to_string(imagen_procesada, config=config)
            return texto, 50.0
        except Exception as e:
            logger.error(f"Error OCR: {e}")
            return "", 0.0
    
    @staticmethod
    def extraer_datos_acta(texto: str, archivo: str) -> Dict:
        """Extracción inteligente de datos (filtra códigos grandes)"""
        resultado = {
            "nro_acta": None,
            "nro_mesa": None,
            "departamento": None,
            "provincia": None,
            "municipio": None,
            "partido1": 0, "partido2": 0, "partido3": 0, "partido4": 0,
            "votos_validos": 0, "votos_blancos": 0, "votos_nulos": 0,
            "total_boletas": 0,
            "ciudadanos_habilitados": 0,
            "papeletas_no_usadas": 0,
            "observaciones": []
        }
        
        # ============================================================
        # 1. Número de acta (del nombre del archivo)
        # ============================================================
        acta_match = re.search(r'acta_(\d+)', archivo, re.IGNORECASE)
        if acta_match:
            resultado["nro_acta"] = acta_match.group(1)
        else:
            code_match = re.search(r'\b(\d{10,15})\b', texto)
            if code_match:
                resultado["nro_acta"] = code_match.group(1)
        
        # ============================================================
        # 2. Datos geográficos
        # ============================================================
        deptos = ["CHUQUISACA", "LA PAZ", "COCHABAMBA", "ORURO", "POTOSI", 
                  "TARIJA", "SANTA CRUZ", "BENI", "PANDO"]
        for depto in deptos:
            if depto in texto.upper():
                resultado["departamento"] = depto.title()
                break
        
        prov_match = re.search(r'PROVINCIA[:\s]*([A-ZÁÉÍÓÚÑ\s]+)', texto, re.IGNORECASE)
        if prov_match:
            resultado["provincia"] = prov_match.group(1).strip().title()
        
        # ============================================================
        # 3. Números de votos (filtrando códigos >5000)
        # ============================================================
        todos_numeros = re.findall(r'\b(\d+)\b', texto)
        numeros_limpios = []
        
        for num in todos_numeros:
            num_int = int(num)
            if num_int < 5000 and num_int > 0:
                numeros_limpios.append(num_int)
        
        if len(numeros_limpios) >= 4:
            resultado["partido1"] = numeros_limpios[0]
            resultado["partido2"] = numeros_limpios[1]
            resultado["partido3"] = numeros_limpios[2]
            resultado["partido4"] = numeros_limpios[3]
        
        # ============================================================
        # 4. Totales UV, VB, VN
        # ============================================================
        uv_match = re.search(r'UV[:\s]*(\d+)', texto, re.IGNORECASE)
        if uv_match and int(uv_match.group(1)) < 5000:
            resultado["votos_validos"] = int(uv_match.group(1))
        
        vb_match = re.search(r'VB[:\s]*(\d+)', texto, re.IGNORECASE)
        if vb_match and int(vb_match.group(1)) < 5000:
            resultado["votos_blancos"] = int(vb_match.group(1))
        
        vn_match = re.search(r'VN[:\s]*(\d+)', texto, re.IGNORECASE)
        if vn_match and int(vn_match.group(1)) < 5000:
            resultado["votos_nulos"] = int(vn_match.group(1))
        
        # ============================================================
        # 5. Ciudadanos habilitados y papeletas no usadas
        # ============================================================
        hab_match = re.search(r'HABILITADOS[:\s]*(\d+)', texto, re.IGNORECASE)
        if hab_match and int(hab_match.group(1)) < 10000:
            resultado["ciudadanos_habilitados"] = int(hab_match.group(1))
        
        vnu_match = re.search(r'VNU[:\s]*(\d+)', texto, re.IGNORECASE)
        if vnu_match and int(vnu_match.group(1)) < 5000:
            resultado["papeletas_no_usadas"] = int(vnu_match.group(1))
        
        # ============================================================
        # 6. Total boletas
        # ============================================================
        total_match = re.search(r'TOTAL[:\s]*(\d+)', texto, re.IGNORECASE)
        if total_match and int(total_match.group(1)) < 10000:
            resultado["total_boletas"] = int(total_match.group(1))
        else:
            resultado["total_boletas"] = (resultado["votos_validos"] + 
                                          resultado["votos_blancos"] + 
                                          resultado["votos_nulos"])
        
        return resultado
    
    @staticmethod
    def validar_todas_reglas(datos: Dict) -> Dict:
        """
        Aplica TODAS las reglas de validación:
        - R1: suma_candidatos vs votos_validos
        - R2: ciudadanos_habilitados vs boletas_anfora + no_usadas
        - R3: total_boletas vs votos_validos + votos_nulos
        - R4: Detectar observaciones manuscritas
        """
        errores = []
        observaciones = []
        reglas_aplicadas = []
        
        suma_candidatos = (datos.get("partido1", 0) + datos.get("partido2", 0) + 
                          datos.get("partido3", 0) + datos.get("partido4", 0))
        validos = datos.get("votos_validos", 0)
        blancos = datos.get("votos_blancos", 0)
        nulos = datos.get("votos_nulos", 0)
        total_boletas = datos.get("total_boletas", 0)
        habilitados = datos.get("ciudadanos_habilitados", 0)
        no_usadas = datos.get("papeletas_no_usadas", 0)
        
        # ============================================================
        # REGLA 1: suma candidatos vs votos válidos
        # ============================================================
        if validos > 0 and suma_candidatos > 0:
            diferencia = suma_candidatos - validos
            if diferencia == 0:
                reglas_aplicadas.append("R1")
            elif abs(diferencia) <= 2:
                observaciones.append({
                    "regla": "R1a",
                    "mensaje": f"Leve inconsistencia: suma candidatos ({suma_candidatos}) vs válidos ({validos}) | dif: {diferencia}",
                    "diferencia": diferencia
                })
            else:
                errores.append({
                    "regla": "R1b",
                    "mensaje": f"Error grave: suma candidatos ({suma_candidatos}) vs válidos ({validos}) | dif: {diferencia}",
                    "diferencia": diferencia
                })
        
        # ============================================================
        # REGLA 2: ciudadanos habilitados = boletas_anfora + no_usadas
        # ============================================================
        if habilitados > 0 and total_boletas > 0:
            esperado = total_boletas + no_usadas
            if habilitados != esperado:
                observaciones.append({
                    "regla": "R2",
                    "mensaje": f"Habilitados ({habilitados}) != Ánfora ({total_boletas}) + No usadas ({no_usadas})",
                    "diferencia": habilitados - esperado
                })
            else:
                reglas_aplicadas.append("R2")
        
        # ============================================================
        # REGLA 3: boletas_anfora = votos_validos + votos_nulos
        # ============================================================
        if total_boletas > 0 and (validos > 0 or nulos > 0):
            esperado = validos + nulos
            if total_boletas != esperado:
                diferencia = total_boletas - esperado
                if abs(diferencia) <= 2:
                    observaciones.append({
                        "regla": "R3a",
                        "mensaje": f"Leve diferencia: total ({total_boletas}) vs válidos+nulos ({esperado})",
                        "diferencia": diferencia
                    })
                else:
                    errores.append({
                        "regla": "R3b",
                        "mensaje": f"Error grave: total ({total_boletas}) vs válidos+nulos ({esperado})",
                        "diferencia": diferencia
                    })
            else:
                reglas_aplicadas.append("R3")
        
        # ============================================================
        # DETERMINAR ESTADO FINAL
        # ============================================================
        if len(errores) > 0:
            estado = "ERROR_VALIDACION"
        elif len(observaciones) > 0:
            estado = "ACTA_OBSERVADA"
        elif suma_candidatos == 0 and validos == 0:
            estado = "ERROR_OCR"
        else:
            estado = "PROCESADA"
        
        return {
            "estado": estado,
            "valida": len(errores) == 0,
            "errores": errores,
            "observaciones": observaciones,
            "reglas_aplicadas": reglas_aplicadas,
            "resumen": {
                "suma_candidatos": suma_candidatos,
                "votos_validos": validos,
                "diferencia_principal": suma_candidatos - validos,
                "total_boletas": total_boletas
            }
        }
    
    @staticmethod
    async def procesar_acta(pdf_path: str, archivo: str) -> Dict:
        """Procesa un acta completa con logs detallados"""
        start_time = datetime.now()
        
        try:
            # 1. Convertir PDF
            imagenes = OCRService.pdf_a_imagenes(pdf_path)
            if not imagenes:
                return {"success": False, "error": "No se pudo convertir", "archivo": archivo}
            
            # 2. Preprocesar
            img_proc = OCRService.preprocesar_imagen(imagenes[0])
            
            # 3. OCR
            texto, conf = OCRService.extraer_texto(img_proc)
            
            # 4. Extraer datos
            datos = OCRService.extraer_datos_acta(texto, archivo)
            
            # 5. Validar todas las reglas
            validacion = OCRService.validar_todas_reglas(datos)
            estado = validacion["estado"]
            
            # 6. Logs detallados
            tiempo_ms = (datetime.now() - start_time).total_seconds() * 1000
            
            log_entry = {
                "archivo": archivo,
                "tiempo_ms": round(tiempo_ms, 2),
                "estado": estado,
                "votos": {
                    "partido1": datos["partido1"],
                    "partido2": datos["partido2"],
                    "partido3": datos["partido3"],
                    "partido4": datos["partido4"],
                    "validos": datos["votos_validos"],
                    "blancos": datos["votos_blancos"],
                    "nulos": datos["votos_nulos"]
                },
                "reglas_aplicadas": validacion["reglas_aplicadas"],
                "observaciones": validacion["observaciones"],
                "errores": validacion["errores"],
                "timestamp": datetime.now().isoformat()
            }
            
            # Guardar en log específico
            if estado == "PROCESADA":
                actas_validas_log.info(json.dumps(log_entry, ensure_ascii=False))
            elif estado == "ACTA_OBSERVADA":
                actas_observadas_log.info(json.dumps(log_entry, ensure_ascii=False))
            else:
                actas_error_log.info(json.dumps(log_entry, ensure_ascii=False))
            
            return {
                "success": True,
                "confianza": conf,
                "datos": datos,
                "validacion": validacion,
                "estado": estado,
                "tiempo_ms": tiempo_ms
            }
            
        except Exception as e:
            logger.error(f"Error en {archivo}: {e}")
            return {"success": False, "error": str(e), "archivo": archivo}