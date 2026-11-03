"""Read-only reconciliation of Kafka committed offsets, outbox and recent Bronze.

Run inside the bronze-consumer container (uses its existing service configuration).
No messages are produced and no offsets are reset or committed by this audit.
"""
from __future__ import annotations
import json
import os
from datetime import datetime, timezone
import psycopg
from confluent_kafka import Consumer, TopicPartition
from data_engineering.common.state import PipelineState
from scripts.postgres_config import postgres_dsn


def main() -> None:
    state=PipelineState()
    topic=os.getenv('KAFKA_TRANSACTION_TOPIC','banking.transaction-events.v1')
    consumer=Consumer({'bootstrap.servers':os.environ['KAFKA_BOOTSTRAP_SERVERS'],
        'group.id':os.getenv('KAFKA_CONSUMER_GROUP','bronze-transaction-writer-v1'),
        'enable.auto.commit':False,'enable.auto.offset.store':False})
    try:
        metadata=consumer.list_topics(topic,timeout=10)
        info=metadata.topics[topic]
        if info.error: raise RuntimeError(str(info.error))
        partitions=[TopicPartition(topic,p) for p in sorted(info.partitions)]
        committed=consumer.committed(partitions,timeout=10)
        lag=[]
        for partition in committed:
            low,high=consumer.get_watermark_offsets(partition,timeout=10,cached=False)
            lag.append({'partition':partition.partition,'committed':partition.offset,'retained_low':low,'high':high,'lag':None if partition.offset<0 else high-partition.offset})
    finally: consumer.close()
    with psycopg.connect(postgres_dsn()) as conn:
        counts=dict(conn.execute('SELECT status,count(*) FROM banking.event_outbox GROUP BY status').fetchall())
        recent=conn.execute("SELECT eventkey FROM banking.event_outbox WHERE publishedat IS NOT NULL ORDER BY publishedat DESC,eventoutboxid DESC LIMIT 2").fetchall()
    target={row[0] for row in recent}
    found=set()
    bucket=os.getenv('MINIO_BUCKET_BRONZE','bronze')
    # Listing is metadata-only; read the twenty most recently written raw records.
    objects=sorted(state.client.list_objects(bucket,prefix='kafka/events/',recursive=True),key=lambda o:o.last_modified,reverse=True)[:20]
    for obj in objects:
        response=state.client.get_object(bucket,obj.object_name)
        try: record=json.loads(response.read())
        finally: response.close(); response.release_conn()
        event=record.get('envelope',{}).get('event_id')
        if event in target: found.add(event)
    report={'checked_at':datetime.now(timezone.utc).isoformat(),'outbox_status_counts':counts,'consumer_partitions':lag,'latest_published_checked':len(target),'latest_published_found_in_recent_bronze':len(found)}
    print(json.dumps(report,sort_keys=True))
    if counts.get('PENDING',0) or counts.get('FAILED',0) or target-found or any(p['lag']!=0 for p in lag):
        raise SystemExit(1)


if __name__=='__main__': main()
