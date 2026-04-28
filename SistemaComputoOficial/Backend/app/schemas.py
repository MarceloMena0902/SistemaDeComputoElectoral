"""
Schemas Pydantic v2 para validacion de requests y responses.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator


# ─── REQUEST: Registro de Acta ────────────────────────────────────
class ActaRegistroRequest(BaseModel):
    nro_acta:       str  = Field(..., min_length=1, max_length=50,  example="ACTA-10101001001")
    codigo_mesa:    int  = Field(..., gt=0,                          example=10101001001)
    nro_mesa:       int  = Field(..., gt=0,                          example=1)
    nro_votantes:   int  = Field(..., ge=0,                          example=339)
    codigo_territorial: int = Field(..., gt=0,                       example=10101)
    partido1:       int  = Field(..., ge=0, example=10)
    partido2:       int  = Field(..., ge=0, example=4)
    partido3:       int  = Field(..., ge=0, example=9)
    partido4:       int  = Field(..., ge=0, example=28)
    votos_blancos:  int  = Field(..., ge=0, example=14)
    votos_nulos:    int  = Field(..., ge=0, example=45)
    registrado_por: int  = Field(default=1, ge=1)
    observacion: Optional[str] = None

    @model_validator(mode="after")
    def validate_aritmetica(self) -> "ActaRegistroRequest":
        votos_validos = self.partido1 + self.partido2 + self.partido3 + self.partido4
        total_votos   = votos_validos + self.votos_blancos + self.votos_nulos

        if total_votos > self.nro_votantes:
            raise ValueError(
                f"total_votos ({total_votos}) supera nro_votantes ({self.nro_votantes})"
            )
        return self


# ─── RESPONSE: Acta registrada ────────────────────────────────────
class ActaRegistroResponse(BaseModel):
    id_acta:    int
    nro_acta:   str
    estado:     str
    id_voto:    int
    votos_validos: int
    total_votos:   int
    idempotente:   bool = False
    message:       str


# ─── RESPONSE: Resultados del Dashboard ──────────────────────────
class ResultadosDashboard(BaseModel):
    total_actas_procesadas: int
    total_mesas:            int
    porcentaje_avance:      float
    total_partido1:         int
    total_partido2:         int
    total_partido3:         int
    total_partido4:         int
    total_votos_validos:    int
    total_votos_blancos:    int
    total_votos_nulos:      int
    total_votos:            int


# ─── RESPONSE: Progreso geográfico ──────────────────────────────
class ProgresoGeo(BaseModel):
    codigo_territorial: int
    departamento:       str
    municipio:          str
    provincia:          str
    total_mesas:        int
    mesas_procesadas:   int
    porcentaje_avance:  float


# ─── RESPONSE: Log de auditoría ──────────────────────────────────
class AuditoriaLog(BaseModel):
    id_auditoria:     int
    id_voto:          Optional[int]
    nombre_usuario:   Optional[str]
    accion:           str
    campo_modificado: Optional[str]
    valor_anterior:   Optional[str]
    valor_nuevo:      Optional[str]
    detalle:          Optional[str]
    fecha_accion:     datetime

    model_config = {"from_attributes": True}


# ─── RESPONSE: Fallo de BD ───────────────────────────────────────
class FalloDBResponse(BaseModel):
    id_fallo:         int
    nodo:             str
    tipo_fallo:       Optional[str]
    detalle:          Optional[str]
    fecha_fallo:      datetime
    resuelto:         bool
    fecha_resolucion: Optional[datetime]

    model_config = {"from_attributes": True}


# ─── REQUEST: Registro de fallo ──────────────────────────────────
class FalloDBRequest(BaseModel):
    nodo:       str = Field(..., min_length=1, max_length=100)
    tipo_fallo: Optional[str] = None
    detalle:    Optional[str] = None
