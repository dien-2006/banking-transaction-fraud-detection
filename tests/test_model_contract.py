from __future__ import annotations

import pytest

from ml.features import FEATURES
from ml.promote import validate_candidate


def candidate():
    model = {
        "version": "candidate-run-1",
        "intercept": -1.0,
        "weights": {name: 0.1 for name in FEATURES},
    }
    features = {"features": list(FEATURES)}
    metadata = {
        "version": "candidate-run-1",
        "status": "CANDIDATE",
        "classes": [0, 1],
    }
    return model, features, metadata


def test_valid_candidate_matches_online_contract() -> None:
    validate_candidate(*candidate())


def test_candidate_with_old_feature_contract_is_rejected() -> None:
    model, features, metadata = candidate()
    features["features"] = ["risk_score"]
    with pytest.raises(ValueError, match="feature order"):
        validate_candidate(model, features, metadata)


def test_candidate_with_non_finite_weight_is_rejected() -> None:
    model, features, metadata = candidate()
    model["weights"][FEATURES[0]] = float("nan")
    with pytest.raises(ValueError, match="non-finite"):
        validate_candidate(model, features, metadata)


def test_candidate_requires_both_classes() -> None:
    model, features, metadata = candidate()
    metadata["classes"] = [0]
    with pytest.raises(ValueError, match="both fraud classes"):
        validate_candidate(model, features, metadata)


def test_serialized_training_candidate_can_be_promoted() -> None:
    import json
    model, features, metadata = candidate()
    # JSON object key ordering has no bearing on named model coefficients.
    validate_candidate(json.loads(json.dumps(model, sort_keys=True)), features, metadata)


def test_invalid_reloaded_artifact_preserves_last_valid_predictor(tmp_path) -> None:
    import json
    from ml.inference.predictor import FraudPredictor
    model, _, _ = candidate()
    path = tmp_path / 'model.json'
    path.write_text(json.dumps(model))
    predictor = FraudPredictor(path)
    before = predictor.predict({})
    path.write_text('{broken')
    assert predictor.predict({}) == before
    # The live cached object is still the previous validated model.
    assert predictor._artifact.version == model['version']
    path.write_text(json.dumps(model))
    assert predictor.predict({}) == before
