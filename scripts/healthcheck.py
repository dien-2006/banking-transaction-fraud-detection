from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Check:
    name: str
    command: tuple[str, ...] | None = None
    url: str | None = None


def _run(check: Check) -> tuple[bool, str]:
    try:
        if check.command:
            result = subprocess.run(check.command, capture_output=True, text=True, timeout=20, check=False)
            detail = (result.stdout or result.stderr).strip().splitlines()
            return result.returncode == 0, detail[-1] if detail else f"exit={result.returncode}"
        if check.url:
            with urllib.request.urlopen(check.url, timeout=5) as response:
                body = response.read(500).decode(errors="replace")
            return 200 <= response.status < 300, body
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"
    return False, "invalid check"


def main() -> None:
    load_dotenv(override=False)
    airflow_port = os.getenv("AIRFLOW_PORT", "8081")
    banking_port = os.getenv("BANKING_API_PORT", "8000")
    minio_port = os.getenv("MINIO_API_PORT", "9000")
    spark_port = os.getenv("SPARK_MASTER_UI_PORT", "8082")
    trino_port = os.getenv("TRINO_PORT", "8084")
    checks = (
        Check("PostgreSQL", command=("docker", "compose", "exec", "-T", "postgres-bank", "sh", "-lc", 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"')),
        Check("Kafka", command=("docker", "compose", "exec", "-T", "kafka1", "kafka-broker-api-versions", "--bootstrap-server", "kafka1:29092")),
        Check("MinIO", url=f"http://localhost:{minio_port}/minio/health/ready"),
        Check("Spark", url=f"http://localhost:{spark_port}/json/"),
        Check("Airflow", url=f"http://localhost:{airflow_port}/health"),
        Check("Trino", url=f"http://localhost:{trino_port}/v1/info"),
        Check("Hive Metastore", command=("docker", "inspect", "--format", "{{.State.Health.Status}}", "bank-hive-metastore")),
        Check("Banking/Risk API", url=f"http://localhost:{banking_port}/health"),
        Check("Outbox Publisher", command=("docker", "inspect", "--format", "{{.State.Health.Status}}", "bank-outbox-publisher")),
        Check("Kafka Consumer", command=("docker", "inspect", "--format", "{{.State.Health.Status}}", "bank-bronze-consumer")),
        Check("Model Sync", command=("docker", "inspect", "--format", "{{.State.Status}}", "bank-model-sync")),
    )
    results: dict[str, dict[str, str | bool]] = {}
    failed = False
    for check in checks:
        ok, detail = _run(check)
        if check.name in {"Outbox Publisher", "Kafka Consumer", "Hive Metastore"}:
            ok = ok and detail == "healthy"
        if check.name == "Model Sync":
            ok = ok and detail == "running"
        results[check.name] = {"ok": ok, "detail": detail[:300]}
        failed |= not ok
    print(json.dumps(results, ensure_ascii=False, indent=2, sort_keys=True))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
