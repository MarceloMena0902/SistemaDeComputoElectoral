# Validaciones del Formulario Oficial

Este módulo valida la captura oficial antes de permitir el guardado local o el envio al backend oficial.

## Campos numéricos

Los campos de códigos, mesa, votantes, papeletas y votos:

- solo aceptan dígitos `0-9`,
- no aceptan letras,
- no aceptan decimales,
- no aceptan signos negativos,
- no aceptan notación científica como `1e5`,
- se limpian visualmente al pegar contenido inválido.

## Campos obligatorios

Son obligatorios:

- número de acta,
- código de mesa,
- número de mesa,
- código territorial,
- votantes habilitados,
- departamento,
- provincia,
- municipio,
- recinto,
- registrado por ID.

## Reglas electorales

El formulario calcula:

```txt
votos_validos = P1 + P2 + P3 + P4

total_votos = votos_validos + votos_blancos + votos_nulos
```

Luego valida:

```txt
total_votos <= votantes_habilitados

total_votos == papeletas_anfora

papeletas_anfora + papeletas_no_utilizadas == votantes_habilitados
```

## Estados

- `PROCESADA`: no tiene errores ni advertencias.
- `OBSERVADA`: tiene advertencias o nota técnica informativa.
- `RECHAZADA`: tiene errores críticos y no se puede guardar.

## Observación técnica

La observación técnica no invalida por sí sola el acta. Solo se muestra para trazabilidad cuando llega información como:

- `Aplanado ***`,
- `Recortado 2 cm por lado`,
- `Cambio de A4 a A0`,
- `Cambio nulos por blancos`,
- `Mesas que no existen`.

El frontend no procesa PDF ni OCR. Solo muestra esa observación si viene desde el Excel, RRV o backend.
