import os
import uuid
import psycopg
from psycopg import sql
import pytest
from data_engineering.ingestion.batch.snapshot import source_snapshot
from scripts.postgres_config import postgres_dsn

pytestmark = pytest.mark.skipif(os.getenv('RUN_BANKING_INTEGRATION') != '1', reason='requires isolated PostgreSQL')


def test_independent_readers_import_the_same_committed_snapshot():
    code = 'SNAP-' + uuid.uuid4().hex[:12]
    with source_snapshot() as snapshot:
        with psycopg.connect(postgres_dsn()) as writer:
            writer.execute("INSERT INTO banking.customer(customercode,fullname) VALUES(%s,'snapshot test')", (code,))
        # Both JDBC connections must see the same pre-commit state, even though
        # the live database already contains the committed parent/child changes.
        for _ in range(2):
            with psycopg.connect(postgres_dsn()) as reader:
                reader.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                reader.execute(sql.SQL('SET TRANSACTION SNAPSHOT {}').format(sql.Literal(snapshot)))
                assert reader.execute('SELECT count(*) FROM banking.customer WHERE customercode=%s',(code,)).fetchone()[0] == 0
    with psycopg.connect(postgres_dsn()) as reader:
        assert reader.execute('SELECT count(*) FROM banking.customer WHERE customercode=%s',(code,)).fetchone()[0] == 1
