from __future__ import annotations

import hashlib
import io
import json
import os
import signal
from collections import defaultdict
from datetime import datetime, timezone

import pyarrow as pa
import pyarrow.parquet as pq
from confluent_kafka import Consumer, KafkaError, TopicPartition

from data_engineering.common.config import Settings
from data_engineering.common.logging import event, get_logger
from data_engineering.common.storage import ObjectStore


LOG = get_logger(__name__)
RUNNING = True


def _stop(_signum, _frame) -> None:
    global RUNNING
    RUNNING = False


def _record(message, envelope: dict, raw_value: str) -> dict:
    return {
        "event_id": envelope.get("event_id"), "event_type": envelope.get("event_type"),
        "event_version": envelope.get("event_version"), "occurred_at": envelope.get("occurred_at"),
        "aggregate_type": envelope.get("aggregate_type"), "aggregate_id": envelope.get("aggregate_id"),
        "payload_json": json.dumps(envelope.get("payload"), ensure_ascii=False, default=str),
        "source_system": envelope.get("source_system"), "correlation_id": envelope.get("correlation_id"),
        "outbox_id": envelope.get("outbox_id"), "_raw_event": raw_value,
        "_ingested_at": datetime.now(timezone.utc), "_source": "kafka",
        "_ingestion_mode": "STREAM", "_event_id": envelope.get("event_id"),
        "_kafka_topic": message.topic(), "_kafka_partition": message.partition(), "_kafka_offset": message.offset(),
        "_payload_hash": hashlib.sha256(raw_value.encode()).hexdigest(),
    }


def _validate(envelope: dict) -> list[str]:
    required = ("event_id", "event_type", "event_version", "occurred_at", "aggregate_type", "aggregate_id", "payload", "source_system")
    return [field for field in required if envelope.get(field) is None]


def _write_records(store: ObjectStore, settings: Settings, records: list[dict], quarantine: bool = False) -> str:
    table = pa.Table.from_pylist(records)
    output = io.BytesIO()
    pq.write_table(table, output, compression="snappy")
    body = output.getvalue()
    first, last = records[0], records[-1]
    now = datetime.now(timezone.utc)
    digest = hashlib.sha256(body).hexdigest()[:16]
    prefix = "kafka/transaction_events" if not quarantine else "kafka/transaction_events/rejected"
    key = (
        f"{prefix}/ingest_date={now.date().isoformat()}/hour={now:%H}/topic={first['_kafka_topic']}/"
        f"partition={first['_kafka_partition']}/offsets={first['_kafka_offset']}-{last['_kafka_offset']}-{digest}.parquet"
    )
    bucket = settings.bronze_bucket if not quarantine else settings.quarantine_bucket
    store.client.put_object(bucket, key, io.BytesIO(body), len(body), content_type="application/octet-stream")
    store.client.stat_object(bucket, key)
    return f"s3://{bucket}/{key}"


def _persist_partitioned(store: ObjectStore, settings: Settings, records: list[dict], quarantine: bool = False) -> list[str]:
    grouped: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for record in records:
        grouped[(record["_kafka_topic"], record["_kafka_partition"])].append(record)
    paths: list[str] = []
    for partition_records in grouped.values():
        partition_records.sort(key=lambda item: item["_kafka_offset"])
        paths.append(_write_records(store, settings, partition_records, quarantine=quarantine))
    return paths


def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    settings = Settings.from_env()
    store = ObjectStore(settings)
    store.ensure_buckets()
    consumer = Consumer({
        "bootstrap.servers": settings.kafka_bootstrap_servers,
        "group.id": settings.kafka_consumer_group,
        "enable.auto.commit": False,
        "auto.offset.reset": os.getenv("KAFKA_AUTO_OFFSET_RESET", "earliest"),
        "client.id": os.getenv("KAFKA_CONSUMER_CLIENT_ID", "bank-bronze-consumer"),
    })
    consumer.subscribe([settings.kafka_topic])
    batch_size = int(os.getenv("KAFKA_CONSUMER_BATCH_SIZE", "100"))
    once = os.getenv("RUN_ONCE", "false").lower() == "true"
    try:
        while RUNNING:
            messages = consumer.consume(num_messages=batch_size, timeout=5)
            if not messages:
                if once:
                    break
                continue
            valid: list[dict] = []
            invalid: list[dict] = []
            successful_messages = []
            for message in messages:
                if message.error():
                    if message.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    raise RuntimeError(str(message.error()))
                raw_value = message.value().decode("utf-8")
                try:
                    envelope = json.loads(raw_value)
                    missing = _validate(envelope)
                    record = _record(message, envelope, raw_value)
                    if missing:
                        record["_rejection_reason"] = f"MISSING_FIELDS:{','.join(missing)}"
                        invalid.append(record)
                    else:
                        valid.append(record)
                except Exception as exc:
                    record = _record(message, {}, raw_value)
                    record["_rejection_reason"] = f"INVALID_JSON:{type(exc).__name__}"
                    invalid.append(record)
                successful_messages.append(message)
            paths = []
            if valid:
                paths.extend(_persist_partitioned(store, settings, valid))
            if invalid:
                paths.extend(_persist_partitioned(store, settings, invalid, quarantine=True))
            if successful_messages:
                offsets = {}
                for message in successful_messages:
                    offsets[(message.topic(), message.partition())] = max(offsets.get((message.topic(), message.partition()), -1), message.offset())
                consumer.commit(offsets=[TopicPartition(topic, partition, offset + 1) for (topic, partition), offset in offsets.items()], asynchronous=False)
            event(LOG, "kafka_batch_persisted", consumed=len(successful_messages), valid=len(valid), rejected=len(invalid), paths=paths)
            if once:
                break
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
