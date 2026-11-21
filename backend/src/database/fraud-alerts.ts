import type { PoolClient } from 'pg';
import { presentBusinessAuthorization } from './business-authorization';

/** BLOCK creates an alert, not a manual review case. Read both kinds without
 * creating fake cases, changing risk decisions or widening employee scope. */
export async function listFraudAlerts(client: PoolClient, args: unknown[]) {
  const result = await client.query(`WITH filtered AS (
    SELECT v.*,rc.reason AS reviewreason,
      CASE WHEN v.reviewcaseid IS NULL THEN 'RISK_ALERT' ELSE 'REVIEW' END AS record_kind,
      COALESCE(v.reviewcreatedat,v.assessedat,v.transactiondate) AS alert_at
    FROM banking.vw_transaction_detail v
    LEFT JOIN banking.review_case rc ON rc.reviewcaseid=v.reviewcaseid
    WHERE (v.reviewcaseid IS NOT NULL OR v.decision IN ('REVIEW','BLOCK'))
      AND ($1::text IS NULL OR v.reviewstatus=$1::text OR ($1::text='__blocked' AND v.decision='BLOCK'))
      AND ($4::integer IS NULL OR EXISTS (
        SELECT 1 FROM banking.transfer_request tr JOIN banking.bank_account a
          ON a.accountid IN (tr.sourceaccountid,tr.destinationaccountid)
        WHERE tr.transactionid=v.transactionid AND a.branchid=$4::integer
      ))
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY alert_at DESC,transactionid DESC
    LIMIT LEAST(GREATEST($3::integer,1),100)
    OFFSET (GREATEST($2::integer,1)-1)*LEAST(GREATEST($3::integer,1),100)
  ) SELECT jsonb_build_object(
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY alert_at DESC,transactionid DESC) FROM page_rows p),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'page',GREATEST($2::integer,1),'pageSize',LEAST(GREATEST($3::integer,1),100)
  ) AS result`, args);
  return presentBusinessAuthorization(result.rows[0].result);
}
