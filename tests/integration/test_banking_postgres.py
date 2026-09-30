from __future__ import annotations

import os
import uuid
from decimal import Decimal

import psycopg
import pytest
from psycopg.rows import dict_row

from banking.config import POSTGRES_SCHEMA, postgres_dsn
from banking.service import BusinessRejection, TransferService
from scripts.bootstrap_demo import main as bootstrap_demo


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_BANKING_INTEGRATION") != "1",
    reason="set RUN_BANKING_INTEGRATION=1 with PostgreSQL running",
)


class FixedPredictor:
    version = "v1"

    def __init__(self, probability: str):
        self.probability = Decimal(probability)

    def predict(self, _features):
        return self.probability


def service(probability: str) -> TransferService:
    return TransferService(
        postgres_dsn(), FixedPredictor(probability), POSTGRES_SCHEMA  # type: ignore[arg-type]
    )


@pytest.fixture(scope="module")
def demo():
    bootstrap_demo()
    with psycopg.connect(
        postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}"
    ) as connection:
        return connection.execute(
            """
            SELECT c.customerid, d.deviceid,
                   source.accountid AS sourceid,
                   destination.accountid AS destinationid
            FROM customer c
            JOIN customer_device d
              ON d.customerid=c.customerid AND d.devicecode='DEMO-DEVICE'
            CROSS JOIN bank_account source
            CROSS JOIN bank_account destination
            WHERE c.customercode='DEMO-CUSTOMER'
              AND source.accountnumber='DEMO-0001'
              AND destination.accountnumber='DEMO-0002'
            """
        ).fetchone()


def request(demo, amount: str = "1000", customer_id: int | None = None) -> dict:
    return {
        "customer_id": customer_id or demo["customerid"],
        "source_account_id": demo["sourceid"],
        "destination_account_id": demo["destinationid"],
        "device_id": demo["deviceid"] if customer_id is None else None,
        "amount": Decimal(amount),
        "idempotency_key": f"pytest-{uuid.uuid4()}",
        "channel": "MobileBanking",
    }


def financial_evidence(transaction_id: int) -> dict:
    with psycopg.connect(
        postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}"
    ) as connection:
        return connection.execute(
            """
            SELECT bt.status,
                   count(DISTINCT tp.postingid) AS posting_count,
                   count(DISTINCT eo.eventoutboxid) AS outbox_count
            FROM bank_transaction bt
            LEFT JOIN transaction_posting tp USING (transactionid)
            LEFT JOIN event_outbox eo
              ON eo.aggregateid=bt.transactionid::text
             AND eo.eventtype='TransactionCompleted'
            WHERE bt.transactionid=%s
            GROUP BY bt.status
            """,
            (transaction_id,),
        ).fetchone()


def test_allow_posts_atomically_and_retry_is_idempotent(demo):
    banking = service("0.10")
    command = request(demo)
    first = banking.create_transfer(**command)
    second = banking.create_transfer(**command)

    assert first["decision"] == "ALLOW"
    assert second["transactionid"] == first["transactionid"]
    assert financial_evidence(first["transactionid"]) == {
        "status": "Success",
        "posting_count": 2,
        "outbox_count": 1,
    }


def test_allow_with_insufficient_balance_never_posts(demo):
    banking = service("0.10")
    command = request(demo, "999999999999")
    with pytest.raises(BusinessRejection, match="insufficient balance"):
        banking.create_transfer(**command)

    existing = banking._find_by_idempotency_key(command["idempotency_key"])
    assert financial_evidence(existing["transactionid"]) == {
        "status": "Failed",
        "posting_count": 0,
        "outbox_count": 0,
    }


def test_block_and_unapproved_review_do_not_post(demo):
    blocked = service("0.95").create_transfer(**request(demo))
    assert blocked["decision"] == "BLOCK"
    assert financial_evidence(blocked["transactionid"])["posting_count"] == 0

    review_service = service("0.70")
    pending = review_service.create_transfer(**request(demo))
    assert pending["decision"] == "REVIEW"
    assert financial_evidence(pending["transactionid"])["posting_count"] == 0

    approved = review_service.review(pending["reviewcaseid"], approve=True)
    assert financial_evidence(approved["transactionid"])["posting_count"] == 2


def test_customer_cannot_debit_an_account_they_do_not_hold(demo):
    with psycopg.connect(
        postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}"
    ) as connection, connection.transaction():
        customer_id = connection.execute(
            """
            INSERT INTO customer(customercode, fullname)
            VALUES (%s, 'Unauthorized Test')
            RETURNING customerid
            """,
            (f"PYTEST-{uuid.uuid4().hex[:12]}",),
        ).fetchone()["customerid"]

    with pytest.raises(
        BusinessRejection, match="not an active source account holder"
    ):
        service("0.10").create_transfer(**request(demo, customer_id=customer_id))
