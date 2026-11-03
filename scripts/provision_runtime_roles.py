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
from dotenv import load_dotenv, set_key
from scripts.postgres_config import postgres_dsn


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    parser.parse_args()
    path = Path(__file__).resolve().parents[1] / '.env'
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
    path.chmod(0o600)
    print('Provisioned four runtime roles; credentials saved to ignored .env')


if __name__ == '__main__':
    main()
