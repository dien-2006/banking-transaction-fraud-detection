from __future__ import annotations

from functools import reduce
import os

from pyspark.sql import DataFrame, Window, functions as F
from pyspark.sql.types import StringType
from pyspark.errors import AnalysisException

from data_engineering.common.config import load_yaml, s3a
from data_engineering.common.contracts import DatasetContract, contract_for
from data_engineering.common.spark import session
from data_engineering.common.state import PipelineState


def _validate(frame: DataFrame, expressions: list[str]) -> tuple[DataFrame, DataFrame]:
    if not expressions:
        return frame, frame.limit(0)
    valid_expression = reduce(lambda left, right: left & F.expr(right), expressions[1:], F.expr(expressions[0]))
    invalid = frame.filter(~F.coalesce(valid_expression, F.lit(False))).withColumn(
        "error_code", F.lit("DQ_RULE_FAILED")
    ).withColumn(
        "error_reason", F.lit("one or more configured validation rules failed")
    )
    return frame.filter(F.coalesce(valid_expression, F.lit(False))), invalid


def _normalize(frame: DataFrame, contract: DatasetContract) -> DataFrame:
    missing = sorted(set(contract.columns) - set(frame.columns))
    if missing:
        raise ValueError(f"source contract missing columns: {missing}")
    metadata = [column for column in frame.columns if column.startswith("_")]
    normalized = frame.select(
        *[F.col(source).alias(target) for source, target in contract.columns.items()],
        *[F.col(column) for column in metadata],
    )
    for field in normalized.schema.fields:
        if isinstance(field.dataType, StringType):
            normalized = normalized.withColumn(field.name, F.trim(F.col(field.name)))
    timezone = os.getenv("SOURCE_TIMEZONE", "Asia/Ho_Chi_Minh")
    for column in contract.timestamps:
        normalized = normalized.withColumn(
            column, F.to_utc_timestamp(F.col(column), timezone)
        )
    return normalized


def _merge_realtime_events(spark, batch_id: str) -> dict[str, int] | None:
    path = s3a("MINIO_BUCKET_BRONZE", "kafka/events")
    try:
        raw = spark.read.option("recursiveFileLookup", "true").json(path)
    except AnalysisException as exc:
        if "PATH_NOT_FOUND" in str(exc):
            return None
        raise
    if raw.limit(1).count() == 0:
        return None
    events = raw.select(
        F.col("envelope.event_id").alias("event_id"),
        F.col("envelope.event_type").alias("event_type"),
        F.col("envelope.aggregate_id").alias("aggregate_id"),
        F.col("envelope.occurred_at").cast("timestamp").alias("occurred_at"),
        F.col("envelope.payload").alias("payload"),
        F.col("ingested_at").cast("timestamp").alias("_ingested_at"),
        F.col("partition").alias("_kafka_partition"),
        F.col("offset").alias("_kafka_offset"),
        F.col("topic").alias("_kafka_topic"),
    )
    required = (
        F.col("event_id").isNotNull()
        & F.col("event_type").isNotNull()
        & F.col("aggregate_id").isNotNull()
    )
    invalid = events.filter(~required)
    invalid_count = invalid.count()
    if invalid_count:
        (
            invalid.withColumn("source_dataset", F.lit("domain_event"))
            .withColumn("business_key", F.col("event_id"))
            .withColumn("original_data", F.to_json(F.struct(*events.columns)))
            .withColumn("error_code", F.lit("INVALID_EVENT_ENVELOPE"))
            .withColumn("error_reason", F.lit("required event envelope field is null"))
            .withColumn("batch_id", F.lit(batch_id))
            .withColumn("quarantined_at", F.current_timestamp())
            .write.mode("overwrite")
            .parquet(s3a("MINIO_BUCKET_QUARANTINE", f"domain_event/batch_id={batch_id}"))
        )
    valid_events = events.filter(required)
    window = Window.partitionBy("event_id").orderBy(
        F.col("_ingested_at").desc(), F.col("_kafka_offset").desc()
    )
    canonical = valid_events.withColumn(
        "_rank", F.row_number().over(window)
    ).filter("_rank = 1").drop("_rank")
    canonical.write.mode("overwrite").parquet(
        s3a("MINIO_BUCKET_SILVER", "domain_event")
    )

    completed = canonical.filter(F.col("event_type") == "TransactionCompleted").select(
        F.col("aggregate_id").cast("long").alias("transaction_id"),
        F.col("payload.status").alias("event_status"),
        "occurred_at",
        "_kafka_offset",
    )
    latest_window = Window.partitionBy("transaction_id").orderBy(
        F.col("occurred_at").desc_nulls_last(), F.col("_kafka_offset").desc()
    )
    latest = completed.withColumn("_rank", F.row_number().over(latest_window)).filter(
        "_rank = 1"
    ).drop("_rank")
    transaction_path = s3a("MINIO_BUCKET_SILVER", "bank_transaction")
    transactions = spark.read.parquet(transaction_path).alias("batch")
    merged = transactions.join(latest.alias("event"), "transaction_id", "left").select(
        *[
            F.coalesce(F.col("event.event_status"), F.col("batch.status")).alias("status")
            if column == "status" else F.col(f"batch.{column}")
            for column in transactions.columns
        ]
    )
    staging = s3a("MINIO_BUCKET_SILVER", f"_staging/bank_transaction/batch_id={batch_id}")
    merged.write.mode("overwrite").parquet(staging)
    spark.read.parquet(staging).write.mode("overwrite").parquet(transaction_path)
    return {
        "input": raw.count(),
        "valid": canonical.count(),
        "invalid": invalid_count,
    }


def run(batch_id: str) -> dict[str, dict[str, int]]:
    spark = session("bronze-to-silver")
    sources = load_yaml("config/sources.yaml")["sources"]
    rules = load_yaml("config/data_quality.yaml").get("rules", {})
    metrics: dict[str, dict[str, int]] = {}
    for table in sources:
        contract = contract_for(table)
        frame = spark.read.option("recursiveFileLookup", "true").parquet(
            s3a("MINIO_BUCKET_BRONZE", f"postgres/{table}")
        )
        input_count = frame.count()
        normalized = _normalize(frame, contract)
        ordering = [F.col("_ingested_at").desc(), F.col("_batch_id").desc()]
        canonical = normalized.withColumn("_rank", F.row_number().over(Window.partitionBy(contract.primary_key).orderBy(ordering))).filter("_rank = 1").drop("_rank")
        dataset_rules = [
            *[f"{column} IS NOT NULL" for column in contract.required],
            *rules.get(table, []),
        ]
        valid, invalid = _validate(canonical, dataset_rules)
        valid.write.mode("overwrite").parquet(s3a("MINIO_BUCKET_SILVER", table))
        invalid_count = invalid.count()
        if invalid_count:
            (
                invalid.withColumn("source_dataset", F.lit(table))
                .withColumn("business_key", F.col(contract.primary_key).cast("string"))
                .withColumn("original_data", F.to_json(F.struct(*canonical.columns)))
                .withColumn("batch_id", F.lit(batch_id))
                .withColumn("quarantined_at", F.current_timestamp())
                .write.mode("overwrite")
                .parquet(s3a("MINIO_BUCKET_QUARANTINE", f"{table}/batch_id={batch_id}"))
            )
        valid_count = valid.count()
        metrics[table] = {
            "input": input_count,
            "valid": valid_count,
            "invalid": invalid_count,
            "duplicates": input_count - canonical.count(),
            "output": valid_count,
        }
    realtime = None
    if os.getenv("ENABLE_REALTIME_SILVER_MERGE", "false").lower() in {
        "1", "true", "yes"
    }:
        realtime = _merge_realtime_events(spark, batch_id)
    if realtime:
        metrics["domain_event"] = realtime
    PipelineState().record_stage(batch_id, "bronze_to_silver", metrics)
    return metrics
