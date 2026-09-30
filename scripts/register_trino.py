from __future__ import annotations

import json
import os
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


def main() -> None:
    bucket = os.getenv("GOLD_BUCKET", "gold")
    for attempt in range(30):
        try:
            execute("CREATE SCHEMA IF NOT EXISTS hive.gold")
            break
        except (urllib.error.URLError, RuntimeError):
            if attempt == 29:
                raise
            time.sleep(2)
    for table, (group, columns) in TABLES.items():
        execute(
            f"CREATE TABLE IF NOT EXISTS hive.gold.{table} ({columns}) "
            f"WITH (format='PARQUET', external_location='s3a://{bucket}/{group}/{table}/')"
        )
    print(f"registered {len(TABLES)} Gold tables in hive.gold")


if __name__ == "__main__":
    main()
