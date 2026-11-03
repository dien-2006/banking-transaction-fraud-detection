"""A shared, read-only PostgreSQL snapshot for all JDBC source tables."""
import os
from contextlib import contextmanager
import psycopg
from scripts.postgres_config import postgres_dsn


@contextmanager
def source_snapshot():
    with psycopg.connect(postgres_dsn(), user=os.getenv('ETL_DB_USER') or os.environ['POSTGRES_USER'],
                         password=os.getenv('ETL_DB_PASSWORD') or os.environ['POSTGRES_PASSWORD']) as connection:
        connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        snapshot = connection.execute('SELECT pg_export_snapshot()').fetchone()[0]
        yield snapshot
