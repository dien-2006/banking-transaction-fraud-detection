from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from typing import Any

from minio import Minio
from minio.error import S3Error

from data_engineering.common.config import Settings


class ObjectStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def ensure_buckets(self) -> None:
        for bucket in (
            self.settings.bronze_bucket,
            self.settings.silver_bucket,
            self.settings.gold_bucket,
            self.settings.quarantine_bucket,
            self.settings.control_bucket,
            self.settings.ml_bucket,
        ):
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)

    def put_json(self, bucket: str, key: str, value: dict[str, Any] | list[Any]) -> None:
        body = json.dumps(value, ensure_ascii=False, default=str, sort_keys=True).encode()
        self.client.put_object(bucket, key, io.BytesIO(body), len(body), content_type="application/json")

    def put_bytes(self, bucket: str, key: str, body: bytes, content_type: str = "application/octet-stream") -> None:
        self.client.put_object(bucket, key, io.BytesIO(body), len(body), content_type=content_type)

    def get_json(self, bucket: str, key: str, default: Any = None) -> Any:
        try:
            response = self.client.get_object(bucket, key)
            try:
                return json.loads(response.read())
            finally:
                response.close()
                response.release_conn()
        except S3Error as exc:
            if exc.code in {"NoSuchKey", "NoSuchBucket", "NoSuchObject"}:
                return default
            raise

    def record_run(self, run_id: str, status: str, **details: Any) -> None:
        payload = {"run_id": run_id, "status": status, "recorded_at": datetime.now(timezone.utc).isoformat(), **details}
        self.put_json(self.settings.control_bucket, f"runs/{run_id}.json", payload)
        stage = details.get("stage")
        if stage:
            self.put_json(self.settings.control_bucket, f"runs/{run_id}/stages/{stage}.json", payload)

    def watermark(self, dataset: str) -> dict[str, Any] | None:
        return self.get_json(self.settings.control_bucket, f"watermarks/{dataset}.json")

    def save_watermark(self, dataset: str, value: dict[str, Any]) -> None:
        self.put_json(self.settings.control_bucket, f"watermarks/{dataset}.json", value)

    def prefix_exists(self, bucket: str, prefix: str) -> bool:
        try:
            return next(self.client.list_objects(bucket, prefix=prefix, recursive=True), None) is not None
        except S3Error as exc:
            if exc.code == "NoSuchBucket":
                return False
            raise
