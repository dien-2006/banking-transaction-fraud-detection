from unittest.mock import Mock
from scripts import register_trino
from data_engineering.gold.catalog import TABLES


def test_registration_creates_all_views_required_by_web(monkeypatch):
    execute=Mock(return_value=[])
    monkeypatch.setattr(register_trino,'execute',execute)
    register_trino.main()
    statements=[call.args[0] for call in execute.call_args_list]
    assert sum(s.startswith('CREATE TABLE') for s in statements)==len(TABLES)
    views=[s for s in statements if s.startswith('CREATE OR REPLACE VIEW')]
    assert len(views)==6
    for suffix in ['transaction_daily_summary','risk_daily_summary','review_performance','model_performance','login_daily_summary','loan_payment_daily_summary']:
        assert any('hive.gold.vw_'+suffix in s for s in views)
        assert not any(s.rstrip().endswith(';') for s in views)


def test_audit_catalog_registration_is_isolated(monkeypatch):
    execute=Mock(return_value=[])
    monkeypatch.setattr(register_trino,'execute',execute)
    monkeypatch.setenv('GOLD_SCHEMA','d4_audit_20261102')
    monkeypatch.setenv('GOLD_BUCKET','d4-audit-batch-20261102-gold')
    register_trino.main()
    statements=[call.args[0] for call in execute.call_args_list]
    assert not any('hive.gold.' in s for s in statements)
    assert all('hive.d4_audit_20261102' in s for s in statements)
