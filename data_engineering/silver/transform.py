from __future__ import annotations

from datetime import datetime, timezone
from functools import reduce
from typing import Any

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F
from pyspark.sql.types import StringType

from data_engineering.common.catalog import DatasetContract, contract_for
from data_engineering.common.config import Settings, source_catalog
from data_engineering.common.context import RunContext
from data_engineering.common.logging import event, get_logger
from data_engineering.common.paths import LakePaths
from data_engineering.common.spark import write_parquet
from data_engineering.common.storage import ObjectStore


LOG = get_logger(__name__)


def _rename_and_normalize(frame: DataFrame, contract: DatasetContract, settings: Settings) -> DataFrame:
    metadata = [column for column in frame.columns if column.startswith("_")]
    projections = [F.col(source).alias(target) for source, target in contract.columns.items()]
    result = frame.select(*projections, *[F.col(column) for column in metadata])
    for field in result.schema.fields:
        if isinstance(field.dataType, StringType):
            result = result.withColumn(field.name, F.when(F.col(field.name).isNull(), None).otherwise(F.trim(F.col(field.name))))
    for column in contract.timestamp_columns:
        result = result.withColumn(column, F.to_utc_timestamp(F.col(column), settings.source_timezone))
    return result


def _invalid_conditions(frame: DataFrame, contract: DatasetContract) -> list[tuple[str, Any]]:
    checks: list[tuple[str, Any]] = [(f"NULL_REQUIRED:{column}", F.col(column).isNull()) for column in contract.required]
    checks.extend((f"NOT_POSITIVE:{column}", F.col(column) <= 0) for column in contract.positive_columns)
    checks.extend((f"NEGATIVE:{column}", F.col(column) < 0) for column in contract.nonnegative_columns)
    for column, allowed in (contract.allowed_values or {}).items():
        checks.append((f"INVALID_ENUM:{column}", F.col(column).isNotNull() & ~F.col(column).isin(*allowed)))
    if "rule_score" in frame.columns:
        checks.append(("OUT_OF_RANGE:rule_score", ~F.col("rule_score").between(0, 100)))
    if "model_probability" in frame.columns:
        checks.append(("OUT_OF_RANGE:model_probability", ~F.col("model_probability").between(0, 1)))
    if contract.primary_key in frame.columns:
        duplicate_window = Window.partitionBy(contract.primary_key)
        checks.append(("DUPLICATE_PRIMARY_KEY", F.count(F.lit(1)).over(duplicate_window) > 1))
    return checks


def _reason_expression(checks: list[tuple[str, Any]]):
    values = [F.when(condition, F.lit(reason)) for reason, condition in checks]
    return F.concat_ws(";", F.array_compact(F.array(*values)))


def transform_dataset(spark, settings: Settings, context: RunContext, dataset: str) -> dict[str, Any]:
    contract = contract_for(dataset)
    source_path = LakePaths(settings).bronze_postgres(dataset)
    raw = spark.read.option("recursiveFileLookup", "true").parquet(source_path)
    normalized = _rename_and_normalize(raw, contract, settings)
    raw_rows = normalized.count()
    latest_window = Window.partitionBy(contract.primary_key).orderBy(F.col("_ingested_at").desc(), F.col("_batch_id").desc())
    deduplicated = normalized.withColumn("_row_rank", F.row_number().over(latest_window)).where(F.col("_row_rank") == 1).drop("_row_rank")
    checks = _invalid_conditions(deduplicated, contract)
    reason = _reason_expression(checks)
    classified = deduplicated.withColumn("_rejection_reason", reason)
    rejected = (
        classified.where(F.length(F.col("_rejection_reason")) > 0)
        .withColumn("_rejected_at", F.current_timestamp())
        .withColumn("_source", F.lit(f"bronze/postgres/banking/{dataset}"))
    )
    valid = classified.where(F.length(F.col("_rejection_reason")) == 0).drop("_rejection_reason")
    deduplicated_rows = deduplicated.count()
    duplicate_rows = raw_rows - deduplicated_rows
    rejected_rows = rejected.count()
    valid_rows = valid.count()
    if raw_rows != valid_rows + rejected_rows + duplicate_rows:
        raise RuntimeError(f"Silver accounting mismatch for {dataset}")
    if rejected_rows:
        write_parquet(rejected, LakePaths(settings).quarantine(f"postgres/{dataset}/run_id={context.run_id}"), mode="overwrite")
    write_parquet(valid, LakePaths(settings).silver(dataset), mode="overwrite")
    result = {
        "run_id": context.run_id, "batch_id": context.batch_id, "dataset": dataset,
        "input_rows": raw_rows, "valid_rows": valid_rows, "rejected_rows": rejected_rows,
        "duplicate_rows": duplicate_rows,
        "status": "SUCCESS", "executed_at": datetime.now(timezone.utc).isoformat(),
    }
    ObjectStore(settings).put_json(settings.control_bucket, f"silver/{context.run_id}/{dataset}.json", result)
    event(LOG, "silver_transform_complete", **result)
    return result


def transform_all(spark, settings: Settings, context: RunContext, datasets: list[str] | None = None) -> list[dict[str, Any]]:
    selected = datasets or list(source_catalog()["datasets"])
    results = [transform_dataset(spark, settings, context, dataset) for dataset in selected]
    stream_result = transform_stream_events(spark, settings, context)
    if stream_result:
        results.append(stream_result)
        convergence = converge_transaction_events(spark, settings, context)
        if convergence:
            results.append(convergence)
    return results


def transform_stream_events(spark, settings: Settings, context: RunContext) -> dict[str, Any] | None:
    store = ObjectStore(settings)
    if not store.prefix_exists(settings.bronze_bucket, "kafka/transaction_events/"):
        event(LOG, "stream_bronze_absent", run_id=context.run_id)
        return None
    raw = spark.read.option("recursiveFileLookup", "true").parquet(LakePaths(settings).bronze_kafka())
    required = ["event_id", "event_type", "event_version", "aggregate_type", "aggregate_id", "occurred_at", "payload_json"]
    invalid_condition = reduce(lambda left, right: left | right, [F.col(column).isNull() for column in required])
    invalid = (
        raw.where(invalid_condition)
        .withColumn("_rejection_reason", F.lit("INVALID_EVENT_ENVELOPE"))
        .withColumn("_rejected_at", F.current_timestamp())
        .withColumn("_source", F.lit("bronze/kafka/transaction_events"))
    )
    window = Window.partitionBy("event_id").orderBy(F.col("_ingested_at").desc(), F.col("_kafka_offset").desc())
    valid = raw.where(~invalid_condition).withColumn("_row_rank", F.row_number().over(window)).where(F.col("_row_rank") == 1).drop("_row_rank")
    rejected_rows = invalid.count()
    if rejected_rows:
        write_parquet(invalid, LakePaths(settings).quarantine(f"kafka/transaction_events/run_id={context.run_id}"), mode="overwrite")
    write_parquet(valid, LakePaths(settings).silver("domain_event"), mode="overwrite")
    result = {
        "run_id": context.run_id, "batch_id": context.batch_id, "dataset": "domain_event",
        "input_rows": raw.count(), "valid_rows": valid.count(), "rejected_rows": rejected_rows,
        "duplicate_rows": raw.count() - rejected_rows - valid.count(),
        "status": "SUCCESS", "executed_at": datetime.now(timezone.utc).isoformat(),
    }
    store.put_json(settings.control_bucket, f"silver/{context.run_id}/domain_event.json", result)
    event(LOG, "stream_silver_complete", **result)
    return result


def converge_transaction_events(spark, settings: Settings, context: RunContext) -> dict[str, Any] | None:
    """Apply latest committed realtime status to the canonical batch transaction row."""
    paths = LakePaths(settings)
    batch = spark.read.parquet(paths.silver("bank_transaction")).alias("batch")
    events = spark.read.parquet(paths.silver("domain_event")).where(F.col("event_type") == "TransactionCompleted")
    if events.limit(1).count() == 0:
        return None
    transaction_events = (
        events.select(
            F.get_json_object("payload_json", "$.transaction_id").cast("long").alias("transaction_id"),
            F.get_json_object("payload_json", "$.status").alias("event_status"),
            F.to_timestamp("occurred_at").alias("event_occurred_at"),
            "_ingested_at", "_kafka_offset",
        )
        .where(F.col("transaction_id").isNotNull())
    )
    input_events = transaction_events.count()
    window = Window.partitionBy("transaction_id").orderBy(
        F.col("event_occurred_at").desc_nulls_last(), F.col("_kafka_offset").desc_nulls_last()
    )
    latest = transaction_events.withColumn("_rank", F.row_number().over(window)).where(F.col("_rank") == 1).drop("_rank")
    merged = (
        batch.join(latest.alias("event"), F.col("batch.transaction_id") == F.col("event.transaction_id"), "left")
        .select(
            *[
                (F.coalesce(F.col("event.event_status"), F.col("batch.status")).alias("status") if column == "status" else F.col(f"batch.{column}"))
                for column in batch.columns
            ]
        )
    )
    staging = f"{paths.silver('_staging/bank_transaction')}/run_id={context.run_id}"
    write_parquet(merged, staging, mode="overwrite")
    materialized = spark.read.parquet(staging)
    write_parquet(materialized, paths.silver("bank_transaction"), mode="overwrite")
    matched = batch.join(latest, "transaction_id", "inner").count()
    result = {
        "run_id": context.run_id,
        "batch_id": context.batch_id,
        "dataset": "bank_transaction_convergence",
        "input_rows": input_events,
        "valid_rows": matched,
        "rejected_rows": 0,
        "duplicate_rows": input_events - latest.count(),
        "status": "SUCCESS",
        "executed_at": datetime.now(timezone.utc).isoformat(),
    }
    ObjectStore(settings).put_json(settings.control_bucket, f"silver/{context.run_id}/bank_transaction_convergence.json", result)
    event(LOG, "transaction_convergence_complete", **result)
    return result
