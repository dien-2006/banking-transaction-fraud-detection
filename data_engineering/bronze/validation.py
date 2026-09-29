from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pyspark.sql import functions as F

from data_engineering.common.catalog import contract_for
from data_engineering.common.config import Settings, source_catalog
from data_engineering.common.context import RunContext
from data_engineering.common.logging import event, get_logger
from data_engineering.common.paths import LakePaths
from data_engineering.common.storage import ObjectStore


LOG = get_logger(__name__)
METADATA_COLUMNS = {
    "_ingested_at", "_source_system", "_source_table", "_ingestion_mode",
    "_batch_id", "_run_id", "_source_timezone", "_source_pk",
}


def validate_bronze_dataset(spark, settings: Settings, context: RunContext, dataset: str) -> dict[str, Any]:
    path = LakePaths(settings).bronze_postgres(dataset)
    try:
        frame = spark.read.option("recursiveFileLookup", "true").parquet(path).where(F.col("_batch_id") == context.batch_id)
    except Exception as exc:
        raise RuntimeError(f"Bronze unreadable for {dataset} at {path}") from exc
    expected = set(contract_for(dataset).columns) | METADATA_COLUMNS
    missing = sorted(expected - set(frame.columns))
    rows = frame.count()
    pk_source = source_catalog()["datasets"][dataset]["pk"]
    null_keys = frame.where(F.col(pk_source).isNull()).count() if pk_source in frame.columns else rows
    status = "PASS" if not missing and null_keys == 0 else "FAIL"
    result = {
        "run_id": context.run_id,
        "batch_id": context.batch_id,
        "dataset": dataset,
        "check_name": "bronze_contract",
        "rows_checked": rows,
        "rows_failed": null_keys,
        "severity": "ERROR",
        "status": status,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "details": {"missing_columns": missing, "path": path},
    }
    ObjectStore(settings).put_json(settings.control_bucket, f"validations/bronze/{context.run_id}/{dataset}.json", result)
    event(LOG, "bronze_validation_complete", **result)
    if status == "FAIL":
        raise ValueError(f"Bronze validation failed for {dataset}: missing={missing}, null_keys={null_keys}")
    return result


def validate_all(spark, settings: Settings, context: RunContext, datasets: list[str] | None = None) -> list[dict[str, Any]]:
    selected = datasets or list(source_catalog()["datasets"])
    return [validate_bronze_dataset(spark, settings, context, dataset) for dataset in selected]
