from __future__ import annotations

from datetime import datetime, timezone
from time import monotonic
from typing import Any

from pyspark.sql import functions as F

from data_engineering.common.catalog import contract_for
from data_engineering.common.config import Settings, source_catalog
from data_engineering.common.context import RunContext
from data_engineering.common.logging import event, get_logger
from data_engineering.common.paths import LakePaths
from data_engineering.common.spark import read_postgres, write_parquet
from data_engineering.common.storage import ObjectStore


LOG = get_logger(__name__)


def _incremental_query(settings: Settings, dataset: str, spec: dict[str, Any], state: dict[str, Any] | None) -> str:
    table = f'"{settings.postgres_schema}"."{dataset}"'
    projection = ", ".join(f'"{column}"' for column in contract_for(dataset).columns)
    if spec["strategy"] != "INCREMENTAL" or not state or not spec.get("watermark"):
        return f"SELECT {projection} FROM {table}"
    timestamp_column, pk_column = spec["watermark"]
    timestamp_value = str(state["timestamp"]).replace("'", "''")
    pk_value = int(state["pk"])
    return (
        f"SELECT {projection} FROM {table} WHERE ({timestamp_column} > TIMESTAMP '{timestamp_value}') "
        f"OR ({timestamp_column} = TIMESTAMP '{timestamp_value}' AND {pk_column} > {pk_value})"
    )


def extract_dataset(spark, settings: Settings, context: RunContext, dataset: str) -> dict[str, Any]:
    catalog = source_catalog()["datasets"]
    if dataset not in catalog:
        raise ValueError(f"Dataset is not allowlisted: {dataset}")
    spec = catalog[dataset]
    store = ObjectStore(settings)
    store.ensure_buckets()
    previous = store.watermark(dataset)
    query = _incremental_query(settings, dataset, spec, previous)
    started_at = datetime.now(timezone.utc)
    timer = monotonic()
    frame = read_postgres(spark, settings, query)
    rows_read = frame.count()
    ingest_date = started_at.date().isoformat()
    enriched = (
        frame.withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source_system", F.lit("banking_postgresql"))
        .withColumn("_source_table", F.lit(dataset))
        .withColumn("_ingestion_mode", F.lit("BATCH"))
        .withColumn("_batch_id", F.lit(context.batch_id))
        .withColumn("_run_id", F.lit(context.run_id))
        .withColumn("_source_timezone", F.lit(settings.source_timezone))
        .withColumn("_source_pk", F.col(spec["pk"]).cast("string"))
    )
    path = LakePaths(settings).bronze_postgres(dataset, ingest_date, context.batch_id)
    write_parquet(enriched, path, mode="overwrite")
    rows_written = spark.read.parquet(path).count()
    if rows_written != rows_read:
        raise RuntimeError(f"Bronze count mismatch for {dataset}: read={rows_read}, written={rows_written}")

    candidate = None
    if rows_read and spec.get("watermark"):
        ts_col, pk_col = spec["watermark"]
        row = frame.orderBy(F.col(ts_col).desc(), F.col(pk_col).desc()).select(ts_col, pk_col).first()
        candidate = {"timestamp": str(row[ts_col]), "pk": int(row[pk_col])}
        store.put_json(
            settings.control_bucket,
            f"watermark-candidates/{context.run_id}/{dataset}.json",
            {"dataset": dataset, "run_id": context.run_id, "batch_id": context.batch_id, **candidate},
        )

    result = {
        "run_id": context.run_id,
        "batch_id": context.batch_id,
        "dataset": dataset,
        "source": f"postgresql:{settings.postgres_schema}.{dataset}",
        "target": path,
        "load_type": "FULL" if previous is None else spec["strategy"],
        "watermark_start": previous,
        "watermark_end": candidate,
        "start_time": started_at.isoformat(),
        "end_time": datetime.now(timezone.utc).isoformat(),
        "rows_read": rows_read,
        "rows_written": rows_written,
        "rows_rejected": 0,
        "duration_seconds": round(monotonic() - timer, 3),
        "status": "SUCCESS",
    }
    store.put_json(settings.control_bucket, f"batches/{context.run_id}/{dataset}.json", result)
    event(LOG, "batch_extract_complete", **result)
    return result


def extract_all(spark, settings: Settings, context: RunContext, datasets: list[str] | None = None) -> list[dict[str, Any]]:
    selected = datasets or list(source_catalog()["datasets"])
    return [extract_dataset(spark, settings, context, dataset) for dataset in selected]
