"""MinIO-backed pipeline state; business PostgreSQL schema stays immutable."""

from __future__ import annotations

import io
import json
import os
from datetime import datetime, timezone
from typing import Any

from minio import Minio
from minio.error import S3Error


class PipelineState:
    def __init__(self) -> None:
        endpoint_url = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
        endpoint = endpoint_url.removeprefix("http://").removeprefix("https://")
        self.bucket = os.getenv("MINIO_BUCKET_CONTROL", "pipeline-control")
        self.client = Minio(
            endpoint,
            access_key=os.environ["MINIO_ACCESS_KEY"],
            secret_key=os.environ["MINIO_SECRET_KEY"],
            secure=endpoint_url.startswith("https://"),
        )

    def ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def put_json(self, key: str, value: Any) -> None:
        self.ensure_bucket()
        body = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode()
        self.client.put_object(
            self.bucket,
            key,
            io.BytesIO(body),
            len(body),
            content_type="application/json",
        )

    def get_json(self, key: str, default: Any = None) -> Any:
        try:
            response = self.client.get_object(self.bucket, key)
            try:
                return json.loads(response.read())
            finally:
                response.close()
                response.release_conn()
        except S3Error as exc:
            if exc.code in {"NoSuchBucket", "NoSuchKey", "NoSuchObject"}:
                return default
            raise

    def watermark(self, dataset: str) -> dict[str, Any] | None:
        return self.get_json(f"watermarks/{dataset}.json")

    def save_candidate(
        self,
        batch_id: str,
        dataset: str,
        timestamp: str,
        primary_key: int,
    ) -> None:
        self.put_json(
            f"watermark-candidates/{batch_id}/{dataset}.json",
            {
                "batch_id": batch_id,
                "dataset": dataset,
                "timestamp": timestamp,
                "primary_key": primary_key,
            },
        )

    def commit_candidate(self, batch_id: str, dataset: str) -> bool:
        candidate = self.get_json(
            f"watermark-candidates/{batch_id}/{dataset}.json"
        )
        if not candidate:
            return False
        candidate["committed_at"] = datetime.now(timezone.utc).isoformat()
        self.put_json(f"watermarks/{dataset}.json", candidate)
        return True

    def record_stage(self, batch_id: str, stage: str, metrics: Any) -> None:
        self.put_json(
            f"runs/{batch_id}/{stage}.json",
            {
                "batch_id": batch_id,
                "stage": stage,
                "recorded_at": datetime.now(timezone.utc).isoformat(),
                "metrics": metrics,
            },
        )
