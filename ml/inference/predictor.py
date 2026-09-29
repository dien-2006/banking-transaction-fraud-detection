from __future__ import annotations

import json
import math
import os
import threading
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Mapping

from risk.engine import RiskContext


DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "fraud_detection" / "v1" / "model.json"


@dataclass(frozen=True)
class LinearModel:
    version: str
    intercept: float
    weights: Mapping[str, float]


class ArtifactPredictor:
    """Thread-safe, in-memory predictor. Artifacts are loaded only at startup/reload."""

    def __init__(self, artifact_path: str | Path | None = None):
        self._path = Path(artifact_path or os.getenv("MODEL_ARTIFACT_PATH", str(DEFAULT_MODEL_PATH)))
        self._lock = threading.RLock()
        self._model = self._load()
        self._modified_at = self._path.stat().st_mtime_ns

    def _load(self) -> LinearModel:
        with self._path.open(encoding="utf-8") as handle:
            raw = json.load(handle)
        return LinearModel(
            version=str(raw["version"]),
            intercept=float(raw["intercept"]),
            weights={str(key): float(value) for key, value in raw["weights"].items()},
        )

    def reload(self) -> str:
        model = self._load()
        with self._lock:
            self._model = model
            self._modified_at = self._path.stat().st_mtime_ns
        return model.version

    def reload_if_changed(self) -> bool:
        modified_at = self._path.stat().st_mtime_ns
        if modified_at == self._modified_at:
            return False
        self.reload()
        return True

    @property
    def version(self) -> str:
        with self._lock:
            return self._model.version

    @staticmethod
    def features(context: RiskContext) -> dict[str, float]:
        amount = max(float(context.amount), 1.0)
        average = float(context.average_amount_30d or Decimal("0"))
        return {
            "log_amount": math.log1p(amount) / 20.0,
            "new_device": float(context.is_new_device),
            "unusual_time": float(0 <= context.occurred_at.hour < 5),
            "velocity": min(context.transaction_count_10m / 5.0, 3.0),
            "failed_logins": min(context.failed_login_count_30m / 5.0, 3.0),
            "amount_ratio": min(amount / average, 10.0) / 10.0 if average > 0 else 0.0,
        }

    def predict(self, context: RiskContext) -> Decimal:
        features = self.features(context)
        with self._lock:
            model = self._model
        logit = model.intercept + sum(model.weights.get(name, 0.0) * value for name, value in features.items())
        probability = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, logit))))
        return Decimal(f"{probability:.6f}")
