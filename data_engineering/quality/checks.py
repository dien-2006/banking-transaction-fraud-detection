from __future__ import annotations

from typing import Any

from pyspark.sql import DataFrame, functions as F

from data_engineering.common.config import s3a
from data_engineering.common.contracts import CONTRACTS
from data_engineering.gold.catalog import GOLD_DATASETS, GOLD_RELATIONSHIPS
from data_engineering.common.spark import session
from data_engineering.common.state import PipelineState
from data_engineering.silver.release import configure_silver_release
from data_engineering.quality.quarantine import quarantine_business_violations, _transaction_violations




def _grain(frame: DataFrame, key: str) -> dict[str, int]:
    total = frame.count()
    nulls = frame.filter(F.col(key).isNull()).count()
    duplicates = frame.groupBy(key).count().filter(F.col("count") > 1).count()
    return {"rows": total, "null_keys": nulls, "duplicate_keys": duplicates}


def _missing_reference(
    child: DataFrame, child_key: str, parent: DataFrame, parent_key: str
) -> int:
    candidates = child.filter(F.col(child_key).isNotNull())
    return candidates.join(
        parent.select(F.col(parent_key).alias(child_key)), child_key, "left_anti"
    ).count()


def _silver_quality(spark, batch_id: str) -> dict[str, Any]:
    frames = {
        dataset: spark.read.parquet(s3a("MINIO_BUCKET_SILVER", dataset))
        for dataset in CONTRACTS
    }
    quarantine_metrics = quarantine_business_violations(spark, frames, batch_id)
    metrics: dict[str, Any] = {
        dataset: _grain(frame, CONTRACTS[dataset].primary_key)
        for dataset, frame in frames.items()
    }
    failures: list[str] = []
    for dataset, values in metrics.items():
        if values["null_keys"] or values["duplicate_keys"]:
            failures.append(f"{dataset}.grain={values}")

    metrics["quarantine"] = quarantine_metrics
    references = [
        ("bank_account", "branch_id", "branch", "branch_id"),
        ("bank_account", "account_type_id", "account_type", "account_type_id"),
        ("account_holder", "account_id", "bank_account", "account_id"),
        ("account_holder", "customer_id", "customer", "customer_id"),
        ("customer_device", "customer_id", "customer", "customer_id"),
        ("login_event", "customer_id", "customer", "customer_id"),
        ("transfer_request", "transaction_id", "bank_transaction", "transaction_id"),
        ("transfer_request", "customer_id", "customer", "customer_id"),
        ("transfer_request", "source_account_id", "bank_account", "account_id"),
        ("transfer_request", "destination_account_id", "bank_account", "account_id"),
        ("transaction_posting", "transaction_id", "bank_transaction", "transaction_id"),
        ("transaction_posting", "account_id", "bank_account", "account_id"),
        ("risk_assessment", "transaction_id", "bank_transaction", "transaction_id"),
        ("risk_assessment", "model_version_id", "model_version", "model_version_id"),
        ("review_case", "transaction_id", "bank_transaction", "transaction_id"),
        ("fraud_label_event", "transaction_id", "bank_transaction", "transaction_id"),
        ("loan", "customer_id", "customer", "customer_id"),
        ("loan", "branch_id", "branch", "branch_id"),
        ("loan", "loan_type_id", "loan_type", "loan_type_id"),
        ("repayment_schedule", "loan_id", "loan", "loan_id"),
        ("loan_payment", "loan_id", "loan", "loan_id"),
        ("loan_payment", "transaction_id", "bank_transaction", "transaction_id"),
    ]
    reference_metrics: dict[str, int] = {}
    for child, child_key, parent, parent_key in references:
        name = f"{child}.{child_key}->{parent}.{parent_key}"
        missing = _missing_reference(frames[child], child_key, frames[parent], parent_key)
        reference_metrics[name] = missing
        if missing:
            failures.append(f"missing_reference:{name}={missing}")
    metrics["references"] = reference_metrics

    transactions = frames["bank_transaction"]
    postings = frames["transaction_posting"]
    non_success_postings = postings.join(
        transactions.select("transaction_id", "status"), "transaction_id"
    ).filter(F.col("status") != "Success").count()
    success_without_postings = transactions.filter(
        F.col("status") == "Success"
    ).select("transaction_id").join(
        postings.select("transaction_id").distinct(), "transaction_id", "left_anti"
    ).count()
    violations = _transaction_violations(frames)
    unbalanced = violations.filter(F.col("error_code").contains("UNBALANCED_SUCCESSFUL_TRANSFER")).count()
    invalid_gate = violations.filter(F.col("error_code").contains("SUCCESS_WITHOUT_RISK_APPROVAL")).count()
    payment = frames["loan_payment"]
    bad_payments = payment.filter(
        F.col("amount_paid") != F.col("principal_paid") + F.col("interest_paid") + F.col("penalty_fee")
    ).count()
    metrics["business"] = {
        "non_success_postings": non_success_postings,
        "success_without_postings": success_without_postings,
        "unbalanced_successful_transfers": unbalanced,
        "success_without_allow_or_approved_review": invalid_gate,
        "loan_payment_reconciliation_failures": bad_payments,
    }
    for name, count in metrics["business"].items():
        if count:
            failures.append(f"{name}={count}")
    metrics["failures"] = failures
    if failures:
        PipelineState().record_stage(batch_id, "silver_dq_failed", metrics)
        raise ValueError("Silver DQ failed: " + "; ".join(failures))
    return metrics


def _gold_quality(spark, batch_id: str = "manual") -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    failures: list[str] = []
    frames = {
        dataset: spark.read.parquet(s3a("MINIO_BUCKET_GOLD", path))
        for dataset, (path, _key) in GOLD_DATASETS.items()
    }
    for dataset, (_path, key) in GOLD_DATASETS.items():
        frame = frames[dataset]
        values = _grain(frame, key)
        metrics[dataset] = values
        if values["null_keys"] or values["duplicate_keys"]:
            failures.append(f"{dataset}.grain={values}")
    risk = frames["fact_risk_assessment"]
    invalid_risk = risk.filter(
        ~F.col("rule_score").between(0, 100)
        | ~F.col("model_probability").between(0, 1)
        | ~F.col("decision").isin("ALLOW", "REVIEW", "BLOCK")
    ).count()
    metrics["risk_contract_failures"] = invalid_risk
    if invalid_risk:
        failures.append(f"fact_risk_assessment.contract={invalid_risk}")


    reference_metrics: dict[str, int] = {}
    for relationship in GOLD_RELATIONSHIPS:
        missing = _missing_reference(
            frames[relationship.child_table],
            relationship.child_column,
            frames[relationship.parent_table],
            relationship.parent_column,
        )
        reference_metrics[relationship.name] = missing
        if missing:
            failures.append(f"missing_reference:{relationship.name}={missing}")
    metrics["references"] = reference_metrics
    metrics["failures"] = failures
    if failures:
        PipelineState().record_stage(batch_id, "gold_dq_failed", metrics)
        raise ValueError("Gold DQ failed: " + "; ".join(failures))
    return metrics


def run(layer: str = "silver", batch_id: str = "manual") -> dict[str, Any]:
    if layer not in {"silver", "gold"}:
        raise ValueError(f"unsupported DQ layer: {layer}")
    prefix = configure_silver_release(batch_id)
    state = PipelineState()
    completed = state.get_json(f'runs/{batch_id}/{layer}_dq.json')
    if layer == 'silver' and completed and completed.get('silver_prefix') == prefix:
        return completed['metrics']
    spark = session(f"{layer}-quality")
    metrics = (
        _silver_quality(spark, batch_id) if layer == "silver" else _gold_quality(spark, batch_id)
    )
    state.record_stage(batch_id, f"{layer}_dq", metrics)
    if layer == 'silver':
        # Training explicitly pins one validated batch; Gold never uses this pointer.
        previous = state.get_json('silver/active_release.json')
        extracted = state.get_json(f'runs/{batch_id}/postgres_to_bronze.json')
        source_time = extracted['recorded_at'] if extracted else ''
        if not previous or source_time > previous.get('source_recorded_at', ''):
            state.put_json('silver/active_release.json', {'batch_id': batch_id, 'prefix': prefix, 'source_recorded_at': source_time})
    return metrics
