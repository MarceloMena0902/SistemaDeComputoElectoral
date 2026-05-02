#!/bin/bash
# =============================================================
# WATCHDOG de Auto-Promocion del Standby
#
# Monitorea el nodo PRIMARY. Si detecta N fallos consecutivos,
# promueve este STANDBY a nuevo PRIMARY automaticamente.
# =============================================================

PRIMARY_HOST="${PRIMARY_HOST:-postgres-primary}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_PASS="${POSTGRES_PASSWORD:-electoral2024}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

FAIL_COUNT=0
MAX_FAILS=5          # Fallos consecutivos antes de promover
CHECK_INTERVAL=5     # Segundos entre checks

echo "[WATCHDOG] Iniciado. Monitoreando PRIMARY en $PRIMARY_HOST:$PRIMARY_PORT"
echo "[WATCHDOG] Umbral de fallo: $MAX_FAILS checks de $CHECK_INTERVAL segundos"

while true; do
    sleep "$CHECK_INTERVAL"

    # ─── Verificar si este nodo ya es PRIMARY ─────────────────────
    IS_STANDBY=$(PGPASSWORD="$PG_PASS" psql -U "$PG_USER" -d postgres \
                 -t -A -c "SELECT pg_is_in_recovery();" 2>/dev/null)

    if [ "$IS_STANDBY" = "f" ]; then
        # Ya somos PRIMARY — el watchdog puede descansar
        if [ "$FAIL_COUNT" -gt 0 ]; then
            echo "[WATCHDOG] Este nodo ahora es PRIMARY. Watchdog en espera."
        fi
        FAIL_COUNT=0
        continue
    fi

    # ─── Verificar disponibilidad del PRIMARY ─────────────────────
    if PGPASSWORD="$PG_PASS" pg_isready -h "$PRIMARY_HOST" \
                                         -p "$PRIMARY_PORT" \
                                         -U "$PG_USER" \
                                         -t 3 > /dev/null 2>&1; then
        # PRIMARY responde — reset contador
        FAIL_COUNT=0
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo "[WATCHDOG] PRIMARY no responde. Fallo $FAIL_COUNT/$MAX_FAILS"

        if [ "$FAIL_COUNT" -ge "$MAX_FAILS" ]; then
            echo "[WATCHDOG] *** FALLO CRITICO: Promoviendo este STANDBY a PRIMARY ***"

            # Intentar promocion via funcion SQL (PostgreSQL 12+)
            if PGPASSWORD="$PG_PASS" psql -U "$PG_USER" -d postgres \
               -c "SELECT pg_promote();" > /dev/null 2>&1; then
                echo "[WATCHDOG] Promocion exitosa via pg_promote()"
            else
                # Fallback: pg_ctl promote
                pg_ctl promote -D "$PGDATA" && \
                echo "[WATCHDOG] Promocion exitosa via pg_ctl promote"
            fi

            FAIL_COUNT=0
            echo "[WATCHDOG] Este nodo es ahora PRIMARY. Disponible para escritura."
        fi
    fi
done
