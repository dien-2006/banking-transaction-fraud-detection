import json
from datetime import datetime, timezone
from unittest.mock import Mock

from streaming.consumer.service import persist_message, persist_rejected


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






def test_consumer_storage_failure_never_commits_or_advances() -> None:
    import pytest
    from streaming.consumer.service import process_message
    consumer, store = Mock(), Mock()
    store.put_object.side_effect = OSError('MinIO offline')
    with pytest.raises(OSError):
        process_message(consumer, store, 'bronze', 'quarantine', _message(json.dumps(_event()).encode()))
    consumer.commit.assert_not_called()


def test_consumer_quarantine_failure_never_commits() -> None:
    import pytest
    from streaming.consumer.service import process_message
    consumer, store = Mock(), Mock()
    store.stat_object.side_effect = OSError('quarantine unavailable')
    with pytest.raises(OSError):
        process_message(consumer, store, 'bronze', 'quarantine', _message(b'{invalid'))
    consumer.commit.assert_not_called()


def test_consumer_commits_after_verified_put_for_valid_and_rejected_messages() -> None:
    from streaming.consumer.service import process_message
    for raw, bucket in [(json.dumps(_event()).encode(),'bronze'),(b'{invalid','quarantine')]:
        operations=[]
        store,consumer=Mock(),Mock()
        store.put_object.side_effect=lambda *_a,**_kw: operations.append('put')
        store.stat_object.side_effect=lambda *_a,**_kw: operations.append('stat')
        consumer.commit.side_effect=lambda *_a,**_kw: operations.append('commit')
        name=process_message(consumer,store,'bronze','quarantine',_message(raw))
        assert operations==['put','stat','commit']
        store.stat_object.assert_called_once_with(bucket,name)


def test_replayed_kafka_offset_uses_message_date_not_consumer_clock() -> None:
    from streaming.consumer.service import durable_object_name
    message=_message(b'event')
    message.timestamp.return_value=(1,1767225600000)
    assert durable_object_name(message).startswith('kafka/events/date=2026-01-01/')


def test_invalid_payload_and_timestamp_are_quarantined_instead_of_poisoning_silver() -> None:
    from streaming.consumer.service import process_message
    for patch in [{'payload':[]},{'event_id':''},{'occurred_at':'not-a-date'}]:
        store,consumer=Mock(),Mock()
        envelope={**_event(),**patch}
        process_message(consumer,store,'bronze','quarantine',_message(json.dumps(envelope).encode()))
        assert store.put_object.call_args.args[0]=='quarantine'
        consumer.commit.assert_called_once()
