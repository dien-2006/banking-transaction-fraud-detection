from __future__ import annotations

import os


def postgres_dsn() -> str:
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_INTERNAL_PORT", os.getenv("POSTGRES_PORT", "5432"))
    database = os.getenv("POSTGRES_DB", "bank_fraud")
    user = os.getenv("POSTGRES_USER", "bank_admin")
    password = os.environ["POSTGRES_PASSWORD"]
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


POSTGRES_SCHEMA = os.getenv("POSTGRES_SCHEMA", "banking")
MODEL_ARTIFACT_PATH = os.getenv(
    "MODEL_ARTIFACT_PATH", "ml/artifacts/fraud_detection/v1/model.json"
)
