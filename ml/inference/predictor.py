"""Small, versioned logistic predictor loaded once and cached in memory."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from threading import RLock
from typing import Mapping


@dataclass(frozen=True)
class ModelArtifact:
    version: str
    intercept: float
    weights: dict[str, float]


class FraudPredictor:
    def __init__(self, artifact_path: str | Path) -> None:
        self._path = Path(artifact_path)
        self._lock = RLock()
        self._artifact: ModelArtifact | None = None
        self._mtime_ns = -1

    def _load_if_changed(self) -> ModelArtifact:
        stat = self._path.stat()
        with self._lock:
            if self._artifact is None or stat.st_mtime_ns != self._mtime_ns:
                payload = json.loads(self._path.read_text(encoding="utf-8"))
                self._artifact = ModelArtifact(
                    version=str(payload["version"]),
                    intercept=float(payload["intercept"]),
                    weights={key: float(value) for key, value in payload["weights"].items()},
                )
                self._mtime_ns = stat.st_mtime_ns
            return self._artifact

    def predict(self, features: Mapping[str, float | int]) -> Decimal:
        model = self._load_if_changed()
        logit = model.intercept + sum(
            weight * float(features.get(name, 0.0))
            for name, weight in model.weights.items()
        )
        probability = 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, logit))))
        return Decimal(str(round(probability, 6)))

    @property
    def version(self) -> str:
        return self._load_if_changed().version
