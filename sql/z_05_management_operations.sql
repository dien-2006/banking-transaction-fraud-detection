-- ============================================================================
-- D4 BANK - MANAGEMENT OPERATIONS
-- Controlled writes for branches, people, accounts, cards, loans, and labels.
-- ============================================================================

SET search_path TO banking;

CREATE OR REPLACE FUNCTION banking_api.create_branch (p_code varchar(20), p_name varchar(150), p_address varchar(255), p_city varchar(100), p_phone varchar(20), p_open_date date)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v branch%ROWTYPE;
BEGIN
    INSERT INTO branch (branchcode, branchname, address, city, phone, opendate)
        VALUES (p_code, p_name, p_address, p_city, p_phone, p_open_date)
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_branch_status (p_id integer, p_status text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v branch%ROWTYPE;
BEGIN
    IF p_status NOT IN ('Active', 'Inactive') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid branch status');
    END IF;
    UPDATE
        branch
    SET
        status = p_status
    WHERE
        branchid = p_id
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'branch not found');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.update_branch (p_id integer, p_name varchar(150), p_address varchar(255), p_city varchar(100), p_phone varchar(20))
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v branch%ROWTYPE;
BEGIN
    UPDATE
        branch
    SET
        branchname = p_name,
        address = p_address,
        city = p_city,
        phone = p_phone
    WHERE
        branchid = p_id
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'branch not found');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.create_customer (p_code varchar(20), p_name varchar(150), p_gender varchar(10), p_birth date, p_national_id varchar(30), p_phone varchar(20), p_email varchar(150), p_address varchar(255), p_occupation varchar(100), p_type varchar(30), p_segment varchar(30))
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v customer%ROWTYPE;
BEGIN
    INSERT INTO customer (customercode, fullname, gender, dateofbirth, nationalid, phone, email, address, occupation, customertype, customersegment)
        VALUES (p_code, p_name, p_gender, p_birth, p_national_id, p_phone, p_email, p_address, p_occupation, p_type, p_segment)
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.update_customer (p_id bigint, p_name varchar(150), p_phone varchar(20), p_email varchar(150), p_address varchar(255), p_occupation varchar(100), p_type varchar(30), p_segment varchar(30))
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v customer%ROWTYPE;
BEGIN
    UPDATE
        customer
    SET
        fullname = p_name,
        phone = p_phone,
        email = p_email,
        address = p_address,
        occupation = p_occupation,
        customertype = p_type,
        customersegment = p_segment
    WHERE
        customerid = p_id
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'customer not found');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_customer_status (p_id bigint, p_status text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v customer%ROWTYPE;
BEGIN
    IF p_status NOT IN ('Active', 'Inactive', 'Blocked') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid customer status');
    END IF;
    UPDATE
        customer
    SET
        status = p_status
    WHERE
        customerid = p_id
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'customer not found');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.create_employee (p_code varchar(20), p_branch integer, p_role integer, p_name varchar(150), p_gender varchar(10), p_birth date, p_phone varchar(20), p_email varchar(150), p_hire date, p_salary numeric)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v employee%ROWTYPE;
BEGIN
    INSERT INTO employee (employeecode, branchid, roleid, fullname, gender, dateofbirth, phone, email, hiredate, salary)
        VALUES (p_code, p_branch, p_role, p_name, p_gender, p_birth, p_phone, p_email, p_hire, p_salary)
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.update_employee (p_id integer, p_branch integer, p_role integer, p_name varchar(150), p_phone varchar(20), p_email varchar(150), p_salary numeric)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v employee%ROWTYPE;
BEGIN
    UPDATE
        employee
    SET
        branchid = p_branch,
        roleid = p_role,
        fullname = p_name,
        phone = p_phone,
        email = p_email,
        salary = p_salary
    WHERE
        employeeid = p_id
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'employee not found');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_employee_status (p_id integer, p_status text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v employee%ROWTYPE;
BEGIN
    IF p_status NOT IN ('Active', 'Inactive') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid employee status');
    END IF;
    UPDATE
        employee
    SET
        status = p_status
    WHERE
        employeeid = p_id
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'employee not found');
    END IF;
    UPDATE
        "system_user"
    SET
        isactive = (p_status = 'Active')
    WHERE
        employeeid = p_id;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.register_system_user (p_employee integer, p_username varchar(100), p_password text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v "system_user"%ROWTYPE;
BEGIN
    INSERT INTO "system_user" (employeeid, username, passwordhash)
        VALUES (p_employee, p_username, banking_api.hash_password (p_password))
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v) - 'passwordhash';
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.register_customer_online_account (p_customer bigint, p_username varchar(100), p_password text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v customer_online_account%ROWTYPE;
BEGIN
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
INSERT INTO customer_online_account (customerid, username, passwordhash)
    VALUES (p_customer, p_username, banking_api.hash_password (p_password))
RETURNING
    *
INTO
    v;
    RETURN to_jsonb (v) - 'passwordhash';
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.register_customer_device (p_customer bigint, p_code varchar(100), p_type varchar(30), p_name varchar(100), p_os varchar(80))
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v customer_device%ROWTYPE;
BEGIN
    INSERT INTO customer_device (customerid, devicecode, devicetype, devicename, operatingsystem, lastseenat)
        VALUES (p_customer, p_code, p_type, p_name, p_os, clock_timestamp())
    ON CONFLICT (devicecode)
        DO UPDATE SET
            lastseenat = clock_timestamp(),
            devicename = EXCLUDED.devicename,
            operatingsystem = EXCLUDED.operatingsystem
        WHERE
            customer_device.customerid = EXCLUDED.customerid
        RETURNING
            *
        INTO
            v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('CONFLICT', 'device belongs to another customer');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_device_status (p_customer bigint, p_device bigint, p_status text, p_trusted boolean DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v customer_device%ROWTYPE;
BEGIN
    IF p_status NOT IN ('Active', 'Blocked', 'Removed') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid device status');
    END IF;
    UPDATE
        customer_device
    SET
        status = p_status,
        istrusted = COALESCE(p_trusted, istrusted)
    WHERE
        deviceid = p_device
        AND customerid = p_customer
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'device not found');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_customer_password (p_customer bigint, p_old_password text, p_new_password text)
    RETURNS VOID
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_hash text;
BEGIN
    SELECT
        passwordhash
    INTO
        v_hash
    FROM
        customer_online_account
    WHERE
        customerid = p_customer
        AND isactive
    FOR UPDATE;
    IF p_old_password IS NULL OR p_new_password IS NULL OR NOT FOUND OR NOT COALESCE(banking_api.verify_password (p_old_password, v_hash), FALSE) THEN
        PERFORM
            banking_api.raise_error ('AUTH_INVALID', 'current password is invalid');
    END IF;
    UPDATE
        customer_online_account
    SET
        passwordhash = banking_api.hash_password (p_new_password)
    WHERE
        customerid = p_customer;
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_system_user_password (p_user integer, p_old_password text, p_new_password text)
    RETURNS VOID
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_hash text;
BEGIN
    SELECT
        passwordhash
    INTO
        v_hash
    FROM
        "system_user"
    WHERE
        userid = p_user
        AND isactive
    FOR UPDATE;
    IF p_old_password IS NULL OR p_new_password IS NULL OR NOT FOUND OR NOT COALESCE(banking_api.verify_password (p_old_password, v_hash), FALSE) THEN
        PERFORM
            banking_api.raise_error ('AUTH_INVALID', 'current password is invalid');
    END IF;
    UPDATE
        "system_user"
    SET
        passwordhash = banking_api.hash_password (p_new_password)
    WHERE
        userid = p_user;
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.open_account (p_number varchar(30), p_branch integer, p_type integer, p_customer bigint, p_category varchar(20) DEFAULT 'CUSTOMER')
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v bank_account%ROWTYPE;
BEGIN
    INSERT INTO bank_account (accountnumber, branchid, accounttypeid, opendate, balance, currency, status, accountcategory)
        VALUES (p_number, p_branch, p_type, CURRENT_DATE, 0, 'VND', 'Active', p_category)
    RETURNING
        *
    INTO
        v;
    IF p_category = 'CUSTOMER' THEN
        INSERT INTO account_holder (accountid, customerid, holdertype, startdate, status)
            VALUES (v.accountid, p_customer, 'PRIMARY_OWNER', CURRENT_DATE, 'Active');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_account_status (p_account bigint, p_status text, p_reason varchar(255))
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v bank_account%ROWTYPE;
BEGIN
    IF p_status NOT IN ('Active', 'Frozen', 'Closed') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid account status');
    END IF;
    PERFORM
        set_config('app.change_reason', COALESCE(p_reason, ''), true);
    UPDATE
        bank_account
    SET
        status = p_status
    WHERE
        accountid = p_account
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'account not found');
    END IF;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.issue_card (p_number varchar(30), p_account bigint, p_customer bigint, p_issue date, p_expiry date, p_type varchar(30), p_pin text, p_limit numeric)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v card%ROWTYPE;
BEGIN
    IF NOT EXISTS (
        SELECT
            1
        FROM
            account_holder
        WHERE
            accountid = p_account
            AND customerid = p_customer
            AND status = 'Active') THEN
    PERFORM
        banking_api.raise_error ('FORBIDDEN', 'customer is not an active account holder');
END IF;
INSERT INTO card (cardnumber, accountid, issuedate, expirydate, cardtype, pinhash, status, dailylimit, customerid)
    VALUES (p_number, p_account, p_issue, p_expiry, p_type, crypt(p_pin, gen_salt('bf', 12)), 'Active', p_limit, p_customer)
RETURNING
    *
INTO
    v;
    RETURN to_jsonb (v) - 'cardnumber' - 'pinhash';
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_card_status (p_card bigint, p_status text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v card%ROWTYPE;
BEGIN
    IF p_status NOT IN ('Active', 'Blocked', 'Expired', 'Closed') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid card status');
    END IF;
    UPDATE
        card
    SET
        status = p_status
    WHERE
        cardid = p_card
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'card not found');
    END IF;
    RETURN to_jsonb (v) - 'cardnumber' - 'pinhash';
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_card_limit (p_card bigint, p_limit numeric)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v card%ROWTYPE;
BEGIN
    IF p_limit <= 0 THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'limit must be positive');
    END IF;
    UPDATE
        card
    SET
        dailylimit = p_limit
    WHERE
        cardid = p_card
    RETURNING
        *
    INTO
        v;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'card not found');
    END IF;
    RETURN to_jsonb (v) - 'cardnumber' - 'pinhash';
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.change_card_pin (p_customer bigint, p_card bigint, p_old_pin text, p_new_pin text)
    RETURNS VOID
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_hash text;
BEGIN
    IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4,6}$' THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'PIN must contain 4 to 6 digits');
    END IF;
    SELECT
        pinhash
    INTO
        v_hash
    FROM
        card
    WHERE
        cardid = p_card
        AND customerid = p_customer
        AND status = 'Active'
    FOR UPDATE;
    IF p_old_pin IS NULL OR NOT FOUND OR COALESCE(crypt(p_old_pin, v_hash) <> v_hash, TRUE) THEN
        PERFORM
            banking_api.raise_error ('AUTH_INVALID', 'current PIN is invalid');
    END IF;
    UPDATE
        card
    SET
        pinhash = crypt(p_new_pin, gen_salt('bf', 12))
    WHERE
        cardid = p_card;
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.create_loan (p_code varchar(30), p_customer bigint, p_branch integer, p_employee integer, p_type integer, p_principal numeric, p_rate numeric, p_months integer, p_start date)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v loan%ROWTYPE;
    v_type loan_type%ROWTYPE;
BEGIN
    SELECT
        *
    INTO
        v_type
    FROM
        loan_type
    WHERE
        loantypeid = p_type
        AND status = 'Active';
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'active loan type not found');
    END IF;
    IF p_principal > v_type.maxamount OR p_months > v_type.maxtermmonths THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'loan exceeds product limits');
    END IF;
    INSERT INTO loan (loancode, customerid, branchid, employeeid, loantypeid, principalamount, interestrate, termmonths, startdate, enddate, status)
        VALUES (p_code, p_customer, p_branch, p_employee, p_type, p_principal, p_rate, p_months, p_start, (p_start + (p_months || ' months')::interval)::date, 'Pending')
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.approve_loan (p_loan bigint)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v loan%ROWTYPE;
    v_i integer;
    v_base numeric(19, 2);
    v_principal numeric(19, 2);
    v_interest numeric(19, 2);
BEGIN
    SELECT
        *
    INTO
        v
    FROM
        loan
    WHERE
        loanid = p_loan
    FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'loan not found');
    END IF;
    IF v.status <> 'Pending' THEN
        PERFORM
            banking_api.raise_error ('CONFLICT', 'loan is not pending');
    END IF;
    v_base := round(v.principalamount / v.termmonths, 2);
    v_interest := round(v.principalamount * (v.interestrate / 100) / 12, 2);
    FOR v_i IN 1..v.termmonths LOOP
        v_principal := CASE WHEN v_i = v.termmonths THEN
            v.principalamount - v_base * (v.termmonths - 1)
        ELSE
            v_base
        END;
        INSERT INTO repayment_schedule (loanid, installmentno, duedate, principaldue, interestdue, penaltydue, status)
            VALUES (v.loanid, v_i, (v.startdate + (v_i || ' months')::interval)::date, v_principal, v_interest, 0, 'Pending');
    END LOOP;
    UPDATE
        loan
    SET
        status = 'Active'
    WHERE
        loanid = p_loan
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v);
END;
$$;

CREATE OR REPLACE FUNCTION banking_api.add_fraud_label (p_transaction bigint, p_label text, p_source varchar(50), p_note varchar(255))
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v fraud_label_event%ROWTYPE;
BEGIN
    IF p_label NOT IN ('FRAUD', 'LEGITIMATE', 'UNKNOWN') THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'invalid fraud label');
    END IF;
    INSERT INTO fraud_label_event (transactionid, label, labelsource, note)
        VALUES (p_transaction, p_label, p_source, p_note)
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v);
END;
$$;

