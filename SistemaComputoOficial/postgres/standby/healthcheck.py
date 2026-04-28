#!/usr/bin/env python3
"""Mismo healthcheck que el primary — detecta si el nodo es PRIMARY o STANDBY."""
import http.server
import subprocess
import os
import sys

PORT = 8008
PG_USER = os.environ.get("POSTGRES_USER", "postgres")
PG_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "")


def _run_pg_query(sql: str):
    env = {**os.environ, "PGPASSWORD": PG_PASSWORD}
    try:
        r = subprocess.run(
            ["psql", "-U", PG_USER, "-d", "postgres", "-t", "-A", "-c", sql],
            capture_output=True, text=True, timeout=5, env=env
        )
        return r.stdout.strip()
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
        result = _run_pg_query("SELECT pg_is_in_recovery();")
        if result == "f":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"PRIMARY\n")
        elif result == "t":
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"STANDBY\n")
        else:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"NOT_READY\n")

    def _handle_alive(self):
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
        pass


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), HealthHandler)
    print(f"[STANDBY-HEALTH] Escuchando en puerto {PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
