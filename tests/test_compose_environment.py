"""Single .env must not grant every container every service's secrets."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def services():
    if not shutil.which("docker"):
        pytest.skip("Docker Compose is required to resolve service environments")
    # Values are test-only and never reuse the developer's local credentials.
    env = {key: value for key, value in os.environ.items() if key in ("PATH", "HOME", "DOCKER_CONFIG", "DOCKER_HOST")}
    for scope in ("BANKING", "OUTBOX", "NOTIFICATION", "ETL"):
        env[f"{scope}_DB_USER"] = f"test_{scope.lower()}"
        env[f"{scope}_DB_PASSWORD"] = f"test_only_{scope.lower()}"
    env.update(POSTGRES_PASSWORD="test_only_admin", JWT_SECRET="test_only_jwt", OTP_HASH_SECRET="test_only_otp",
               MINIO_ROOT_PASSWORD="test_only_storage", BREVO_API_KEY="test_only_email")
    result = subprocess.run(["docker", "compose", "--env-file", ".env.example", "--profile", "realtime", "--profile", "ml", "--profile", "demo",
                             "config", "--format", "json"], cwd=ROOT, env=env, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)["services"]


@pytest.mark.parametrize("scope,names", [
    ("banking", ["banking-api"]), ("outbox", ["outbox-publisher"]),
    ("notification", ["notification-sender"]),
    ("etl", ["spark-master", "spark-worker", "airflow-webserver", "airflow-scheduler", "bronze-consumer", "model-sync"]),
])
def test_runtime_uses_only_its_own_database_identity(services, scope, names):
    for name in names:
        env = services[name]["environment"]
        assert env["POSTGRES_USER"] == f"test_{scope}"
        assert env["POSTGRES_PASSWORD"] == f"test_only_{scope}"
        assert env["POSTGRES_DB"] == "D4Bank"
        assert env["POSTGRES_HOST"] == "postgres-bank"
        assert "test_only_admin" not in env.values()
        assert not any(key.endswith(("_DB_USER", "_DB_PASSWORD", "_ENV_FILE")) and not key.startswith("AIRFLOW_") for key in env)
        if scope != "banking":
            assert "JWT_SECRET" not in env
            assert "OTP_HASH_SECRET" not in env
        if scope not in ("banking", "notification"):
            assert "BREVO_API_KEY" not in env
        assert "MINIO_ROOT_PASSWORD" not in env


def test_pipeline_storage_and_bootstrap_credentials_are_preserved(services):
    for name in ("spark-master", "spark-worker", "bronze-consumer", "model-sync", "airflow-webserver"):
        env = services[name]["environment"]
        assert env["MINIO_SECRET_KEY"] == "test_only_storage"
        assert env["MINIO_BUCKET_GOLD"] == "gold"
        assert env["KAFKA_CONSUMER_GROUP"] == "bronze-transaction-writer-v1"
        assert env["MODEL_DB_MAPPING"] == "{}"
    assert services["demo-bootstrap"]["environment"]["POSTGRES_PASSWORD"] == "test_only_admin"
    assert services["postgres-bank"]["environment"]["POSTGRES_PASSWORD"] == "test_only_admin"
    assert "JWT_SECRET" not in services["postgres-bank"]["environment"]
    assert services["notification-sender"]["environment"]["NOTIFICATION_BATCH_SIZE"] == "20"


def test_banking_schema_and_demo_data_require_manual_setup(services):
    postgres = services["postgres-bank"]
    assert not any(
        volume["target"].startswith("/docker-entrypoint-initdb.d")
        for volume in postgres.get("volumes", [])
    )
    assert "demo" in services["demo-bootstrap"]["profiles"]
    assert "demo-bootstrap" not in services["banking-api"].get("depends_on", {})
