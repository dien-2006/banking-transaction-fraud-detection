from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DatasetContract:
    primary_key: str
    columns: dict[str, str]
    required: tuple[str, ...]
    timestamp_columns: tuple[str, ...] = ()
    positive_columns: tuple[str, ...] = ()
    nonnegative_columns: tuple[str, ...] = ()
    allowed_values: dict[str, tuple[str, ...]] | None = None


def _identity(*columns: str) -> dict[str, str]:
    return {column: column for column in columns}


CONTRACTS: dict[str, DatasetContract] = {
    "bank_transaction": DatasetContract(
        "transaction_id",
        {
            "transactionid": "transaction_id", "transactioncode": "transaction_code",
            "transactiontypeid": "transaction_type_id", "employeeid": "employee_id",
            "terminalid": "terminal_id", "deviceid": "device_id", "channel": "channel",
            "amount": "amount", "fee": "fee", "currency": "currency",
            "transactiondate": "transaction_at", "ipaddress": "ip_address",
            "latitude": "latitude", "longitude": "longitude", "description": "description",
            "status": "status", "initiatedbycustomerid": "initiated_by_customer_id",
            "cardid": "card_id", "originaltransactionid": "original_transaction_id",
        },
        ("transaction_id", "transaction_code", "transaction_type_id", "channel", "amount", "fee", "currency", "transaction_at", "status"),
        ("transaction_at",), ("amount",), ("fee",),
        {"status": ("Pending", "Success", "Failed", "Cancelled"), "channel": ("Counter", "ATM", "POS", "MobileBanking", "InternetBanking", "System")},
    ),
    "transfer_request": DatasetContract(
        "transfer_request_id",
        {"transferrequestid": "transfer_request_id", "transactionid": "transaction_id", "customerid": "customer_id", "sourceaccountid": "source_account_id", "destinationaccountid": "destination_account_id", "idempotencykey": "idempotency_key", "amount": "amount", "currency": "currency", "requestedat": "requested_at", "status": "status"},
        ("transfer_request_id", "transaction_id", "customer_id", "source_account_id", "destination_account_id", "idempotency_key", "amount", "currency", "requested_at", "status"),
        ("requested_at",), ("amount",), (),
        {"status": ("Pending", "Approved", "Rejected", "Completed", "Failed", "Cancelled")},
    ),
    "transaction_posting": DatasetContract(
        "posting_id",
        {"postingid": "posting_id", "transactionid": "transaction_id", "accountid": "account_id", "postingtype": "posting_type", "amount": "amount", "postingdate": "posting_at", "description": "description"},
        ("posting_id", "transaction_id", "account_id", "posting_type", "amount", "posting_at"),
        ("posting_at",), ("amount",), (), {"posting_type": ("DEBIT", "CREDIT")},
    ),
    "transaction_type": DatasetContract(
        "transaction_type_id",
        {"transactiontypeid": "transaction_type_id", "typecode": "type_code", "typename": "type_name", "description": "description", "status": "status"},
        ("transaction_type_id", "type_code", "type_name", "status"),
        allowed_values={"status": ("Active", "Inactive")},
    ),
    "customer": DatasetContract(
        "customer_id",
        {"customerid": "customer_id", "customercode": "customer_code", "fullname": "full_name", "gender": "gender", "dateofbirth": "date_of_birth", "nationalid": "national_id", "phone": "phone", "email": "email", "address": "address", "occupation": "occupation", "customertype": "customer_type", "createddate": "created_at", "status": "status", "customersegment": "customer_segment"},
        ("customer_id", "customer_code", "full_name", "created_at", "status"),
        ("created_at",), allowed_values={"status": ("Active", "Inactive", "Blocked")},
    ),
    "customer_device": DatasetContract(
        "device_id",
        {"deviceid": "device_id", "customerid": "customer_id", "devicecode": "device_code", "devicetype": "device_type", "devicename": "device_name", "operatingsystem": "operating_system", "firstseenat": "first_seen_at", "lastseenat": "last_seen_at", "istrusted": "is_trusted", "status": "status"},
        ("device_id", "customer_id", "device_code", "device_type", "first_seen_at", "is_trusted", "status"),
        ("first_seen_at", "last_seen_at"), allowed_values={"device_type": ("Mobile", "Tablet", "Desktop", "Other"), "status": ("Active", "Blocked", "Removed")},
    ),
    "login_event": DatasetContract(
        "login_event_id",
        {"logineventid": "login_event_id", "customerid": "customer_id", "deviceid": "device_id", "logintime": "login_at", "ipaddress": "ip_address", "status": "status", "failurereason": "failure_reason"},
        ("login_event_id", "customer_id", "login_at", "status"),
        ("login_at",), allowed_values={"status": ("Success", "Failed", "Blocked")},
    ),
    "bank_account": DatasetContract(
        "account_id",
        {"accountid": "account_id", "accountnumber": "account_number", "branchid": "branch_id", "accounttypeid": "account_type_id", "opendate": "open_date", "balance": "balance", "currency": "currency", "status": "status", "createdat": "created_at", "updatedat": "updated_at", "accountcategory": "account_category"},
        ("account_id", "account_number", "branch_id", "account_type_id", "open_date", "balance", "currency", "status", "created_at", "account_category"),
        ("created_at", "updated_at"), allowed_values={"status": ("Active", "Frozen", "Closed"), "account_category": ("CUSTOMER", "INTERNAL")},
    ),
    "account_holder": DatasetContract(
        "account_holder_id",
        {"accountholderid": "account_holder_id", "accountid": "account_id", "customerid": "customer_id", "holdertype": "holder_type", "startdate": "start_date", "enddate": "end_date", "status": "status"},
        ("account_holder_id", "account_id", "customer_id", "holder_type", "start_date", "status"),
        allowed_values={"holder_type": ("PRIMARY_OWNER", "JOINT_OWNER", "AUTHORIZED_USER"), "status": ("Active", "Inactive")},
    ),
    "account_type": DatasetContract(
        "account_type_id",
        {"accounttypeid": "account_type_id", "typename": "type_name", "minbalance": "minimum_balance", "interestrate": "interest_rate", "description": "description", "status": "status"},
        ("account_type_id", "type_name", "minimum_balance", "interest_rate", "status"),
        nonnegative_columns=("minimum_balance", "interest_rate"), allowed_values={"status": ("Active", "Inactive")},
    ),
    "account_status_history": DatasetContract(
        "history_id",
        {"historyid": "history_id", "accountid": "account_id", "oldstatus": "old_status", "newstatus": "new_status", "changeddate": "changed_at", "changedbytype": "changed_by_type", "employeeid": "employee_id", "reason": "reason"},
        ("history_id", "account_id", "new_status", "changed_at", "changed_by_type"),
        ("changed_at",), allowed_values={"new_status": ("Active", "Frozen", "Closed"), "changed_by_type": ("Employee", "System")},
    ),
    "branch": DatasetContract(
        "branch_id",
        {"branchid": "branch_id", "branchcode": "branch_code", "branchname": "branch_name", "address": "address", "city": "city", "phone": "phone", "opendate": "open_date", "status": "status", "createdat": "created_at"},
        ("branch_id", "branch_code", "branch_name", "address", "city", "open_date", "status", "created_at"),
        ("created_at",), allowed_values={"status": ("Active", "Inactive")},
    ),
    "terminal": DatasetContract(
        "terminal_id",
        {"terminalid": "terminal_id", "terminalcode": "terminal_code", "branchid": "branch_id", "terminaltype": "terminal_type", "locationname": "location_name", "address": "address", "status": "status"},
        ("terminal_id", "terminal_code", "terminal_type", "status"),
        allowed_values={"terminal_type": ("ATM", "POS", "COUNTER"), "status": ("Active", "Inactive", "Maintenance")},
    ),
    "risk_assessment": DatasetContract(
        "risk_assessment_id",
        {"riskassessmentid": "risk_assessment_id", "transactionid": "transaction_id", "modelversionid": "model_version_id", "rulescore": "rule_score", "risklevel": "risk_level", "modelprobability": "model_probability", "decision": "decision", "reasonjson": "reason_json", "assessedat": "assessed_at"},
        ("risk_assessment_id", "transaction_id", "model_version_id", "rule_score", "risk_level", "model_probability", "decision", "assessed_at"),
        ("assessed_at",), nonnegative_columns=("rule_score", "model_probability"),
        allowed_values={"risk_level": ("LOW", "MEDIUM", "HIGH", "CRITICAL"), "decision": ("ALLOW", "REVIEW", "BLOCK")},
    ),
    "review_case": DatasetContract(
        "review_case_id",
        {"reviewcaseid": "review_case_id", "transactionid": "transaction_id", "status": "status", "revieweruserid": "reviewer_user_id", "createdat": "created_at", "reviewedat": "reviewed_at", "reason": "reason"},
        ("review_case_id", "transaction_id", "status", "created_at"),
        ("created_at", "reviewed_at"), allowed_values={"status": ("OPEN", "IN_REVIEW", "APPROVED", "REJECTED", "CLOSED")},
    ),
    "fraud_label_event": DatasetContract(
        "fraud_label_event_id",
        {"fraudlabeleventid": "fraud_label_event_id", "transactionid": "transaction_id", "label": "label", "labeledat": "labeled_at", "labelsource": "label_source", "note": "note"},
        ("fraud_label_event_id", "transaction_id", "label", "labeled_at", "label_source"),
        ("labeled_at",), allowed_values={"label": ("FRAUD", "LEGITIMATE", "UNKNOWN")},
    ),
    "model_version": DatasetContract(
        "model_version_id",
        {"modelversionid": "model_version_id", "modelname": "model_name", "modeltype": "model_type", "status": "status", "createdat": "created_at", "description": "description"},
        ("model_version_id", "model_name", "model_type", "status", "created_at"),
        ("created_at",), allowed_values={"status": ("CANDIDATE", "ACTIVE", "RETIRED")},
    ),
    "loan": DatasetContract(
        "loan_id",
        {"loanid": "loan_id", "loancode": "loan_code", "customerid": "customer_id", "branchid": "branch_id", "employeeid": "employee_id", "loantypeid": "loan_type_id", "principalamount": "principal_amount", "interestrate": "interest_rate", "termmonths": "term_months", "startdate": "start_date", "enddate": "end_date", "status": "status"},
        ("loan_id", "loan_code", "customer_id", "branch_id", "employee_id", "loan_type_id", "principal_amount", "interest_rate", "term_months", "start_date", "end_date", "status"),
        positive_columns=("principal_amount", "term_months"), nonnegative_columns=("interest_rate",),
        allowed_values={"status": ("Pending", "Active", "Paid", "Overdue", "Cancelled")},
    ),
    "loan_type": DatasetContract(
        "loan_type_id",
        {"loantypeid": "loan_type_id", "loantypename": "loan_type_name", "maxamount": "max_amount", "defaultinterestrate": "default_interest_rate", "maxtermmonths": "max_term_months", "description": "description", "status": "status"},
        ("loan_type_id", "loan_type_name", "max_amount", "default_interest_rate", "max_term_months", "status"),
        positive_columns=("max_amount", "max_term_months"), nonnegative_columns=("default_interest_rate",), allowed_values={"status": ("Active", "Inactive")},
    ),
    "repayment_schedule": DatasetContract(
        "schedule_id",
        {"scheduleid": "schedule_id", "loanid": "loan_id", "installmentno": "installment_no", "duedate": "due_date", "principaldue": "principal_due", "interestdue": "interest_due", "penaltydue": "penalty_due", "status": "status"},
        ("schedule_id", "loan_id", "installment_no", "due_date", "principal_due", "interest_due", "penalty_due", "status"),
        positive_columns=("installment_no",), nonnegative_columns=("principal_due", "interest_due", "penalty_due"), allowed_values={"status": ("Pending", "Partial", "Paid", "Overdue")},
    ),
    "loan_payment": DatasetContract(
        "loan_payment_id",
        {"loanpaymentid": "loan_payment_id", "loanid": "loan_id", "scheduleid": "schedule_id", "paymentdate": "payment_at", "amountpaid": "amount_paid", "principalpaid": "principal_paid", "interestpaid": "interest_paid", "penaltyfee": "penalty_fee", "paymentchannel": "payment_channel", "employeeid": "employee_id", "note": "note", "transactionid": "transaction_id"},
        ("loan_payment_id", "loan_id", "payment_at", "amount_paid", "principal_paid", "interest_paid", "penalty_fee", "payment_channel", "transaction_id"),
        ("payment_at",), ("amount_paid",), ("principal_paid", "interest_paid", "penalty_fee"), {"payment_channel": ("Counter", "Account", "Online")},
    ),
    "event_outbox": DatasetContract(
        "event_outbox_id",
        {"eventoutboxid": "event_outbox_id", "eventkey": "event_key", "aggregatetype": "aggregate_type", "aggregateid": "aggregate_id", "eventtype": "event_type", "payloadjson": "payload_json", "createdat": "created_at", "publishedat": "published_at", "status": "status"},
        ("event_outbox_id", "event_key", "aggregate_type", "aggregate_id", "event_type", "payload_json", "created_at", "status"),
        ("created_at", "published_at"), allowed_values={"status": ("PENDING", "PUBLISHED", "FAILED")},
    ),
}


def contract_for(dataset: str) -> DatasetContract:
    try:
        return CONTRACTS[dataset]
    except KeyError as exc:
        raise ValueError(f"Dataset is not allowlisted: {dataset}") from exc
