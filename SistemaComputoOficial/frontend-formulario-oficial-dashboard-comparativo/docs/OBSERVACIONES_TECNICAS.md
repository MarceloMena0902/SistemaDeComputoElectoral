# Observaciones técnicas en el módulo

Este módulo incluye un campo opcional llamado `observacionTecnica`.

## Para qué sirve

Sirve para mostrar información técnica que viene de otra fuente, por ejemplo:

- Excel de transcripciones.
- Backend RRV/OCR.
- Proceso de ingesta.
- Carga CSV.

Ejemplos de valores:

```txt
Aplanado ***
Recortado 2 cm por lado
Cambio de a4 a A0
Cambio nulos por blancos
Mesas que no existen
Duplicados
```

## Qué responsabilidad tiene este frontend

El frontend solamente:

- muestra la observación técnica,
- la usa como advertencia visual,
- la incluye en auditoría visual,
- la puede enviar unida al campo `observacion` si el backend no tiene columna propia.

## Qué no hace

El frontend no detecta si un PDF está aplanado, no aplana PDFs y no procesa imágenes. Esa parte pertenece al flujo RRV/OCR.

## Recomendación para backend

Si el equipo desea persistir este dato de forma separada, se recomienda agregar un campo opcional:

```sql
ALTER TABLE acta_oficial ADD COLUMN IF NOT EXISTS observacion_tecnica TEXT;
```

También se puede incluir en eventos de auditoría:

```txt
tipo_evento = OBSERVACION_TECNICA_REGISTRADA
```
