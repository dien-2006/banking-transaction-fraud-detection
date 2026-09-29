from __future__ import annotations

import json
import os
import signal
import time
from pathlib import Path

from data_engineering.common.config import Settings
from data_engineering.common.storage import ObjectStore


RUNNING = True


def _stop(_signum, _frame) -> None:
    global RUNNING
    RUNNING = False


def sync_once(settings: Settings, target: Path) -> str:
    store = ObjectStore(settings)
    store.ensure_buckets()
    pointer = store.get_json(settings.ml_bucket, "fraud_detection/current.json")
    if not pointer:
        bundled = Path(__file__).resolve().parent / "artifacts" / "fraud_detection" / "v1"
        for name in ("model.json", "metadata.json", "features.json"):
            store.put_bytes(settings.ml_bucket, f"fraud_detection/v1/{name}", (bundled / name).read_bytes(), "application/json")
        store.put_json(settings.ml_bucket, "fraud_detection/current.json", {"version": "v1"})
        pointer = {"version": "v1"}
    version = str(pointer["version"])
    response = store.client.get_object(settings.ml_bucket, f"fraud_detection/{version}/model.json")
    try:
        body = response.read()
    finally:
        response.close()
        response.release_conn()
    json.loads(body)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_bytes(body)
    temporary.replace(target)
    return version


def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    settings = Settings.from_env()
    target = Path(os.getenv("MODEL_CACHE_PATH", "/models/current/model.json"))
    interval = float(os.getenv("MODEL_SYNC_INTERVAL_SECONDS", "60"))
    while RUNNING:
        sync_once(settings, target)
        if os.getenv("RUN_ONCE", "false").lower() == "true":
            break
        time.sleep(interval)


if __name__ == "__main__":
    main()
