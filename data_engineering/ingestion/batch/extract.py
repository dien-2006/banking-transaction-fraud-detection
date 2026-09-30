from __future__ import annotations

import os
from typing import Any

from pyspark.sql import functions as F

from data_engineering.common.config import load_yaml, s3a
from data_engineering.common.contracts import contract_for
from data_engineering.common.spark import session
from data_engineering.common.state import PipelineState


def _source_query(
    schema: str,
    table: str,
    source: dict[str, Any],
    previous: dict[str, Any] | None,
) -> str:
    contract = contract_for(table)
    projection = ", ".join(f'"{column}"' for column in contract.columns)
    qualified = f'"{schema}"."{table}"'
    if source["strategy"] != "INCREMENTAL" or not previous:
        return f"SELECT {projection} FROM {qualified}"
    timestamp_column, key_column = source["watermark"]
    timestamp = str(previous["timestamp"]).replace("'", "''")
    primary_key = int(previous["primary_key"])
    return (
        f"SELECT {projection} FROM {qualified} "
        f"WHERE (\"{timestamp_column}\" > TIMESTAMP '{timestamp}') "
        f"OR (\"{timestamp_column}\" = TIMESTAMP '{timestamp}' "
        f"AND \"{key_column}\" > {primary_key})"
    )


def run(batch_id: str) -> dict[str, dict[str, Any]]:
    spark = session("postgres-to-bronze")
    sources = load_yaml("config/sources.yaml")["sources"]
    schema = os.getenv("POSTGRES_SCHEMA", "banking")
    jdbc_url = (
        f"jdbc:postgresql://{os.getenv('POSTGRES_HOST', 'postgres-bank')}:"
        f"{os.getenv('POSTGRES_INTERNAL_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'bank_fraud')}"
    )
    state = PipelineState()
    metrics: dict[str, dict[str, Any]] = {}
    for table, source in sources.items():
        previous = state.watermark(table) if source["strategy"] == "INCREMENTAL" else None
        query = _source_query(schema, table, source, previous)
        frame = (
            spark.read.format("jdbc")
            .option("url", jdbc_url)
            .option("dbtable", f"({query}) AS source_data")
            .option("user", os.environ["POSTGRES_USER"])
            .option("password", os.environ["POSTGRES_PASSWORD"])
            .option("driver", "org.postgresql.Driver")
            .load()
        )
        input_count = frame.count()
        enriched = (
            frame
            .withColumn("_ingested_at", F.current_timestamp())
            .withColumn("_source_system", F.lit("postgresql"))
            .withColumn("_source_table", F.lit(table))
            .withColumn("_batch_id", F.lit(batch_id))
            .withColumn("_ingestion_mode", F.lit("BATCH"))
            .withColumn("_source_pk", F.col(source["primary_key"]).cast("string"))
        )
        target = s3a("MINIO_BUCKET_BRONZE", f"postgres/{table}/batch_id={batch_id}")
        enriched.write.mode("overwrite").parquet(target)
        output_count = spark.read.parquet(target).count()
        if output_count != input_count:
            raise RuntimeError(
                f"Bronze count mismatch table={table} input={input_count} output={output_count}"
            )
        candidate = None
        if input_count and source.get("watermark"):
            timestamp_column, key_column = source["watermark"]
            last = frame.orderBy(
                F.col(timestamp_column).desc(), F.col(key_column).desc()
            ).select(timestamp_column, key_column).first()
            candidate = {
                "timestamp": str(last[timestamp_column]),
                "primary_key": int(last[key_column]),
            }
            state.save_candidate(batch_id, table, **candidate)
        metrics[table] = {
            "strategy": source["strategy"],
            "input": input_count,
            "output": output_count,
            "watermark_start": previous,
            "watermark_candidate": candidate,
            "target": target,
        }
    state.record_stage(batch_id, "postgres_to_bronze", metrics)
    return metrics
