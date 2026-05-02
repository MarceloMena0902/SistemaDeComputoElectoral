#!/bin/bash
# Wrapper entrypoint: lanza healthcheck HTTP y luego delega al entrypoint estandar de postgres
set -e

echo "[PRIMARY] Iniciando servidor HTTP de healthcheck en puerto 8008..."
python3 /healthcheck.py &

echo "[PRIMARY] Delegando a docker-entrypoint.sh..."
exec docker-entrypoint.sh "$@"
