# D4 Bank NestJS backend

This service is a thin HTTP and authorization layer over the PostgreSQL
`banking_api` contract in `sql/`. Financial atomicity is implemented by the
PL/pgSQL functions; the API never updates balances table-by-table.

Required environment variables:

```env
PORT=8000
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=replace-with-at-least-32-random-bytes
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=bank_fraud
POSTGRES_USER=bank_admin
POSTGRES_PASSWORD=replace-me
KAFKA_BOOTSTRAP_SERVERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_TRANSACTION_TOPIC=banking.transaction-events.v1
```

Commands for the user to run after applying SQL:

```bash
cd backend
npm install
npm run typecheck
npm run build
npm run start:dev
```

Run the outbox publisher separately with `npm run start:producer` after Kafka
topics are ready. At-least-once delivery is intentional; consumers must
deduplicate by `event_key`.
