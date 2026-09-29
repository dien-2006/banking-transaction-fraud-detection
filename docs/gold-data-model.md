# Gold data model

Gold là lớp dimensional idempotent được Spark build từ Silver canonical. Mỗi lần build ghi đè deterministic theo business key; chạy lại cùng input không làm tăng record.

## Dimensions (10)

| Dataset | Grain / key |
|---|---|
| `dim_date` | một ngày, `date_key=yyyyMMdd` |
| `dim_time` | một phút trong ngày, `time_key=HHmm` |
| `dim_customer` | một customer nguồn, `customer_key=customer_id` |
| `dim_account` | một bank account nguồn, `account_key=account_id` |
| `dim_account_type` | một account type nguồn |
| `dim_branch` | một branch nguồn |
| `dim_transaction_type` | một transaction type nguồn |
| `dim_channel` | một channel chuẩn hóa |
| `dim_device` | một customer device nguồn |
| `dim_model` | một model version nguồn; binary artifact không nằm trong PostgreSQL |

## Facts (7)

| Dataset | Grain / key | Measures chính |
|---|---|---|
| `fact_transaction` | một `bank_transaction`, `transaction_id` | amount, fee, status |
| `fact_transaction_posting` | một `transaction_posting`, `posting_id` | amount, posting_type |
| `fact_risk_assessment` | một `risk_assessment`, `risk_assessment_id` | rule_score, risk_level, model_probability, decision |
| `fact_fraud_review` | một `review_case`, `review_case_id` | status, created/reviewed time |
| `fact_fraud_label_event` | một `fraud_label_event`, `fraud_label_event_id` | label, label source |
| `fact_login_event` | một `login_event`, `login_event_id` | status, login time |
| `fact_loan_payment` | một `loan_payment`, `loan_payment_id` | amount/principal/interest/penalty |

## Build and reconciliation rules

1. Dimensions được build và kiểm tra uniqueness trước facts.
2. Facts giữ source business key để trace và có đúng một row trên grain.
3. `fact_transaction` không nhân dòng khi join account holder; customer là người khởi tạo giao dịch.
4. Transfer Success phải có Debit/Credit cân bằng. Pending/Failed/Cancelled không được có posting.
5. `fact_risk_assessment` dùng contract V1: `rule_score 0..100`, `risk_level`, `model_probability 0..1`, `ALLOW/REVIEW/BLOCK`.
6. Nhãn fraud chỉ đến từ `fraud_label_event`; không suy diễn từ decision.
7. Missing dimension dùng key `-1` khi quan hệ nguồn nullable/không áp dụng; DQ phải theo dõi thay vì drop fact.
8. Gold writer dùng overwrite deterministic; replay cùng Silver input phải giữ nguyên count và totals.

Trino đăng ký đúng 17 external Parquet tables này trong catalog `hive.gold`; DDL registration nằm ở `scripts/register_trino.py`.
