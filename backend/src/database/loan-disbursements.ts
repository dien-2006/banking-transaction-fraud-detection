import type { PoolClient } from 'pg';

/** Enrich only the loan IDs already authorized and paginated by list_loans. */
export async function attachLoanDisbursements(client: PoolClient, page: unknown): Promise<void> {
  if (!page || typeof page !== 'object' || !('items' in page) || !Array.isArray(page.items)) return;
  const items = page.items as Record<string, unknown>[];
  if (!items.length) return;
  const result = await client.query(`SELECT l.loanid, d.disbursement
    FROM banking.loan l
    LEFT JOIN LATERAL (
      SELECT banking_api.transaction_result(t.transactionid) AS disbursement
      FROM banking.bank_transaction t JOIN banking.transaction_type tt USING(transactiontypeid)
      WHERE t.description=concat('LOAN_DISBURSEMENT|',l.loanid)
        AND t.initiatedbycustomerid=l.customerid AND tt.typecode='DEPOSIT'
      ORDER BY t.transactionid DESC LIMIT 1
    ) d ON true
    WHERE l.loanid=ANY($1::bigint[])`, [items.map(row => row.loanid)]);
  const byId = new Map(result.rows.map(row => [String(row.loanid), row.disbursement]));
  for (const row of items) row.disbursement = byId.get(String(row.loanid)) ?? null;
}
