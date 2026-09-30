from __future__ import annotations

import json
import os
import socket
import urllib.request


def check_http(name: str, url: str) -> tuple[str, bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return name, response.status < 500, str(response.status)
    except Exception as exc:
        return name, False, str(exc)


def check_tcp(name: str, host: str, port: int) -> tuple[str, bool, str]:
    try:
        with socket.create_connection((host, port), timeout=5):
            return name, True, "connected"
    except Exception as exc:
        return name, False, str(exc)


def main() -> None:
    checks = [
        check_tcp("postgres", "localhost", int(os.getenv("POSTGRES_PORT", "5432"))),
        check_tcp("kafka", "localhost", int(os.getenv("KAFKA1_PORT", "9092"))),
        check_http("minio", f"http://localhost:{os.getenv('MINIO_API_PORT', '9000')}/minio/health/ready"),
        check_http("spark", f"http://localhost:{os.getenv('SPARK_MASTER_UI_PORT', '8082')}/json/"),
        check_http("airflow", f"http://localhost:{os.getenv('AIRFLOW_PORT', '8081')}/health"),
        check_http("trino", f"http://localhost:{os.getenv('TRINO_PORT', '8084')}/v1/info"),
        check_http("banking_api", f"http://localhost:{os.getenv('BANKING_API_PORT', '8000')}/health"),
    ]
    print(json.dumps({name: {"ok": ok, "detail": detail} for name, ok, detail in checks}, indent=2))
    if not all(ok for _, ok, _ in checks):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
