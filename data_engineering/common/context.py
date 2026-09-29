from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from uuid import uuid4


@dataclass(frozen=True)
class RunContext:
    run_id: str
    batch_id: str
    started_at: str

    @classmethod
    def create(cls, run_id: str | None = None, batch_id: str | None = None) -> "RunContext":
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return cls(
            run_id=run_id or f"run-{stamp}-{uuid4().hex[:8]}",
            batch_id=batch_id or f"batch-{stamp}-{uuid4().hex[:8]}",
            started_at=datetime.now(timezone.utc).isoformat(),
        )

    def as_dict(self) -> dict[str, str]:
        return asdict(self)
