# Integración con las bases de datos del equipo

Este frontend pertenece a la tarea: **Formulario Oficial y Dashboard Comparativo**.

No crea una base de datos propia. Consume la información producida por las dos partes del sistema:

- **Cómputo Oficial / PostgreSQL Cluster**: el backend oficial.
- **RRV / MongoDB Cluster**: Mauricio y Nelson.

## Carpeta correcta

Debe guardarse en:

```txt
SistemaComputoOficial/frontend-formulario-oficial-dashboard-comparativo
```

Aunque el dashboard compara contra RRV, el módulo pertenece a la parte oficial porque registra y valida actas oficiales.

## Base oficial PostgreSQL

El formulario oficial debe conectarse al backend de el backend oficial.

Endpoint principal:

```txt
POST /api/oficial/actas
```

Payload actual compatible:

```json
{
  "nro_acta": "ACTA-1010200001001",
  "codigo_mesa": 1010200001001,
  "nro_mesa": 1,
  "nro_votantes": 877,
  "codigo_territorial": 10102,
  "partido1": 140,
  "partido2": 39,
  "partido3": 124,
  "partido4": 345,
  "votos_blancos": 76,
  "votos_nulos": 64,
  "registrado_por": 1,
  "observacion": "Texto de observacion"
}
```

Si existe `observacionTecnica`, el frontend la agrega dentro de `observacion` para no romper compatibilidad con el backend actual.

## Base RRV MongoDB

El dashboard comparativo necesita datos RRV con campos equivalentes a los oficiales.

Estructura esperada:

```json
{
  "codigoActa": "1010200001001",
  "codigoMesa": 1010200001001,
  "nroMesa": 1,
  "departamento": "Chuquisaca",
  "municipio": "Yotala",
  "recinto": "U.E. Padresama",
  "p1": 138,
  "p2": 38,
  "p3": 122,
  "p4": 344,
  "votosBlancos": 76,
  "votosNulos": 63,
  "totalVotos": 781,
  "origen": "PDF_OCR",
  "pdfAplanado": true,
  "observacionTecnica": "Aplanado ***"
}
```

La comparación se hace por:

```txt
codigoActa
```

## Observaciones técnicas

El Excel actualizado incluye una columna adicional sin título con notas como:

```txt
Aplanado ***
Recortado 2 cm por lado
Cambio de a4 a A0
Cambio nulos por blancos
Mesas que no existen
```

Este frontend las muestra como `observacionTecnica`.

### Importante

El frontend no detecta ni aplana PDFs. Solo muestra el dato recibido.

La responsabilidad de detectar PDF aplanado, recortado o cambios de formato corresponde al flujo de RRV/OCR.

## Endpoints recomendados para integración completa

Oficial:

```txt
GET  /health
POST /api/oficial/actas
GET  /api/oficial/actas
GET  /api/dashboard/resultados
GET  /api/dashboard/progreso
GET  /api/auditoria/logs
```

RRV:

```txt
GET /api/rrv/actas
GET /api/rrv/resultados
GET /api/rrv/inconsistencias
```

Dashboard comparativo opcional:

```txt
GET /api/dashboard/comparativo
GET /api/dashboard/inconsistencias
```

## Qué sí puede hacer este módulo

- Registrar actas oficiales desde formulario.
- Validar datos antes de enviar.
- Mostrar estado visual: procesada, observada o rechazada.
- Comparar RRV vs Oficial.
- Mostrar diferencias por partido, blancos, nulos y total.
- Mostrar observaciones técnicas recibidas.
- Exportar JSON de actas e inconsistencias.

## Qué no puede hacer técnicamente por sí solo

- No puede guardar en PostgreSQL si el backend oficial no está levantado.
- No puede leer MongoDB si no existe API RRV.
- No puede detectar aplanado de PDF.
- No puede procesar imágenes.
- No puede ejecutar carga masiva CSV.
- No puede validar SMS contra números autorizados si esa seguridad no viene desde backend.


## Filtros agregados por referencia del OEP

El dashboard quedó preparado para una navegación territorial parecida a un sistema de resultados electorales oficial:

- proceso electoral,
- departamento,
- provincia,
- municipio,
- recinto,
- mesa,
- estado del acta,
- fuente de datos,
- búsqueda por código de acta o texto.

Para que estos filtros funcionen con datos reales, los endpoints oficiales y RRV deben devolver, como mínimo, estos campos por acta:

```json
{
  "codigoActa": "1010200001001",
  "codigoMesa": 1010200001001,
  "nroMesa": 1,
  "departamento": "Chuquisaca",
  "provincia": "Oropeza",
  "municipio": "Yotala",
  "recinto": "U.E. Padresama",
  "estado": "PROCESADO",
  "fuente": "CSV_OFICIAL",
  "origen": "PDF_OCR"
}
```

Si algún backend todavía no devuelve provincia, recinto o estado, el frontend puede seguir funcionando, pero los filtros correspondientes aparecerán incompletos hasta que el endpoint los exponga.
