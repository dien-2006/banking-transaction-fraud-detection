-- ============================================================================
-- D4 BANK - READ API QUERIES
-- JSON read contracts, filtering, pagination, and operational dashboards.
-- ============================================================================

SET search_path TO banking;

CREATE OR REPLACE FUNCTION banking_api.get_customer_profile (p_id bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        to_jsonb (v) - 'username' - 'onlineactive'
    FROM
        vw_customer_detail v
    WHERE
        customerid = p_id;
$$;

CREATE OR REPLACE FUNCTION banking_api.get_customer_accounts (p_id bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        COALESCE(jsonb_agg(to_jsonb (v)
            ORDER BY accountid), '[]')
    FROM
        vw_account_detail v
    WHERE
        customerid = p_id;
$$;

CREATE OR REPLACE FUNCTION banking_api.get_customer_cards (p_id bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        COALESCE(jsonb_agg(to_jsonb (v)
            ORDER BY cardid), '[]')
    FROM
        vw_customer_cards v
    WHERE
        customerid = p_id;
$$;

CREATE OR REPLACE FUNCTION banking_api.get_customer_loans (p_id bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        COALESCE(jsonb_agg(to_jsonb (v)
            ORDER BY loanid), '[]')
    FROM
        vw_customer_loan_detail v
    WHERE
        customerid = p_id;
$$;

CREATE OR REPLACE FUNCTION banking_api.get_transaction (p_id bigint, p_customer bigint DEFAULT NULL, p_branch integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        jsonb_build_object('transaction', to_jsonb (v), 'postings', COALESCE((
                SELECT
                    jsonb_agg(to_jsonb (p)
                ORDER BY postingid)
                FROM transaction_posting p
                WHERE
                    p.transactionid = v.transactionid), '[]'))
    FROM
        vw_transaction_detail v
    WHERE
        v.transactionid = p_id
        AND (p_customer IS NULL
            OR v.initiatedbycustomerid = p_customer
            OR EXISTS (
                SELECT
                    1
                FROM
                    transaction_posting p
                    JOIN account_holder h USING (accountid)
                WHERE
                    p.transactionid = v.transactionid
                    AND h.customerid = p_customer
                    AND h.status = 'Active'))
        AND (p_branch IS NULL OR EXISTS (
            SELECT 1
            FROM transfer_request tr
            JOIN bank_account ba
              ON ba.accountid IN (tr.sourceaccountid, tr.destinationaccountid)
            WHERE tr.transactionid = v.transactionid
              AND ba.branchid = p_branch
        ) OR p_branch IS NOT NULL AND EXISTS (
            SELECT 1
            FROM transaction_posting tp
            JOIN bank_account ba USING (accountid)
            WHERE tp.transactionid = v.transactionid
              AND ba.branchid = p_branch
        ));
$$;

CREATE OR REPLACE FUNCTION banking_api.resolve_transfer_destination (p_account_number text)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        jsonb_build_object('accountId', ba.accountid, 'accountNumber', ba.accountnumber, 'currency', ba.currency, 'accountName', c.fullname, 'bankName', 'D4 Bank')
    FROM
        bank_account ba
        JOIN account_holder ah ON ah.accountid = ba.accountid
            AND ah.status = 'Active'
            AND ah.holdertype = 'PRIMARY_OWNER'
            AND ah.startdate <= CURRENT_DATE
            AND (ah.enddate IS NULL
                OR ah.enddate >= CURRENT_DATE)
        JOIN customer c USING (customerid)
    WHERE
        ba.accountnumber = trim(p_account_number)
        AND ba.status = 'Active'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION banking_api.list_transactions (p_customer bigint DEFAULT NULL, p_account bigint DEFAULT NULL, p_status text DEFAULT NULL, p_type text DEFAULT NULL, p_from timestamp DEFAULT NULL, p_to timestamp DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20, p_branch integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            v.*
        FROM
            vw_transaction_detail v
        WHERE (p_customer IS NULL
            OR v.initiatedbycustomerid = p_customer
            OR EXISTS (
                SELECT
                    1
                FROM
                    transaction_posting p
                    JOIN account_holder h USING (accountid)
                WHERE
                    p.transactionid = v.transactionid
                    AND h.customerid = p_customer
                    AND h.status = 'Active'))
            AND (p_account IS NULL
                OR v.sourceaccountid = p_account
                OR v.destinationaccountid = p_account
                OR EXISTS (
                    SELECT
                        1
                    FROM
                        transaction_posting p
                    WHERE
                        p.transactionid = v.transactionid
                        AND p.accountid = p_account))
                AND (p_status IS NULL
                    OR v.status = p_status)
                AND (p_type IS NULL
                    OR v.typecode = p_type)
                AND (p_from IS NULL
                    OR v.transactiondate >= p_from)
                AND (p_to IS NULL
                    OR v.transactiondate < p_to)
                AND (p_branch IS NULL OR EXISTS (
                    SELECT 1
                    FROM transfer_request tr
                    JOIN bank_account ba
                      ON ba.accountid IN (tr.sourceaccountid, tr.destinationaccountid)
                    WHERE tr.transactionid = v.transactionid
                      AND ba.branchid = p_branch
                ) OR p_branch IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM transaction_posting tp
                    JOIN bank_account ba USING (accountid)
                    WHERE tp.transactionid = v.transactionid
                      AND ba.branchid = p_branch
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
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x)
            ORDER BY transactiondate DESC, transactionid DESC)
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_notifications (p_customer bigint, p_page integer DEFAULT 1, p_size integer DEFAULT 20)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_customer_notifications
        WHERE
            customerid = p_customer
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        createdat DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x)
            ORDER BY createdat DESC)
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.get_employee_profile (p_user integer)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT to_jsonb(v) - 'salary'
    FROM vw_employee_detail v
    WHERE v.userid = p_user;
$$;

CREATE OR REPLACE FUNCTION banking_api.list_employee_notifications (
    p_user integer,
    p_page integer DEFAULT 1,
    p_size integer DEFAULT 20
)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH actor AS (
        SELECT e.branchid
        FROM "system_user" su
        JOIN employee e USING (employeeid)
        WHERE su.userid = p_user
          AND su.isactive
          AND e.status = 'Active'
    ), notices AS (
        SELECT DISTINCT
            'review-' || rc.reviewcaseid AS id,
            'fraud'::text AS type,
            'Giao dịch cần review'::text AS title,
            concat(bt.transactioncode, ' đang chờ kiểm tra và đưa ra quyết định.') AS detail,
            rc.createdat AS createdat,
            CASE
                WHEN ra.risklevel IN ('CRITICAL', 'HIGH') THEN 'Cao'
                ELSE 'Ưu tiên'
            END AS severity,
            TRUE AS unread
        FROM review_case rc
        JOIN bank_transaction bt USING (transactionid)
        JOIN transfer_request tr USING (transactionid)
        JOIN bank_account ba
          ON ba.accountid IN (tr.sourceaccountid, tr.destinationaccountid)
        LEFT JOIN LATERAL (
            SELECT r.risklevel
            FROM risk_assessment r
            WHERE r.transactionid = rc.transactionid
            ORDER BY r.assessedat DESC, r.riskassessmentid DESC
            LIMIT 1
        ) ra ON TRUE
        JOIN actor a ON a.branchid = ba.branchid
        WHERE rc.status IN ('OPEN', 'IN_REVIEW')

        UNION ALL

        SELECT
            'loan-' || l.loanid AS id,
            'loan'::text AS type,
            'Khoản vay chờ xử lý'::text AS title,
            concat(l.loancode, ' của khách hàng #', l.customerid, ' đang chờ xử lý.') AS detail,
            l.startdate::timestamp AS createdat,
            'Bình thường'::text AS severity,
            TRUE AS unread
        FROM loan l
        JOIN actor a ON a.branchid = l.branchid
        WHERE l.status = 'Pending'
    ), paged AS (
        SELECT *
        FROM notices
        ORDER BY createdat DESC, id DESC
        LIMIT LEAST(GREATEST(p_size, 1), 100)
        OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_size, 1), 100)
    )
    SELECT jsonb_build_object(
        'items', COALESCE(
            (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.createdat DESC, p.id DESC) FROM paged p),
            '[]'::jsonb
        ),
        'page', GREATEST(p_page, 1),
        'pageSize', LEAST(GREATEST(p_size, 1), 100),
        'total', (SELECT count(*) FROM notices)
    );
$$;

CREATE OR REPLACE FUNCTION banking_api.list_fraud_reviews (p_status text DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20, p_branch integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_transaction_detail
        WHERE
            reviewcaseid IS NOT NULL
            AND (p_status IS NULL
                OR reviewstatus = p_status)
            AND (p_branch IS NULL OR EXISTS (
                SELECT 1
                FROM transfer_request tr
                JOIN bank_account ba
                  ON ba.accountid IN (tr.sourceaccountid, tr.destinationaccountid)
                WHERE tr.transactionid = vw_transaction_detail.transactionid
                  AND ba.branchid = p_branch
            ))
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        reviewcreatedat DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x)
            ORDER BY reviewcreatedat DESC)
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.admin_dashboard ()
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        jsonb_build_object('customers', (
                SELECT
                    count(*)
                FROM customer), 'activeAccounts', (
                SELECT
                    count(*)
                FROM bank_account
                WHERE
                    status = 'Active'), 'transactionsToday', (
                    SELECT
                        count(*)
                    FROM bank_transaction
                WHERE
                    transactiondate >= CURRENT_DATE), 'successfulAmountToday', (
                    SELECT
                        COALESCE(sum(amount), 0)
                    FROM bank_transaction
                WHERE
                    status = 'Success'
                    AND transactiondate >= CURRENT_DATE), 'openReviews', (
                    SELECT
                        count(*)
                    FROM review_case
                WHERE
                    status IN ('OPEN', 'IN_REVIEW')), 'blockedToday', (
                    SELECT
                        count(*)
                    FROM risk_assessment
                WHERE
                    decision = 'BLOCK'
                    AND assessedat >= CURRENT_DATE), 'pendingOutbox', (
                    SELECT
                        count(*)
                    FROM event_outbox
                WHERE
                    status IN ('PENDING', 'FAILED')));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_customers (p_query text DEFAULT NULL, p_status text DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20, p_branch integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_customer_detail
        WHERE (p_status IS NULL
            OR status = p_status)
        AND (p_query IS NULL
            OR concat_ws(' ', customercode, fullname, phone, email)
            ILIKE '%' || p_query || '%')
        AND (p_branch IS NULL OR EXISTS (
            SELECT 1
            FROM account_holder ah
            JOIN bank_account ba USING (accountid)
            WHERE ah.customerid = vw_customer_detail.customerid
              AND ah.status = 'Active'
              AND ba.branchid = p_branch
        ))
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        customerid DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x) - 'username' - 'onlineactive')
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_employees (p_query text DEFAULT NULL, p_status text DEFAULT NULL, p_branch integer DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_employee_detail
        WHERE (p_status IS NULL
            OR status = p_status)
        AND (p_branch IS NULL
            OR branchid = p_branch)
        AND (p_query IS NULL
            OR concat_ws(' ', employeecode, fullname, email, branchname)
            ILIKE '%' || p_query || '%')
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        employeeid DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x))
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_accounts (p_query text DEFAULT NULL, p_status text DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20, p_branch integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_account_detail
        WHERE (p_status IS NULL
            OR status = p_status)
        AND (p_query IS NULL
            OR concat_ws(' ', accountnumber, branchname, accounttypename)
            ILIKE '%' || p_query || '%')
        AND (p_branch IS NULL OR branchid = p_branch)
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        accountid DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x))
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_audit_logs (p_user integer DEFAULT NULL, p_action text DEFAULT NULL, p_from timestamp DEFAULT NULL, p_to timestamp DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            auditid, userid, entitytype, entityid, action,
            oldvalue - ARRAY['pinhash','cardnumber','passwordhash'] AS oldvalue,
            newvalue - ARRAY['pinhash','cardnumber','passwordhash'] AS newvalue,
            ipaddress, createdat
        FROM
            audit_log
        WHERE (p_user IS NULL
            OR userid = p_user)
        AND (p_action IS NULL
            OR action = p_action)
        AND (p_from IS NULL
            OR createdat >= p_from)
        AND (p_to IS NULL
            OR createdat < p_to)
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        createdat DESC,
        auditid DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x))
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_branches (p_query text DEFAULT NULL, p_status text DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_branch_summary
        WHERE (p_status IS NULL
            OR status = p_status)
        AND (p_query IS NULL
            OR concat_ws(' ', branchcode, branchname, address, city, phone)
            ILIKE '%' || p_query || '%')
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        branchid DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x))
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_cards (p_customer bigint DEFAULT NULL, p_account bigint DEFAULT NULL, p_status text DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20, p_branch integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_customer_cards
        WHERE (p_customer IS NULL
            OR customerid = p_customer)
        AND (p_account IS NULL
            OR accountid = p_account)
        AND (p_status IS NULL
            OR status = p_status)
        AND (p_branch IS NULL OR EXISTS (
            SELECT 1
            FROM bank_account ba
            WHERE ba.accountid = vw_customer_cards.accountid
              AND ba.branchid = p_branch
        ))
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        cardid DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x))
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.list_loans (p_customer bigint DEFAULT NULL, p_status text DEFAULT NULL, p_branch integer DEFAULT NULL, p_page integer DEFAULT 1, p_size integer DEFAULT 20)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH f AS (
        SELECT
            *
        FROM
            vw_customer_loan_detail
        WHERE (p_customer IS NULL
            OR customerid = p_customer)
        AND (p_status IS NULL
            OR status = p_status)
        AND (p_branch IS NULL
            OR branchid = p_branch)
),
p AS (
    SELECT
        *
    FROM
        f
    ORDER BY
        loanid DESC
    LIMIT LEAST (GREATEST (p_size, 1), 100)
    OFFSET (GREATEST (p_page, 1) - 1) * LEAST (GREATEST (p_size, 1), 100))
SELECT
    jsonb_build_object('items', COALESCE((
            SELECT
                jsonb_agg(to_jsonb (x))
            FROM p x), '[]'), 'page', GREATEST (p_page, 1), 'pageSize', LEAST (GREATEST (p_size, 1), 100), 'total', (
        SELECT
            count(*)
        FROM f));
$$;

CREATE OR REPLACE FUNCTION banking_api.get_loan_schedule (p_loan bigint, p_customer bigint DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        COALESCE(jsonb_agg(to_jsonb (rs)
            ORDER BY rs.installmentno), '[]')
    FROM
        repayment_schedule rs
        JOIN loan l USING (loanid)
    WHERE
        rs.loanid = p_loan
        AND (p_customer IS NULL
            OR l.customerid = p_customer);
$$;

CREATE OR REPLACE FUNCTION banking_api.list_customer_devices (p_customer bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        COALESCE(jsonb_agg(to_jsonb (d)
            ORDER BY d.lastseenat DESC NULLS LAST, d.deviceid DESC), '[]')
    FROM
        customer_device d
    WHERE
        d.customerid = p_customer;
$$;

CREATE OR REPLACE FUNCTION banking_api.get_reference_data ()
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        jsonb_build_object('branches', COALESCE((
                SELECT
                    jsonb_agg(jsonb_build_object('id', branchid, 'code', branchcode, 'name', branchname)
                ORDER BY branchname)
                FROM branch
                WHERE
                    status = 'Active'), '[]'), 'roles', COALESCE((
                SELECT
                    jsonb_agg(jsonb_build_object('id', roleid, 'name', rolename)
                    ORDER BY rolename)
                FROM role
                WHERE
                    status = 'Active'), '[]'), 'accountTypes', COALESCE((
                SELECT
                    jsonb_agg(jsonb_build_object('id', accounttypeid, 'name', typename, 'minimumBalance', minbalance, 'interestRate', interestrate)
                    ORDER BY typename)
                FROM account_type
            WHERE
                status = 'Active'), '[]'), 'loanTypes', COALESCE((
            SELECT
                jsonb_agg(jsonb_build_object('id', loantypeid, 'name', loantypename, 'maximumAmount', maxamount, 'defaultInterestRate', defaultinterestrate, 'maximumTermMonths', maxtermmonths)
                ORDER BY loantypename)
            FROM loan_type
        WHERE
            status = 'Active'), '[]'), 'transactionTypes', COALESCE((
        SELECT
            jsonb_agg(jsonb_build_object('id', transactiontypeid, 'code', typecode, 'name', typename)
            ORDER BY typename)
        FROM transaction_type
    WHERE
        status = 'Active'), '[]'));
$$;

CREATE OR REPLACE FUNCTION banking_api.customer_dashboard (p_customer bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        jsonb_build_object('profile', banking_api.get_customer_profile (p_customer), 'totalBalance', COALESCE((
                SELECT
                    sum(ba.balance)
                FROM bank_account ba
                JOIN account_holder ah USING (accountid)
                WHERE
                    ah.customerid = p_customer
                    AND ah.status = 'Active'
                    AND ba.status = 'Active'), 0), 'activeAccountCount', (
                SELECT
                    count(*)
                FROM bank_account ba
                JOIN account_holder ah USING (accountid)
                WHERE
                    ah.customerid = p_customer
                    AND ah.status = 'Active'
                    AND ba.status = 'Active'), 'activeLoanCount', (
                    SELECT
                        count(*)
                    FROM loan
                WHERE
                    customerid = p_customer
                    AND status = 'Active'), 'unreadNotificationCount', (
                    SELECT
                        count(*)
                    FROM notification_outbox
                WHERE
                    customerid = p_customer
                    AND status = 'PENDING'), 'recentTransactions', (banking_api.list_transactions (p_customer, NULL, NULL, NULL, NULL, NULL, 1, 5, NULL) -> 'items'));
$$;

CREATE OR REPLACE FUNCTION banking_api.branch_dashboard (p_branch integer, p_from timestamp DEFAULT date_trunc('month', CURRENT_TIMESTAMP), p_to timestamp DEFAULT CURRENT_TIMESTAMP)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    WITH branch_accounts AS (
        SELECT
            accountid
        FROM
            bank_account
        WHERE
            branchid = p_branch
),
tx AS (
    SELECT
        bt.transactionid,
        bt.amount,
        bt.status
    FROM
        bank_transaction bt
    WHERE
        bt.transactiondate >= p_from
        AND bt.transactiondate < p_to
        AND (
            EXISTS (
                SELECT 1
                FROM transfer_request tr
                JOIN branch_accounts ba
                  ON ba.accountid IN (tr.sourceaccountid, tr.destinationaccountid)
                WHERE tr.transactionid = bt.transactionid
            )
            OR EXISTS (
                SELECT 1
                FROM transaction_posting tp
                JOIN branch_accounts ba USING (accountid)
                WHERE tp.transactionid = bt.transactionid
            )
        )
),
risky AS (
    SELECT DISTINCT
        ra.transactionid
    FROM
        risk_assessment ra
        JOIN tx USING (transactionid)
    WHERE
        ra.decision IN ('REVIEW', 'BLOCK'))
SELECT
    jsonb_build_object('branch', (
            SELECT
                to_jsonb (v)
            FROM vw_branch_summary v
        WHERE
            branchid = p_branch), 'transactionCount', (
            SELECT
                count(*)
            FROM tx), 'successfulAmount', (
            SELECT
                COALESCE(sum(amount), 0)
            FROM tx
        WHERE
            status = 'Success'), 'riskyTransactionCount', (
            SELECT
                count(*)
            FROM risky), 'activeLoanCount', (
            SELECT
                count(*)
            FROM loan
        WHERE
            branchid = p_branch
            AND status = 'Active'), 'openReviewCount', (
            SELECT
                count(*)
            FROM review_case rc
            JOIN bank_transaction bt USING (transactionid)
        WHERE
            rc.status IN ('OPEN', 'IN_REVIEW')
            AND EXISTS (
                SELECT 1
                FROM tx
                WHERE tx.transactionid = bt.transactionid
            )));
$$;

-- Remove obsolete overloads left by earlier installations. These signatures
-- were replaced by branch-aware versions above; no table data is affected.
DROP FUNCTION IF EXISTS banking_api.get_transaction (bigint, bigint);
DROP FUNCTION IF EXISTS banking_api.list_transactions (bigint, bigint, text, text, timestamp, timestamp, integer, integer);
DROP FUNCTION IF EXISTS banking_api.list_fraud_reviews (text, integer, integer);
DROP FUNCTION IF EXISTS banking_api.list_customers (text, text, integer, integer);
DROP FUNCTION IF EXISTS banking_api.list_accounts (text, text, integer, integer);
DROP FUNCTION IF EXISTS banking_api.list_cards (bigint, bigint, text, integer, integer);

