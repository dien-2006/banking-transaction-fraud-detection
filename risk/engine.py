from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class RiskContext:
    amount: Decimal
    occurred_at: datetime
    is_new_device: bool = False
    transaction_count_10m: int = 0
    failed_login_count_30m: int = 0
    average_amount_30d: Decimal | None = None


@dataclass(frozen=True)
class RuleEvaluation:
    score: int
    risk_level: str
    triggered_rules: tuple[dict[str, Any], ...]


RULES: tuple[tuple[str, str, int], ...] = (
    ("R01", "HIGH_AMOUNT", 20),
    ("R02", "NEW_DEVICE", 20),
    ("R03", "UNUSUAL_TIME", 10),
    ("R04", "HIGH_VELOCITY", 25),
    ("R05", "FAILED_LOGIN", 15),
    ("R06", "AMOUNT_ANOMALY", 20),
)


def risk_level(score: int) -> str:
    if not 0 <= score <= 100:
        raise ValueError("RuleScore must be in [0, 100]")
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def evaluate_rules(context: RiskContext) -> RuleEvaluation:
    triggered: list[dict[str, Any]] = []

    def add(rule_index: int, condition: bool, evidence: dict[str, Any]) -> None:
        if condition:
            code, name, points = RULES[rule_index]
            triggered.append({"code": code, "name": name, "score": points, "evidence": evidence})

    add(0, context.amount >= Decimal("50000000"), {"amount": str(context.amount)})
    add(1, context.is_new_device, {"is_new_device": context.is_new_device})
    add(2, 0 <= context.occurred_at.hour < 5, {"hour": context.occurred_at.hour})
    add(3, context.transaction_count_10m >= 5, {"transaction_count_10m": context.transaction_count_10m})
    add(4, context.failed_login_count_30m >= 5, {"failed_login_count_30m": context.failed_login_count_30m})
    average = context.average_amount_30d
    add(
        5,
        average is not None and average > 0 and context.amount >= average * Decimal("5"),
        {"amount": str(context.amount), "average_amount_30d": str(average) if average is not None else None},
    )
    score = min(100, sum(int(item["score"]) for item in triggered))
    return RuleEvaluation(score=score, risk_level=risk_level(score), triggered_rules=tuple(triggered))


def decide(rule_score: int, model_probability: Decimal | float) -> str:
    probability = Decimal(str(model_probability))
    if not 0 <= probability <= 1:
        raise ValueError("ModelProbability must be in [0, 1]")
    if rule_score >= 80 or probability >= Decimal("0.90"):
        return "BLOCK"
    if rule_score >= 60 or probability >= Decimal("0.60"):
        return "REVIEW"
    return "ALLOW"
