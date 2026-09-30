from __future__ import annotations

import json
import logging
import os
import signal
import time
from typing import Any

import psycopg
from confluent_kafka import Producer
from psycopg.rows import dict_row

from banking.config import POSTGRES_SCHEMA, postgres_dsn

LOG = logging.getLogger("outbox-publisher")
RUNNING = True


def _stop(*_: object) -> None:
    global RUNNING
    RUNNING = False


def build_envelope(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": event["eventkey"],
        "event_type": event["eventtype"],
        "event_version": os.getenv("EVENT_VERSION", "1.0"),
        "occurred_at": event["createdat"].isoformat(),
        "aggregate_type": event["aggregatetype"],
        "aggregate_id": event["aggregateid"],
        "payload": event["payloadjson"],
        "source_system": "banking_postgresql",
        "outbox_id": event["eventoutboxid"],
    }


def validate_envelope(envelope: dict[str, Any]) -> None:
    required = (
        "event_id", "event_type", "event_version", "occurred_at",
        "aggregate_type", "aggregate_id", "payload", "source_system",
    )
    missing = [field for field in required if envelope.get(field) is None]
    if missing:
        raise ValueError(f"invalid event envelope; missing fields: {missing}")


def publish_once(connection, producer: Producer, topic: str, limit: int = 100) -> int:
    with connection.transaction():
        events = connection.execute(
            """
            SELECT eventoutboxid, eventkey, aggregatetype, aggregateid, eventtype,
                   payloadjson, createdat
            FROM event_outbox
            WHERE status IN ('PENDING','FAILED')
            ORDER BY createdat
            LIMIT %s FOR UPDATE SKIP LOCKED
            """,
            (limit,),
        ).fetchall()
        published = 0
        for event in events:
            envelope = build_envelope(event)
            validate_envelope(envelope)
            delivery_error: list[Exception] = []

            def delivered(error, _message) -> None:
                if error:
                    delivery_error.append(RuntimeError(str(error)))

            producer.produce(
                topic,
                key=event["eventkey"].encode(),
                value=json.dumps(envelope, default=str).encode(),
                on_delivery=delivered,
            )
            undelivered = producer.flush(15)
            if delivery_error:
                connection.execute(
                    "UPDATE event_outbox SET status='FAILED', publishedat=NULL WHERE eventoutboxid=%s",
                    (event["eventoutboxid"],),
                )
                LOG.error("outbox_delivery_failed event_id=%s error=%s", event["eventkey"], delivery_error[0])
                continue
            if undelivered:
                connection.execute(
                    "UPDATE event_outbox SET status='FAILED', publishedat=NULL WHERE eventoutboxid=%s",
                    (event["eventoutboxid"],),
                )
                LOG.error("outbox_delivery_timeout event_id=%s pending=%s", event["eventkey"], undelivered)
                continue
            connection.execute(
                "UPDATE event_outbox SET status='PUBLISHED', publishedat=clock_timestamp() WHERE eventoutboxid=%s",
                (event["eventoutboxid"],),
            )
            published += 1
    return published


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    signal.signal(signal.SIGTERM, _stop)
    producer = Producer(
        {
            "bootstrap.servers": os.environ["KAFKA_BOOTSTRAP_SERVERS"],
            "enable.idempotence": True,
            "acks": "all",
        }
    )
    topic = os.getenv("KAFKA_TRANSACTION_TOPIC", "banking.transaction-events.v1")
    with psycopg.connect(
        postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}"
    ) as connection:
        while RUNNING:
            try:
                count = publish_once(connection, producer, topic)
                if not count:
                    time.sleep(1)
            except Exception:
                connection.rollback()
                LOG.exception("outbox_publish_failed")
                time.sleep(3)


if __name__ == "__main__":
    main()
