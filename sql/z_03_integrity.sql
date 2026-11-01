-- ============================================================================
-- D4 BANK - DATA INTEGRITY AND AUDIT TRIGGERS
-- Protects balances, postings, transaction history, and auditability.
-- ============================================================================

SET search_path TO banking;

-- Account timestamps and status history.
CREATE OR REPLACE FUNCTION fn_touch_account_updatedat ()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
BEGIN
    NEW.updatedat := clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_account_updatedat ON bank_account;

CREATE TRIGGER trg_touch_account_updatedat
    BEFORE UPDATE ON bank_account
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_account_updatedat ();

CREATE OR REPLACE FUNCTION fn_record_account_status ()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_user integer := banking_api.request_user_id ();
    v_employee integer;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        SELECT
            employeeid
        INTO
            v_employee
        FROM
            "system_user"
        WHERE
            userid = v_user;
        INSERT INTO account_status_history (accountid, oldstatus, newstatus, changedbytype, employeeid, reason)
            VALUES (NEW.accountid, OLD.status, NEW.status, CASE WHEN v_employee IS NULL THEN
                    'System'
                ELSE
                    'Employee'
                END, v_employee, NULLIF (current_setting('app.change_reason', true), ''));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_account_status ON bank_account;

CREATE TRIGGER trg_record_account_status
    AFTER UPDATE OF status ON bank_account
    FOR EACH ROW
    EXECUTE FUNCTION fn_record_account_status ();

-- Deferred validation executed at transaction commit.
CREATE OR REPLACE FUNCTION fn_validate_financial_commit ()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_id bigint := COALESCE(NEW.transactionid, OLD.transactionid);
    v_status text;
    v_amount numeric(19, 2);
    v_debit numeric(19, 2);
    v_credit numeric(19, 2);
BEGIN
    SELECT
        status,
        amount
    INTO
        v_status,
        v_amount
    FROM
        bank_transaction
    WHERE
        transactionid = v_id;
    IF v_status = 'Success' THEN
        SELECT
            COALESCE(sum(amount) FILTER (WHERE postingtype = 'DEBIT'), 0),
            COALESCE(sum(amount) FILTER (WHERE postingtype = 'CREDIT'), 0)
        INTO
            v_debit,
            v_credit
        FROM
            transaction_posting
        WHERE
            transactionid = v_id;
        IF v_debit <= 0 OR v_credit <= 0 OR v_debit <> v_credit OR v_debit <> v_amount THEN
            RAISE EXCEPTION 'INTEGRITY:transaction % postings do not reconcile to transaction amount', v_id;
        END IF;
        IF NOT EXISTS (
            SELECT
                1
            FROM
                event_outbox
            WHERE
                aggregateid = v_id::text
                AND eventtype = 'TransactionCompleted') THEN
            RAISE EXCEPTION 'INTEGRITY:successful transaction % has no committed outbox event', v_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transaction_commit ON bank_transaction;

CREATE CONSTRAINT TRIGGER trg_validate_transaction_commit
    AFTER INSERT OR UPDATE OF status ON bank_transaction DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_financial_commit ();

DROP TRIGGER IF EXISTS trg_validate_posting_commit ON transaction_posting;

CREATE CONSTRAINT TRIGGER trg_validate_posting_commit
    AFTER INSERT OR UPDATE OR DELETE ON transaction_posting DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_financial_commit ();

-- Successful financial records are immutable and must be reversed instead.
CREATE OR REPLACE FUNCTION fn_protect_financial_history ()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_status text;
BEGIN
    IF TG_TABLE_NAME = 'transaction_posting' THEN
        SELECT
            status
        INTO
            v_status
        FROM
            bank_transaction
        WHERE
            transactionid = OLD.transactionid;
        IF v_status = 'Success' THEN
            RAISE EXCEPTION 'IMMUTABLE:postings of a successful transaction cannot be changed';
        END IF;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'Success' THEN
            RAISE EXCEPTION 'IMMUTABLE:a successful transaction must be reversed, not deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status = 'Success' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'IMMUTABLE:a successful transaction must be reversed, not modified';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_final_posting ON transaction_posting;

CREATE TRIGGER trg_protect_final_posting
    BEFORE UPDATE OR DELETE ON transaction_posting
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_financial_history ();

DROP TRIGGER IF EXISTS trg_protect_success_status ON bank_transaction;

DROP TRIGGER IF EXISTS trg_protect_success_transaction ON bank_transaction;

CREATE TRIGGER trg_protect_success_transaction
    BEFORE UPDATE OR DELETE ON bank_transaction
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_financial_history ();

-- Shared audit trigger for operational entities.
CREATE OR REPLACE FUNCTION fn_audit_change ()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = banking, pg_temp
    AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_id text;
    v_action text;
BEGIN
    v_old := CASE WHEN TG_OP = 'INSERT' THEN
        NULL
    ELSE
        to_jsonb (OLD)
    END;
    v_new := CASE WHEN TG_OP = 'DELETE' THEN
        NULL
    ELSE
        to_jsonb (NEW)
    END;
    v_id := COALESCE(v_new ->> TG_ARGV[1], v_old ->> TG_ARGV[1]);
    v_action := CASE WHEN TG_OP = 'INSERT' THEN
        'INSERT'
    WHEN TG_OP = 'DELETE' THEN
        'DELETE'
    WHEN v_old ->> 'status' IS DISTINCT FROM v_new ->> 'status' THEN
        'STATUS_CHANGE'
    ELSE
        'UPDATE'
    END;
    INSERT INTO audit_log (userid, entitytype, entityid, action, oldvalue, newvalue, ipaddress)
        VALUES (banking_api.request_user_id (), TG_ARGV[0], v_id, v_action, v_old, v_new, banking_api.request_ip ());
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_customer ON customer;

CREATE TRIGGER trg_audit_customer
    AFTER INSERT OR UPDATE OR DELETE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_change ('CUSTOMER', 'customerid');

DROP TRIGGER IF EXISTS trg_audit_account ON bank_account;

CREATE TRIGGER trg_audit_account
    AFTER INSERT OR UPDATE OR DELETE ON bank_account
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_change ('BANK_ACCOUNT', 'accountid');

DROP TRIGGER IF EXISTS trg_audit_card ON card;

CREATE TRIGGER trg_audit_card
    AFTER INSERT OR UPDATE OR DELETE ON card
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_change ('CARD', 'cardid');

DROP TRIGGER IF EXISTS trg_audit_loan ON loan;

CREATE TRIGGER trg_audit_loan
    AFTER INSERT OR UPDATE OR DELETE ON loan
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_change ('LOAN', 'loanid');

DROP TRIGGER IF EXISTS trg_audit_review ON review_case;

CREATE TRIGGER trg_audit_review
    AFTER INSERT OR UPDATE OR DELETE ON review_case
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_change ('REVIEW_CASE', 'reviewcaseid');

DROP TRIGGER IF EXISTS trg_audit_transaction ON bank_transaction;

CREATE TRIGGER trg_audit_transaction
    AFTER INSERT OR UPDATE OR DELETE ON bank_transaction
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_change ('BANK_TRANSACTION', 'transactionid');

