from contextlib import contextmanager

import pytest

from scripts.reset_login_passwords import reset_passwords, validate_password


class Connection:
    def __init__(self, fail_customer=False):
        self.calls = []
        self.fail_customer = fail_customer
        self.committed = self.rolled_back = False

    @contextmanager
    def transaction(self):
        try:
            yield
        except Exception:
            self.rolled_back = True
            raise
        else:
            self.committed = True

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if "customer_online_account" in sql:
            if self.fail_customer:
                raise RuntimeError("database failure")
            return type("Result", (), {"rowcount": 94})()
        return type("Result", (), {"rowcount": 4})()


def test_both_login_tables_are_reset_atomically_with_bound_passwords():
    connection = Connection()
    password = "test-only-'%s-value"
    assert reset_passwords(connection, password) == {"staff": 4, "customers": 94}
    updates = [(sql, params) for sql, params in connection.calls if sql.startswith("UPDATE")]
    assert len(updates) == 2
    for sql, params in updates:
        assert password not in sql
        assert params == (password,)
        assert "public.gen_salt('bf',12)" in sql
        assert "isactive" not in sql and "bank_account" not in sql
    assert connection.committed and not connection.rolled_back


def test_second_update_failure_rolls_back_both_tables():
    connection = Connection(fail_customer=True)
    with pytest.raises(RuntimeError):
        reset_passwords(connection, "test-only-password")
    assert connection.rolled_back and not connection.committed


@pytest.mark.parametrize("password", ["short", "é" * 37, "a" * 73, "valid-length\x00"])
def test_invalid_passwords_do_not_touch_database(password):
    connection = Connection()
    with pytest.raises(ValueError):
        reset_passwords(connection, password)
    assert connection.calls == []


def test_bcrypt_boundary_accepts_72_bytes():
    validate_password("é" * 36)
