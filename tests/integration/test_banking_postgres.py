from __future__ import annotations

import os
import json
from pathlib import Path
import uuid
from datetime import datetime
from decimal import Decimal

import psycopg
import pytest
from psycopg.rows import dict_row

from scripts.bootstrap_demo import main as bootstrap_demo
from scripts.postgres_config import POSTGRES_SCHEMA, postgres_dsn


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_BANKING_INTEGRATION") != "1",
    reason="set RUN_BANKING_INTEGRATION=1 with PostgreSQL running",
)


@pytest.fixture(scope="module")
def demo():
    if not os.environ.get('POSTGRES_DB', '').startswith('d4_'):
        pytest.skip('banking write fixtures require an isolated d4_* database')
    bootstrap_demo()
    with psycopg.connect(
        postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}"
    ) as connection:
        connection.execute("UPDATE bank_account SET balance=100000000 WHERE accountnumber IN ('DEMO-0001','DEMO-0002')")
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


def model_context(connection, *, neutral=False):
    artifact = json.loads((Path(__file__).resolve().parents[2] / "ml/artifacts/fraud_detection/v1/model.json").read_text())
    artifact["modelVersionId"] = connection.execute("SELECT modelversionid FROM banking.model_version WHERE modelname='fraud_detection_v1' AND status='ACTIVE' ORDER BY modelversionid DESC LIMIT 1").fetchone()["modelversionid"]
    if neutral:
        # Financial concurrency/retry tests isolate ML history effects; actual
        # coefficients and decision thresholds have separate integration tests.
        artifact.update(intercept=-40, weights=dict.fromkeys(artifact['weights'], 0))
    connection.execute("SELECT set_config('app.fraud_model',%s,true)", (json.dumps(artifact),))


def create_transfer(
    demo,
    *,
    idempotency_key: str,
    amount: str = "1000",
    customer_id: int | None = None,
) -> dict:
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as connection:
        model_context(connection, neutral=True)
        row = connection.execute(
            """
            SELECT banking_api.create_transfer(
                %s, %s, %s, %s, %s, 'MobileBanking', %s, NULL,
                'SQL contract integration test'
            ) AS result
            """,
            (
                customer_id or demo["customerid"],
                demo["sourceid"],
                demo["destinationid"],
                Decimal(amount),
                idempotency_key,
                demo["deviceid"] if customer_id is None else None,
            ),
        ).fetchone()
        return row["result"]


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
    idempotency_key = f"pytest-{uuid.uuid4()}"
    first = create_transfer(demo, idempotency_key=idempotency_key)
    second = create_transfer(demo, idempotency_key=idempotency_key)

    assert first["decision"] == "ALLOW"
    assert second["transactionid"] == first["transactionid"]
    assert financial_evidence(first["transactionid"]) == {
        "status": "Success",
        "posting_count": 2,
        "outbox_count": 1,
    }


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
        psycopg.errors.RaiseException,
        match="FORBIDDEN:customer does not own source account",
    ):
        create_transfer(
            demo,
            customer_id=customer_id,
            idempotency_key=f"pytest-{uuid.uuid4()}",
        )


def test_database_risk_contract_applies_documented_rules(demo):
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as connection:
        model_context(connection)
        result = connection.execute(
            "SELECT banking_api.calculate_risk(%s, NULL, %s, %s) AS result",
            (demo["customerid"], Decimal("50000000"), datetime(2026, 1, 1, 1)),
        ).fetchone()["result"]

    assert result["ruleScore"] >= 50
    assert {"R01_HIGH_AMOUNT", "R02_NEW_DEVICE", "R03_UNUSUAL_TIME"}.issubset(
        set(result["triggeredRules"])
    )


def test_model_context_really_changes_online_probability_and_matches_python(demo):
    from ml.inference.predictor import FraudPredictor
    path = Path(__file__).resolve().parents[2] / 'ml/artifacts/fraud_detection/v1/model.json'
    with psycopg.connect(postgres_dsn(), row_factory=dict_row) as connection:
        model_context(connection)
        value = connection.execute('SELECT banking_api.calculate_risk(%s,%s,1000,%s) AS result',
                                   (demo['customerid'], demo['deviceid'], datetime(2026, 1, 1, 1))).fetchone()['result']
        features = value['features']
        probability = FraudPredictor(path).predict({
            'amount_log': __import__('math').log1p(1000)/20,
            'is_new_device': int(features['isNewDevice']), 'is_unusual_time': 1,
            'transactions_last_10m': features['transactionsLast10m'],
            'failed_logins_last_30m': features['failedLoginsLast30m'],
            'amount_to_average_ratio': features['amountToAverageRatio'],
        })
        assert Decimal(str(value['modelProbability'])) == probability
        artifact = json.loads(path.read_text())
        artifact.update(intercept=40, weights=dict.fromkeys(artifact['weights'], 0))
        connection.execute("SELECT set_config('app.fraud_model',%s,true)", (json.dumps(artifact),))
        blocked = connection.execute('SELECT banking_api.calculate_risk(%s,%s,1000,%s) AS result',
                                     (demo['customerid'], demo['deviceid'], datetime(2026, 1, 1, 1))).fetchone()['result']
        assert blocked['decision'] == 'BLOCK'
        assert blocked['modelProbability'] != value['modelProbability']


def test_concurrent_debits_cannot_overspend(demo):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    if not os.environ['POSTGRES_DB'].startswith('d4_'):
        pytest.skip('destructive fixture is restricted to an isolated d4_* test database')
    with psycopg.connect(postgres_dsn()) as connection:
        connection.execute('UPDATE banking.bank_account SET balance=1000 WHERE accountid=%s', (demo['sourceid'],))
    barrier = Barrier(2)
    def transfer():
        barrier.wait(timeout=10)
        return create_transfer(demo, idempotency_key=f'concurrent-{uuid.uuid4()}', amount='600')
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: transfer(), range(2)))
    assert sorted(r['status'] for r in results) == ['Failed', 'Success']
    with psycopg.connect(postgres_dsn()) as connection:
        assert connection.execute('SELECT balance FROM banking.bank_account WHERE accountid=%s', (demo['sourceid'],)).fetchone()[0] == Decimal('400')
    for result in results:
        assert financial_evidence(result['transactionid'])['posting_count'] == (2 if result['status']=='Success' else 0)
