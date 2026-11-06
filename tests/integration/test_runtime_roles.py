import os
import sys
import subprocess
from dotenv import dotenv_values
import psycopg
import pytest
from scripts.postgres_config import postgres_dsn

pytestmark = pytest.mark.skipif(os.getenv('RUN_BANKING_INTEGRATION') != '1', reason='requires isolated PostgreSQL')


def test_runtime_roles_cannot_change_schema_or_write_outside_their_scope(tmp_path):
    if not os.environ['POSTGRES_DB'].startswith('d4_'):
        pytest.skip('role fixtures require isolated d4_* database')
    path = tmp_path / 'roles.env'
    subprocess.run([sys.executable, '-m', 'scripts.provision_runtime_roles', '--apply', '--env-file', str(path)],
                   env=os.environ.copy(), check=True, capture_output=True)
    settings = dotenv_values(path)
    for scope in ['BANKING', 'OUTBOX', 'NOTIFICATION', 'ETL']:
        scoped = dotenv_values(path.with_name(path.name + '.' + scope.lower()))
        assert scoped['POSTGRES_USER'] == settings[f'{scope}_DB_USER']
        assert scoped['POSTGRES_PASSWORD'] == settings[f'{scope}_DB_PASSWORD']
        assert 'MINIO_ROOT_PASSWORD' not in scoped
        assert 'BANKING_DB_PASSWORD' not in scoped
        if scope != 'BANKING':
            assert 'JWT_SECRET' not in scoped and 'OTP_HASH_SECRET' not in scoped
        with psycopg.connect(postgres_dsn(), user=settings[f'{scope}_DB_USER'], password=settings[f'{scope}_DB_PASSWORD']) as c:
            assert c.execute('SELECT rolsuper FROM pg_roles WHERE rolname=current_user').fetchone()[0] is False
            with pytest.raises(psycopg.errors.InsufficientPrivilege), c.transaction():
                c.execute('CREATE TABLE banking.forbidden_test(id integer)')
            if scope != 'BANKING':
                with pytest.raises(psycopg.errors.InsufficientPrivilege), c.transaction():
                    c.execute("UPDATE banking.bank_account SET balance=0 WHERE false")
            if scope == 'OUTBOX':
                c.execute('SELECT * FROM banking_api.claim_ready_outbox(1,ARRAY[]::bigint[])')
            elif scope == 'NOTIFICATION':
                c.execute('SELECT * FROM banking_api.claim_ready_notifications(1,ARRAY[]::bigint[])')
            elif scope == 'ETL':
                c.execute('SELECT count(*) FROM banking.customer')
