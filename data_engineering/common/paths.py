from __future__ import annotations

from dataclasses import dataclass

from data_engineering.common.config import Settings


@dataclass(frozen=True)
class LakePaths:
    settings: Settings

    def bronze_postgres(self, dataset: str, ingest_date: str | None = None, batch_id: str | None = None) -> str:
        base = f"s3a://{self.settings.bronze_bucket}/postgres/banking/{dataset}"
        if ingest_date:
            base += f"/ingest_date={ingest_date}"
        if batch_id:
            base += f"/batch_id={batch_id}"
        return base

    def bronze_kafka(self, family: str = "transaction_events") -> str:
        return f"s3a://{self.settings.bronze_bucket}/kafka/{family}"

    def silver(self, dataset: str) -> str:
        return f"s3a://{self.settings.silver_bucket}/{dataset}"

    def gold(self, dataset: str) -> str:
        return f"s3a://{self.settings.gold_bucket}/{dataset}"

    def quarantine(self, dataset: str) -> str:
        return f"s3a://{self.settings.quarantine_bucket}/{dataset}"

    def dq(self, layer: str, run_id: str) -> str:
        return f"s3a://{self.settings.control_bucket}/dq/{layer}/run_id={run_id}"
