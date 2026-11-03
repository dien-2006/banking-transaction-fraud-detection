import os
import pytest
import psycopg
from scripts.postgres_config import postgres_dsn

pytestmark = pytest.mark.skipif(os.getenv('RUN_BANKING_INTEGRATION') != '1', reason='requires isolated PostgreSQL')


@pytest.mark.parametrize('score,probability,expected', [
    (59, '0.59', 'ALLOW'), (60, '0.59', 'REVIEW'), (79, '0.59', 'REVIEW'), (80, '0.59', 'BLOCK'),
    (0, '0.59', 'ALLOW'), (0, '0.60', 'REVIEW'), (0, '0.89', 'REVIEW'), (0, '0.90', 'BLOCK'),
    (60, '0.90', 'BLOCK'), (80, '0.60', 'BLOCK'),
])
def test_real_decision_engine_boundaries(score, probability, expected):
    with psycopg.connect(postgres_dsn()) as connection:
        assert connection.execute('SELECT banking_api.risk_decision(%s,%s::numeric)', (score, probability)).fetchone()[0] == expected
