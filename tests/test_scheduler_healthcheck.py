"""Exercise the deployed scheduler probe without an Airflow CLI or real database."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
from threading import Thread

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def scheduler_config():
    return yaml.safe_load((ROOT / "docker-compose.yaml").read_text())["services"]["airflow-scheduler"]


def test_scheduler_probe_uses_its_own_private_heartbeat_server():
    scheduler = scheduler_config()
    env = scheduler["environment"]
    assert env["AIRFLOW__SCHEDULER__ENABLE_HEALTH_CHECK"] == "true"
    assert env["AIRFLOW__SCHEDULER__SCHEDULER_HEALTH_CHECK_SERVER_PORT"] == "8974"
    assert env["AIRFLOW__CORE__PARALLELISM"] == 1
    assert env["POSTGRES_USER"] == "${ETL_DB_USER:-d4_etl}"
    assert not scheduler.get("ports")
    assert scheduler["healthcheck"]["test"][:3] == ["CMD", "python", "-c"]


@pytest.mark.parametrize("http_status,healthy", [(200, True), (503, False)])
def test_scheduler_probe_preserves_unhealthy_http_status(http_status, healthy):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(http_status if self.path == "/health" else 404)
            self.end_headers()

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        probe = scheduler_config()["healthcheck"]["test"][3]
        assert "http://127.0.0.1:8974/health" in probe
        probe = probe.replace(":8974/", f":{server.server_port}/")
        result = subprocess.run([sys.executable, "-c", probe], capture_output=True, timeout=5)
        assert (result.returncode == 0) is healthy
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
