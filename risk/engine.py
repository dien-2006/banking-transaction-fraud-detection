"""Deterministic Fraud Policy V1.

This module has no infrastructure dependencies so the policy can be tested at
the exact decision boundaries and reused by the HTTP service and recovery job.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from decimal import Decimal
from enum import StrEnum


class Decision(StrEnum):
    ALLOW = "ALLOW"
    REVIEW = "REVIEW"
    BLOCK = "BLOCK"


@dataclass(frozen=True)
class RiskContext:
    amount: Decimal
    occurred_at: datetime
    is_new_device: bool = False
    transactions_last_10m: int = 0
    failed_logins_last_30m: int = 0
    average_amount_30d: Decimal | None = None


@dataclass(frozen=True)
class RiskAssessment:
    rule_score: int
    risk_level: str
    model_probability: Decimal
    decision: Decision
    triggered_rules: tuple[str, ...]


def _rule_score(context: RiskContext) -> tuple[int, tuple[str, ...]]:
    score = 0
    rules: list[str] = []

    def trigger(name: str, points: int) -> None:
        nonlocal score
        score += points
        rules.append(name)

    if context.amount >= Decimal("50000000"):
        trigger("R01_HIGH_AMOUNT", 20)
    if context.is_new_device:
        trigger("R02_NEW_DEVICE", 20)
    if time(0, 0) <= context.occurred_at.time() < time(5, 0):
        trigger("R03_UNUSUAL_TIME", 10)
    if context.transactions_last_10m >= 5:
        trigger("R04_HIGH_VELOCITY", 25)
    if context.failed_logins_last_30m >= 5:
        trigger("R05_FAILED_LOGIN", 15)
    if (
        context.average_amount_30d is not None
        and context.average_amount_30d > 0
        and context.amount >= context.average_amount_30d * 5
    ):
        trigger("R06_AMOUNT_ANOMALY", 20)
    return min(score, 100), tuple(rules)


def _risk_level(score: int) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def decide(rule_score: int, model_probability: Decimal) -> Decision:
    if not 0 <= rule_score <= 100:
        raise ValueError("rule_score must be within 0..100")
    if not Decimal("0") <= model_probability <= Decimal("1"):
        raise ValueError("model_probability must be within 0..1")
    if model_probability >= Decimal("0.90") or rule_score >= 80:
        return Decision.BLOCK
    if model_probability >= Decimal("0.60") or rule_score >= 60:
        return Decision.REVIEW
    return Decision.ALLOW


def evaluate_risk(context: RiskContext, model_probability: Decimal) -> RiskAssessment:
    score, rules = _rule_score(context)
    return RiskAssessment(
        rule_score=score,
        risk_level=_risk_level(score),
        model_probability=model_probability,
        decision=decide(score, model_probability),
        triggered_rules=rules,
    )
