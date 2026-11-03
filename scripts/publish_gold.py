"""Publish one validated, immutable Gold catalog by atomically replacing a pointer view."""
from __future__ import annotations
import argparse
import os
from datetime import datetime, timezone
from data_engineering.common.state import PipelineState
from data_engineering.gold.release import release_name
from data_engineering.gold.catalog import TABLES
from scripts.register_trino import register_catalog, execute


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def publish(batch_id: str) -> dict:
    state=PipelineState()
    dq=state.get_json(f'runs/{batch_id}/gold_dq.json')
    built=state.get_json(f'runs/{batch_id}/silver_to_gold.json')
    expected_prefix=f'releases/{release_name(batch_id)}'
    if not dq or dq['metrics'].get('failures') != [] or not built or set(built['metrics'])!=set(TABLES) or dq.get('gold_prefix') != expected_prefix or built.get('gold_prefix') != expected_prefix:
        raise ValueError('Gold release requires successful DQ and all 17 completed datasets')
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
    state.record_stage(batch_id,'gold_published',result)
    return result


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch-id',required=True)
    args=parser.parse_args()
    print(publish(args.batch_id),flush=True)


if __name__=='__main__':main()
