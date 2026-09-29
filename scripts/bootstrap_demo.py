from __future__ import annotations

import json

import psycopg
from psycopg.rows import dict_row

from banking.config import DatabaseSettings


def _id(connection, table: str, key: str, value: str, id_column: str) -> int:
    row = connection.execute(
        f'SELECT {id_column} FROM banking."{table}" WHERE {key}=%s',
        (value,),
    ).fetchone()
    if not row:
        raise RuntimeError(f"bootstrap row missing: {table}.{key}={value}")
    return int(row[id_column])


def main() -> None:
    settings = DatabaseSettings.from_env()
    with psycopg.connect(settings.dsn, row_factory=dict_row) as connection:
        with connection.transaction():
            connection.execute("""
                INSERT INTO banking.branch (branchcode,branchname,address,city,opendate,status)
                VALUES ('DEMO-HCM','Demo Ho Chi Minh','1 Demo Street','Ho Chi Minh City',CURRENT_DATE,'Active')
                ON CONFLICT (branchcode) DO NOTHING
            """)
            branch_id = _id(connection, "branch", "branchcode", "DEMO-HCM", "branchid")
            connection.execute("""
                INSERT INTO banking.role (rolename,description,status)
                VALUES ('DEMO_REVIEWER','Demo fraud reviewer','Active')
                ON CONFLICT (rolename) DO NOTHING
            """)
            role_id = _id(connection, "role", "rolename", "DEMO_REVIEWER", "roleid")
            connection.execute("""
                INSERT INTO banking.employee (employeecode,branchid,roleid,fullname,phone,email,hiredate,salary,status)
                VALUES ('EMP-DEMO-001',%s,%s,'Demo Reviewer','0900000001','reviewer.demo@example.test',CURRENT_DATE,0,'Active')
                ON CONFLICT (employeecode) DO NOTHING
            """, (branch_id, role_id))
            employee_id = _id(connection, "employee", "employeecode", "EMP-DEMO-001", "employeeid")
            connection.execute("""
                INSERT INTO banking.system_user (employeeid,username,passwordhash,isactive)
                VALUES (%s,'demo_reviewer','not-a-login-credential',TRUE)
                ON CONFLICT (username) DO NOTHING
            """, (employee_id,))
            connection.execute("""
                INSERT INTO banking.account_type (typename,minbalance,interestrate,description,status)
                VALUES ('Demo Checking',0,0,'E2E demo account type','Active')
                ON CONFLICT (typename) DO NOTHING
            """)
            account_type_id = _id(connection, "account_type", "typename", "Demo Checking", "accounttypeid")
            connection.execute("""
                INSERT INTO banking.customer (customercode,fullname,phone,email,customertype,status,customersegment)
                VALUES ('CUS-DEMO-001','Demo Customer','0900000002','customer.demo@example.test','INDIVIDUAL','Active','DEMO')
                ON CONFLICT (customercode) DO NOTHING
            """)
            customer_id = _id(connection, "customer", "customercode", "CUS-DEMO-001", "customerid")
            connection.execute("""
                INSERT INTO banking.customer_device (customerid,devicecode,devicetype,devicename,operatingsystem,istrusted,status)
                VALUES (%s,'DEVICE-DEMO-TRUSTED','Mobile','Demo Phone','DemoOS',TRUE,'Active')
                ON CONFLICT (devicecode) DO NOTHING
            """, (customer_id,))
            device_id = _id(connection, "customer_device", "devicecode", "DEVICE-DEMO-TRUSTED", "deviceid")
            for number, balance, category in (
                ('DEMO-SOURCE-001', 1000000000, 'CUSTOMER'),
                ('DEMO-DEST-001', 100000000, 'CUSTOMER'),
            ):
                connection.execute("""
                    INSERT INTO banking.bank_account (accountnumber,branchid,accounttypeid,opendate,balance,currency,status,accountcategory)
                    VALUES (%s,%s,%s,CURRENT_DATE,%s,'VND','Active',%s)
                    ON CONFLICT (accountnumber) DO NOTHING
                """, (number, branch_id, account_type_id, balance, category))
            source_id = _id(connection, "bank_account", "accountnumber", "DEMO-SOURCE-001", "accountid")
            destination_id = _id(connection, "bank_account", "accountnumber", "DEMO-DEST-001", "accountid")
            for account_id in (source_id, destination_id):
                connection.execute("""
                    INSERT INTO banking.account_holder (accountid,customerid,holdertype,startdate,status)
                    SELECT %s,%s,'PRIMARY_OWNER',CURRENT_DATE,'Active'
                    WHERE NOT EXISTS (
                        SELECT 1 FROM banking.account_holder WHERE accountid=%s AND customerid=%s AND status='Active'
                    )
                """, (account_id, customer_id, account_id, customer_id))
            connection.execute("""
                INSERT INTO banking.transaction_type (typecode,typename,description,status)
                VALUES ('TRANSFER','Transfer','Account-to-account transfer','Active')
                ON CONFLICT (typecode) DO NOTHING
            """)
            connection.execute("""
                INSERT INTO banking.transaction_type (typecode,typename,description,status)
                VALUES ('DEPOSIT','Deposit','Demo ML history','Active')
                ON CONFLICT (typecode) DO NOTHING
            """)
            active_model = connection.execute("SELECT modelversionid FROM banking.model_version WHERE status='ACTIVE' AND modelname='fraud_detection_v1' ORDER BY modelversionid DESC LIMIT 1").fetchone()
            if not active_model:
                connection.execute("""
                    INSERT INTO banking.model_version (modelname,modeltype,status,description)
                    VALUES ('fraud_detection_v1','logistic_regression','ACTIVE','Artifact: ml-models/fraud_detection/v1')
                """)
            deposit_type_id = _id(connection, "transaction_type", "typecode", "DEPOSIT", "transactiontypeid")
            training_rows = (
                ("TX-DEMO-ML-001", 100000, "LEGITIMATE"),
                ("TX-DEMO-ML-002", 250000, "LEGITIMATE"),
                ("TX-DEMO-ML-003", 80000000, "FRAUD"),
                ("TX-DEMO-ML-004", 120000000, "FRAUD"),
            )
            for transaction_code, amount, label in training_rows:
                connection.execute("""
                    INSERT INTO banking.bank_transaction
                        (transactioncode,transactiontypeid,deviceid,channel,amount,fee,currency,description,status,initiatedbycustomerid)
                    VALUES (%s,%s,%s,'MobileBanking',%s,0,'VND','Curated demo ML fixture','Failed',%s)
                    ON CONFLICT (transactioncode) DO NOTHING
                """, (transaction_code, deposit_type_id, device_id, amount, customer_id))
                transaction_id = _id(connection, "bank_transaction", "transactioncode", transaction_code, "transactionid")
                connection.execute("""
                    INSERT INTO banking.fraud_label_event (transactionid,label,labelsource,note)
                    SELECT %s,%s,'DEMO_CURATED','Idempotent bootstrap training label'
                    WHERE NOT EXISTS (
                        SELECT 1 FROM banking.fraud_label_event WHERE transactionid=%s AND labelsource='DEMO_CURATED'
                    )
                """, (transaction_id, label, transaction_id))
        result = {
            "customer_id": customer_id,
            "device_id": device_id,
            "source_account_id": source_id,
            "destination_account_id": destination_id,
        }
        print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
