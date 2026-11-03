-- Run from repository root with psql -v ON_ERROR_STOP=1.
-- Every data/function change is rolled back, including the deterministic risk stub.
-- Identity sequences can advance; no financial record or balance change is committed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
\ir ../../sql/z_04_financial_operations.sql
SELECT set_config('app.fraud_model',jsonb_build_object('version','v1','modelVersionId',(
    SELECT modelversionid FROM banking.model_version WHERE modelname='fraud_detection_v1' AND status='ACTIVE' ORDER BY modelversionid DESC LIMIT 1
))::text,true);
CREATE OR REPLACE FUNCTION pg_temp.expect_error(query text, pattern text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE query;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE pattern THEN RETURN; END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'Expected error matching %', pattern;
END $$;
-- Isolate each financial branch from ambient login history/time/model scores.
CREATE OR REPLACE FUNCTION banking_api.calculate_risk(p_customer_id bigint,p_device_id bigint,p_amount numeric,p_at timestamp DEFAULT clock_timestamp())
RETURNS jsonb LANGUAGE sql STABLE AS $$
SELECT jsonb_build_object('ruleScore',CASE current_setting('d4.test_decision') WHEN 'BLOCK' THEN 80 WHEN 'REVIEW' THEN 60 ELSE 0 END,
'riskLevel',CASE current_setting('d4.test_decision') WHEN 'BLOCK' THEN 'CRITICAL' WHEN 'REVIEW' THEN 'HIGH' ELSE 'LOW' END,
'modelProbability',0,'decision',current_setting('d4.test_decision'),'triggeredRules','[]'::jsonb,'features','{}'::jsonb)
$$;
DO $$
DECLARE
    owner_id bigint; source_id bigint; destination_id bigint; internal_id bigint;
    actor_id integer; employee_id integer; branch_id integer;
    loan_id bigint; schedule_id bigint; loan_type integer;
    prefix text := 'audit-' || substr(md5(random()::text),1,12);
    first_result jsonb; replay jsonb; pending_result jsonb; result jsonb;
    review_id bigint; balance_before numeric; destination_before numeric;
    core_query text; other_owner bigint;
BEGIN
    SELECT c.customerid,a.accountid,b.accountid,a.branchid
    INTO STRICT owner_id,source_id,destination_id,branch_id
    FROM banking.customer c JOIN banking.account_holder h USING(customerid)
    JOIN banking.bank_account a USING(accountid)
    CROSS JOIN banking.bank_account b
    WHERE c.customercode='DEMO-CUSTOMER' AND a.accountnumber='DEMO-0001' AND b.accountnumber='DEMO-0002';
    SELECT su.userid,e.employeeid INTO STRICT actor_id,employee_id
    FROM banking.system_user su JOIN banking.employee e USING(employeeid) JOIN banking.role r USING(roleid)
    WHERE su.isactive AND e.status='Active' AND (lower(r.rolename) LIKE '%admin%' OR r.rolename='Quản trị hệ thống') LIMIT 1;
    SELECT customerid INTO STRICT other_owner FROM banking.customer WHERE customerid<>owner_id LIMIT 1;
    SELECT accountid INTO STRICT internal_id FROM banking.bank_account WHERE accountcategory='INTERNAL' AND status='Active' LIMIT 1;
    SELECT balance INTO balance_before FROM banking.bank_account WHERE accountid=source_id;
    SELECT balance INTO destination_before FROM banking.bank_account WHERE accountid=destination_id;
    PERFORM set_config('d4.test_decision','ALLOW',true);
    core_query := format('SELECT banking_api.create_transfer(%s,%s,%s,1000,%L,''InternetBanking'',NULL,NULL,''audit'')',owner_id,source_id,destination_id,prefix);
    EXECUTE core_query INTO first_result;
    ASSERT first_result->>'status'='Success';
    EXECUTE core_query INTO replay;
    ASSERT replay->>'transactionid'=first_result->>'transactionid';
    ASSERT (SELECT count(*) FROM banking.transaction_posting WHERE transactionid=(first_result->>'transactionid')::bigint)=2;
    ASSERT (SELECT balance FROM banking.bank_account WHERE accountid=source_id)=balance_before-1000;
    ASSERT (SELECT balance FROM banking.bank_account WHERE accountid=destination_id)=destination_before+1000;
    ASSERT (SELECT count(*) FROM banking.event_outbox WHERE aggregateid=first_result->>'transactionid' AND eventtype='TransactionCompleted')=1;
    PERFORM pg_temp.expect_error(replace(core_query,',1000,',',1001,'),'CONFLICT:%');
    PERFORM pg_temp.expect_error(replace(core_query,format('create_transfer(%s,',owner_id),format('create_transfer(%s,',other_owner)),'FORBIDDEN:%');
    PERFORM pg_temp.expect_error(format('SELECT banking_api.create_transfer(%s,%s,%s,1.001,%L,''InternetBanking'')',owner_id,source_id,destination_id,prefix||'-fraction'),'VALIDATION:%');
    PERFORM pg_temp.expect_error(format('SELECT banking_api.create_transfer(%s,%s,%s,1000,%L,''InternetBanking'')',owner_id,source_id,internal_id,prefix||'-internal'),'VALIDATION:%');
    result := banking_api.create_transfer(owner_id,source_id,destination_id,balance_before+100000000,prefix||'-funds','InternetBanking');
    ASSERT result->>'status'='Failed';
    ASSERT NOT EXISTS(SELECT 1 FROM banking.transaction_posting WHERE transactionid=(result->>'transactionid')::bigint);
    -- Pending review never debits; approving rechecks balance and commits both postings together.
    PERFORM set_config('d4.test_decision','REVIEW',true);
    pending_result := banking_api.create_transfer(owner_id,source_id,destination_id,1000,prefix||'-review','InternetBanking');
    ASSERT pending_result->>'status'='Pending';
    PERFORM pg_temp.expect_error(format('SELECT banking_api.post_balanced_transaction(%s,%s,%s,1000)',
        pending_result->>'transactionid',source_id,destination_id),'FORBIDDEN:%');
    ASSERT NOT EXISTS(SELECT 1 FROM banking.transaction_posting WHERE transactionid=(pending_result->>'transactionid')::bigint);
    SELECT reviewcaseid INTO review_id FROM banking.review_case WHERE transactionid=(pending_result->>'transactionid')::bigint;
    result := banking_api.resolve_review(review_id,actor_id,'APPROVE','audit');
    ASSERT result->>'status'='Success';
    replay := banking_api.resolve_review(review_id,actor_id,'APPROVE','audit');
    ASSERT result->>'transactionid'=replay->>'transactionid';
    pending_result := banking_api.create_transfer(owner_id,source_id,destination_id,1000,prefix||'-reject','InternetBanking');
    SELECT reviewcaseid INTO review_id FROM banking.review_case WHERE transactionid=(pending_result->>'transactionid')::bigint;
    result := banking_api.resolve_review(review_id,actor_id,'REJECT','audit');
    ASSERT result->>'status'='Cancelled';
    ASSERT NOT EXISTS(SELECT 1 FROM banking.transaction_posting WHERE transactionid=(result->>'transactionid')::bigint);
    PERFORM set_config('d4.test_decision','BLOCK',true);
    result := banking_api.create_transfer(owner_id,source_id,destination_id,1000,prefix||'-block','InternetBanking');
    ASSERT result->>'status'='Cancelled';
    ASSERT NOT EXISTS(SELECT 1 FROM banking.transaction_posting WHERE transactionid=(result->>'transactionid')::bigint);
    -- Customer/customer movements cannot bypass transfer destination rules or OTP at the API.
    PERFORM pg_temp.expect_error(format('SELECT banking_api.create_account_movement(''WITHDRAWAL'',%s,%s,%s,1000,%L,''Counter'',%s)',owner_id,source_id,destination_id,prefix||'-badmove',employee_id),'VALIDATION:%');
    PERFORM set_config('d4.test_decision','ALLOW',true);
    result := banking_api.create_account_movement('WITHDRAWAL',owner_id,source_id,internal_id,1000,prefix||'-move','Counter',employee_id,'audit');
    replay := banking_api.create_account_movement('WITHDRAWAL',owner_id,source_id,internal_id,1000,prefix||'-move','Counter',employee_id,'audit');
    ASSERT result->>'transactionid'=replay->>'transactionid';
    PERFORM pg_temp.expect_error(format('SELECT banking_api.create_account_movement(''WITHDRAWAL'',%s,%s,%s,1001,%L,''Counter'',%s,''audit'')',owner_id,source_id,internal_id,prefix||'-move',employee_id),'CONFLICT:%');
    -- Exact reversal retry is idempotent and preserves immutable original postings.
    result := banking_api.reverse_transaction((first_result->>'transactionid')::bigint,employee_id,prefix||'-reverse','audit');
    ASSERT result->>'status'='Success';
    replay := banking_api.reverse_transaction((first_result->>'transactionid')::bigint,employee_id,prefix||'-reverse','audit');
    ASSERT result->>'transactionid'=replay->>'transactionid';
    -- A loan installment cannot accumulate two pending payments with different request codes.
    SELECT loantypeid INTO STRICT loan_type FROM banking.loan_type LIMIT 1;
    INSERT INTO banking.loan(loancode,customerid,branchid,employeeid,loantypeid,principalamount,interestrate,termmonths,startdate,enddate,status)
    VALUES(prefix,owner_id,branch_id,employee_id,loan_type,1000,0,1,CURRENT_DATE,CURRENT_DATE+30,'Active') RETURNING loanid INTO loan_id;
    INSERT INTO banking.repayment_schedule(loanid,installmentno,duedate,principaldue,interestdue,status)
    VALUES(loan_id,1,CURRENT_DATE+30,1000,0,'Pending') RETURNING scheduleid INTO schedule_id;
    PERFORM set_config('d4.test_decision','REVIEW',true);
    result := banking_api.pay_loan(owner_id,loan_id,schedule_id,source_id,internal_id,1000,prefix||'-loan','Online');
    replay := banking_api.pay_loan(owner_id,loan_id,schedule_id,source_id,internal_id,1000,prefix||'-loan','Online');
    ASSERT result->>'transactionid'=replay->>'transactionid';
    PERFORM pg_temp.expect_error(format('SELECT banking_api.pay_loan(%s,%s,%s,%s,%s,1000,%L,''Online'')',owner_id,loan_id,schedule_id,source_id,internal_id,prefix||'-loan2'),'CONFLICT:%');
    SELECT reviewcaseid INTO review_id FROM banking.review_case WHERE transactionid=(result->>'transactionid')::bigint;
    result := banking_api.resolve_review(review_id,actor_id,'APPROVE','audit');
    ASSERT result->>'status'='Success';
    ASSERT (SELECT status FROM banking.repayment_schedule WHERE scheduleid=schedule_id)='Paid';
    ASSERT (SELECT count(*) FROM banking.loan_payment WHERE loanid=loan_id)=1;
    PERFORM pg_temp.expect_error(format('SELECT banking_api.reverse_transaction(%s,%s,%L,''audit'')',
        result->>'transactionid',employee_id,prefix||'-loan-reverse'),'CONFLICT:loan payment reversal%');
    -- Simulate a failure after financial posting; PostgreSQL must undo every effect.
    SELECT balance INTO balance_before FROM banking.bank_account WHERE accountid=source_id;
    PERFORM set_config('d4.test_decision','ALLOW',true);
    BEGIN
        PERFORM banking_api.create_transfer(owner_id,source_id,destination_id,1000,prefix||'-rollback','InternetBanking');
        RAISE EXCEPTION 'audit injected failure before commit';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'audit injected failure before commit' THEN RAISE; END IF;
    END;
    ASSERT (SELECT balance FROM banking.bank_account WHERE accountid=source_id)=balance_before;
    ASSERT NOT EXISTS(SELECT 1 FROM banking.transfer_request WHERE idempotencykey=prefix||'-rollback');
    RAISE NOTICE 'PASS: financial outcomes, replay isolation, movement direction, review, reversal and loan payment';
END $$;
-- Force deferred commit invariants without committing anything.
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
