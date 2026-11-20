# D4 Bank NestJS backend

Customer self service: `GET /api/v1/me/products/catalog`, `POST /api/v1/me/products/accounts`, `/cards`, `/loans`. These routes require the customer role and derive identity from the JWT. The POST payload requires a UUID `requestKey`; replaying the same payload returns the recorded result, while a changed payload with the same key returns 409. Products and replay audit records commit together. Card policies and loan rates are server controlled; raw PINs never enter audit records or responses.

Staff process pending loans through `POST /api/v1/management/loans/:id/decision`. An approval now requires `{ "decision": "APPROVE", "reason": "...", "destinationAccountId": 123, "requestKey": "UUID" }`; rejection requires only `decision` and `reason`. The compatibility route `POST /management/loans/:id/approve` requires the same receiving account, UUID and reason. Employees are restricted to their branch; admins can process all branches. `GET /management/loans/:id/disbursement-options` supplies eligible primary-owned VND accounts and the current funding transaction.

Approval requests disbursement using the existing `DEPOSIT` movement, a bank-side account resolved from the existing DB pool (active INTERNAL/VND, preferring sufficient funds and then the loan branch), and the normal Risk/ML policy. Inspect `response.disbursement.status`: only `Success` credits the customer, activates the loan and creates its schedule, atomically with debit/credit, outbox and audit. A pending REVIEW leaves the loan Pending with no schedule; resolving that review uses the same financial finalization. BLOCK/insufficient funds never activate the loan. A rejection cancels an application only when no pending or successful funding exists. Retrying an uncertain response must preserve the UUID and receiving account; a loan row lock prevents duplicate funding even with different keys.

No table/column/constraint changes are required. Funding evidence uses the existing transaction, posting and audit records. Online repayment debits the customer-selected account. The bank counterparty is resolved by Banking Core, preferring the original funding account, then a previous successful repayment counterparty, then the same-branch bank pool. No manual account ID environment settings are required. Existing Active/Overdue loans remain repayable under their schedules, and are never automatically credited again. Deploy the updated financial functions and `approve_loan` together as described in `../running.md` before using the new approval API.

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
