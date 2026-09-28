# AGENTS.md

## 1. Purpose

File này dành cho **ChatGPT, coding agents và AI models** khi làm việc với repository `banking-transaction-fraud-detection`.

Mục tiêu là giúp agent mới hiểu đúng ngữ cảnh dự án mà không yêu cầu người dùng giải thích lại từ đầu.

Hãy đọc file này trước khi thay đổi code, database, kiến trúc, ETL hoặc Machine Learning.

---

## 2. Project identity

Đây là **một dự án duy nhất**, không phải hai dự án riêng.

Dự án kết hợp:

```text
Banking Simulation
Data Engineering
Reporting / Analytics
Fraud Detection
```

Trọng tâm Fraud Detection hiện tại là giao dịch chuyển khoản.

---

## 3. Current source of truth

Khi các tài liệu mâu thuẫn, ưu tiên theo thứ tự sau:

1. **Yêu cầu mới nhất người dùng vừa chốt trong cuộc hội thoại hiện tại.**
2. `AGENTS.md`
3. `README.md`
4. `create_table.txt` đối với schema PostgreSQL hiện tại.
5. Tài liệu tham chiếu kiến trúc dự án.
6. Tài liệu đặc tả ngân hàng tổng quát.
7. Code cũ hoặc tài liệu cũ chưa được xác nhận.

Không tự coi tài liệu có ngày cũ hơn hoặc nhiều chi tiết hơn là bản cuối.

---

## 4. Current database scope

Schema PostgreSQL hiện tại có **29 bảng**.

Không được trả lời rằng database hiện tại chỉ có 22 bảng.

Danh sách:

```text
1  BRANCH
2  ROLE
3  EMPLOYEE
4  SYSTEM_USER
5  CUSTOMER
6  CUSTOMER_ONLINE_ACCOUNT
7  CUSTOMER_DEVICE
8  LOGIN_EVENT
9  ACCOUNT_TYPE
10 BANK_ACCOUNT
11 ACCOUNT_HOLDER
12 ACCOUNT_STATUS_HISTORY
13 CARD
14 TRANSACTION_TYPE
15 TERMINAL
16 BANK_TRANSACTION
17 TRANSFER_REQUEST
18 TRANSACTION_POSTING
19 LOAN_TYPE
20 LOAN
21 REPAYMENT_SCHEDULE
22 LOAN_PAYMENT
23 MODEL_VERSION
24 RISK_ASSESSMENT
25 REVIEW_CASE
26 FRAUD_LABEL_EVENT
27 EVENT_OUTBOX
28 NOTIFICATION_OUTBOX
29 AUDIT_LOG
```

`create_table.txt` hiện là căn cứ schema PostgreSQL.

Nếu schema thay đổi, phải cập nhật lại `create_table.txt`, `README.md` và file này khi cần.

---

## 5. Core transaction flow

Luồng chuyển khoản đã thống nhất:

```text
Transfer Request
      |
      v
BANK_TRANSACTION = Pending
      |
      v
TRANSFER_REQUEST
      |
      v
Fraud Scoring
      |
      v
RISK_ASSESSMENT
      |
      +------ ALLOW
      |
      +------ REVIEW
      |
      +------ BLOCK / REJECT
      |
      v
Nếu được phép
      |
      v
Lock account
      |
      v
Re-check permission / status / balance
      |
      v
Debit + Credit
      |
      v
Update balance
      |
      v
EVENT_OUTBOX
      |
      v
COMMIT
```

Sau commit:

```text
EVENT_OUTBOX
    ↓
Publisher
    ↓
Kafka
    ↓
Consumer
    ↓
MinIO Bronze
```

---

## 6. Financial invariants

Không phá vỡ các quy tắc sau:

### Pending does not move money

```text
Pending != Success
```

Giao dịch Pending/Failed/Rejected/Cancelled không được tạo posting tài chính làm thay đổi balance.

### Balanced posting

Giao dịch thành công:

```text
Total DEBIT = Total CREDIT
```

### Atomicity

Các thao tác:

```text
insert posting
update balance
update transaction status
insert outbox
```

phải được xử lý nhất quán trong transaction nghiệp vụ phù hợp.

---

## 7. Fraud scoring placement

Fraud scoring xảy ra **trước khi posting tiền**.

Không thiết kế:

```text
Request
→ Kafka
→ Bronze
→ Silver
→ Airflow
→ Model
→ Decision
```

cho quyết định giao dịch hiện tại.

Luồng đúng:

```text
Request
→ Fraud Scoring
→ Decision
→ Posting
→ Commit
→ Outbox
→ Kafka
```

Kafka/Data Lake nằm phía sau nghiệp vụ realtime.

---

## 8. Kafka responsibility

Kafka:

- vận chuyển event;
- nhận dữ liệu sau commit;
- phục vụ downstream data pipeline.

Kafka **không**:

- quản lý balance;
- quyết định giao dịch có được chuyển hay không;
- thay PostgreSQL làm transactional database.

---

## 9. Bronze / Silver / Gold / ML Feature Mart

### Bronze

- raw hoặc gần raw;
- replay;
- audit;
- không tự động lấy toàn bộ DB.

### Silver

- clean;
- deduplicate;
- normalized schema;
- timestamp/key normalization;
- quality checks;
- trusted shared data.

### Gold / BI Mart

Dành cho Reporting / Analytics.

### ML Feature Mart

Dành cho Machine Learning.

Không được trộn Gold và ML Feature Mart thành một chỉ vì cả hai đều sinh ra từ Silver.

```text
            Silver
            /    \
           v      v
        Gold    ML Feature Mart
         |           |
         v           v
         BI       Training
```

---

## 10. Point-in-time rule

Feature cho Fraud Detection phải dùng dữ liệu hệ thống **đã biết trước hoặc tại thời điểm request**.

Không sử dụng dữ liệu tương lai.

Ví dụ sai:

```text
09:00 transfer request
09:20 review result

feature của transaction lúc 09:00
lại chứa review result 09:20
```

Đó là data leakage.

---

## 11. Prediction is not label

Phân biệt:

```text
RISK_ASSESSMENT
```

với:

```text
FRAUD_LABEL_EVENT
```

`RISK_ASSESSMENT`:

- model/rule prediction;
- risk score;
- decision tại thời điểm giao dịch.

`FRAUD_LABEL_EVENT`:

- nhãn được xác nhận sau;
- dùng cho evaluation/training.

Không dùng prediction làm ground-truth label.

---

## 12. REVIEW_CASE is not FRAUD_LABEL_EVENT

`REVIEW_CASE` phục vụ workflow vận hành.

Ví dụ:

```text
OPEN
IN_REVIEW
APPROVED
REJECTED
CLOSED
```

Điều này không đồng nghĩa với fraud label cuối cùng.

---

## 13. Model lifecycle

Luồng ML:

```text
Historical Data
      ↓
Silver
      ↓
ML Feature Mart
      ↓
Point-in-time Dataset
      ↓
Train / Validation / Test
      ↓
Candidate Model
      ↓
Evaluation
      ↓
Approval
      ↓
Active Model
      ↓
Realtime Scoring
```

Model version phải gắn với `MODEL_VERSION`.

Các trạng thái hiện tại:

```text
CANDIDATE
ACTIVE
RETIRED
```

Không tự tuyên bố model production/active nếu chưa có bằng chứng.

---

## 14. ETL selection rule

Không mặc định ETL toàn bộ 29 bảng.

Trước khi chọn nguồn phải xác định:

```text
Reporting use case là gì?
ML feature cần gì?
Audit/reconciliation cần gì?
```

Sau đó mới chọn:

```text
table
column
event
history
```

cần thiết.

---

## 15. Airflow responsibility

Airflow dùng cho:

- batch ETL;
- Bronze → Silver;
- Silver → Gold;
- ML dataset generation;
- data quality;
- training/evaluation định kỳ.

Airflow không tạo một task cho mỗi giao dịch realtime.

---

## 16. Status vocabulary for project work

Khi mô tả một phần của dự án, bắt buộc phân biệt:

### ĐÃ CHỐT

Thiết kế hoặc phạm vi đã thống nhất.

### ĐÃ LẬP TRÌNH

Đã có code.

### ĐÃ CHẠY KIỂM CHỨNG

Đã thực sự chạy/test thành công.

### ĐỀ XUẤT MỚI

Ý tưởng mới chưa được chốt.

Không biến `ĐỀ XUẤT MỚI` thành `ĐÃ CHỐT` nếu người dùng chưa đồng ý.

---

## 17. Do not assume implementation from diagrams

Sơ đồ kiến trúc chỉ thể hiện target architecture.

Không được suy luận:

```text
Có Kafka trong hình
=> Kafka đã chạy

Có Gold trong hình
=> Gold đã triển khai

Có model trong hình
=> model đã train xong
```

Phải kiểm tra code/log/test nếu câu hỏi cần biết trạng thái triển khai thực tế.

---

## 18. Working with database changes

Khi thay đổi schema:

1. kiểm tra quan hệ FK;
2. kiểm tra CHECK/UNIQUE/NOT NULL;
3. kiểm tra migration impact;
4. kiểm tra code phụ thuộc;
5. kiểm tra ETL phụ thuộc;
6. kiểm tra feature/report phụ thuộc;
7. cập nhật tài liệu.

Không sửa một bảng riêng lẻ mà bỏ qua downstream dependencies.

---

## 19. Working with transaction code

Ưu tiên:

- idempotency;
- atomic transaction;
- row/account locking khi cần;
- retry safety;
- rollback toàn bộ khi lỗi;
- không double posting;
- không double approve;
- không làm balance âm nếu nghiệp vụ không cho phép.

---

## 20. Working with Kafka / Outbox

Outbox được dùng để tránh dual-write trực tiếp kiểu:

```text
COMMIT PostgreSQL
+
publish Kafka độc lập
```

Pattern mong muốn:

```text
DB transaction
  ├─ business changes
  └─ EVENT_OUTBOX
       ↓
     COMMIT
       ↓
 publisher retry
       ↓
     Kafka
```

Consumer phải có cơ chế idempotent/deduplicate phù hợp.

---

## 21. Git rules

Không phát triển trực tiếp trên `main` nếu repository đang dùng branch protection.

Tên branch nên thể hiện mục đích:

```text
feature/init-database
feature/fraud-scoring
feature/kafka-publisher
feature/bronze-consumer
feature/silver-pipeline
fix/transaction-idempotency
refactor/fraud-service
docs/update-architecture
```

Workflow:

```text
branch
→ code
→ test
→ commit
→ push
→ pull request
→ review
→ merge
```

---

## 22. Before answering project questions

Agent nên tự kiểm tra:

```text
1. Đây là câu hỏi về DB, nghiệp vụ, DE, BI hay ML?
2. Có mâu thuẫn giữa tài liệu không?
3. create_table.txt hiện có 29 bảng.
4. Fraud Scoring nằm trước posting.
5. Kafka nằm sau commit.
6. Gold và ML Feature Mart là hai đầu ra khác nhau.
7. Prediction không phải fraud label.
8. Tôi đang nói "đã chạy" hay chỉ "đã thiết kế"?
```

---

## 23. Common mistakes to avoid

Không lặp lại các lỗi sau:

- nói DB hiện tại có 29 bảng;
- bỏ quên `CARD`, `TERMINAL`, `ACCOUNT_STATUS_HISTORY`, nhóm loan;
- đưa Kafka vào trước fraud decision;
- để Airflow xử lý từng transaction realtime;
- gọi Gold là training dataset;
- dùng prediction làm fraud label;
- dùng dữ liệu tương lai làm feature;
- khẳng định một thành phần đã chạy chỉ dựa vào tài liệu;
- tự thay kiến trúc mà chưa nói đó là đề xuất mới.

---

## 24. When the user changes the design

Nếu người dùng nói:

```text
"chốt phương án này"
"dùng cái này"
"đây là bản cuối"
"từ giờ dùng kiến trúc này"
```

thì:

1. coi đó là quyết định mới nhất;
2. chỉ rõ phần nào bị thay đổi;
3. kiểm tra ảnh hưởng DB/API/ETL/ML;
4. cập nhật README/AGENTS khi phù hợp;
5. không tiếp tục dựa vào quyết định cũ bị thay thế.

---

## 25. Short context for a new agent

Nếu chỉ có ít thời gian, hãy nhớ:

```text
- Đây là Banking + Data Engineering + Fraud Detection.
- DB hiện tại có 29 bảng.
- Fraud Scoring chạy trước posting.
- Pending chưa làm thay đổi tiền.
- Success mới tạo Debit/Credit.
- Kafka chạy sau commit qua Outbox.
- Bronze → Silver → Gold / ML Feature Mart.
- Gold dành cho BI.
- ML Feature Mart dành cho training.
- Feature phải point-in-time.
- Prediction != Fraud Label.
- Luôn phân biệt đã chốt / đã code / đã chạy / đề xuất mới.
```
