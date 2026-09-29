from __future__ import annotations

import argparse
import socket
from datetime import datetime, timezone
from time import monotonic

import psycopg

from data_engineering.bronze.validation import validate_all
from data_engineering.common.config import Settings, source_catalog
from data_engineering.common.context import RunContext
from data_engineering.common.logging import event, get_logger
from data_engineering.common.spark import create_spark
from data_engineering.common.storage import ObjectStore
from data_engineering.gold.build import build_dimensions, build_facts
from data_engineering.ingestion.batch.extract import extract_all
from data_engineering.quality.checks import gold_quality, silver_quality
from data_engineering.silver.transform import transform_all


LOG = get_logger(__name__)


def commit_state(settings: Settings, context: RunContext) -> None:
    store = ObjectStore(settings)
    for dataset, spec in source_catalog()["datasets"].items():
        candidate = store.get_json(settings.control_bucket, f"watermark-candidates/{context.run_id}/{dataset}.json")
        if spec["strategy"] == "INCREMENTAL" and candidate:
            store.save_watermark(dataset, {
                "dataset": dataset, "timestamp": candidate["timestamp"], "pk": candidate["pk"],
                "run_id": context.run_id, "batch_id": context.batch_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
    store.put_json(settings.control_bucket, "state/last-successful-silver.json", context.as_dict())
    event(LOG, "watermarks_committed", run_id=context.run_id)


def dependency_check(spark, settings: Settings) -> None:
    with psycopg.connect(settings.postgres_dsn, connect_timeout=10) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            assert cursor.fetchone() == (1,)
    store = ObjectStore(settings)
    store.ensure_buckets()
    store.put_json(settings.control_bucket, "health/last-check.json", {"checked_at": datetime.now(timezone.utc).isoformat(), "host": socket.gethostname()})
    assert spark.range(1).count() == 1
    event(LOG, "dependency_check_passed")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Banking Bronze/Silver/Gold Spark pipeline")
    parser.add_argument("stage", choices=["check", "extract", "validate-bronze", "silver", "silver-dq", "commit-state", "gold-dimensions", "gold-dimension-dq", "gold-facts", "gold-fact-dq", "all"])
    parser.add_argument("--run-id")
    parser.add_argument("--batch-id")
    parser.add_argument("--datasets", help="Comma-separated allowlisted datasets")
    parser.add_argument("--master", help="Spark master override; use local[*] for local tests")
    return parser


def main() -> None:
    args = _parser().parse_args()
    settings = Settings.from_env()
    context = RunContext.create(args.run_id, args.batch_id)
    selected = args.datasets.split(",") if args.datasets else None
    store = ObjectStore(settings)
    store.ensure_buckets()
    spark = None
    timer = monotonic()
    try:
        store.record_run(context.run_id, "RUNNING", batch_id=context.batch_id, stage=args.stage)
        if args.stage == "commit-state":
            commit_state(settings, context)
            store.record_run(context.run_id, "SUCCESS", batch_id=context.batch_id, stage=args.stage, duration_seconds=round(monotonic() - timer, 3))
            return
        spark = create_spark(f"bank-{args.stage}-{context.run_id}", settings, args.master)
        if args.stage == "check": dependency_check(spark, settings)
        elif args.stage == "extract": extract_all(spark, settings, context, selected)
        elif args.stage == "validate-bronze": validate_all(spark, settings, context, selected)
        elif args.stage == "silver": transform_all(spark, settings, context, selected)
        elif args.stage == "silver-dq": silver_quality(spark, settings, context)
        elif args.stage == "gold-dimensions": build_dimensions(spark, settings, context)
        elif args.stage == "gold-dimension-dq": gold_quality(spark, settings, context, "dimensions")
        elif args.stage == "gold-facts": build_facts(spark, settings, context)
        elif args.stage == "gold-fact-dq": gold_quality(spark, settings, context, "facts")
        elif args.stage == "all":
            dependency_check(spark, settings)
            extract_all(spark, settings, context, selected)
            validate_all(spark, settings, context, selected)
            transform_all(spark, settings, context, selected)
            silver_quality(spark, settings, context)
            commit_state(settings, context)
            build_dimensions(spark, settings, context)
            gold_quality(spark, settings, context, "dimensions")
            build_facts(spark, settings, context)
            gold_quality(spark, settings, context, "facts")
        store.record_run(context.run_id, "SUCCESS", batch_id=context.batch_id, stage=args.stage, duration_seconds=round(monotonic() - timer, 3))
    except Exception as exc:
        store.record_run(context.run_id, "FAILED", batch_id=context.batch_id, stage=args.stage, duration_seconds=round(monotonic() - timer, 3), error=str(exc))
        event(LOG, "pipeline_failed", run_id=context.run_id, stage=args.stage, error=str(exc))
        raise
    finally:
        if spark is not None:
            spark.stop()


if __name__ == "__main__":
    main()
