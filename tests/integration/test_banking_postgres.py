from __future__ import annotations

import os
import uuid
from decimal import Decimal

import psycopg
import pytest
from psycopg.rows import dict_row

from banking.config import DatabaseSettings
from banking.service import BankingService, BusinessRejection, TransferCommand
from scripts.bootstrap_demo import main as bootstrap_demo


pytestmark = pytest.mark.skipif(os.getenv("RUN_BANKING_INTEGRATION") != "1", reason="set RUN_BANKING_INTEGRATION=1 with PostgreSQL running")


class FixedPredictor:
    version = "integration-test"

    def __init__(self, probability: str):
        self.probability = Decimal(probability)

    def predict(self, _context):
        return self.probability


@pytest.fixture(scope="module")
def demo():
    bootstrap_demo()
    settings = DatabaseSettings.from_env()
    with psycopg.connect(settings.dsn, row_factory=dict_row) as connection:
        return connection.execute("""
            SELECT c.customerid, d.deviceid, source.accountid sourceid, destination.accountid destinationid
            FROM banking.customer c
            JOIN banking.customer_device d ON d.customerid=c.customerid AND d.devicecode='DEVICE-DEMO-TRUSTED'
            CROSS JOIN banking.bank_account source
            CROSS JOIN banking.bank_account destination
            WHERE c.customercode='CUS-DEMO-001'
              AND source.accountnumber='DEMO-SOURCE-001'
              AND destination.accountnumber='DEMO-DEST-001'
        """).fetchone()


def command(demo, amount: str) -> TransferCommand:
    return TransferCommand(
        customer_id=demo["customerid"], source_account_id=demo["sourceid"], destination_account_id=demo["destinationid"],
        device_id=demo["deviceid"], amount=Decimal(amount), idempotency_key=f"pytest-{uuid.uuid4()}",
    )


def test_allow_posts_atomically_and_retry_is_idempotent(demo):
    service = BankingService(DatabaseSettings.from_env(), predictor=FixedPredictor("0.10"))
    request = command(demo, "1000")
    first = service.create_transfer(request)
    second = service.create_transfer(request)
    assert first["decision"] == "ALLOW"
    assert first["status"] == "Success"
    assert first["posting_count"] == 2
    assert second["transactionid"] == first["transactionid"]
    assert second["posting_count"] == 2


def test_allow_with_insufficient_balance_never_succeeds_or_posts(demo):
    service = BankingService(DatabaseSettings.from_env(), predictor=FixedPredictor("0.10"))
    request = command(demo, "999999999999")
    with pytest.raises(BusinessRejection, match="insufficient balance"):
        service.create_transfer(request)
    with psycopg.connect(service.settings.dsn, row_factory=dict_row) as connection:
        row = connection.execute("""
            SELECT bt.status, count(tp.postingid) posting_count, count(eo.eventoutboxid) outbox_count
            FROM banking.transfer_request tr JOIN banking.bank_transaction bt USING (transactionid)
            LEFT JOIN banking.transaction_posting tp USING (transactionid)
            LEFT JOIN banking.event_outbox eo ON eo.aggregateid=bt.transactionid::text AND eo.eventtype='TransactionCompleted'
            WHERE tr.idempotencykey=%s GROUP BY bt.status
        """, (request.idempotency_key,)).fetchone()
    assert row == {"status": "Failed", "posting_count": 0, "outbox_count": 0}


def test_block_and_unapproved_review_do_not_post_then_approval_can_post(demo):
    blocked_service = BankingService(DatabaseSettings.from_env(), predictor=FixedPredictor("0.95"))
    blocked = blocked_service.create_transfer(command(demo, "1000"))
    assert blocked["decision"] == "BLOCK"
    assert blocked["status"] == "Failed"
    assert blocked["posting_count"] == 0

    review_service = BankingService(DatabaseSettings.from_env(), predictor=FixedPredictor("0.70"))
    pending = review_service.create_transfer(command(demo, "1000"))
    assert pending["decision"] == "REVIEW"
    assert pending["status"] == "Pending"
    assert pending["posting_count"] == 0
    approved = review_service.review_transfer(pending["reviewcaseid"], "APPROVE", reason="integration test")
    assert approved["status"] == "Success"
    assert approved["posting_count"] == 2
