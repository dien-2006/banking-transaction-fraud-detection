"""Cached inference using the user's fitted pipeline, without training or DB writes."""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
from pathlib import Path
import sys

import joblib
import pandas as pd

from ml.features import JOBLIB_FEATURES as FEATURES
NULLABLE = {"avg_amount_30d", "max_amount_30d", "amount_to_avg_ratio", "time_since_last_transaction"}


class JoblibPredictor:
    def __init__(self, path: str | Path, metadata_path: str | Path):
        self.path, self.metadata_path = Path(path), Path(metadata_path)
        self._stamp = None
        self._model = None
        self._identity = None

    def _load(self):
        try:
            stamp = (self.path.stat().st_mtime_ns, self.metadata_path.stat().st_mtime_ns)
            if stamp != self._stamp:
                body = self.path.read_bytes()
                metadata_body = self.metadata_path.read_bytes()
                metadata = json.loads(metadata_body)
                if tuple(metadata.get("features", ())) != FEATURES:
                    raise ValueError("joblib metadata feature contract mismatch")
                threshold = metadata.get("threshold")
                if isinstance(threshold, bool) or not isinstance(threshold, (float, int)) or not 0 < threshold < 1:
                    raise ValueError("invalid offline threshold")
                # Only local operator-provided artifacts are loaded; never accept uploads.
                from io import BytesIO
                candidate = joblib.load(BytesIO(body))
                if tuple(candidate.feature_names_in_) != FEATURES or list(candidate.classes_) != [0, 1]:
                    raise ValueError("joblib pipeline feature/class contract mismatch")
                if metadata.get('model_name') != 'XGBoost' or type(candidate.named_steps['model']).__name__ != 'XGBClassifier':
                    raise ValueError('the online artifact must be the selected XGBoost pipeline')
                digest = hashlib.sha256(body).hexdigest()
                identity = {"version": "joblib-" + digest[:16], "sha256": digest,
                            "metadataSha256": hashlib.sha256(metadata_body).hexdigest(),
                            "databaseName": "fraud_detection_xgb_" + digest[:16]}
                self._model, self._identity, self._stamp = candidate, identity, stamp
        except Exception:
            if self._model is None:
                raise
            logging.warning("joblib_reload_failed; retaining validated model")
        return self._model, self._identity

    def predict(self, features: dict) -> dict:
        if set(features) != set(FEATURES):
            raise ValueError("exactly nineteen named features are required")
        for name, value in features.items():
            if name in {"channel", "type_code"}:
                if not isinstance(value, str) or not value:
                    raise ValueError("invalid categorical feature")
            elif value is None and name in NULLABLE:
                continue
            elif isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError("invalid numeric feature")
        model, identity = self._load()
        frame = pd.DataFrame([{k: features[k] for k in FEATURES}], columns=FEATURES)
        for name in FEATURES:
            if name not in {"channel", "type_code"}:
                frame[name] = pd.to_numeric(frame[name]).astype(float)
        probability = float(model.predict_proba(frame)[0, 1])
        if not math.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError("invalid model probability")
        return {**identity, "probability": round(probability, 6)}


def main():
    logging.basicConfig(stream=sys.stderr, level=logging.INFO)
    predictor = JoblibPredictor(os.environ["JOBLIB_MODEL_PATH"], os.environ["JOBLIB_METADATA_PATH"])
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError('request must be an object')
            result = predictor._load()[1] if request.get('operation') == 'identity' else predictor.predict(request["features"])
            response = {"id": request["id"], **result}
        except Exception as exc:
            logging.error("joblib_inference_failed type=%s", type(exc).__name__)
            response = {"id": request.get("id") if isinstance(request, dict) else None, "error": "Validated joblib inference unavailable"}
        print(json.dumps(response, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
