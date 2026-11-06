import { Kafka, Producer } from 'kafkajs';
import { Pool } from 'pg';
import { DeliveryRetry } from './delivery-retry';

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_INTERNAL_PORT ?? process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.OUTBOX_DB_USER || process.env.POSTGRES_USER,
  password: process.env.OUTBOX_DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  max: 2,
  application_name: 'd4-bank-outbox-producer',
});
const kafka = new Kafka({ clientId: 'd4-bank-outbox-producer',
  brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:9092').split(',') });
const producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 });
const topic = process.env.KAFKA_TRANSACTION_TOPIC ?? 'banking.transaction-events.v1';
const retries = new DeliveryRetry();

export async function publishBatch(database: Pick<Pool, 'connect'> = pool, transport: Pick<Producer, 'send'> = producer, retry: DeliveryRetry = retries): Promise<number> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const timezone = process.env.SOURCE_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
    await client.query("SELECT set_config('TimeZone',$1,true)", [timezone]);
    const result = await client.query(
      'SELECT e.*, e.createdat AT TIME ZONE $3 AS event_occurred_at FROM banking_api.claim_ready_outbox($1,$2::bigint[]) e',
      [Number(process.env.OUTBOX_BATCH_SIZE ?? 100), retry.excluded(), timezone],
    );
    let published = 0;
    for (const event of result.rows) {
      try {
        await transport.send({ topic, acks: -1, messages: [{
          key: event.eventkey,
          value: JSON.stringify({
            event_id: event.eventkey,
            event_type: event.eventtype,
            event_version: '1.0',
            occurred_at: event.event_occurred_at,
            aggregate_type: event.aggregatetype,
            aggregate_id: event.aggregateid,
            payload: event.payloadjson,
            source_system: 'banking_postgresql',
            outbox_id: event.eventoutboxid,
          }),
        }] });
        await client.query('SELECT banking_api.mark_outbox_published($1)', [event.eventoutboxid]);
        published += 1;
        retry.succeeded(event.eventoutboxid);
      } catch (error) {
        await client.query('SELECT banking_api.mark_outbox_failed($1)', [event.eventoutboxid]);
        const paused = retry.failed(event.eventoutboxid);
        console.error('outbox_event_publish_failed', { eventId: event.eventkey, paused, errorType: error instanceof Error ? error.name : 'UnknownError' });
      }
    }
    await client.query('COMMIT');
    return published;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function main(): Promise<void> {
  await producer.connect();
  const interval = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
  for (;;) {
    try {
      await publishBatch();
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.error('outbox_publish_failed', error);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

async function shutdown(): Promise<void> {
  await producer.disconnect(); await pool.end(); process.exit(0);
}
if (require.main === module) {
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  void main().catch(() => { console.error('outbox_start_failed'); process.exitCode = 1; });
}
