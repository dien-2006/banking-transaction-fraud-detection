# D4 Bank NestJS backend

Customer self service: `GET /api/v1/me/products/catalog`, `POST /api/v1/me/products/accounts`, `/cards`, `/loans`. These routes require the customer role and derive identity from the JWT. The POST payload requires a UUID `requestKey`; replaying the same payload returns the recorded result, while a changed payload with the same key returns 409. Products and replay audit records commit together. Card policies and loan rates are server controlled; raw PINs never enter audit records or responses.

Staff process pending loans through `POST /api/v1/management/loans/:id/decision`. An approval now requires `{ "decision": "APPROVE", "reason": "...", "destinationAccountId": 123, "requestKey": "UUID" }`; rejection requires only `decision` and `reason`. The compatibility route `POST /management/loans/:id/approve` requires the same receiving account, UUID and reason. Employees are restricted to their branch; admins can process all branches. `GET /management/loans/:id/disbursement-options` supplies eligible primary-owned VND accounts and the current funding transaction.

Approval requests disbursement using the existing `DEPOSIT` movement, a bank-side account resolved from the existing DB pool (active INTERNAL/VND, preferring sufficient funds and then the loan branch), and backend business authorization without Risk/ML. Inspect `response.disbursement.status`: only `Success` credits the customer, activates the loan and creates its schedule, atomically with debit/credit, outbox and audit. Officers can explicitly confirm legacy pending REVIEWs from the loan screen. Insufficient funds never activate the loan. A rejection cancels an application only when no pending or successful funding exists. Retrying an uncertain response must preserve the UUID and receiving account; a loan row lock prevents duplicate funding even with different keys.

No table/column/constraint changes are required. Funding evidence uses the existing transaction, posting and audit records. Online repayment debits the customer-selected account. The bank counterparty is resolved by Banking Core, preferring the original funding account, then a previous successful repayment counterparty, then the same-branch bank pool. No manual account ID environment settings are required. Existing Active/Overdue loans remain repayable under their schedules, and are never automatically credited again. This backend update uses the already installed financial functions and `approve_loan`; it requires no new SQL deployment.

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

Staff operations and online loan repayments do not invoke the model or Rule Engine. The existing immutable financial gate requires an ALLOW assessment: backend records explicit business authorization using a dedicated `BUSINESS_POLICY` identity with `risk_evaluated=false`, `model_evaluated=false` in `reasonjson`. Required numeric zeros are compatibility values, not predictions; operational API responses mask those fields as null. Normal customer transfers still use Risk/ML. The existing core owns all balance/posting/outbox and schedule finalization; errors roll back the full operation. No SQL files, function definitions, tables or constraints are changed relative to the prior baseline.

Loan disbursement options check the bank source's available funds before enabling approval. The core rechecks funds under lock when posting; a concurrent balance change can still yield `Failed`. Failed receipts expose `failureCode`/`failureReason` from the committed outbox event, including `INSUFFICIENT_BALANCE`. A lost HTTP response is reconciled against the same request key and receiving account for Pending/Failed/Cancelled as well as Success, so an already recorded failure is not displayed as an unknown result. This change requires no SQL function or schema update.

Audit reads enrich only the authorized page with employee names/codes from its recorded `userid` and convert source timestamps to explicit UTC for consistent Vietnam-time presentation. Missing `userid` remains unattributed; no actor/IP is invented and no historical audit row or snapshot is rewritten. Audit counters describe records, not user clicks, and all page charts/rankings follow the same filters. Actor names reflect the current employee profile; the original user ID remains available in details. This requires no SQL deployment.

Fraud monitoring reads both existing review cases and latest `REVIEW`/`BLOCK` assessments from the existing transaction detail view. A blocked transfer has no review case by design: it appears as a read-only risk alert, with `reviewcaseid: null`. Only a Pending transaction with a real open REVIEW case can be resolved. Employee branch restrictions still apply. This listing does not create review cases, change risk decisions or post funds, and requires no SQL deployment.
