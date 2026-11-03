-- ============================================================================
-- D4 BANK - FINANCIAL OPERATIONS
-- Risk decisions, balanced posting, transfers, reviews, loans, and reversals.
-- ============================================================================

SET search_path TO banking;

-- One policy function shared by scoring and boundary tests.
CREATE OR REPLACE FUNCTION banking_api.risk_decision(p_score integer, p_probability numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_score IS NULL OR p_score NOT BETWEEN 0 AND 100
       OR p_probability IS NULL OR p_probability::text IN ('NaN','Infinity','-Infinity')
       OR p_probability NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'VALIDATION:invalid risk inputs';
    END IF;
    RETURN CASE WHEN p_probability >= 0.90 OR p_score >= 80 THEN 'BLOCK'
                WHEN p_probability >= 0.60 OR p_score >= 60 THEN 'REVIEW'
                ELSE 'ALLOW' END;
END;
$$;

-- Risk feature calculation and ALLOW / REVIEW / BLOCK decision.
CREATE OR REPLACE FUNCTION banking_api.calculate_risk (p_customer_id bigint, p_device_id bigint, p_amount numeric(19, 2), p_at timestamp DEFAULT clock_timestamp())
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_new boolean;
    v_velocity integer;
    v_failed integer;
    v_avg numeric;
    v_ratio numeric;
    v_score integer := 0;
    v_rules jsonb := '[]';
    v_logit double precision;
    v_probability numeric(8, 6);
    v_level text;
    v_decision text;
    v_model jsonb;
    v_weights jsonb;
BEGIN
    IF p_amount <= 0 THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'amount must be positive');
    END IF;
    v_new := p_device_id IS NULL
        OR NOT EXISTS (
            SELECT
                1
            FROM
                customer_device
            WHERE
                customerid = p_customer_id
                AND deviceid = p_device_id
                AND status = 'Active'
                AND istrusted);
    SELECT
        count(*) FILTER (WHERE transactiondate >= p_at - interval '10 minutes')::integer,
        avg(amount) FILTER (WHERE status = 'Success'
            AND transactiondate >= p_at - interval '30 days')
    INTO
        v_velocity,
        v_avg
    FROM
        bank_transaction
    WHERE
        initiatedbycustomerid = p_customer_id
        AND transactiondate < p_at;
    SELECT
        count(*)::integer
    INTO
        v_failed
    FROM
        login_event
    WHERE
        customerid = p_customer_id
        AND status IN ('Failed', 'Blocked')
        AND logintime >= p_at - interval '30 minutes'
        AND logintime < p_at;
    v_velocity := COALESCE(v_velocity, 0);
    v_failed := COALESCE(v_failed, 0);
    v_ratio := CASE WHEN COALESCE(v_avg, 0) > 0 THEN
        p_amount / v_avg
    ELSE
        1
    END;
    IF p_amount >= 50000000 THEN
        v_score := v_score + 20;
        v_rules := v_rules || '"R01_HIGH_AMOUNT"'::jsonb;
    END IF;
    IF v_new THEN
        v_score := v_score + 20;
        v_rules := v_rules || '"R02_NEW_DEVICE"'::jsonb;
    END IF;
    IF extract(hour FROM p_at) < 5 THEN
        v_score := v_score + 10;
        v_rules := v_rules || '"R03_UNUSUAL_TIME"'::jsonb;
    END IF;
    IF v_velocity >= 5 THEN
        v_score := v_score + 25;
        v_rules := v_rules || '"R04_HIGH_VELOCITY"'::jsonb;
    END IF;
    IF v_failed >= 5 THEN
        v_score := v_score + 15;
        v_rules := v_rules || '"R05_FAILED_LOGIN"'::jsonb;
    END IF;
    IF COALESCE(v_avg, 0) > 0 AND p_amount >= v_avg * 5 THEN
        v_score := v_score + 20;
        v_rules := v_rules || '"R06_AMOUNT_ANOMALY"'::jsonb;
    END IF;
    v_score := LEAST (100, v_score);
    v_model := NULLIF(current_setting('app.fraud_model', true), '')::jsonb;
    v_weights := v_model -> 'weights';
    IF v_model IS NULL OR v_weights IS NULL THEN
        PERFORM banking_api.raise_error('CONFIGURATION', 'validated model context is required');
    END IF;
    v_logit := (v_model->>'intercept')::double precision
        + (v_weights->>'amount_log')::double precision * (ln(1+p_amount::double precision)/20.0)
        + (v_weights->>'is_new_device')::double precision * CASE WHEN v_new THEN 1 ELSE 0 END
        + (v_weights->>'is_unusual_time')::double precision * CASE WHEN extract(hour FROM p_at)<5 THEN 1 ELSE 0 END
        + (v_weights->>'transactions_last_10m')::double precision * v_velocity
        + (v_weights->>'failed_logins_last_30m')::double precision * v_failed
        + (v_weights->>'amount_to_average_ratio')::double precision * v_ratio::double precision;
    IF v_logit IS NULL OR v_logit::text IN ('NaN','Infinity','-Infinity') THEN
        PERFORM banking_api.raise_error('CONFIGURATION', 'invalid model coefficients');
    END IF;
    v_probability := round((1 / (1 + exp(- GREATEST (-40.0, LEAST (40.0, v_logit)))))::numeric, 6);
    v_level := CASE WHEN v_score >= 80 THEN
        'CRITICAL'
    WHEN v_score >= 60 THEN
        'HIGH'
    WHEN v_score >= 40 THEN
        'MEDIUM'
    ELSE
        'LOW'
    END;
    v_decision := banking_api.risk_decision(v_score, v_probability);
    RETURN jsonb_build_object('ruleScore', v_score, 'riskLevel', v_level, 'modelProbability', v_probability, 'decision', v_decision, 'triggeredRules', v_rules, 'modelArtifactVersion', v_model->>'version', 'features', jsonb_build_object('isNewDevice', v_new, 'transactionsLast10m', v_velocity, 'failedLoginsLast30m', v_failed, 'averageAmount30d', COALESCE(v_avg, 0), 'amountToAverageRatio', v_ratio));
END;
$$;

-- Shared result, event, assessment, and balanced-posting helpers.
CREATE OR REPLACE FUNCTION banking_api.transaction_result (p_id bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = banking, pg_temp
    AS $$
    SELECT
        to_jsonb (v)
    FROM
        vw_transaction_detail v
    WHERE
        transactionid = p_id;
$$;

CREATE OR REPLACE FUNCTION banking_api.emit_event (p_transaction_id bigint, p_event_type text, p_payload jsonb)
    RETURNS VOID
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
BEGIN
    INSERT INTO event_outbox (eventkey, aggregatetype, aggregateid, eventtype, payloadjson)
        VALUES (lower(p_event_type) || ':' || p_transaction_id, 'BANK_TRANSACTION', p_transaction_id::text, p_event_type, p_payload)
    ON CONFLICT (eventkey)
        DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.assess_transaction (p_transaction_id bigint, p_customer_id bigint, p_device_id bigint, p_amount numeric)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v jsonb;
    v_model bigint;
    v_artifact jsonb;
    v_at timestamp;
BEGIN
    SELECT transactiondate INTO STRICT v_at FROM bank_transaction WHERE transactionid=p_transaction_id;
    v := banking_api.calculate_risk (p_customer_id, p_device_id, p_amount, v_at);
    v_artifact := NULLIF(current_setting('app.fraud_model',true),'')::jsonb;
    SELECT
        modelversionid
    INTO
        v_model
    FROM
        model_version
    WHERE
        status = 'ACTIVE' AND modelversionid=(v_artifact->>'modelVersionId')::bigint
    ORDER BY
        createdat DESC,
        modelversionid DESC
    LIMIT 1;
    IF v_model IS NULL THEN
        PERFORM
            banking_api.raise_error ('CONFIGURATION', 'no ACTIVE model');
    END IF;
    INSERT INTO risk_assessment (transactionid, modelversionid, rulescore, risklevel, modelprobability, decision, reasonjson)
        VALUES (p_transaction_id, v_model, (v ->> 'ruleScore')::smallint, v ->> 'riskLevel', (v ->> 'modelProbability')::numeric, v ->> 'decision', jsonb_build_object('triggered_rules', v -> 'triggeredRules', 'features', v -> 'features', 'model_artifact_version', v_artifact->>'version'));
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.post_balanced_transaction (p_transaction_id bigint, p_debit bigint, p_credit bigint, p_amount numeric, p_customer bigint DEFAULT NULL, p_check_owner boolean DEFAULT FALSE)
    RETURNS text
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    vd RECORD;
    vc RECORD;
    vt RECORD;
    v_decision text;
    v_type text;
BEGIN
    IF p_amount <= 0 OR p_debit = p_credit THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid posting accounts or amount');
    END IF;
    SELECT
        *
    INTO
        vt
    FROM
        bank_transaction
    WHERE
        transactionid = p_transaction_id
    FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'transaction not found');
    END IF;
    IF vt.status <> 'Pending' THEN
        RETURN vt.status;
    END IF;
    SELECT typecode INTO v_type FROM transaction_type WHERE transactiontypeid=vt.transactiontypeid;
    IF v_type = 'REVERSAL' THEN
        IF NOT EXISTS (SELECT 1 FROM bank_transaction WHERE transactionid=vt.originaltransactionid AND status='Success') THEN
            PERFORM banking_api.raise_error('FORBIDDEN','reversal requires a successful original transaction');
        END IF;
    ELSE
        SELECT decision INTO v_decision FROM risk_assessment
        WHERE transactionid=p_transaction_id ORDER BY assessedat DESC,riskassessmentid DESC LIMIT 1;
        IF v_decision IS DISTINCT FROM 'ALLOW' AND NOT (
            COALESCE(v_decision='REVIEW',FALSE) AND EXISTS (SELECT 1 FROM review_case WHERE transactionid=p_transaction_id AND status='APPROVED')
        ) THEN
            PERFORM banking_api.raise_error('FORBIDDEN','financial posting requires ALLOW or approved REVIEW');
        END IF;
    END IF;
    PERFORM
        accountid
    FROM
        bank_account
    WHERE
        accountid IN (p_debit, p_credit)
    ORDER BY
        accountid
    FOR NO KEY UPDATE;
    SELECT
        ba.accountid,
        ba.balance,
        ba.status,
        at.minbalance
    INTO
        vd
    FROM
        bank_account ba
        JOIN account_type at USING (accounttypeid)
    WHERE
        ba.accountid = p_debit;
    SELECT
        ba.accountid,
        ba.balance,
        ba.status,
        at.minbalance
    INTO
        vc
    FROM
        bank_account ba
        JOIN account_type at USING (accounttypeid)
    WHERE
        ba.accountid = p_credit;
    IF vd.accountid IS NULL OR vc.accountid IS NULL THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'account not found');
    END IF;
    IF vd.status <> 'Active' OR vc.status <> 'Active' THEN
        PERFORM
            banking_api.raise_error ('ACCOUNT_INACTIVE', 'account is not active');
    END IF;
    IF p_check_owner AND NOT EXISTS (
        SELECT
            1
        FROM
            account_holder
        WHERE
            accountid = p_debit AND customerid = p_customer AND status = 'Active' AND startdate <= CURRENT_DATE AND (enddate IS NULL OR enddate >= CURRENT_DATE)) THEN
        PERFORM
            banking_api.raise_error ('FORBIDDEN', 'customer does not own debit account');
    END IF;
    IF vd.balance - p_amount < vd.minbalance THEN
        UPDATE
            bank_transaction
        SET
            status = 'Failed'
        WHERE
            transactionid = p_transaction_id;
        UPDATE
            transfer_request
        SET
            status = 'Failed'
        WHERE
            transactionid = p_transaction_id;
        PERFORM
            banking_api.emit_event (p_transaction_id, 'TransactionFailed', jsonb_build_object('transaction_id', p_transaction_id, 'reason', 'INSUFFICIENT_BALANCE'));
        IF vt.initiatedbycustomerid IS NOT NULL THEN
            INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
                VALUES (vt.initiatedbycustomerid, p_transaction_id, 'TRANSACTION_FAILED');
        END IF;
        RETURN 'Failed';
    END IF;
    INSERT INTO transaction_posting (transactionid, accountid, postingtype, amount)
    VALUES
        (p_transaction_id, p_debit, 'DEBIT', p_amount),
        (p_transaction_id, p_credit, 'CREDIT', p_amount);
    UPDATE
        bank_account
    SET
        balance = balance - p_amount
    WHERE
        accountid = p_debit;
    UPDATE
        bank_account
    SET
        balance = balance + p_amount
    WHERE
        accountid = p_credit;
    UPDATE
        transfer_request
    SET
        status = 'Completed'
    WHERE
        transactionid = p_transaction_id;
    PERFORM
        banking_api.emit_event (p_transaction_id, 'TransactionCompleted', jsonb_build_object('transaction_id', p_transaction_id, 'transaction_code', vt.transactioncode, 'status', 'Success', 'amount', vt.amount, 'currency', vt.currency, 'channel', vt.channel, 'customer_id', vt.initiatedbycustomerid));
    UPDATE
        bank_transaction
    SET
        status = 'Success'
    WHERE
        transactionid = p_transaction_id;
    IF vt.initiatedbycustomerid IS NOT NULL THEN
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
            VALUES (vt.initiatedbycustomerid, p_transaction_id, 'TRANSACTION_COMPLETED');
    END IF;
    RETURN 'Success';
END;
$$;

-- Customer account-to-account transfer.
CREATE OR REPLACE FUNCTION banking_api.create_transfer (p_customer bigint, p_source bigint, p_destination bigint, p_amount numeric, p_idempotency varchar(100), p_channel varchar(30), p_device bigint DEFAULT NULL, p_ip varchar(45) DEFAULT NULL, p_description varchar(255) DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_existing RECORD;
    v_type integer;
    v_id bigint;
    v_risk jsonb;
    v_code text;
BEGIN
    IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_amount <= 0 OR p_amount <> round(p_amount, 2)
       OR p_source = p_destination OR NULLIF (trim(p_idempotency), '') IS NULL THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid transfer or idempotency key');
    END IF;
    PERFORM
        pg_advisory_xact_lock(hashtextextended(p_idempotency, 0));
    SELECT tr.*, bt.description, bt.channel, tt.typecode
    INTO v_existing
    FROM transfer_request tr
    JOIN bank_transaction bt USING (transactionid)
    JOIN transaction_type tt USING (transactiontypeid)
    WHERE tr.idempotencykey = p_idempotency;
    IF FOUND THEN
        IF v_existing.customerid IS DISTINCT FROM p_customer THEN
            PERFORM banking_api.raise_error('FORBIDDEN', 'idempotency key belongs to another customer');
        END IF;
        IF v_existing.sourceaccountid IS DISTINCT FROM p_source
           OR v_existing.destinationaccountid IS DISTINCT FROM p_destination
           OR v_existing.amount IS DISTINCT FROM p_amount
           OR v_existing.channel IS DISTINCT FROM p_channel
           OR v_existing.description IS DISTINCT FROM p_description
           OR v_existing.typecode <> 'TRANSFER' THEN
            PERFORM banking_api.raise_error('CONFLICT', 'idempotency key has a different transfer payload');
        END IF;
        RETURN banking_api.transaction_result(v_existing.transactionid);
    END IF;
    IF NOT EXISTS (
        SELECT
            1
        FROM
            customer
        WHERE
            customerid = p_customer
            AND status = 'Active') THEN
    PERFORM
        banking_api.raise_error ('FORBIDDEN', 'customer is not active');
END IF;
    IF NOT EXISTS (
        SELECT
            1
        FROM
            account_holder
        WHERE
            customerid = p_customer
            AND accountid = p_source
            AND status = 'Active'
            AND startdate <= CURRENT_DATE
            AND (enddate IS NULL
                OR enddate >= CURRENT_DATE)) THEN
    PERFORM
        banking_api.raise_error ('FORBIDDEN', 'customer does not own source account');
END IF;
    IF (SELECT count(*) FROM bank_account
        WHERE accountid IN (p_source, p_destination)
          AND status = 'Active' AND accountcategory = 'CUSTOMER' AND currency = 'VND') <> 2 THEN
        PERFORM banking_api.raise_error('VALIDATION', 'transfer requires two active VND customer accounts');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM account_holder h JOIN customer c USING (customerid)
        WHERE h.accountid = p_destination AND h.holdertype = 'PRIMARY_OWNER'
          AND h.status = 'Active' AND c.status = 'Active'
          AND h.startdate <= CURRENT_DATE AND (h.enddate IS NULL OR h.enddate >= CURRENT_DATE)
    ) THEN
        PERFORM banking_api.raise_error('VALIDATION', 'recipient account has no active primary owner');
    END IF;
    SELECT
        transactiontypeid
    INTO
        v_type
    FROM
        transaction_type
    WHERE
        typecode = 'TRANSFER'
        AND status = 'Active';
    v_code := 'TX-' || upper(encode(public.gen_random_bytes(12), 'hex'));
INSERT INTO bank_transaction (transactioncode, transactiontypeid, deviceid, channel, amount, fee, currency, transactiondate, ipaddress, description, status, initiatedbycustomerid)
    VALUES (v_code, v_type, p_device, p_channel, p_amount, 0, 'VND', clock_timestamp(), p_ip, p_description, 'Pending', p_customer)
RETURNING
    transactionid
INTO
    v_id;
INSERT INTO transfer_request (transactionid, customerid, sourceaccountid, destinationaccountid, idempotencykey, amount, currency, status)
    VALUES (v_id, p_customer, p_source, p_destination, p_idempotency, p_amount, 'VND', 'Pending');
    v_risk := banking_api.assess_transaction (v_id, p_customer, p_device, p_amount);
    IF v_risk ->> 'decision' = 'BLOCK' THEN
        UPDATE
            bank_transaction
        SET
            status = 'Cancelled'
        WHERE
            transactionid = v_id;
        UPDATE
            transfer_request
        SET
            status = 'Rejected'
        WHERE
            transactionid = v_id;
        PERFORM
            banking_api.emit_event (v_id, 'TransactionBlocked', jsonb_build_object('transaction_id', v_id, 'risk', v_risk));
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
            VALUES (p_customer, v_id, 'TRANSACTION_BLOCKED');
    ELSIF v_risk ->> 'decision' = 'REVIEW' THEN
        INSERT INTO review_case (transactionid, status)
            VALUES (v_id, 'OPEN');
        PERFORM
            banking_api.emit_event (v_id, 'TransactionReviewRequired', jsonb_build_object('transaction_id', v_id, 'risk', v_risk));
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
            VALUES (p_customer, v_id, 'TRANSACTION_UNDER_REVIEW');
    ELSE
        PERFORM
            banking_api.post_balanced_transaction (v_id, p_source, p_destination, p_amount, p_customer, TRUE);
    END IF;
    RETURN banking_api.transaction_result (v_id);
END;
$$;

-- Deposit, withdrawal, and opening-balance operations.
CREATE OR REPLACE FUNCTION banking_api.create_account_movement (p_type_code text, p_customer bigint, p_debit bigint, p_credit bigint, p_amount numeric, p_transaction_code varchar(40), p_channel varchar(30), p_employee integer DEFAULT NULL, p_description varchar(255) DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_type integer;
    v_id bigint;
    v_customer bigint := p_customer;
    v_risk jsonb;
    v_owner boolean;
    v_existing RECORD;
BEGIN
    IF p_type_code NOT IN ('DEPOSIT', 'WITHDRAWAL', 'OPENING_BALANCE') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'unsupported movement type');
    END IF;
    IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_amount <= 0 OR p_amount <> round(p_amount, 2) OR p_debit = p_credit OR NULLIF (trim(p_transaction_code), '') IS NULL THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid movement');
    END IF;
    PERFORM
        pg_advisory_xact_lock(hashtextextended(p_transaction_code, 0));
    SELECT bt.*, tr.sourceaccountid, tr.destinationaccountid, tt.typecode
    INTO v_existing
    FROM bank_transaction bt
    JOIN transfer_request tr USING (transactionid)
    JOIN transaction_type tt USING (transactiontypeid)
    WHERE bt.transactioncode = p_transaction_code OR tr.idempotencykey = p_transaction_code;
    IF FOUND THEN
        IF p_customer IS NOT NULL AND v_existing.initiatedbycustomerid IS DISTINCT FROM p_customer THEN
            PERFORM banking_api.raise_error('FORBIDDEN', 'transaction code belongs to another customer');
        END IF;
        IF v_existing.typecode IS DISTINCT FROM p_type_code
           OR v_existing.sourceaccountid IS DISTINCT FROM p_debit
           OR v_existing.destinationaccountid IS DISTINCT FROM p_credit
           OR v_existing.amount IS DISTINCT FROM p_amount
           OR v_existing.employeeid IS DISTINCT FROM p_employee
           OR v_existing.channel IS DISTINCT FROM p_channel
           OR v_existing.description IS DISTINCT FROM p_description THEN
            PERFORM banking_api.raise_error('CONFLICT', 'transaction code has a different movement payload');
        END IF;
        RETURN banking_api.transaction_result(v_existing.transactionid);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM bank_account d CROSS JOIN bank_account c
        WHERE d.accountid = p_debit AND c.accountid = p_credit
          AND d.status = 'Active' AND c.status = 'Active'
          AND d.currency = 'VND' AND c.currency = 'VND'
          AND d.accountcategory = CASE WHEN p_type_code = 'WITHDRAWAL' THEN 'CUSTOMER' ELSE 'INTERNAL' END
          AND c.accountcategory = CASE WHEN p_type_code = 'WITHDRAWAL' THEN 'INTERNAL' ELSE 'CUSTOMER' END
    ) THEN
        PERFORM banking_api.raise_error('VALIDATION', 'invalid customer/internal movement account direction');
    END IF;
    IF v_customer IS NULL THEN
        SELECT
            customerid
        INTO
            v_customer
        FROM
            account_holder
        WHERE
            accountid = CASE WHEN p_type_code = 'WITHDRAWAL' THEN
                p_debit
            ELSE
                p_credit
            END
            AND status = 'Active'
        ORDER BY
            CASE holdertype
            WHEN 'PRIMARY_OWNER' THEN
                0
            ELSE
                1
            END
        LIMIT 1;
    END IF;
    IF v_customer IS NULL THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'customer owner not found');
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM account_holder
        WHERE customerid = v_customer
          AND accountid = CASE
              WHEN p_type_code = 'WITHDRAWAL' THEN p_debit
              ELSE p_credit
          END
          AND status = 'Active'
          AND startdate <= CURRENT_DATE
          AND (enddate IS NULL OR enddate >= CURRENT_DATE)
    ) THEN
        PERFORM banking_api.raise_error(
            'FORBIDDEN',
            'customer does not own the movement account'
        );
    END IF;
    SELECT
        transactiontypeid
    INTO
        v_type
    FROM
        transaction_type
    WHERE
        typecode = p_type_code
        AND status = 'Active';
    INSERT INTO bank_transaction (transactioncode, transactiontypeid, employeeid, channel, amount, fee, currency, description, status, initiatedbycustomerid)
        VALUES (p_transaction_code, v_type, p_employee, p_channel, p_amount, 0, 'VND', p_description, 'Pending', v_customer)
    RETURNING
        transactionid
    INTO
        v_id;
    INSERT INTO transfer_request (transactionid, customerid, sourceaccountid, destinationaccountid, idempotencykey, amount, currency, status)
        VALUES (v_id, v_customer, p_debit, p_credit, p_transaction_code, p_amount, 'VND', 'Pending');
    v_risk := banking_api.assess_transaction (v_id, v_customer, NULL, p_amount);
    v_owner := p_type_code = 'WITHDRAWAL';
    IF v_risk ->> 'decision' = 'BLOCK' THEN
        UPDATE
            bank_transaction
        SET
            status = 'Cancelled'
        WHERE
            transactionid = v_id;
        UPDATE
            transfer_request
        SET
            status = 'Rejected'
        WHERE
            transactionid = v_id;
        PERFORM
            banking_api.emit_event (v_id, 'TransactionBlocked', jsonb_build_object('transaction_id', v_id, 'risk', v_risk));
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
            VALUES (v_customer, v_id, 'TRANSACTION_BLOCKED');
    ELSIF v_risk ->> 'decision' = 'REVIEW' THEN
        INSERT INTO review_case (transactionid, status)
            VALUES (v_id, 'OPEN');
        PERFORM
            banking_api.emit_event (v_id, 'TransactionReviewRequired', jsonb_build_object('transaction_id', v_id, 'risk', v_risk));
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
            VALUES (v_customer, v_id, 'TRANSACTION_UNDER_REVIEW');
    ELSE
        PERFORM
            banking_api.post_balanced_transaction (v_id, p_debit, p_credit, p_amount, v_customer, v_owner);
    END IF;
    RETURN banking_api.transaction_result (v_id);
END;
$$;

-- Completes the loan domain records after the financial posting succeeds.
CREATE OR REPLACE FUNCTION banking_api.finalize_loan_payment (
    p_transaction bigint,
    p_loan bigint,
    p_schedule bigint,
    p_channel varchar(30)
)
    RETURNS VOID
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_schedule repayment_schedule%ROWTYPE;
BEGIN
    SELECT *
    INTO v_schedule
    FROM repayment_schedule
    WHERE loanid = p_loan
      AND scheduleid = p_schedule
    FOR UPDATE;

    IF NOT FOUND THEN
        PERFORM banking_api.raise_error('NOT_FOUND', 'loan schedule not found');
    END IF;
    IF v_schedule.status = 'Paid' THEN
        PERFORM banking_api.raise_error('CONFLICT', 'schedule already paid');
    END IF;

    INSERT INTO loan_payment (
        loanid,
        scheduleid,
        amountpaid,
        principalpaid,
        interestpaid,
        penaltyfee,
        paymentchannel,
        transactionid
    )
    VALUES (
        p_loan,
        p_schedule,
        v_schedule.principaldue + v_schedule.interestdue + v_schedule.penaltydue,
        v_schedule.principaldue,
        v_schedule.interestdue,
        v_schedule.penaltydue,
        p_channel,
        p_transaction
    );

    UPDATE repayment_schedule
    SET status = 'Paid'
    WHERE scheduleid = p_schedule;

    IF NOT EXISTS (
        SELECT 1
        FROM repayment_schedule
        WHERE loanid = p_loan
          AND status <> 'Paid'
    ) THEN
        UPDATE loan
        SET status = 'Paid'
        WHERE loanid = p_loan;
    END IF;
END;
$$;

-- Manual approval or rejection of a REVIEW decision.
CREATE OR REPLACE FUNCTION banking_api.resolve_review (p_review bigint, p_reviewer integer, p_action text, p_reason varchar(255) DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    vc RECORD;
    vr RECORD;
    vu RECORD;
    v_type text;
    v_owner boolean;
    v_result text;
    v_description text;
BEGIN
    IF upper(p_action)
        NOT IN ('APPROVE', 'REJECT') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid action');
    END IF;
    SELECT su.userid, e.employeeid, e.branchid, r.rolename
    INTO vu
    FROM "system_user" su
    JOIN employee e USING (employeeid)
    JOIN role r USING (roleid)
    WHERE su.userid = p_reviewer
      AND su.isactive
      AND e.status = 'Active';
    IF NOT FOUND THEN
        PERFORM banking_api.raise_error('FORBIDDEN', 'reviewer is inactive');
    END IF;
    SELECT
        *
    INTO
        vc
    FROM
        review_case
    WHERE
        reviewcaseid = p_review
    FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'review case not found');
    END IF;
    IF lower(vu.rolename) NOT LIKE '%admin%'
       AND vu.rolename <> 'Quản trị hệ thống'
       AND NOT EXISTS (
           SELECT 1
           FROM transfer_request tr
           JOIN bank_account ba
             ON ba.accountid IN (tr.sourceaccountid, tr.destinationaccountid)
           WHERE tr.transactionid = vc.transactionid
             AND ba.branchid = vu.branchid
       ) THEN
        PERFORM banking_api.raise_error(
            'FORBIDDEN',
            'review case is outside employee branch scope'
        );
    END IF;
    IF vc.status NOT IN ('OPEN', 'IN_REVIEW') THEN
        IF vc.revieweruserid = p_reviewer
           AND vc.reason IS NOT DISTINCT FROM p_reason
           AND ((vc.status = 'APPROVED' AND upper(p_action) = 'APPROVE')
                OR (vc.status = 'REJECTED' AND upper(p_action) = 'REJECT')) THEN
            RETURN banking_api.transaction_result(vc.transactionid);
        END IF;
        PERFORM banking_api.raise_error('CONFLICT', 'review already resolved');
    END IF;
    UPDATE
        review_case
    SET
        status = CASE WHEN upper(p_action) = 'APPROVE' THEN
            'APPROVED'
        ELSE
            'REJECTED'
        END,
        revieweruserid = p_reviewer,
        reviewedat = clock_timestamp(),
        reason = p_reason
    WHERE
        reviewcaseid = p_review;
    IF upper(p_action) = 'REJECT' THEN
        UPDATE
            bank_transaction
        SET
            status = 'Cancelled'
        WHERE
            transactionid = vc.transactionid;
        UPDATE
            transfer_request
        SET
            status = 'Rejected'
        WHERE
            transactionid = vc.transactionid;
        PERFORM
            banking_api.emit_event (vc.transactionid, 'TransactionRejected', jsonb_build_object('transaction_id', vc.transactionid, 'reason', p_reason));
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
        SELECT
            initiatedbycustomerid,
            transactionid,
            'TRANSACTION_REJECTED'
        FROM
            bank_transaction
        WHERE
            transactionid = vc.transactionid
            AND initiatedbycustomerid IS NOT NULL;
    ELSE
        UPDATE
            transfer_request
        SET
            status = 'Approved'
        WHERE
            transactionid = vc.transactionid;
        SELECT
            *
        INTO
            vr
        FROM
            transfer_request
        WHERE
            transactionid = vc.transactionid
        FOR UPDATE;
        SELECT
            tt.typecode,
            bt.description
        INTO
            v_type,
            v_description
        FROM
            bank_transaction bt
            JOIN transaction_type tt USING (transactiontypeid)
        WHERE
            bt.transactionid = vc.transactionid;
        v_owner := v_type IN ('TRANSFER', 'WITHDRAWAL', 'LOAN_PAYMENT');
        v_result := banking_api.post_balanced_transaction(
            vc.transactionid,
            vr.sourceaccountid,
            vr.destinationaccountid,
            vr.amount,
            vr.customerid,
            v_owner
        );
        IF v_result = 'Success'
           AND v_type = 'LOAN_PAYMENT'
           AND split_part(COALESCE(v_description, ''), '|', 1) = 'LOAN_PAYMENT' THEN
            PERFORM banking_api.finalize_loan_payment(
                vc.transactionid,
                split_part(v_description, '|', 2)::bigint,
                split_part(v_description, '|', 3)::bigint,
                split_part(v_description, '|', 4)::varchar(30)
            );
        END IF;
    END IF;
    RETURN banking_api.transaction_result (vc.transactionid);
END;
$$;

-- Loan-schedule repayment.
CREATE OR REPLACE FUNCTION banking_api.pay_loan (p_customer bigint, p_loan bigint, p_schedule bigint, p_source bigint, p_internal bigint, p_amount numeric, p_code varchar(40), p_channel varchar(30) DEFAULT 'Online')
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    vs RECORD;
    v_type integer;
    v_id bigint;
    v_result text;
    v_risk jsonb;
    v_existing RECORD;
BEGIN
    IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_amount <= 0 OR p_amount <> round(p_amount, 2) OR p_source = p_internal
       OR NULLIF(trim(p_code), '') IS NULL
       OR p_channel NOT IN ('Counter', 'Account', 'Online') THEN
        PERFORM banking_api.raise_error('VALIDATION', 'invalid loan payment');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_code, 0));
    SELECT bt.*, tr.sourceaccountid, tr.destinationaccountid, tt.typecode
    INTO v_existing
    FROM bank_transaction bt
    JOIN transfer_request tr USING (transactionid)
    JOIN transaction_type tt USING (transactiontypeid)
    WHERE bt.transactioncode = p_code OR tr.idempotencykey = p_code;
    IF FOUND THEN
        IF v_existing.initiatedbycustomerid IS DISTINCT FROM p_customer THEN
            PERFORM banking_api.raise_error('FORBIDDEN', 'transaction code belongs to another customer');
        END IF;
        IF v_existing.typecode <> 'LOAN_PAYMENT'
           OR v_existing.sourceaccountid IS DISTINCT FROM p_source
           OR v_existing.destinationaccountid IS DISTINCT FROM p_internal
           OR v_existing.amount IS DISTINCT FROM p_amount
           OR v_existing.description IS DISTINCT FROM concat('LOAN_PAYMENT|', p_loan, '|', p_schedule, '|', p_channel) THEN
            PERFORM banking_api.raise_error('CONFLICT', 'transaction code has a different loan payment payload');
        END IF;
        RETURN banking_api.transaction_result(v_existing.transactionid);
    END IF;
    SELECT rs.*, l.status AS loanstatus
    INTO vs
    FROM repayment_schedule rs
    JOIN loan l USING (loanid)
    WHERE rs.loanid = p_loan
      AND rs.scheduleid = p_schedule
      AND l.customerid = p_customer
    FOR UPDATE OF rs;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'loan schedule not found');
    END IF;
    IF vs.loanstatus <> 'Active' OR vs.status = 'Paid' THEN
        PERFORM
            banking_api.raise_error ('CONFLICT', 'loan or schedule is not payable');
    END IF;
    IF EXISTS (
        SELECT 1 FROM bank_transaction bt JOIN transaction_type tt USING (transactiontypeid)
        WHERE tt.typecode = 'LOAN_PAYMENT' AND bt.status = 'Pending'
          AND split_part(bt.description, '|', 1) = 'LOAN_PAYMENT'
          AND split_part(bt.description, '|', 2) = p_loan::text
          AND split_part(bt.description, '|', 3) = p_schedule::text
    ) THEN
        PERFORM banking_api.raise_error('CONFLICT', 'loan schedule already has a pending payment');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM bank_account a CROSS JOIN bank_account b
        WHERE a.accountid = p_source AND b.accountid = p_internal
          AND a.accountcategory = 'CUSTOMER' AND b.accountcategory = 'INTERNAL'
          AND a.status = 'Active' AND b.status = 'Active'
    ) THEN
        PERFORM banking_api.raise_error('VALIDATION', 'invalid loan payment account direction');
    END IF;
    IF p_amount <> vs.principaldue + vs.interestdue + vs.penaltydue THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'payment does not reconcile');
    END IF;
    SELECT
        transactiontypeid
    INTO
        v_type
    FROM
        transaction_type
    WHERE
        typecode = 'LOAN_PAYMENT'
        AND status = 'Active';
    INSERT INTO bank_transaction (
        transactioncode,
        transactiontypeid,
        channel,
        amount,
        fee,
        currency,
        description,
        status,
        initiatedbycustomerid
    )
    VALUES (
        p_code,
        v_type,
        CASE WHEN p_channel = 'Counter' THEN 'Counter' ELSE 'InternetBanking' END,
        p_amount,
        0,
        'VND',
        concat('LOAN_PAYMENT|', p_loan, '|', p_schedule, '|', p_channel),
        'Pending',
        p_customer
    )
    RETURNING
        transactionid
    INTO
        v_id;
    INSERT INTO transfer_request (
        transactionid,
        customerid,
        sourceaccountid,
        destinationaccountid,
        idempotencykey,
        amount,
        currency,
        status
    )
    VALUES (v_id, p_customer, p_source, p_internal, p_code, p_amount, 'VND', 'Pending');

    v_risk := banking_api.assess_transaction(v_id, p_customer, NULL, p_amount);
    IF v_risk ->> 'decision' = 'BLOCK' THEN
        UPDATE bank_transaction SET status = 'Cancelled' WHERE transactionid = v_id;
        UPDATE transfer_request SET status = 'Rejected' WHERE transactionid = v_id;
        PERFORM banking_api.emit_event(
            v_id,
            'TransactionBlocked',
            jsonb_build_object('transaction_id', v_id, 'risk', v_risk)
        );
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
        VALUES (p_customer, v_id, 'TRANSACTION_BLOCKED');
    ELSIF v_risk ->> 'decision' = 'REVIEW' THEN
        INSERT INTO review_case (transactionid, status) VALUES (v_id, 'OPEN');
        PERFORM banking_api.emit_event(
            v_id,
            'TransactionReviewRequired',
            jsonb_build_object('transaction_id', v_id, 'risk', v_risk)
        );
        INSERT INTO notification_outbox (customerid, transactionid, notificationtype)
        VALUES (p_customer, v_id, 'TRANSACTION_UNDER_REVIEW');
    ELSE
        v_result := banking_api.post_balanced_transaction(
            v_id,
            p_source,
            p_internal,
            p_amount,
            p_customer,
            TRUE
        );
        IF v_result = 'Success' THEN
            PERFORM banking_api.finalize_loan_payment(
                v_id,
                p_loan,
                p_schedule,
                p_channel
            );
        END IF;
    END IF;
    RETURN banking_api.transaction_result (v_id);
END;
$$;

-- Compensating reversal that preserves the original postings.
CREATE OR REPLACE FUNCTION banking_api.reverse_transaction (p_original bigint, p_employee integer, p_code varchar(40), p_reason varchar(255))
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    vo RECORD;
    vd RECORD;
    vc RECORD;
    ve RECORD;
    v_type integer;
    v_id bigint;
    v_existing RECORD;
BEGIN
    PERFORM
        pg_advisory_xact_lock(p_original);
    SELECT e.employeeid, e.branchid, r.rolename
    INTO ve
    FROM employee e
    JOIN role r USING (roleid)
    WHERE e.employeeid = p_employee
      AND e.status = 'Active';
    IF NOT FOUND THEN
        PERFORM banking_api.raise_error('FORBIDDEN', 'employee is not active');
    END IF;
    SELECT
        *
    INTO
        vo
    FROM
        bank_transaction
    WHERE
        transactionid = p_original
    FOR UPDATE;
    IF NOT FOUND OR vo.status <> 'Success' THEN
        PERFORM
            banking_api.raise_error ('CONFLICT', 'transaction is not reversible');
    END IF;
    IF EXISTS (SELECT 1 FROM transaction_type WHERE transactiontypeid=vo.transactiontypeid AND typecode='LOAN_PAYMENT') THEN
        PERFORM banking_api.raise_error('CONFLICT','loan payment reversal is not supported; requires loan-domain compensation');
    END IF;
    IF (
        SELECT
            count(*)
        FROM
            transaction_posting
        WHERE
            transactionid = p_original) <> 2 THEN
        PERFORM
            banking_api.raise_error ('INTEGRITY', 'reversal requires exactly two postings');
    END IF;
    SELECT
        accountid,
        amount
    INTO
        vd
    FROM
        transaction_posting
    WHERE
        transactionid = p_original
        AND postingtype = 'DEBIT';
    SELECT
        accountid,
        amount
    INTO
        vc
    FROM
        transaction_posting
    WHERE
        transactionid = p_original
        AND postingtype = 'CREDIT';
    IF lower(ve.rolename) NOT LIKE '%admin%'
       AND ve.rolename <> 'Quản trị hệ thống'
       AND NOT EXISTS (
           SELECT 1
           FROM bank_account
           WHERE accountid = vd.accountid
             AND branchid = ve.branchid
       ) THEN
        PERFORM banking_api.raise_error(
            'FORBIDDEN',
            'transaction is outside employee branch scope'
        );
    END IF;
    SELECT bt.* INTO v_existing FROM bank_transaction bt WHERE bt.transactioncode = p_code;
    IF FOUND THEN
        IF v_existing.originaltransactionid IS DISTINCT FROM p_original
           OR v_existing.employeeid IS DISTINCT FROM p_employee
           OR v_existing.description IS DISTINCT FROM p_reason THEN
            PERFORM banking_api.raise_error('CONFLICT', 'transaction code has a different reversal payload');
        END IF;
        RETURN banking_api.transaction_result(v_existing.transactionid);
    END IF;
    IF EXISTS (
        SELECT
            1
        FROM
            bank_transaction
        WHERE
            originaltransactionid = p_original
            AND status = 'Success') THEN
    PERFORM
        banking_api.raise_error ('CONFLICT', 'transaction already reversed');
END IF;
    IF vd.amount <> vc.amount THEN
        PERFORM
            banking_api.raise_error ('INTEGRITY', 'original posting is unbalanced');
    END IF;
    SELECT
        transactiontypeid
    INTO
        v_type
    FROM
        transaction_type
    WHERE
        typecode = 'REVERSAL'
        AND status = 'Active';
    INSERT INTO bank_transaction (transactioncode, transactiontypeid, employeeid, channel, amount, fee, currency, description, status, originaltransactionid)
        VALUES (p_code, v_type, p_employee, 'System', vo.amount, 0, vo.currency, p_reason, 'Pending', p_original)
    RETURNING
        transactionid
    INTO
        v_id;
    UPDATE
        bank_transaction
    SET
        initiatedbycustomerid = vo.initiatedbycustomerid
    WHERE
        transactionid = v_id;
    PERFORM
        banking_api.post_balanced_transaction (v_id, vc.accountid, vd.accountid, vc.amount, NULL, FALSE);
    RETURN banking_api.transaction_result (v_id);
END;
$$;

