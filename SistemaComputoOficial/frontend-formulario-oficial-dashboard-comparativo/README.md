# Feature: Formulario Oficial y Dashboard Comparativo

Rama frontend correspondiente a la tarea:

**Desarrollo de Formulario Oficial y Dashboard Comparativo**

Este módulo no crea una base de datos propia. Está preparado para consumir las bases de datos y servicios del equipo:

- **PostgreSQL / Cómputo Oficial**: backend oficial y base de datos del módulo de DBA/backend.
- **MongoDB / RRV**: backend de Conteo Rápido cuando esté disponible.
- **CSV / carga masiva**: datos de prueba y carga del módulo de automatización.

## Ubicación dentro del repositorio

La carpeta correcta para guardar esta parte es:

```txt
SistemaComputoOficial/frontend-formulario-oficial-dashboard-comparativo
```

No debe ir dentro de `SistemaRRV`, porque aunque el dashboard compara contra RRV, el módulo pertenece a la parte del **Cómputo Oficial** y al dashboard comparativo de la tarea de Denis.

Estructura esperada en el repositorio:

```txt
SistemaDeComputoElectoral/
├─ SistemaComputoOficial/
│  ├─ Backend/                              # Backend oficial
│  ├─ automatizacion/                       # Rolando
│  └─ frontend-formulario-oficial-dashboard-comparativo/  # Denis
└─ SistemaRRV/
   └─ frontend/                             # Nelson
```

## Qué incluye este módulo

- Formulario Oficial.
- Dashboard Comparativo RRV vs Oficial.
- Lista de Actas Oficiales.
- Panel de Inconsistencias campo por campo.
- Panel de Auditoría.
- Vista técnica de integración con PostgreSQL y MongoDB.
- Validaciones visuales del acta.
- Campo informativo de **observación técnica** para casos como:
  - `Aplanado ***`
  - `Recortado 2 cm por lado`
  - `Cambio de A4 a A0`
  - `Cambio nulos por blancos`
  - `Mesas que no existen`
  - duplicados u otras notas recibidas desde CSV/RRV/OCR.

## Qué no hace este módulo

Este módulo no implementa:

- OCR.
- Procesamiento de imágenes.
- Aplanado real de PDFs.
- Recepción real de SMS.
- MongoDB Cluster.
- PostgreSQL Cluster.
- n8n o Selenium.
- Carga masiva CSV.

Esas partes pertenecen a los otros integrantes. Este frontend solo está preparado para mostrar o consumir esos datos.

## Instalación local

Entrar a la carpeta:

```powershell
cd SistemaComputoOficial\frontend-formulario-oficial-dashboard-comparativo
```

Instalar dependencias:

```powershell
npm install
```

Ejecutar:

```powershell
npm run dev
```

Abrir:

```txt
http://localhost:5173
```

## Modo demo

Si todavía no están levantados los backends, el sistema funciona con datos mock generados desde el Excel de la práctica.

Esto permite mostrar:

- dashboard comparativo,
- formulario,
- actas oficiales,
- inconsistencias,
- auditoría visual,
- observaciones técnicas.

## Configuración de endpoints reales

Crear un archivo `.env` tomando como base `.env.example`:

```powershell
copy .env.example .env
```

Contenido sugerido:

```env
VITE_OFICIAL_API_URL=http://localhost:4000
VITE_RRV_API_URL=http://localhost:5000
VITE_ENABLE_API_SUBMIT=false
```

Por defecto el formulario **no muestra botones técnicos ni envía automáticamente al backend**. El integrador puede activar `VITE_ENABLE_API_SUBMIT=true` cuando el endpoint final esté listo.

## Conexión con Backend oficial PostgreSQL

El formulario genera un payload compatible con el backend oficial:

```txt
POST /api/oficial/actas
```

URL completa esperada:

```txt
http://localhost:4000/api/oficial/actas
```

Payload que genera el formulario:

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
  "transcripcion": "Observacion oficial | Nota tecnica: Aplanado ***",
  "tipo_observacion": "OBSERVACION_REGISTRADA",
  "requiere_revision_humana": true,
  "estado_acta": "OBSERVADA_PENDIENTE_REVISION",
  "apertura": { "hora": 8, "minutos": 0 },
  "cierre": { "hora": 16, "minutos": 0 },
  "origen": "FORMULARIO_OFICIAL_FRONTEND"
}
```

Este contrato queda alineado con la guía de automatización: los votos van dentro del objeto `votos` y las observaciones se envían como `transcripcion`, `tipo_observacion` y `requiere_revision_humana`.

Endpoints oficiales que el frontend puede consumir cuando estén disponibles:

```txt
GET  /health
POST /api/oficial/actas
GET  /api/dashboard/resultados
GET  /api/dashboard/progreso
GET  /api/auditoria/logs
GET  /api/auditoria/fallos-db
```

Si en el backend agregan estos endpoints, el dashboard puede conectarse mejor:

```txt
GET /api/oficial/actas
GET /api/dashboard/comparativo
GET /api/dashboard/inconsistencias
```


## Relación con la automatización oficial

La automatización de carga masiva no forma parte de este frontend, pero ambos módulos deben usar el mismo contrato de payload. La automatización lee el Excel y envía `POST /api/oficial/actas`; este frontend muestra, valida y prepara el mismo tipo de payload para el registro visual.

Documento técnico relacionado:

```txt
docs/CONTRATO_INTEGRACION_AUTOMATIZACION.md
```

El dashboard debe consumir el backend, no conectarse directamente a PostgreSQL ni a MongoDB.

## Conexión con RRV / MongoDB

El dashboard comparativo espera datos RRV con una estructura equivalente a:

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

El punto clave para comparar es que RRV y Oficial compartan una llave común:

```txt
codigoActa
```

o, si el equipo decide así:

```txt
codigoMesa
```


## Actualización visual basada en la página de cómputo del OEP

Se revisó la referencia visual de resultados de cómputo del OEP (`https://computo.oep.org.bo/`). Para que el dashboard se vea más real e institucional, se agregaron filtros territoriales similares a los usados en sistemas electorales:

```txt
Proceso electoral
Departamento
Provincia
Municipio
Recinto
Mesa
Estado del acta
Fuente de datos
Búsqueda por acta, mesa, recinto o nota técnica
```

También se reforzó la presentación con:

- panel de progreso de cómputo,
- resultados por organización política,
- tabla de resultados por territorio,
- diferencia territorial RRV vs Oficial,
- filtros acumulados para navegar desde departamento hasta mesa,
- visualización de observaciones técnicas como dato informativo.

Estos cambios son solo frontend. No agregan una base de datos nueva y no reemplazan los endpoints del equipo.

## Observación técnica y PDF aplanado

El módulo muestra observaciones técnicas si vienen en el Excel, en el backend oficial o en el backend RRV.

Ejemplos:

```txt
Aplanado ***
Recortado 2 cm por lado
Cambio de A4 a A0
Cambio nulos por blancos
Mesas que no existen
```

Importante:

- Este frontend **no detecta** si un PDF está aplanado.
- Este frontend **no aplana PDFs**.
- Este frontend solo muestra esa información como trazabilidad visual.
- La detección real corresponde al flujo RRV/OCR.

## Validaciones del Formulario Oficial

El formulario valida y bloquea errores críticos antes de guardar:

- campos obligatorios,
- no permite letras, signos, decimales ni notación científica en campos numéricos,
- solo acepta enteros positivos en códigos, mesa, votantes, papeletas y votos,
- no permite valores negativos,
- `nroMesa` debe ser mayor a cero,
- `votantesHabilitados` debe ser mayor a cero,
- el número de acta solo acepta letras, números, guion, punto o guion bajo,
- departamento, provincia, municipio y recinto no aceptan caracteres peligrosos como `< > { } [ ] $ ;`,
- total de votos contra votantes habilitados,
- papeletas en ánfora contra total calculado,
- papeletas en ánfora + no utilizadas contra habilitados,
- actas duplicadas como advertencia de idempotencia,
- observaciones técnicas como advertencia informativa.

Si existe un error de tipo `ERROR`, el botón Guardar no registra el acta y muestra los errores que deben corregirse.

Estados visuales:

```txt
PROCESADA  = sin errores críticos
OBSERVADA  = advertencias o nota técnica
RECHAZADA  = errores graves
```

## Comandos útiles

Ejecutar en desarrollo:

```powershell
npm run dev
```

Compilar para producción:

```powershell
npm run build
```

Previsualizar compilado:

```powershell
npm run preview
```

## Cómo subir esta rama

Desde la raíz del repositorio:

```powershell
git checkout -b feature/formulario-oficial-dashboard-comparativo
mkdir SistemaComputoOficial\frontend-formulario-oficial-dashboard-comparativo
```

Copiar el contenido de esta carpeta dentro de:

```txt
SistemaComputoOficial/frontend-formulario-oficial-dashboard-comparativo
```

Luego:

```powershell
git add SistemaComputoOficial/frontend-formulario-oficial-dashboard-comparativo
git commit -m "feat: add official form and comparative dashboard frontend"
git push origin feature/formulario-oficial-dashboard-comparativo
```

## Frase para defensa en inglés

```txt
My responsibility was to develop the official form and the comparative dashboard. The form validates official electoral records before sending them to the official PostgreSQL backend. The dashboard compares preliminary RRV data from MongoDB with official results from PostgreSQL, showing differences, inconsistencies, participation indicators, audit information, and technical observations such as flattened or cropped PDF records when those notes are provided by the data source.
```

## Actualización: formulario con combos dependientes y control anti doble carga

El formulario oficial fue reforzado para evitar datos incorrectos escritos manualmente en la ubicación territorial. Ahora la selección se hace por listas dependientes:

Departamento → Provincia → Municipio → Recinto → Mesa / Acta.

Solo el departamento aparece habilitado al inicio. Al seleccionar cada nivel, se habilita el siguiente. Si el usuario cambia un nivel superior, los niveles inferiores se limpian automáticamente.

También se agregó control anti doble carga:

- El botón **Guardar acta** se bloquea mientras procesa.
- La tecla **Enter** ejecuta el mismo guardado del botón.
- Aparece una pantalla emergente de validación/proceso/resultado.
- Si existen errores críticos, se muestra el detalle y no se registra el acta como válida.

Esto es solo del frontend de Formulario Oficial y Dashboard Comparativo; la persistencia real depende del backend oficial configurado por `.env`.
