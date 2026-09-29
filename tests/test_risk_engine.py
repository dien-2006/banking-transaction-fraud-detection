from datetime import datetime
from decimal import Decimal

import pytest

from risk.engine import RiskContext, decide, evaluate_rules, risk_level


@pytest.mark.parametrize(
    ("score", "expected"),
    [(0, "LOW"), (39, "LOW"), (40, "MEDIUM"), (59, "MEDIUM"), (60, "HIGH"), (79, "HIGH"), (80, "CRITICAL"), (100, "CRITICAL")],
)
def test_risk_level_boundaries(score, expected):
    assert risk_level(score) == expected


@pytest.mark.parametrize(
    ("score", "probability", "expected"),
    [
        (59, Decimal("0.59"), "ALLOW"),
        (60, Decimal("0.59"), "REVIEW"),
        (79, Decimal("0.89"), "REVIEW"),
        (80, Decimal("0.10"), "BLOCK"),
        (0, Decimal("0.60"), "REVIEW"),
        (0, Decimal("0.89"), "REVIEW"),
        (0, Decimal("0.90"), "BLOCK"),
        (80, Decimal("0.60"), "BLOCK"),
    ],
)
def test_decision_boundaries_and_block_precedence(score, probability, expected):
    assert decide(score, probability) == expected


def test_all_v1_rules_and_score_cap():
    result = evaluate_rules(
        RiskContext(
            amount=Decimal("100000000"),
            occurred_at=datetime(2026, 1, 1, 2, 0),
            is_new_device=True,
            transaction_count_10m=5,
            failed_login_count_30m=5,
            average_amount_30d=Decimal("10000000"),
        )
    )
    assert result.score == 100
    assert result.risk_level == "CRITICAL"
    assert [rule["code"] for rule in result.triggered_rules] == ["R01", "R02", "R03", "R04", "R05", "R06"]
