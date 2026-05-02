# Automatización de Carga Masiva - Cómputo Oficial

Responsable: Rolando

## Objetivo

Automatizar la carga de actas oficiales desde un archivo CSV hacia el sistema de cómputo oficial, evitando el registro manual de miles de actas mediante el formulario web.

Este módulo pertenece al flujo de Cómputo Oficial, separado del flujo RRV. Su función es leer un archivo CSV, validar cada registro, transformar los datos al formato esperado por el backend oficial y enviarlos al clúster relacional.

## Flujo general

CSV de actas oficiales
→ Automatización con n8n
→ Validación de datos
→ Transformación de campos
→ Envío al backend oficial
→ Registro en PostgreSQL Cluster
→ Auditoría en el sistema oficial

## Archivo de entrada

Ubicación:

```text
SistemaComputoOficial/automatizacion/data/actas_oficiales_transcripcion.csv