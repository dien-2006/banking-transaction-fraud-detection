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
    v_id integer;
    v_code text;
    v_attempt integer;
BEGIN
    -- Allocate the actual identity once; preserve existing codes and explicit legacy callers.
    -- Check imported IDs/codes without rewinding or changing the sequence definition.
    FOR v_attempt IN 1..100 LOOP
        v_id := nextval(pg_get_serial_sequence('banking.branch', 'branchid'));
        v_code := COALESCE(NULLIF(btrim(p_code), ''),
            'CN' || lpad(v_id::text, GREATEST(3, length(v_id::text)), '0'));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM branch WHERE branchid = v_id)
            AND (NULLIF(btrim(p_code), '') IS NOT NULL
                OR NOT EXISTS (SELECT 1 FROM branch WHERE branchcode = v_code));
        IF v_attempt = 100 THEN
            PERFORM banking_api.raise_error('CONFIGURATION', 'Chưa thể cấp mã chi nhánh. Quản trị viên cần kiểm tra dãy ID sau khi nhập dữ liệu.');
        END IF;
    END LOOP;
    INSERT INTO branch (branchid, branchcode, branchname, address, city, phone, opendate)
        VALUES (v_id, v_code, btrim(p_name), btrim(p_address), btrim(p_city), NULLIF(btrim(p_phone), ''), p_open_date)
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
    v_id bigint;
    v_code text;
BEGIN
    -- Reuse the existing identity sequence; never allocate with MAX(id) + 1.
    -- Legacy scripts may still supply a code; the web leaves it empty.
    LOOP
        v_id := nextval(pg_get_serial_sequence('banking.customer', 'customerid'));
        v_code := COALESCE(NULLIF(btrim(p_code), ''),
            'C' || lpad(v_id::text, GREATEST(7, length(v_id::text)), '0'));
        EXIT WHEN NULLIF(btrim(p_code), '') IS NOT NULL
            OR NOT EXISTS (SELECT 1 FROM customer WHERE customercode = v_code);
    END LOOP;
    INSERT INTO customer (customerid, customercode, fullname, gender, dateofbirth, nationalid, phone, email, address, occupation, customertype, customersegment)
        VALUES (v_id, v_code, p_name, p_gender, p_birth, p_national_id, p_phone, p_email, p_address, p_occupation, p_type, p_segment)
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
    v_id integer;
    v_code text;
    v_attempt integer;
    v_branch_name text;
    v_role_name text;
BEGIN
    SELECT branchname INTO v_branch_name FROM branch
        WHERE branchid = p_branch AND status = 'Active' FOR SHARE;
    IF NOT FOUND THEN
        PERFORM banking_api.raise_error('VALIDATION', 'Chi nhánh không còn hoạt động hoặc không tồn tại. Vui lòng chọn lại.');
    END IF;
    SELECT rolename INTO v_role_name FROM role
        WHERE roleid = p_role AND status = 'Active' FOR SHARE;
    IF NOT FOUND THEN
        PERFORM banking_api.raise_error('VALIDATION', 'Vai trò không còn hoạt động hoặc không tồn tại. Vui lòng chọn lại.');
    END IF;
    IF EXISTS (SELECT 1 FROM employee WHERE lower(btrim(email)) = lower(btrim(p_email))) THEN
        PERFORM banking_api.raise_error('CONFLICT', 'Email đã được sử dụng cho nhân viên khác.');
    END IF;
    -- Use the current identity, skip imported IDs/codes, and never reset its sequence.
    FOR v_attempt IN 1..100 LOOP
        v_id := nextval(pg_get_serial_sequence('banking.employee', 'employeeid'));
        v_code := COALESCE(NULLIF(btrim(p_code), ''),
            'EMP' || lpad(v_id::text, GREATEST(4, length(v_id::text)), '0'));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM employee WHERE employeeid = v_id)
            AND (NULLIF(btrim(p_code), '') IS NOT NULL
                OR NOT EXISTS (SELECT 1 FROM employee WHERE employeecode = v_code));
        IF v_attempt = 100 THEN
            PERFORM banking_api.raise_error('CONFIGURATION', 'Chưa thể cấp mã nhân viên. Quản trị viên cần kiểm tra dãy ID sau khi nhập dữ liệu.');
        END IF;
    END LOOP;
    INSERT INTO employee (employeeid, employeecode, branchid, roleid, fullname, gender, dateofbirth, phone, email, hiredate, salary)
        VALUES (v_id, v_code, p_branch, p_role, btrim(p_name), p_gender, p_birth, btrim(p_phone), lower(btrim(p_email)), p_hire, p_salary)
    RETURNING
        *
    INTO
        v;
    RETURN to_jsonb (v) || jsonb_build_object('branchname', v_branch_name, 'rolename', v_role_name);
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
    p_username := lower(btrim(p_username));
    IF p_username IS NULL OR length(p_username) < 3 OR length(p_username) > 100 THEN
        PERFORM banking_api.raise_error('VALIDATION', 'Tên đăng nhập phải từ 3 đến 100 ký tự.');
    END IF;
    -- Authentication is case-insensitive; serialize all customer login creation.
    PERFORM pg_advisory_xact_lock(hashtextextended('customer-login:' || p_username, 0));
    IF EXISTS (SELECT 1 FROM customer_online_account WHERE lower(btrim(username)) = p_username) THEN
        PERFORM banking_api.raise_error('CONFLICT', 'Tên đăng nhập đã được sử dụng. Vui lòng chọn tên khác.');
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
    v_id bigint;
    v_number text;
BEGIN
    PERFORM 1 FROM branch WHERE branchid=p_branch AND status='Active' FOR SHARE;
    IF NOT FOUND THEN PERFORM banking_api.raise_error('VALIDATION','Chi nhánh không tồn tại hoặc đã ngừng hoạt động.'); END IF;
    PERFORM 1 FROM account_type WHERE accounttypeid=p_type AND status='Active' FOR SHARE;
    IF NOT FOUND THEN PERFORM banking_api.raise_error('VALIDATION','Loại tài khoản không tồn tại hoặc đã ngừng hoạt động.'); END IF;
    IF p_category='CUSTOMER' THEN
        PERFORM 1 FROM customer WHERE customerid=p_customer AND status='Active' FOR SHARE;
        IF NOT FOUND THEN PERFORM banking_api.raise_error('VALIDATION','Khách hàng không tồn tại hoặc đã ngừng hoạt động.'); END IF;
    END IF;
    -- Reserve from the existing identity sequence, never MAX(accountid) + 1.
    -- Explicit numbers remain supported for existing operational scripts.
    LOOP
        v_id := nextval(pg_get_serial_sequence('banking.bank_account', 'accountid'));
        v_number := COALESCE(NULLIF(btrim(p_number), ''),
            '1' || lpad(v_id::text, GREATEST(15, length(v_id::text)), '0'));
        EXIT WHEN NULLIF(btrim(p_number), '') IS NOT NULL
            OR NOT EXISTS (SELECT 1 FROM bank_account WHERE accountnumber = v_number);
    END LOOP;
    INSERT INTO bank_account (accountid, accountnumber, branchid, accounttypeid, opendate, balance, currency, status, accountcategory)
        VALUES (v_id, v_number, p_branch, p_type, CURRENT_DATE, 0, 'VND', 'Active', p_category)
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
    v_id bigint;
    v_number text;
    v_body text;
    v_sum integer;
    v_digit integer;
    v_issue date := COALESCE(p_issue, CURRENT_DATE);
BEGIN
    IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
        PERFORM banking_api.raise_error('VALIDATION', 'PIN phải gồm 4 đến 6 chữ số.');
    END IF;
    IF p_expiry IS NULL OR p_expiry <= v_issue THEN
        PERFORM banking_api.raise_error('VALIDATION', 'Ngày hết hạn phải sau ngày phát hành.');
    END IF;
    IF p_limit IS NULL OR p_limit <= 0 OR p_limit >= 100000000000000000 OR p_limit <> round(p_limit, 2) THEN
        PERFORM banking_api.raise_error('VALIDATION', 'Hạn mức phải lớn hơn 0 và có tối đa 2 chữ số thập phân.');
    END IF;
    IF NULLIF(btrim(p_type), '') IS NULL THEN
        PERFORM banking_api.raise_error('VALIDATION', 'Vui lòng chọn hoặc nhập loại thẻ.');
    END IF;
    PERFORM 1 FROM bank_account a JOIN account_holder h USING(accountid)
        JOIN customer c USING(customerid)
        WHERE a.accountid=p_account AND c.customerid=p_customer
          AND a.status='Active' AND a.accountcategory='CUSTOMER' AND c.status='Active'
          AND h.status='Active' AND h.startdate<=CURRENT_DATE
          AND (h.enddate IS NULL OR h.enddate>=CURRENT_DATE)
        FOR SHARE OF a,h,c;
    IF NOT FOUND THEN
        PERFORM banking_api.raise_error('FORBIDDEN', 'Khách hàng không sở hữu tài khoản hợp lệ hoặc tài khoản đã ngừng hoạt động.');
    END IF;
    LOOP
        v_id := nextval(pg_get_serial_sequence('banking.card', 'cardid'));
        -- Private simulation numbering with a Luhn check digit; not a network-issued PAN.
        v_body := '9' || lpad(v_id::text, GREATEST(14,length(v_id::text)), '0');
        v_sum := 0;
        FOR i IN 1..length(v_body) LOOP
            v_digit := substr(v_body,length(v_body)-i+1,1)::integer;
            IF i % 2 = 1 THEN v_digit := v_digit * 2; END IF;
            v_sum := v_sum + CASE WHEN v_digit>9 THEN v_digit-9 ELSE v_digit END;
        END LOOP;
        v_number := COALESCE(NULLIF(btrim(p_number),''),v_body||((10-v_sum%10)%10)::text);
        EXIT WHEN NULLIF(btrim(p_number),'') IS NOT NULL
            OR NOT EXISTS(SELECT 1 FROM card WHERE cardnumber=v_number);
    END LOOP;
INSERT INTO card (cardid, cardnumber, accountid, issuedate, expirydate, cardtype, pinhash, status, dailylimit, customerid)
        VALUES (v_id, v_number, p_account, v_issue, p_expiry, btrim(p_type), public.crypt(p_pin, public.gen_salt('bf', 12)), 'Active', p_limit, p_customer)
RETURNING
    *
INTO
    v;
    RETURN (to_jsonb (v) - 'cardnumber' - 'pinhash') || jsonb_build_object('maskedcardnumber',repeat('*',GREATEST(length(v.cardnumber)-4,0))||right(v.cardnumber,4));
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
    IF p_old_pin IS NULL OR NOT FOUND OR COALESCE(public.crypt(p_old_pin, v_hash) <> v_hash, TRUE) THEN
        PERFORM
            banking_api.raise_error ('AUTH_INVALID', 'current PIN is invalid');
    END IF;
    UPDATE
        card
    SET
        pinhash = public.crypt(p_new_pin, public.gen_salt('bf', 12))
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
    v_id bigint;
    v_code text;
BEGIN
    IF p_principal IS NULL OR p_principal<=0 OR p_principal>=100000000000000000 OR p_principal<>round(p_principal,2) THEN
        PERFORM banking_api.raise_error('VALIDATION','Số tiền vay phải lớn hơn 0 và có tối đa 2 chữ số thập phân.');
    END IF;
    IF p_rate IS NULL OR p_rate<0 OR p_rate>=10000 OR p_rate<>round(p_rate,4) OR p_months IS NULL OR p_months<=0 OR p_start IS NULL THEN
        PERFORM banking_api.raise_error('VALIDATION','Lãi suất, kỳ hạn hoặc ngày bắt đầu không hợp lệ.');
    END IF;
    PERFORM 1 FROM customer WHERE customerid=p_customer AND status='Active' FOR SHARE;
    IF NOT FOUND THEN PERFORM banking_api.raise_error('VALIDATION','Khách hàng không tồn tại hoặc đã ngừng hoạt động.'); END IF;
    SELECT
        *
    INTO
        v_type
    FROM
        loan_type
    WHERE
        loantypeid = p_type
        AND status = 'Active' FOR SHARE;
    IF NOT FOUND THEN
        PERFORM
            banking_api.raise_error ('NOT_FOUND', 'Sản phẩm vay không tồn tại hoặc đã ngừng hoạt động.');
    END IF;
    IF p_principal > v_type.maxamount OR p_months > v_type.maxtermmonths THEN
        PERFORM
            banking_api.raise_error ('VALIDATION', 'Số tiền hoặc kỳ hạn vượt giới hạn của sản phẩm vay.');
    END IF;
    LOOP
        v_id := nextval(pg_get_serial_sequence('banking.loan','loanid'));
        v_code := COALESCE(NULLIF(btrim(p_code),''),'LN'||lpad(v_id::text,GREATEST(8,length(v_id::text)),'0'));
        EXIT WHEN NULLIF(btrim(p_code),'') IS NOT NULL OR NOT EXISTS(SELECT 1 FROM loan WHERE loancode=v_code);
    END LOOP;
    INSERT INTO loan (loanid, loancode, customerid, branchid, employeeid, loantypeid, principalamount, interestrate, termmonths, startdate, enddate, status)
        VALUES (v_id, v_code, p_customer, p_branch, p_employee, p_type, p_principal, p_rate, p_months, p_start, (p_start + (p_months || ' months')::interval)::date, 'Pending')
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
    IF NOT banking_api.loan_is_funded(p_loan) THEN
        PERFORM banking_api.raise_error('CONFLICT','Khoản vay chỉ được kích hoạt sau khi giải ngân thành công.');
    END IF;
    -- The interest clock starts on actual funding, including a delayed REVIEW.
    v.startdate := CURRENT_DATE;
    v.enddate := (v.startdate+(v.termmonths||' months')::interval)::date;
    -- Truncate regular installments so the final principal never becomes negative
    -- for small loans with many installments.
    v_base := trunc(v.principalamount / v.termmonths, 2);
    v_interest := round(v.principalamount * (v.interestrate / 100) / 12, 2);
    FOR v_i IN 1..v.termmonths LOOP
        v_principal := CASE WHEN v_i = v.termmonths THEN
            v.principalamount - v_base * (v.termmonths - 1)
        ELSE
            v_base
        END;
        INSERT INTO repayment_schedule (loanid, installmentno, duedate, principaldue, interestdue, penaltydue, status)
            VALUES (v.loanid, v_i, (v.startdate + (v_i || ' months')::interval)::date, v_principal, v_interest, 0,
                CASE WHEN v_principal+v_interest=0 THEN 'Paid' ELSE 'Pending' END);
    END LOOP;
    UPDATE
        loan
    SET
        status = 'Active', startdate=v.startdate, enddate=v.enddate
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

