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
        "metrics": {key: {"samples": 10, "classes": [0, 1]} for key in ('train', 'test')},
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


def test_promotion_rejects_empty_holdout_and_string_coefficients():
    model, features, metadata = candidate()
    metadata['metrics']['test']['samples'] = 0
    with pytest.raises(ValueError, match='train/test'):
        validate_candidate(model, features, metadata)
    model, features, metadata = candidate()
    model['intercept'] = '-1'
    with pytest.raises(ValueError, match='non-finite'):
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
    assert predictor._artifact.version == model['version']
    path.write_text(json.dumps(model))
    assert predictor.predict({}) == before


def test_sync_publishes_a_readable_valid_model_and_preserves_cache_on_bad_download(tmp_path) -> None:
    import json
    import stat
    from ml.sync import install_cached_artifact
    model, _, _ = candidate()
    target, temporary = tmp_path / 'model.json', tmp_path / 'download.json'
    temporary.write_text(json.dumps(model))
    temporary.chmod(0o600)
    install_cached_artifact(temporary, target)
    assert stat.S_IMODE(target.stat().st_mode) == 0o644
    assert json.loads(target.read_text())['version'] == model['version']
    temporary.write_text('{broken')
    with pytest.raises(ValueError):
        install_cached_artifact(temporary, target)
    assert json.loads(target.read_text())['version'] == model['version']
