"""Apply reviewed function bodies only; never execute table/index/trigger DDL."""
import argparse
import re
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from scripts.postgres_config import postgres_dsn

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ['z_03_integrity.sql', 'z_04_financial_operations.sql', 'z_06_api_queries.sql', 'z_07_outbox_and_indexes.sql']


def function_statements():
    for filename in SOURCES:
        source = (ROOT / 'sql' / filename).read_text()
        for match in re.finditer(r'CREATE OR REPLACE FUNCTION\s+([^\s(]+).*?\$\$;', source, re.DOTALL):
            name = match.group(1)
            if filename == 'z_06_api_queries.sql' and name != 'banking_api.list_audit_logs':
                continue
            yield name, match.group(0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    parser.parse_args()
    load_dotenv(ROOT / '.env')
    with psycopg.connect(postgres_dsn()) as connection:
        connection.execute("SET LOCAL lock_timeout='5s'")
        connection.execute("SET LOCAL statement_timeout='30s'")
        connection.execute('SET LOCAL search_path=banking,public')
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('d4-function-deployment',0))")
        applied = []
        for name, statement in function_statements():
            connection.execute(statement)
            applied.append(name)
    print(f'Applied {len(applied)} function definitions atomically; no table/constraint/index changes')


if __name__ == '__main__':
    main()
