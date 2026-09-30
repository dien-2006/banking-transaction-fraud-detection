from __future__ import annotations

from typing import Any

from pyspark.sql import functions as F

from data_engineering.common.config import load_yaml, s3a
from data_engineering.common.contracts import contract_for
from data_engineering.common.spark import session
from data_engineering.common.state import PipelineState


METADATA_COLUMNS = {
    "_ingested_at",
    "_source_system",
    "_source_table",
    "_batch_id",
    "_ingestion_mode",
    "_source_pk",
}


def run(batch_id: str) -> dict[str, dict[str, Any]]:
    spark = session("bronze-validation")
    sources = load_yaml("config/sources.yaml")["sources"]
    metrics: dict[str, dict[str, Any]] = {}
    failures: list[str] = []
    for table, source in sources.items():
        path = s3a("MINIO_BUCKET_BRONZE", f"postgres/{table}/batch_id={batch_id}")
        frame = spark.read.parquet(path)
        contract = contract_for(table)
        expected = set(contract.columns) | METADATA_COLUMNS
        missing = sorted(expected - set(frame.columns))
        total = frame.count()
        null_keys = frame.filter(F.col(source["primary_key"]).isNull()).count()
        metrics[table] = {
            "rows": total,
            "null_primary_keys": null_keys,
            "missing_columns": missing,
            "path": path,
        }
        if missing or null_keys:
            failures.append(
                f"{table}(missing={missing}, null_primary_keys={null_keys})"
            )
    PipelineState().record_stage(batch_id, "bronze_validation", metrics)
    if failures:
        raise ValueError("Bronze validation failed: " + "; ".join(failures))
    return metrics
