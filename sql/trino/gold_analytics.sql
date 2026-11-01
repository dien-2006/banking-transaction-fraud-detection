-- ============================================================================
-- D4 BANK - TRINO GOLD ANALYTICS
-- Execute with Trino only after the hive.gold external tables are registered.
-- ============================================================================

-- Daily transaction volume and value.
CREATE OR REPLACE VIEW hive.gold.vw_transaction_daily_summary AS
SELECT
    d.full_date,
    t.channel_key,
    t.transaction_type_key,
    t.status,
    count(*) AS transaction_count,
    sum(t.amount) AS total_amount,
    sum(t.fee) AS total_fee
FROM
    hive.gold.fact_transaction t
    JOIN hive.gold.dim_date d ON d.date_key = t.date_key
GROUP BY
    d.full_date,
    t.channel_key,
    t.transaction_type_key,
    t.status;

-- Daily risk decisions and model probability.
CREATE OR REPLACE VIEW hive.gold.vw_risk_daily_summary AS
SELECT
    d.full_date,
    r.risk_level,
    r.decision,
    count(*) AS assessment_count,
    avg(r.rule_score) AS average_rule_score,
    avg(r.model_probability) AS average_model_probability
FROM
    hive.gold.fact_risk_assessment r
    JOIN hive.gold.dim_date d ON d.date_key = r.date_key
GROUP BY
    d.full_date,
    r.risk_level,
    r.decision;

-- Fraud-review volume and resolution time.
CREATE OR REPLACE VIEW hive.gold.vw_review_performance AS
SELECT
    d.full_date,
    r.status,
    count(*) AS review_count,
    avg(date_diff ('second', r.created_at, r.reviewed_at)) AS average_resolution_seconds
FROM
    hive.gold.fact_fraud_review r
    JOIN hive.gold.dim_date d ON d.date_key = r.created_date_key
GROUP BY
    d.full_date,
    r.status;

-- Model performance grouped by the latest curated fraud label.
CREATE OR REPLACE VIEW hive.gold.vw_model_performance AS
WITH latest_label AS (
    SELECT
        transaction_id,
        label,
        labeled_at,
        row_number() OVER (PARTITION BY transaction_id ORDER BY labeled_at DESC,
            fraud_label_event_id DESC) AS rn
    FROM
        hive.gold.fact_fraud_label_event
),
latest_risk AS (
    SELECT
        r.*,
        row_number() OVER (
            PARTITION BY transaction_id
            ORDER BY assessed_at DESC, risk_assessment_id DESC
        ) AS rn
    FROM
        hive.gold.fact_risk_assessment r
)
SELECT
    m.model_key,
    m.model_name,
    m.model_type,
    l.label,
    count(*) AS labeled_transactions,
    avg(r.model_probability) AS average_probability
FROM
    latest_risk r
    JOIN hive.gold.dim_model m ON m.model_key = r.model_key
    JOIN latest_label l ON l.transaction_id = r.transaction_id
        AND l.rn = 1
WHERE
    r.rn = 1
GROUP BY
    m.model_key,
    m.model_name,
    m.model_type,
    l.label;

-- Login activity by status.
CREATE OR REPLACE VIEW hive.gold.vw_login_daily_summary AS
SELECT
    d.full_date,
    l.status,
    count(*) AS login_count,
    count(DISTINCT l.customer_key) AS customer_count
FROM
    hive.gold.fact_login_event l
    JOIN hive.gold.dim_date d ON d.date_key = l.date_key
GROUP BY
    d.full_date,
    l.status;

-- Daily loan-payment reconciliation.
CREATE OR REPLACE VIEW hive.gold.vw_loan_payment_daily_summary AS
SELECT
    d.full_date,
    p.payment_channel,
    count(*) AS payment_count,
    sum(p.amount_paid) AS total_paid,
    sum(p.principal_paid) AS principal_paid,
    sum(p.interest_paid) AS interest_paid,
    sum(p.penalty_fee) AS penalty_fee
FROM
    hive.gold.fact_loan_payment p
    JOIN hive.gold.dim_date d ON d.date_key = p.date_key
GROUP BY
    d.full_date,
    p.payment_channel;

