# Bank Fraud Detection & Data Platform

Hệ thống mô phỏng một nền tảng ngân hàng tích hợp **xử lý giao dịch**, **đánh giá rủi ro/phát hiện gian lận**, **Batch + Realtime Data Pipeline**, **Data Lakehouse Bronze/Silver/Gold**, **Machine Learning** và **BI/Analytics**.

> **Nguyên tắc dự án:** PostgreSQL schema hiện tại trong `create_table_risk_updated.sql` được xem là **cố định**. Các service, pipeline ETL và ML phải thích nghi với schema này; không thay đổi database chỉ để phục vụ ETL/ML.

---

## 1. Mục tiêu dự án

Dự án được xây dựng để mô phỏng end-to-end một hệ thống ngân hàng có khả năng:

- Quản lý dữ liệu nghiệp vụ ngân hàng trong PostgreSQL.
- Tiếp nhận và xử lý giao dịch tài chính an toàn theo database transaction.
- Đánh giá rủi ro bằng **Rule Engine + Machine Learning**.
- Đưa ra quyết định `ALLOW`, `REVIEW` hoặc `BLOCK` trước khi xử lý tài chính.
- Sử dụng **Transactional Outbox** để tách Banking Core khỏi Data Platform.
- Thu thập dữ liệu theo cả **Batch** và **Realtime**.
- Lưu raw data trên MinIO Bronze.
- Làm sạch, chuẩn hóa, kiểm tra chất lượng và deduplicate bằng Spark.
- Đưa dữ liệu lỗi vào Quarantine thay vì xóa.
- Xây dựng Silver và Gold phục vụ phân tích.
- Query dữ liệu Lakehouse bằng Trino.
- Tạo Feature Mart và huấn luyện model phát hiện gian lận.
- Phục vụ Web, BI Dashboard và báo cáo.

---

## 2. Kiến trúc tổng thể

```text
                                      USER / BANKING CLIENT
                                               |
                                               v
                                      Create Transaction
                                               |
                                               v
                                         PostgreSQL
                                               |
                                      BANK_TRANSACTION
                                               |
                                               v
+--------------------------------------------------------------------------------+
|                              RISK / FRAUD ENGINE                               |
|                                                                                |
|         Rule Engine                                  ML Model                  |
|             |                                            |                     |
|             v                                            v                     |
|       RuleScore 0-100                         ModelProbability 0-1              |
|             \                                            /                     |
|              +---------------- Decision Engine --------+                       |
|                                   |                                            |
|                         ALLOW / REVIEW / BLOCK                                 |
+--------------------------------------------------------------------------------+
                         |          |          |
                         |          |          +-----------------> STOP
                         |          |
                         |          +----------------------------> REVIEW_CASE
                         |                                             |
                         |                                      APPROVE / REJECT
                         |                                             |
                         +------------------+--------------------------+
                                            |
                                            v
                                  FINANCIAL PROCESSING
                                            |
                               Transaction Posting
                               Debit / Credit / Balance
                                            |
                                  BANK_TRANSACTION
                                      = SUCCESS
                                            |
                                      EVENT_OUTBOX
                                            |
                                          COMMIT
                                            |
============================== BANKING / DATA BOUNDARY ===========================
                                            |
                         +------------------+------------------+
                         |                                     |
                         v                                     v
                       BATCH                               REALTIME
                         |                                     |
                  Spark JDBC                           Outbox Publisher
                         |                                     |
                         |                                   Kafka
                         |                                     |
                         |                              Kafka Consumer
                         |                                     |
                         +------------------+------------------+
                                            |
                                            v
                                      MINIO BRONZE
                                            |
                                            v
                                           Spark
                                   Normalize / Validate
                                      /           \
                                     v             v
                                  SILVER       QUARANTINE
                                     |
                                     v
                                DATA QUALITY
                                     |
                                     v
                                    GOLD
                               10 DIM + 7 FACT
                                     |
                         +-----------+------------+
                         |                        |
                         v                        v
                       Trino               ML Feature Mart
                         |                        |
                         v                        v
                  Web / BI / Report          ML Training
```

### Ranh giới quan trọng

**Banking Core** chịu trách nhiệm giao dịch tài chính. **Data Platform** không được tham gia vào critical path của việc chuyển tiền. Sau khi PostgreSQL `COMMIT`, lỗi Kafka, MinIO, Spark hoặc Airflow không được làm đảo ngược giao dịch ngân hàng đã thành công.

---

## 3. Công nghệ sử dụng

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| OLTP Database | PostgreSQL | Dữ liệu nghiệp vụ ngân hàng |
| Risk Rules | Python | Rule Engine |
| Fraud Model | Python / ML | Tính ModelProbability |
| Model Artifact Storage | MinIO | Lưu file model và metadata file ngoài DB |
| Realtime Messaging | Kafka | Event streaming |
| Data Lake | MinIO | Bronze, Silver, Gold, Quarantine |
| Processing Engine | Apache Spark / PySpark | Extract, transform, DQ, dedup, build Gold |
| Orchestration | Apache Airflow | Lập lịch và điều phối Batch ETL |
| Query Engine | Trino | SQL trên dữ liệu Lakehouse |
| BI / Analytics | Tùy công cụ BI/Web | Dashboard và báo cáo |
| Deployment | Docker / Docker Compose | Chạy các service của hệ thống |

---

# 4. PostgreSQL - Banking Source of Truth

Database hiện tại có **29 bảng** và schema được xem là cố định.

```text
branch
role
employee
system_user
customer
customer_online_account
customer_device
login_event
account_type
bank_account
account_holder
account_status_history
card
transaction_type
terminal
bank_transaction
transfer_request
transaction_posting
loan_type
loan
repayment_schedule
loan_payment
model_version
risk_assessment
review_case
fraud_label_event
event_outbox
notification_outbox
audit_log
```

Trong Data Platform, V1 chọn **20 bảng nghiệp vụ** làm nguồn Batch chính:

```text
branch
customer
customer_device
login_event
account_type
bank_account
account_holder
transaction_type
bank_transaction
transfer_request
transaction_posting
loan_type
loan
repayment_schedule
loan_payment
model_version
risk_assessment
review_case
fraud_label_event
event_outbox
```

Các bảng còn lại vẫn thuộc Banking Core nhưng không bắt buộc phải trở thành Batch dataset V1.

---

# 5. Luồng Risk / Fraud Detection

## 5.1 Tổng quan

Mỗi giao dịch được đánh giá bởi hai thành phần độc lập:

```text
BANK_TRANSACTION
       |
       +----------------------+----------------------+
       |                                             |
       v                                             v
 RULE ENGINE                                      ML MODEL
       |                                             |
       v                                             v
 RuleScore                                    ModelProbability
   0-100                                           0-1
       |                                             |
       +----------------------+----------------------+
                              |
                              v
                       DECISION ENGINE
                              |
                    ALLOW / REVIEW / BLOCK
```

## 5.2 Rule Engine V1

| Rule | Điều kiện | Điểm |
|---|---|---:|
| R01 HIGH_AMOUNT | amount >= 50.000.000 VND | +20 |
| R02 NEW_DEVICE | Thiết bị mới | +20 |
| R03 UNUSUAL_TIME | 00:00 - 05:00 | +10 |
| R04 HIGH_VELOCITY | >= 5 giao dịch / 10 phút | +25 |
| R05 FAILED_LOGIN | >= 5 lần login thất bại / 30 phút | +15 |
| R06 AMOUNT_ANOMALY | amount hiện tại >= 5x trung bình 30 ngày | +20 |

```text
RuleScore = MIN(100, tổng điểm rule được kích hoạt)
```

Risk Level:

| RuleScore | Risk Level |
|---:|---|
| 0-39 | LOW |
| 40-59 | MEDIUM |
| 60-79 | HIGH |
| 80-100 | CRITICAL |

Risk Level chỉ dùng để mô tả mức rủi ro; quyết định cuối cùng thuộc Decision Engine.

## 5.3 ML Model

Model trả về:

```text
ModelProbability ∈ [0, 1]
```

Ví dụ:

```text
ModelProbability = 0.82
```

nghĩa là model ước lượng xác suất fraud là `82%` theo model đang sử dụng.

## 5.4 Decision Engine - Policy V1

```text
IF ModelProbability >= 0.90 OR RuleScore >= 80
    -> BLOCK

ELSE IF ModelProbability >= 0.60 OR RuleScore >= 60
    -> REVIEW

ELSE
    -> ALLOW
```

Thứ tự phải là:

```text
BLOCK -> REVIEW -> ALLOW
```

## 5.5 RISK_ASSESSMENT

Schema hiện tại đã hỗ trợ trực tiếp thiết kế Risk V1:

```text
riskassessmentid
transactionid
modelversionid
rulescore
risklevel
modelprobability
decision
reasonjson
assessedat
```

Ràng buộc chính:

```text
rulescore        : 0..100
risklevel        : LOW / MEDIUM / HIGH / CRITICAL
modelprobability : 0..1
decision         : ALLOW / REVIEW / BLOCK
```

Không thay đổi schema này.

---

# 6. Xử lý ALLOW / REVIEW / BLOCK

## ALLOW

`ALLOW` chỉ có nghĩa giao dịch vượt qua Risk/Fraud. Nó **chưa có nghĩa giao dịch đã chuyển tiền thành công**.

```text
ALLOW
  |
  v
BEGIN DATABASE TRANSACTION
  |
  v
LOCK ACCOUNT(S)
  |
  v
RE-CHECK BUSINESS CONDITIONS
  |
  +-- Transaction còn PENDING?
  +-- Account còn ACTIVE?
  +-- Có quyền giao dịch?
  +-- Số dư đủ?
  |
  v
TRANSACTION_POSTING
  |
  +----------+----------+
  |                     |
  v                     v
DEBIT                  CREDIT
  |                     |
  +----------+----------+
             |
             v
       UPDATE BALANCE
             |
             v
BANK_TRANSACTION = SUCCESS
             |
             v
       EVENT_OUTBOX
             |
             v
           COMMIT
```

Các thao tác tài chính quan trọng phải nằm trong cùng database transaction. Nếu lỗi trước `COMMIT`, toàn bộ thay đổi phải `ROLLBACK`.

## REVIEW

```text
REVIEW
   |
   v
CREATE REVIEW_CASE
   |
   v
Nhân viên kiểm tra
   |
   +------ APPROVE ------> Financial Processing
   |
   +------ REJECT -------> STOP
```

Chỉ REVIEW đã được APPROVE mới được đi vào xử lý tài chính.

## BLOCK

```text
BLOCK
  |
  v
STOP
```

Không tạo posting tài chính.

---

# 7. Transactional Outbox và Realtime

Realtime **không đọc trực tiếp `bank_transaction` để publish Kafka**.

```text
Business Transaction
        |
        v
BANK_TRANSACTION / POSTING / RISK
        |
        v
EVENT_OUTBOX
        |
      COMMIT
        |
        v
Outbox Publisher
        |
        v
      Kafka
        |
        v
Kafka Consumer
        |
        v
bronze/kafka/events
```

`EVENT_OUTBOX` được tạo trong database transaction trước `COMMIT`. Sau commit, Outbox Publisher mới chịu trách nhiệm publish event.

### Delivery semantics

Hệ thống phải chấp nhận **at-least-once delivery**. Publisher có thể publish trùng nếu đã nhận Kafka ACK nhưng crash trước khi cập nhật trạng thái outbox. Vì vậy downstream phải idempotent và deduplicate.

Kafka Consumer chỉ commit offset sau khi raw event đã được ghi bền vững xuống Bronze.

---

# 8. Batch Pipeline

Batch sử dụng Spark JDBC đọc 20 bảng nguồn từ PostgreSQL.

```text
PostgreSQL
     |
     v
Spark JDBC
     |
     v
MinIO Bronze
```

Bronze giữ nguyên toàn bộ source columns và bổ sung metadata ingestion:

```text
_ingested_at
_source_system = postgresql
_source_table
_batch_id
_ingestion_mode = BATCH
```

### Full load và Incremental load

**Implementation strategy đề xuất:** lần chạy đầu có thể full load; các lần tiếp theo ưu tiên incremental cho dataset có cột thời gian/khóa phù hợp. Watermark phải được quản lý bên ngoài business schema PostgreSQL để tuân thủ nguyên tắc DB cố định.

---

# 9. MinIO Data Lake

Cấu trúc logical đề xuất:

```text
MinIO
|
+-- bronze/
|   +-- postgres/
|   |   +-- customer/
|   |   +-- bank_account/
|   |   +-- bank_transaction/
|   |   +-- risk_assessment/
|   |   +-- ...
|   |
|   +-- kafka/
|       +-- events/
|
+-- silver/
|   +-- customer/
|   +-- account/
|   +-- transaction/
|   +-- risk_assessment/
|   +-- ...
|
+-- quarantine/
|   +-- <dataset>/
|
+-- gold/
|   +-- dimensions/
|   +-- facts/
|
+-- ml-models/
    +-- fraud_detection/
        +-- v1/
        +-- v2/
        +-- ...
```

Parquet là định dạng phù hợp cho các analytical dataset Bronze/Silver/Gold khi triển khai với Spark + Trino.

---

# 10. Bronze Layer

Bronze là raw zone.

Nguyên tắc:

- Không làm mất dữ liệu nguồn.
- Không tự tạo business field không tồn tại.
- Có thể giữ duplicate raw để audit/replay.
- Batch và Realtime được lưu riêng về mặt ingestion.
- Có metadata để biết dữ liệu đến từ đâu và khi nào.

Realtime Bronze giữ envelope/payload Kafka thực tế. `topic`, `partition`, `offset` chỉ ghi khi consumer thực sự nhận được các metadata đó.

---

# 11. Silver Layer

Silver là lớp dữ liệu business đã chuẩn hóa.

Spark thực hiện:

```text
Bronze
  |
  v
Rename -> snake_case
  |
Type Casting
  |
Timestamp Normalization
  |
Validation
  |
Batch + Realtime Integration
  |
Deduplication
  |
  +------ Invalid ------> Quarantine
  |
 Valid
  |
  v
Silver
```

Điểm quan trọng nhất là một business transaction xuất hiện từ cả Batch và Kafka **không được trở thành hai transaction trong Silver**.

Ví dụ:

```text
Batch:
TX1001 | Success | 10,000,000

Realtime:
event -> aggregateid=TX1001

             |
             v
     Normalize + Deduplicate
             |
             v
silver_transaction
TX1001 chỉ còn 1 bản logic
```

---

# 12. Quarantine

Record không đạt validation **không bị drop**.

Quarantine cần lưu đủ thông tin để audit, sửa lỗi và replay, ví dụ:

```text
source_dataset
business_key
original_data
error_code
error_reason
batch_id
quarantined_at
```

---

# 13. Data Quality

Các nhóm kiểm tra chính:

- Primary/business key không null và không duplicate.
- Reference/FK tồn tại khi nghiệp vụ yêu cầu.
- `amount > 0`.
- `fee >= 0`.
- Currency/status/channel nằm trong allowed values nguồn.
- Posting type chỉ `DEBIT/CREDIT` và amount > 0.
- SUCCESS transaction phải có posting hợp lệ theo nghiệp vụ.
- Pending/Failed/Cancelled không được có posting tài chính có hiệu lực.
- Loan payment phải thỏa reconciliation nghiệp vụ.
- Risk `rulescore` thuộc `0..100`.
- Risk `modelprobability` thuộc `0..1`.
- Decision thuộc `ALLOW/REVIEW/BLOCK`.
- Fraud label thuộc `FRAUD/LEGITIMATE/UNKNOWN`.
- Review timestamp không trước created timestamp.

DQ failure cần được log và/hoặc đưa record lỗi vào Quarantine theo loại kiểm tra.

---

# 14. Gold Layer

Gold được thiết kế theo mô hình dimensional phục vụ BI/Analytics.

## 14.1 Dimensions - 10

```text
dim_date
dim_time
dim_customer
dim_account
dim_account_type
dim_branch
dim_transaction_type
dim_channel
dim_device
dim_model
```

## 14.2 Facts - 7

```text
fact_transaction
fact_transaction_posting
fact_risk_assessment
fact_fraud_review
fact_fraud_label_event
fact_login_event
fact_loan_payment
```

### Build order

```text
Silver
  |
  v
Dimensions
  |
  v
Dimension Key Lookup
  |
  v
Facts
  |
  v
Gold DQ
```

### fact_transaction

Grain:

```text
1 row = 1 BANK_TRANSACTION
```

Dùng để phân tích số lượng giao dịch, amount, fee, status, customer, channel, device, thời gian và các chiều liên quan.

### fact_risk_assessment

Gold Risk phải sử dụng schema Risk hiện tại:

```text
risk_assessment_id
transaction_id
model_key
rule_score
risk_level
model_probability
decision
assessed date/time keys
```

Không dùng thiết kế cũ chỉ có một `risk_score`.

---

# 15. Idempotency và Replay

Toàn bộ Data Platform phải được thiết kế để chạy lại an toàn.

```text
Run #1 -> fact_transaction = 1,000 rows
Run #2 cùng input -> vẫn 1,000 rows
```

Không được:

```text
Run #1 -> 1,000
Run #2 -> 2,000   X
```

Nguyên tắc:

- Bronze có thể giữ raw duplicate cho audit/replay.
- Silver loại duplicate logic.
- Gold phải idempotent.
- Batch + Kafka không tạo duplicate business record.
- Kafka downstream phải chịu được at-least-once.

---

# 16. Machine Learning

## 16.1 Training flow

```text
Silver
  |
  v
ML Feature Mart
  |
  v
Feature Engineering
  |
  v
Train / Validate
  |
  v
Model Artifact
  |
  v
MinIO ml-models/
```

## 16.2 Model storage

PostgreSQL **không lưu file model** và schema DB không thay đổi.

File model được lưu ngoài DB, ví dụ:

```text
ml-models/
└── fraud_detection/
    ├── v1/
    │   ├── model.pkl
    │   ├── metadata.json
    │   └── features.json
    ├── v2/
    │   ├── model.pkl
    │   ├── metadata.json
    │   └── features.json
    └── ...
```

`model_version` trong PostgreSQL tiếp tục giữ metadata hiện có:

```text
modelversionid
modelname
modeltype
status
createdat
description
```

Ứng dụng dùng convention/config bên ngoài DB để ánh xạ model version tới artifact MinIO.

## 16.3 Realtime inference

Không download model từ MinIO cho mỗi transaction.

```text
Risk Service Start
       |
       v
Find ACTIVE model metadata
       |
       v
Load artifact from MinIO
       |
       v
Keep model in memory
       |
       v
READY

Transaction -> Feature Builder -> predict_proba -> ModelProbability
```

---

# 17. Airflow

Airflow dùng cho orchestration Batch/Data Quality, **không dùng để xử lý chuyển tiền** và không nên dùng như một Kafka Consumer 24/7.

Các DAG logical:

```text
postgres_to_bronze
bronze_to_silver
silver_dq
silver_to_gold
```

Dependency tổng quát:

```text
PostgreSQL -> Bronze -> Silver -> DQ -> Gold -> Gold DQ
```

Nếu Gold lỗi, có thể retry Gold mà không cần extract lại PostgreSQL nếu input Silver tương ứng vẫn hợp lệ.

---

# 18. Realtime Services

Realtime components chạy độc lập với Airflow Batch:

```text
Outbox Publisher     -> chạy liên tục
Kafka                -> chạy liên tục
Kafka Consumer       -> chạy liên tục
```

Airflow tập trung vào:

```text
Batch ETL
Data Quality
Gold Build
Maintenance / scheduled jobs
```

---

# 19. Trino và Analytics

Trino đóng vai trò query engine trên analytical data trong MinIO.

```text
MinIO Gold
    |
    v
  Trino
    |
    +------> BI Dashboard
    +------> Web Analytics
    +------> Ad-hoc SQL
    +------> Reports
```

Các nhóm câu hỏi có thể phân tích:

- Tổng số và giá trị giao dịch theo ngày/tháng.
- Transaction success/failure rate.
- Giao dịch theo channel/device/customer segment.
- Số lượng `ALLOW/REVIEW/BLOCK`.
- Phân bố RuleScore và RiskLevel.
- ModelProbability theo fraud label.
- Tỷ lệ REVIEW được approve/reject.
- Fraud theo thiết bị, thời gian, channel.
- Login failure và hành vi trước giao dịch đáng ngờ.
- Loan payment performance.

---

# 20. Cấu trúc source code đề xuất

Đây là cấu trúc triển khai mục tiêu. Các module có thể được bổ sung dần trong quá trình phát triển nhưng phải giữ ranh giới trách nhiệm như dưới đây.

```text
bank-fraud-detection/
│
├── README.md
├── docker-compose.yml
│
├── database/
│   └── create_table_risk_updated.sql
│
├── banking/
│   ├── transaction_service.py
│   ├── transfer_service.py
│   ├── posting_service.py
│   ├── account_service.py
│   └── outbox_service.py
│
├── risk/
│   ├── rule_engine/
│   │   ├── engine.py
│   │   └── rules.py
│   │
│   ├── ml/
│   │   ├── feature_builder.py
│   │   └── predictor.py
│   │
│   └── decision/
│       └── decision_engine.py
│
├── realtime/
│   ├── outbox_publisher/
│   │   └── publisher.py
│   │
│   ├── kafka/
│   │   └── consumer.py
│   │
│   └── schemas/
│       └── event_schema.py
│
├── airflow/
│   └── dags/
│       ├── postgres_to_bronze.py
│       ├── bronze_to_silver.py
│       ├── silver_dq.py
│       └── silver_to_gold.py
│
├── spark/
│   ├── bronze/
│   │   └── extract_postgres.py
│   │
│   ├── silver/
│   │   ├── customer.py
│   │   ├── transaction.py
│   │   ├── risk_assessment.py
│   │   └── ...
│   │
│   └── gold/
│       ├── dimensions/
│       │   ├── dim_customer.py
│       │   ├── dim_account.py
│       │   └── ...
│       │
│       └── facts/
│           ├── fact_transaction.py
│           ├── fact_risk_assessment.py
│           └── ...
│
├── ml/
│   ├── features/
│   ├── training/
│   ├── evaluation/
│   └── inference/
│
├── config/
│   ├── sources.yaml
│   ├── kafka.yaml
│   ├── risk_rules.yaml
│   ├── data_quality.yaml
│   └── spark.yaml
│
├── common/
│   ├── postgres.py
│   ├── minio.py
│   ├── kafka.py
│   ├── dq.py
│   └── logging.py
│
└── tests/
    ├── banking/
    ├── risk/
    ├── realtime/
    └── data_pipeline/
```

---

# 21. Trách nhiệm từng module

| Module | Trách nhiệm |
|---|---|
| `banking/` | Financial processing, posting, balance, outbox |
| `risk/` | Rule Engine, ML inference, Decision Engine |
| `realtime/` | Outbox Publisher, Kafka Consumer |
| `airflow/` | Batch orchestration |
| `spark/bronze/` | PostgreSQL extraction |
| `spark/silver/` | Normalize, validation, dedup, integration |
| `spark/gold/` | Build dimensions và facts |
| `ml/` | Feature engineering, training, evaluation |
| `config/` | Pipeline/rule/DQ configuration ngoài DB |
| `common/` | Shared clients/utilities |
| `tests/` | Unit/integration/data pipeline tests |

---

# 22. Luồng End-to-End của một giao dịch

Ví dụ một transaction mới:

```text
1. Customer tạo transaction
        |
2. BANK_TRANSACTION = PENDING
        |
3. Rule Engine -> RuleScore
        |
4. ML Model -> ModelProbability
        |
5. Decision Engine
        |
        +-- BLOCK  -> STOP
        |
        +-- REVIEW -> REVIEW_CASE -> APPROVE/REJECT
        |
        +-- ALLOW -----------------------+
                                          |
6. BEGIN DB TRANSACTION                   |
        |                                 |
7. Lock + Re-check                        |
        |                                 |
8. DEBIT/CREDIT Posting                   |
        |                                 |
9. Update Balance                         |
        |                                 |
10. BANK_TRANSACTION = SUCCESS            |
        |                                 |
11. INSERT EVENT_OUTBOX                   |
        |                                 |
12. COMMIT <------------------------------+
        |
================ DATA PLATFORM ================
        |
13. Outbox Publisher
        |
14. Kafka
        |
15. Consumer -> Bronze Realtime
        |
16. Batch PostgreSQL -> Bronze Batch
        |
17. Spark normalize + deduplicate
        |
18. Silver / Quarantine
        |
19. Data Quality
        |
20. Dimensions + Facts
        |
21. Gold
        |
22. Trino -> BI / Analytics
        |
23. Silver -> Feature Mart -> Model Training
```

---

# 23. Failure Handling

## Banking failure trước COMMIT

```text
BEGIN
  |
DEBIT OK
  |
CREDIT ERROR
  |
ROLLBACK
```

Kết quả:

- Không giữ debit dở dang.
- Không để destination thiếu credit tương ứng.
- Không đặt transaction thành SUCCESS.
- Không có committed success event.

## Kafka/MinIO failure sau COMMIT

```text
Banking COMMIT SUCCESS
        |
Kafka / MinIO ERROR
```

Kết quả:

- Giao dịch ngân hàng vẫn SUCCESS.
- Không rollback tiền.
- Outbox event được retry.

## ETL failure

Pipeline phải có khả năng retry theo layer/job mà không tạo duplicate trong Silver/Gold.

---

# 24. Logging và Observability

Mỗi component nên ghi log đủ để trace theo các identifier nghiệp vụ, đặc biệt:

```text
transaction_id
transaction_code
event_outbox_id / event_key
batch_id
model_version_id
risk_assessment_id
```

Data Pipeline nên theo dõi tối thiểu:

```text
input_count
output_count
invalid_count
duplicate_count
quarantine_count
start_time
end_time
status
```

Các metadata này nên được quản lý ở tầng application/pipeline/logging, không yêu cầu sửa business schema PostgreSQL.

---

# 25. Testing Strategy

## Banking tests

- ALLOW nhưng insufficient balance -> không posting.
- Debit thành công nhưng credit lỗi -> rollback toàn bộ.
- SUCCESS chỉ xuất hiện sau posting/balance hợp lệ.
- EVENT_OUTBOX được tạo cùng transaction trước commit.

## Risk tests

- Kiểm tra từng Rule V1.
- RuleScore không vượt 100.
- Threshold BLOCK được ưu tiên trước REVIEW.
- Kiểm tra boundary `0.60`, `0.90`, `60`, `80`.
- Kiểm tra RiskAssessment lưu đúng model version và decision.

## Realtime tests

- Outbox publish thành công.
- Retry khi Kafka lỗi.
- Duplicate event không tạo duplicate business record downstream.
- Consumer chỉ commit offset sau durable Bronze write.

## ETL tests

- PostgreSQL -> Bronze đủ source columns.
- Invalid data -> Quarantine.
- Batch + Kafka cùng transaction -> Silver chỉ một bản logic.
- Re-run Gold -> không tăng duplicate.
- Fact/Dimension grain đúng thiết kế.

---

# 26. Thứ tự triển khai khuyến nghị

Không cần xây toàn bộ hệ thống cùng lúc. Nên triển khai theo vertical slice để kiểm chứng end-to-end trước.

### Phase 1 - Infrastructure

```text
PostgreSQL
MinIO
Kafka
Spark
Airflow
Trino
```

### Phase 2 - Banking Transaction

```text
Create Transaction
-> Posting
-> Balance
-> SUCCESS
-> EVENT_OUTBOX
```

### Phase 3 - Risk/Fraud V1

```text
Rule Engine
+ ML Predictor
-> Decision Engine
-> ALLOW / REVIEW / BLOCK
```

### Phase 4 - Realtime

```text
EVENT_OUTBOX
-> Publisher
-> Kafka
-> Consumer
-> Bronze
```

### Phase 5 - Batch ETL

Bắt đầu với nhóm dữ liệu cốt lõi:

```text
customer
customer_device
bank_account
transaction_type
bank_transaction
risk_assessment
```

Sau đó mở rộng đủ 20 Batch sources.

### Phase 6 - Silver + DQ + Quarantine

Hoàn thành normalize, validation, Batch/Realtime dedup và replay safety.

### Phase 7 - Gold

Build 10 dimensions trước, sau đó 7 facts.

### Phase 8 - Trino + BI

Query Gold và xây dashboard/report.

### Phase 9 - ML Lifecycle

Feature Mart -> Training -> Evaluation -> lưu model artifact MinIO -> Risk Service inference.

---

# 27. Definition of Done

Dự án được xem là hoàn chỉnh khi có thể chứng minh end-to-end:

```text
Transaction được tạo
        -> Risk/Fraud đánh giá
        -> ALLOW/REVIEW/BLOCK đúng Policy
        -> ALLOW/APPROVED xử lý tài chính atomic
        -> SUCCESS + EVENT_OUTBOX commit
        -> Kafka nhận event
        -> Bronze nhận realtime data
        -> Batch lấy dữ liệu PostgreSQL
        -> Silver hợp nhất và deduplicate
        -> Invalid record vào Quarantine
        -> DQ pass
        -> Gold 10 DIM + 7 FACT được build idempotent
        -> Trino query được Gold
        -> BI/Report sử dụng được dữ liệu
        -> Silver tạo Feature Mart
        -> ML model được train/versioned/lưu artifact
        -> Risk Service sử dụng model để inference
```

---

# 28. Các nguyên tắc không được phá vỡ

1. **PostgreSQL schema hiện tại là cố định.**
2. `ALLOW` không đồng nghĩa với `SUCCESS`.
3. Chỉ `ALLOW` hoặc `REVIEW -> APPROVE` mới vào Financial Processing.
4. Posting + balance + transaction SUCCESS + success outbox phải tuân thủ transaction boundary phù hợp.
5. Lỗi trước commit phải rollback.
6. Kafka/Spark/MinIO/Airflow không nằm trên critical path của chuyển tiền.
7. Realtime publish qua `EVENT_OUTBOX`, không publish trực tiếp từ transaction table.
8. Bronze giữ raw data phục vụ audit/replay.
9. Invalid data không bị drop; đưa vào Quarantine.
10. Batch + Realtime không được tạo duplicate business record trong Silver/Gold.
11. Gold phải idempotent.
12. ML model artifact lưu ngoài PostgreSQL; database chỉ dùng schema `model_version` hiện có.
13. Mọi thay đổi triển khai mới phải thích nghi với database, không yêu cầu sửa schema để tiện cho pipeline.

---

# 29. Tóm tắt một câu

> **Bank Fraud Detection & Data Platform** là hệ thống mô phỏng ngân hàng end-to-end, trong đó PostgreSQL xử lý nghiệp vụ và giao dịch tài chính; Rule Engine + ML đánh giá fraud; Transactional Outbox + Kafka cung cấp realtime events; Spark + Airflow + MinIO xây dựng pipeline Batch/Realtime Bronze -> Silver -> Gold; Trino phục vụ Analytics; và Silver cung cấp dữ liệu cho vòng đời huấn luyện Machine Learning.

---

# 30. Chạy project end-to-end

## 30.1 Chuẩn bị

Yêu cầu: Docker Engine/Compose, tối thiểu khoảng 8 GB RAM trống. Không xóa volume nếu đang có dữ liệu.

Chỉ tạo `.env` khi file local chưa tồn tại:

```bash
test -f .env || cp .env.example .env
```

Đổi toàn bộ giá trị `change_me_*` và tạo `KAFKA_CLUSTER_ID` theo hướng dẫn trong `.env.example`. Không commit `.env`.

## 30.2 Start tự động

```bash
docker compose up -d --build
python -m scripts.healthcheck
```

Compose tự thực hiện:

- khởi tạo schema trên PostgreSQL volume mới từ `sql/create_table.sql` (volume hiện hữu không bị reinitialize);
- tạo Kafka topic và các MinIO bucket;
- seed bộ demo idempotent;
- chạy Banking/Risk API, Outbox Publisher, Kafka Consumer và model sync liên tục;
- chạy Spark master/worker, Airflow scheduler/webserver và Trino;
- đăng ký 10 dimensions + 7 facts dưới `hive.gold`.

Airflow DAG `banking_bronze_silver_gold` có schedule `01:00 Asia/Ho_Chi_Minh`. Với metadata Airflow cũ từng lưu trạng thái paused, enable một lần:

```bash
docker compose exec airflow-webserver airflow dags unpause banking_bronze_silver_gold
```

Không cần chạy từng ETL file bằng tay. Realtime services xử lý liên tục; Airflow chạy Batch → Bronze → Silver → DQ → Gold → DQ → ML theo dependency.

## 30.3 Endpoints

| Component | URL |
|---|---|
| Banking/Risk API + OpenAPI | `http://localhost:8000/docs` |
| Kafka UI | `http://localhost:8080` |
| Airflow | `http://localhost:8081` |
| Spark master | `http://localhost:8082` |
| MinIO console | `http://localhost:9001` |
| Trino | `http://localhost:8084` |

## 30.4 Tạo giao dịch mẫu

Lấy các ID demo theo cách idempotent:

```bash
docker compose run --rm demo-bootstrap
```

Gửi transfer với các ID trả về (thay ID nếu output khác):

```bash
curl -X POST http://localhost:8000/transactions/transfers \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": 1,
    "source_account_id": 1,
    "destination_account_id": 2,
    "device_id": 1,
    "amount": "100000",
    "idempotency_key": "demo-transfer-001",
    "channel": "MobileBanking"
  }'
```

Response phân biệt rõ `decision=ALLOW` với `status=Success`; chỉ `Success` sau posting mới có `TransactionCompleted` outbox event. Với `REVIEW`, dùng `POST /reviews/{review_case_id}` và action `APPROVE` hoặc `REJECT`.

## 30.5 Theo dõi pipeline

```bash
docker compose logs -f banking-api outbox-publisher bronze-consumer
docker compose exec airflow-webserver airflow dags list-runs -d banking_bronze_silver_gold
python -m scripts.healthcheck
```

Run/batch metrics và watermark nằm trong MinIO bucket `pipeline-control`; rejected record nằm trong `quarantine`; raw replayable data nằm trong `bronze`.

## 30.6 Query Gold bằng Trino

```bash
docker compose exec trino trino --execute \
  "SELECT decision, count(*) FROM hive.gold.fact_risk_assessment GROUP BY decision"
```

## 30.7 Test

Unit/contract tests không cần stack:

```bash
python -m pytest -q
```

Banking integration tests khi PostgreSQL đã start:

```bash
RUN_BANKING_INTEGRATION=1 python -m pytest -q tests/integration/test_banking_postgres.py
```

Full automated proof (transaction → risk → posting → outbox → Kafka → Bronze → Airflow/Spark → Silver/Gold → Trino):

```bash
python -m scripts.e2e_test
```

Script E2E fail ngay tại stage không đạt và in summary chứa transaction/risk/outbox/Bronze/Airflow/Trino evidence khi thành công.

## 30.8 Recovery và idempotency

- Retry cùng `idempotency_key` trả cùng transaction, không posting lần hai.
- Banking recovery loop tiếp tục các transaction `Pending + ALLOW` nếu process chết giữa risk commit và financial processing.
- Publisher dùng at-least-once; Silver deduplicate event theo `event_id` và transaction theo `transaction_id`.
- Kafka offset chỉ commit sau khi Parquet Bronze đã được ghi và `stat_object` thành công.
- Airflow retry từng stage; watermark commit sau Silver DQ. Gold overwrite deterministic nên rerun không nhân bản.
- Model sync cập nhật file cache atomically; Risk API reload định kỳ và tiếp tục dùng model cache nếu MinIO tạm lỗi.
