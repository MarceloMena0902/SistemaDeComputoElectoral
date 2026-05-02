#!/bin/bash
# =============================================================
# Script de inicializacion del nodo PRIMARY (Master)
# Se ejecuta una sola vez via docker-entrypoint-initdb.d/
# =============================================================
set -e

echo "[PRIMARY] Configurando replicacion en streaming..."

# ─── Configurar postgresql.conf para WAL streaming replication ───
cat >> "$PGDATA/postgresql.conf" << 'EOF'

# ─── Streaming Replication (agregado por init-primary.sh) ────────
wal_level = replica
max_wal_senders = 10
wal_keep_size = 256MB
hot_standby = on
synchronous_commit = local
archive_mode = off
max_replication_slots = 5
EOF

# ─── Sobreescribir pg_hba.conf con permisos de replicacion ───────
cat > "$PGDATA/pg_hba.conf" << 'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
host    all             all             0.0.0.0/0               md5
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host    replication     replicator      0.0.0.0/0               md5
EOF

# ─── Crear usuario de replicacion ────────────────────────────────
echo "[PRIMARY] Creando usuario de replicacion: ${POSTGRES_REPLICATION_USER:-replicator}"
psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname   "$POSTGRES_DB"  << EOSQL
CREATE USER ${POSTGRES_REPLICATION_USER:-replicator}
  WITH REPLICATION
       LOGIN
       ENCRYPTED PASSWORD '${POSTGRES_REPLICATION_PASSWORD:-repl2024secure}';

-- Crear slot de replicacion para el standby
SELECT pg_create_physical_replication_slot('standby_slot', true);
EOSQL

echo "[PRIMARY] Replicacion configurada correctamente."
