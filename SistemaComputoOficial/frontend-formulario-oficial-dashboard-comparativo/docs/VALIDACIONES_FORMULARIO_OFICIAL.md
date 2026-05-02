# Validaciones del Formulario Oficial

Este módulo corresponde al **Formulario Oficial y Dashboard Comparativo**. No implementa bases de datos, OCR, SMS, Selenium ni carga masiva. Consume los servicios del backend oficial y del RRV cuando estén disponibles.

## Controles del formulario

- Los campos numéricos solo aceptan dígitos.
- No se permiten letras, decimales, negativos, signos ni notación científica en campos de votos, mesa, códigos, papeletas o habilitados.
- El botón **Guardar acta** queda bloqueado mientras se procesa el registro para evitar doble carga.
- La tecla **Enter** ejecuta el mismo flujo del botón Guardar acta cuando el foco está en campos simples.
- Se muestra una pantalla emergente de proceso, éxito o error para que el usuario no presione varias veces.

## Combos dependientes

La ubicación del acta se selecciona mediante listas desplegables para evitar texto escrito incorrectamente.

Orden de desbloqueo:

1. Departamento
2. Provincia
3. Municipio
4. Recinto
5. Mesa / acta

Al cambiar un nivel superior, los niveles inferiores se limpian automáticamente.

## Reglas electorales

- Campos obligatorios: acta, mesa, código territorial, votantes habilitados, ubicación y usuario registrador.
- `P1 + P2 + P3 + P4` calcula votos válidos.
- `votos válidos + blancos + nulos` calcula total de votos.
- El total de votos no puede superar votantes habilitados.
- Si hay observación técnica, el acta queda como advertencia para trazabilidad.
- Si hay errores críticos, no se guarda como válida.

## Integración

El frontend no escribe directamente en PostgreSQL ni MongoDB. El envío real se activa por variables de entorno cuando el backend esté listo:

```env
VITE_OFICIAL_API_URL=http://localhost:4000
VITE_RRV_API_URL=http://localhost:4001
VITE_ENABLE_API_SUBMIT=true
```
