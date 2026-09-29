from __future__ import annotations

import json
import math
from datetime import datetime, timezone

from pyspark.sql import Window
from pyspark.sql import functions as F

from data_engineering.common.config import Settings
from data_engineering.common.context import RunContext
from data_engineering.common.logging import event, get_logger
from data_engineering.common.paths import LakePaths
from data_engineering.common.spark import create_spark, write_parquet
from data_engineering.common.storage import ObjectStore


LOG = get_logger(__name__)
FEATURES = ("log_amount", "new_device", "unusual_time", "velocity", "failed_logins", "amount_ratio")


def _fit(rows: list, iterations: int = 500, rate: float = 0.15) -> tuple[float, dict[str, float]]:
    intercept = 0.0
    weights = {name: 0.0 for name in FEATURES}
    for _ in range(iterations):
        grad_i = 0.0
        grad = {name: 0.0 for name in FEATURES}
        for row in rows:
            score = intercept + sum(weights[name] * float(row[name]) for name in FEATURES)
            probability = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, score))))
            error = probability - float(row["label"])
            grad_i += error
            for name in FEATURES:
                grad[name] += error * float(row[name])
        scale = rate / len(rows)
        intercept -= scale * grad_i
        for name in FEATURES:
            weights[name] -= scale * grad[name]
    return intercept, weights


def _evaluate(rows: list, intercept: float, weights: dict[str, float]) -> dict[str, float]:
    if not rows:
        return {"samples": 0, "accuracy": 0.0, "log_loss": 0.0}
    correct = 0
    loss = 0.0
    for row in rows:
        score = intercept + sum(weights[name] * float(row[name]) for name in FEATURES)
        probability = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, score))))
        label = float(row["label"])
        correct += int((probability >= 0.5) == bool(label))
        clipped = min(max(probability, 1e-9), 1 - 1e-9)
        loss += -(label * math.log(clipped) + (1 - label) * math.log(1 - clipped))
    return {"samples": len(rows), "accuracy": correct / len(rows), "log_loss": loss / len(rows)}


def train(spark, settings: Settings, context: RunContext) -> dict:
    paths = LakePaths(settings)
    transaction = spark.read.parquet(paths.silver("bank_transaction")).alias("t")
    labels = spark.read.parquet(paths.silver("fraud_label_event"))
    latest = (
        labels.where(F.col("label").isin("FRAUD", "LEGITIMATE"))
        .withColumn("_rank", F.row_number().over(Window.partitionBy("transaction_id").orderBy(F.col("labeled_at").desc(), F.col("fraud_label_event_id").desc())))
        .where(F.col("_rank") == 1)
        .select("transaction_id", F.when(F.col("label") == "FRAUD", 1.0).otherwise(0.0).alias("label"))
    )
    device = spark.read.parquet(paths.silver("customer_device")).select("device_id", "is_trusted")
    timeline = transaction.select("transaction_id", "initiated_by_customer_id", "transaction_at", "amount", "status")
    current = timeline.select(
        F.col("transaction_id").alias("current_id"), F.col("initiated_by_customer_id").alias("customer_id"),
        F.col("transaction_at").alias("current_at"), F.col("amount").alias("current_amount"),
    )
    prior = timeline.select(
        F.col("transaction_id").alias("prior_id"), F.col("initiated_by_customer_id").alias("prior_customer_id"),
        F.col("transaction_at").alias("prior_at"), F.col("amount").alias("prior_amount"), F.col("status").alias("prior_status"),
    )
    shared = (F.col("customer_id") == F.col("prior_customer_id")) & (F.col("prior_at") < F.col("current_at"))
    velocity = (
        current.join(prior, shared & (F.col("prior_at") >= F.col("current_at") - F.expr("INTERVAL 10 MINUTES")), "left")
        .groupBy("current_id").agg(F.count("prior_id").alias("transaction_count_10m"))
    )
    average = (
        current.join(prior, shared & (F.col("prior_status") == "Success") & (F.col("prior_at") >= F.col("current_at") - F.expr("INTERVAL 30 DAYS")), "left")
        .groupBy("current_id").agg(F.avg("prior_amount").alias("average_amount_30d"))
    )
    login = spark.read.parquet(paths.silver("login_event")).select(
        F.col("customer_id").alias("login_customer_id"), "login_at", F.col("status").alias("login_status")
    )
    failed = (
        current.join(
            login,
            (F.col("customer_id") == F.col("login_customer_id"))
            & F.col("login_status").isin("Failed", "Blocked")
            & (F.col("login_at") < F.col("current_at"))
            & (F.col("login_at") >= F.col("current_at") - F.expr("INTERVAL 30 MINUTES")),
            "left",
        )
        .groupBy("current_id").agg(F.count("login_at").alias("failed_login_count_30m"))
    )
    base = (
        transaction.join(latest, "transaction_id").join(device, "device_id", "left")
        .join(velocity, F.col("transaction_id") == F.col("current_id"), "left").drop("current_id")
        .join(average, F.col("transaction_id") == F.col("current_id"), "left").drop("current_id")
        .join(failed, F.col("transaction_id") == F.col("current_id"), "left").drop("current_id")
    )
    feature_mart = base.select(
        "transaction_id", "label",
        (F.log1p(F.col("amount").cast("double")) / F.lit(20.0)).alias("log_amount"),
        F.when(F.coalesce(F.col("is_trusted"), F.lit(False)), 0.0).otherwise(1.0).alias("new_device"),
        F.when(F.hour("transaction_at").between(0, 4), 1.0).otherwise(0.0).alias("unusual_time"),
        F.least(F.coalesce(F.col("transaction_count_10m"), F.lit(0)) / F.lit(5.0), F.lit(3.0)).alias("velocity"),
        F.least(F.coalesce(F.col("failed_login_count_30m"), F.lit(0)) / F.lit(5.0), F.lit(3.0)).alias("failed_logins"),
        F.when(F.col("average_amount_30d") > 0, F.least((F.col("amount") / F.col("average_amount_30d") / F.lit(10.0)).cast("double"), F.lit(1.0))).otherwise(0.0).alias("amount_ratio"),
    )
    feature_path = f"s3a://{settings.ml_bucket}/fraud_detection/feature-mart"
    write_parquet(feature_mart, feature_path, mode="overwrite")
    rows = feature_mart.collect()
    classes = {int(row["label"]) for row in rows}
    store = ObjectStore(settings)
    result = {"run_id": context.run_id, "samples": len(rows), "classes": sorted(classes)}
    if len(rows) < 4 or classes != {0, 1}:
        result.update({"status": "SKIPPED", "reason": "at least four curated labels spanning both classes are required"})
        store.put_json(settings.control_bucket, f"ml/{context.run_id}.json", result)
        event(LOG, "ml_training_skipped", **result)
        return result
    train_rows = [row for row in rows if int(row["transaction_id"]) % 5 != 0]
    test_rows = [row for row in rows if int(row["transaction_id"]) % 5 == 0]
    if not train_rows or {int(row["label"]) for row in train_rows} != {0, 1}:
        train_rows = rows
    intercept, weights = _fit(train_rows)
    metrics = {"train": _evaluate(train_rows, intercept, weights), "test": _evaluate(test_rows, intercept, weights)}
    version = f"run-{context.run_id}"
    artifact = {"version": version, "model_type": "logistic_regression", "intercept": intercept, "weights": weights}
    prefix = f"fraud_detection/{version}"
    store.put_json(settings.ml_bucket, f"{prefix}/model.json", artifact)
    store.put_json(settings.ml_bucket, f"{prefix}/features.json", {"features": list(FEATURES), "label": "fraud_label_event.label"})
    store.put_json(settings.ml_bucket, f"{prefix}/metadata.json", {"version": version, "trained_at": datetime.now(timezone.utc).isoformat(), "samples": len(rows), "classes": sorted(classes), "metrics": metrics})
    store.put_json(settings.ml_bucket, "fraud_detection/current.json", {"version": version})
    result.update({"status": "SUCCESS", "version": version, "artifact": f"s3://{settings.ml_bucket}/{prefix}/model.json", "metrics": metrics})
    store.put_json(settings.control_bucket, f"ml/{context.run_id}.json", result)
    event(LOG, "ml_training_complete", **result)
    return result


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--master")
    args = parser.parse_args()
    settings = Settings.from_env()
    context = RunContext.create(args.run_id, args.batch_id)
    spark = create_spark(f"fraud-model-training-{context.run_id}", settings, args.master)
    try:
        train(spark, settings, context)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
