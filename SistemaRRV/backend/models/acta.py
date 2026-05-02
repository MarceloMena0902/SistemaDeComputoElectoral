from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, List
from enum import Enum

class FuenteEnum(str, Enum):
    FOTO = "FOTO"
    SMS = "SMS"
    WEB = "WEB"
    MOBILE = "MOBILE"

class EstadoActaEnum(str, Enum):
    PENDIENTE = "PENDIENTE"
    PROCESADA = "PROCESADA"
    ERROR_OCR = "ERROR_OCR"
    ERROR_VALIDACION = "ERROR_VALIDACION"
    DUPLICADA = "DUPLICADA"
    RECHAZADA = "RECHAZADA"
    REVISION_HUMANA = "REVISION_HUMANA"

class Territorio(BaseModel):
    codigo_territorial: str
    departamento: str
    provincia: str
    municipio: str

class Recinto(BaseModel):
    recinto_id: str
    nombre_recinto: str
    direccion: Optional[str] = None

class Mesa(BaseModel):
    nro_mesa: int
    nro_votantes: Optional[int] = None
    cantidad_habilitados: Optional[int] = None

class Votos(BaseModel):
    partido1: int = 0
    partido2: int = 0
    partido3: int = 0
    partido4: int = 0
    partido5: Optional[int] = 0
    partido6: Optional[int] = 0
    votos_validos: int = 0
    votos_blancos: int = 0
    votos_nulos: int = 0
    papeletas_no_usadas: int = 0
    total_votos: int = 0

class Recepcion(BaseModel):
    tipo: str
    numero_origen: Optional[str] = None
    mensaje_original: Optional[str] = None
    url_imagen: Optional[str] = None
    ip_origen: Optional[str] = None

class OCRData(BaseModel):
    aplica: bool = False
    confianza: float = 0.0
    texto_extraido: Optional[str] = None
    requiere_revision: bool = False
    errores_deteccion: List[str] = []
    tiempo_procesamiento_ms: Optional[int] = None

class Validaciones(BaseModel):
    regla1_cumple: bool = False
    regla2_cumple: bool = False
    regla3_cumple: bool = False
    mensajes_error: List[str] = []

class ActaRRV(BaseModel):
    id: Optional[str] = None
    nro_acta: str
    codigo_mesa: str
    fuente: FuenteEnum
    estado: EstadoActaEnum = EstadoActaEnum.PENDIENTE
    fecha_recepcion: datetime = Field(default_factory=datetime.now)
    fecha_procesamiento: Optional[datetime] = None
    
    territorio: Territorio
    recinto: Recinto
    mesa: Mesa
    votos: Votos
    recepcion: Optional[Recepcion] = None
    ocr: Optional[OCRData] = None
    validaciones: Optional[Validaciones] = None
    hash_duplicidad: Optional[str] = None
    intentos_procesamiento: int = 0