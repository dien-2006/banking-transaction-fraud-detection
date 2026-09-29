from __future__ import annotations

import os
import json
import time
import urllib.error
import urllib.request


TABLES: dict[str, str] = {
    "dim_date": "date_key INTEGER, full_date DATE, day INTEGER, day_of_week INTEGER, day_name VARCHAR, week INTEGER, month INTEGER, month_name VARCHAR, quarter INTEGER, year INTEGER",
    "dim_time": "time_key INTEGER, hour INTEGER, minute BIGINT, time_of_day VARCHAR",
    "dim_customer": "customer_key BIGINT, customer_id BIGINT, customer_code VARCHAR, gender VARCHAR, date_of_birth DATE, customer_type VARCHAR, status VARCHAR, customer_segment VARCHAR",
    "dim_account": "account_key BIGINT, account_id BIGINT, branch_id INTEGER, account_type_id INTEGER, open_date DATE, currency VARCHAR, status VARCHAR, account_category VARCHAR",
    "dim_account_type": "account_type_key INTEGER, account_type_id INTEGER, type_name VARCHAR, minimum_balance DECIMAL(19,2), interest_rate DECIMAL(8,4), status VARCHAR",
    "dim_branch": "branch_key INTEGER, branch_id INTEGER, branch_code VARCHAR, branch_name VARCHAR, city VARCHAR, open_date DATE, status VARCHAR",
    "dim_transaction_type": "transaction_type_key INTEGER, transaction_type_id INTEGER, type_code VARCHAR, type_name VARCHAR, status VARCHAR",
    "dim_channel": "channel_key VARCHAR, channel VARCHAR",
    "dim_device": "device_key BIGINT, device_id BIGINT, device_type VARCHAR, operating_system VARCHAR, is_trusted BOOLEAN, status VARCHAR",
    "dim_model": "model_key BIGINT, model_version_id BIGINT, model_name VARCHAR, model_type VARCHAR, status VARCHAR, created_at TIMESTAMP(6)",
    "fact_transaction": "transaction_id BIGINT, transaction_code VARCHAR, date_key INTEGER, time_key INTEGER, customer_key BIGINT, source_account_key BIGINT, destination_account_key BIGINT, branch_key INTEGER, transaction_type_key INTEGER, channel_key VARCHAR, device_key BIGINT, amount DECIMAL(19,2), fee DECIMAL(19,2), currency VARCHAR, status VARCHAR, transaction_at TIMESTAMP(6)",
    "fact_transaction_posting": "posting_id BIGINT, transaction_id BIGINT, account_key BIGINT, date_key INTEGER, time_key INTEGER, posting_type VARCHAR, amount DECIMAL(19,2), posting_at TIMESTAMP(6)",
    "fact_risk_assessment": "risk_assessment_id BIGINT, transaction_id BIGINT, model_key BIGINT, date_key INTEGER, time_key INTEGER, rule_score SMALLINT, risk_level VARCHAR, model_probability DECIMAL(8,6), decision VARCHAR, reason_json VARCHAR, assessed_at TIMESTAMP(6)",
    "fact_fraud_review": "review_case_id BIGINT, transaction_id BIGINT, created_date_key INTEGER, created_time_key INTEGER, reviewed_date_key INTEGER, reviewed_time_key INTEGER, status VARCHAR, reviewer_user_id INTEGER, created_at TIMESTAMP(6), reviewed_at TIMESTAMP(6)",
    "fact_fraud_label_event": "fraud_label_event_id BIGINT, transaction_id BIGINT, date_key INTEGER, time_key INTEGER, label VARCHAR, label_source VARCHAR, note VARCHAR, labeled_at TIMESTAMP(6)",
    "fact_login_event": "login_event_id BIGINT, customer_key BIGINT, device_key BIGINT, date_key INTEGER, time_key INTEGER, status VARCHAR, login_at TIMESTAMP(6)",
    "fact_loan_payment": "loan_payment_id BIGINT, loan_id BIGINT, schedule_id BIGINT, transaction_id BIGINT, date_key INTEGER, time_key INTEGER, channel_key VARCHAR, payment_channel VARCHAR, amount_paid DECIMAL(19,2), principal_paid DECIMAL(19,2), interest_paid DECIMAL(19,2), penalty_fee DECIMAL(19,2), payment_at TIMESTAMP(6)",
}


def execute(url: str, statement: str) -> list[list[object]]:
    request = urllib.request.Request(
        f"{url.rstrip('/')}/v1/statement",
        data=statement.encode(),
        headers={"X-Trino-User": "pipeline", "Content-Type": "text/plain"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read())
    rows: list[list[object]] = []
    while True:
        if "error" in payload:
            raise RuntimeError(json.dumps(payload["error"], sort_keys=True))
        rows.extend(payload.get("data", []))
        next_uri = payload.get("nextUri")
        if not next_uri:
            return rows
        follow_up = urllib.request.Request(next_uri, headers={"X-Trino-User": "pipeline"})
        with urllib.request.urlopen(follow_up, timeout=30) as response:
            payload = json.loads(response.read())


def main() -> None:
    url = os.getenv("TRINO_URL", "http://trino:8080")
    bucket = os.getenv("GOLD_BUCKET", "gold")
    for attempt in range(30):
        try:
            execute(url, f"CREATE SCHEMA IF NOT EXISTS hive.gold WITH (location = 's3://{bucket}/')")
            break
        except (urllib.error.URLError, RuntimeError):
            if attempt == 29:
                raise
            time.sleep(2)
    for table, columns in TABLES.items():
        execute(
            url,
            f"CREATE TABLE IF NOT EXISTS hive.gold.{table} ({columns}) "
            f"WITH (format='PARQUET', external_location='s3://{bucket}/{table}/')",
        )
    print(f"registered {len(TABLES)} Gold tables in hive.gold")


if __name__ == "__main__":
    main()
