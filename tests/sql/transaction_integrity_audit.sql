-- Read-only reconciliation. Counts can overlap: do not sum error columns.
WITH evidence AS (
    SELECT t.transactionid, t.transactioncode, t.status, t.amount,
        COALESCE(sum(p.amount) FILTER (WHERE p.postingtype='DEBIT'),0) AS debit,
        COALESCE(sum(p.amount) FILTER (WHERE p.postingtype='CREDIT'),0) AS credit,
        count(p.postingid) AS postings,
        EXISTS (SELECT 1 FROM banking.event_outbox e
            WHERE e.aggregateid=t.transactionid::text AND e.eventtype='TransactionCompleted') AS completed_event,
        EXISTS (SELECT 1 FROM banking.risk_assessment r
            WHERE r.transactionid=t.transactionid AND r.decision='BLOCK') AS blocked
    FROM banking.bank_transaction t
    LEFT JOIN banking.transaction_posting p USING(transactionid)
    GROUP BY t.transactionid
)
SELECT CASE WHEN transactioncode LIKE 'TXN%' THEN 'TXN demo' ELSE 'other' END AS code_group,
    count(*) AS transactions,
    count(*) FILTER (WHERE status='Success' AND (debit<>amount OR credit<>amount)) AS success_without_balanced_postings,
    count(*) FILTER (WHERE status='Success' AND NOT completed_event) AS success_without_completed_event,
    count(*) FILTER (WHERE status<>'Success' AND postings>0) AS non_success_with_postings,
    count(*) FILTER (WHERE blocked AND postings>0) AS blocked_with_postings
FROM evidence GROUP BY 1 ORDER BY 1;
