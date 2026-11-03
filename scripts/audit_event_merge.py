"""Check Kafka-to-event-Silver replay in an existing isolated batch audit bucket."""
from __future__ import annotations
import argparse
import io
import json
import os
from scripts.audit_pipeline import configure


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix',required=True)
    parser.add_argument('--source-bucket',default='bronze')
    args=parser.parse_args()
    configure(args.prefix)
    from data_engineering.common.state import PipelineState
    from data_engineering.common.spark import session
    from data_engineering.silver.transform import _materialize_realtime_domain_events
    state=PipelineState()
    candidates=sorted(state.client.list_objects(args.source_bucket,prefix='kafka/events/',recursive=True),key=lambda o:o.last_modified,reverse=True)
    chosen=[]
    for obj in candidates:
        r=state.client.get_object(args.source_bucket,obj.object_name)
        try: data=json.loads(r.read())
        finally: r.close();r.release_conn()
        if 'envelope' in data:
            chosen.append(data)
        if len(chosen)==2: break
    if not chosen: raise RuntimeError('no committed stream events in Bronze to audit')
    # Replay the same event in another raw object; the business event_id is unchanged.
    records=[*chosen,chosen[0]]
    bucket=os.environ['MINIO_BUCKET_BRONZE']
    for i,record in enumerate(records):
        body=json.dumps(record).encode()
        state.client.put_object(bucket,f'kafka/events/audit-replay-{i}.json',io.BytesIO(body),len(body),content_type='application/json')
    spark=session('event-replay-audit')
    try:
        expected=len({r['envelope']['event_id'] for r in chosen})
        first=_materialize_realtime_domain_events(spark,args.prefix)
        second=_materialize_realtime_domain_events(spark,args.prefix)
        assert first['input']==len(records) and first['valid']==expected and first['invalid']==0,first
        assert second==first, (first,second)
        print(json.dumps({'status':'passed','event_merge':first,'rerun_identical':True,'business_transaction_snapshot_untouched':True}),flush=True)
    finally:spark.stop()


if __name__=='__main__':main()
