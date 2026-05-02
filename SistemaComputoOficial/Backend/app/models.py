"""
Modelos SQLAlchemy — mapeados al diagrama relacional del sistema.
"""
from datetime import datetime
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey,
    Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DistribucionTerritorial(Base):
    __tablename__ = "distribucion_territorial"

    codigo_territorial: Mapped[int] = mapped_column(Integer, primary_key=True)
    departamento:       Mapped[str] = mapped_column(String(100), nullable=False)
    municipio:          Mapped[str] = mapped_column(String(100), nullable=False)
    provincia:          Mapped[str] = mapped_column(String(100), nullable=False)

    recintos: Mapped[list["RecintoElectoral"]] = relationship(back_populates="territorio")
    mesas:    Mapped[list["MesaElectoral"]]    = relationship(back_populates="territorio")


class RecintoElectoral(Base):
    __tablename__ = "recinto_electoral"

    recinto_id:         Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo_territorial: Mapped[int] = mapped_column(Integer, ForeignKey("distribucion_territorial.codigo_territorial"), nullable=False)
    nombre_recinto:     Mapped[str] = mapped_column(String(200), nullable=False)
    direccion:          Mapped[str | None] = mapped_column(Text)
    cantidad_mesas:     Mapped[int] = mapped_column(Integer, default=0)

    territorio: Mapped["DistribucionTerritorial"] = relationship(back_populates="recintos")
    mesas:      Mapped[list["MesaElectoral"]]     = relationship(back_populates="recinto")


class MesaElectoral(Base):
    __tablename__ = "mesa_electoral"

    codigo_mesa:        Mapped[int] = mapped_column(BigInteger, primary_key=True)
    recinto_id:         Mapped[int] = mapped_column(BigInteger, ForeignKey("recinto_electoral.recinto_id"), nullable=False)
    codigo_territorial: Mapped[int] = mapped_column(Integer, ForeignKey("distribucion_territorial.codigo_territorial"), nullable=False)
    nro_mesa:           Mapped[int] = mapped_column(Integer, nullable=False)
    nro_votantes:       Mapped[int] = mapped_column(Integer, default=0)

    recinto:    Mapped["RecintoElectoral"]       = relationship(back_populates="mesas")
    territorio: Mapped["DistribucionTerritorial"] = relationship(back_populates="mesas")
    actas:      Mapped[list["ActaOficial"]]       = relationship(back_populates="mesa")


class Usuario(Base):
    __tablename__ = "usuario"

    id_usuario:     Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre_usuario: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    created_at:     Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    actas_registradas: Mapped[list["ActaOficial"]]   = relationship(foreign_keys="ActaOficial.registrado_por")
    votos_registrados: Mapped[list["VotoOficial"]]   = relationship(foreign_keys="VotoOficial.registrado_por")
    auditorias:        Mapped[list["AuditoriaVoto"]] = relationship(back_populates="usuario")


class ActaOficial(Base):
    __tablename__ = "acta_oficial"
    __table_args__ = (
        CheckConstraint(
            "estado IN ('PENDIENTE','PROCESADO','OBSERVADO','RECHAZADO',"
            "'VALIDA','OBSERVADA_PENDIENTE_REVISION','RECHAZADA','DUPLICADA')",
            name="chk_acta_estado",
        ),
    )

    id_acta:             Mapped[int]        = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nro_acta:            Mapped[str]        = mapped_column(String(50), nullable=False, unique=True)
    codigo_mesa:         Mapped[int]        = mapped_column(BigInteger, ForeignKey("mesa_electoral.codigo_mesa"), nullable=False)
    estado:              Mapped[str]        = mapped_column(String(50), nullable=False, default="PENDIENTE")
    observacion:         Mapped[str | None] = mapped_column(Text)
    origen:              Mapped[str | None] = mapped_column(String(100), default="MANUAL")
    fecha_registro:      Mapped[datetime]   = mapped_column(DateTime, server_default=func.now())
    fecha_actualizacion: Mapped[datetime]   = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    registrado_por:      Mapped[int | None] = mapped_column(Integer, ForeignKey("usuario.id_usuario"))
    actualizado_por:     Mapped[int | None] = mapped_column(Integer, ForeignKey("usuario.id_usuario"))

    mesa:  Mapped["MesaElectoral"]     = relationship(back_populates="actas")
    votos: Mapped[list["VotoOficial"]] = relationship(back_populates="acta")


class VotoOficial(Base):
    __tablename__ = "voto_oficial"
    __table_args__ = (
        CheckConstraint("votos_validos = partido1 + partido2 + partido3 + partido4", name="chk_votos_validos"),
        CheckConstraint("total_votos = votos_validos + votos_blancos + votos_nulos",  name="chk_total_votos"),
        CheckConstraint(
            "partido1 >= 0 AND partido2 >= 0 AND partido3 >= 0 AND partido4 >= 0 "
            "AND votos_blancos >= 0 AND votos_nulos >= 0",
            name="chk_non_negative",
        ),
    )

    id_voto:                 Mapped[int]        = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_acta:                 Mapped[int]        = mapped_column(BigInteger, ForeignKey("acta_oficial.id_acta"), nullable=False)
    partido1:                Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    partido2:                Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    partido3:                Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    partido4:                Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    votos_validos:           Mapped[int]        = mapped_column(Integer, nullable=False)
    votos_blancos:           Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    votos_nulos:             Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    total_votos:             Mapped[int]        = mapped_column(Integer, nullable=False)
    papeletas_anfora:        Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    papeletas_no_utilizadas: Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    registrado_por:          Mapped[int | None] = mapped_column(Integer, ForeignKey("usuario.id_usuario"))
    actualizado_por:         Mapped[int | None] = mapped_column(Integer, ForeignKey("usuario.id_usuario"))
    fecha_registro:          Mapped[datetime]   = mapped_column(DateTime, server_default=func.now())
    fecha_actualizacion:     Mapped[datetime]   = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    acta:       Mapped["ActaOficial"]          = relationship(back_populates="votos")
    auditorias: Mapped[list["AuditoriaVoto"]]  = relationship(back_populates="voto")


class AuditoriaVoto(Base):
    __tablename__ = "auditoria_voto"

    id_auditoria:     Mapped[int]        = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_voto:          Mapped[int | None] = mapped_column(BigInteger, ForeignKey("voto_oficial.id_voto"))
    id_usuario:       Mapped[int | None] = mapped_column(Integer, ForeignKey("usuario.id_usuario"))
    accion:           Mapped[str]        = mapped_column(String(50), nullable=False)
    campo_modificado: Mapped[str | None] = mapped_column(String(100))
    valor_anterior:   Mapped[str | None] = mapped_column(Text)
    valor_nuevo:      Mapped[str | None] = mapped_column(Text)
    detalle:          Mapped[str | None] = mapped_column(Text)
    fecha_accion:     Mapped[datetime]   = mapped_column(DateTime, server_default=func.now())

    voto:    Mapped["VotoOficial | None"] = relationship(back_populates="auditorias")
    usuario: Mapped["Usuario | None"]     = relationship(back_populates="auditorias")


class FalloDB(Base):
    __tablename__ = "fallo_db"

    id_fallo:         Mapped[int]          = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nodo:             Mapped[str]          = mapped_column(String(100), nullable=False)
    tipo_fallo:       Mapped[str | None]   = mapped_column(String(100))
    detalle:          Mapped[str | None]   = mapped_column(Text)
    fecha_fallo:      Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())
    resuelto:         Mapped[bool]         = mapped_column(Boolean, default=False)
    fecha_resolucion: Mapped[datetime | None] = mapped_column(DateTime)


class ActaImportRun(Base):
    """Registro de cada ejecución del módulo de automatización."""
    __tablename__ = "acta_import_runs"

    id:           Mapped[int]          = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    estado:       Mapped[str]          = mapped_column(String(50), nullable=False, default="INICIADO")
    total:        Mapped[int]          = mapped_column(Integer, default=0)
    exitosas:     Mapped[int]          = mapped_column(Integer, default=0)
    errores:      Mapped[int]          = mapped_column(Integer, default=0)
    observadas:   Mapped[int]          = mapped_column(Integer, default=0)
    duplicadas:   Mapped[int]          = mapped_column(Integer, default=0)
    iniciado_en:  Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())
    completado_en: Mapped[datetime | None] = mapped_column(DateTime)

    detalles: Mapped[list["ActaImportDetalle"]] = relationship(back_populates="run")


class ActaImportDetalle(Base):
    """Detalle por fila de cada ejecución de automatización."""
    __tablename__ = "acta_import_detalle"

    id:           Mapped[int]          = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id:       Mapped[int]          = mapped_column(BigInteger, ForeignKey("acta_import_runs.id"), nullable=False)
    nro_acta:     Mapped[str]          = mapped_column(String(50), nullable=False)
    estado:       Mapped[str]          = mapped_column(String(50), nullable=False)
    errores_json: Mapped[str | None]   = mapped_column(Text)
    procesado_en: Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())

    run: Mapped["ActaImportRun"] = relationship(back_populates="detalles")
