"""Publish one validated, immutable Gold catalog by atomically replacing a pointer view."""
from __future__ import annotations
import argparse
import os
from datetime import datetime, timezone
from contextlib import contextmanager
import psycopg
from scripts.postgres_config import postgres_dsn
from data_engineering.common.state import PipelineState
from data_engineering.gold.release import release_name
from data_engineering.gold.catalog import TABLES
from scripts.register_trino import register_catalog, execute


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


@contextmanager
def publication_lock():
    # Session coordination only: no business table/schema writes, ETL role is sufficient.
    with psycopg.connect(postgres_dsn(), autocommit=True) as connection:
        if not connection.execute("SELECT pg_try_advisory_lock(hashtextextended('d4-gold-publication',0))").fetchone()[0]:
            raise RuntimeError('Another Gold publication is in progress; retry later')
        yield


def publish(batch_id: str) -> dict:
    with publication_lock():
        return _publish(batch_id)


def _publish(batch_id: str) -> dict:
    state=PipelineState()
    dq=state.get_json(f'runs/{batch_id}/gold_dq.json')
    built=state.get_json(f'runs/{batch_id}/silver_to_gold.json')
    expected_prefix=f'releases/{release_name(batch_id)}'
    if not dq or dq['metrics'].get('failures') != [] or not built or set(built['metrics'])!=set(TABLES) or dq.get('gold_prefix') != expected_prefix or built.get('gold_prefix') != expected_prefix:
        raise ValueError('Gold release requires successful DQ and all 17 completed datasets')
    extracted=state.get_json(f'runs/{batch_id}/postgres_to_bronze.json')
    if not extracted or not extracted.get('recorded_at'):
        raise ValueError('Gold publication requires source snapshot provenance')
    previous=state.get_json('gold/active_release.json')
    try:
        visible=execute('SELECT batch_id FROM hive.gold.active_release')
    except RuntimeError as error:
        if not any(name in str(error) for name in ('TABLE_NOT_FOUND', 'SCHEMA_NOT_FOUND')):
            raise
        visible=[]
    if visible:
        actual=state.get_json(f'runs/{visible[0][0]}/postgres_to_bronze.json')
        if not actual or not actual.get('recorded_at'):
            raise ValueError('Current Gold source provenance is unavailable')
        if not previous or actual['recorded_at']>previous.get('source_recorded_at',''):
            previous={'source_recorded_at':actual['recorded_at']}
    if previous and extracted['recorded_at']<previous.get('source_recorded_at',''):
        raise ValueError('Refusing to replace newer Gold with an older source snapshot')
    schema=release_name(batch_id)
    prefix=f'releases/{schema}'
    bucket=os.getenv('MINIO_BUCKET_GOLD','gold')
    register_catalog(bucket,schema,prefix)
    for table,count in built['metrics'].items():
        rows=execute(f'SELECT count(*) FROM hive.{schema}.{table}')
        if not rows or int(rows[0][0])!=count:
            raise ValueError(f'Gold publication count mismatch: {table}')
    # Verify every dashboard dependency before changing anything visible to the API.
    for view in ['transaction_daily_summary','risk_daily_summary','review_performance','model_performance','login_daily_summary','loan_payment_daily_summary']:
        execute(f'SELECT * FROM hive.{schema}.vw_{view} LIMIT 1')
    now=datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
    # One metastore operation changes the complete release, never seventeen independent pointers.
    execute('CREATE SCHEMA IF NOT EXISTS hive.gold')
    execute(f"CREATE OR REPLACE VIEW hive.gold.active_release AS SELECT {literal(schema)} AS schema_name, {literal(batch_id)} AS batch_id, TIMESTAMP '{now}' AS published_at")
    result={'schema':schema,'batch_id':batch_id,'prefix':prefix,'published_at':now}
    state.put_json('gold/active_release.json', {**result, 'source_recorded_at':extracted['recorded_at']})
    state.record_stage(batch_id,'gold_published',result)
    return result


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch-id',required=True)
    args=parser.parse_args()
    print(publish(args.batch_id),flush=True)


if __name__=='__main__':main()
