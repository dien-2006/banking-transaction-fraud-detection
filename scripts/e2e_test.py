"""Opt-in demo financial transfer plus evidence through the data platform.

This script commits a demo transaction. It requires an authenticated staff JWT
and E2E_ALLOW_DEMO_TRANSFER=1 before it bootstraps or writes anything.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from decimal import Decimal
from typing import Any, Callable

import psycopg
from dotenv import load_dotenv
from minio import Minio
from psycopg.rows import dict_row

from scripts.bootstrap_demo import main as bootstrap_demo
from scripts.postgres_config import POSTGRES_SCHEMA, postgres_dsn


load_dotenv()


def _wait(name: str, probe: Callable[[], Any], timeout: int) -> Any:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            value = probe()
            if value:
                return value
        except Exception as exc:  # transient dependencies are expected during polling
            last_error = exc
        time.sleep(2)
    detail = f": {last_error}" if last_error else ""
    raise TimeoutError(f"timed out waiting for {name}{detail}")


def _json_request(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    username: str | None = None,
    password: str | None = None,
    bearer_token: str | None = None,
) -> Any:
    headers = {"Content-Type": "application/json"}
    if username is not None and password is not None:
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
    return json.loads(body) if body else None


def _database_evidence(transaction_id: int) -> dict[str, Any] | None:
    with psycopg.connect(
        postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}"
    ) as connection:
        row = connection.execute(
            """
            SELECT bt.status, ra.rulescore, ra.risklevel, ra.modelprobability,
                   ra.decision, count(DISTINCT tp.postingid) AS posting_count,
                   count(DISTINCT eo.eventoutboxid) AS outbox_count,
                   max(eo.status) AS outbox_status,
                   max(eo.eventkey) AS event_key
            FROM bank_transaction bt
            JOIN risk_assessment ra USING (transactionid)
            LEFT JOIN transaction_posting tp USING (transactionid)
            LEFT JOIN event_outbox eo
              ON eo.aggregateid=bt.transactionid::text
             AND eo.eventtype='TransactionCompleted'
            WHERE bt.transactionid=%s
            GROUP BY bt.status, ra.riskassessmentid
            ORDER BY ra.riskassessmentid DESC LIMIT 1
            """,
            (transaction_id,),
        ).fetchone()
    if not row or row["status"] != "Success" or row["posting_count"] != 2:
        return None
    return dict(row)


def _bronze_evidence(event_key: str) -> dict[str, Any] | None:
    endpoint_url = os.getenv("MINIO_ENDPOINT_HOST", "http://localhost:9000")
    client = Minio(
        endpoint_url.removeprefix("http://").removeprefix("https://"),
        access_key=os.environ["MINIO_ROOT_USER"],
        secret_key=os.environ["MINIO_ROOT_PASSWORD"],
        secure=endpoint_url.startswith("https://"),
    )
    bucket = os.getenv("MINIO_BUCKET_BRONZE", "bronze")
    for item in client.list_objects(bucket, prefix="kafka/events/", recursive=True):
        response = client.get_object(bucket, item.object_name)
        try:
            record = json.loads(response.read())
        finally:
            response.close()
            response.release_conn()
        if record.get("envelope", {}).get("event_id") == event_key:
            return {
                "object": item.object_name,
                "partition": record.get("partition"),
                "offset": record.get("offset"),
            }
    return None


def _trigger_airflow(run_id: str) -> None:
    base = f"http://localhost:{os.getenv('AIRFLOW_PORT', '8081')}"
    username = os.environ["AIRFLOW_ADMIN_USERNAME"]
    password = os.environ["AIRFLOW_ADMIN_PASSWORD"]
    _json_request(
        f"{base}/api/v1/dags/banking_bronze_silver_gold/dagRuns",
        method="POST",
        payload={"dag_run_id": run_id, "conf": {"requested_by": "e2e_test"}},
        username=username,
        password=password,
    )


def _airflow_state(run_id: str) -> str | None:
    base = f"http://localhost:{os.getenv('AIRFLOW_PORT', '8081')}"
    encoded = urllib.parse.quote(run_id, safe="")
    result = _json_request(
        f"{base}/api/v1/dags/banking_bronze_silver_gold/dagRuns/{encoded}",
        username=os.environ["AIRFLOW_ADMIN_USERNAME"],
        password=os.environ["AIRFLOW_ADMIN_PASSWORD"],
    )
    state = result.get("state")
    if state == "failed":
        raise RuntimeError(f"Airflow DAG failed: {run_id}")
    return state if state == "success" else None


def _trino_execute(sql: str) -> list[list[Any]]:
    request = urllib.request.Request(
        f"http://localhost:{os.getenv('TRINO_PORT', '8084')}/v1/statement",
        data=sql.encode(),
        headers={"X-Trino-User": "e2e", "Content-Type": "text/plain"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read())
    rows: list[list[Any]] = []
    while True:
        if result.get("error"):
            raise RuntimeError(json.dumps(result["error"], sort_keys=True))
        rows.extend(result.get("data", []))
        next_uri = result.get("nextUri")
        if not next_uri:
            return rows
        with urllib.request.urlopen(next_uri, timeout=30) as response:
            result = json.loads(response.read())


def _gold_evidence(transaction_id: int) -> dict[str, Any] | None:
    rows = _trino_execute(
        "SELECT t.transaction_id, t.status, r.decision, r.rule_score, "
        "r.model_probability FROM hive.gold.fact_transaction t "
        "JOIN hive.gold.fact_risk_assessment r USING (transaction_id) "
        f"WHERE t.transaction_id={int(transaction_id)}"
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "transaction_id": row[0],
        "status": row[1],
        "decision": row[2],
        "rule_score": row[3],
        "model_probability": row[4],
    }


def _assert_docker_compose() -> None:
    if shutil.which("docker") is None:
        raise RuntimeError("Docker CLI is not installed or not on PATH")
    result = subprocess.run(
        ["docker", "compose", "ps", "--status", "running"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise RuntimeError(f"Docker Compose is unavailable: {result.stderr.strip()}")


def main() -> None:
    access_token = os.getenv("E2E_ACCESS_TOKEN", "").strip()
    if os.getenv("E2E_ALLOW_DEMO_TRANSFER") != "1" or not access_token:
        raise RuntimeError(
            "E2E commits a demo transfer: set E2E_ALLOW_DEMO_TRANSFER=1 and "
            "E2E_ACCESS_TOKEN to a valid admin/employee JWT before running"
        )
    _assert_docker_compose()
    bootstrap_demo()
    with psycopg.connect(
        postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}"
    ) as connection:
        demo = connection.execute(
            """
            SELECT c.customerid, d.deviceid, source.accountid AS sourceid,
                   destination.accountid AS destinationid
            FROM customer c
            JOIN customer_device d ON d.customerid=c.customerid
            CROSS JOIN bank_account source
            CROSS JOIN bank_account destination
            WHERE c.customercode='DEMO-CUSTOMER'
              AND d.devicecode='DEMO-DEVICE'
              AND source.accountnumber='DEMO-0001'
              AND destination.accountnumber='DEMO-0002'
            """
        ).fetchone()
    if not demo:
        raise RuntimeError("demo bootstrap did not create the expected identities")

    api = f"http://localhost:{os.getenv('BANKING_API_PORT', '8000')}"
    transfer = _json_request(
        f"{api}/api/v1/transactions/counter-transfers",
        bearer_token=access_token,
        method="POST",
        payload={
            "customerId": demo["customerid"],
            "sourceAccountId": demo["sourceid"],
            "destinationAccountId": demo["destinationid"],
            "amount": str(Decimal(os.getenv("E2E_TRANSFER_AMOUNT", "100000"))),
            "idempotencyKey": str(uuid.uuid4()),
            "customerVerified": True,
            "description": "Opt-in E2E demo transfer",
        },
    )
    if transfer.get("decision") != "ALLOW" or transfer.get("status") != "Success":
        raise RuntimeError(f"expected ALLOW + Success, received: {transfer}")
    transaction_id = int(transfer["transactionid"])
    database = _wait(
        "committed banking evidence",
        lambda: _database_evidence(transaction_id),
        int(os.getenv("E2E_BANKING_TIMEOUT_SECONDS", "60")),
    )
    published = _wait(
        "published outbox event",
        lambda: (
            evidence
            if (evidence := _database_evidence(transaction_id))["outbox_status"] == "PUBLISHED"
            else None
        ),
        int(os.getenv("E2E_REALTIME_TIMEOUT_SECONDS", "180")),
    )
    bronze = _wait(
        "durable realtime Bronze object",
        lambda: _bronze_evidence(published["event_key"]),
        int(os.getenv("E2E_REALTIME_TIMEOUT_SECONDS", "180")),
    )

    dag_run_id = f"e2e_{uuid.uuid4().hex}"
    _trigger_airflow(dag_run_id)
    _wait(
        "Airflow DAG success",
        lambda: _airflow_state(dag_run_id),
        int(os.getenv("E2E_DAG_TIMEOUT_SECONDS", "1800")),
    )
    gold = _wait(
        "Gold transaction visible through Trino",
        lambda: _gold_evidence(transaction_id),
        int(os.getenv("E2E_GOLD_TIMEOUT_SECONDS", "180")),
    )
    print(
        json.dumps(
            {
                "status": "SUCCESS",
                "transaction_id": transaction_id,
                "database": database,
                "bronze": bronze,
                "airflow_run_id": dag_run_id,
                "gold": gold,
            },
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
