#!/bin/bash
# =============================================================
# Entrypoint del nodo STANDBY (Replica)
# 1. Espera que el PRIMARY este listo
# 2. Clona desde PRIMARY con pg_basebackup (si PGDATA vacio)
# 3. Lanza healthcheck HTTP, watchdog de auto-promocion y PostgreSQL
# =============================================================
set -e

PRIMARY_HOST="${PRIMARY_HOST:-postgres-primary}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPL_USER="${POSTGRES_REPLICATION_USER:-replicator}"
REPL_PASS="${POSTGRES_REPLICATION_PASSWORD:-repl2024secure}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_PASS="${POSTGRES_PASSWORD:-electoral2024}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

# ─── 1. Esperar al PRIMARY ────────────────────────────────────────
echo "[STANDBY] Esperando al nodo PRIMARY en $PRIMARY_HOST:$PRIMARY_PORT..."
until PGPASSWORD="$PG_PASS" pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$PG_USER" -t 3; do
    echo "[STANDBY] Primary no disponible aun, reintentando en 3s..."
    sleep 3
done
echo "[STANDBY] Primary listo. Procediendo..."

# ─── 2. Clonar desde PRIMARY si PGDATA esta vacio ────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[STANDBY] PGDATA vacio. Ejecutando pg_basebackup desde PRIMARY..."

    rm -rf "$PGDATA"/* "$PGDATA"/.[!.]* 2>/dev/null || true
        chmod 700 "$PGDATA"

    PGPASSWORD="$REPL_PASS" pg_basebackup \
        -h "$PRIMARY_HOST" \
        -p "$PRIMARY_PORT" \
        -U "$REPL_USER"  \
        -D "$PGDATA"     \
        -R               \
        -P               \
        --wal-method=stream

    echo "[STANDBY] pg_basebackup completado. Configurando primary_conninfo..."

    # Asegurar que standby.signal exista
    touch "$PGDATA/standby.signal"

    # Configurar conexion de replicacion en postgresql.auto.conf
    cat >> "$PGDATA/postgresql.auto.conf" << EOF

# Configuracion de replicacion (generada por entrypoint.sh)
primary_conninfo = 'host=${PRIMARY_HOST} port=${PRIMARY_PORT} user=${REPL_USER} password=${REPL_PASS} application_name=standby1'
primary_slot_name = 'standby_slot'
hot_standby = on
EOF

    echo "[STANDBY] Configuracion de replica lista."
else
    echo "[STANDBY] PGDATA ya inicializado, iniciando en modo standby..."
fi

# ─── 3. Lanzar servicios secundarios ─────────────────────────────
echo "[STANDBY] Iniciando servidor HTTP de healthcheck en puerto 8008..."
python3 /healthcheck.py &

echo "[STANDBY] Iniciando watchdog de auto-promocion..."
bash /watchdog.sh &

# ─── 4. Iniciar PostgreSQL en modo standby ────────────────────────
echo "[STANDBY] Iniciando PostgreSQL..."
chown -R postgres:postgres "$PGDATA"
exec gosu postgres postgres -D "$PGDATA"
