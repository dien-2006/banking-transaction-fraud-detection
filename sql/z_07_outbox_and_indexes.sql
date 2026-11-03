-- ============================================================================
-- D4 BANK - OUTBOX WORKERS AND OPERATIONAL INDEXES
-- Claim/acknowledgement contracts for Kafka and email delivery workers.
-- ============================================================================

SET search_path TO banking;

-- Kafka transactional-outbox worker contract.
CREATE OR REPLACE FUNCTION banking_api.claim_ready_outbox (p_limit integer DEFAULT 100, p_excluded bigint[] DEFAULT ARRAY[]::bigint[])
    RETURNS SETOF event_outbox
    LANGUAGE sql
    VOLATILE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        e.*
    FROM
        event_outbox e
    WHERE
        e.status IN ('PENDING', 'FAILED')
        AND e.publishedat IS NULL
        AND e.eventoutboxid <> ALL(p_excluded)
    ORDER BY
        e.createdat,
        e.eventoutboxid
    LIMIT LEAST (GREATEST (p_limit, 1), 500)
    FOR UPDATE
        SKIP LOCKED;
$$;

CREATE OR REPLACE FUNCTION banking_api.claim_outbox(p_limit integer DEFAULT 100)
RETURNS SETOF event_outbox LANGUAGE sql VOLATILE SET search_path=banking,pg_temp AS $$
SELECT * FROM banking_api.claim_ready_outbox(p_limit, ARRAY[]::bigint[]);
$$;

CREATE OR REPLACE FUNCTION banking_api.mark_outbox_published (p_id bigint)
    RETURNS VOID
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
BEGIN
    UPDATE
        event_outbox
    SET
        status = 'PUBLISHED',
        publishedat = clock_timestamp()
    WHERE
        eventoutboxid = p_id
        AND status IN ('PENDING', 'FAILED');
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('CONFLICT', 'outbox event is not publishable');
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.mark_outbox_failed (p_id bigint)
    RETURNS VOID
    LANGUAGE sql
    SET search_path = banking, pg_temp
    AS $$
    UPDATE
        event_outbox
    SET
        status = 'FAILED'
    WHERE
        eventoutboxid = p_id
        AND publishedat IS NULL;
$$;

-- Email notification worker contract.
CREATE OR REPLACE FUNCTION banking_api.claim_ready_notifications (p_limit integer DEFAULT 100, p_excluded bigint[] DEFAULT ARRAY[]::bigint[])
    RETURNS SETOF notification_outbox
    LANGUAGE sql
    VOLATILE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        n.*
    FROM
        notification_outbox n
    WHERE
        n.status IN ('PENDING', 'FAILED')
        AND n.sentat IS NULL
        AND n.notificationoutboxid <> ALL(p_excluded)
    ORDER BY
        n.createdat,
        n.notificationoutboxid
    LIMIT LEAST (GREATEST (p_limit, 1), 500)
    FOR UPDATE
        SKIP LOCKED;
$$;

CREATE OR REPLACE FUNCTION banking_api.claim_notifications(p_limit integer DEFAULT 100)
RETURNS SETOF notification_outbox LANGUAGE sql VOLATILE SET search_path=banking,pg_temp AS $$
SELECT * FROM banking_api.claim_ready_notifications(p_limit, ARRAY[]::bigint[]);
$$;

CREATE OR REPLACE FUNCTION banking_api.mark_notification_sent (p_id bigint)
    RETURNS VOID
    LANGUAGE sql
    SET search_path = banking, pg_temp
    AS $$
    UPDATE
        notification_outbox
    SET
        status = 'SENT',
        sentat = clock_timestamp()
    WHERE
        notificationoutboxid = p_id
        AND status IN ('PENDING', 'FAILED');
$$;

CREATE OR REPLACE FUNCTION banking_api.mark_notification_failed (p_id bigint)
    RETURNS VOID
    LANGUAGE sql
    SET search_path = banking, pg_temp
    AS $$
    UPDATE
        notification_outbox
    SET
        status = 'FAILED'
    WHERE
        notificationoutboxid = p_id
        AND sentat IS NULL;
$$;

-- Operational indexes used by API filters and background workers.
CREATE INDEX IF NOT EXISTS idx_transaction_status_date ON bank_transaction (status, transactiondate DESC);

CREATE INDEX IF NOT EXISTS idx_transfer_status_requested ON transfer_request (status, requestedat, transactionid);

CREATE INDEX IF NOT EXISTS idx_review_status_created ON review_case (status, createdat, reviewcaseid);

CREATE INDEX IF NOT EXISTS idx_risk_decision_assessed ON risk_assessment (decision, assessedat, transactionid);

CREATE INDEX IF NOT EXISTS idx_outbox_retry ON event_outbox (status, createdat, eventoutboxid)
WHERE
    publishedat IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_customer_created ON notification_outbox (customerid, createdat DESC);

CREATE INDEX IF NOT EXISTS idx_posting_account_date ON transaction_posting (accountid, postingdate DESC, transactionid);

CREATE INDEX IF NOT EXISTS idx_loan_customer_status ON loan (customerid, status);

CREATE INDEX IF NOT EXISTS idx_schedule_status_due ON repayment_schedule (loanid, status, duedate);

CREATE INDEX IF NOT EXISTS idx_card_customer_status ON card (customerid, status);

CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_log (userid, createdat DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_successful_reversal_original ON bank_transaction (originaltransactionid)
WHERE
    originaltransactionid IS NOT NULL AND status = 'Success';

