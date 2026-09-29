from pathlib import Path

from data_engineering.common.catalog import CONTRACTS
from scripts.register_trino import TABLES


EXPECTED_FACTS = {
    "fact_transaction",
    "fact_transaction_posting",
    "fact_risk_assessment",
    "fact_fraud_review",
    "fact_fraud_label_event",
    "fact_login_event",
    "fact_loan_payment",
}


def test_risk_contract_uses_v1_columns():
    columns = set(CONTRACTS["risk_assessment"].columns.values())
    assert {"rule_score", "risk_level", "model_probability", "decision"} <= columns
    assert "risk_score" not in columns


def test_trino_catalog_has_exact_gold_contract():
    assert len([name for name in TABLES if name.startswith("dim_")]) == 10
    assert {name for name in TABLES if name.startswith("fact_")} == EXPECTED_FACTS


def test_bootstrap_schema_matches_runtime_risk_contract():
    ddl = (Path(__file__).parents[1] / "sql" / "create_table.sql").read_text(encoding="utf-8").lower()
    block = ddl.split("create table risk_assessment", 1)[1].split("create table review_case", 1)[0]
    assert all(column in block for column in ("rulescore", "risklevel", "modelprobability"))
    assert "riskscore" not in block
