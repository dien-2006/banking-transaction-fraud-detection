"""Financial review regression tests; write fixtures require an isolated d4_* DB."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import json
import os
from threading import Barrier
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
import pytest

from scripts.postgres_config import postgres_dsn

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_BANKING_INTEGRATION") != "1",
    reason="requires an isolated PostgreSQL test database",
)


def connect():
    return psycopg.connect(postgres_dsn(), row_factory=dict_row,
                           options="-c search_path=banking,public -c lock_timeout=5000 -c statement_timeout=10000")


@pytest.fixture(scope="module")
def actors():
    if not os.environ.get("POSTGRES_DB", "").startswith("d4_"):
        pytest.skip("review write fixtures require an isolated d4_* database")
    suffix = uuid4().hex[:10]
    with connect() as db:
        assert db.execute("SELECT current_database() AS name").fetchone()["name"].startswith("d4_")
        original = db.execute("SELECT pg_get_functiondef('banking_api.calculate_risk(bigint,bigint,numeric,timestamp)'::regprocedure) AS definition").fetchone()["definition"]
        # Isolate financial review behavior from the model and ambient history.
        db.execute("""CREATE OR REPLACE FUNCTION banking_api.calculate_risk(
            p_customer_id bigint,p_device_id bigint,p_amount numeric,p_at timestamp DEFAULT clock_timestamp())
            RETURNS jsonb LANGUAGE sql STABLE AS $$
            SELECT jsonb_build_object('ruleScore',60,'riskLevel','HIGH',
              'modelProbability',0.65,'decision','REVIEW','triggeredRules','[]'::jsonb,'features','{}'::jsonb)
            $$""")
        branch = db.execute("""INSERT INTO branch(branchcode,branchname,address,city,opendate)
            VALUES(%s,'Review guard test','Test address','Test city',CURRENT_DATE) RETURNING branchid""", (f"RG-{suffix}",)).fetchone()["branchid"]
        role = db.execute("INSERT INTO role(rolename) VALUES(%s) RETURNING roleid", (f"Review admin {suffix}",)).fetchone()["roleid"]
        account_type = db.execute("INSERT INTO account_type(typename,minbalance) VALUES(%s,0) RETURNING accounttypeid", (f"Review guard {suffix}",)).fetchone()["accounttypeid"]
        model = db.execute("INSERT INTO model_version(modelname,modeltype,status) VALUES(%s,'XGBOOST','ACTIVE') RETURNING modelversionid", (f"review-guard-{suffix}",)).fetchone()["modelversionid"]
        users = []
        for index in range(2):
            employee = db.execute("""INSERT INTO employee(employeecode,branchid,roleid,fullname,phone,email,hiredate,salary)
                VALUES(%s,%s,%s,'Review Guard Tester',%s,%s,CURRENT_DATE,0) RETURNING employeeid""",
                (f"RG{index}-{suffix}",branch,role,f"{index}{suffix}",f"{index}-{suffix}@example.invalid")).fetchone()["employeeid"]
            users.append(db.execute('''INSERT INTO "system_user"(employeeid,username,passwordhash) VALUES(%s,%s,'test-only-unused-hash') RETURNING userid''',
                                    (employee,f"rg{index}-{suffix}")).fetchone()["userid"])
    try:
        yield {"users": users, "branch": branch, "account_type": account_type, "model": model}
    finally:
        with connect() as db:
            db.execute(original)


@pytest.fixture
def case(actors):
    suffix = uuid4().hex[:12]
    with connect() as db:
        customer = db.execute("INSERT INTO customer(customercode,fullname) VALUES(%s,'Review Guard Customer') RETURNING customerid", (f"RG-{suffix}",)).fetchone()["customerid"]
        accounts = []
        for index, balance in enumerate((10000, 5000)):
            account = db.execute("""INSERT INTO bank_account(accountnumber,branchid,accounttypeid,opendate,balance,accountcategory)
                VALUES(%s,%s,%s,CURRENT_DATE,%s,'CUSTOMER') RETURNING accountid""",
                (f"RG-{index}-{suffix}",actors["branch"],actors["account_type"],balance)).fetchone()["accountid"]
            db.execute("INSERT INTO account_holder(accountid,customerid,holdertype,startdate,status) VALUES(%s,%s,'PRIMARY_OWNER',CURRENT_DATE,'Active')", (account,customer))
            accounts.append(account)
    return {**actors, "customer": customer, "source": accounts[0], "destination": accounts[1]}


def create_case(case, amount="1000"):
    with connect() as db:
        db.execute("SELECT set_config('app.fraud_model',%s,true)", (json.dumps({"version":"review-test","modelVersionId":case["model"]}),))
        result = db.execute("SELECT banking_api.create_transfer(%s,%s,%s,%s,%s,'InternetBanking') AS result",
                            (case["customer"],case["source"],case["destination"],amount,f"review-test-{uuid4()}" )).fetchone()["result"]
        review = db.execute("SELECT reviewcaseid FROM review_case WHERE transactionid=%s", (result["transactionid"],)).fetchone()["reviewcaseid"]
        # Keep elapsed-time assertions independent of small host clock corrections.
        db.execute("UPDATE review_case SET createdat=clock_timestamp()-interval '1 minute' WHERE reviewcaseid=%s", (review,))
    return {**case, "transaction": result["transactionid"], "review": review}


def resolve(case, action="APPROVE", actor=None, reason="review test"):
    with connect() as db:
        return db.execute("SELECT banking_api.resolve_review(%s,%s,%s,%s) AS result",
                          (case["review"],actor or case["users"][0],action,reason)).fetchone()["result"]


def evidence(case, db=None):
    if db is None:
        with connect() as connection:
            return evidence(case, connection)
    return db.execute("""SELECT rc.status AS review_status,rc.revieweruserid,rc.reviewedat,rc.reason,
        bt.status AS transaction_status,tr.status AS transfer_status,
        (SELECT balance FROM bank_account WHERE accountid=%s) AS source_balance,
        (SELECT balance FROM bank_account WHERE accountid=%s) AS destination_balance,
        (SELECT count(*) FROM transaction_posting WHERE transactionid=bt.transactionid) AS postings,
        (SELECT count(*) FROM event_outbox WHERE aggregateid=bt.transactionid::text) AS events,
        (SELECT count(*) FROM notification_outbox WHERE transactionid=bt.transactionid) AS notifications,
        (SELECT count(*) FROM audit_log WHERE entitytype='REVIEW_CASE' AND entityid=rc.reviewcaseid::text) AS review_audits
        FROM review_case rc JOIN bank_transaction bt USING(transactionid) LEFT JOIN transfer_request tr USING(transactionid)
        WHERE rc.reviewcaseid=%s""", (case["source"],case["destination"],case["review"])).fetchone()


@pytest.mark.parametrize("action,expected,postings", [("APPROVE","Success",2),("REJECT","Cancelled",0)])
def test_review_and_exact_retry_have_one_financial_effect(case, action, expected, postings):
    case = create_case(case)
    first = resolve(case, action)
    before_retry = evidence(case)
    second = resolve(case, action)
    assert first["status"] == second["status"] == expected
    assert first["transactionid"] == second["transactionid"]
    assert evidence(case) == before_retry
    assert before_retry["postings"] == postings
    assert before_retry["source_balance"] == Decimal(9000 if action == "APPROVE" else 10000)
    assert before_retry["destination_balance"] == Decimal(6000 if action == "APPROVE" else 5000)
    with pytest.raises(psycopg.errors.RaiseException, match="CONFLICT:review already resolved"):
        resolve(case, action, reason="different retry")


@pytest.mark.parametrize("action", [None,"INVALID"])
def test_invalid_review_action_is_rejected_without_side_effects(case, action):
    case = create_case(case)
    before = evidence(case)
    with pytest.raises(psycopg.errors.RaiseException, match="VALIDATION:invalid action"):
        resolve(case, action)
    assert evidence(case) == before


def test_approved_review_can_fail_for_insufficient_balance(case):
    case = create_case(case, amount="20000")
    assert resolve(case)["status"] == "Failed"
    before_retry = evidence(case)
    assert before_retry["review_status"] == "APPROVED"
    assert before_retry["postings"] == 0
    assert before_retry["source_balance"] == Decimal(10000)
    assert resolve(case)["status"] == "Failed"
    assert evidence(case) == before_retry


@pytest.mark.parametrize("action", ["APPROVE","REJECT"])
def test_staff_review_list_returns_saved_reason_without_exposing_it_in_customer_result(case, action):
    case = create_case(case)
    reason = "Đã xác minh thông tin.\nGhi chú thẩm định kiểm thử."
    resolve(case, action, reason=reason)
    with connect() as db:
        result = db.execute("SELECT banking_api.list_fraud_reviews(NULL,1,100,%s) AS result", (case["branch"],)).fetchone()["result"]
        review = next(item for item in result["items"] if item["reviewcaseid"] == case["review"])
        assert review["reviewreason"] == reason
        assert review["reviewedat"] is not None
        other_branch = db.execute("SELECT banking_api.list_fraud_reviews(NULL,1,100,%s) AS result", (case["branch"]+99999,)).fetchone()["result"]
        assert other_branch["items"] == []
        customer_result = db.execute("SELECT banking_api.transaction_result(%s) AS result", (case["transaction"],)).fetchone()["result"]
        assert "reviewreason" not in customer_result


@pytest.mark.parametrize("status", ["Success","Failed","Cancelled"])
@pytest.mark.parametrize("action", ["APPROVE","REJECT"])
def test_terminal_transaction_cannot_be_resolved_even_with_an_open_review(case, status, action):
    case = create_case(case, amount="20000" if status == "Failed" else "1000")
    assert resolve(case, "REJECT" if status == "Cancelled" else "APPROVE")["status"] == status
    # Simulate the existing imported inconsistency without rewriting the ledger.
    with connect() as db:
        db.execute("UPDATE review_case SET status='IN_REVIEW',revieweruserid=NULL,reviewedat=NULL,reason=NULL WHERE reviewcaseid=%s", (case["review"],))
    before = evidence(case)
    with pytest.raises(psycopg.errors.RaiseException, match="CONFLICT:review requires a Pending transaction"):
        resolve(case, action)
    assert evidence(case) == before


@pytest.mark.parametrize("decision", ["ALLOW","BLOCK",None])
@pytest.mark.parametrize("action", ["APPROVE","REJECT"])
def test_only_review_risk_decision_can_be_resolved(case, decision, action):
    case = create_case(case)
    with connect() as db:
        if decision is None:
            db.execute("DELETE FROM risk_assessment WHERE transactionid=%s", (case["transaction"],))
        else:
            db.execute("UPDATE risk_assessment SET decision=%s WHERE transactionid=%s", (decision,case["transaction"]))
    before = evidence(case)
    with pytest.raises(psycopg.errors.RaiseException, match="CONFLICT:review requires a REVIEW risk decision"):
        resolve(case, action)
    assert evidence(case) == before


@pytest.mark.parametrize("action", ["APPROVE","REJECT"])
def test_existing_postings_are_rejected_before_any_review_change(case, action):
    case = create_case(case)
    db = connect()
    try:
        # Never commit this deliberately inconsistent fixture. Deferred constraints
        # remain enabled; the review guard must reject it before those run.
        db.execute("INSERT INTO transaction_posting(transactionid,accountid,postingtype,amount) VALUES(%s,%s,'DEBIT',1000),(%s,%s,'CREDIT',1000)",
                   (case["transaction"],case["source"],case["transaction"],case["destination"]))
        before = evidence(case, db)
        with pytest.raises(psycopg.errors.RaiseException, match="CONFLICT:transaction already has financial postings"):
            with db.transaction():
                db.execute("SELECT banking_api.resolve_review(%s,%s,%s,'test')", (case["review"],case["users"][0],action))
        assert evidence(case, db) == before
    finally:
        db.rollback()
        db.close()
    assert evidence(case)["postings"] == 0


@pytest.mark.parametrize("actions", [("APPROVE","APPROVE"),("APPROVE","REJECT")])
def test_two_reviewers_cannot_resolve_the_same_case_twice(case, actions):
    case = create_case(case)
    barrier = Barrier(2)
    def submit(index):
        barrier.wait(timeout=5)
        try:
            return resolve(case, actions[index], actor=case["users"][index])["status"]
        except psycopg.errors.RaiseException as error:
            assert "CONFLICT:review already resolved" in str(error)
            return "CONFLICT"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, range(2)))
    assert results.count("CONFLICT") == 1
    final = evidence(case)
    assert final["transaction_status"] in ("Success","Cancelled")
    assert final["postings"] == (2 if final["transaction_status"] == "Success" else 0)
    assert final["source_balance"] == Decimal(9000 if final["transaction_status"] == "Success" else 10000)
    assert final["events"] == 2  # review-required plus one final event


def test_concurrent_identical_retries_return_the_same_result(case):
    case = create_case(case)
    barrier = Barrier(2)
    def submit(_):
        barrier.wait(timeout=5)
        return resolve(case)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = pool.map(submit, range(2))
    assert first["transactionid"] == second["transactionid"]
    assert first["status"] == second["status"] == "Success"
    assert evidence(case)["postings"] == 2
    assert evidence(case)["events"] == 2


def test_distinct_open_reviews_for_one_transaction_are_serialized(case):
    case = create_case(case)
    with connect() as db:
        other_review = db.execute("INSERT INTO review_case(transactionid,status,createdat) VALUES(%s,'OPEN',clock_timestamp()-interval '1 minute') RETURNING reviewcaseid", (case["transaction"],)).fetchone()["reviewcaseid"]
    barrier = Barrier(2)
    def submit(index):
        target = case if index == 0 else {**case, "review": other_review}
        barrier.wait(timeout=5)
        try:
            return resolve(target, actor=case["users"][index])["status"]
        except psycopg.errors.RaiseException as error:
            assert "CONFLICT:review requires a Pending transaction" in str(error)
            return "CONFLICT"
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(submit, range(2))) == ["CONFLICT", "Success"]
    final = evidence(case)
    assert final["postings"] == 2
    assert final["events"] == 2
    assert final["source_balance"] == Decimal(9000)


@pytest.mark.parametrize("action", ["APPROVE","REJECT"])
def test_missing_transfer_request_is_rejected_before_review_changes(case, action):
    case = create_case(case)
    with connect() as db:
        db.execute("DELETE FROM transfer_request WHERE transactionid=%s", (case["transaction"],))
    before = evidence(case)
    with pytest.raises(psycopg.errors.RaiseException, match="CONFLICT:review has no transfer request"):
        resolve(case, action)
    assert evidence(case) == before


@pytest.mark.parametrize("action", ["APPROVE","REJECT"])
def test_failure_before_commit_rolls_back_review_ledger_balances_and_events(case, action):
    case = create_case(case)
    before = evidence(case)
    with pytest.raises(psycopg.errors.DivisionByZero):
        with connect() as db:
            result = db.execute("SELECT banking_api.resolve_review(%s,%s,%s,'rollback test') AS result", (case["review"],case["users"][0],action)).fetchone()["result"]
            assert result["status"] == ("Success" if action == "APPROVE" else "Cancelled")
            db.execute("SELECT 1/0")
    assert evidence(case) == before
