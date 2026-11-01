-- ============================================================================
-- D4 BANK - POSTGRESQL API FOUNDATION
-- Extensions, request context helpers, authentication, and reference data.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS banking_api;

COMMENT ON SCHEMA banking_api IS 'Database contract for the D4 Bank NestJS API';

CREATE OR REPLACE FUNCTION banking_api.raise_error (p_code text, p_message text)
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION
        USING ERRCODE = 'P0001', MESSAGE = p_code || ':' || p_message;
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.request_user_id ()
    RETURNS integer
    LANGUAGE sql
    STABLE
    AS $$
    SELECT
        NULLIF (current_setting('app.user_id', true), '')::integer;
$$;

CREATE OR REPLACE FUNCTION banking_api.request_ip ()
    RETURNS varchar (
        45)
    LANGUAGE sql
    STABLE
    AS $$
    SELECT
        NULLIF (current_setting('app.ip_address', true), '')::varchar(45);
$$;

CREATE OR REPLACE FUNCTION banking_api.hash_password (p_password text)
    RETURNS text
    LANGUAGE plpgsql
    VOLATILE STRICT
    AS $$
BEGIN
    IF length(p_password) < 8 THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'password must contain at least 8 characters');
    END IF;
    RETURN public.crypt(p_password, public.gen_salt('bf', 12));
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.verify_password (p_password text, p_hash text)
    RETURNS boolean
    LANGUAGE sql
    STABLE STRICT
    AS $$
    SELECT
        public.crypt(p_password, p_hash) = p_hash;
$$;

CREATE OR REPLACE FUNCTION banking_api.health ()
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    AS $$
    SELECT
        jsonb_build_object('status', 'ok', 'database', current_database(), 'serverTime', clock_timestamp());
$$;

CREATE OR REPLACE FUNCTION banking_api.authenticate (p_username text, p_password text, p_role text, p_device_code text DEFAULT NULL, p_ip_address varchar(45) DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_row RECORD;
    v_device_id bigint;
    v_role text;
BEGIN
    IF NULLIF (trim(p_username), '') IS NULL OR p_password IS NULL OR lower(COALESCE(p_role, ''))
        NOT IN ('customer', 'employee', 'admin') THEN
        PERFORM
            banking_api.raise_error ('AUTH_INVALID', 'invalid credentials');
    END IF;
    IF lower(p_role) = 'customer' THEN
        SELECT
            coa.onlineaccountid,
            coa.customerid,
            coa.passwordhash,
            coa.isactive,
            c.customercode,
            c.fullname,
            c.status,
            c.email,
            c.phone
        INTO
            v_row
        FROM
            customer_online_account coa
            JOIN customer c USING (customerid)
        WHERE
            lower(coa.username) = lower(trim(p_username));
        IF NOT FOUND OR NOT COALESCE(banking_api.verify_password (p_password, v_row.passwordhash), FALSE) THEN
            PERFORM
                banking_api.raise_error ('AUTH_INVALID', 'invalid credentials');
        END IF;
        IF NOT v_row.isactive OR v_row.status <> 'Active' THEN
            PERFORM
                banking_api.raise_error ('AUTH_BLOCKED', 'account is inactive or blocked');
        END IF;
        IF p_device_code IS NOT NULL THEN
            SELECT
                deviceid
            INTO
                v_device_id
            FROM
                customer_device
            WHERE
                customerid = v_row.customerid
                AND devicecode = p_device_code
                AND status = 'Active';
        END IF;
        UPDATE
            customer_online_account
        SET
            lastlogin = clock_timestamp()
        WHERE
            onlineaccountid = v_row.onlineaccountid;
        UPDATE
            customer_device
        SET
            lastseenat = clock_timestamp()
        WHERE
            deviceid = v_device_id;
        INSERT INTO login_event (customerid, deviceid, ipaddress, status)
            VALUES (v_row.customerid, v_device_id, p_ip_address, 'Success');
        RETURN jsonb_build_object('actorType', 'customer', 'role', 'customer', 'customerId', v_row.customerid, 'deviceId', v_device_id, 'code', v_row.customercode, 'name', v_row.fullname, 'email', v_row.email, 'phone', v_row.phone);
    END IF;
    SELECT
        su.userid,
        su.passwordhash,
        su.isactive,
        e.employeeid,
        e.employeecode,
        e.fullname,
        e.status,
        e.email,
        e.phone,
        e.branchid,
        r.rolename
    INTO
        v_row
    FROM
        "system_user" su
        JOIN employee e USING (employeeid)
        JOIN role r USING (roleid)
    WHERE
        lower(su.username) = lower(trim(p_username));
    IF NOT FOUND OR NOT COALESCE(banking_api.verify_password (p_password, v_row.passwordhash), FALSE) THEN
        PERFORM
            banking_api.raise_error ('AUTH_INVALID', 'invalid credentials');
    END IF;
    IF NOT v_row.isactive OR v_row.status <> 'Active' THEN
        PERFORM
            banking_api.raise_error ('AUTH_BLOCKED', 'account is inactive');
    END IF;
    v_role := CASE WHEN lower(v_row.rolename) LIKE '%admin%'
        OR v_row.rolename = 'Quản trị hệ thống' THEN
        'admin'
    ELSE
        'employee'
    END;
    IF lower(p_role) <> v_role THEN
        PERFORM
            banking_api.raise_error ('FORBIDDEN', 'selected role does not match account role');
    END IF;
    UPDATE
        "system_user"
    SET
        lastlogin = clock_timestamp()
    WHERE
        userid = v_row.userid;
    RETURN jsonb_build_object('actorType', 'employee', 'role', v_role, 'userId', v_row.userid, 'employeeId', v_row.employeeid, 'branchId', v_row.branchid, 'code', v_row.employeecode, 'name', v_row.fullname, 'email', v_row.email, 'phone', v_row.phone);
END;
$$;

SET search_path TO banking;

INSERT INTO transaction_type (typecode, typename, description, status)
VALUES
    ('TRANSFER', 'Transfer', 'Account-to-account transfer', 'Active'),
    ('DEPOSIT', 'Deposit', 'Deposit from an internal settlement account', 'Active'),
    ('WITHDRAWAL', 'Withdrawal', 'Withdrawal to an internal settlement account', 'Active'),
    ('LOAN_PAYMENT', 'Loan Payment', 'Payment against a loan schedule', 'Active'),
    ('OPENING_BALANCE', 'Opening Balance', 'Initial account funding', 'Active'),
    ('REVERSAL', 'Reversal', 'Compensating transaction', 'Active')
ON CONFLICT (typecode)
    DO UPDATE SET
        description = EXCLUDED.description;

INSERT INTO model_version (modelname, modeltype, status, description)
SELECT
    'fraud_detection_v1',
    'LOGISTIC',
    'ACTIVE',
    'Bootstrap fraud model v1'
WHERE
    NOT EXISTS (
        SELECT
            1
        FROM
            model_version
        WHERE
            status = 'ACTIVE');

