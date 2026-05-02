﻿# main.py - Versión definitiva corregida
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import MongoClient
from datetime import datetime
import logging
import hashlib
import os
import re
import time
import uuid
import base64
import io
from bson import ObjectId
from typing import Optional
from pydantic import BaseModel
from PIL import Image

try:
    from twilio.twiml.messaging_response import MessagingResponse
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False
    print("⚠️ Twilio no está instalado.")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from services.ocr_service import OCRService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Sistema RRV - Recuento Rápido de Votos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# CONFIGURACIÓN
# ============================================================
DATABASE_NAME = "computo_electoral_rrv"
UPLOAD_DIR = "uploads/actas"
PDF_OUTPUT_DIR = "pdfs_entrada"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PDF_OUTPUT_DIR, exist_ok=True)

client = None
db = None

# ============================================================
# NOMBRES DE PARTIDOS
# ============================================================
PARTIDOS = {
    "p1": {"nombre": "Daenerys Targaryen", "color": "#DC2626", "sigla": "DT"},
    "p2": {"nombre": "Sansa Stark", "color": "#7C3AED", "sigla": "SS"},
    "p3": {"nombre": "Robert Baratheon", "color": "#F59E0B", "sigla": "RB"},
    "p4": {"nombre": "Tyrion Lannister", "color": "#10B981", "sigla": "TL"},
}

TOKENS_RECINTOS = {
    "1020100041": "abc123",
    "1010200001": "xyz789",
    "1030100001": "def456",
}

NUMEROS_AUTORIZADOS = [
    "+59171234567",
    "+59177654321",
    "+59168486893",
    "+59168449854",
]

# ============================================================
# FUNCIONES
# ============================================================
def conectar_mongo(max_retries=5, retry_delay=2):
    global client, db
    puertos = [27017, 27018]
    
    for intento in range(max_retries):
        for puerto in puertos:
            try:
                logger.info(f"Intentando conexión a localhost:{puerto} (intento {intento+1})")
                temp_client = MongoClient("localhost", puerto, directConnection=True, serverSelectionTimeoutMS=5000)
                temp_client.admin.command('ping')
                client = temp_client
                db = client[DATABASE_NAME]
                
                if "actas_rrv" not in db.list_collection_names():
                    db.create_collection("actas_rrv")
                if "sms_recibidos" not in db.list_collection_names():
                    db.create_collection("sms_recibidos")
                
                try:
                    db.actas_rrv.drop_index("nombre_1")
                except:
                    pass
                
                logger.info(f"✅ Conectado a MongoDB en puerto {puerto}")
                return True
            except Exception as e:
                logger.warning(f"Puerto {puerto} falló: {e}")
                continue
        if intento < max_retries - 1:
            logger.info(f"Reintentando en {retry_delay} segundos...")
            time.sleep(retry_delay)
    
    logger.error("❌ No se pudo conectar a MongoDB")
    return False


def extraer_votos_de_acta(acta: dict) -> dict:
    if "votos" in acta and acta["votos"]:
        v = acta["votos"]
        return {
            "partido1": v.get("partido1", 0) or 0,
            "partido2": v.get("partido2", 0) or 0,
            "partido3": v.get("partido3", 0) or 0,
            "partido4": v.get("partido4", 0) or 0,
            "votos_validos": v.get("votos_validos", 0) or 0,
            "votos_blancos": v.get("votos_blancos", 0) or 0,
            "votos_nulos": v.get("votos_nulos", 0) or 0,
        }
    
    if "datos" in acta and acta["datos"]:
        d = acta["datos"]
        p1 = d.get("partido1", 0) or d.get("p1", 0) or d.get("P1", 0) or d.get("votos_partido1", 0) or 0
        p2 = d.get("partido2", 0) or d.get("p2", 0) or d.get("P2", 0) or d.get("votos_partido2", 0) or 0
        p3 = d.get("partido3", 0) or d.get("p3", 0) or d.get("P3", 0) or d.get("votos_partido3", 0) or 0
        p4 = d.get("partido4", 0) or d.get("p4", 0) or d.get("P4", 0) or d.get("votos_partido4", 0) or 0
        uv = d.get("votos_validos", 0) or d.get("uv", 0) or d.get("UV", 0) or d.get("validos", 0) or 0
        vb = d.get("votos_blancos", 0) or d.get("vb", 0) or d.get("VB", 0) or d.get("blancos", 0) or 0
        vn = d.get("votos_nulos", 0) or d.get("vn", 0) or d.get("VN", 0) or d.get("nulos", 0) or 0
        
        return {
            "partido1": int(p1) if p1 else 0,
            "partido2": int(p2) if p2 else 0,
            "partido3": int(p3) if p3 else 0,
            "partido4": int(p4) if p4 else 0,
            "votos_validos": int(uv) if uv else 0,
            "votos_blancos": int(vb) if vb else 0,
            "votos_nulos": int(vn) if vn else 0,
        }
    
    return {"partido1": 0, "partido2": 0, "partido3": 0, "partido4": 0, "votos_validos": 0, "votos_blancos": 0, "votos_nulos": 0}


def parsear_sms(mensaje: str):
    if not mensaje:
        return None
    mensaje = mensaje.strip()
    
    patron = r'RECINTO:(\d+)\s+MESA:(\d+)\s+P1:(\d+)\s+P2:(\d+)\s+P3:(\d+)\s+P4:(\d+)\s+UV:(\d+)\s+VB:(\d+)\s+VN:(\d+)\s+VNU:(\d+)\s+TOKEN:(\w+)'
    match = re.search(patron, mensaje)
    
    if match:
        return {
            "recinto_id": match.group(1),
            "mesa": int(match.group(2)),
            "p1": int(match.group(3)),
            "p2": int(match.group(4)),
            "p3": int(match.group(5)),
            "p4": int(match.group(6)),
            "uv": int(match.group(7)),
            "vb": int(match.group(8)),
            "vn": int(match.group(9)),
            "vnu": int(match.group(10)),
            "token": match.group(11)
        }
    
    patron2 = r'(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\w+)'
    match2 = re.search(patron2, mensaje)
    
    if match2:
        return {
            "recinto_id": match2.group(1),
            "mesa": int(match2.group(2)),
            "p1": int(match2.group(3)),
            "p2": int(match2.group(4)),
            "p3": int(match2.group(5)),
            "p4": int(match2.group(6)),
            "uv": int(match2.group(7)),
            "vb": int(match2.group(8)),
            "vn": int(match2.group(9)),
            "vnu": int(match2.group(10)),
            "token": match2.group(11)
        }
    
    return None


def validar_token(recinto_id: str, token: str) -> bool:
    if not recinto_id or not token:
        return False
    return TOKENS_RECINTOS.get(recinto_id) == token


def validar_reglas_sms(datos: dict) -> list:
    errores = []
    if not datos:
        return ["Datos inválidos"]
    suma_partidos = datos.get("p1", 0) + datos.get("p2", 0) + datos.get("p3", 0) + datos.get("p4", 0)
    if datos.get("uv", 0) != suma_partidos + datos.get("vb", 0):
        errores.append(f"UV incorrecto: {datos.get('uv')} != {suma_partidos} + {datos.get('vb')}")
    return errores


def numero_autorizado(numero: str) -> bool:
    numero = numero.strip()
    if numero in NUMEROS_AUTORIZADOS:
        return True
    for autorizado in NUMEROS_AUTORIZADOS:
        if autorizado.replace('+', '') == numero.replace('+', ''):
            return True
    return False


# ============================================================
# EVENTOS
# ============================================================
@app.on_event("startup")
async def startup():
    logger.info("🚀 Iniciando Sistema RRV...")
    conectar_mongo()
    logger.info(f"📱 Números autorizados: {NUMEROS_AUTORIZADOS}")
    logger.info(f"🗳️ Partidos: {[p['nombre'] for p in PARTIDOS.values()]}")


@app.on_event("shutdown")
async def shutdown():
    global client
    if client is not None:
        client.close()
        logger.info("🔌 Desconectado de MongoDB")


# ============================================================
# MODELOS
# ============================================================
class SMSRequest(BaseModel):
    from_number: str
    body: str

class FotoUpload(BaseModel):
    imagen_base64: str
    nombre: Optional[str] = None


# ============================================================
# ENDPOINTS SMS
# ============================================================
@app.post("/api/sms")
async def recibir_sms(request: Request):
    logger.info("=" * 60)
    logger.info("📱 RECIBIENDO SMS DESDE TWILIO...")
    logger.info("=" * 60)
    
    try:
        form_data = await request.form()
        from_number = form_data.get("From", "").strip()
        body = form_data.get("Body", "").strip()
        message_sid = form_data.get("MessageSid", "").strip()
        
        logger.info(f"   De: {from_number}")
        logger.info(f"   Body: {body}")
        
        if not numero_autorizado(from_number):
            logger.warning(f"❌ Número no autorizado: {from_number}")
            if TWILIO_AVAILABLE:
                resp = MessagingResponse()
                resp.message("Numero no autorizado.")
                return Response(content=str(resp), media_type="application/xml")
            return JSONResponse(content={"error": "Número no autorizado"}, status_code=403)
        
        if db is not None and message_sid:
            existe = db.sms_recibidos.find_one({"message_sid": message_sid})
            if existe:
                return JSONResponse(content={"message": "Duplicado"}, status_code=200)
        
        datos_sms = parsear_sms(body)
        if not datos_sms:
            logger.error(f"❌ Formato inválido: '{body}'")
            if TWILIO_AVAILABLE:
                resp = MessagingResponse()
                resp.message("Formato invalido. Use: RECINTO:XXX MESA:X P1:X P2:X P3:X P4:X UV:X VB:X VN:X VNU:X TOKEN:XXX")
                return Response(content=str(resp), media_type="application/xml")
            return JSONResponse(content={"error": "Formato inválido"}, status_code=400)
        
        if not validar_token(datos_sms["recinto_id"], datos_sms["token"]):
            if TWILIO_AVAILABLE:
                resp = MessagingResponse()
                resp.message(f"Token invalido para recinto {datos_sms['recinto_id']}")
                return Response(content=str(resp), media_type="application/xml")
            return JSONResponse(content={"error": "Token inválido"}, status_code=403)
        
        errores = validar_reglas_sms(datos_sms)
        
        acta_id = None
        if db is not None:
            acta_id = f"SMS_{datos_sms['recinto_id']}_{datos_sms['mesa']}_{int(time.time())}"
            
            acta = {
                "nombre": acta_id,
                "source": "SMS",
                "from_number": from_number,
                "message_sid": message_sid,
                "recinto_id": datos_sms["recinto_id"],
                "nro_mesa": datos_sms["mesa"],
                "votos": {
                    "partido1": datos_sms["p1"],
                    "partido2": datos_sms["p2"],
                    "partido3": datos_sms["p3"],
                    "partido4": datos_sms["p4"],
                    "votos_validos": datos_sms["uv"],
                    "votos_blancos": datos_sms["vb"],
                    "votos_nulos": datos_sms["vn"],
                    "papeletas_no_usadas": datos_sms["vnu"]
                },
                "estado": "ACTA_OBSERVADA" if errores else "PROCESADA",
                "errores_validacion": errores,
                "fecha_recepcion": datetime.now(),
                "raw_message": body
            }
            
            result = db.actas_rrv.insert_one(acta)
            logger.info(f"✅ Acta SMS guardada: {result.inserted_id}")
            
            db.sms_recibidos.insert_one({
                "message_sid": message_sid,
                "from_number": from_number,
                "body": body,
                "fecha_recepcion": datetime.now(),
                "procesado": True,
                "acta_id": str(result.inserted_id),
                "recinto_id": datos_sms["recinto_id"]
            })
        
        if TWILIO_AVAILABLE:
            resp = MessagingResponse()
            resp.message(f"Acta procesada! ID: {acta_id}" if not errores else f"Observaciones: {'; '.join(errores)}")
            return Response(content=str(resp), media_type="application/xml")
        
        return JSONResponse(content={"message": "OK", "acta_id": acta_id}, status_code=200)
        
    except Exception as e:
        logger.error(f"❌ ERROR: {str(e)}")
        logger.exception("Detalle completo:")
        return JSONResponse(content={"error": str(e)}, status_code=500)


@app.get("/api/sms")
async def api_sms_info():
    return {
        "message": "POST para recibir SMS de Twilio",
        "numeros_autorizados": NUMEROS_AUTORIZADOS,
        "formato": "RECINTO:1020100041 MESA:3 P1:10 P2:4 P3:9 P4:28 UV:53 VB:2 VN:3 VNU:41 TOKEN:abc123"
    }


@app.post("/api/sms/test")
async def test_sms(request: SMSRequest):
    global db
    logger.info(f"📱 SMS test: {request.from_number}")
    
    datos_sms = parsear_sms(request.body)
    if not datos_sms:
        return {"success": False, "error": "Formato inválido"}
    
    if not validar_token(datos_sms["recinto_id"], datos_sms["token"]):
        return {"success": False, "error": "Token inválido"}
    
    errores = validar_reglas_sms(datos_sms)
    
    if db is not None:
        acta_id = f"SMS_TEST_{datos_sms['recinto_id']}_{datos_sms['mesa']}_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        acta = {
            "nombre": acta_id,
            "source": "SMS_TEST",
            "from_number": request.from_number,
            "recinto_id": datos_sms["recinto_id"],
            "nro_mesa": datos_sms["mesa"],
            "votos": {
                "partido1": datos_sms["p1"],
                "partido2": datos_sms["p2"],
                "partido3": datos_sms["p3"],
                "partido4": datos_sms["p4"],
                "votos_validos": datos_sms["uv"],
                "votos_blancos": datos_sms["vb"],
                "votos_nulos": datos_sms["vn"],
                "papeletas_no_usadas": datos_sms["vnu"]
            },
            "estado": "ACTA_OBSERVADA" if errores else "PROCESADA",
            "errores_validacion": errores,
            "fecha_recepcion": datetime.now(),
            "raw_message": request.body
        }
        
        try:
            result = db.actas_rrv.insert_one(acta)
            logger.info(f"✅ Acta SMS test guardada: {result.inserted_id}")
            
            db.sms_recibidos.insert_one({
                "from_number": request.from_number,
                "body": request.body,
                "fecha_recepcion": datetime.now(),
                "procesado": True,
                "acta_id": str(result.inserted_id),
                "recinto_id": datos_sms["recinto_id"]
            })
            
            return {"success": True, "acta_id": str(result.inserted_id), "errores": errores}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    return {"success": True, "errores": errores, "warning": "MongoDB no disponible"}


@app.get("/sms-recibidos")
async def listar_sms():
    if db is None:
        return {"error": "MongoDB no conectado", "sms": [], "total": 0}
    
    sms = []
    try:
        cursor = db.sms_recibidos.find().sort("fecha_recepcion", -1).limit(50)
        for s in cursor:
            s["_id"] = str(s["_id"])
            if "fecha_recepcion" in s and hasattr(s["fecha_recepcion"], 'isoformat'):
                s["fecha_recepcion"] = s["fecha_recepcion"].isoformat()
            sms.append(s)
    except Exception as e:
        logger.error(f"Error listando SMS: {e}")
    
    return {"total": len(sms), "sms": sms}


# ============================================================
# ENDPOINT PARA SUBIR FOTOS DESDE MÓVIL Y CONVERTIR A PDF
# ============================================================
@app.post("/api/subir-foto")
async def subir_foto(foto: FotoUpload):
    """
    Recibe una foto en base64 desde el móvil,
    la convierte a PDF y la guarda en pdfs_entrada/
    """
    try:
        if "base64," in foto.imagen_base64:
            imagen_data = foto.imagen_base64.split("base64,")[1]
        else:
            imagen_data = foto.imagen_base64
        
        imagen_bytes = base64.b64decode(imagen_data)
        imagen = Image.open(io.BytesIO(imagen_bytes))
        
        if imagen.mode == 'RGBA':
            fondo = Image.new('RGB', imagen.size, (255, 255, 255))
            fondo.paste(imagen, mask=imagen.split()[3])
            imagen = fondo
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        nombre_base = foto.nombre or "foto_recinto"
        pdf_filename = f"{timestamp}_{nombre_base}.pdf"
        pdf_path = os.path.join(PDF_OUTPUT_DIR, pdf_filename)
        
        imagen.save(pdf_path, "PDF", resolution=100.0)
        
        jpg_filename = f"{timestamp}_{nombre_base}.jpg"
        jpg_path = os.path.join(PDF_OUTPUT_DIR, jpg_filename)
        imagen.save(jpg_path, "JPEG", quality=85)
        
        logger.info(f"✅ Foto guardada como PDF: {pdf_path}")
        
        return {
            "success": True,
            "pdf_path": pdf_path,
            "pdf_filename": pdf_filename,
            "jpg_filename": jpg_filename
        }
        
    except Exception as e:
        logger.error(f"❌ Error procesando foto: {e}")
        return {"success": False, "error": str(e)}


@app.post("/api/subir-foto-y-procesar")
async def subir_foto_y_procesar(background_tasks: BackgroundTasks, foto: FotoUpload):
    """
    Recibe foto, convierte a PDF, guarda y ENCOLA para procesar OCR
    """
    try:
        if "base64," in foto.imagen_base64:
            imagen_data = foto.imagen_base64.split("base64,")[1]
        else:
            imagen_data = foto.imagen_base64
        
        imagen_bytes = base64.b64decode(imagen_data)
        imagen = Image.open(io.BytesIO(imagen_bytes))
        
        if imagen.mode == 'RGBA':
            fondo = Image.new('RGB', imagen.size, (255, 255, 255))
            fondo.paste(imagen, mask=imagen.split()[3])
            imagen = fondo
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        nombre_base = foto.nombre or "foto_recinto"
        pdf_filename = f"{timestamp}_{nombre_base}.pdf"
        pdf_path = os.path.join(PDF_OUTPUT_DIR, pdf_filename)
        
        imagen.save(pdf_path, "PDF", resolution=100.0)
        
        if db is not None:
            hash_file = hashlib.sha256(imagen_bytes).hexdigest()
            
            existe = db.actas_rrv.find_one({"hash": hash_file})
            if existe:
                return {"success": False, "error": "DUPLICADA", "acta_id": str(existe["_id"])}
            
            acta = {
                "nombre": pdf_filename,
                "ruta": pdf_path,
                "hash": hash_file,
                "estado": "PROCESANDO_OCR",
                "fecha_recepcion": datetime.now(),
                "intentos": 0,
                "source": "MOVIL"
            }
            
            result = db.actas_rrv.insert_one(acta)
            acta_id = str(result.inserted_id)
            
            background_tasks.add_task(procesar_ocr_background, acta_id, pdf_path)
            
            logger.info(f"✅ Acta móvil guardada: {acta_id}")
            
            return {
                "success": True,
                "acta_id": acta_id,
                "pdf_filename": pdf_filename,
                "estado": "PROCESANDO_OCR"
            }
        
        return {"success": True, "pdf_filename": pdf_filename}
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        return {"success": False, "error": str(e)}


# ============================================================
# ENDPOINTS PRINCIPALES
# ============================================================
@app.get("/")
async def root():
    return {
        "message": "Sistema RRV - Recuento Rápido de Votos",
        "status": "running",
        "version": "1.0.0",
        "partidos": {k: v["nombre"] for k, v in PARTIDOS.items()},
        "numeros_autorizados": len(NUMEROS_AUTORIZADOS)
    }


@app.get("/health")
async def health():
    mongo_status = "disconnected"
    if client is not None:
        try:
            client.admin.command('ping')
            mongo_status = "connected"
        except:
            mongo_status = "error"
    return {
        "status": "ok" if mongo_status == "connected" else "degraded",
        "mongodb": mongo_status,
        "twilio": "available" if TWILIO_AVAILABLE else "not_installed"
    }


@app.get("/partidos")
async def get_partidos():
    return PARTIDOS


@app.post("/recuento-rapido")
async def recuento_rapido(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    logger.info(f"📄 Recibiendo: {file.filename}")
    
    if client is None or db is None:
        if not conectar_mongo():
            raise HTTPException(500, "MongoDB no conectado")
    
    if not file.filename.lower().endswith(('.pdf', '.jpg', '.jpeg', '.png')):
        raise HTTPException(400, "Formato no soportado. Use PDF, JPG o PNG")
    
    try:
        content = await file.read()
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        hash_file = hashlib.sha256(content).hexdigest()
        
        existe = db.actas_rrv.find_one({"hash": hash_file})
        if existe:
            return {"success": False, "error": "DUPLICADA", "acta_id": str(existe["_id"])}
        
        acta = {
            "nombre": file.filename,
            "ruta": file_path,
            "hash": hash_file,
            "estado": "PROCESANDO_OCR",
            "fecha_recepcion": datetime.now(),
            "intentos": 0,
            "source": "UPLOAD"
        }
        
        result = db.actas_rrv.insert_one(acta)
        acta_id = str(result.inserted_id)
        logger.info(f"✅ Acta guardada ID: {acta_id}")
        
        background_tasks.add_task(procesar_ocr_background, acta_id, file_path)
        
        return {"success": True, "acta_id": acta_id, "estado": "PROCESANDO_OCR"}
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        raise HTTPException(500, str(e))


async def procesar_ocr_background(acta_id: str, file_path: str):
    logger.info(f"🔍 Procesando OCR: {acta_id}")
    try:
        ocr_result = await OCRService.procesar_acta(file_path)
        if ocr_result.get("success"):
            db.actas_rrv.update_one(
                {"_id": ObjectId(acta_id)},
                {"$set": {
                    "estado": "PROCESADA",
                    "confianza": ocr_result.get("confianza", 0),
                    "datos": ocr_result.get("datos", {}),
                    "validacion": ocr_result.get("validacion", {}),
                    "fecha_procesamiento": datetime.now()
                }}
            )
            logger.info(f"✅ Acta {acta_id} procesada OK")
        else:
            db.actas_rrv.update_one(
                {"_id": ObjectId(acta_id)},
                {"$set": {"estado": "ERROR_OCR", "error": ocr_result.get("error")}}
            )
            logger.error(f"❌ Error OCR en acta {acta_id}")
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        db.actas_rrv.update_one(
            {"_id": ObjectId(acta_id)},
            {"$set": {"estado": "ERROR", "error": str(e)}}
        )


@app.get("/actas")
async def listar_actas(estado: Optional[str] = None, limit: int = 50, skip: int = 0):
    if client is None or db is None:
        return {"error": "MongoDB no conectado", "actas": [], "total": 0}
    
    query = {}
    if estado:
        query["estado"] = estado
    
    actas = []
    try:
        total = db.actas_rrv.count_documents(query)
        cursor = db.actas_rrv.find(query).sort("fecha_recepcion", -1).skip(skip).limit(limit)
        for a in cursor:
            a["_id"] = str(a["_id"])
            if "fecha_recepcion" in a and hasattr(a["fecha_recepcion"], 'isoformat'):
                a["fecha_recepcion"] = a["fecha_recepcion"].isoformat()
            if "fecha_procesamiento" in a and hasattr(a["fecha_procesamiento"], 'isoformat'):
                a["fecha_procesamiento"] = a["fecha_procesamiento"].isoformat()
            actas.append(a)
    except Exception as e:
        logger.error(f"Error listando actas: {e}")
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "actas": actas,
        "has_more": (skip + limit) < total
    }


@app.get("/metricas")
async def metricas():
    if client is None or db is None:
        return {"error": "MongoDB no conectado"}
    
    try:
        total = db.actas_rrv.count_documents({})
        procesadas = db.actas_rrv.count_documents({"estado": "PROCESADA"})
        pendientes = db.actas_rrv.count_documents({"estado": "PROCESANDO_OCR"})
        errores = db.actas_rrv.count_documents({"estado": {"$in": ["ERROR", "ERROR_OCR"]}})
        observadas = db.actas_rrv.count_documents({"estado": "ACTA_OBSERVADA"})
        anuladas = db.actas_rrv.count_documents({"estado": "ANULADA"})
        sms_total = db.sms_recibidos.count_documents({}) if db is not None else 0
        
        pipeline = [
            {"$match": {"estado": {"$in": ["PROCESADA", "ACTA_OBSERVADA"]}}},
            {"$group": {
                "_id": None,
                "total_p1": {"$sum": "$votos.partido1"},
                "total_p2": {"$sum": "$votos.partido2"},
                "total_p3": {"$sum": "$votos.partido3"},
                "total_p4": {"$sum": "$votos.partido4"},
                "total_validos": {"$sum": "$votos.votos_validos"},
                "total_blancos": {"$sum": "$votos.votos_blancos"},
                "total_nulos": {"$sum": "$votos.votos_nulos"},
            }}
        ]
        resultados_agregados = list(db.actas_rrv.aggregate(pipeline))
        
        votos = {"p1": 0, "p2": 0, "p3": 0, "p4": 0, "validos": 0, "blancos": 0, "nulos": 0}
        if resultados_agregados:
            r = resultados_agregados[0]
            votos = {
                "p1": r.get("total_p1", 0) or 0,
                "p2": r.get("total_p2", 0) or 0,
                "p3": r.get("total_p3", 0) or 0,
                "p4": r.get("total_p4", 0) or 0,
                "validos": r.get("total_validos", 0) or 0,
                "blancos": r.get("total_blancos", 0) or 0,
                "nulos": r.get("total_nulos", 0) or 0,
            }
        
        return {
            "total_actas": total,
            "procesadas": procesadas,
            "pendientes": pendientes,
            "errores": errores,
            "observadas": observadas,
            "anuladas": anuladas,
            "sms_recibidos": sms_total,
            "votos": votos,
            "partidos": PARTIDOS
        }
    except Exception as e:
        logger.error(f"Error en métricas: {e}")
        return {"error": str(e)}


@app.get("/resultados-nacionales")
async def resultados_nacionales():
    if client is None or db is None:
        return {"error": "MongoDB no conectado"}
    
    try:
        actas = list(db.actas_rrv.find(
            {"estado": {"$in": ["PROCESADA", "ACTA_OBSERVADA"]}}
        ))
        
        logger.info(f"📊 Calculando resultados de {len(actas)} actas")
        
        totales = {"p1": 0, "p2": 0, "p3": 0, "p4": 0, "validos": 0, "blancos": 0, "nulos": 0}
        actas_con_votos = 0
        
        for acta in actas:
            votos = extraer_votos_de_acta(acta)
            
            if votos["partido1"] > 0 or votos["partido2"] > 0 or votos["partido3"] > 0 or votos["partido4"] > 0:
                actas_con_votos += 1
                totales["p1"] += votos["partido1"]
                totales["p2"] += votos["partido2"]
                totales["p3"] += votos["partido3"]
                totales["p4"] += votos["partido4"]
                totales["validos"] += votos["votos_validos"]
                totales["blancos"] += votos["votos_blancos"]
                totales["nulos"] += votos["votos_nulos"]
        
        logger.info(f"📊 Actas con votos: {actas_con_votos} de {len(actas)}")
        logger.info(f"📊 Totales: P1={totales['p1']}, P2={totales['p2']}, P3={totales['p3']}, P4={totales['p4']}")
        
        total_validos = totales["validos"] or 1
        
        return {
            "partidos": PARTIDOS,
            "resultados": {
                "p1": totales["p1"],
                "p2": totales["p2"],
                "p3": totales["p3"],
                "p4": totales["p4"],
            },
            "porcentajes": {
                "p1": round((totales["p1"] / total_validos) * 100, 1) if total_validos > 0 else 0,
                "p2": round((totales["p2"] / total_validos) * 100, 1) if total_validos > 0 else 0,
                "p3": round((totales["p3"] / total_validos) * 100, 1) if total_validos > 0 else 0,
                "p4": round((totales["p4"] / total_validos) * 100, 1) if total_validos > 0 else 0,
            },
            "totales": {
                "validos": totales["validos"],
                "blancos": totales["blancos"],
                "nulos": totales["nulos"],
            },
            "total_actas": len(actas),
            "actas_con_votos": actas_con_votos
        }
    except Exception as e:
        logger.error(f"❌ Error en resultados: {e}")
        logger.exception("Detalle:")
        return {"error": str(e)}


@app.get("/diagnostico")
async def diagnostico():
    if db is None:
        return {"error": "MongoDB no conectado"}
    
    try:
        total = db.actas_rrv.count_documents({})
        procesadas = db.actas_rrv.count_documents({"estado": "PROCESADA"})
        con_votos = db.actas_rrv.count_documents({"votos": {"$exists": True}})
        con_datos = db.actas_rrv.count_documents({"datos": {"$exists": True}})
        
        muestra = list(db.actas_rrv.find().limit(3))
        
        resultado = []
        for acta in muestra:
            acta_id = str(acta["_id"])
            votos_extraidos = extraer_votos_de_acta(acta)
            resultado.append({
                "id": acta_id[-10:],
                "nombre": acta.get("nombre"),
                "source": acta.get("source"),
                "estado": acta.get("estado"),
                "tiene_votos": "votos" in acta,
                "tiene_datos": "datos" in acta,
                "votos_extraidos": votos_extraidos,
                "total_keys": len(acta.keys())
            })
        
        return {
            "total_actas": total,
            "procesadas": procesadas,
            "con_campo_votos": con_votos,
            "con_campo_datos": con_datos,
            "partidos_configurados": {k: v["nombre"] for k, v in PARTIDOS.items()},
            "muestra": resultado
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/admin/agregar-numero")
async def agregar_numero(numero: str):
    global NUMEROS_AUTORIZADOS
    numero = numero.strip()
    if numero and numero not in NUMEROS_AUTORIZADOS:
        NUMEROS_AUTORIZADOS.append(numero)
        logger.info(f"✅ Número agregado: {numero}")
        return {"success": True, "numero": numero, "total": len(NUMEROS_AUTORIZADOS)}
    return {"success": False, "message": "Número ya existe o es inválido"}


@app.get("/admin/numeros-autorizados")
async def listar_numeros():
    return {"total": len(NUMEROS_AUTORIZADOS), "numeros": NUMEROS_AUTORIZADOS}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)