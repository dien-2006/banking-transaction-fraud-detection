from __future__ import annotations

import json
import io
import os
import subprocess
import time
import urllib.request
import uuid

from dotenv import load_dotenv
from minio import Minio
import pyarrow.parquet as pq

from scripts.register_trino import execute as trino_execute


def _command(*arguments: str) -> str:
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=180, check=False)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result.stdout.strip()


def _request(url: str, method: str = "GET", body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def _wait(predicate, description: str, timeout: int = 180):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = predicate()
        if last:
            return last
        time.sleep(2)
    raise TimeoutError(f"timeout waiting for {description}; last={last!r}")


def _minio_client() -> Minio:
    endpoint = os.getenv("MINIO_ENDPOINT_HOST", "http://localhost:9000")
    secure = endpoint.startswith("https://")
    endpoint = endpoint.removeprefix("http://").removeprefix("https://")
    return Minio(endpoint, access_key=os.environ["MINIO_ROOT_USER"], secret_key=os.environ["MINIO_ROOT_PASSWORD"], secure=secure)


def main() -> None:
    load_dotenv(override=False)
    api = f"http://localhost:{os.getenv('BANKING_API_PORT', '8000')}"
    _request(f"{api}/health")
    raw = _command("docker", "compose", "run", "--rm", "demo-bootstrap")
    seed = json.loads(raw.splitlines()[-1])
    idempotency_key = f"e2e-{uuid.uuid4()}"
    transaction = _request(
        f"{api}/transactions/transfers",
        "POST",
        {
            "customer_id": seed["customer_id"],
            "source_account_id": seed["source_account_id"],
            "destination_account_id": seed["destination_account_id"],
            "device_id": seed["device_id"],
            "amount": "100000",
            "idempotency_key": idempotency_key,
            "channel": "MobileBanking",
            "description": "Automated end-to-end verification",
        },
    )
    transaction_id = int(transaction["transactionid"])
    if transaction["decision"] != "ALLOW" or transaction["status"] != "Success" or transaction["posting_count"] != 2:
        raise AssertionError(f"banking path failed: {transaction}")
    published = _wait(
        lambda: (value if (value := _request(f"{api}/transactions/{transaction_id}"))["outbox_status"] == "PUBLISHED" else None),
        "outbox publish",
    )
    minio = _minio_client()
    bronze_bucket = os.getenv("MINIO_BUCKET_BRONZE", "bronze")
    event_key = f"transaction-completed-{transaction_id}"

    def bronze_contains_event():
        for item in minio.list_objects(bronze_bucket, prefix="kafka/transaction_events/", recursive=True):
            response = minio.get_object(bronze_bucket, item.object_name)
            try:
                table = pq.read_table(io.BytesIO(response.read()), columns=["event_id"])
                if event_key in table.column("event_id").to_pylist():
                    return item.object_name
            finally:
                response.close()
                response.release_conn()
        return None

    bronze_object = _wait(bronze_contains_event, "durable Kafka Bronze event")
    run_id = f"e2e__{uuid.uuid4().hex}"
    _command("docker", "compose", "exec", "-T", "airflow-webserver", "airflow", "dags", "unpause", "banking_bronze_silver_gold")
    _command("docker", "compose", "exec", "-T", "airflow-webserver", "airflow", "dags", "trigger", "--run-id", run_id, "banking_bronze_silver_gold")

    def dag_success():
        output = _command("docker", "compose", "exec", "-T", "airflow-webserver", "airflow", "dags", "list-runs", "-d", "banking_bronze_silver_gold", "--output", "json")
        runs = json.loads(output)
        matching = [run for run in runs if run.get("run_id") == run_id]
        if matching and matching[0]["state"] == "failed":
            raise RuntimeError(f"Airflow DAG failed: {matching[0]}")
        return matching[0] if matching and matching[0]["state"] == "success" else None

    dag_run = _wait(dag_success, "Airflow DAG success", timeout=1800)
    trino_url = f"http://localhost:{os.getenv('TRINO_PORT', '8084')}"
    trino_rows = trino_execute(trino_url, f"SELECT transaction_id FROM hive.gold.fact_transaction WHERE transaction_id={transaction_id}")
    if [transaction_id] not in trino_rows:
        raise AssertionError(f"transaction {transaction_id} was not queryable in Trino Gold: {trino_rows}")
    summary = {
        "input": {"idempotency_key": idempotency_key, "amount": "100000"},
        "risk": {"rule_score": transaction["rulescore"], "risk_level": transaction["risklevel"], "model_probability": str(transaction["modelprobability"]), "decision": transaction["decision"]},
        "banking": {"transaction_id": transaction_id, "status": transaction["status"], "posting_count": transaction["posting_count"]},
        "outbox": {"status": published["outbox_status"]},
        "bronze": {"object": bronze_object},
        "airflow": dag_run,
        "trino": {"query": "PASS", "transaction_id": transaction_id},
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
