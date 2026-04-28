FROM postgres:15

# Instalar Python3 para el servidor HTTP de healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 && \
    rm -rf /var/lib/apt/lists/*

# Scripts de inicializacion y healthcheck
COPY init-primary.sh /docker-entrypoint-initdb.d/01-init-primary.sh
COPY healthcheck.py  /healthcheck.py
COPY entrypoint.sh   /entrypoint.sh

RUN chmod +x /docker-entrypoint-initdb.d/01-init-primary.sh \
             /entrypoint.sh

EXPOSE 5432 8008

# Wrapper: lanza healthcheck HTTP + entrypoint estandar de postgres
ENTRYPOINT ["/entrypoint.sh"]
CMD ["postgres"]
