"""Provision local runtime roles without changing any banking table/schema.

Uses the existing administrative connection; writes generated passwords only to
the local ignored .env. Never prints credentials. Run explicitly with --apply.
"""
import argparse
import os
import secrets
from pathlib import Path

import psycopg
from psycopg import sql
from dotenv import dotenv_values, load_dotenv, set_key
from scripts.postgres_config import postgres_dsn


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    parser.add_argument('--env-file', type=Path, default=Path(__file__).resolve().parents[1] / '.env')
    args = parser.parse_args()
    path = args.env_file.resolve()
    path.touch(mode=0o600, exist_ok=True)
    load_dotenv(path)
    names = {'BANKING': 'd4_banking', 'OUTBOX': 'd4_outbox', 'NOTIFICATION': 'd4_notification', 'ETL': 'd4_etl'}
    settings = {}
    with psycopg.connect(postgres_dsn()) as connection:
        for scope, default in names.items():
            name = os.getenv(f'{scope}_DB_USER') or default
            password = os.getenv(f'{scope}_DB_PASSWORD') or secrets.token_urlsafe(36)
            if not connection.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (name,)).fetchone():
                connection.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(name), sql.Literal(password)))
            else:
                # Never silently repurpose an administrative/shared identity.
                role = connection.execute('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=%s', (name,)).fetchone()
                if any(role):
                    raise ValueError(f'{scope} runtime identity has administrative privileges')
                connection.execute(sql.SQL('ALTER ROLE {} PASSWORD {}').format(sql.Identifier(name), sql.Literal(password)))
            ident = sql.Identifier(name)
            connection.execute(sql.SQL('GRANT USAGE ON SCHEMA banking, banking_api TO {}').format(ident))
            if scope != 'OUTBOX':
                connection.execute(sql.SQL('GRANT SELECT ON ALL TABLES IN SCHEMA banking TO {}').format(ident))
            if scope == 'BANKING':
                connection.execute(sql.SQL('GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA banking TO {}').format(ident))
                connection.execute(sql.SQL('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA banking TO {}').format(ident))
            elif scope == 'OUTBOX':
                connection.execute(sql.SQL('GRANT SELECT, UPDATE ON banking.event_outbox TO {}').format(ident))
            elif scope == 'NOTIFICATION':
                connection.execute(sql.SQL('GRANT UPDATE ON banking.notification_outbox TO {}').format(ident))
            settings[f'{scope}_DB_USER'] = name
            settings[f'{scope}_DB_PASSWORD'] = password
    for key, value in settings.items():
        set_key(str(path), key, value)
    values = {**dotenv_values(path), **os.environ, **settings}
    common = {'TZ', 'SOURCE_TIMEZONE', 'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_INTERNAL_PORT', 'POSTGRES_DB', 'POSTGRES_SCHEMA'}
    allowed = {
        'BANKING': {'PORT', 'CORS_ORIGINS', 'JWT_SECRET', 'OTP_HASH_SECRET', 'BREVO_API_KEY', 'OTP_SENDER_EMAIL', 'OTP_SENDER_NAME', 'REDIS_URL', 'TRINO_URL', 'TRINO_USER', 'JOBLIB_MODEL_PATH', 'JOBLIB_METADATA_PATH', 'SOURCE_TIMEZONE', 'LOAN_SETTLEMENT_ACCOUNT_ID'},
        'OUTBOX': {key for key in values if key.startswith(('KAFKA_', 'OUTBOX_')) and not key.endswith(('_DB_USER', '_DB_PASSWORD', '_ENV_FILE'))},
        'NOTIFICATION': {'BREVO_API_KEY', 'OTP_SENDER_EMAIL', 'OTP_SENDER_NAME', 'NOTIFICATION_BATCH_SIZE', 'NOTIFICATION_POLL_INTERVAL_MS'},
        'ETL': {key for key in values if key.startswith(('SPARK_', 'MINIO_BUCKET_', 'KAFKA_'))} | {'SOURCE_TIMEZONE', 'MINIO_ENDPOINT', 'ENABLE_REALTIME_SILVER_MERGE', 'MODEL_OBJECT_NAME'},
    }
    for scope in names:
        scoped = {key: values[key] for key in common | allowed[scope] if values.get(key) is not None}
        scoped.update(POSTGRES_USER=settings[f'{scope}_DB_USER'], POSTGRES_PASSWORD=settings[f'{scope}_DB_PASSWORD'])
        if scope == 'ETL':
            scoped['MINIO_ACCESS_KEY'] = values.get('MINIO_ACCESS_KEY') or values.get('MINIO_ROOT_USER', '')
            scoped['MINIO_SECRET_KEY'] = values.get('MINIO_SECRET_KEY') or values.get('MINIO_ROOT_PASSWORD', '')
        target = path.with_name(path.name + '.' + scope.lower())
        target.write_text('')
        target.chmod(0o600)
        for key, value in scoped.items():
            set_key(str(target), key, str(value))
        set_key(str(path), f'{scope}_ENV_FILE', str(target.relative_to(path.parent)))
    path.chmod(0o600)
    print('Provisioned four runtime roles and scoped environment files; credentials remain local and ignored')


if __name__ == '__main__':
    main()
