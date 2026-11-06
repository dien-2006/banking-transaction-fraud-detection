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
from data_engineering.silver.release import configure_silver_release


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
        "classes": sorted({int(row['label']) for row in rows}),
        "accuracy": correct / len(rows),
        "log_loss": loss / len(rows),
    }


def _write_json(client, bucket: str, key: str, value: object) -> None:
    body = json.dumps(value, sort_keys=True, default=str).encode()
    client.put_object(
        bucket, key, io.BytesIO(body), len(body), content_type="application/json"
    )


def run(batch_id: str) -> dict[str, object]:
    active = PipelineState().get_json('silver/active_release.json')
    if not active:
        raise ValueError('training requires a validated Silver release')
    configure_silver_release(active['batch_id'])
    spark = session("fraud-model-training")
    transaction = spark.read.parquet(s3a("MINIO_BUCKET_SILVER", "bank_transaction"))
    labels = spark.read.parquet(s3a("MINIO_BUCKET_SILVER", "fraud_label_event"))
    latest_labels = (
        labels.withColumn(
            "_rank",
            F.row_number().over(
                Window.partitionBy("transaction_id").orderBy(
                    F.col("labeled_at").desc(), F.col("fraud_label_event_id").desc()
                )
            ),
        )
        .filter("_rank = 1")
        .filter(F.col("label").isin("FRAUD", "LEGITIMATE"))
        .select(
            "transaction_id",
            "labeled_at",
            F.when(F.col("label") == "FRAUD", 1.0).otherwise(0.0).alias("label"),
        )
    )
    # Use the feature snapshot captured by online inference. Current device trust
    # and reconstructed history can change after the transaction was assessed.
    assessments = spark.read.parquet(s3a("MINIO_BUCKET_SILVER", "risk_assessment"))
    assessments = assessments.withColumn("_rank", F.row_number().over(
        Window.partitionBy("transaction_id").orderBy(F.col("assessed_at").asc(), F.col("risk_assessment_id").asc())
    )).filter("_rank = 1").select("transaction_id", "reason_json")
    feature_mart = (
        transaction.join(latest_labels, "transaction_id")
        .join(assessments, "transaction_id")
        .select(
            "transaction_id", "transaction_at", "labeled_at", "label",
            (F.log1p(F.col("amount").cast("double")) / 20).alias("amount_log"),
            F.get_json_object("reason_json", "$.features.isNewDevice").cast("boolean").cast("double").alias("is_new_device"),
            F.when(F.hour(F.from_utc_timestamp("transaction_at", os.getenv("SOURCE_TIMEZONE", "Asia/Ho_Chi_Minh"))).between(0, 4), 1.0).otherwise(0.0).alias("is_unusual_time"),
            F.get_json_object("reason_json", "$.features.transactionsLast10m").cast("double").alias("transactions_last_10m"),
            F.get_json_object("reason_json", "$.features.failedLoginsLast30m").cast("double").alias("failed_logins_last_30m"),
            F.get_json_object("reason_json", "$.features.amountToAverageRatio").cast("double").alias("amount_to_average_ratio"),
        )
    )
    from functools import reduce
    missing = reduce(lambda a, b: a | b, [F.col(name).isNull() for name in FEATURES])
    missing_feature_samples = feature_mart.filter(missing).count()
    # Legacy assessments without point-in-time features are explicitly reported,
    # never reconstructed using today's device trust or later history.
    feature_mart = feature_mart.filter(~missing)
    feature_path = s3a("MINIO_BUCKET_ML", f"fraud_detection/feature-mart/batch_id={batch_id}")
    feature_mart.write.mode("overwrite").parquet(feature_path)
    total_samples = feature_mart.count()
    max_samples = max(4, int(os.getenv("ML_MAX_TRAINING_ROWS", "50000")))
    rows = (
        feature_mart.orderBy(F.col('transaction_at').desc(), F.col('transaction_id').desc())
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
        "excluded_missing_feature_samples": missing_feature_samples,
    }
    state = PipelineState()
    if len(rows) < 4 or classes != [0, 1]:
        result.update({"status": "SKIPPED", "reason": "at least four curated labels spanning both classes are required"})
        state.record_stage(batch_id, "ml_training", result)
        return result
    rows.sort(key=lambda row: (row['transaction_at'], row['transaction_id']))
    cutoff = rows[int(len(rows) * .8)]['transaction_at']
    train_rows = [row for row in rows if row['transaction_at'] < cutoff and row['labeled_at'] <= cutoff]
    test_rows = [row for row in rows if row['transaction_at'] >= cutoff]
    if any(sorted({int(row['label']) for row in split}) != [0, 1] for split in (train_rows, test_rows)):
        result.update(status='SKIPPED', reason='chronological train/test splits require both classes and mature training labels')
        state.record_stage(batch_id, 'ml_training', result)
        return result
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
