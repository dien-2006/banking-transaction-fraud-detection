from __future__ import annotations

import os
from datetime import date

from pyspark.sql import functions as F
from pyspark.sql.types import BooleanType, NumericType, StringType

from data_engineering.common.config import s3a
from data_engineering.common.spark import session
from data_engineering.common.state import PipelineState
from data_engineering.silver.release import configure_silver_release
from data_engineering.gold.release import configure_release


def _silver(spark, dataset: str):
    return spark.read.parquet(s3a("MINIO_BUCKET_SILVER", dataset))


def _business_time(column: str):
    return F.from_utc_timestamp(F.col(column), os.getenv("SOURCE_TIMEZONE", "Asia/Ho_Chi_Minh"))


def _date_key(column: str):
    return F.date_format(_business_time(column), "yyyyMMdd").cast("int")


def _time_key(column: str):
    return (F.hour(_business_time(column)) * 100 + F.minute(_business_time(column))).cast("int")


def _write(frame, relative_path: str) -> int:
    frame.write.mode("overwrite").parquet(s3a("MINIO_BUCKET_GOLD", relative_path))
    return frame.count()


def _with_unknown(frame, key: str):
    values = []
    for field in frame.schema.fields:
        if field.name == key or (
            field.name.endswith("_id") and isinstance(field.dataType, NumericType)
        ):
            values.append(-1)
        elif isinstance(field.dataType, StringType):
            values.append("UNKNOWN")
        elif isinstance(field.dataType, BooleanType):
            values.append(False)
        else:
            values.append(None)
    unknown = frame.sparkSession.createDataFrame([tuple(values)], schema=frame.schema)
    return unknown.unionByName(frame)


def run(batch_id: str = "manual") -> dict[str, int]:
    silver_prefix = configure_silver_release(batch_id)
    configure_release(batch_id)
    # Once validated, a release is immutable, including retries after publish.
    state = PipelineState()
    silver_dq = state.get_json(f"runs/{batch_id}/silver_dq.json")
    if not silver_dq or silver_dq.get('silver_prefix') != silver_prefix or silver_dq['metrics'].get('failures') != []:
        raise ValueError('Gold requires the validated Silver snapshot for this batch')
    validated = state.get_json(f"runs/{batch_id}/gold_dq.json")
    built = state.get_json(f"runs/{batch_id}/silver_to_gold.json")
    if os.getenv("GOLD_VERSION_PREFIX") and validated and built and validated.get("gold_prefix") == os.getenv("GOLD_VERSION_PREFIX") and built.get("gold_prefix") == os.getenv("GOLD_VERSION_PREFIX") and validated["metrics"].get("failures") == []:
        return built["metrics"]
    spark = session("silver-to-gold")
    outputs: dict[str, int] = {}
    transaction = _silver(spark, "bank_transaction")
    posting = _silver(spark, "transaction_posting")
    risk = _silver(spark, "risk_assessment")
    review = _silver(spark, "review_case")
    label = _silver(spark, "fraud_label_event")
    login = _silver(spark, "login_event")
    payment = _silver(spark, "loan_payment")

    timestamp_frames = [
        transaction.select(F.to_date(_business_time("transaction_at")).alias("full_date")),
        posting.select(F.to_date(_business_time("posting_at")).alias("full_date")),
        risk.select(F.to_date(_business_time("assessed_at")).alias("full_date")),
        review.select(F.to_date(_business_time("created_at")).alias("full_date")),
        review.select(F.to_date(_business_time("reviewed_at")).alias("full_date")),
        label.select(F.to_date(_business_time("labeled_at")).alias("full_date")),
        login.select(F.to_date(_business_time("login_at")).alias("full_date")),
        payment.select(F.to_date(_business_time("payment_at")).alias("full_date")),
    ]
    dates = timestamp_frames[0]
    for candidate in timestamp_frames[1:]:
        dates = dates.unionByName(candidate)
    bounds = dates.filter(F.col("full_date").isNotNull()).agg(
        F.min("full_date").alias("start"), F.max("full_date").alias("end")
    ).first()
    start = bounds["start"] or date(1970, 1, 1)
    end = bounds["end"] or start
    future_days = max(0, int(os.getenv("GOLD_DATE_FUTURE_DAYS", "365")))
    dim_date = spark.range((end - start).days + future_days + 1).select(
        F.date_add(F.lit(start), F.col("id").cast("int")).alias("full_date")
    ).select(
        F.date_format("full_date", "yyyyMMdd").cast("int").alias("date_key"),
        "full_date",
        F.dayofmonth("full_date").alias("day"),
        F.dayofweek("full_date").alias("day_of_week"),
        F.date_format("full_date", "EEEE").alias("day_name"),
        F.weekofyear("full_date").alias("week"),
        F.month("full_date").alias("month"),
        F.date_format("full_date", "MMMM").alias("month_name"),
        F.quarter("full_date").alias("quarter"),
        F.year("full_date").alias("year"),
    )
    dim_time = spark.range(1440).select(
        ((F.col("id") / 60).cast("int") * 100 + F.col("id") % 60).cast("int").alias("time_key"),
        (F.col("id") / 60).cast("int").alias("hour"),
        (F.col("id") % 60).cast("int").alias("minute"),
        F.when(F.col("id") < 360, "Night")
        .when(F.col("id") < 720, "Morning")
        .when(F.col("id") < 1080, "Afternoon")
        .otherwise("Evening").alias("time_of_day"),
    )
    customer = _silver(spark, "customer")
    account = _silver(spark, "bank_account")
    account_type = _silver(spark, "account_type")
    branch = _silver(spark, "branch")
    transaction_type = _silver(spark, "transaction_type")
    device = _silver(spark, "customer_device")
    model = _silver(spark, "model_version")
    dim_customer = customer.select(
        F.col("customer_id").alias("customer_key"), "customer_id", "customer_code",
        "gender", "date_of_birth", "customer_type", "status", "customer_segment",
    )
    dim_account = account.select(
        F.col("account_id").alias("account_key"), "account_id", "branch_id",
        "account_type_id", "open_date", "currency", "status", "account_category",
    )
    channels = transaction.select("channel").unionByName(
        payment.select(F.col("payment_channel").alias("channel"))
    ).filter(F.col("channel").isNotNull()).distinct()
    dimensions = {
        "dim_date": dim_date,
        "dim_time": dim_time,
        "dim_customer": _with_unknown(dim_customer, "customer_key"),
        "dim_account": _with_unknown(dim_account, "account_key"),
        "dim_account_type": _with_unknown(
            account_type.select(F.col("account_type_id").alias("account_type_key"), "*"),
            "account_type_key",
        ),
        "dim_branch": _with_unknown(branch.select(F.col("branch_id").alias("branch_key"), "*"), "branch_key"),
        "dim_transaction_type": transaction_type.select(F.col("transaction_type_id").alias("transaction_type_key"), "*"),
        "dim_channel": channels.select(F.col("channel").alias("channel_key"), "channel"),
        "dim_device": _with_unknown(device.select(F.col("device_id").alias("device_key"), "device_id", "device_type", "operating_system", "is_trusted", "status"), "device_key"),
        "dim_model": model.select(F.col("model_version_id").alias("model_key"), "model_version_id", "model_name", "model_type", "status", "created_at"),
    }
    for name, frame in dimensions.items():
        outputs[name] = _write(frame.dropDuplicates([frame.columns[0]]), f"dimensions/{name}")

    transfer = _silver(spark, "transfer_request").select(
        "transaction_id", "source_account_id", "destination_account_id"
    )
    source_branch = account.select(
        F.col("account_id").alias("source_account_id"), F.col("branch_id").alias("source_branch_id")
    )
    fact_transaction = transaction.join(transfer, "transaction_id", "left").join(
        source_branch, "source_account_id", "left"
    ).select(
        "transaction_id", "transaction_code", _date_key("transaction_at").alias("date_key"),
        _time_key("transaction_at").alias("time_key"),
        F.coalesce(F.col("initiated_by_customer_id"), F.lit(-1)).alias("customer_key"),
        F.coalesce(F.col("source_account_id"), F.lit(-1)).alias("source_account_key"),
        F.coalesce(F.col("destination_account_id"), F.lit(-1)).alias("destination_account_key"),
        F.coalesce(F.col("source_branch_id"), F.lit(-1)).alias("branch_key"),
        F.col("transaction_type_id").alias("transaction_type_key"),
        F.col("channel").alias("channel_key"), F.coalesce(F.col("device_id"), F.lit(-1)).alias("device_key"),
        "amount", "fee", "currency", "status", "transaction_at",
    )
    facts = {
        "fact_transaction": fact_transaction,
        "fact_transaction_posting": posting.select(
            "posting_id", "transaction_id", F.col("account_id").alias("account_key"),
            _date_key("posting_at").alias("date_key"), _time_key("posting_at").alias("time_key"),
            "posting_type", "amount", "posting_at",
        ),
        "fact_risk_assessment": risk.select(
            "risk_assessment_id", "transaction_id", F.col("model_version_id").alias("model_key"),
            _date_key("assessed_at").alias("date_key"), _time_key("assessed_at").alias("time_key"),
            "rule_score", "risk_level", "model_probability", "decision",
            F.col("reason_json").cast("string").alias("reason_json"), "assessed_at",
        ),
        "fact_fraud_review": review.select(
            "review_case_id", "transaction_id", _date_key("created_at").alias("created_date_key"),
            _time_key("created_at").alias("created_time_key"), _date_key("reviewed_at").alias("reviewed_date_key"),
            _time_key("reviewed_at").alias("reviewed_time_key"), "status", "reviewer_user_id", "created_at", "reviewed_at",
        ),
        "fact_fraud_label_event": label.select(
            "fraud_label_event_id", "transaction_id", _date_key("labeled_at").alias("date_key"),
            _time_key("labeled_at").alias("time_key"), "label", "label_source", "note", "labeled_at",
        ),
        "fact_login_event": login.select(
            "login_event_id", F.col("customer_id").alias("customer_key"), F.coalesce(F.col("device_id"), F.lit(-1)).alias("device_key"),
            _date_key("login_at").alias("date_key"), _time_key("login_at").alias("time_key"), "status", "login_at",
        ),
        "fact_loan_payment": payment.select(
            "loan_payment_id", "loan_id", "schedule_id", "transaction_id", _date_key("payment_at").alias("date_key"),
            _time_key("payment_at").alias("time_key"), F.col("payment_channel").alias("channel_key"), "payment_channel",
            "amount_paid", "principal_paid", "interest_paid", "penalty_fee", "payment_at",
        ),
    }
    fact_keys = {
        "fact_transaction": "transaction_id", "fact_transaction_posting": "posting_id",
        "fact_risk_assessment": "risk_assessment_id", "fact_fraud_review": "review_case_id",
        "fact_fraud_label_event": "fraud_label_event_id", "fact_login_event": "login_event_id",
        "fact_loan_payment": "loan_payment_id",
    }
    for name, frame in facts.items():
        outputs[name] = _write(frame.dropDuplicates([fact_keys[name]]), f"facts/{name}")
    PipelineState().record_stage(batch_id, "silver_to_gold", outputs)
    return outputs
