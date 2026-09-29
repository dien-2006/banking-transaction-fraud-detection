from __future__ import annotations

import json
import os
import signal
import time
from datetime import timezone
from typing import Any

import psycopg
from confluent_kafka import Producer

from data_engineering.common.config import Settings, event_catalog
from data_engineering.common.logging import event, get_logger


LOG = get_logger(__name__)
RUNNING = True


def _stop(_signum, _frame) -> None:
    global RUNNING
    RUNNING = False


def build_envelope(row: dict[str, Any]) -> dict[str, Any]:
    created_at = row["createdat"]
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
        
    return {
        "event_id": row["eventkey"],
        "event_type": row["eventtype"],
        "event_version": event_catalog()["event_version"],
        "occurred_at": created_at.isoformat(),
        "occurred_at_source": "event_outbox.createdat",
        "aggregate_type": row["aggregatetype"],
        "aggregate_id": row["aggregateid"],
        "payload": row["payloadjson"],
        "source_system": "banking_postgresql",
        "correlation_id": None,
        "outbox_id": row["eventoutboxid"],
    }


def validate_envelope(envelope: dict[str, Any]) -> None:
    required = ("event_id", "event_type", "event_version", "occurred_at", "aggregate_type", "aggregate_id", "payload", "source_system")
    missing = [field for field in required if envelope.get(field) is None]
    if missing:
        raise ValueError(f"Invalid event envelope; missing {missing}")


def run_once(settings: Settings, producer: Producer, limit: int) -> int:
    sql = f"""
        SELECT eventoutboxid, eventkey, aggregatetype, aggregateid, eventtype,
               payloadjson, createdat, publishedat, status
        FROM {settings.postgres_schema}.event_outbox
        WHERE status IN ('PENDING','FAILED')
        ORDER BY createdat, eventoutboxid
        LIMIT %s
        FOR UPDATE SKIP LOCKED
    """
    published = 0
    with psycopg.connect(settings.postgres_dsn, row_factory=psycopg.rows.dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, (limit,))
            rows = cursor.fetchall()
            for row in rows:
                try:
                    envelope = build_envelope(row)
                    validate_envelope(envelope)
                    delivery_error: list[Exception] = []
                    producer.produce(
                        settings.kafka_topic,
                        key=envelope["aggregate_id"].encode(),
                        value=json.dumps(envelope, ensure_ascii=False, default=str).encode(),
                        headers={"event_id": envelope["event_id"], "event_version": envelope["event_version"]},
                        on_delivery=lambda error, _message: delivery_error.append(error) if error else None,
                    )
                    remaining = producer.flush(30)
                    if remaining or delivery_error:
                        raise RuntimeError(f"Kafka acknowledgement failed: remaining={remaining}, error={delivery_error}")
                    cursor.execute(
                        f"UPDATE {settings.postgres_schema}.event_outbox SET status='PUBLISHED', publishedat=CURRENT_TIMESTAMP WHERE eventoutboxid=%s",
                        (row["eventoutboxid"],),
                    )
                    connection.commit()
                    published += 1
                    event(LOG, "outbox_event_published", event_id=row["eventkey"], outbox_id=row["eventoutboxid"], topic=settings.kafka_topic)
                except Exception as exc:
                    connection.rollback()
                    with connection.cursor() as failed_cursor:
                        failed_cursor.execute(
                            f"UPDATE {settings.postgres_schema}.event_outbox SET status='FAILED', publishedat=NULL WHERE eventoutboxid=%s",
                            (row["eventoutboxid"],),
                        )
                    connection.commit()
                    event(LOG, "outbox_publish_failed", event_id=row["eventkey"], outbox_id=row["eventoutboxid"], error=str(exc))
    return published


def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    settings = Settings.from_env()
    producer = Producer({
        "bootstrap.servers": settings.kafka_bootstrap_servers,
        "acks": "all", "enable.idempotence": True,
        "client.id": os.getenv("KAFKA_PRODUCER_CLIENT_ID", "bank-outbox-publisher"),
    })
    interval = float(os.getenv("OUTBOX_POLL_INTERVAL_SECONDS", "5"))
    limit = int(os.getenv("OUTBOX_BATCH_SIZE", "100"))
    once = os.getenv("RUN_ONCE", "false").lower() == "true"
    while RUNNING:
        count = run_once(settings, producer, limit)
        if once:
            break
        if count == 0:
            time.sleep(interval)
    producer.flush(30)


if __name__ == "__main__":
    main()
