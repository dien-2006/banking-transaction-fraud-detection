from __future__ import annotations

import argparse
import json
import logging
import uuid

from data_engineering.bronze.validate import run as validate_bronze
from data_engineering.common.config import load_yaml
from data_engineering.common.spark import session
from data_engineering.common.state import PipelineState
from data_engineering.gold.build import run as build_gold
from data_engineering.ingestion.batch.extract import run as extract
from data_engineering.quality.checks import run as quality
from data_engineering.silver.transform import run as transform


def commit_state(batch_id: str) -> dict[str, bool]:
    sources = load_yaml("config/sources.yaml")["sources"]
    state = PipelineState()
    committed = {
        dataset: state.commit_candidate(batch_id, dataset)
        for dataset, source in sources.items()
        if source["strategy"] == "INCREMENTAL"
    }
    state.record_stage(batch_id, "commit_state", committed)
    return committed


def dependency_check(batch_id: str) -> dict[str, object]:
    spark = session("pipeline-dependency-check")
    spark_ok = spark.range(1).count() == 1
    state = PipelineState()
    state.ensure_bucket()
    metrics = {"spark": spark_ok, "control_bucket": state.bucket}
    state.record_stage(batch_id, "dependency_check", metrics)
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "stage",
        choices=[
            "check", "extract", "bronze-dq", "silver", "silver-dq",
            "commit-state", "gold", "gold-dq",
        ],
    )
    parser.add_argument("--batch-id", default=uuid.uuid4().hex)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if args.stage == "check":
        metrics = dependency_check(args.batch_id)
    elif args.stage == "extract":
        metrics = extract(args.batch_id)
    elif args.stage == "bronze-dq":
        metrics = validate_bronze(args.batch_id)
    elif args.stage == "silver":
        metrics = transform(args.batch_id)
    elif args.stage == "silver-dq":
        metrics = quality("silver", args.batch_id)
    elif args.stage == "commit-state":
        metrics = commit_state(args.batch_id)
    elif args.stage == "gold":
        metrics = build_gold(args.batch_id)
    else:
        metrics = quality("gold", args.batch_id)
    logging.info("pipeline_stage_success stage=%s batch_id=%s metrics=%s", args.stage, args.batch_id, json.dumps(metrics))


if __name__ == "__main__":
    main()
