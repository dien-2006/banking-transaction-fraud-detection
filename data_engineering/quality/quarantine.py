from __future__ import annotations

from typing import Any

from pyspark.sql import DataFrame, Window, functions as F

from data_engineering.common.config import s3a
from data_engineering.common.contracts import contract_for


TRANSACTION_CHILDREN = (
    "transfer_request",
    "transaction_posting",
    "risk_assessment",
    "review_case",
    "fraud_label_event",
    "loan_payment",
)


def _reason(code: str, message: str) -> tuple[Any, Any]:
    return F.lit(code).alias("error_code"), F.lit(message).alias("error_reason")


def _transaction_violations(frames: dict[str, DataFrame]) -> DataFrame:
    transactions = frames["bank_transaction"]
    postings = frames["transaction_posting"]

    success_without_postings = (
        transactions.filter(F.col("status") == "Success")
        .select("transaction_id")
        .join(postings.select("transaction_id").distinct(), "transaction_id", "left_anti")
        .select(
            "transaction_id",
            *_reason(
                "SUCCESS_WITHOUT_POSTING",
                "successful transaction has no financial posting",
            ),
        )
    )

    posting_totals = postings.groupBy("transaction_id").agg(
        F.sum(
            F.when(F.col("posting_type") == "DEBIT", F.col("amount")).otherwise(0)
        ).alias("debit"),
        F.sum(
            F.when(F.col("posting_type") == "CREDIT", F.col("amount")).otherwise(0)
        ).alias("credit"),
    )
    unbalanced_transfers = (
        transactions.filter(F.col("status") == "Success")
        .select("transaction_id", "amount")
        .join(posting_totals, "transaction_id", "left")
        .filter(
            F.col("debit").isNull()
            | F.col("credit").isNull()
            | (F.col("debit") != F.col("credit"))
            | (F.col("debit") != F.col("amount"))
        )
        .select(
            "transaction_id",
            *_reason(
                "UNBALANCED_SUCCESSFUL_TRANSFER",
                "successful transaction posting totals are missing, unequal or do not match its amount",
            ),
        )
    )

    risk_window = Window.partitionBy("transaction_id").orderBy(
        F.col("assessed_at").desc(), F.col("risk_assessment_id").desc()
    )
    latest_risk = (
        frames["risk_assessment"]
        .withColumn("_rank", F.row_number().over(risk_window))
        .filter(F.col("_rank") == 1)
        .drop("_rank")
    )
    approved_reviews = (
        frames["review_case"]
        .filter(F.col("status") == "APPROVED")
        .select("transaction_id")
        .distinct()
        .withColumn("review_approved", F.lit(True))
    )
    valid_reversals = (
        transactions.filter(F.col("status") == "Success")
        .join(frames["transaction_type"].filter(F.col("type_code") == "REVERSAL").select("transaction_type_id"), "transaction_type_id")
        .join(transactions.filter(F.col("status") == "Success").select(F.col("transaction_id").alias("original_transaction_id")), "original_transaction_id")
        .select("transaction_id").distinct()
    )
    invalid_gate = (
        transactions.filter(F.col("status") == "Success")
        .select("transaction_id")
        .join(valid_reversals, "transaction_id", "left_anti")
        .join(
            latest_risk.select("transaction_id", "decision"),
            "transaction_id",
            "left",
        )
        .join(approved_reviews, "transaction_id", "left")
        .filter(
            ~F.coalesce(
                (F.col("decision") == "ALLOW")
                | (
                    (F.col("decision") == "REVIEW")
                    & F.coalesce(F.col("review_approved"), F.lit(False))
                ),
                F.lit(False),
            )
        )
        .select(
            "transaction_id",
            *_reason(
                "SUCCESS_WITHOUT_RISK_APPROVAL",
                "successful transaction lacks ALLOW or an approved REVIEW",
            ),
        )
    )

    completed = frames['event_outbox'].filter(
        (F.col('event_type') == 'TransactionCompleted') & (F.col('aggregate_type') == 'BANK_TRANSACTION')
    ).select(F.col('aggregate_id').alias('_aggregate_id')).distinct()
    missing_outbox = transactions.filter(F.col('status') == 'Success').join(
        completed, F.col('transaction_id').cast('string') == F.col('_aggregate_id'), 'left_anti'
    ).select('transaction_id', *_reason('SUCCESS_WITHOUT_COMPLETED_OUTBOX', 'successful transaction has no committed completed event'))

    return (
        success_without_postings.unionByName(unbalanced_transfers)
        .unionByName(invalid_gate)
        .unionByName(missing_outbox)
        .groupBy("transaction_id")
        .agg(
            F.concat_ws(
                "|", F.sort_array(F.collect_set("error_code"))
            ).alias("error_code"),
            F.concat_ws(
                " | ", F.sort_array(F.collect_set("error_reason"))
            ).alias("error_reason"),
        )
    )


def _posting_violations(frames: dict[str, DataFrame]) -> DataFrame:
    return (
        frames["transaction_posting"]
        .join(
            frames["bank_transaction"].select("transaction_id", "status"),
            "transaction_id",
        )
        .filter(F.col("status") != "Success")
        .select(
            "posting_id",
            *_reason(
                "POSTING_FOR_NON_SUCCESS_TRANSACTION",
                "financial posting belongs to a non-success transaction",
            ),
        )
    )


def _write_quarantine(
    frame: DataFrame,
    dataset: str,
    reasons: DataFrame,
    reason_key: str,
    batch_id: str,
    rule_path: str = 'business_rules',
) -> tuple[DataFrame, int]:
    reason_keys = reasons.select(reason_key).distinct()
    valid = frame.join(reason_keys, reason_key, "left_anti")
    invalid = frame.join(reasons, reason_key, "inner")
    invalid_count = invalid.count()
    if invalid_count:
        original_columns = frame.columns
        contract = contract_for(dataset)
        (
            invalid.withColumn("source_dataset", F.lit(dataset))
            .withColumn(
                "business_key", F.col(contract.primary_key).cast("string")
            )
            .withColumn(
                "original_data",
                F.to_json(F.struct(*[F.col(column) for column in original_columns])),
            )
            .withColumn("batch_id", F.lit(batch_id))
            .withColumn("quarantined_at", F.current_timestamp())
            .write.mode("overwrite")
            .parquet(
                s3a(
                    "MINIO_BUCKET_QUARANTINE",
                    f"{dataset}/batch_id={batch_id}/{rule_path}",
                )
            )
        )
    return valid, invalid_count


def quarantine_loan_violations(spark, frames: dict[str, DataFrame], batch_id: str) -> int:
    payments = frames['loan_payment']
    tx = frames['bank_transaction'].select('transaction_id', F.col('status').alias('_tx_status'),
        F.col('amount').alias('_tx_amount'), 'transaction_type_id')
    types = frames['transaction_type'].select('transaction_type_id', 'type_code')
    schedules = frames['repayment_schedule'].select('loan_id', 'schedule_id', 'principal_due', 'interest_due', 'penalty_due')
    joined = payments.join(tx, 'transaction_id', 'left').join(types, 'transaction_type_id', 'left')
    joined = joined.join(schedules.withColumn('_has_schedule', F.lit(True)), ['loan_id', 'schedule_id'], 'left')
    invalid = joined.filter(
        ~F.coalesce((F.col('_tx_status') == 'Success') & (F.col('type_code') == 'LOAN_PAYMENT')
                    & (F.col('amount_paid') == F.col('_tx_amount')), F.lit(False))
        | (F.col('schedule_id').isNotNull() & F.col('_has_schedule').isNull())
    ).select('loan_payment_id')
    totals = payments.filter(F.col('schedule_id').isNotNull()).groupBy('loan_id', 'schedule_id').agg(
        F.sum('principal_paid').alias('_principal'), F.sum('interest_paid').alias('_interest'), F.sum('penalty_fee').alias('_penalty'))
    overpaid = totals.join(schedules, ['loan_id', 'schedule_id']).filter(
        (F.col('_principal') > F.col('principal_due')) | (F.col('_interest') > F.col('interest_due')) | (F.col('_penalty') > F.col('penalty_due')))
    invalid = invalid.unionByName(payments.join(overpaid.select('loan_id','schedule_id'), ['loan_id','schedule_id']).select('loan_payment_id')).distinct()
    reasons = invalid.select('loan_payment_id', *_reason('INVALID_LOAN_PAYMENT_DOMAIN', 'payment does not reconcile with financial transaction or loan schedule')).localCheckpoint(eager=True)
    try:
        if not reasons.count():
            return 0
        valid, count = _write_quarantine(payments, 'loan_payment', reasons, 'loan_payment_id', batch_id, 'loan_rules')
        frames['loan_payment'] = _replace_silver(spark, 'loan_payment', valid, batch_id)
        return count
    finally:
        reasons.unpersist()


def _replace_silver(
    spark,
    dataset: str,
    frame: DataFrame,
    batch_id: str,
) -> DataFrame:
    staging = s3a(
        "MINIO_BUCKET_SILVER",
        f"_staging/business_dq/{batch_id}/{dataset}",
    )
    target = s3a("MINIO_BUCKET_SILVER", dataset)
    frame.write.mode("overwrite").parquet(staging)
    staged = spark.read.parquet(staging)
    staged.write.mode("overwrite").parquet(target)
    staging_path = spark._jvm.org.apache.hadoop.fs.Path(staging)
    staging_path.getFileSystem(
        spark._jsc.hadoopConfiguration()
    ).delete(staging_path, True)
    return spark.read.parquet(target)


def quarantine_business_violations(
    spark,
    frames: dict[str, DataFrame],
    batch_id: str,
) -> dict[str, int]:
    # Cut the lineage before any Silver path is overwritten. Otherwise Spark may
    # recompute the violation set against an already-filtered parent dataset.
    transaction_reasons = _transaction_violations(frames).localCheckpoint(
        eager=True
    )
    invalid_transactions = transaction_reasons.count()
    posting_only_reasons = _posting_violations(frames).localCheckpoint(
        eager=True
    )
    invalid_postings = posting_only_reasons.count()
    metrics: dict[str, int] = {
        "invalid_transactions": invalid_transactions,
        "postings_for_non_success_transactions": invalid_postings,
    }
    if not invalid_transactions and not invalid_postings:
        transaction_reasons.unpersist()
        posting_only_reasons.unpersist()
        return metrics

    replacements: dict[str, DataFrame] = {}
    if invalid_transactions:
        replacements["bank_transaction"], count = _write_quarantine(
            frames["bank_transaction"],
            "bank_transaction",
            transaction_reasons,
            "transaction_id",
            batch_id,
        )
        metrics["bank_transaction"] = count

        for dataset in TRANSACTION_CHILDREN:
            child_reasons = (
                frames[dataset]
                .select("transaction_id")
                .distinct()
                .join(transaction_reasons, "transaction_id")
            )
            if dataset == "transaction_posting" and invalid_postings:
                posting_reasons = (
                    frames[dataset]
                    .select("posting_id", "transaction_id")
                    .join(posting_only_reasons, "posting_id")
                    .select("transaction_id", "error_code", "error_reason")
                )
                child_reasons = (
                    child_reasons.unionByName(posting_reasons)
                    .groupBy("transaction_id")
                    .agg(
                        F.concat_ws(
                            "|", F.sort_array(F.collect_set("error_code"))
                        ).alias("error_code"),
                        F.concat_ws(
                            " | ", F.sort_array(F.collect_set("error_reason"))
                        ).alias("error_reason"),
                    )
                )
            replacements[dataset], count = _write_quarantine(
                frames[dataset],
                dataset,
                child_reasons,
                "transaction_id",
                batch_id,
            )
            metrics[dataset] = count
    elif invalid_postings:
        posting_reasons = (
            frames["transaction_posting"]
            .select("posting_id")
            .join(posting_only_reasons, "posting_id")
        )
        replacements["transaction_posting"], count = _write_quarantine(
            frames["transaction_posting"],
            "transaction_posting",
            posting_reasons,
            "posting_id",
            batch_id,
        )
        metrics["transaction_posting"] = count

    for dataset, replacement in replacements.items():
        frames[dataset] = _replace_silver(
            spark, dataset, replacement, batch_id
        )

    transaction_reasons.unpersist()
    posting_only_reasons.unpersist()
    return metrics
