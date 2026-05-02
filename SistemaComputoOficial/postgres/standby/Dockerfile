FROM postgres:15
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 netcat-openbsd gosu && \
    rm -rf /var/lib/apt/lists/*
COPY healthcheck.py  /healthcheck.py
COPY watchdog.sh     /watchdog.sh
COPY entrypoint.sh   /entrypoint.sh
RUN sed -i 's/\r//' /watchdog.sh /entrypoint.sh && \
    chmod +x /watchdog.sh /entrypoint.sh
EXPOSE 5432 8008
ENTRYPOINT ["/entrypoint.sh"]