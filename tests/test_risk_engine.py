from datetime import datetime
from decimal import Decimal

import pytest

from risk.engine import Decision, RiskContext, decide, evaluate_risk


@pytest.mark.parametrize(
    ("score", "probability", "expected"),
    [
        (59, "0.59", Decision.ALLOW),
        (60, "0.59", Decision.REVIEW),
        (79, "0.60", Decision.REVIEW),
        (79, "0.89", Decision.REVIEW),
        (80, "0.00", Decision.BLOCK),
        (0, "0.90", Decision.BLOCK),
        (60, "0.90", Decision.BLOCK),
    ],
)
def test_decision_boundaries(score: int, probability: str, expected: Decision) -> None:
    assert decide(score, Decimal(probability)) is expected


def test_all_rules_are_capped_at_one_hundred() -> None:
    assessment = evaluate_risk(
        RiskContext(
            amount=Decimal("50000000"),
            occurred_at=datetime(2026, 1, 1, 1),
            is_new_device=True,
            transactions_last_10m=5,
            failed_logins_last_30m=5,
            average_amount_30d=Decimal("1000000"),
        ),
        Decimal("0.1"),
    )
    assert assessment.rule_score == 100
    assert assessment.risk_level == "CRITICAL"
    assert assessment.decision is Decision.BLOCK
