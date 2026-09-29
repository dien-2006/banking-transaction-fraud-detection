from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from data_engineering.common.catalog import CONTRACTS
from data_engineering.common.config import Settings
from data_engineering.common.context import RunContext
from data_engineering.common.logging import event, get_logger
from data_engineering.common.paths import LakePaths
from data_engineering.common.spark import write_parquet
from data_engineering.common.storage import ObjectStore


LOG = get_logger(__name__)


def _result(context: RunContext, dataset: str, check: str, checked: int, failed: int, severity: str = "ERROR", details: str = "") -> dict[str, Any]:
    return {
        "run_id": context.run_id, "batch_id": context.batch_id, "dataset": dataset,
        "check_name": check, "rows_checked": checked, "rows_failed": failed,
        "severity": severity, "status": "PASS" if failed == 0 else "FAIL",
        "executed_at": datetime.now(timezone.utc).isoformat(), "details": details,
    }


def _pk_checks(frame: DataFrame, dataset: str, context: RunContext) -> list[dict[str, Any]]:
    pk = CONTRACTS[dataset].primary_key
    rows = frame.count()
    nulls = frame.where(F.col(pk).isNull()).count()
    duplicates = frame.groupBy(pk).count().where(F.col("count") > 1).count()
    return [
        _result(context, dataset, "primary_key_not_null", rows, nulls),
        _result(context, dataset, "primary_key_unique", rows, duplicates),
    ]


def _fk_check(child: DataFrame, parent: DataFrame, child_key: str, parent_key: str, dataset: str, name: str, context: RunContext, nullable: bool = False) -> dict[str, Any]:
    candidates = child.where(F.col(child_key).isNotNull()) if nullable else child
    failed = candidates.join(parent.select(F.col(parent_key).alias(child_key)), child_key, "left_anti").count()
    return _result(context, dataset, name, candidates.count(), failed)


def silver_quality(spark, settings: Settings, context: RunContext) -> list[dict[str, Any]]:
    paths = LakePaths(settings)
    frames = {name: spark.read.parquet(paths.silver(name)) for name in CONTRACTS}
    results: list[dict[str, Any]] = []
    for dataset, frame in frames.items():
        results.extend(_pk_checks(frame, dataset, context))

    fk_specs = [
        ("transfer_request", "transaction_id", "bank_transaction", "transaction_id", False),
        ("transfer_request", "customer_id", "customer", "customer_id", False),
        ("transfer_request", "source_account_id", "bank_account", "account_id", False),
        ("transfer_request", "destination_account_id", "bank_account", "account_id", False),
        ("transaction_posting", "transaction_id", "bank_transaction", "transaction_id", False),
        ("transaction_posting", "account_id", "bank_account", "account_id", False),
        ("customer_device", "customer_id", "customer", "customer_id", False),
        ("login_event", "customer_id", "customer", "customer_id", False),
        ("login_event", "device_id", "customer_device", "device_id", True),
        ("bank_account", "branch_id", "branch", "branch_id", False),
        ("bank_account", "account_type_id", "account_type", "account_type_id", False),
        ("account_holder", "account_id", "bank_account", "account_id", False),
        ("account_holder", "customer_id", "customer", "customer_id", False),
        ("terminal", "branch_id", "branch", "branch_id", True),
        ("risk_assessment", "transaction_id", "bank_transaction", "transaction_id", False),
        ("risk_assessment", "model_version_id", "model_version", "model_version_id", False),
        ("review_case", "transaction_id", "bank_transaction", "transaction_id", False),
        ("loan", "customer_id", "customer", "customer_id", False),
        ("loan", "branch_id", "branch", "branch_id", False),
        ("loan", "loan_type_id", "loan_type", "loan_type_id", False),
        ("repayment_schedule", "loan_id", "loan", "loan_id", False),
        ("loan_payment", "loan_id", "loan", "loan_id", False),
        ("loan_payment", "schedule_id", "repayment_schedule", "schedule_id", True),
        ("loan_payment", "transaction_id", "bank_transaction", "transaction_id", False),
    ]
    for child_name, child_key, parent_name, parent_key, nullable in fk_specs:
        results.append(_fk_check(frames[child_name], frames[parent_name], child_key, parent_key, child_name, f"fk_{child_key}_to_{parent_name}", context, nullable))

    transactions = frames["bank_transaction"]
    postings = frames["transaction_posting"]
    non_success = postings.join(transactions.select("transaction_id", "status"), "transaction_id").where(F.col("status") != "Success")
    results.append(_result(context, "transaction_posting", "no_posting_for_non_success_transaction", postings.count(), non_success.count()))
    posting_totals = postings.groupBy("transaction_id").agg(
        F.sum(F.when(F.col("posting_type") == "DEBIT", F.col("amount")).otherwise(F.lit(0))).alias("debit"),
        F.sum(F.when(F.col("posting_type") == "CREDIT", F.col("amount")).otherwise(F.lit(0))).alias("credit"),
    )
    successful_transfers = transactions.where(F.col("status") == "Success").join(frames["transfer_request"].select("transaction_id"), "transaction_id")
    reconciliation = successful_transfers.select("transaction_id").join(posting_totals, "transaction_id", "left")
    unbalanced = reconciliation.where(F.col("debit").isNull() | F.col("credit").isNull() | (F.col("debit") != F.col("credit")))
    results.append(_result(context, "bank_transaction", "successful_transfer_debit_equals_credit", reconciliation.count(), unbalanced.count()))

    payment = frames["loan_payment"]
    bad_payment_total = payment.where(F.col("amount_paid") != F.col("principal_paid") + F.col("interest_paid") + F.col("penalty_fee")).count()
    results.append(_result(context, "loan_payment", "payment_components_equal_amount", payment.count(), bad_payment_total))

    result_frame = spark.createDataFrame(results)
    write_parquet(result_frame, paths.dq("silver", context.run_id), mode="overwrite")
    ObjectStore(settings).put_json(settings.control_bucket, f"dq/silver/{context.run_id}.json", results)
    failures = [item for item in results if item["severity"] == "ERROR" and item["status"] == "FAIL"]
    event(LOG, "silver_quality_complete", run_id=context.run_id, checks=len(results), failures=len(failures))
    if failures:
        names = ", ".join(f"{item['dataset']}.{item['check_name']}={item['rows_failed']}" for item in failures)
        raise ValueError(f"Silver data quality failed: {names}")
    return results


def gold_quality(spark, settings: Settings, context: RunContext, layer: str) -> list[dict[str, Any]]:
    paths = LakePaths(settings)
    dimensions = {
        "dim_date": "date_key", "dim_time": "time_key", "dim_customer": "customer_key",
        "dim_account": "account_key", "dim_account_type": "account_type_key", "dim_branch": "branch_key",
        "dim_transaction_type": "transaction_type_key", "dim_channel": "channel_key",
        "dim_device": "device_key", "dim_model": "model_key",
    }
    facts = {
        "fact_transaction": "transaction_id", "fact_transaction_posting": "posting_id",
        "fact_risk_assessment": "risk_assessment_id", "fact_fraud_review": "review_case_id",
        "fact_fraud_label_event": "fraud_label_event_id",
        "fact_login_event": "login_event_id", "fact_loan_payment": "loan_payment_id",
    }
    selected = dimensions if layer == "dimensions" else facts
    results: list[dict[str, Any]] = []
    for dataset, key in selected.items():
        frame = spark.read.parquet(paths.gold(dataset))
        rows = frame.count()
        nulls = frame.where(F.col(key).isNull()).count()
        duplicates = frame.groupBy(key).count().where(F.col("count") > 1).count()
        results.append(_result(context, dataset, "grain_key_not_null", rows, nulls))
        results.append(_result(context, dataset, "grain_key_unique", rows, duplicates))
    if layer == "facts":
        transaction = spark.read.parquet(paths.gold("fact_transaction"))
        invalid_amount = transaction.where(F.col("amount") <= 0).count()
        results.append(_result(context, "fact_transaction", "amount_positive", transaction.count(), invalid_amount))
        posting = spark.read.parquet(paths.gold("fact_transaction_posting"))
        totals = posting.groupBy("transaction_id").agg(
            F.sum(F.when(F.col("posting_type") == "DEBIT", F.col("amount")).otherwise(F.lit(0))).alias("debit"),
            F.sum(F.when(F.col("posting_type") == "CREDIT", F.col("amount")).otherwise(F.lit(0))).alias("credit"),
        )
        bad = totals.where(F.col("debit") != F.col("credit")).count()
        results.append(_result(context, "fact_transaction_posting", "debit_equals_credit", totals.count(), bad))
        risk = spark.read.parquet(paths.gold("fact_risk_assessment"))
        invalid_risk = risk.where(
            (F.col("rule_score") < 0) | (F.col("rule_score") > 100)
            | (F.col("model_probability") < 0) | (F.col("model_probability") > 1)
        ).count()
        results.append(_result(context, "fact_risk_assessment", "risk_ranges_valid", risk.count(), invalid_risk))
        reference_specs = [
            ("fact_transaction", transaction, "customer_key", "dim_customer", "customer_key"),
            ("fact_transaction", transaction, "source_account_key", "dim_account", "account_key"),
            ("fact_transaction", transaction, "destination_account_key", "dim_account", "account_key"),
            ("fact_transaction", transaction, "branch_key", "dim_branch", "branch_key"),
            ("fact_transaction", transaction, "transaction_type_key", "dim_transaction_type", "transaction_type_key"),
            ("fact_transaction", transaction, "channel_key", "dim_channel", "channel_key"),
            ("fact_transaction", transaction, "device_key", "dim_device", "device_key"),
            ("fact_transaction_posting", posting, "account_key", "dim_account", "account_key"),
            ("fact_risk_assessment", risk, "model_key", "dim_model", "model_key"),
        ]
        login = spark.read.parquet(paths.gold("fact_login_event"))
        reference_specs.extend([
            ("fact_login_event", login, "customer_key", "dim_customer", "customer_key"),
            ("fact_login_event", login, "device_key", "dim_device", "device_key"),
        ])
        loan_payment = spark.read.parquet(paths.gold("fact_loan_payment"))
        reference_specs.append(("fact_loan_payment", loan_payment, "channel_key", "dim_channel", "channel_key"))
        dimension_cache: dict[str, DataFrame] = {}
        for fact_name, fact_frame, fact_key, dimension_name, dimension_key in reference_specs:
            dimension = dimension_cache.setdefault(dimension_name, spark.read.parquet(paths.gold(dimension_name)))
            checked = fact_frame.where(F.col(fact_key).isNotNull())
            missing = checked.join(dimension.select(F.col(dimension_key).alias(fact_key)), fact_key, "left_anti").count()
            results.append(_result(context, fact_name, f"fk_{fact_key}_to_{dimension_name}", checked.count(), missing))
        dated_facts = {
            "fact_transaction": (transaction, ("date_key",), ("time_key",)),
            "fact_transaction_posting": (posting, ("date_key",), ("time_key",)),
            "fact_risk_assessment": (risk, ("date_key",), ("time_key",)),
            "fact_fraud_review": (spark.read.parquet(paths.gold("fact_fraud_review")), ("created_date_key", "reviewed_date_key"), ("created_time_key", "reviewed_time_key")),
            "fact_fraud_label_event": (spark.read.parquet(paths.gold("fact_fraud_label_event")), ("date_key",), ("time_key",)),
            "fact_login_event": (login, ("date_key",), ("time_key",)),
            "fact_loan_payment": (loan_payment, ("date_key",), ("time_key",)),
        }
        dim_date = spark.read.parquet(paths.gold("dim_date"))
        dim_time = spark.read.parquet(paths.gold("dim_time"))
        for fact_name, (fact_frame, date_keys, time_keys) in dated_facts.items():
            for key in date_keys:
                candidates = fact_frame.where(F.col(key).isNotNull())
                failed = candidates.join(dim_date.select(F.col("date_key").alias(key)), key, "left_anti").count()
                results.append(_result(context, fact_name, f"fk_{key}_to_dim_date", candidates.count(), failed))
            for key in time_keys:
                candidates = fact_frame.where(F.col(key).isNotNull())
                failed = candidates.join(dim_time.select(F.col("time_key").alias(key)), key, "left_anti").count()
                results.append(_result(context, fact_name, f"fk_{key}_to_dim_time", candidates.count(), failed))
    write_parquet(spark.createDataFrame(results), paths.dq(f"gold-{layer}", context.run_id), mode="overwrite")
    ObjectStore(settings).put_json(settings.control_bucket, f"dq/gold-{layer}/{context.run_id}.json", results)
    failures = [item for item in results if item["status"] == "FAIL" and item["severity"] == "ERROR"]
    event(LOG, "gold_quality_complete", layer=layer, checks=len(results), failures=len(failures))
    if failures:
        raise ValueError(f"Gold {layer} DQ failed: {failures}")
    return results
