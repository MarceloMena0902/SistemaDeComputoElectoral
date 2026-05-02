"""
Servicio de validación del Cómputo Oficial.
Toda acta DEBE pasar por este validador antes de persistirse, sin excepción.
"""
from dataclasses import dataclass, field

ESTADO_VALIDA                  = "VALIDA"
ESTADO_OBSERVADA               = "OBSERVADA_PENDIENTE_REVISION"
ESTADO_RECHAZADA               = "RECHAZADA"
ESTADO_DUPLICADA               = "DUPLICADA"

CRITICAL_OBSERVATION_TYPES = frozenset({
    "ACTA_ANULADA", "FORMULARIO_NO_OFICIAL", "PAPELETAS_NO_AUTORIZADAS",
    "DATOS_BORRADOS", "ACTA_DUPLICADA", "ACTA_CLONADA", "MESA_NO_EXISTE",
    "MESA_EN_LUGAR_DISTINTO", "DATOS_CAMBIADOS", "FALTA_FIRMA_HUELLA",
    "FECHA_INCORRECTA", "ERROR_TRANSCRIPCION", "AUSENCIA_DELEGADOS",
    "FALTA_DATOS_APERTURA_CIERRE", "INCONSISTENCIA_ARITMETICA",
})


@dataclass
class ValidationResult:
    valid: bool
    estado: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_acta(
    nro_acta: str,
    nro_mesa: int,
    codigo_mesa: int,
    nro_votantes: int,
    papeletas_anfora: int,
    papeletas_no_utilizadas: int,
    partido1: int,
    partido2: int,
    partido3: int,
    partido4: int,
    votos_validos: int,
    votos_blancos: int,
    votos_nulos: int,
    apertura_hora: int = 8,
    apertura_minutos: int = 0,
    cierre_hora: int = 16,
    cierre_minutos: int = 0,
    tipo_observacion: str = "SIN_OBSERVACION",
) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    # ─── Campos obligatorios ──────────────────────────────────────
    if not nro_acta:
        errors.append("nro_acta es obligatorio")

    # ─── Valores negativos ────────────────────────────────────────
    for nombre, valor in [
        ("partido1", partido1), ("partido2", partido2),
        ("partido3", partido3), ("partido4", partido4),
        ("votos_validos", votos_validos), ("votos_blancos", votos_blancos),
        ("votos_nulos", votos_nulos), ("papeletas_anfora", papeletas_anfora),
        ("papeletas_no_utilizadas", papeletas_no_utilizadas),
        ("nro_votantes", nro_votantes),
    ]:
        if valor < 0:
            errors.append(f"'{nombre}' no puede ser negativo ({valor})")

    # ─── P1+P2+P3+P4 = votos_validos ─────────────────────────────
    calculado_validos = partido1 + partido2 + partido3 + partido4
    if calculado_validos != votos_validos:
        errors.append(
            f"P1+P2+P3+P4 ({calculado_validos}) ≠ votos_validos ({votos_validos})"
        )

    # ─── total = papeletas_anfora ─────────────────────────────────
    total_calculado = votos_validos + votos_blancos + votos_nulos
    if total_calculado != papeletas_anfora:
        errors.append(
            f"votos_validos+blancos+nulos ({total_calculado}) ≠ papeletas_anfora ({papeletas_anfora})"
        )

    # ─── papeletas_anfora <= votantes_habilitados ─────────────────
    if papeletas_anfora > nro_votantes:
        errors.append(
            f"papeletas_anfora ({papeletas_anfora}) > votantes_habilitados ({nro_votantes})"
        )

    # ─── papeletas_anfora + no_utilizadas = habilitados ──────────
    suma_papeletas = papeletas_anfora + papeletas_no_utilizadas
    if suma_papeletas != nro_votantes:
        warnings.append(
            f"papeletas_anfora+no_utilizadas ({suma_papeletas}) ≠ votantes_habilitados ({nro_votantes})"
        )

    # ─── NroMesa = últimos 3 dígitos del CodigoActa ───────────────
    if nro_mesa > 0 and len(str(codigo_mesa)) >= 3:
        acta_last3 = int(str(codigo_mesa)[-3:])
        if acta_last3 != nro_mesa:
            warnings.append(
                f"NroMesa ({nro_mesa}) no coincide con últimos 3 dígitos de CodigoActa ({acta_last3})"
            )

    # ─── Horarios ─────────────────────────────────────────────────
    if not (0 <= apertura_hora <= 23):
        errors.append(f"apertura.hora fuera de rango ({apertura_hora})")
    if not (0 <= apertura_minutos <= 59):
        errors.append(f"apertura.minutos fuera de rango ({apertura_minutos})")
    if not (0 <= cierre_hora <= 23):
        errors.append(f"cierre.hora fuera de rango ({cierre_hora})")
    if not (0 <= cierre_minutos <= 59):
        errors.append(f"cierre.minutos fuera de rango ({cierre_minutos})")
    apertura_total = apertura_hora * 60 + apertura_minutos
    cierre_total   = cierre_hora * 60 + cierre_minutos
    if cierre_total <= apertura_total:
        warnings.append("Hora de cierre no es posterior a la apertura")

    # ─── Observaciones críticas → OBSERVADA ──────────────────────
    is_critical = tipo_observacion in CRITICAL_OBSERVATION_TYPES

    # ─── Estado final ─────────────────────────────────────────────
    if errors:
        estado = ESTADO_RECHAZADA
    elif is_critical or warnings:
        estado = ESTADO_OBSERVADA
    else:
        estado = ESTADO_VALIDA

    return ValidationResult(
        valid=len(errors) == 0,
        estado=estado,
        errors=errors,
        warnings=warnings,
    )


# ─── Helpers para idempotencia (usados en routers/actas.py) ──────
def is_idempotent_duplicate(existing_voto, new_data: dict) -> bool:
    campos = ["partido1", "partido2", "partido3", "partido4", "votos_blancos", "votos_nulos"]
    return all(getattr(existing_voto, c) == new_data.get(c) for c in campos)


def build_conflict_detail(existing_voto, new_data: dict) -> str:
    diffs = []
    for campo in ["partido1", "partido2", "partido3", "partido4", "votos_blancos", "votos_nulos"]:
        val_old = getattr(existing_voto, campo)
        val_new = new_data.get(campo)
        if val_old != val_new:
            diffs.append(f"{campo}: {val_old} → {val_new}")
    return "Diferencias: " + ", ".join(diffs)


# ─── Compatibilidad retroactiva (usada en tests existentes) ──────
def validate_arithmetic(
    partido1: int, partido2: int, partido3: int, partido4: int,
    votos_blancos: int, votos_nulos: int, nro_votantes: int,
) -> ValidationResult:
    """Wrapper de compatibilidad que llama al validador completo."""
    votos_validos = partido1 + partido2 + partido3 + partido4
    papeletas_anfora = votos_validos + votos_blancos + votos_nulos
    return validate_acta(
        nro_acta="__compat__",
        nro_mesa=1, codigo_mesa=1,
        nro_votantes=nro_votantes,
        papeletas_anfora=papeletas_anfora,
        papeletas_no_utilizadas=max(0, nro_votantes - papeletas_anfora),
        partido1=partido1, partido2=partido2,
        partido3=partido3, partido4=partido4,
        votos_validos=votos_validos,
        votos_blancos=votos_blancos,
        votos_nulos=votos_nulos,
    )
