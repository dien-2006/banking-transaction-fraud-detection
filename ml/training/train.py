from __future__ import annotations

import argparse
import io
import json
import math
import os
from datetime import datetime, timezone

from pyspark.sql import Window, functions as F

from data_engineering.common.config import s3a
from data_engineering.common.spark import session
from data_engineering.common.state import PipelineState
from ml.features import FEATURES


def _fit(rows: list, iterations: int = 500, rate: float = 0.1):
    intercept = 0.0
    weights = {name: 0.0 for name in FEATURES}
    for _ in range(iterations):
        intercept_gradient = 0.0
        gradients = {name: 0.0 for name in FEATURES}
        for row in rows:
            score = intercept + sum(
                weights[name] * float(row[name]) for name in FEATURES
            )
            probability = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, score))))
            error = probability - float(row["label"])
            intercept_gradient += error
            for name in FEATURES:
                gradients[name] += error * float(row[name])
        scale = rate / len(rows)
        intercept -= scale * intercept_gradient
        for name in FEATURES:
            weights[name] -= scale * gradients[name]
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
    return {
        "samples": len(rows),
        "accuracy": correct / len(rows),
        "log_loss": loss / len(rows),
    }


def _write_json(client, bucket: str, key: str, value: object) -> None:
    body = json.dumps(value, sort_keys=True, default=str).encode()
    client.put_object(
        bucket, key, io.BytesIO(body), len(body), content_type="application/json"
    )


def run(batch_id: str) -> dict[str, object]:
    spark = session("fraud-model-training")
    transaction = spark.read.parquet(s3a("MINIO_BUCKET_SILVER", "bank_transaction"))
    labels = spark.read.parquet(s3a("MINIO_BUCKET_SILVER", "fraud_label_event"))
    latest_labels = (
        labels.filter(F.col("label").isin("FRAUD", "LEGITIMATE"))
        .withColumn(
            "_rank",
            F.row_number().over(
                Window.partitionBy("transaction_id").orderBy(
                    F.col("labeled_at").desc(), F.col("fraud_label_event_id").desc()
                )
            ),
        )
        .filter("_rank = 1")
        .select(
            "transaction_id",
            F.when(F.col("label") == "FRAUD", 1.0).otherwise(0.0).alias("label"),
        )
    )
    devices = spark.read.parquet(s3a("MINIO_BUCKET_SILVER", "customer_device")).select(
        "device_id", "is_trusted"
    )
    current = transaction.select(
        F.col("transaction_id").alias("current_id"),
        F.col("initiated_by_customer_id").alias("customer_id"),
        F.col("transaction_at").alias("current_at"),
        F.col("amount").alias("current_amount"),
    )
    prior = transaction.select(
        F.col("transaction_id").alias("prior_id"),
        F.col("initiated_by_customer_id").alias("prior_customer_id"),
        F.col("transaction_at").alias("prior_at"),
        F.col("amount").alias("prior_amount"),
        F.col("status").alias("prior_status"),
    )
    same_customer_prior = (
        (F.col("customer_id") == F.col("prior_customer_id"))
        & (F.col("prior_at") < F.col("current_at"))
    )
    velocity = current.join(
        prior,
        same_customer_prior
        & (F.col("prior_at") >= F.col("current_at") - F.expr("INTERVAL 10 MINUTES")),
        "left",
    ).groupBy("current_id").agg(F.count("prior_id").alias("transactions_last_10m"))
    average = current.join(
        prior,
        same_customer_prior
        & (F.col("prior_status") == "Success")
        & (F.col("prior_at") >= F.col("current_at") - F.expr("INTERVAL 30 DAYS")),
        "left",
    ).groupBy("current_id").agg(F.avg("prior_amount").alias("average_amount_30d"))
    login = spark.read.parquet(s3a("MINIO_BUCKET_SILVER", "login_event")).select(
        F.col("customer_id").alias("login_customer_id"), "login_at",
        F.col("status").alias("login_status"),
    )
    failed = current.join(
        login,
        (F.col("customer_id") == F.col("login_customer_id"))
        & F.col("login_status").isin("Failed", "Blocked")
        & (F.col("login_at") < F.col("current_at"))
        & (F.col("login_at") >= F.col("current_at") - F.expr("INTERVAL 30 MINUTES")),
        "left",
    ).groupBy("current_id").agg(F.count("login_at").alias("failed_logins_last_30m"))
    feature_mart = (
        transaction.join(latest_labels, "transaction_id")
        .join(devices, "device_id", "left")
        .join(velocity, F.col("transaction_id") == F.col("current_id"), "left").drop("current_id")
        .join(average, F.col("transaction_id") == F.col("current_id"), "left").drop("current_id")
        .join(failed, F.col("transaction_id") == F.col("current_id"), "left").drop("current_id")
        .select(
            "transaction_id", "label",
            (F.log1p(F.col("amount").cast("double")) / 20).alias("amount_log"),
            F.when(F.coalesce(F.col("is_trusted"), F.lit(False)), 0.0).otherwise(1.0).alias("is_new_device"),
            F.when(F.hour("transaction_at").between(0, 4), 1.0).otherwise(0.0).alias("is_unusual_time"),
            F.coalesce(F.col("transactions_last_10m"), F.lit(0)).cast("double").alias("transactions_last_10m"),
            F.coalesce(F.col("failed_logins_last_30m"), F.lit(0)).cast("double").alias("failed_logins_last_30m"),
            F.when(F.col("average_amount_30d") > 0, F.col("amount") / F.col("average_amount_30d")).otherwise(1.0).cast("double").alias("amount_to_average_ratio"),
        )
    )
    feature_path = s3a("MINIO_BUCKET_ML", "fraud_detection/feature-mart")
    feature_mart.write.mode("overwrite").parquet(feature_path)
    total_samples = feature_mart.count()
    max_samples = max(4, int(os.getenv("ML_MAX_TRAINING_ROWS", "50000")))
    rows = (
        feature_mart.orderBy(F.xxhash64("transaction_id"))
        .limit(max_samples)
        .collect()
    )
    classes = sorted({int(row["label"]) for row in rows})
    result: dict[str, object] = {
        "batch_id": batch_id,
        "total_labeled_samples": total_samples,
        "samples": len(rows),
        "sample_limit": max_samples,
        "classes": classes,
    }
    state = PipelineState()
    if len(rows) < 4 or classes != [0, 1]:
        result.update({"status": "SKIPPED", "reason": "at least four curated labels spanning both classes are required"})
        state.record_stage(batch_id, "ml_training", result)
        return result
    train_rows = [row for row in rows if int(row["transaction_id"]) % 5 != 0] or rows
    test_rows = [row for row in rows if int(row["transaction_id"]) % 5 == 0]
    intercept, weights = _fit(train_rows)
    metrics = {"train": _evaluate(train_rows, intercept, weights), "test": _evaluate(test_rows, intercept, weights)}
    version = f"candidate-{batch_id}"
    artifact = {"version": version, "intercept": intercept, "weights": weights}
    metadata = {
        "version": version, "status": "CANDIDATE", "trained_at": datetime.now(timezone.utc).isoformat(),
        "samples": len(rows), "total_labeled_samples": total_samples, "classes": classes, "metrics": metrics, "feature_mart": feature_path,
    }
    client = state.client
    bucket = os.getenv("MINIO_BUCKET_ML", "ml-models")
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    prefix = f"fraud_detection/{version}"
    _write_json(client, bucket, f"{prefix}/model.json", artifact)
    _write_json(client, bucket, f"{prefix}/features.json", {"features": list(FEATURES), "label": "fraud_label_event.label"})
    _write_json(client, bucket, f"{prefix}/metadata.json", metadata)
    result.update({"status": "SUCCESS", "version": version, "metrics": metrics, "artifact": f"s3://{bucket}/{prefix}/model.json"})
    state.record_stage(batch_id, "ml_training", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-id", required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.batch_id), default=str, sort_keys=True))


if __name__ == "__main__":
    main()
