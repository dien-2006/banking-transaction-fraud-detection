from __future__ import annotations

import os
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def load_yaml(relative_path: str) -> dict:
    with (ROOT / relative_path).open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def s3a(bucket_env: str, suffix: str = "") -> str:
    bucket = os.getenv(bucket_env, bucket_env.removeprefix("MINIO_BUCKET_").lower())
    return f"s3a://{bucket}/{suffix.lstrip('/')}"
