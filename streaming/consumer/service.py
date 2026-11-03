from __future__ import annotations

import hashlib
import json
import logging
import os
import signal
from datetime import datetime, timezone
from io import BytesIO

from confluent_kafka import Consumer, KafkaError, KafkaException
from minio import Minio

LOG = logging.getLogger("bronze-consumer")
RUNNING = True


def _stop(*_: object) -> None:
    global RUNNING
    RUNNING = False


def durable_object_name(message, prefix: str = "kafka/events") -> str:
    digest = hashlib.sha256(message.value()).hexdigest()[:16]
    return (
        f"{prefix}/date={datetime.fromtimestamp(max(message.timestamp()[1], 0) / 1000, timezone.utc):%Y-%m-%d}/"
        f"topic={message.topic()}/partition={message.partition()}/"
        f"offset={message.offset()}-{digest}.json"
    )


def _validate_envelope(envelope: dict) -> None:
    required = (
        "event_id", "event_type", "event_version", "occurred_at",
        "aggregate_type", "aggregate_id", "payload", "source_system",
    )
    missing = [field for field in required if envelope.get(field) is None]
    if missing:
        raise ValueError(f"missing envelope fields: {missing}")
    for field in ("event_id", "event_type", "event_version", "occurred_at", "aggregate_type", "aggregate_id", "source_system"):
        if not str(envelope[field]).strip():
            raise ValueError(f"empty envelope field: {field}")
    if not isinstance(envelope["payload"], dict):
        raise ValueError("event payload must be a JSON object")
    datetime.fromisoformat(str(envelope["occurred_at"]).replace("Z", "+00:00"))


def persist_message(client: Minio, bucket: str, message) -> str:
    raw = json.loads(message.value())
    if not isinstance(raw, dict):
        raise ValueError("event envelope must be a JSON object")
    _validate_envelope(raw)
    record = {
        "topic": message.topic(),
        "partition": message.partition(),
        "offset": message.offset(),
        "kafka_timestamp": message.timestamp()[1],
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "envelope": raw,
    }
    body = json.dumps(record, separators=(",", ":"), default=str).encode()
    name = durable_object_name(message)
    client.put_object(bucket, name, BytesIO(body), len(body), content_type="application/json")
    client.stat_object(bucket, name)
    return name


def persist_rejected(client: Minio, bucket: str, message, error: Exception) -> str:
    record = {
        "topic": message.topic(), "partition": message.partition(),
        "offset": message.offset(), "kafka_timestamp": message.timestamp()[1],
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "raw_value": message.value().decode("utf-8", errors="replace"),
        "error_code": type(error).__name__, "error_reason": str(error),
    }
    body = json.dumps(record, separators=(",", ":"), default=str).encode()
    name = durable_object_name(message, "kafka/events/rejected")
    client.put_object(bucket, name, BytesIO(body), len(body), content_type="application/json")
    client.stat_object(bucket, name)
    return name


def process_message(consumer, client: Minio, bucket: str, quarantine_bucket: str, message) -> str:
    try:
        object_name = persist_message(client, bucket, message)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        object_name = persist_rejected(client, quarantine_bucket, message, exc)
        LOG.warning("event_quarantined object=%s", object_name)
    consumer.commit(message=message, asynchronous=False)
    LOG.info("bronze_event_written object=%s", object_name)
    return object_name


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    signal.signal(signal.SIGTERM, _stop)
    endpoint = os.environ["MINIO_ENDPOINT"].removeprefix("http://").removeprefix("https://")
    minio = Minio(
        endpoint,
        access_key=os.environ["MINIO_ACCESS_KEY"],
        secret_key=os.environ["MINIO_SECRET_KEY"],
        secure=os.environ["MINIO_ENDPOINT"].startswith("https://"),
    )
    bucket = os.getenv("MINIO_BUCKET_BRONZE", "bronze")
    quarantine_bucket = os.getenv("MINIO_BUCKET_QUARANTINE", "quarantine")
    consumer = Consumer(
        {
            "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
            "group.id": os.getenv("KAFKA_CONSUMER_GROUP", "bronze-transaction-writer-v1"),
            "enable.auto.commit": False,
            "enable.auto.offset.store": False,
            "auto.offset.reset": "earliest",
        }
    )
    consumer.subscribe([os.getenv("KAFKA_TRANSACTION_TOPIC", "banking.transaction-events.v1")])
    try:
        while RUNNING:
            message = consumer.poll(1)
            if message is None:
                continue
            if message.error():
                if message.error().code() != KafkaError._PARTITION_EOF:
                    raise KafkaException(message.error())
                continue
            # Fail the process if either durable storage or offset commit fails.
            # Polling the next message could later commit past this failed offset.
            process_message(consumer, minio, bucket, quarantine_bucket, message)
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
