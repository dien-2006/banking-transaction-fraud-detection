from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]


def _value(name: str, default: str | None = None) -> str:
    file_name = os.getenv(f"{name}_FILE")
    if file_name:
        return Path(file_name).read_text(encoding="utf-8").strip()
    value = os.getenv(name, default)
    if value is None:
        raise ValueError(f"Required configuration {name} is not set")
    return value


def load_yaml(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as handle:
        value = yaml.safe_load(handle) or {}
    if not isinstance(value, dict):
        raise ValueError(f"Configuration must be a mapping: {path}")
    return value


@dataclass(frozen=True)
class Settings:
    postgres_host: str
    postgres_port: int
    postgres_database: str
    postgres_user: str
    postgres_password: str
    postgres_schema: str
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool
    bronze_bucket: str
    silver_bucket: str
    gold_bucket: str
    quarantine_bucket: str
    control_bucket: str
    ml_bucket: str
    kafka_bootstrap_servers: str
    kafka_topic: str
    kafka_consumer_group: str
    spark_master: str
    source_timezone: str

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(REPO_ROOT / ".env", override=False)
        endpoint = _value("MINIO_ENDPOINT", os.getenv("MINIO_ENDPOINT_DOCKER", "http://minio:9000"))
        secure = endpoint.startswith("https://")
        endpoint = endpoint.removeprefix("http://").removeprefix("https://").rstrip("/")
        return cls(
            postgres_host=_value("POSTGRES_HOST", "postgres-bank"),
            postgres_port=int(_value("POSTGRES_INTERNAL_PORT", "5432")),
            postgres_database=_value("POSTGRES_DB"),
            postgres_user=_value("POSTGRES_USER"),
            postgres_password=_value("POSTGRES_PASSWORD"),
            postgres_schema=_value("POSTGRES_SCHEMA", "banking"),
            minio_endpoint=endpoint,
            minio_access_key=_value("MINIO_ACCESS_KEY", os.getenv("MINIO_ROOT_USER", "minioadmin")),
            minio_secret_key=_value("MINIO_SECRET_KEY", os.getenv("MINIO_ROOT_PASSWORD")),
            minio_secure=secure,
            bronze_bucket=_value("MINIO_BUCKET_BRONZE", "bronze"),
            silver_bucket=_value("MINIO_BUCKET_SILVER", "silver"),
            gold_bucket=_value("MINIO_BUCKET_GOLD", "gold"),
            quarantine_bucket=_value("MINIO_BUCKET_QUARANTINE", "quarantine"),
            control_bucket=_value("MINIO_BUCKET_CONTROL", "pipeline-control"),
            ml_bucket=_value("MINIO_BUCKET_ML", "ml-models"),
            kafka_bootstrap_servers=_value(
                "KAFKA_BOOTSTRAP_SERVERS", os.getenv("KAFKA_BOOTSTRAP_SERVERS_DOCKER", "kafka1:29092,kafka2:29092,kafka3:29092")
            ),
            kafka_topic=_value("KAFKA_TRANSACTION_TOPIC", "banking.transaction-events.v1"),
            kafka_consumer_group=_value("KAFKA_CONSUMER_GROUP", "bronze-transaction-writer-v1"),
            spark_master=_value("SPARK_MASTER_URL", "spark://spark-master:7077"),
            source_timezone=_value("SOURCE_TIMEZONE", "Asia/Ho_Chi_Minh"),
        )

    @property
    def jdbc_url(self) -> str:
        return f"jdbc:postgresql://{self.postgres_host}:{self.postgres_port}/{self.postgres_database}"

    @property
    def postgres_dsn(self) -> str:
        return (
            f"host={self.postgres_host} port={self.postgres_port} dbname={self.postgres_database} "
            f"user={self.postgres_user} password={self.postgres_password}"
        )

    @property
    def minio_url(self) -> str:
        return f"{'https' if self.minio_secure else 'http'}://{self.minio_endpoint}"


def source_catalog() -> dict[str, Any]:
    return load_yaml(REPO_ROOT / "config" / "sources.yaml")


def event_catalog() -> dict[str, Any]:
    return load_yaml(REPO_ROOT / "config" / "events.yaml")


def quality_catalog() -> dict[str, Any]:
    return load_yaml(REPO_ROOT / "config" / "data_quality.yaml")
