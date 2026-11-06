import os
import sys
import stat
import subprocess
from dotenv import dotenv_values, set_key
import psycopg
import pytest
from scripts.postgres_config import postgres_dsn

pytestmark = pytest.mark.skipif(os.getenv('RUN_BANKING_INTEGRATION') != '1', reason='requires isolated PostgreSQL')


def test_local_rotation_updates_role_and_protected_file_without_exposing_credentials(tmp_path):
    if not os.environ['POSTGRES_DB'].startswith('d4_'):
        pytest.skip('secret rotation fixtures require an isolated d4_* database')
    role = 'd4_rotation_test'
    with psycopg.connect(postgres_dsn()) as c:
        if not c.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
            c.execute("CREATE ROLE d4_rotation_test LOGIN PASSWORD 'test-old-password' NOSUPERUSER")
        else:
            c.execute("ALTER ROLE d4_rotation_test PASSWORD 'test-old-password'")
    path = tmp_path / '.env'
    path.touch(mode=0o600)
    settings = {key: os.environ[key] for key in ['POSTGRES_HOST', 'POSTGRES_INTERNAL_PORT', 'POSTGRES_DB']}
    settings.update(POSTGRES_USER=role, POSTGRES_PASSWORD='test-old-password', MINIO_ROOT_PASSWORD='test-minio-old', JWT_SECRET='test-jwt-old', OTP_HASH_SECRET='test-otp-old')
    for key, value in settings.items():
        set_key(str(path), key, value)
    result = subprocess.run([sys.executable, '-m', 'scripts.rotate_local_secrets', '--apply', '--env-file', str(path)],
                            check=True, capture_output=True, text=True)
    new = dotenv_values(path)
    for key in ['POSTGRES_PASSWORD', 'MINIO_ROOT_PASSWORD', 'JWT_SECRET', 'OTP_HASH_SECRET']:
        assert new[key] != settings[key]
        assert new[key] not in result.stdout + result.stderr
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    with psycopg.connect(host=new['POSTGRES_HOST'], port=new['POSTGRES_INTERNAL_PORT'], dbname=new['POSTGRES_DB'], user=role, password=new['POSTGRES_PASSWORD']) as c:
        assert c.execute('SELECT current_user').fetchone()[0] == role
    with pytest.raises(psycopg.OperationalError):
        psycopg.connect(host=new['POSTGRES_HOST'], port=new['POSTGRES_INTERNAL_PORT'], dbname=new['POSTGRES_DB'], user=role, password=settings['POSTGRES_PASSWORD'])
