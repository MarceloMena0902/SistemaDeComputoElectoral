#!/usr/bin/env python3
"""
Servidor HTTP de healthcheck para HAProxy.

GET /health  → 200 OK si es PRIMARY  |  503 si es STANDBY o no disponible
GET /alive   → 200 OK si PostgreSQL responde (para routing de lectura)
"""
import http.server
import subprocess
import os
import sys
import logging

logging.basicConfig(level=logging.WARNING, format="%(asctime)s [HEALTHCHECK] %(message)s")
logger = logging.getLogger(__name__)

PORT = 8008
PG_USER = os.environ.get("POSTGRES_USER", "postgres")
PG_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "")


def _run_pg_query(sql: str) -> str | None:
    """Ejecuta una query via psql y retorna el resultado limpio."""
    env = {**os.environ, "PGPASSWORD": PG_PASSWORD}
    try:
        result = subprocess.run(
            ["psql", "-U", PG_USER, "-d", "postgres", "-t", "-A", "-c", sql],
            capture_output=True, text=True, timeout=5, env=env
        )
        return result.stdout.strip()
    except Exception:
        return None


class HealthHandler(http.server.BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path.startswith("/health"):
            self._handle_health()
        elif self.path.startswith("/alive"):
            self._handle_alive()
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_health(self):
        """200 si PRIMARY, 503 si STANDBY — usado por HAProxy para routing de escritura."""
        result = _run_pg_query("SELECT pg_is_in_recovery();")
        if result == "f":
            # Este nodo es PRIMARY
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"PRIMARY\n")
        elif result == "t":
            # Este nodo es STANDBY
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"STANDBY\n")
        else:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"NOT_READY\n")

    def _handle_alive(self):
        """200 si PostgreSQL responde — usado por HAProxy para routing de lectura."""
        result = _run_pg_query("SELECT 1;")
        if result == "1":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ALIVE\n")
        else:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"UNREACHABLE\n")

    def log_message(self, fmt, *args):
        pass  # Silenciar logs de acceso HTTP


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), HealthHandler)
    logger.warning(f"Healthcheck HTTP server escuchando en puerto {PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
