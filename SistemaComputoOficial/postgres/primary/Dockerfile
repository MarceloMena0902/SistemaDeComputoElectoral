FROM postgres:15

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 && \
    rm -rf /var/lib/apt/lists/*

COPY init-primary.sh /docker-entrypoint-initdb.d/01-init-primary.sh
COPY healthcheck.py  /healthcheck.py
COPY entrypoint.sh   /entrypoint.sh

RUN sed -i 's/\r//' /docker-entrypoint-initdb.d/01-init-primary.sh \
                    /entrypoint.sh && \
    chmod +x /docker-entrypoint-initdb.d/01-init-primary.sh \
             /entrypoint.sh

EXPOSE 5432 8008

ENTRYPOINT ["/entrypoint.sh"]
CMD ["postgres"]