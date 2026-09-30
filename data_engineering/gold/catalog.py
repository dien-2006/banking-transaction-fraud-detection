"""Trino external-table contracts for Gold outputs."""

from dataclasses import dataclass

TABLES: dict[str, tuple[str, str]] = {
    "dim_date": ("dimensions", "date_key INTEGER, full_date DATE, day INTEGER, day_of_week INTEGER, day_name VARCHAR, week INTEGER, month INTEGER, month_name VARCHAR, quarter INTEGER, year INTEGER"),
    "dim_time": ("dimensions", "time_key INTEGER, hour INTEGER, minute BIGINT, time_of_day VARCHAR"),
    "dim_customer": ("dimensions", "customer_key BIGINT, customer_id BIGINT, customer_code VARCHAR, gender VARCHAR, date_of_birth DATE, customer_type VARCHAR, status VARCHAR, customer_segment VARCHAR"),
    "dim_account": ("dimensions", "account_key BIGINT, account_id BIGINT, branch_id INTEGER, account_type_id INTEGER, open_date DATE, currency VARCHAR, status VARCHAR, account_category VARCHAR"),
    "dim_account_type": ("dimensions", "account_type_key INTEGER, account_type_id INTEGER, type_name VARCHAR, minimum_balance DECIMAL(19,2), interest_rate DECIMAL(8,4), description VARCHAR, status VARCHAR"),
    "dim_branch": ("dimensions", "branch_key INTEGER, branch_id INTEGER, branch_code VARCHAR, branch_name VARCHAR, address VARCHAR, city VARCHAR, phone VARCHAR, open_date DATE, status VARCHAR, created_at TIMESTAMP(6)"),
    "dim_transaction_type": ("dimensions", "transaction_type_key INTEGER, transaction_type_id INTEGER, type_code VARCHAR, type_name VARCHAR, description VARCHAR, status VARCHAR"),
    "dim_channel": ("dimensions", "channel_key VARCHAR, channel VARCHAR"),
    "dim_device": ("dimensions", "device_key BIGINT, device_id BIGINT, device_type VARCHAR, operating_system VARCHAR, is_trusted BOOLEAN, status VARCHAR"),
    "dim_model": ("dimensions", "model_key BIGINT, model_version_id BIGINT, model_name VARCHAR, model_type VARCHAR, status VARCHAR, created_at TIMESTAMP(6)"),
    "fact_transaction": ("facts", "transaction_id BIGINT, transaction_code VARCHAR, date_key INTEGER, time_key INTEGER, customer_key BIGINT, source_account_key BIGINT, destination_account_key BIGINT, branch_key INTEGER, transaction_type_key INTEGER, channel_key VARCHAR, device_key BIGINT, amount DECIMAL(19,2), fee DECIMAL(19,2), currency VARCHAR, status VARCHAR, transaction_at TIMESTAMP(6)"),
    "fact_transaction_posting": ("facts", "posting_id BIGINT, transaction_id BIGINT, account_key BIGINT, date_key INTEGER, time_key INTEGER, posting_type VARCHAR, amount DECIMAL(19,2), posting_at TIMESTAMP(6)"),
    "fact_risk_assessment": ("facts", "risk_assessment_id BIGINT, transaction_id BIGINT, model_key BIGINT, date_key INTEGER, time_key INTEGER, rule_score SMALLINT, risk_level VARCHAR, model_probability DECIMAL(8,6), decision VARCHAR, reason_json VARCHAR, assessed_at TIMESTAMP(6)"),
    "fact_fraud_review": ("facts", "review_case_id BIGINT, transaction_id BIGINT, created_date_key INTEGER, created_time_key INTEGER, reviewed_date_key INTEGER, reviewed_time_key INTEGER, status VARCHAR, reviewer_user_id INTEGER, created_at TIMESTAMP(6), reviewed_at TIMESTAMP(6)"),
    "fact_fraud_label_event": ("facts", "fraud_label_event_id BIGINT, transaction_id BIGINT, date_key INTEGER, time_key INTEGER, label VARCHAR, label_source VARCHAR, note VARCHAR, labeled_at TIMESTAMP(6)"),
    "fact_login_event": ("facts", "login_event_id BIGINT, customer_key BIGINT, device_key BIGINT, date_key INTEGER, time_key INTEGER, status VARCHAR, login_at TIMESTAMP(6)"),
    "fact_loan_payment": ("facts", "loan_payment_id BIGINT, loan_id BIGINT, schedule_id BIGINT, transaction_id BIGINT, date_key INTEGER, time_key INTEGER, channel_key VARCHAR, payment_channel VARCHAR, amount_paid DECIMAL(19,2), principal_paid DECIMAL(19,2), interest_paid DECIMAL(19,2), penalty_fee DECIMAL(19,2), payment_at TIMESTAMP(6)"),
}


@dataclass(frozen=True)
class GoldRelationship:
    """A logical many-to-one relationship enforced by Gold data quality."""

    child_table: str
    child_column: str
    parent_table: str
    parent_column: str

    @property
    def name(self) -> str:
        return (
            f"{self.child_table}.{self.child_column}->"
            f"{self.parent_table}.{self.parent_column}"
        )


GOLD_PRIMARY_KEYS = {
    "dim_date": "date_key",
    "dim_time": "time_key",
    "dim_customer": "customer_key",
    "dim_account": "account_key",
    "dim_account_type": "account_type_key",
    "dim_branch": "branch_key",
    "dim_transaction_type": "transaction_type_key",
    "dim_channel": "channel_key",
    "dim_device": "device_key",
    "dim_model": "model_key",
    "fact_transaction": "transaction_id",
    "fact_transaction_posting": "posting_id",
    "fact_risk_assessment": "risk_assessment_id",
    "fact_fraud_review": "review_case_id",
    "fact_fraud_label_event": "fraud_label_event_id",
    "fact_login_event": "login_event_id",
    "fact_loan_payment": "loan_payment_id",
}


GOLD_RELATIONSHIPS = (
    GoldRelationship("dim_account", "branch_id", "dim_branch", "branch_key"),
    GoldRelationship("dim_account", "account_type_id", "dim_account_type", "account_type_key"),
    GoldRelationship("fact_transaction", "date_key", "dim_date", "date_key"),
    GoldRelationship("fact_transaction", "time_key", "dim_time", "time_key"),
    GoldRelationship("fact_transaction", "customer_key", "dim_customer", "customer_key"),
    GoldRelationship("fact_transaction", "source_account_key", "dim_account", "account_key"),
    GoldRelationship("fact_transaction", "destination_account_key", "dim_account", "account_key"),
    GoldRelationship("fact_transaction", "branch_key", "dim_branch", "branch_key"),
    GoldRelationship("fact_transaction", "transaction_type_key", "dim_transaction_type", "transaction_type_key"),
    GoldRelationship("fact_transaction", "channel_key", "dim_channel", "channel_key"),
    GoldRelationship("fact_transaction", "device_key", "dim_device", "device_key"),
    GoldRelationship("fact_transaction_posting", "transaction_id", "fact_transaction", "transaction_id"),
    GoldRelationship("fact_transaction_posting", "account_key", "dim_account", "account_key"),
    GoldRelationship("fact_transaction_posting", "date_key", "dim_date", "date_key"),
    GoldRelationship("fact_transaction_posting", "time_key", "dim_time", "time_key"),
    GoldRelationship("fact_risk_assessment", "transaction_id", "fact_transaction", "transaction_id"),
    GoldRelationship("fact_risk_assessment", "model_key", "dim_model", "model_key"),
    GoldRelationship("fact_risk_assessment", "date_key", "dim_date", "date_key"),
    GoldRelationship("fact_risk_assessment", "time_key", "dim_time", "time_key"),
    GoldRelationship("fact_fraud_review", "transaction_id", "fact_transaction", "transaction_id"),
    GoldRelationship("fact_fraud_review", "created_date_key", "dim_date", "date_key"),
    GoldRelationship("fact_fraud_review", "created_time_key", "dim_time", "time_key"),
    GoldRelationship("fact_fraud_review", "reviewed_date_key", "dim_date", "date_key"),
    GoldRelationship("fact_fraud_review", "reviewed_time_key", "dim_time", "time_key"),
    GoldRelationship("fact_fraud_label_event", "transaction_id", "fact_transaction", "transaction_id"),
    GoldRelationship("fact_fraud_label_event", "date_key", "dim_date", "date_key"),
    GoldRelationship("fact_fraud_label_event", "time_key", "dim_time", "time_key"),
    GoldRelationship("fact_login_event", "customer_key", "dim_customer", "customer_key"),
    GoldRelationship("fact_login_event", "device_key", "dim_device", "device_key"),
    GoldRelationship("fact_login_event", "date_key", "dim_date", "date_key"),
    GoldRelationship("fact_login_event", "time_key", "dim_time", "time_key"),
    GoldRelationship("fact_loan_payment", "transaction_id", "fact_transaction", "transaction_id"),
    GoldRelationship("fact_loan_payment", "date_key", "dim_date", "date_key"),
    GoldRelationship("fact_loan_payment", "time_key", "dim_time", "time_key"),
    GoldRelationship("fact_loan_payment", "channel_key", "dim_channel", "channel_key"),
)


GOLD_DATASETS = {
    table: (f"{group}/{table}", GOLD_PRIMARY_KEYS[table])
    for table, (group, _columns) in TABLES.items()
}


EXPECTED_DIMENSIONS = {
    "dim_date", "dim_time", "dim_customer", "dim_account", "dim_account_type",
    "dim_branch", "dim_transaction_type", "dim_channel", "dim_device", "dim_model",
}
EXPECTED_FACTS = {
    "fact_transaction", "fact_transaction_posting", "fact_risk_assessment",
    "fact_fraud_review", "fact_fraud_label_event", "fact_login_event", "fact_loan_payment",
}


assert set(TABLES) == EXPECTED_DIMENSIONS | EXPECTED_FACTS
