"""Run batch integration in new, isolated MinIO buckets (never publish to web Gold)."""
from __future__ import annotations
import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv


def configure(prefix: str) -> None:
    if not re.fullmatch(r'd4-audit-[a-z0-9-]{1,40}', prefix):
        raise ValueError('audit prefix must start d4-audit- and use lowercase letters/digits/hyphens')
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
    os.environ['MINIO_ACCESS_KEY'] = os.environ.get('MINIO_ACCESS_KEY') or os.environ['MINIO_ROOT_USER']
    os.environ['MINIO_SECRET_KEY'] = os.environ.get('MINIO_SECRET_KEY') or os.environ['MINIO_ROOT_PASSWORD']
    for layer in ['BRONZE','SILVER','GOLD','QUARANTINE','CONTROL']:
        os.environ[f'MINIO_BUCKET_{layer}'] = f'{prefix}-{layer.lower()}'
    os.environ.setdefault('SOURCE_TIMEZONE','Asia/Ho_Chi_Minh')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', default='d4-audit-'+datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))
    args = parser.parse_args()
    configure(args.prefix)
    from data_engineering.common.state import PipelineState
    from data_engineering.common.spark import session
    from data_engineering.ingestion.batch.extract import run as extract
    from data_engineering.bronze.validate import run as bronze
    from data_engineering.silver.transform import run as silver
    from data_engineering.quality.checks import run as quality
    from data_engineering.gold.build import run as gold
    from data_engineering.jobs.pipeline import commit_state
    state=PipelineState()
    for layer in ['BRONZE','SILVER','GOLD','QUARANTINE','CONTROL']:
        bucket=os.environ[f'MINIO_BUCKET_{layer}']
        if not state.client.bucket_exists(bucket): state.client.make_bucket(bucket)
    results={}
    try:
        for name, task in [('extract',extract),('bronze-dq',bronze),('silver',silver),('silver-dq',lambda b:quality('silver',b)),('commit-state',commit_state),('gold',gold),('gold-dq',lambda b:quality('gold',b))]:
            results[name]=task(args.prefix)
            print(json.dumps({'stage':name,'prefix':args.prefix,'status':'passed','metrics':results[name]},default=str),flush=True)
        replayed_extract=extract(args.prefix)
        assert replayed_extract==results['extract'], 'Completed Bronze extraction changed on retry after watermark commit'
        repeated=gold(args.prefix)
        assert repeated==results['gold'], 'Gold re-run changed dataset counts'
        quality('gold',args.prefix)
        print(json.dumps({'status':'passed','prefix':args.prefix,'gold_rerun_counts_identical':True}),flush=True)
    except Exception as exc:
        state.record_stage(args.prefix,'audit_failure',{'error_type':type(exc).__name__,'message':str(exc)[:2000]})
        raise
    finally:
        session('audit-cleanup').stop()


if __name__=='__main__': main()
