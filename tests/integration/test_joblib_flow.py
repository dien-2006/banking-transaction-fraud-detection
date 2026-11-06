"""Financial regression checks against an explicitly isolated d4_* database."""
import json
import math
import os
from datetime import datetime
from pathlib import Path
import uuid

import psycopg
from psycopg.rows import dict_row
import pytest
from scripts.postgres_config import postgres_dsn
from scripts.bootstrap_demo import main as bootstrap

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(os.getenv('RUN_BANKING_INTEGRATION') != '1', reason='isolated PostgreSQL required')


@pytest.fixture(scope='module')
def base():
    if not os.environ.get('POSTGRES_DB', '').startswith('d4_'):
        pytest.skip('write checks require an isolated d4_* database')
    bootstrap()
    with psycopg.connect(postgres_dsn()) as c:
        c.execute((ROOT / 'tests/sql/fixtures.sql').read_text())


@pytest.fixture
def db(base):
    c = psycopg.connect(postgres_dsn(), row_factory=dict_row, options='-c search_path=banking,public')
    c.execute("SET LOCAL TIME ZONE 'Asia/Ho_Chi_Minh'")
    yield c
    c.rollback()
    c.close()


def ids(c):
    return c.execute("""SELECT c.customerid, a.accountid AS source, b.accountid AS destination,
        i.accountid AS internal, su.userid, e.employeeid, a.branchid
        FROM customer c,bank_account a,bank_account b,bank_account i,"system_user" su
        JOIN employee e USING(employeeid)
        WHERE c.customercode='DEMO-CUSTOMER' AND a.accountnumber='DEMO-0001'
        AND b.accountnumber='DEMO-0002' AND i.accountnumber='TEST-INTERNAL' AND su.username='test-admin'""").fetchone()


def model(c, probability=0.01):
    payload = json.loads((ROOT / 'ml/artifacts/fraud_detection/v1/model.json').read_text())
    payload.update(intercept=math.log(probability/(1-probability)), weights=dict.fromkeys(payload['weights'], 0))
    payload['modelVersionId'] = c.execute("SELECT modelversionid FROM model_version WHERE modelname='fraud_detection_v1' AND status='ACTIVE' ORDER BY modelversionid DESC LIMIT 1").fetchone()['modelversionid']
    c.execute("SELECT set_config('app.fraud_model',%s,true)", (json.dumps(payload),))


def transfer(c, v):
    return c.execute("SELECT banking_api.create_transfer(%s,%s,%s,1000,%s,'InternetBanking') AS result",
                     (v['customerid'], v['source'], v['destination'], str(uuid.uuid4()))).fetchone()['result']


def test_features_match_notebook_windows_nulls_and_minutes(db):
    v = ids(db)
    at = datetime(2100, 1, 3, 2)
    t = db.execute("SELECT transactiontypeid FROM transaction_type WHERE typecode='TRANSFER'").fetchone()['transactiontypeid']
    for amount, minute in [(100, 120), (300, 30)]:
        db.execute("""INSERT INTO bank_transaction(transactioncode,transactiontypeid,channel,amount,status,initiatedbycustomerid,transactiondate)
            VALUES(%s,%s,'InternetBanking',%s,'Pending',%s,%s::timestamp-(%s*interval '1 minute'))""",
                   (str(uuid.uuid4()), t, amount, v['customerid'], at, minute))
    for status in ('Failed','Failed','Success','Blocked'):
        db.execute("INSERT INTO login_event(customerid,status,logintime,failurereason) VALUES(%s,%s,%s::timestamp-interval '15 minutes',%s)",
                   (v['customerid'], status, at, None if status=='Success' else 'test'))
    features = db.execute("SELECT banking_api.joblib_features(%s,%s,1000,'InternetBanking','TRANSFER',%s) AS f", (v['customerid'], v['source'], at)).fetchone()['f']
    assert len(features) == 19
    assert [features[k] for k in ('txn_count_1h','txn_count_24h','txn_count_7d','txn_count_30d')] == [1,2,2,2]
    assert features['time_since_last_transaction'] == 30
    assert features['avg_amount_30d'] == 200
    assert features['amount_to_avg_ratio'] == 5
    assert features['login_failure_ratio_24h'] == .5
    assert features['is_night_transaction'] == 1
    assert features['day_of_week'] == (at.weekday()+1)%7+1


@pytest.mark.parametrize('probability,expected', [(.59,'ALLOW'),(.60,'REVIEW'),(.89,'REVIEW'),(.90,'BLOCK')])
def test_joblib_probability_branch_and_request_binding(db,probability,expected):
    v=ids(db)
    at='2100-01-03 12:00:00'
    context={'engine':'joblib','probability':probability,
             'request':{'customerId':v['customerid'],'amount':'1000','assessedAt':at}}
    db.execute("SELECT set_config('app.fraud_model',%s,true)",(json.dumps(context),))
    result=db.execute("SELECT banking_api.calculate_risk(%s,NULL,1000,%s::timestamp) AS r",(v['customerid'],at)).fetchone()['r']
    assert result['decision']==expected
    with pytest.raises(psycopg.errors.RaiseException,match='does not match transaction'):
        with db.transaction():
            db.execute("SELECT banking_api.calculate_risk(%s,NULL,1001,%s::timestamp)",(v['customerid'],at))


def test_review_cannot_post_for_a_customer_blocked_after_assessment(db):
    v=ids(db); model(db,.7)
    tx=transfer(db,v)
    assert tx['decision']=='REVIEW' and tx['status']=='Pending'
    db.execute("UPDATE customer SET status='Blocked' WHERE customerid=%s", (v['customerid'],))
    review=db.execute('SELECT reviewcaseid FROM review_case WHERE transactionid=%s', (tx['transactionid'],)).fetchone()['reviewcaseid']
    with pytest.raises(psycopg.errors.RaiseException, match='initiating customer is not active'):
        with db.transaction():
            db.execute("SELECT banking_api.resolve_review(%s,%s,'APPROVE')", (review,v['userid']))
    assert db.execute('SELECT count(*) AS n FROM transaction_posting WHERE transactionid=%s',(tx['transactionid'],)).fetchone()['n']==0
    assert db.execute('SELECT status FROM review_case WHERE reviewcaseid=%s',(review,)).fetchone()['status']=='OPEN'


@pytest.mark.parametrize('probability,status,postings', [(.59,'Success',2),(.60,'Pending',0),(.90,'Cancelled',0)])
def test_joblib_context_financial_gates_and_review_approval(db,probability,status,postings):
    v=ids(db)
    identity=db.execute("INSERT INTO model_version(modelname,modeltype,status) VALUES('joblib-test','XGBOOST','ACTIVE') RETURNING modelversionid").fetchone()['modelversionid']
    at=db.execute('SELECT clock_timestamp()::timestamp::text AS at').fetchone()['at']
    context={'engine':'joblib','probability':probability,'databaseName':'joblib-test','modelVersionId':identity,
        'version':'joblib-test','request':{'customerId':v['customerid'],'sourceAccountId':v['source'],
            'amount':'1000','channel':'InternetBanking','typeCode':'TRANSFER','assessedAt':at}}
    db.execute("SELECT set_config('app.fraud_model',%s,true)",(json.dumps(context),))
    tx=transfer(db,v)
    assert tx['status']==status
    assert db.execute('SELECT count(*) AS n FROM transaction_posting WHERE transactionid=%s',(tx['transactionid'],)).fetchone()['n']==postings
    if status=='Pending':
        review=db.execute('SELECT reviewcaseid FROM review_case WHERE transactionid=%s',(tx['transactionid'],)).fetchone()['reviewcaseid']
        result=db.execute("SELECT banking_api.resolve_review(%s,%s,'APPROVE') AS r",(review,v['userid'])).fetchone()['r']
        assert result['status']=='Success'
    db.execute('SET CONSTRAINTS ALL IMMEDIATE')


@pytest.mark.parametrize('partial', [False, True])
def test_overdue_loan_can_pay_only_remaining_components(db,partial):
    v=ids(db); model(db)
    typ=db.execute("SELECT loantypeid FROM loan_type WHERE loantypename='Test loan'").fetchone()['loantypeid']
    loan=db.execute("SELECT banking_api.create_loan(%s,%s,%s,%s,%s,1000,0,1,CURRENT_DATE) AS r",
        (str(uuid.uuid4())[:30],v['customerid'],v['branchid'],v['employeeid'],typ)).fetchone()['r']['loanid']
    db.execute('SELECT banking_api.approve_loan(%s)',(loan,))
    schedule=db.execute('SELECT scheduleid FROM repayment_schedule WHERE loanid=%s',(loan,)).fetchone()['scheduleid']
    if partial:
        # Historical partial payment must have matching loan-payment postings.
        previous=db.execute("""INSERT INTO bank_transaction
            (transactioncode,transactiontypeid,channel,amount,status,initiatedbycustomerid)
            SELECT %s,transactiontypeid,'InternetBanking',400,'Pending',%s
            FROM transaction_type WHERE typecode='LOAN_PAYMENT'
            RETURNING transactionid""", (str(uuid.uuid4()),v['customerid'])).fetchone()['transactionid']
        db.execute('SELECT banking_api.assess_transaction(%s,%s,NULL,400)',(previous,v['customerid']))
        db.execute('SELECT banking_api.post_balanced_transaction(%s,%s,%s,400,%s,true)',
                   (previous,v['source'],v['internal'],v['customerid']))
        db.execute("INSERT INTO loan_payment(loanid,scheduleid,amountpaid,principalpaid,interestpaid,paymentchannel,transactionid) VALUES(%s,%s,400,400,0,'Online',%s)", (loan,schedule,previous))
        db.execute("UPDATE repayment_schedule SET status='Partial' WHERE scheduleid=%s",(schedule,))
    db.execute("UPDATE loan SET status='Overdue' WHERE loanid=%s",(loan,))
    amount=600 if partial else 1000
    tx=db.execute("SELECT banking_api.pay_loan(%s,%s,%s,%s,%s,%s,%s) AS r",
        (v['customerid'],loan,schedule,v['source'],v['internal'],amount,str(uuid.uuid4()))).fetchone()['r']
    assert tx['status']=='Success'
    assert db.execute('SELECT sum(amountpaid) AS n FROM loan_payment WHERE scheduleid=%s',(schedule,)).fetchone()['n']==1000
    assert db.execute('SELECT status FROM repayment_schedule WHERE scheduleid=%s',(schedule,)).fetchone()['status']=='Paid'
    db.execute('SET CONSTRAINTS ALL IMMEDIATE')
