"""
Schemas Pydantic v2 para validacion de requests y responses.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator


# ─── Payload anidado (frontend y automatización) ──────────────────
class VotosPayload(BaseModel):
    partido1:               int = Field(..., ge=0)
    partido2:               int = Field(..., ge=0)
    partido3:               int = Field(..., ge=0)
    partido4:               int = Field(..., ge=0)
    votos_blancos:          int = Field(..., ge=0)
    votos_nulos:            int = Field(..., ge=0)
    votos_validos:          int = Field(..., ge=0)
    votos_validos_calculados: int = Field(default=0, ge=0)
    total_votos:            int = Field(..., ge=0)


class AperturaCierrePayload(BaseModel):
    hora:    int = Field(default=8,  ge=0, le=23)
    minutos: int = Field(default=0,  ge=0, le=59)


class ActaOficialPayload(BaseModel):
    """Payload completo enviado por el formulario frontend y la automatización."""
    nro_acta:               str                  = Field(..., min_length=1)
    codigo_territorial:     int                  = Field(default=0, ge=0)
    codigo_recinto:         str                  = Field(default="")
    codigo_mesa:            int                  = Field(..., gt=0)
    nro_mesa:               int                  = Field(..., gt=0)
    nro_mesa_desde_acta:    int                  = Field(default=0, ge=0)
    nro_votantes:           int                  = Field(..., ge=0)
    papeletas_anfora:       int                  = Field(default=0, ge=0)
    papeletas_no_utilizadas: int                 = Field(default=0, ge=0)
    votos:                  VotosPayload
    registrado_por:         int                  = Field(default=1, ge=1)
    transcripcion:          str                  = Field(default="")
    tipo_observacion:       str                  = Field(default="SIN_OBSERVACION")
    requiere_revision_humana: bool               = Field(default=False)
    estado_acta:            str                  = Field(default="VALIDA")
    apertura:               AperturaCierrePayload = Field(default_factory=AperturaCierrePayload)
    cierre:                 AperturaCierrePayload = Field(default_factory=lambda: AperturaCierrePayload(hora=16))
    origen:                 str                  = Field(default="FORMULARIO_OFICIAL_FRONTEND")


# ─── REQUEST plano (compatibilidad interna / tests) ───────────────
class ActaRegistroRequest(BaseModel):
    nro_acta:           str = Field(..., min_length=1, max_length=50, example="ACTA-10101001001")
    codigo_mesa:        int = Field(..., gt=0,                         example=10101001001)
    nro_mesa:           int = Field(..., gt=0,                         example=1)
    nro_votantes:       int = Field(..., ge=0,                         example=339)
    codigo_territorial: int = Field(..., gt=0,                         example=10101)
    partido1:           int = Field(..., ge=0, example=10)
    partido2:           int = Field(..., ge=0, example=4)
    partido3:           int = Field(..., ge=0, example=9)
    partido4:           int = Field(..., ge=0, example=28)
    votos_blancos:      int = Field(..., ge=0, example=14)
    votos_nulos:        int = Field(..., ge=0, example=45)
    registrado_por:     int = Field(default=1, ge=1)
    observacion:        Optional[str] = None

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
    id_acta:      int
    nro_acta:     str
    estado:       str
    id_voto:      int
    votos_validos: int
    total_votos:   int
    idempotente:   bool = False
    message:       str
    warnings:      list[str] = Field(default_factory=list)


# ─── RESPONSE: Acta con datos geográficos (GET /api/oficial/actas) ─
class ActaListItem(BaseModel):
    id_acta:                 int
    nro_acta:                str
    codigo_mesa:             int
    nro_mesa:                int
    estado:                  str
    observacion:             Optional[str]
    origen:                  Optional[str]
    fecha_registro:          datetime
    departamento:            str
    municipio:               str
    provincia:               str
    recinto_nombre:          Optional[str]
    partido1:                int
    partido2:                int
    partido3:                int
    partido4:                int
    votos_validos:           int
    votos_blancos:           int
    votos_nulos:             int
    total_votos:             int
    papeletas_anfora:        int
    papeletas_no_utilizadas: int
    nro_votantes:            int

    model_config = {"from_attributes": True}


class ActaListResponse(BaseModel):
    items: list[ActaListItem]
    total: int
    page:  int
    limit: int


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


# ─── RESPONSE: Métricas completas del Dashboard ───────────────────
class EstadoConteo(BaseModel):
    estado: str
    total:  int

class ThroughputHora(BaseModel):
    hora:  str
    actas: int

class TopError(BaseModel):
    tipo:  str
    total: int

class MetricasDashboard(BaseModel):
    total_actas:            int
    por_estado:             list[EstadoConteo]
    total_partido1:         int
    total_partido2:         int
    total_partido3:         int
    total_partido4:         int
    total_votos_validos:    int
    total_votos_blancos:    int
    total_votos_nulos:      int
    total_votos:            int
    total_votantes:         int
    participacion_pct:      float
    throughput_por_hora:    list[ThroughputHora]
    top_errores:            list[TopError]
    porcentaje_avance:      float
    total_mesas:            int


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


# ─── Automatización ───────────────────────────────────────────────
class AutomatizacionIniciarResponse(BaseModel):
    run_id:  str
    mensaje: str


class ProgresoReciente(BaseModel):
    nro_acta:     str
    estado:       str
    nro_mesa:     int = 0
    p1:           int = 0
    p2:           int = 0
    p3:           int = 0
    p4:           int = 0
    votos_blancos: int = 0
    votos_nulos:  int = 0
    total_votos:  int = 0


class AutomatizacionProgresoResponse(BaseModel):
    run_id:     str
    estado:     str
    total:      int
    procesadas: int
    exitosas:   int
    errores:    int
    observadas: int
    duplicadas: int
    porcentaje: float
    recientes:  list[ProgresoReciente] = Field(default_factory=list)
