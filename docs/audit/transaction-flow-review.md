# Transaction flow review

Scope: customer online transfers; admin/employee counter transfers and movements; risk review, loan-payment and reversal API contracts; shared result screens; committed outbox workers. PostgreSQL tables, constraints and risk thresholds are unchanged.

## Fixed

- Online transfer replay now checks customer, source, recipient, amount, channel, description and transaction type before returning an existing result. Another customer's key cannot disclose their transaction. Counter transfers already enforce this contract.
- Movement/loan-payment replay validates the actual payload and actor/owner. Amounts with more than two decimals, negative/non-finite values are rejected instead of silently rounding.
- Customer transfers require two active VND customer accounts and a receiving primary owner. Deposit/withdrawal/opening-balance requires the proper INTERNAL/CUSTOMER direction. Loan settlements require an internal receiving account. The customer HTTP role cannot use counter withdrawal as an OTP bypass.
- A loan installment cannot accumulate multiple pending payments under different request codes. An exact reversal/review retry returns the existing result; different payload/action still conflicts.
- OTP verification counts attempts, consumes the challenge and creates authorization atomically in Redis. Concurrent requests cannot reset attempts or exchange one challenge multiple times. Authorization validation/consumption is atomic and a mismatched context does not destroy another authorization. Context now includes the transfer description.
- Customer confirmation freezes the source-account snapshot so a background account refresh cannot silently substitute another source.
- Fraud & Review exposes confirmed approve/reject actions to existing authorized staff roles, preserves submitted decisions on retry and displays the bank's actual final result. Approval can still produce Failed when funds are insufficient. Review lists refresh after the dialog closes so filtering does not hide the result prematurely.
- The old full-stack E2E utility used an obsolete unauthenticated, snake-case endpoint. It now uses the staff counter-transfer API with a supplied JWT and requires explicit demo-write opt-in before bootstrap. It was not executed against financial data in this review.

## Existing data finding

Read-only reconciliation of 3,012 stored transactions:

| Group | Records | Success without matching debit/credit totals | Success without completed outbox | Non-success with postings | BLOCK with postings |
| --- | ---: | ---: | ---: | ---: | ---: |
| TXN demo | 3,000 | 1,712 | 2,400 | 112 | 31 |
| Other | 12 | 0 | 0 | 0 | 0 |

Error columns overlap. The 3,000 TXN rows have simulation descriptions. This identifies a historical demo-data inconsistency; it does not establish which individual amounts should be repaired. No historical transaction was deleted, relabeled or backfilled. Existing successful records are immutable, so repair requires a separately agreed reconciliation/demo regeneration plan. Current deferred financial triggers are enabled.

Reproduce with `tests/sql/transaction_integrity_audit.sql` (SELECT only).

## Validation

- Web build and 38 unit/contract tests pass.
- Backend build and 17 tests pass, including real-Redis concurrent wrong-code/verification/authorization tests using unique disposable keys (`RUN_REDIS_INTEGRATION=1`). No email provider called.
- `tests/sql/transaction_flow_rollback.sql` passes on PostgreSQL. It loads the candidate functions in one transaction, substitutes deterministic risk only in that transaction, checks ALLOW/insufficient funds/REVIEW approval and rejection/BLOCK, replay isolation, account direction, review/reversal retry, pending loan installment isolation, loan finalization, injected failure rollback, then forces deferred constraints and ROLLBACKs everything. Identity sequences may advance; no financial records/balances or risk stub persist.
- Browser result matrix: 43 submission/detail cases across three roles, including malformed replies, failures and unchanged retry payloads. Eight review-action cases cover both staff roles, actual Success/Failed/Cancelled results and a 503 retry. All browser financial writes are mocked.

Limitations: no real email OTP delivery or Kafka/Bronze/Gold end-to-end run was performed; no database multi-connection stress test was performed. Outbox publishing remains after commit with at-least-once delivery. Historical demo data remains inconsistent as documented above.

## Local activation

Applied the candidate `z_04_financial_operations.sql` function definitions atomically
on the local PostgreSQL and rebuilt/recreated only `banking-api`. No table,
constraint, historic transaction, volume or other service was reset. The user dev
server was left running. Deployed HTTP smoke checks reject customer counter
withdrawal and review approval (403), malformed decimal input and forged Counter
channel on online transfers (400), before a financial mutation is attempted. Eight Python data/utility contract tests also pass; these mock
network/bootstrap operations and never start the full demo-write E2E utility.
