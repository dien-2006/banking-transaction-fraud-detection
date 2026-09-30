"""Validate and explicitly promote a trained candidate without changing PostgreSQL."""

from __future__ import annotations

import argparse
import io
import json
import math
import os
from datetime import datetime, timezone
from typing import Any

from minio import Minio

from ml.features import FEATURES


def validate_candidate(
    model: dict[str, Any], features: dict[str, Any], metadata: dict[str, Any]
) -> None:
    version = str(model.get("version", ""))
    if not version or version != str(metadata.get("version", "")):
        raise ValueError("model and metadata versions must match")
    if metadata.get("status") != "CANDIDATE":
        raise ValueError("only a CANDIDATE artifact can be promoted")
    if tuple(features.get("features", ())) != FEATURES:
        raise ValueError("candidate feature order does not match the online contract")
    weights = model.get("weights")
    if not isinstance(weights, dict) or tuple(weights) != FEATURES:
        raise ValueError("candidate weights do not match the online feature contract")
    numeric_values = [model.get("intercept"), *weights.values()]
    try:
        valid_numbers = all(math.isfinite(float(value)) for value in numeric_values)
    except (TypeError, ValueError):
        valid_numbers = False
    if not valid_numbers:
        raise ValueError("candidate contains a non-finite coefficient")
    classes = metadata.get("classes")
    if classes != [0, 1]:
        raise ValueError("candidate must be trained with both fraud classes")


def _get_json(client: Minio, bucket: str, key: str) -> dict[str, Any]:
    response = client.get_object(bucket, key)
    try:
        value = json.loads(response.read())
    finally:
        response.close()
        response.release_conn()
    if not isinstance(value, dict):
        raise ValueError(f"JSON object expected at s3://{bucket}/{key}")
    return value


def _put_json(client: Minio, bucket: str, key: str, value: dict[str, Any]) -> None:
    body = json.dumps(value, sort_keys=True, default=str).encode()
    client.put_object(
        bucket, key, io.BytesIO(body), len(body), content_type="application/json"
    )


def promote(candidate_version: str, target_object: str) -> dict[str, str]:
    if "/" in candidate_version or candidate_version in {"", ".", ".."}:
        raise ValueError("candidate_version must be a single artifact directory name")
    if not target_object.endswith("/model.json"):
        raise ValueError("target object must end with /model.json")
    endpoint_url = os.environ["MINIO_ENDPOINT"]
    client = Minio(
        endpoint_url.removeprefix("http://").removeprefix("https://"),
        access_key=os.environ["MINIO_ACCESS_KEY"],
        secret_key=os.environ["MINIO_SECRET_KEY"],
        secure=endpoint_url.startswith("https://"),
    )
    bucket = os.getenv("MINIO_BUCKET_ML", "ml-models")
    source = f"fraud_detection/{candidate_version}"
    model = _get_json(client, bucket, f"{source}/model.json")
    features = _get_json(client, bucket, f"{source}/features.json")
    metadata = _get_json(client, bucket, f"{source}/metadata.json")
    validate_candidate(model, features, metadata)

    target_prefix = target_object.removesuffix("/model.json")
    active_metadata = {
        **metadata,
        "status": "ACTIVE",
        "promoted_at": datetime.now(timezone.utc).isoformat(),
        "promoted_from": f"s3://{bucket}/{source}",
    }
    # Model is written last. A running sync process therefore never observes a
    # new model before its feature and metadata sidecars are complete.
    _put_json(client, bucket, f"{target_prefix}/features.json", features)
    _put_json(client, bucket, f"{target_prefix}/metadata.json", active_metadata)
    _put_json(client, bucket, target_object, model)
    return {
        "candidate": candidate_version,
        "target": f"s3://{bucket}/{target_object}",
        "status": "ACTIVE",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate_version")
    parser.add_argument(
        "--target-object",
        default=os.getenv("MODEL_OBJECT_NAME", "fraud_detection/v1/model.json"),
    )
    args = parser.parse_args()
    print(json.dumps(promote(args.candidate_version, args.target_object), sort_keys=True))


if __name__ == "__main__":
    main()
