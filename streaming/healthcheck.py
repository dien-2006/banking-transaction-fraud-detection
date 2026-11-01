"""Dependency-aware health checks for long-running Realtime services."""

from __future__ import annotations

import argparse
import os

import psycopg
from confluent_kafka.admin import AdminClient
from minio import Minio

from scripts.postgres_config import postgres_dsn


def check_kafka() -> None:
    topic = os.getenv("KAFKA_TRANSACTION_TOPIC", "banking.transaction-events.v1")
    metadata = AdminClient(
        {"bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"]}
    ).list_topics(timeout=5)
    if topic not in metadata.topics:
        raise RuntimeError(f"Kafka topic is unavailable: {topic}")


def check_publisher() -> None:
    check_kafka()
    with psycopg.connect(postgres_dsn(), connect_timeout=5) as connection:
        connection.execute("SELECT 1").fetchone()


def check_consumer() -> None:
    check_kafka()
    endpoint = os.environ["MINIO_ENDPOINT"]
    client = Minio(
        endpoint.removeprefix("http://").removeprefix("https://"),
        access_key=os.environ["MINIO_ACCESS_KEY"],
        secret_key=os.environ["MINIO_SECRET_KEY"],
        secure=endpoint.startswith("https://"),
    )
    bucket = os.getenv("MINIO_BUCKET_BRONZE", "bronze")
    if not client.bucket_exists(bucket):
        raise RuntimeError(f"MinIO Bronze bucket is unavailable: {bucket}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("service", choices=("publisher", "consumer"))
    args = parser.parse_args()
    if args.service == "publisher":
        check_publisher()
    else:
        check_consumer()


if __name__ == "__main__":
    main()
