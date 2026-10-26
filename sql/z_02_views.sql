-- ============================================================================
-- D4 BANK - OPERATIONAL VIEWS
-- Reusable read models consumed by PostgreSQL API functions.
-- ============================================================================

SET search_path TO banking;

CREATE OR REPLACE VIEW vw_customer_detail AS
SELECT
    c.customerid,
    c.customercode,
    c.fullname,
    c.gender,
    c.dateofbirth,
    c.phone,
    c.email,
    c.address,
    c.occupation,
    c.customertype,
    c.customersegment,
    c.createddate,
    c.status,
    coa.username,
    coa.registereddate,
    coa.lastlogin,
    coa.isactive AS onlineactive
FROM
    customer c
    LEFT JOIN customer_online_account coa USING (customerid);

CREATE OR REPLACE VIEW vw_employee_detail AS
SELECT
    e.employeeid,
    e.employeecode,
    e.fullname,
    e.gender,
    e.dateofbirth,
    e.phone,
    e.email,
    e.hiredate,
    e.salary,
    e.status,
    e.branchid,
    b.branchcode,
    b.branchname,
    e.roleid,
    r.rolename,
    su.userid,
    su.username,
    su.lastlogin,
    su.isactive
FROM
    employee e
    JOIN branch b USING (branchid)
    JOIN role r USING (roleid)
    LEFT JOIN "system_user" su USING (employeeid);

CREATE OR REPLACE VIEW vw_branch_summary AS
SELECT
    b.*,
    count(DISTINCT e.employeeid) AS employeecount,
    count(DISTINCT ba.accountid) AS accountcount,
    count(DISTINCT ah.customerid) AS customercount
FROM
    branch b
    LEFT JOIN employee e USING (branchid)
    LEFT JOIN bank_account ba USING (branchid)
    LEFT JOIN account_holder ah ON ah.accountid = ba.accountid
        AND ah.status = 'Active'
GROUP BY
    b.branchid;

CREATE OR REPLACE VIEW vw_account_detail AS
SELECT
    ba.accountid,
    ba.accountnumber,
    ba.branchid,
    b.branchcode,
    b.branchname,
    ba.accounttypeid,
    at.typename AS accounttypename,
    at.minbalance,
    ba.balance,
    ba.balance - at.minbalance AS availablebalance,
    ba.currency,
    ba.status,
    ba.accountcategory,
    ba.opendate,
    ah.customerid,
    ah.holdertype,
    ah.startdate,
    ah.enddate
FROM
    bank_account ba
    JOIN branch b USING (branchid)
    JOIN account_type at USING (accounttypeid)
    LEFT JOIN account_holder ah ON ah.accountid = ba.accountid
        AND ah.status = 'Active';

CREATE OR REPLACE VIEW vw_transaction_posting_balance AS
SELECT
    transactionid,
    count(*) FILTER (WHERE postingtype = 'DEBIT') AS debitcount,
    count(*) FILTER (WHERE postingtype = 'CREDIT') AS creditcount,
    COALESCE(sum(amount) FILTER (WHERE postingtype = 'DEBIT'), 0) AS debitamount,
    COALESCE(sum(amount) FILTER (WHERE postingtype = 'CREDIT'), 0) AS creditamount,
    COALESCE(sum(amount) FILTER (WHERE postingtype = 'DEBIT'), 0) = COALESCE(sum(amount) FILTER (WHERE postingtype = 'CREDIT'), 0) AS isbalanced
FROM
    transaction_posting
GROUP BY
    transactionid;

CREATE OR REPLACE VIEW vw_transaction_detail AS
SELECT
    bt.transactionid,
    bt.transactioncode,
    tt.typecode,
    tt.typename,
    bt.channel,
    bt.amount,
    bt.fee,
    bt.currency,
    bt.transactiondate,
    bt.status,
    bt.initiatedbycustomerid,
    bt.employeeid,
    bt.deviceid,
    bt.description,
    bt.originaltransactionid,
    tr.sourceaccountid,
    tr.destinationaccountid,
    tr.idempotencykey,
    tr.status AS transferstatus,
    ra.riskassessmentid,
    ra.rulescore,
    ra.risklevel,
    ra.modelprobability,
    ra.decision,
    ra.reasonjson,
    ra.assessedat,
    rc.reviewcaseid,
    rc.status AS reviewstatus,
    rc.revieweruserid,
    rc.createdat AS reviewcreatedat,
    rc.reviewedat
FROM
    bank_transaction bt
    JOIN transaction_type tt USING (transactiontypeid)
    LEFT JOIN transfer_request tr USING (transactionid)
    LEFT JOIN LATERAL (
        SELECT
            r.*
        FROM
            risk_assessment r
        WHERE
            r.transactionid = bt.transactionid
        ORDER BY
            assessedat DESC,
            riskassessmentid DESC
        LIMIT 1) ra ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            c.*
        FROM
            review_case c
        WHERE
            c.transactionid = bt.transactionid
        ORDER BY
            createdat DESC,
            reviewcaseid DESC
        LIMIT 1) rc ON TRUE;

CREATE OR REPLACE VIEW vw_customer_cards AS
SELECT
    c.cardid,
    c.customerid,
    c.accountid,
    repeat('*', GREATEST (length(c.cardnumber) - 4, 0)) ||
    right (c.cardnumber,
        4) AS maskedcardnumber,
    c.issuedate,
    c.expirydate,
    c.cardtype,
    c.status,
    c.dailylimit
FROM
    card c;

CREATE OR REPLACE VIEW vw_customer_loan_detail AS
SELECT
    l.*,
    lt.loantypename,
    COALESCE(sum(rs.principaldue + rs.interestdue + rs.penaltydue) FILTER (WHERE rs.status IN ('Pending', 'Partial', 'Overdue')), 0) AS outstandingamount,
    min(rs.duedate) FILTER (WHERE rs.status IN ('Pending', 'Partial', 'Overdue')) AS nextduedate
FROM
    loan l
    JOIN loan_type lt USING (loantypeid)
    LEFT JOIN repayment_schedule rs USING (loanid)
GROUP BY
    l.loanid,
    lt.loantypename;

CREATE OR REPLACE VIEW vw_open_review_cases AS
SELECT
    v.*
FROM
    vw_transaction_detail v
WHERE
    v.reviewstatus IN ('OPEN', 'IN_REVIEW');

CREATE OR REPLACE VIEW vw_customer_notifications AS
SELECT
    notificationoutboxid,
    customerid,
    transactionid,
    notificationtype,
    status,
    createdat,
    sentat
FROM
    notification_outbox;

