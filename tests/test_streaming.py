from datetime import datetime

from streaming.publisher.service import build_envelope, validate_envelope


def test_outbox_envelope_preserves_identity_and_payload():
    row = {
        "eventoutboxid": 11,
        "eventkey": "event-11",
        "aggregatetype": "BANK_TRANSACTION",
        "aggregateid": "101",
        "eventtype": "TransactionCompleted",
        "payloadjson": {"transaction_id": 101, "status": "Success"},
        "createdat": datetime(2026, 1, 1, 1, 2, 3),
    }
    envelope = build_envelope(row)
    validate_envelope(envelope)
    assert envelope["event_id"] == "event-11"
    assert envelope["aggregate_id"] == "101"
    assert envelope["payload"]["transaction_id"] == 101
