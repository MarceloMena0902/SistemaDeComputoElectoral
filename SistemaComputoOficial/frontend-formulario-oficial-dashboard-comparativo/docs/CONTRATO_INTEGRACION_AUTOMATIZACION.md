# Contrato de Integración con Automatización del Cómputo Oficial

Este documento resume cómo debe integrarse este frontend con el módulo de automatización y el backend oficial.

## Regla principal

El dashboard y el formulario **no escriben directamente en la base de datos**. Toda persistencia oficial debe pasar por el backend oficial:

```txt
Formulario Oficial / Automatización
        ↓
POST /api/oficial/actas
        ↓
Backend oficial
        ↓
PostgreSQL Cluster
```

## Payload oficial esperado

El formulario genera un payload compatible con la guía de automatización. La estructura recomendada es:

```json
{
  "nro_acta": "1010200001001",
  "codigo_territorial": 10102,
  "codigo_recinto": "1010200001",
  "codigo_mesa": 1010200001001,
  "nro_mesa": 1,
  "nro_mesa_desde_acta": 1,
  "nro_votantes": 877,
  "papeletas_anfora": 788,
  "papeletas_no_utilizadas": 89,
  "votos": {
    "partido1": 140,
    "partido2": 39,
    "partido3": 124,
    "partido4": 345,
    "votos_blancos": 76,
    "votos_nulos": 64,
    "votos_validos": 648,
    "votos_validos_calculados": 648,
    "total_votos": 788
  },
  "registrado_por": 1,
  "transcripcion": "",
  "tipo_observacion": "SIN_OBSERVACION",
  "requiere_revision_humana": false,
  "estado_acta": "VALIDA",
  "apertura": { "hora": 8, "minutos": 1 },
  "cierre": { "hora": 16, "minutos": 4 },
  "origen": "FORMULARIO_OFICIAL_FRONTEND"
}
```

## Estados usados por el frontend

| Estado | Uso |
|---|---|
| `VALIDA` | Acta sin errores críticos ni observaciones. |
| `OBSERVADA_PENDIENTE_REVISION` | Acta con observación formal, nota técnica o advertencia que debe revisarse. |
| `RECHAZADA` | Acta con error fuerte de validación. |
| `DUPLICADA` | Debe manejarlo el backend cuando ya exista `nro_acta`. |

## Validaciones que el frontend aplica

- Campos obligatorios.
- Números enteros, sin letras, sin decimales, sin negativos y sin notación científica.
- `P1 + P2 + P3 + P4 = votos_validos_calculados`.
- `votos_validos_calculados + votos_blancos + votos_nulos = total_votos`.
- `total_votos <= votantes_habilitados`.
- `total_votos = papeletas_anfora`, si ese dato está disponible.
- `papeletas_anfora + papeletas_no_utilizadas = votantes_habilitados`, como advertencia si no coincide.
- Duplicados se muestran como advertencia; la decisión final debe ser del backend oficial.
- Observación técnica no procesa PDFs, solo se muestra para trazabilidad.

## Relación con el módulo de Rolando

La automatización debe usar el mismo contrato de datos. El flujo recomendado es:

```txt
Excel oficial
   ↓
read_official_file.js
   ↓
official_csv_adapter.js
   ↓
import_actas_csv.js o Selenium
   ↓
POST /api/oficial/actas
   ↓
Backend oficial
   ↓
Dashboard comparativo
```

El dashboard debe consumir datos ya clasificados por el backend: válidas, observadas, duplicadas y rechazadas. En producción no se debe limpiar ni borrar información oficial; eso solo aplica a mocks o pruebas locales.
