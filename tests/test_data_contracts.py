from __future__ import annotations

import json
import re
from pathlib import Path

from data_engineering.common.config import load_yaml
from data_engineering.common.contracts import CONTRACTS
from data_engineering.gold.catalog import (
    EXPECTED_DIMENSIONS,
    EXPECTED_FACTS,
    GOLD_PRIMARY_KEYS,
    GOLD_RELATIONSHIPS,
    TABLES,
)
from ml.features import FEATURES


ROOT = Path(__file__).resolve().parents[1]


def _ddl_columns(table: str) -> set[str]:
    ddl = (ROOT / "sql/create_table.sql").read_text(encoding="utf-8")
    match = re.search(
        rf'CREATE TABLE\s+(?:"{re.escape(table)}"|{re.escape(table)})\s*\((.*?)\n\);',
        ddl,
        flags=re.DOTALL | re.IGNORECASE,
    )
    assert match, f"DDL table not found: {table}"
    columns: set[str] = set()
    for line in match.group(1).splitlines():
        stripped = line.strip()
        if not stripped or stripped.upper().startswith(("CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK")):
            continue
        name = stripped.split()[0].strip('"').rstrip(",")
        if name.isidentifier():
            columns.add(name.lower())
    return columns


def test_exactly_twenty_source_contracts_match_configuration() -> None:
    sources = load_yaml("config/sources.yaml")["sources"]
    assert len(sources) == 20
    assert set(sources) == set(CONTRACTS)
    for dataset, source in sources.items():
        contract = CONTRACTS[dataset]
        assert source["primary_key"] in contract.columns
        assert contract.columns[source["primary_key"]] == contract.primary_key
        assert set(contract.required) <= set(contract.columns.values())
        assert set(contract.timestamps) <= set(contract.columns.values())


def test_source_projection_only_uses_columns_in_current_database_schema() -> None:
    for dataset, contract in CONTRACTS.items():
        assert set(contract.columns) <= _ddl_columns(dataset)


def test_risk_contract_uses_current_v1_fields_only() -> None:
    risk = CONTRACTS["risk_assessment"]
    expected = {
        "risk_assessment_id",
        "transaction_id",
        "model_version_id",
        "rule_score",
        "risk_level",
        "model_probability",
        "decision",
        "reason_json",
        "assessed_at",
    }
    assert set(risk.columns.values()) == expected
    assert "risk_score" not in risk.columns.values()


def test_gold_catalog_has_exactly_ten_dimensions_and_seven_facts() -> None:
    assert len(EXPECTED_DIMENSIONS) == 10
    assert len(EXPECTED_FACTS) == 7
    assert set(TABLES) == EXPECTED_DIMENSIONS | EXPECTED_FACTS


def test_gold_relationship_contract_references_valid_tables_and_columns() -> None:
    def columns(table: str) -> set[str]:
        return set(
            re.findall(
                r"(?:^|,\s)([a-z][a-z0-9_]*)\s+[A-Z]",
                TABLES[table][1],
            )
        )

    assert set(GOLD_PRIMARY_KEYS) == set(TABLES)
    identities = {
        (
            relationship.child_table,
            relationship.child_column,
            relationship.parent_table,
            relationship.parent_column,
        )
        for relationship in GOLD_RELATIONSHIPS
    }
    assert len(identities) == len(GOLD_RELATIONSHIPS)
    for relationship in GOLD_RELATIONSHIPS:
        assert relationship.child_column in columns(relationship.child_table)
        assert relationship.parent_column in columns(relationship.parent_table)
    assert EXPECTED_FACTS <= {item.child_table for item in GOLD_RELATIONSHIPS}


def test_bootstrap_model_feature_contract_matches_training() -> None:
    model = json.loads(
        (ROOT / "ml/artifacts/fraud_detection/v1/model.json").read_text(encoding="utf-8")
    )
    features = json.loads(
        (ROOT / "ml/artifacts/fraud_detection/v1/features.json").read_text(encoding="utf-8")
    )
    assert tuple(model["weights"]) == FEATURES
    assert tuple(features["features"]) == FEATURES
