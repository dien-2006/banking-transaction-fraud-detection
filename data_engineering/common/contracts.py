"""Immutable source-to-Silver contracts for the 20 V1 batch datasets."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DatasetContract:
    primary_key: str
    columns: dict[str, str]
    required: tuple[str, ...]
    timestamps: tuple[str, ...] = ()


def _columns(spec: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in spec.split():
        source, _, target = item.partition(":")
        result[source] = target or source
    return result


def _contract(pk: str, spec: str, required: str, timestamps: str = "") -> DatasetContract:
    return DatasetContract(
        primary_key=pk,
        columns=_columns(spec),
        required=tuple(required.split()),
        timestamps=tuple(timestamps.split()),
    )


CONTRACTS: dict[str, DatasetContract] = {
    "branch": _contract(
        "branch_id",
        "branchid:branch_id branchcode:branch_code branchname:branch_name address city phone opendate:open_date status createdat:created_at",
        "branch_id branch_code branch_name address city open_date status created_at", "created_at",
    ),
    "customer": _contract(
        "customer_id",
        "customerid:customer_id customercode:customer_code fullname:full_name gender dateofbirth:date_of_birth nationalid:national_id phone email address occupation customertype:customer_type createddate:created_at status customersegment:customer_segment",
        "customer_id customer_code full_name created_at status", "created_at",
    ),
    "customer_device": _contract(
        "device_id",
        "deviceid:device_id customerid:customer_id devicecode:device_code devicetype:device_type devicename:device_name operatingsystem:operating_system firstseenat:first_seen_at lastseenat:last_seen_at istrusted:is_trusted status",
        "device_id customer_id device_code device_type first_seen_at is_trusted status", "first_seen_at last_seen_at",
    ),
    "login_event": _contract(
        "login_event_id", "logineventid:login_event_id customerid:customer_id deviceid:device_id logintime:login_at ipaddress:ip_address status failurereason:failure_reason",
        "login_event_id customer_id login_at status", "login_at",
    ),
    "account_type": _contract(
        "account_type_id", "accounttypeid:account_type_id typename:type_name minbalance:minimum_balance interestrate:interest_rate description status",
        "account_type_id type_name minimum_balance interest_rate status",
    ),
    "bank_account": _contract(
        "account_id", "accountid:account_id accountnumber:account_number branchid:branch_id accounttypeid:account_type_id opendate:open_date balance currency status createdat:created_at updatedat:updated_at accountcategory:account_category",
        "account_id account_number branch_id account_type_id open_date balance currency status created_at account_category", "created_at updated_at",
    ),
    "account_holder": _contract(
        "account_holder_id", "accountholderid:account_holder_id accountid:account_id customerid:customer_id holdertype:holder_type startdate:start_date enddate:end_date status",
        "account_holder_id account_id customer_id holder_type start_date status",
    ),
    "transaction_type": _contract(
        "transaction_type_id", "transactiontypeid:transaction_type_id typecode:type_code typename:type_name description status",
        "transaction_type_id type_code type_name status",
    ),
    "bank_transaction": _contract(
        "transaction_id",
        "transactionid:transaction_id transactioncode:transaction_code transactiontypeid:transaction_type_id employeeid:employee_id terminalid:terminal_id deviceid:device_id channel amount fee currency transactiondate:transaction_at ipaddress:ip_address latitude longitude description status initiatedbycustomerid:initiated_by_customer_id cardid:card_id originaltransactionid:original_transaction_id",
        "transaction_id transaction_code transaction_type_id channel amount fee currency transaction_at status", "transaction_at",
    ),
    "transfer_request": _contract(
        "transfer_request_id", "transferrequestid:transfer_request_id transactionid:transaction_id customerid:customer_id sourceaccountid:source_account_id destinationaccountid:destination_account_id idempotencykey:idempotency_key amount currency requestedat:requested_at status",
        "transfer_request_id transaction_id customer_id source_account_id destination_account_id idempotency_key amount currency requested_at status", "requested_at",
    ),
    "transaction_posting": _contract(
        "posting_id", "postingid:posting_id transactionid:transaction_id accountid:account_id postingtype:posting_type amount postingdate:posting_at description",
        "posting_id transaction_id account_id posting_type amount posting_at", "posting_at",
    ),
    "loan_type": _contract(
        "loan_type_id", "loantypeid:loan_type_id loantypename:loan_type_name maxamount:max_amount defaultinterestrate:default_interest_rate maxtermmonths:max_term_months description status",
        "loan_type_id loan_type_name max_amount default_interest_rate max_term_months status",
    ),
    "loan": _contract(
        "loan_id", "loanid:loan_id loancode:loan_code customerid:customer_id branchid:branch_id employeeid:employee_id loantypeid:loan_type_id principalamount:principal_amount interestrate:interest_rate termmonths:term_months startdate:start_date enddate:end_date status",
        "loan_id loan_code customer_id branch_id employee_id loan_type_id principal_amount interest_rate term_months start_date end_date status",
    ),
    "repayment_schedule": _contract(
        "schedule_id", "scheduleid:schedule_id loanid:loan_id installmentno:installment_no duedate:due_date principaldue:principal_due interestdue:interest_due penaltydue:penalty_due status",
        "schedule_id loan_id installment_no due_date principal_due interest_due penalty_due status",
    ),
    "loan_payment": _contract(
        "loan_payment_id", "loanpaymentid:loan_payment_id loanid:loan_id scheduleid:schedule_id paymentdate:payment_at amountpaid:amount_paid principalpaid:principal_paid interestpaid:interest_paid penaltyfee:penalty_fee paymentchannel:payment_channel employeeid:employee_id note transactionid:transaction_id",
        "loan_payment_id loan_id payment_at amount_paid principal_paid interest_paid penalty_fee payment_channel transaction_id", "payment_at",
    ),
    "model_version": _contract(
        "model_version_id", "modelversionid:model_version_id modelname:model_name modeltype:model_type status createdat:created_at description",
        "model_version_id model_name model_type status created_at", "created_at",
    ),
    "risk_assessment": _contract(
        "risk_assessment_id", "riskassessmentid:risk_assessment_id transactionid:transaction_id modelversionid:model_version_id rulescore:rule_score risklevel:risk_level modelprobability:model_probability decision reasonjson:reason_json assessedat:assessed_at",
        "risk_assessment_id transaction_id model_version_id rule_score risk_level model_probability decision assessed_at", "assessed_at",
    ),
    "review_case": _contract(
        "review_case_id", "reviewcaseid:review_case_id transactionid:transaction_id status revieweruserid:reviewer_user_id createdat:created_at reviewedat:reviewed_at reason",
        "review_case_id transaction_id status created_at", "created_at reviewed_at",
    ),
    "fraud_label_event": _contract(
        "fraud_label_event_id", "fraudlabeleventid:fraud_label_event_id transactionid:transaction_id label labeledat:labeled_at labelsource:label_source note",
        "fraud_label_event_id transaction_id label labeled_at label_source", "labeled_at",
    ),
    "event_outbox": _contract(
        "event_outbox_id", "eventoutboxid:event_outbox_id eventkey:event_key aggregatetype:aggregate_type aggregateid:aggregate_id eventtype:event_type payloadjson:payload_json createdat:created_at publishedat:published_at status",
        "event_outbox_id event_key aggregate_type aggregate_id event_type payload_json created_at status", "created_at published_at",
    ),
}


def contract_for(dataset: str) -> DatasetContract:
    try:
        return CONTRACTS[dataset]
    except KeyError as exc:
        raise ValueError(f"dataset is not allowlisted: {dataset}") from exc
