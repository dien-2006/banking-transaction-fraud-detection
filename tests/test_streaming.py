import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock

from streaming.consumer.service import persist_message, persist_rejected
from streaming.publisher.service import build_envelope, publish_once, validate_envelope


def _event() -> dict:
    return {
        "event_id": "evt-1",
        "event_type": "TransactionCompleted",
        "event_version": "1.0",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "aggregate_type": "BANK_TRANSACTION",
        "aggregate_id": "10",
        "payload": {"transaction_id": 10, "status": "SUCCESS"},
        "source_system": "banking_postgresql",
    }


def _message(value: bytes) -> Mock:
    message = Mock()
    message.value.return_value = value
    message.topic.return_value = "events"
    message.partition.return_value = 0
    message.offset.return_value = 7
    message.timestamp.return_value = (1, 123)
    return message


def test_offset_is_committed_only_after_durable_storage_is_verified() -> None:
    message = _message(json.dumps(_event()).encode())
    minio = Mock()

    name = persist_message(minio, "bronze", message)

    minio.put_object.assert_called_once()
    minio.stat_object.assert_called_once_with("bronze", name)
    assert "offset=7" in name


def test_invalid_event_can_be_durably_quarantined() -> None:
    message = _message(b'{"event_id":"evt-1"}')
    minio = Mock()

    name = persist_rejected(minio, "quarantine", message, ValueError("missing payload"))

    minio.put_object.assert_called_once()
    minio.stat_object.assert_called_once_with("quarantine", name)
    assert "rejected" in name


def test_outbox_is_marked_failed_when_kafka_flush_times_out() -> None:
    connection = MagicMock()
    connection.execute.return_value.fetchall.return_value = [
        {
            "eventoutboxid": 1,
            "eventkey": "evt-1",
            "aggregatetype": "BANK_TRANSACTION",
            "aggregateid": "10",
            "eventtype": "TransactionCompleted",
            "payloadjson": {"transaction_id": 10},
            "createdat": datetime.now(timezone.utc),
        }
    ]
    producer = Mock()
    producer.flush.return_value = 1

    assert publish_once(connection, producer, "events") == 0

    executed_sql = [call.args[0] for call in connection.execute.call_args_list]
    assert not any("status='PUBLISHED'" in sql for sql in executed_sql)
    assert any("status='FAILED'" in sql for sql in executed_sql)


def test_publisher_builds_versioned_envelope() -> None:
    envelope = build_envelope(
        {
            "eventoutboxid": 12,
            "eventkey": "evt-12",
            "eventtype": "TransactionCompleted",
            "aggregatetype": "BANK_TRANSACTION",
            "aggregateid": "99",
            "payloadjson": {"transaction_id": 99},
            "createdat": datetime.now(timezone.utc),
        }
    )

    validate_envelope(envelope)
    assert envelope["event_version"] == "1.0"
    assert envelope["outbox_id"] == 12
    assert envelope["source_system"] == "banking_postgresql"
