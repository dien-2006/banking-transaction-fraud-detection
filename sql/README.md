# SQL application layer

`create_table.sql` is the unchanged 29-table source schema. The `z_*.sql`
files replace the old supplemental SQL and are safe to apply over an existing
database: they do not truncate or delete business data.

## PostgreSQL execution order

Run each file as a complete script in DBeaver, in this order:

1. `z_01_foundation.sql` - API schema, authentication helpers and required reference rows.
2. `z_02_views.sql` - reusable operational views.
3. `z_03_integrity.sql` - audit, account-history and deferred integrity triggers.
4. `z_04_financial_operations.sql` - transfer, deposit, withdrawal, opening balance,
   loan payment, review resolution and reversal.
5. `z_05_management_operations.sql` - branch, customer, employee, account, device,
   card and loan management.
6. `z_06_api_queries.sql` - detail, search, pagination and dashboard queries.
7. `z_07_outbox_and_indexes.sql` - outbox worker contract and operational indexes.

Do not run `create_table.sql` again when the 29 tables and data already exist.
Do not run `trino/gold_analytics.sql` on PostgreSQL; run it from a Trino connection
only after the Gold external tables have been registered.

## Transaction boundary

NestJS calls one `banking_api.*` function inside one PostgreSQL transaction.
The financial functions lock involved accounts with `FOR UPDATE`, write the
transaction, balanced postings, balances, risk result, notification and
`event_outbox` before the same commit. An `ALLOW` decision can still finish as
`Failed` when the locked balance is insufficient.

The Kafka producer never publishes from a database trigger. It claims committed
rows with `banking_api.claim_outbox`, publishes them, then marks them through
`banking_api.mark_outbox_published`. Consumers must deduplicate by
`eventoutboxid` or `eventkey`, because transactional outbox delivery is
at-least-once.

Batch ETL continues reading the configured base tables from PostgreSQL. The
committed data remains in PostgreSQL; the API views do not replace or move it.

## Smoke queries after installation

```sql
SELECT banking_api.health();
SELECT banking_api.get_reference_data();
SELECT banking_api.admin_dashboard();
SELECT banking_api.list_transactions(NULL,NULL,NULL,NULL,NULL,NULL,1,20);
```

Use real account/customer IDs for write tests. Execute each write test inside a
manual transaction first so it can be inspected and rolled back:

```sql
BEGIN;
SELECT banking_api.create_transfer(
  1, 101, 102, 100000, 'manual-test-001',
  'InternetBanking', NULL, '127.0.0.1', 'DBeaver smoke test'
);
ROLLBACK;
```
