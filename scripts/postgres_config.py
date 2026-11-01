"""Shared PostgreSQL settings for operational Python scripts.

The online Banking Core is NestJS plus the ``banking_api`` PostgreSQL
contract. Python uses this module only for bootstrap, E2E and data-platform
utilities; it does not implement financial transaction workflows.
"""

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
