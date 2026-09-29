from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Iterable

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from data_engineering.common.config import Settings
from data_engineering.common.context import RunContext
from data_engineering.common.logging import event, get_logger
from data_engineering.common.paths import LakePaths
from data_engineering.common.spark import write_parquet
from data_engineering.common.storage import ObjectStore


LOG = get_logger(__name__)


def _silver(spark, paths: LakePaths, name: str) -> DataFrame:
    return spark.read.parquet(paths.silver(name))


def _unknown_union(frame: DataFrame, values: dict[str, object], spark) -> DataFrame:
    unknown = spark.createDataFrame([values], schema=frame.schema)
    return unknown.unionByName(frame)


def _write_gold(frame: DataFrame, paths: LakePaths, dataset: str, partition_by: list[str] | None = None) -> int:
    write_parquet(frame, paths.gold(dataset), mode="overwrite", partition_by=partition_by)
    return frame.count()


def _date_key(column: str):
    return F.date_format(F.col(column), "yyyyMMdd").cast("int")


def _time_key(column: str):
    return (F.hour(F.col(column)) * 100 + F.minute(F.col(column))).cast("int")


def build_dimensions(spark, settings: Settings, context: RunContext) -> dict[str, int]:
    paths = LakePaths(settings)
    customer = _silver(spark, paths, "customer")
    account = _silver(spark, paths, "bank_account")
    account_type = _silver(spark, paths, "account_type")
    branch = _silver(spark, paths, "branch")
    transaction_type = _silver(spark, paths, "transaction_type")
    transaction = _silver(spark, paths, "bank_transaction")
    device = _silver(spark, paths, "customer_device")
    model = _silver(spark, paths, "model_version")
    loan_payment = _silver(spark, paths, "loan_payment")

    timestamp_sources = [
        (transaction, "transaction_at"), (_silver(spark, paths, "transaction_posting"), "posting_at"),
        (_silver(spark, paths, "risk_assessment"), "assessed_at"), (_silver(spark, paths, "review_case"), "created_at"),
        (_silver(spark, paths, "login_event"), "login_at"), (loan_payment, "payment_at"),
    ]
    dates = None
    for frame, column in timestamp_sources:
        candidate = frame.select(F.to_date(F.col(column)).alias("full_date")).where(F.col("full_date").isNotNull())
        dates = candidate if dates is None else dates.union(candidate)
    bounds = dates.agg(F.min("full_date").alias("start"), F.max("full_date").alias("end")).first()
    if bounds.start is None:
        raise ValueError("Cannot build dim_date: no fact timestamps exist")
    future_days = int(os.getenv("GOLD_DATE_FUTURE_DAYS", "365"))
    days = (bounds.end - bounds.start).days + future_days + 1
    dim_date = (
        spark.range(days).select(F.date_add(F.lit(bounds.start), F.col("id").cast("int")).alias("full_date"))
        .select(
            F.date_format("full_date", "yyyyMMdd").cast("int").alias("date_key"), "full_date",
            F.dayofmonth("full_date").alias("day"), F.dayofweek("full_date").alias("day_of_week"),
            F.date_format("full_date", "EEEE").alias("day_name"), F.weekofyear("full_date").alias("week"),
            F.month("full_date").alias("month"), F.date_format("full_date", "MMMM").alias("month_name"),
            F.quarter("full_date").alias("quarter"), F.year("full_date").alias("year"),
        )
    )
    dim_time = spark.range(1440).select(
        ((F.col("id") / 60).cast("int") * 100 + (F.col("id") % 60)).cast("int").alias("time_key"),
        (F.col("id") / 60).cast("int").alias("hour"), (F.col("id") % 60).cast("int").alias("minute"),
        F.when(F.col("id") < 360, "Night").when(F.col("id") < 720, "Morning").when(F.col("id") < 1080, "Afternoon").otherwise("Evening").alias("time_of_day"),
    )
    dim_customer = customer.select(F.col("customer_id").alias("customer_key"), "customer_id", "customer_code", "gender", "date_of_birth", "customer_type", "status", "customer_segment")
    dim_account = account.select(F.col("account_id").alias("account_key"), "account_id", "branch_id", "account_type_id", "open_date", "currency", "status", "account_category")
    dim_branch = branch.select(F.col("branch_id").alias("branch_key"), "branch_id", "branch_code", "branch_name", "city", "open_date", "status")
    dim_device = device.select(F.col("device_id").alias("device_key"), "device_id", "device_type", "operating_system", "is_trusted", "status")
    dims = {
        "dim_date": dim_date,
        "dim_time": dim_time,
        "dim_customer": _unknown_union(dim_customer, {"customer_key": -1, "customer_id": -1, "customer_code": "UNKNOWN", "gender": None, "date_of_birth": None, "customer_type": None, "status": "UNKNOWN", "customer_segment": None}, spark),
        "dim_account": _unknown_union(dim_account, {"account_key": -1, "account_id": -1, "branch_id": -1, "account_type_id": -1, "open_date": None, "currency": "", "status": "UNKNOWN", "account_category": "UNKNOWN"}, spark),
        "dim_account_type": account_type.select(F.col("account_type_id").alias("account_type_key"), "account_type_id", "type_name", "minimum_balance", "interest_rate", "status"),
        "dim_branch": _unknown_union(dim_branch, {"branch_key": -1, "branch_id": -1, "branch_code": "UNKNOWN", "branch_name": "Unknown", "city": None, "open_date": None, "status": "UNKNOWN"}, spark),
        "dim_transaction_type": transaction_type.select(F.col("transaction_type_id").alias("transaction_type_key"), "transaction_type_id", "type_code", "type_name", "status"),
        "dim_channel": (
            transaction.select("channel")
            .unionByName(loan_payment.select(F.col("payment_channel").alias("channel")))
            .distinct().select(F.col("channel").alias("channel_key"), "channel")
        ),
        "dim_device": _unknown_union(dim_device, {"device_key": -1, "device_id": -1, "device_type": "UNKNOWN", "operating_system": None, "is_trusted": False, "status": "UNKNOWN"}, spark),
        "dim_model": model.select(F.col("model_version_id").alias("model_key"), "model_version_id", "model_name", "model_type", "status", "created_at"),
    }
    counts = {name: _write_gold(frame, paths, name) for name, frame in dims.items()}
    ObjectStore(settings).put_json(settings.control_bucket, f"gold/{context.run_id}/dimensions.json", counts)
    event(LOG, "gold_dimensions_complete", run_id=context.run_id, counts=counts)
    return counts


def build_facts(spark, settings: Settings, context: RunContext) -> dict[str, int]:
    paths = LakePaths(settings)
    transaction = _silver(spark, paths, "bank_transaction").alias("t")
    transfer = _silver(spark, paths, "transfer_request").select("transaction_id", "source_account_id", "destination_account_id").alias("r")
    terminal = _silver(spark, paths, "terminal").select("terminal_id", "branch_id").alias("term")
    source_account = _silver(spark, paths, "bank_account").select(F.col("account_id").alias("source_account_id"), F.col("branch_id").alias("source_branch_id")).alias("acct")
    fact_transaction = (
        transaction.join(transfer, "transaction_id", "left")
        .join(terminal, F.col("t.terminal_id") == F.col("term.terminal_id"), "left")
        .join(source_account, "source_account_id", "left")
        .select(
            F.col("transaction_id"), F.col("t.transaction_code").alias("transaction_code"),
            _date_key("t.transaction_at").alias("date_key"), _time_key("t.transaction_at").alias("time_key"),
            F.coalesce(F.col("t.initiated_by_customer_id"), F.lit(-1)).alias("customer_key"),
            F.coalesce(F.col("source_account_id"), F.lit(-1)).alias("source_account_key"),
            F.coalesce(F.col("destination_account_id"), F.lit(-1)).alias("destination_account_key"),
            F.coalesce(F.col("term.branch_id"), F.col("source_branch_id"), F.lit(-1)).alias("branch_key"),
            F.col("t.transaction_type_id").alias("transaction_type_key"), F.col("t.channel").alias("channel_key"),
            F.coalesce(F.col("t.device_id"), F.lit(-1)).alias("device_key"),
            F.col("t.amount").alias("amount"), F.col("t.fee").alias("fee"), F.col("t.currency").alias("currency"),
            F.col("t.status").alias("status"), F.col("t.transaction_at").alias("transaction_at"),
        )
    )
    posting = _silver(spark, paths, "transaction_posting")
    fact_posting = posting.select(
        "posting_id", "transaction_id", F.col("account_id").alias("account_key"), _date_key("posting_at").alias("date_key"),
        _time_key("posting_at").alias("time_key"), "posting_type", "amount", "posting_at",
    )
    risk = _silver(spark, paths, "risk_assessment")
    fact_assessment = risk.select(
        "risk_assessment_id", "transaction_id", F.col("model_version_id").alias("model_key"),
        _date_key("assessed_at").alias("date_key"), _time_key("assessed_at").alias("time_key"),
        "rule_score", "risk_level", "model_probability", "decision", "reason_json", "assessed_at",
    )
    review = _silver(spark, paths, "review_case")
    fact_review = review.select(
        "review_case_id", "transaction_id", _date_key("created_at").alias("created_date_key"),
        _time_key("created_at").alias("created_time_key"), _date_key("reviewed_at").alias("reviewed_date_key"),
        _time_key("reviewed_at").alias("reviewed_time_key"),
        "status", "reviewer_user_id", "created_at", "reviewed_at",
    )
    login = _silver(spark, paths, "login_event")
    fact_login = login.select(
        "login_event_id", F.col("customer_id").alias("customer_key"), F.coalesce(F.col("device_id"), F.lit(-1)).alias("device_key"),
        _date_key("login_at").alias("date_key"), _time_key("login_at").alias("time_key"), "status", "login_at",
    )
    payment = _silver(spark, paths, "loan_payment")
    fact_payment = payment.select(
        "loan_payment_id", "loan_id", "schedule_id", "transaction_id", _date_key("payment_at").alias("date_key"),
        _time_key("payment_at").alias("time_key"), F.col("payment_channel").alias("channel_key"), "payment_channel",
        "amount_paid", "principal_paid", "interest_paid", "penalty_fee", "payment_at",
    )
    label = _silver(spark, paths, "fraud_label_event")
    fact_label = label.select(
        "fraud_label_event_id", "transaction_id", _date_key("labeled_at").alias("date_key"),
        _time_key("labeled_at").alias("time_key"), "label", "label_source", "note", "labeled_at",
    )
    facts = {
        "fact_transaction": fact_transaction,
        "fact_transaction_posting": fact_posting,
        "fact_risk_assessment": fact_assessment,
        "fact_fraud_review": fact_review,
        "fact_fraud_label_event": fact_label,
        "fact_login_event": fact_login,
        "fact_loan_payment": fact_payment,
    }
    counts = {name: _write_gold(frame, paths, name) for name, frame in facts.items()}
    ObjectStore(settings).put_json(settings.control_bucket, f"gold/{context.run_id}/facts.json", counts)
    event(LOG, "gold_facts_complete", run_id=context.run_id, counts=counts)
    return counts
