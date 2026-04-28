"""
Validadores de reglas de negocio del Computo Oficial.

Reglas de idempotencia segun la practica:
  - Inconsistencia aritmetica: suma partidos ≠ votos_validos
  - Total incorrecto: votos_validos + blancos + nulos ≠ total_votos
  - Acta duplicada con datos distintos → conflicto
  - Acta duplicada con datos identicos → idempotente (OK)
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str]
    warnings: list[str]


def validate_arithmetic(
    partido1: int,
    partido2: int,
    partido3: int,
    partido4: int,
    votos_blancos: int,
    votos_nulos: int,
    nro_votantes: int,
) -> ValidationResult:
    """
    Valida la consistencia aritmetica de los votos.
    Retorna un ValidationResult con errores y advertencias.
    """
    errors: list[str] = []
    warnings: list[str] = []

    votos_validos = partido1 + partido2 + partido3 + partido4
    total_votos   = votos_validos + votos_blancos + votos_nulos

    # Regla 1: ningun valor negativo
    for campo, valor in [
        ("partido1", partido1), ("partido2", partido2),
        ("partido3", partido3), ("partido4", partido4),
        ("votos_blancos", votos_blancos), ("votos_nulos", votos_nulos),
    ]:
        if valor < 0:
            errors.append(f"Campo '{campo}' no puede ser negativo (valor: {valor})")

    # Regla 2: total no supera padron
    if total_votos > nro_votantes:
        errors.append(
            f"total_votos ({total_votos}) supera nro_votantes ({nro_votantes}). "
            f"Posible discrepancia entre padron y papeletas en anfora."
        )

    # Advertencia: participacion muy baja (menos del 10%)
    if nro_votantes > 0 and total_votos < nro_votantes * 0.10:
        warnings.append(
            f"Participacion muy baja: {total_votos}/{nro_votantes} "
            f"({total_votos/nro_votantes*100:.1f}%)"
        )

    return ValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)


def is_idempotent_duplicate(existing_voto, new_data: dict) -> bool:
    """
    Compara un VotoOficial existente con datos nuevos.
    Retorna True si son identicos (acta idempotente).
    """
    campos = ["partido1", "partido2", "partido3", "partido4",
              "votos_blancos", "votos_nulos"]
    return all(getattr(existing_voto, c) == new_data.get(c) for c in campos)


def build_conflict_detail(existing_voto, new_data: dict) -> str:
    """Genera detalle legible de las diferencias entre acta existente y nueva."""
    diffs = []
    campos = ["partido1", "partido2", "partido3", "partido4",
              "votos_blancos", "votos_nulos"]
    for campo in campos:
        val_old = getattr(existing_voto, campo)
        val_new = new_data.get(campo)
        if val_old != val_new:
            diffs.append(f"{campo}: {val_old} → {val_new}")
    return "Diferencias detectadas: " + ", ".join(diffs)
