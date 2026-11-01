# AGENTS.md — Bank Fraud Detection & Data Platform

Tài liệu này định nghĩa **nguyên tắc bắt buộc** cho AI coding agents (Codex/ChatGPT/IDE agents) và contributor khi đọc, sửa, tạo hoặc review code trong repository này.

> `README.md` giải thích hệ thống hoạt động như thế nào. `AGENTS.md` quy định **được làm gì, không được làm gì và phải kiểm tra gì trước khi hoàn thành một task**.

---

## 1. Mục tiêu ưu tiên

Mọi thay đổi phải ưu tiên theo thứ tự:

1. Không phá tính đúng đắn của giao dịch ngân hàng.
2. Không thay đổi PostgreSQL schema hiện tại.
3. Giữ đúng ranh giới Banking Core / Risk-Fraud / Data Platform.
4. Không làm mất dữ liệu và không tạo duplicate logic.
5. Pipeline phải retry được và idempotent.
6. Thay đổi nhỏ nhất có thể để hoàn thành yêu cầu.
7. Code phải dễ đọc, test và vận hành.

Nếu một yêu cầu xung đột với các nguyên tắc trên, agent phải **dừng và báo rõ xung đột trước khi sửa**.

---

## 2. Source of truth

Trước khi sửa code, đọc các tài liệu liên quan theo thứ tự:

1. `AGENTS.md` — luật làm việc.
2. `README.md` — kiến trúc và luồng end-to-end.
3. `create_table.sql` — PostgreSQL schema hiện tại.
4. Config/code của module đang được sửa.
5. Tests hiện có.

Không tự suy đoán schema, tên cột, constraint hoặc business rule nếu có thể kiểm tra trực tiếp trong repository.

---

# 3. DATABASE LÀ CỐ ĐỊNH — QUY TẮC BẮT BUỘC

PostgreSQL schema hiện tại được coi là **immutable contract** của project.

Agent **KHÔNG ĐƯỢC** tự ý:

```text
ALTER TABLE
DROP TABLE
DROP SCHEMA
ADD COLUMN
DROP COLUMN
RENAME COLUMN
RENAME TABLE
ALTER COLUMN TYPE
ADD/DROP CONSTRAINT
thay PK/FK
thay CHECK constraint
thêm bảng chỉ để phục vụ ETL/ML
```

Không sửa `create_table.sql` trừ khi người dùng **yêu cầu trực tiếp sửa database/schema**.

Nếu ETL, ML hoặc service cần metadata bổ sung, ưu tiên:

- file config;
- MinIO metadata;
- runtime state;
- Airflow metadata/Variables khi phù hợp;
- checkpoint riêng của pipeline;
- thông tin có thể suy ra từ schema hiện tại.

**Không giải quyết thiếu metadata bằng cách tự thêm column vào PostgreSQL.**

---

# 4. Ranh giới kiến trúc không được phá

Hệ thống có ba vùng trách nhiệm chính:

```text
BANKING CORE
    |
    v
RISK / FRAUD
    |
    v
FINANCIAL PROCESSING + COMMIT
    |
==============================  COMMIT BOUNDARY
    |
    v
DATA PLATFORM
Batch / Kafka / Bronze / Silver / Gold / ML / BI
```

## Banking Core

Chịu trách nhiệm:

- transaction nghiệp vụ;
- account locking;
- validation nghiệp vụ;
- debit/credit posting;
- balance update;
- trạng thái `BANK_TRANSACTION`;
- ghi `EVENT_OUTBOX` trong transaction phù hợp.

## Risk/Fraud

Chịu trách nhiệm:

- Rule Engine;
- ML inference;
- `RuleScore`;
- `RiskLevel`;
- `ModelProbability`;
- Decision Engine;
- `ALLOW / REVIEW / BLOCK`.

## Data Platform

Chịu trách nhiệm:

- Outbox publishing sau commit;
- Kafka;
- Batch ingestion;
- MinIO Bronze/Silver/Gold/Quarantine;
- Spark;
- Airflow;
- Trino;
- ML training/feature engineering;
- BI/reporting.

**Kafka, Spark, MinIO và Airflow không được trở thành dependency bắt buộc để một giao dịch ngân hàng commit thành công.**

---

# 5. Risk/Fraud Policy V1

Rule Engine V1:

| Rule | Điều kiện | Score |
|---|---|---:|
| R01 HIGH_AMOUNT | amount >= 50,000,000 VND | +20 |
| R02 NEW_DEVICE | thiết bị mới | +20 |
| R03 UNUSUAL_TIME | 00:00–05:00 | +10 |
| R04 HIGH_VELOCITY | >= 5 transaction / 10 phút | +25 |
| R05 FAILED_LOGIN | >= 5 failed login / 30 phút | +15 |
| R06 AMOUNT_ANOMALY | amount >= 5x trung bình 30 ngày | +20 |

```text
RuleScore = min(100, tổng score của rule được trigger)
```

Risk level:

```text
0-39   -> LOW
40-59  -> MEDIUM
60-79  -> HIGH
80-100 -> CRITICAL
```

Decision Engine phải giữ đúng thứ tự ưu tiên:

```text
IF ModelProbability >= 0.90 OR RuleScore >= 80
    -> BLOCK
ELSE IF ModelProbability >= 0.60 OR RuleScore >= 60
    -> REVIEW
ELSE
    -> ALLOW
```

Không đảo thứ tự `BLOCK` và `REVIEW`.

Không tự thay threshold nếu người dùng chưa yêu cầu thay policy.

---

# 6. ALLOW KHÔNG PHẢI SUCCESS

Đây là invariant quan trọng.

```text
ALLOW
  !=
SUCCESS
```

`ALLOW` chỉ có nghĩa giao dịch vượt qua Risk/Fraud và **được phép bước vào Financial Processing**.

Sau `ALLOW`, hệ thống vẫn phải:

```text
BEGIN DB TRANSACTION
        |
        v
LOCK ACCOUNT(S)
        |
        v
RE-CHECK BUSINESS CONDITIONS
        |
        v
TRANSACTION_POSTING
DEBIT / CREDIT
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

Chỉ `ALLOW` hoặc `REVIEW -> APPROVE` mới được đi vào Financial Processing.

`BLOCK` không được posting.

`REVIEW` chưa APPROVE không được posting.

---

# 7. Atomicity và rollback

Các thao tác tài chính quan trọng phải nằm trong cùng database transaction theo thiết kế Banking Core.

Không được tạo logic kiểu:

```text
DEBIT -> COMMIT
CREDIT -> COMMIT
```

vì có thể làm giao dịch chỉ hoàn thành một nửa.

Nếu lỗi trước commit:

```text
ROLLBACK
```

và không được để trạng thái `SUCCESS` tồn tại nếu posting/balance chưa hoàn tất.

Không publish một success event như thể giao dịch đã commit khi DB transaction thực tế chưa commit.

---

# 8. Transactional Outbox

Realtime integration phải giữ pattern:

```text
Banking transaction
      |
      +-- business changes
      +-- EVENT_OUTBOX insert
      |
    COMMIT
      |
      v
Outbox Publisher
      |
      v
Kafka
```

Không thay bằng dual-write trực tiếp kiểu:

```text
update PostgreSQL
publish Kafka
```

trong critical transaction.

Outbox Publisher phải chịu được retry.

Có thể xảy ra duplicate event nếu Kafka ACK thành công nhưng process chết trước khi cập nhật trạng thái outbox. Downstream phải xử lý theo **at-least-once semantics**.

---

# 9. Realtime

Realtime services chạy độc lập với Batch Airflow DAG.

```text
EVENT_OUTBOX
    |
Outbox Publisher
    |
Kafka
    |
Consumer
    |
bronze/kafka/events
```

Kafka Consumer chỉ commit offset **sau khi raw event đã được ghi bền vững xuống Bronze**.

Không dùng Airflow như một Kafka consumer 24/7.

Không làm Kafka failure rollback một banking transaction đã commit.

---

# 10. Batch ETL

Batch V1:

```text
PostgreSQL
    |
Spark JDBC
    |
MinIO Bronze
    |
Spark Transform
    |
Silver / Quarantine
    |
Data Quality
    |
Gold
```

Airflow chỉ orchestration/scheduling/retry; business transformation chính nên nằm trong Spark/module chuyên trách thay vì nhồi toàn bộ logic vào DAG file.

Ưu tiên incremental load khi source cho phép. Full load được dùng cho bootstrap hoặc trường hợp được thiết kế rõ ràng.

Không dùng `SELECT *` một cách mù quáng nếu pipeline cần contract cột ổn định; phải kiểm tra source schema hiện tại.

---

# 11. Bronze

Bronze là raw/audit/replay layer.

Batch Bronze phải giữ source data và ingestion metadata cần thiết.

Metadata chuẩn của project có thể gồm:

```text
_ingested_at
_source_system
_source_table
_batch_id
_ingestion_mode
```

Realtime Bronze phải giữ envelope/payload thực tế nhận từ Kafka.

Bronze **được phép có raw duplicate** phục vụ audit/replay.

Không làm sạch/destructive transform dữ liệu nguồn tại Bronze nếu việc đó làm mất khả năng replay/audit.

---

# 12. Silver

Silver là canonical business layer.

Tại Silver thực hiện:

- chuẩn hóa tên cột;
- type casting;
- timestamp normalization;
- validation;
- deduplication;
- hợp nhất Batch + Realtime;
- tách invalid record sang Quarantine.

Một business transaction xuất hiện cả từ Batch và Kafka **chỉ được tồn tại một bản logic trong Silver**.

Ví dụ:

```text
TX1001 from PostgreSQL Batch
TX1001 from Kafka
        |
        v
Silver = TX1001 (1 logical record)
```

Không deduplicate bằng cách ngẫu nhiên giữ một record. Phải có deterministic business key và rule ưu tiên/version/time phù hợp với dataset.

---

# 13. Quarantine

Invalid data không được âm thầm drop.

Record lỗi phải được đưa vào Quarantine với đủ thông tin để debug/replay, ví dụ:

```text
source_dataset
business_key
original_data
error_code
error_reason
batch_id
quarantined_at
```

Không sửa dữ liệu lỗi thành giá trị giả chỉ để vượt Data Quality.

---

# 14. Data Quality

Các validation phải nhất quán với PostgreSQL/business contract hiện tại.

Các nhóm kiểm tra tối thiểu:

- PK/business key không null;
- uniqueness ở layer yêu cầu uniqueness;
- FK/business reference hợp lệ khi cần;
- amount > 0;
- fee >= 0;
- posting type hợp lệ;
- transaction SUCCESS có posting hợp lệ;
- Risk decision thuộc `ALLOW/REVIEW/BLOCK`;
- RuleScore trong 0..100;
- ModelProbability trong 0..1.

DQ failure phải có log/metric rõ ràng và route dữ liệu theo policy; không silent failure.

---

# 15. Gold

Gold V1 gồm **10 Dimensions + 7 Facts**.

Dimensions:

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

Facts:

```text
fact_transaction
fact_transaction_posting
fact_risk_assessment
fact_fraud_review
fact_fraud_label_event
fact_login_event
fact_loan_payment
```

Build dimensions trước facts khi fact cần dimension key.

Gold phải **idempotent**.

Re-run cùng input không được làm số record tăng chỉ vì pipeline chạy lại.

Không thay grain của fact mà không cập nhật thiết kế/tài liệu và được người dùng chấp thuận.

---

# 16. Risk schema hiện tại

Code phải sử dụng schema Risk hiện tại của database, bao gồm các khái niệm:

```text
rulescore
risklevel
modelprobability
decision
```

Không quay lại thiết kế cũ chỉ có một `risk_score` 0..1.

Không yêu cầu sửa DB để phục vụ model artifact.

---

# 17. ML model artifact

Model binary/artifact không lưu trực tiếp vào PostgreSQL.

Dùng MinIO theo version, ví dụ:

```text
ml-models/
└── fraud_detection/
    ├── v1/
    │   ├── model.pkl
    │   ├── metadata.json
    │   └── features.json
    └── v2/
        ├── model.pkl
        ├── metadata.json
        └── features.json
```

`MODEL_VERSION` trong PostgreSQL giữ nguyên schema hiện tại.

Nếu cần mapping DB model version -> MinIO artifact, thực hiện bằng convention/config ngoài DB.

Realtime inference không được download model từ MinIO cho từng transaction. Service nên load/cached model phù hợp vào memory và có cơ chế reload/versioning rõ ràng.

Training data phải đến từ curated data/Feature Mart, không train trực tiếp trên dữ liệu raw không kiểm soát.

---

# 18. Airflow rules

DAG phải tập trung vào orchestration:

```text
check dependency
-> submit/run job
-> validate result
-> retry/fail
-> expose status
```

Không nhồi toàn bộ Spark/business logic vào DAG.

Các stage chính nên retry độc lập được, ví dụ:

```text
postgres_to_bronze
bronze_to_silver
silver_dq
silver_to_gold
gold_dq
```

Nếu Gold fail nhưng Silver hợp lệ, retry Gold thay vì bắt buộc extract lại PostgreSQL.

Không hard-code secret/password trong DAG.

---

# 19. Configuration và secrets

Không commit:

```text
password
API key
secret key
access token
private key
production credentials
```

Dùng environment variables / secret mechanism phù hợp.

Các config có thể version control:

- source mapping;
- DQ rules;
- Spark settings không chứa secret;
- Kafka topic mapping;
- model artifact convention;
- business constants được project cho phép cấu hình.

Không duplicate cùng một business constant ở nhiều file nếu có thể có một source of truth rõ ràng.

---

# 20. Logging và observability

Mỗi pipeline/service quan trọng cần log đủ để truy vết nhưng không log secret.

ETL log tối thiểu nên có:

```text
job_name
batch_id/run_id
source
start_time/end_time
input_count
valid_count
invalid_count
output_count
status
error summary
```

Realtime log nên hỗ trợ truy vết theo event/transaction key khi có thể.

Banking logs không được làm lộ dữ liệu nhạy cảm không cần thiết.

---

# 21. Error handling

Không dùng `except: pass`.

Không swallow exception rồi báo task thành công.

Phân biệt:

- retryable infrastructure error;
- invalid data;
- business rejection;
- programming/configuration error.

Retry phải bounded và không tạo duplicate side effect.

---

# 22. Coding rules

Ưu tiên:

- module nhỏ, một trách nhiệm rõ;
- tên biến/hàm thể hiện business meaning;
- type hints khi phù hợp;
- reusable functions cho logic dùng chung;
- config-driven cho mapping lặp lại;
- deterministic transformation;
- explicit error handling;
- testable functions.

Không refactor unrelated code chỉ vì “đẹp hơn” trong một task không yêu cầu refactor.

Không thêm dependency mới nếu standard library/dependency hiện tại đã giải quyết tốt vấn đề.

Nếu phải thêm dependency, giải thích lý do và cập nhật dependency manifest phù hợp.

---

# 23. SQL rules

SQL phải tương thích PostgreSQL của project.

Không dùng cú pháp MySQL/SQL Server trong PostgreSQL code.

Không dùng destructive SQL trong migration/script vận hành nếu task không yêu cầu rõ ràng.

Khi viết query financial data:

- tránh race condition;
- hiểu transaction boundary;
- dùng locking khi business flow yêu cầu;
- không tự suy đoán constraint;
- kiểm tra schema source trước.

---

# 24. Git rules

Branch naming:

```text
feature/<name>
fix/<name>
data/<name>
```

Commit message ưu tiên Conventional Commit, ví dụ:

```text
feat: add customer ETL pipeline
fix: prevent duplicate silver transactions
data: add risk assessment gold transform
test: add decision engine boundary tests
docs: update pipeline architecture
```

Không push trực tiếp vào `main`.

Quy trình:

```text
create branch
-> implement
-> test
-> commit
-> push branch
-> create PR
-> review
```

**Agent không được tự merge PR/main.** Merge là hành động cần người có thẩm quyền thực hiện theo quy trình của project.

Không force-push hoặc rewrite shared history nếu người dùng chưa yêu cầu rõ.

---

# 25. Testing bắt buộc theo phạm vi thay đổi

Agent phải chạy test phù hợp trước khi tuyên bố task hoàn thành nếu môi trường cho phép.

## Risk

Test boundary tối thiểu:

```text
RuleScore 59 / 60 / 79 / 80
ModelProbability 0.59 / 0.60 / 0.89 / 0.90
```

Phải kiểm tra BLOCK ưu tiên hơn REVIEW.

## Banking

Kiểm tra:

- ALLOW nhưng insufficient balance không được SUCCESS;
- debit/credit atomic;
- lỗi trước commit rollback;
- BLOCK không posting;
- REVIEW chưa APPROVE không posting;
- APPROVED REVIEW có thể đi vào financial processing.

## Realtime

Kiểm tra:

- outbox retry;
- duplicate event;
- consumer restart;
- offset chỉ commit sau durable Bronze write.

## ETL

Kiểm tra:

- source -> Bronze đúng schema/data;
- invalid -> Quarantine;
- Batch + Kafka duplicate -> một Silver logical record;
- re-run không duplicate Gold;
- DQ counts hợp lý.

---

# 26. Quy trình bắt buộc khi agent nhận task

## Bước 1 — Hiểu phạm vi

Xác định task thuộc:

```text
banking
risk
realtime
batch ETL
silver/DQ
gold
ML
infrastructure
documentation
```

## Bước 2 — Đọc trước khi sửa

Đọc file liên quan và dependencies trực tiếp. Không sửa file chỉ dựa trên tên file.

## Bước 3 — Kiểm tra invariant

Trước khi code, kiểm tra thay đổi có vi phạm:

- immutable DB;
- ALLOW != SUCCESS;
- transaction atomicity;
- outbox boundary;
- idempotency;
- Batch + Realtime dedup;
- Gold grain;
- secret policy.

## Bước 4 — Sửa tối thiểu

Chỉ thay đổi file cần thiết cho task.

## Bước 5 — Validate

Chạy lint/test/query/check phù hợp nếu có thể.

## Bước 6 — Báo cáo

Khi hoàn thành, tóm tắt:

```text
1. Đã làm gì
2. File nào thay đổi
3. Test/check nào đã chạy
4. Kết quả
5. Vấn đề/rủi ro còn lại
6. Việc tiếp theo nếu có
```

Không nói “đã hoàn thành” nếu test quan trọng chưa chạy; phải nói rõ phần nào chưa verify được.

---

# 27. Khi task không rõ ràng

Nếu có nhiều cách triển khai nhưng một lựa chọn có thể:

- sửa DB;
- thay business policy;
- thay fact grain;
- thay transaction semantics;
- xóa dữ liệu;
- ảnh hưởng production/shared environment;

thì **không tự chọn phương án phá vỡ contract**. Hỏi người dùng hoặc chọn phương án không destructive nếu có thể và nói rõ giả định.

Với thay đổi nội bộ nhỏ, reversible, không ảnh hưởng contract, agent có thể tự quyết định và ghi lại trong summary.

---

# 28. Các hành động cần đặc biệt thận trọng

Không tự thực hiện nếu người dùng chưa yêu cầu rõ:

```text
docker compose down -v
DROP DATABASE
DROP SCHEMA
TRUNCATE production tables
xóa MinIO bucket/data
xóa Kafka volume/topic data
xóa Airflow metadata
reset PostgreSQL volume
git reset --hard
git clean -fd
git push --force
merge vào main
```

Nếu task yêu cầu xóa dữ liệu, phải xác định chính xác **dữ liệu nào được phép xóa và dữ liệu nào phải giữ** trước khi chạy lệnh destructive.

---

# 29. Definition of Done cho một thay đổi

Một task chỉ được coi là hoàn thành khi phù hợp với phạm vi và:

```text
[ ] Không tự thay đổi PostgreSQL schema
[ ] Không phá Banking/Data boundary
[ ] Không biến ALLOW thành SUCCESS
[ ] Không phá atomic transaction
[ ] Không phá outbox semantics
[ ] Retry không tạo side effect/duplicate ngoài dự kiến
[ ] Batch + Realtime vẫn deduplicate đúng
[ ] Gold vẫn idempotent nếu task liên quan Gold
[ ] Invalid data không bị silent drop
[ ] Không hard-code secrets
[ ] Tests/checks liên quan đã chạy hoặc limitation được báo rõ
[ ] README/config/tests được cập nhật nếu behavior thực sự thay đổi
[ ] Summary nêu rõ file đã sửa và vấn đề còn lại
```

---

# 30. Nguyên tắc cuối cùng

Khi phải lựa chọn giữa **code chạy nhanh** và **giữ đúng tính toàn vẹn của hệ thống**, luôn ưu tiên tính toàn vẹn.

Agent phải coi các invariant sau là contract của project:

```text
DB schema hiện tại là cố định.
ALLOW != SUCCESS.
Chỉ ALLOW hoặc REVIEW->APPROVE mới Financial Processing.
Debit/Credit/Balance/Success/Outbox phải tôn trọng transaction boundary.
COMMIT là ranh giới Banking -> Data Platform.
Kafka/Spark/MinIO/Airflow không quyết định tính thành công của giao dịch đã commit.
Bronze giữ raw để audit/replay.
Silver là canonical + deduplicated.
Invalid -> Quarantine, không silent drop.
Gold idempotent.
ML artifact nằm ngoài PostgreSQL.
Không tự merge main.
```
