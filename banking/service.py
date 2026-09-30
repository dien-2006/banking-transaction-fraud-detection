"""Transactional transfer workflow.

Risk assessment is persisted before financial processing.  ALLOW merely opens
the gate; posting, balances, Success and the outbox event are committed in one
separate database transaction.
"""

from __future__ import annotations

import json
import math
import os
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

import psycopg
from psycopg.rows import dict_row

from ml.inference import FraudPredictor
from risk.engine import Decision, RiskContext, evaluate_risk


class BusinessRejection(Exception):
    pass


class TransferService:
    def __init__(self, dsn: str, predictor: FraudPredictor, schema: str = "banking") -> None:
        if not schema.replace("_", "").isalnum():
            raise ValueError("invalid schema")
        self._dsn = dsn
        self._predictor = predictor
        self._schema = schema
        self._model_db_name = os.getenv("MODEL_DB_NAME", f"fraud_detection_{predictor.version}")

    def _connect(self) -> psycopg.Connection[dict[str, Any]]:
        return psycopg.connect(
            self._dsn,
            row_factory=dict_row,
            options=f"-c search_path={self._schema}",
        )

    def create_transfer(
        self,
        *,
        customer_id: int,
        source_account_id: int,
        destination_account_id: int,
        amount: Decimal,
        idempotency_key: str,
        channel: str,
        device_id: int | None = None,
    ) -> dict[str, Any]:
        if amount <= 0:
            raise BusinessRejection("amount must be positive")
        if source_account_id == destination_account_id:
            raise BusinessRejection("source and destination must differ")

        existing = self._find_by_idempotency_key(idempotency_key)
        if existing:
            return existing

        now = datetime.now()
        with self._connect() as connection, connection.transaction():
            # Serialize requests for the same key. The unique constraint remains
            # the final guard, while this lock makes concurrent retries return
            # the original transfer instead of surfacing a database error.
            connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (idempotency_key,),
            )
            concurrent = connection.execute(
                "SELECT transactionid FROM transfer_request WHERE idempotencykey=%s",
                (idempotency_key,),
            ).fetchone()
            if concurrent:
                return self.get_transfer(concurrent["transactionid"])

            context = self._risk_context(connection, customer_id, device_id, amount, now)
            probability = self._predictor.predict(
                {
                    "amount_log": math.log1p(float(amount)) / 20,
                    "is_new_device": int(context.is_new_device),
                    "is_unusual_time": int(0 <= now.hour < 5),
                    "transactions_last_10m": context.transactions_last_10m,
                    "failed_logins_last_30m": context.failed_logins_last_30m,
                    "amount_to_average_ratio": float(
                        amount / context.average_amount_30d
                        if context.average_amount_30d
                        else 1
                    ),
                }
            )
            assessment = evaluate_risk(context, probability)
            model_id = self._active_model_id(connection)
            transaction_code = f"TX-{uuid.uuid4().hex.upper()}"
            transaction = connection.execute(
                """
                INSERT INTO bank_transaction (
                    transactioncode, transactiontypeid, deviceid, channel, amount,
                    fee, currency, transactiondate, status, initiatedbycustomerid
                )
                SELECT %s, transactiontypeid, %s, %s, %s, 0, 'VND', %s, 'Pending', %s
                FROM transaction_type WHERE typecode = 'TRANSFER' AND status = 'Active'
                RETURNING transactionid, transactioncode, status
                """,
                (transaction_code, device_id, channel, amount, now, customer_id),
            ).fetchone()
            if not transaction:
                raise RuntimeError("active TRANSFER transaction type is missing")
            transaction_id = transaction["transactionid"]
            connection.execute(
                """
                INSERT INTO transfer_request (
                    transactionid, customerid, sourceaccountid, destinationaccountid,
                    idempotencykey, amount, currency, status
                ) VALUES (%s, %s, %s, %s, %s, %s, 'VND', 'Pending')
                """,
                (
                    transaction_id,
                    customer_id,
                    source_account_id,
                    destination_account_id,
                    idempotency_key,
                    amount,
                ),
            )
            connection.execute(
                """
                INSERT INTO risk_assessment (
                    transactionid, modelversionid, rulescore, risklevel,
                    modelprobability, decision, reasonjson
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    transaction_id,
                    model_id,
                    assessment.rule_score,
                    assessment.risk_level,
                    assessment.model_probability,
                    assessment.decision.value,
                    json.dumps({"triggered_rules": assessment.triggered_rules}),
                ),
            )
            if assessment.decision is Decision.REVIEW:
                review = connection.execute(
                    "INSERT INTO review_case (transactionid, status) VALUES (%s, 'OPEN') RETURNING reviewcaseid",
                    (transaction_id,),
                ).fetchone()
                review_case_id = review["reviewcaseid"]
            else:
                review_case_id = None
            if assessment.decision is Decision.BLOCK:
                connection.execute(
                    "UPDATE bank_transaction SET status='Cancelled' WHERE transactionid=%s",
                    (transaction_id,),
                )
                connection.execute(
                    "UPDATE transfer_request SET status='Rejected' WHERE transactionid=%s",
                    (transaction_id,),
                )

        if assessment.decision is Decision.ALLOW:
            self._process_financially(transaction_id)
        return self.get_transfer(transaction_id, review_case_id=review_case_id)

    def review(self, review_case_id: int, approve: bool) -> dict[str, Any]:
        with self._connect() as connection, connection.transaction():
            case = connection.execute(
                "SELECT reviewcaseid, transactionid, status FROM review_case WHERE reviewcaseid=%s FOR UPDATE",
                (review_case_id,),
            ).fetchone()
            if not case:
                raise BusinessRejection("review case not found")
            if case["status"] != "OPEN":
                raise BusinessRejection("review case is already resolved")
            status = "APPROVED" if approve else "REJECTED"
            connection.execute(
                "UPDATE review_case SET status=%s, reviewedat=clock_timestamp() WHERE reviewcaseid=%s",
                (status, review_case_id),
            )
            transaction_id = case["transactionid"]
            if not approve:
                connection.execute(
                    "UPDATE bank_transaction SET status='Cancelled' WHERE transactionid=%s",
                    (transaction_id,),
                )
                connection.execute(
                    "UPDATE transfer_request SET status='Rejected' WHERE transactionid=%s",
                    (transaction_id,),
                )
        if approve:
            self._process_financially(transaction_id)
        return self.get_transfer(transaction_id, review_case_id=review_case_id)

    def _process_financially(self, transaction_id: int) -> None:
        try:
            with self._connect() as connection, connection.transaction():
                transfer = connection.execute(
                    """
                    SELECT tr.*, bt.status AS transaction_status,
                           ra.decision AS risk_decision,
                           EXISTS (
                               SELECT 1 FROM review_case rc
                               WHERE rc.transactionid=tr.transactionid
                                 AND rc.status='APPROVED'
                           ) AS review_approved
                    FROM transfer_request tr JOIN bank_transaction bt USING (transactionid)
                    JOIN LATERAL (
                        SELECT decision FROM risk_assessment
                        WHERE transactionid=tr.transactionid
                        ORDER BY assessedat DESC LIMIT 1
                    ) ra ON true
                    WHERE tr.transactionid=%s FOR UPDATE OF tr, bt
                    """,
                    (transaction_id,),
                ).fetchone()
                if not transfer or transfer["transaction_status"] != "Pending":
                    return
                allowed_to_post = transfer["risk_decision"] == "ALLOW" or (
                    transfer["risk_decision"] == "REVIEW" and transfer["review_approved"]
                )
                if not allowed_to_post:
                    return
                account_ids = sorted(
                    [transfer["sourceaccountid"], transfer["destinationaccountid"]]
                )
                accounts = connection.execute(
                    """
                    SELECT ba.accountid, ba.balance, ba.status, at.minbalance
                    FROM bank_account ba
                    JOIN account_type at USING (accounttypeid)
                    WHERE ba.accountid=ANY(%s)
                    ORDER BY ba.accountid
                    FOR UPDATE OF ba
                    """,
                    (account_ids,),
                ).fetchall()
                by_id = {row["accountid"]: row for row in accounts}
                if set(by_id) != set(account_ids):
                    raise BusinessRejection("account not found")
                if any(row["status"] != "Active" for row in accounts):
                    raise BusinessRejection("account is not active")
                source = by_id[transfer["sourceaccountid"]]
                owns_source = connection.execute(
                    """
                    SELECT 1 FROM account_holder
                    WHERE accountid=%s AND customerid=%s AND status='Active'
                      AND startdate <= CURRENT_DATE
                      AND (enddate IS NULL OR enddate >= CURRENT_DATE)
                    """,
                    (transfer["sourceaccountid"], transfer["customerid"]),
                ).fetchone()
                if not owns_source:
                    raise BusinessRejection("customer is not an active source account holder")
                if source["balance"] - transfer["amount"] < source["minbalance"]:
                    raise BusinessRejection("insufficient balance")
                connection.execute(
                    "UPDATE bank_account SET balance=balance-%s, updatedat=clock_timestamp() WHERE accountid=%s",
                    (transfer["amount"], transfer["sourceaccountid"]),
                )
                connection.execute(
                    "UPDATE bank_account SET balance=balance+%s, updatedat=clock_timestamp() WHERE accountid=%s",
                    (transfer["amount"], transfer["destinationaccountid"]),
                )
                connection.execute(
                    """
                    INSERT INTO transaction_posting
                        (transactionid, accountid, postingtype, amount)
                    VALUES (%s, %s, 'DEBIT', %s), (%s, %s, 'CREDIT', %s)
                    """,
                    (
                        transaction_id, transfer["sourceaccountid"], transfer["amount"],
                        transaction_id, transfer["destinationaccountid"], transfer["amount"],
                    ),
                )
                connection.execute(
                    "UPDATE bank_transaction SET status='Success' WHERE transactionid=%s",
                    (transaction_id,),
                )
                connection.execute(
                    "UPDATE transfer_request SET status='Completed' WHERE transactionid=%s",
                    (transaction_id,),
                )
                payload = {"transaction_id": transaction_id, "status": "Success"}
                connection.execute(
                    """
                    INSERT INTO event_outbox (eventkey, aggregatetype, aggregateid, eventtype, payloadjson)
                    VALUES (%s, 'BANK_TRANSACTION', %s, 'TransactionCompleted', %s)
                    """,
                    (f"transaction-completed:{transaction_id}", str(transaction_id), json.dumps(payload)),
                )
        except BusinessRejection:
            with self._connect() as connection, connection.transaction():
                connection.execute(
                    "UPDATE bank_transaction SET status='Failed' WHERE transactionid=%s AND status='Pending'",
                    (transaction_id,),
                )
                connection.execute(
                    "UPDATE transfer_request SET status='Failed' WHERE transactionid=%s AND status='Pending'",
                    (transaction_id,),
                )
            raise

    def recover_pending(self, limit: int = 100) -> dict[str, int]:
        """Resume committed ALLOW or approved REVIEW decisions safely."""
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT tr.transactionid
                FROM transfer_request tr
                JOIN bank_transaction bt USING (transactionid)
                JOIN LATERAL (
                    SELECT decision FROM risk_assessment
                    WHERE transactionid=tr.transactionid
                    ORDER BY assessedat DESC LIMIT 1
                ) ra ON true
                WHERE tr.status='Pending' AND bt.status='Pending'
                  AND (
                      ra.decision='ALLOW'
                      OR (
                          ra.decision='REVIEW'
                          AND EXISTS (
                              SELECT 1 FROM review_case rc
                              WHERE rc.transactionid=tr.transactionid
                                AND rc.status='APPROVED'
                          )
                      )
                  )
                ORDER BY tr.requestedat
                LIMIT %s
                """,
                (limit,),
            ).fetchall()

        metrics = {"candidates": len(rows), "processed": 0, "rejected": 0}
        for row in rows:
            try:
                self._process_financially(row["transactionid"])
                metrics["processed"] += 1
            except BusinessRejection:
                metrics["rejected"] += 1
        return metrics

    def _risk_context(self, connection, customer_id, device_id, amount, now) -> RiskContext:
        row = connection.execute(
            """
            SELECT
              COALESCE(count(*) FILTER (WHERE bt.transactiondate >= %s - interval '10 minutes'), 0) AS velocity,
              COALESCE(avg(bt.amount) FILTER (WHERE bt.transactiondate >= %s - interval '30 days'), 0) AS average,
              (SELECT count(*) FROM login_event le WHERE le.customerid=%s AND le.status='Failed' AND le.logintime >= %s - interval '30 minutes') AS failed
            FROM bank_transaction bt WHERE bt.initiatedbycustomerid=%s
            """,
            (now, now, customer_id, now, customer_id),
        ).fetchone()
        known = False
        if device_id is not None:
            known = connection.execute(
                "SELECT 1 FROM customer_device WHERE customerid=%s AND deviceid=%s AND status='Active'",
                (customer_id, device_id),
            ).fetchone() is not None
        return RiskContext(
            amount=amount,
            occurred_at=now,
            is_new_device=device_id is None or not known,
            transactions_last_10m=row["velocity"],
            failed_logins_last_30m=row["failed"],
            average_amount_30d=row["average"] or None,
        )

    def _active_model_id(self, connection) -> int:
        row = connection.execute(
            "SELECT modelversionid FROM model_version WHERE status='ACTIVE' AND modelname=%s ORDER BY createdat DESC LIMIT 1",
            (self._model_db_name,),
        ).fetchone()
        if not row:
            raise RuntimeError(f"no ACTIVE model_version configured for {self._model_db_name}")
        return row["modelversionid"]

    def _find_by_idempotency_key(self, key: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT transactionid FROM transfer_request WHERE idempotencykey=%s", (key,)
            ).fetchone()
        return self.get_transfer(row["transactionid"]) if row else None

    def get_transfer(self, transaction_id: int, review_case_id: int | None = None) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT bt.transactionid, bt.transactioncode, bt.status, tr.status AS transfer_status,
                       ra.decision, ra.rulescore, ra.risklevel, ra.modelprobability,
                       rc.reviewcaseid
                FROM bank_transaction bt
                JOIN transfer_request tr USING (transactionid)
                JOIN LATERAL (SELECT * FROM risk_assessment r WHERE r.transactionid=bt.transactionid ORDER BY assessedat DESC LIMIT 1) ra ON true
                LEFT JOIN review_case rc ON rc.transactionid=bt.transactionid
                WHERE bt.transactionid=%s
                """,
                (transaction_id,),
            ).fetchone()
        if not row:
            raise BusinessRejection("transaction not found")
        return dict(row)
