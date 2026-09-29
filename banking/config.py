from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class DatabaseSettings:
    dsn: str
    schema: str = "banking"

    @classmethod
    def from_env(cls) -> "DatabaseSettings":
        load_dotenv(override=False)
        host = os.getenv("POSTGRES_HOST", "localhost")
        port = int(os.getenv("POSTGRES_INTERNAL_PORT", "5432"))
        database = os.environ["POSTGRES_DB"]
        user = os.environ["POSTGRES_USER"]
        password = os.environ["POSTGRES_PASSWORD"]
        schema = os.getenv("POSTGRES_SCHEMA", "banking")
        return cls(
            dsn=f"host={host} port={port} dbname={database} user={user} password={password} connect_timeout=10",
            schema=schema,
        )
