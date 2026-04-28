FROM postgres:15

# Instalar Python3 y netcat para healthcheck y watchdog
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 netcat-openbsd && \
    rm -rf /var/lib/apt/lists/*

# Copiar scripts del standby
COPY healthcheck.py  /healthcheck.py
COPY watchdog.sh     /watchdog.sh
COPY entrypoint.sh   /entrypoint.sh

RUN chmod +x /watchdog.sh /entrypoint.sh

EXPOSE 5432 8008

# El standby tiene su propio entrypoint que hace pg_basebackup si PGDATA vacio
ENTRYPOINT ["/entrypoint.sh"]
