from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path

from minio import Minio
from minio.error import S3Error

LOG = logging.getLogger("model-sync")


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    endpoint = os.environ["MINIO_ENDPOINT"].removeprefix("http://").removeprefix("https://")
    client = Minio(endpoint, access_key=os.environ["MINIO_ACCESS_KEY"], secret_key=os.environ["MINIO_SECRET_KEY"], secure=os.environ["MINIO_ENDPOINT"].startswith("https://"))
    bucket = os.getenv("MINIO_BUCKET_ML", "ml-models")
    object_name = os.getenv("MODEL_OBJECT_NAME", "fraud_detection/v1/model.json")
    bundled = Path("/workspace/ml/artifacts/fraud_detection/v1/model.json")
    target = Path(os.getenv("MODEL_CACHE_PATH", "/models/current/model.json"))
    target.parent.mkdir(parents=True, exist_ok=True)
    interval = max(1, int(os.getenv("MODEL_SYNC_INTERVAL_SECONDS", "60")))
    while True:
        temporary: Path | None = None
        try:
            try:
                client.stat_object(bucket, object_name)
            except S3Error as exc:
                if exc.code != "NoSuchKey":
                    raise
                client.fput_object(
                    bucket, object_name, str(bundled), content_type="application/json"
                )
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
                temporary = Path(handle.name)
            client.fget_object(bucket, object_name, str(temporary))
            temporary.replace(target)
            temporary = None
            LOG.info("model_cache_updated object=%s target=%s", object_name, target)
        except Exception:
            LOG.exception("model_sync_failed object=%s; keeping existing cache", object_name)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        time.sleep(interval)


if __name__ == "__main__":
    main()
