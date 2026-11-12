# D4 Bank NestJS backend

Customer self service: `GET /api/v1/me/products/catalog`, `POST /api/v1/me/products/accounts`, `/cards`, `/loans`. These routes require the customer role and derive identity from the JWT. The POST payload requires a UUID `requestKey`; replaying the same payload returns the recorded result, while a changed payload with the same key returns 409. Products and replay audit records commit together. Card policies and loan rates are server controlled; raw PINs never enter audit records or responses.

Staff process pending loans through `POST /api/v1/management/loans/:id/decision` with `{ "decision": "APPROVE" | "REJECT", "reason": "..." }`. Employees are limited to their authenticated branch; admins can process all branches. The existing `POST /management/loans/:id/approve` route also requires `reason` and uses the same service. Approval creates the repayment schedule without disbursing money; rejection uses the existing `Cancelled` loan status. No database schema change is required.

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
