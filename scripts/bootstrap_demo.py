from __future__ import annotations

import json
import hashlib
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from scripts.postgres_config import POSTGRES_SCHEMA, postgres_dsn
from ml.features import JOBLIB_FEATURES


def main() -> None:
    with psycopg.connect(postgres_dsn(), row_factory=dict_row, options=f"-c search_path={POSTGRES_SCHEMA}") as connection, connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('d4-bootstrap',0))")
        model_path = Path(__file__).resolve().parents[1] / 'models/fraud_detection_model.joblib'
        metadata = json.loads(model_path.with_name('model_metadata.json').read_text())
        if tuple(metadata.get('features', ())) != JOBLIB_FEATURES:
            raise ValueError('Online joblib feature contract mismatch')
        digest = hashlib.sha256(model_path.read_bytes()).hexdigest()
        connection.execute("""INSERT INTO model_version(modelname,modeltype,status,description)
            SELECT %s,'XGBOOST','ACTIVE',%s
            WHERE NOT EXISTS (SELECT 1 FROM model_version WHERE modelname=%s)""",
            ('fraud_detection_xgb_'+digest[:16], 'sha256='+digest, 'fraud_detection_xgb_'+digest[:16]))
        branch = connection.execute(
            """INSERT INTO branch(branchcode,branchname,address,city,opendate)
               VALUES ('DEMO-HCM','Demo HCM','1 Nguyen Hue','Ho Chi Minh',CURRENT_DATE)
               ON CONFLICT(branchcode) DO UPDATE SET branchname=EXCLUDED.branchname RETURNING branchid"""
        ).fetchone()["branchid"]
        account_type = connection.execute(
            """INSERT INTO account_type(typename,minbalance,interestrate,status)
               VALUES ('Demo Current',0,0,'Active') ON CONFLICT(typename) DO UPDATE SET status='Active'
               RETURNING accounttypeid"""
        ).fetchone()["accounttypeid"]
        customer = connection.execute(
            """INSERT INTO customer(customercode,fullname,status,customersegment)
               VALUES ('DEMO-CUSTOMER','Demo Customer','Active','RETAIL')
               ON CONFLICT(customercode) DO UPDATE SET status='Active' RETURNING customerid"""
        ).fetchone()["customerid"]
        connection.execute(
            """INSERT INTO transaction_type(typecode,typename,status) VALUES ('TRANSFER','Transfer','Active')
               ON CONFLICT(typecode) DO UPDATE SET status='Active'"""
        )
        connection.execute(
            """INSERT INTO model_version(modelname,modeltype,status,description)
               SELECT 'fraud_detection_v1','LOGISTIC','ACTIVE','Default versioned artifact'
               WHERE NOT EXISTS (SELECT 1 FROM model_version WHERE status='ACTIVE' AND modelname='fraud_detection_v1')"""
        )
        accounts = []
        for number, balance in (("DEMO-0001", "100000000"), ("DEMO-0002", "25000000")):
            account_id = connection.execute(
                """INSERT INTO bank_account(accountnumber,branchid,accounttypeid,opendate,balance,accountcategory)
                   VALUES (%s,%s,%s,CURRENT_DATE,%s,'CUSTOMER')
                   ON CONFLICT(accountnumber) DO UPDATE SET status='Active' RETURNING accountid""",
                (number, branch, account_type, balance),
            ).fetchone()["accountid"]
            accounts.append(account_id)
            connection.execute(
                """INSERT INTO account_holder(accountid,customerid,holdertype,startdate,status)
                   SELECT %s,%s,'PRIMARY_OWNER',CURRENT_DATE,'Active'
                   WHERE NOT EXISTS (SELECT 1 FROM account_holder WHERE accountid=%s AND customerid=%s AND status='Active')""",
                (account_id, customer, account_id, customer),
            )
        device = connection.execute(
            """INSERT INTO customer_device(customerid,devicecode,devicetype,devicename,istrusted,status)
               VALUES (%s,'DEMO-DEVICE','Mobile','Demo Phone',true,'Active')
               ON CONFLICT(devicecode) DO UPDATE SET status='Active' RETURNING deviceid""",
            (customer,),
        ).fetchone()["deviceid"]
    print(json.dumps({"customer_id": customer, "source_account_id": accounts[0], "destination_account_id": accounts[1], "device_id": device}))


if __name__ == "__main__":
    main()
