import type { PoolClient } from 'pg';
import { presentBusinessAuthorization } from './business-authorization';

/** Read-only application query: preserve customer/branch scoping and filter
 * disbursements before pagination/counting, without replacing a DB function. */
export async function listVisibleTransactions(client: PoolClient, args: unknown[]) {
  const result = await client.query<{result: unknown}>(`
WITH f AS (
        SELECT
            v.*
        FROM
            banking.vw_transaction_detail v
        WHERE NOT (v.typecode='DEPOSIT' AND EXISTS (SELECT 1 FROM banking.audit_log a
          WHERE a.entitytype='LOAN_DISBURSEMENT' AND a.action='INSERT'
            AND a.newvalue->>'transactionCode'=v.transactioncode))
          AND ($1::bigint IS NULL
            OR v.initiatedbycustomerid = $1::bigint
            OR EXISTS (
                SELECT
                    1
                FROM
                    banking.transaction_posting p
                    JOIN banking.account_holder h USING (accountid)
                WHERE
                    p.transactionid = v.transactionid
                    AND h.customerid = $1::bigint
                    AND h.status = 'Active'))
            AND ($2::bigint IS NULL
                OR v.sourceaccountid = $2::bigint
                OR v.destinationaccountid = $2::bigint
                OR EXISTS (
                    SELECT
                        1
                    FROM
                        banking.transaction_posting p
                    WHERE
                        p.transactionid = v.transactionid
                        AND p.accountid = $2::bigint))
                AND ($3::text IS NULL
                    OR v.status = $3::text)
                AND ($4::text IS NULL
                    OR v.typecode = $4::text)
                AND ($5::timestamp IS NULL
                    OR v.transactiondate >= $5::timestamp)
                AND ($6::timestamp IS NULL
                    OR v.transactiondate < $6::timestamp)
                AND ($9::integer IS NULL OR EXISTS (
                    SELECT 1
                    FROM banking.transfer_request tr
                    JOIN banking.bank_account ba
                      ON ba.accountid IN (tr.sourceaccountid, tr.destinationaccountid)
                    WHERE tr.transactionid = v.transactionid
                      AND ba.branchid = $9::integer
                ) OR $9::integer IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM banking.transaction_posting tp
                    JOIN banking.bank_account ba USING (accountid)
                    WHERE tp.transactionid = v.transactionid
                      AND ba.branchid = $9::integer
                ))
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        transactiondate DESC,
        transactionid DESC
    LIMIT LEAST (GREATEST ($8::integer, 1), 100)
    OFFSET (GREATEST ($7::integer, 1) - 1) * LEAST (GREATEST ($8::integer, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x)
            ORDER BY transactiondate DESC, transactionid DESC)
            FROM p x), '[]'), 'page', GREATEST ($7::integer, 1), 'pageSize', LEAST (GREATEST ($8::integer, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f)) AS result;
`,args);
  return presentBusinessAuthorization(result.rows[0]?.result);
}
