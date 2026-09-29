from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Callable

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from banking.config import DatabaseSettings
from ml.inference import ArtifactPredictor
from risk.engine import RiskContext, decide, evaluate_rules


LOG = logging.getLogger(__name__)


def _log(event_name: str, **fields: Any) -> None:
    LOG.info(json.dumps({"event": event_name, **fields}, default=str, sort_keys=True))


class BankingError(RuntimeError):
    code = "BANKING_ERROR"


class NotFound(BankingError):
    code = "NOT_FOUND"


class BusinessRejection(BankingError):
    code = "BUSINESS_REJECTION"


@dataclass(frozen=True)
class TransferCommand:
    customer_id: int
    source_account_id: int
    destination_account_id: int
    amount: Decimal
    idempotency_key: str
    device_id: int | None = None
    channel: str = "MobileBanking"
    description: str | None = None
    fee: Decimal = Decimal("0")


class BankingService:
    """Coordinates risk and financial processing without data-platform dependencies."""

    def __init__(
        self,
        settings: DatabaseSettings,
        predictor: ArtifactPredictor | None = None,
        connection_factory: Callable[..., psycopg.Connection] = psycopg.connect,
    ):
        self.settings = settings
        self.predictor = predictor or ArtifactPredictor()
        self.connection_factory = connection_factory
        self.model_db_name = os.getenv("MODEL_DB_NAME", "fraud_detection_v1")

    @property
    def _schema(self) -> sql.Identifier:
        return sql.Identifier(self.settings.schema)

    def _table(self, name: str) -> sql.Composed:
        return sql.SQL("{}.{}").format(self._schema, sql.Identifier(name))

    def health(self) -> dict[str, Any]:
        with self.connection_factory(self.settings.dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    sql.SQL("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=%s AND table_name='risk_assessment' AND column_name IN ('rulescore','risklevel','modelprobability')"),
                    (self.settings.schema,),
                )
                contract_columns = cursor.fetchone()[0]
                cursor.execute(
                    sql.SQL("SELECT EXISTS(SELECT 1 FROM {} WHERE status='ACTIVE' AND modelname=%s), EXISTS(SELECT 1 FROM {} WHERE typecode='TRANSFER' AND status='Active')").format(
                        self._table("model_version"), self._table("transaction_type")
                    ), (self.model_db_name,)
                )
                active_model, transfer_type = cursor.fetchone()
                cursor.execute("SELECT 1")
        if contract_columns != 3:
            raise RuntimeError("Database risk_assessment contract is not Risk V1")
        if not active_model or not transfer_type:
            raise RuntimeError("Risk model or TRANSFER transaction type is not ready")
        return {"status": "ready", "database": "ok", "model_version": self.predictor.version}

    def create_transfer(self, command: TransferCommand) -> dict[str, Any]:
        self._validate_command(command)
        transaction_id: int
        decision: str
        with self.connection_factory(self.settings.dsn, row_factory=dict_row) as connection:
            with connection.transaction():
                existing = self._existing_by_idempotency(connection, command.idempotency_key)
                if existing:
                    transaction_id = int(existing["transactionid"])
                    decision = str(existing["decision"] or "")
                else:
                    transaction_id, decision = self._create_pending_and_assess(connection, command)
        if decision == "ALLOW":
            self.process_allowed_transfer(transaction_id)
        result = self.get_transaction(transaction_id)
        _log("transfer_request_completed", transaction_id=transaction_id, decision=result.get("decision"), status=result.get("status"))
        return result

    def _validate_command(self, command: TransferCommand) -> None:
        if command.amount <= 0:
            raise BusinessRejection("amount must be positive")
        if command.fee != 0:
            raise BusinessRejection("transfer fee is unsupported without a configured fee posting account")
        if command.source_account_id == command.destination_account_id:
            raise BusinessRejection("source and destination accounts must differ")
        if not command.idempotency_key.strip():
            raise BusinessRejection("idempotency_key is required")

    def _existing_by_idempotency(self, connection, idempotency_key: str) -> dict[str, Any] | None:
        cursor = connection.execute(
            sql.SQL("""
                SELECT tr.transactionid, bt.status,
                       (SELECT ra.decision FROM {} ra WHERE ra.transactionid=bt.transactionid ORDER BY ra.assessedat DESC, ra.riskassessmentid DESC LIMIT 1) decision
                FROM {} tr JOIN {} bt USING (transactionid)
                WHERE tr.idempotencykey=%s
                FOR UPDATE OF tr, bt
            """).format(self._table("risk_assessment"), self._table("transfer_request"), self._table("bank_transaction")),
            (idempotency_key,),
        )
        return cursor.fetchone()

    def _create_pending_and_assess(self, connection, command: TransferCommand) -> tuple[int, str]:
        transaction_type = connection.execute(
            sql.SQL("SELECT transactiontypeid FROM {} WHERE typecode='TRANSFER' AND status='Active'").format(self._table("transaction_type"))
        ).fetchone()
        if not transaction_type:
            raise NotFound("active TRANSFER transaction type is not configured")
        model = connection.execute(
            sql.SQL("SELECT modelversionid FROM {} WHERE status='ACTIVE' AND modelname=%s ORDER BY createdat DESC, modelversionid DESC LIMIT 1").format(self._table("model_version")),
            (self.model_db_name,),
        ).fetchone()
        if not model:
            raise NotFound("active fraud model metadata is not configured")
        code = f"TX-{uuid.uuid4().hex[:20].upper()}"
        row = connection.execute(
            sql.SQL("""
                INSERT INTO {} (transactioncode, transactiontypeid, deviceid, channel, amount, fee, currency,
                                description, status, initiatedbycustomerid)
                VALUES (%s,%s,%s,%s,%s,%s,'VND',%s,'Pending',%s)
                RETURNING transactionid, transactiondate
            """).format(self._table("bank_transaction")),
            (code, transaction_type["transactiontypeid"], command.device_id, command.channel, command.amount, command.fee, command.description, command.customer_id),
        ).fetchone()
        transaction_id = int(row["transactionid"])
        connection.execute(
            sql.SQL("""
                INSERT INTO {} (transactionid, customerid, sourceaccountid, destinationaccountid, idempotencykey,
                                amount, currency, status)
                VALUES (%s,%s,%s,%s,%s,%s,'VND','Pending')
            """).format(self._table("transfer_request")),
            (transaction_id, command.customer_id, command.source_account_id, command.destination_account_id, command.idempotency_key, command.amount),
        )
        context = self._risk_context(connection, command, transaction_id, row["transactiondate"])
        rules = evaluate_rules(context)
        probability = self.predictor.predict(context)
        decision = decide(rules.score, probability)
        reason = {
            "policy_version": "v1",
            "model_artifact_version": self.predictor.version,
            "triggered_rules": list(rules.triggered_rules),
        }
        connection.execute(
            sql.SQL("""
                INSERT INTO {} (transactionid, modelversionid, rulescore, risklevel, modelprobability, decision, reasonjson)
                VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)
            """).format(self._table("risk_assessment")),
            (transaction_id, model["modelversionid"], rules.score, rules.risk_level, probability, decision, json.dumps(reason)),
        )
        _log(
            "risk_assessed", transaction_id=transaction_id, rule_score=rules.score,
            risk_level=rules.risk_level, model_probability=probability, decision=decision,
        )
        if decision == "BLOCK":
            connection.execute(sql.SQL("UPDATE {} SET status='Failed' WHERE transactionid=%s").format(self._table("bank_transaction")), (transaction_id,))
            connection.execute(sql.SQL("UPDATE {} SET status='Rejected' WHERE transactionid=%s").format(self._table("transfer_request")), (transaction_id,))
        elif decision == "REVIEW":
            connection.execute(
                sql.SQL("INSERT INTO {} (transactionid,status,reason) VALUES (%s,'OPEN','Risk policy requires manual review')").format(self._table("review_case")),
                (transaction_id,),
            )
        return transaction_id, decision

    def _risk_context(self, connection, command: TransferCommand, transaction_id: int, occurred_at: datetime) -> RiskContext:
        is_new_device = command.device_id is not None
        if command.device_id is not None:
            device = connection.execute(
                sql.SQL("SELECT istrusted, status FROM {} WHERE deviceid=%s AND customerid=%s").format(self._table("customer_device")),
                (command.device_id, command.customer_id),
            ).fetchone()
            if not device or device["status"] != "Active":
                raise BusinessRejection("device is not active for this customer")
            is_new_device = not bool(device["istrusted"])
        velocity = connection.execute(
            sql.SQL("SELECT COUNT(*) count FROM {} WHERE initiatedbycustomerid=%s AND transactionid<>%s AND transactiondate >= %s - INTERVAL '10 minutes'").format(self._table("bank_transaction")),
            (command.customer_id, transaction_id, occurred_at),
        ).fetchone()["count"]
        failed = connection.execute(
            sql.SQL("SELECT COUNT(*) count FROM {} WHERE customerid=%s AND status IN ('Failed','Blocked') AND logintime >= %s - INTERVAL '30 minutes'").format(self._table("login_event")),
            (command.customer_id, occurred_at),
        ).fetchone()["count"]
        average = connection.execute(
            sql.SQL("SELECT AVG(amount) average FROM {} WHERE initiatedbycustomerid=%s AND status='Success' AND transactiondate >= %s - INTERVAL '30 days'").format(self._table("bank_transaction")),
            (command.customer_id, occurred_at),
        ).fetchone()["average"]
        return RiskContext(
            amount=command.amount,
            occurred_at=occurred_at,
            is_new_device=is_new_device,
            transaction_count_10m=int(velocity),
            failed_login_count_30m=int(failed),
            average_amount_30d=average,
        )

    def process_allowed_transfer(self, transaction_id: int) -> None:
        with self.connection_factory(self.settings.dsn, row_factory=dict_row) as connection:
            try:
                with connection.transaction():
                    self._post_transfer(connection, transaction_id, allowed_decisions={"ALLOW"})
            except BusinessRejection as exc:
                with connection.transaction():
                    connection.execute(
                        sql.SQL("UPDATE {} SET status='Failed' WHERE transactionid=%s AND status='Pending'").format(self._table("bank_transaction")),
                        (transaction_id,),
                    )
                    connection.execute(
                        sql.SQL("UPDATE {} SET status='Failed' WHERE transactionid=%s AND status IN ('Pending','Approved')").format(self._table("transfer_request")),
                        (transaction_id,),
                    )
                _log("financial_processing_rejected", transaction_id=transaction_id, reason=str(exc))
                raise exc

    def review_transfer(self, review_case_id: int, action: str, reviewer_user_id: int | None = None, reason: str | None = None) -> dict[str, Any]:
        action = action.upper()
        if action not in {"APPROVE", "REJECT"}:
            raise BusinessRejection("review action must be APPROVE or REJECT")
        with self.connection_factory(self.settings.dsn, row_factory=dict_row) as connection:
            with connection.transaction():
                review = connection.execute(
                    sql.SQL("SELECT reviewcaseid, transactionid, status FROM {} WHERE reviewcaseid=%s FOR UPDATE").format(self._table("review_case")),
                    (review_case_id,),
                ).fetchone()
                if not review:
                    raise NotFound("review case not found")
                if review["status"] not in {"OPEN", "IN_REVIEW"}:
                    return self.get_transaction(int(review["transactionid"]))
                transaction_id = int(review["transactionid"])
                if action == "REJECT":
                    connection.execute(sql.SQL("UPDATE {} SET status='REJECTED', revieweruserid=%s, reviewedat=CURRENT_TIMESTAMP, reason=COALESCE(%s,reason) WHERE reviewcaseid=%s").format(self._table("review_case")), (reviewer_user_id, reason, review_case_id))
                    connection.execute(sql.SQL("UPDATE {} SET status='Failed' WHERE transactionid=%s AND status='Pending'").format(self._table("bank_transaction")), (transaction_id,))
                    connection.execute(sql.SQL("UPDATE {} SET status='Rejected' WHERE transactionid=%s AND status='Pending'").format(self._table("transfer_request")), (transaction_id,))
                else:
                    connection.execute(sql.SQL("UPDATE {} SET status='APPROVED', revieweruserid=%s, reviewedat=CURRENT_TIMESTAMP, reason=COALESCE(%s,reason) WHERE reviewcaseid=%s").format(self._table("review_case")), (reviewer_user_id, reason, review_case_id))
                    self._post_transfer(connection, transaction_id, allowed_decisions={"REVIEW"})
        return self.get_transaction(transaction_id)

    def _post_transfer(self, connection, transaction_id: int, allowed_decisions: set[str]) -> None:
        transfer = connection.execute(
            sql.SQL("""
                SELECT bt.transactionid, bt.transactioncode, bt.status transaction_status, bt.amount, bt.fee, bt.currency,
                       bt.transactiontypeid, bt.channel, bt.transactiondate, bt.deviceid, bt.initiatedbycustomerid,
                       tr.sourceaccountid, tr.destinationaccountid, tr.status transfer_status,
                       (SELECT decision FROM {} WHERE transactionid=bt.transactionid ORDER BY assessedat DESC, riskassessmentid DESC LIMIT 1) decision
                FROM {} bt JOIN {} tr USING (transactionid)
                WHERE bt.transactionid=%s FOR UPDATE OF bt, tr
            """).format(self._table("risk_assessment"), self._table("bank_transaction"), self._table("transfer_request")),
            (transaction_id,),
        ).fetchone()
        if not transfer:
            raise NotFound("transfer transaction not found")
        if transfer["transaction_status"] == "Success":
            return
        if transfer["transaction_status"] != "Pending" or transfer["decision"] not in allowed_decisions:
            raise BusinessRejection("transaction is not eligible for financial processing")
        account_ids = sorted((int(transfer["sourceaccountid"]), int(transfer["destinationaccountid"])))
        accounts = connection.execute(
            sql.SQL("SELECT accountid, balance, currency, status FROM {} WHERE accountid=ANY(%s) ORDER BY accountid FOR UPDATE").format(self._table("bank_account")),
            (account_ids,),
        ).fetchall()
        by_id = {int(account["accountid"]): account for account in accounts}
        if len(by_id) != 2:
            raise BusinessRejection("source or destination account does not exist")
        source = by_id[int(transfer["sourceaccountid"])]
        destination = by_id[int(transfer["destinationaccountid"])]
        if source["status"] != "Active" or destination["status"] != "Active":
            raise BusinessRejection("both accounts must be active")
        if source["currency"].strip() != transfer["currency"].strip() or destination["currency"].strip() != transfer["currency"].strip():
            raise BusinessRejection("account currency mismatch")
        owner = connection.execute(
            sql.SQL("SELECT 1 FROM {} WHERE accountid=%s AND customerid=%s AND status='Active' AND holdertype IN ('PRIMARY_OWNER','JOINT_OWNER','AUTHORIZED_USER')").format(self._table("account_holder")),
            (source["accountid"], transfer["initiatedbycustomerid"]),
        ).fetchone()
        if not owner:
            raise BusinessRejection("customer is not an active holder of source account")
        amount = Decimal(transfer["amount"])
        if Decimal(source["balance"]) < amount:
            raise BusinessRejection("insufficient balance")
        connection.execute(sql.SQL("INSERT INTO {} (transactionid,accountid,postingtype,amount,description) VALUES (%s,%s,'DEBIT',%s,'Transfer debit'),(%s,%s,'CREDIT',%s,'Transfer credit')").format(self._table("transaction_posting")), (transaction_id, source["accountid"], amount, transaction_id, destination["accountid"], amount))
        connection.execute(sql.SQL("UPDATE {} SET balance=balance-%s, updatedat=CURRENT_TIMESTAMP WHERE accountid=%s").format(self._table("bank_account")), (amount, source["accountid"]))
        connection.execute(sql.SQL("UPDATE {} SET balance=balance+%s, updatedat=CURRENT_TIMESTAMP WHERE accountid=%s").format(self._table("bank_account")), (amount, destination["accountid"]))
        connection.execute(sql.SQL("UPDATE {} SET status='Success' WHERE transactionid=%s").format(self._table("bank_transaction")), (transaction_id,))
        connection.execute(sql.SQL("UPDATE {} SET status='Completed' WHERE transactionid=%s").format(self._table("transfer_request")), (transaction_id,))
        payload = {
            "transaction_id": transaction_id,
            "transaction_code": transfer["transactioncode"],
            "transaction_type_id": transfer["transactiontypeid"],
            "customer_id": transfer["initiatedbycustomerid"],
            "device_id": transfer["deviceid"],
            "channel": transfer["channel"],
            "status": "Success",
            "amount": str(amount),
            "fee": str(transfer["fee"]),
            "currency": transfer["currency"].strip(),
            "transaction_at": transfer["transactiondate"].isoformat(),
            "source_account_id": source["accountid"],
            "destination_account_id": destination["accountid"],
        }
        connection.execute(
            sql.SQL("INSERT INTO {} (eventkey,aggregatetype,aggregateid,eventtype,payloadjson,status) VALUES (%s,'BANK_TRANSACTION',%s,'TransactionCompleted',%s::jsonb,'PENDING') ON CONFLICT (eventkey) DO NOTHING").format(self._table("event_outbox")),
            (f"transaction-completed-{transaction_id}", str(transaction_id), json.dumps(payload)),
        )
        _log("financial_processing_committed", transaction_id=transaction_id, posting_count=2, outbox_event_key=f"transaction-completed-{transaction_id}")

    def get_transaction(self, transaction_id: int) -> dict[str, Any]:
        with self.connection_factory(self.settings.dsn, row_factory=dict_row) as connection:
            row = connection.execute(
                sql.SQL("""
                    SELECT bt.transactionid, bt.transactioncode, bt.status, bt.amount, bt.currency, bt.transactiondate,
                           tr.status transfer_status, tr.idempotencykey,
                           ra.rulescore, ra.risklevel, ra.modelprobability, ra.decision,
                           rc.reviewcaseid, rc.status review_status,
                           (SELECT COUNT(*) FROM {} tp WHERE tp.transactionid=bt.transactionid) posting_count,
                           (SELECT status FROM {} eo WHERE eo.eventkey='transaction-completed-' || bt.transactionid::text) outbox_status
                    FROM {} bt JOIN {} tr USING (transactionid)
                    LEFT JOIN LATERAL (SELECT rulescore,risklevel,modelprobability,decision FROM {} WHERE transactionid=bt.transactionid ORDER BY assessedat DESC,riskassessmentid DESC LIMIT 1) ra ON true
                    LEFT JOIN LATERAL (SELECT reviewcaseid,status FROM {} WHERE transactionid=bt.transactionid ORDER BY createdat DESC,reviewcaseid DESC LIMIT 1) rc ON true
                    WHERE bt.transactionid=%s
                """).format(self._table("transaction_posting"), self._table("event_outbox"), self._table("bank_transaction"), self._table("transfer_request"), self._table("risk_assessment"), self._table("review_case")),
                (transaction_id,),
            ).fetchone()
        if not row:
            raise NotFound("transaction not found")
        return dict(row)

    def recover_allowed_transfers(self, limit: int = 100) -> dict[str, int]:
        with self.connection_factory(self.settings.dsn, row_factory=dict_row) as connection:
            rows = connection.execute(
                sql.SQL("""
                    SELECT bt.transactionid FROM {} bt
                    JOIN {} tr USING (transactionid)
                    WHERE bt.status='Pending' AND tr.status='Pending'
                      AND (SELECT decision FROM {} WHERE transactionid=bt.transactionid ORDER BY assessedat DESC,riskassessmentid DESC LIMIT 1)='ALLOW'
                    ORDER BY bt.transactionid LIMIT %s
                """).format(self._table("bank_transaction"), self._table("transfer_request"), self._table("risk_assessment")),
                (limit,),
            ).fetchall()
        recovered = failed = 0
        for row in rows:
            try:
                self.process_allowed_transfer(int(row["transactionid"]))
                recovered += 1
            except BankingError:
                failed += 1
        return {"candidates": len(rows), "recovered": recovered, "failed": failed}
