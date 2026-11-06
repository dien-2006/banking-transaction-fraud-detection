from scripts.apply_function_fixes import function_statements


def test_patch_updates_only_functions_and_includes_all_required_entrypoints():
    statements = list(function_statements())
    names = {name for name, _ in statements}
    assert {'banking_api.risk_decision', 'banking_api.create_transfer', 'banking_api.assess_transaction',
            'banking_api.post_balanced_transaction', 'banking_api.reverse_transaction',
            'banking_api.claim_ready_outbox', 'banking_api.claim_ready_notifications',
            'banking_api.list_audit_logs', 'fn_audit_change', 'fn_validate_financial_commit'} <= names
    for _, statement in statements:
        assert statement.startswith('CREATE OR REPLACE FUNCTION')
        assert not any(command in statement.upper() for command in ['ALTER TABLE', 'DROP TABLE', 'CREATE TABLE', 'DROP TRIGGER', 'CREATE CONSTRAINT TRIGGER'])
