from __future__ import annotations

import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

from data_engineering.gold.catalog import TABLES


def execute(sql: str) -> list[list[object]]:
    request = urllib.request.Request(
        f"{os.getenv('TRINO_URL', 'http://trino:8080')}/v1/statement",
        data=sql.encode(),
        headers={"X-Trino-User": "pipeline", "Content-Type": "text/plain"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read())
    rows: list[list[object]] = []
    while True:
        if result.get("error"):
            raise RuntimeError(json.dumps(result["error"], sort_keys=True))
        rows.extend(result.get("data", []))
        next_uri = result.get("nextUri")
        if not next_uri:
            return rows
        with urllib.request.urlopen(next_uri, timeout=30) as response:
            result = json.loads(response.read())


def register_catalog(bucket: str, schema: str, prefix: str = "") -> None:
    if not re.fullmatch(r"[a-z][a-z0-9_]*", schema):
        raise ValueError("invalid Gold Trino schema")
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
        raise ValueError("invalid Gold bucket")
    if prefix and not re.fullmatch(r"[a-zA-Z0-9_/-]+", prefix):
        raise ValueError("invalid Gold prefix")
    prefix = prefix.strip("/") + "/" if prefix else ""
    for attempt in range(30):
        try:
            execute(f"CREATE SCHEMA IF NOT EXISTS hive.{schema}")
            break
        except (urllib.error.URLError, RuntimeError):
            if attempt == 29:
                raise
            time.sleep(2)
    for table, (group, columns) in TABLES.items():
        execute(
            f"CREATE TABLE IF NOT EXISTS hive.{schema}.{table} ({columns}) "
            f"WITH (format='PARQUET', external_location='s3a://{bucket}/{prefix}{group}/{table}/')"
        )
    analytics = Path(__file__).resolve().parents[1] / "sql/trino/gold_analytics.sql"
    # This versioned file contains simple CREATE VIEW statements, no procedure bodies.
    script = re.sub(r"--[^\n]*", "", analytics.read_text(encoding="utf-8"))
    views = [statement.strip() for statement in script.split(";") if statement.strip()]
    for statement in views:
        execute(statement.replace("hive.gold.", f"hive.{schema}."))
    print(f"registered {len(TABLES)} Gold tables and {len(views)} analytics views in hive.{schema}")


def main() -> None:
    register_catalog(os.getenv("GOLD_BUCKET", "gold"), os.getenv("GOLD_SCHEMA", "gold"), os.getenv("GOLD_VERSION_PREFIX", ""))


if __name__ == "__main__":
    main()
