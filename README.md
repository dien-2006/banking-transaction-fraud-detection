# Banking Transaction Fraud Detection

Hệ thống ngân hàng giả lập phục vụ **Data Engineering, Reporting/Analytics và Fraud Detection**.

> Mục tiêu của repository là mô phỏng dữ liệu và nghiệp vụ ngân hàng đủ thực tế cho đồ án, sau đó xây dựng pipeline dữ liệu và hệ thống phát hiện rủi ro giao dịch chuyển khoản.

---

## 1. Mục tiêu dự án

Dự án có **hai đầu ra chính nhưng thuộc cùng một hệ thống**:

1. **Reporting & Analytics**
   - Phân tích số lượng và giá trị giao dịch.
   - Theo dõi giao dịch theo ngày, kênh, trạng thái, chi nhánh.
   - Xây Gold/Data Mart và Dashboard.

2. **Fraud Detection**
   - Chấm điểm rủi ro giao dịch chuyển khoản trước khi tiền được chuyển.
   - Giai đoạn đầu có thể dùng rule-based.
   - Sau đó dùng dữ liệu lịch sử có nhãn để huấn luyện, đánh giá và triển khai Machine Learning model.

---

## 2. Kiến trúc tổng thể

```text
                    BANKING SYSTEM
                         |
                         v
                    PostgreSQL
                         |
             +-----------+-----------+
             |                       |
             v                       v
      Fraud Scoring             EVENT_OUTBOX
             |                       |
             v                       v
     ALLOW / REVIEW / BLOCK         Kafka
             |                       |
             v                       v
     Debit / Credit + Commit      MinIO Bronze
                                     |
                                     v
                                   Silver
                                  /      \
                                 v        v
                           Gold / BI   ML Feature Mart
                               |            |
                               v            v
                           Dashboard      Training
                                             |
                                             v
                                        Fraud Model
                                             |
                                             +----> Fraud Scoring
```

---

## 3. Luồng giao dịch chuyển khoản

Luồng nghiệp vụ chính:

```text
1. Khách hàng tạo transfer request
2. Backend kiểm tra quyền và idempotency
3. Tạo BANK_TRANSACTION = Pending
4. Tạo TRANSFER_REQUEST
5. Fraud Scoring đánh giá rủi ro
6. Ghi RISK_ASSESSMENT
7. Quyết định:
      - ALLOW
      - REVIEW
      - BLOCK / REJECT
8. Nếu được phép:
      - lock tài khoản
      - kiểm tra lại quyền, trạng thái, số dư
      - ghi Debit/Credit
      - cập nhật balance
      - cập nhật transaction status
      - ghi EVENT_OUTBOX
9. COMMIT
10. Publisher gửi event sang Kafka
```

### Nguyên tắc tài chính

- `Pending` chưa làm thay đổi số dư.
- Chỉ giao dịch được phép thực thi mới tạo posting.
- Giao dịch thành công phải có:

```text
Total DEBIT = Total CREDIT
```

- Posting, cập nhật balance và trạng thái giao dịch phải nằm trong cùng một database transaction.
- Kafka không quyết định tiền có được chuyển hay không; Kafka xử lý event **sau commit**.

---

## 4. Data Engineering Pipeline

```text
PostgreSQL
    |
    v
EVENT_OUTBOX
    |
    v
Kafka
    |
    v
MinIO Bronze
    |
    v
Silver
   /    \
  v      v
Gold    ML Feature Mart
 |          |
 v          v
BI       Training
```

### Bronze

- Lưu dữ liệu gần raw.
- Hỗ trợ replay, audit và xử lý lại.
- Không mặc định lấy toàn bộ database chỉ vì dữ liệu tồn tại.

### Silver

- Làm sạch.
- Deduplicate.
- Chuẩn hóa schema.
- Chuẩn hóa timestamp/key.
- Kiểm tra chất lượng dữ liệu.
- Tạo nguồn dữ liệu đáng tin cậy dùng chung.

### Gold / BI Mart

Phục vụ báo cáo, ví dụ:

- số lượng giao dịch;
- tổng giá trị giao dịch;
- giao dịch theo ngày;
- giao dịch theo kênh;
- giao dịch theo trạng thái;
- giao dịch theo chi nhánh;
- tỷ lệ Success / Failed / Rejected;
- processing time;
- thống kê risk/fraud.

### ML Feature Mart

Phục vụ:

- feature engineering;
- training dataset;
- validation/test;
- model training.

Mỗi dòng dữ liệu training nên đại diện cho một transfer request tại đúng thời điểm cần ra quyết định.

Feature phải bảo đảm **point-in-time** để tránh data leakage.

---

## 5. Fraud Detection

### Prediction khác Fraud Label

Không được nhầm:

```text
Prediction / Risk Score
```

với:

```text
Fraud Label
```

Ví dụ:

```text
09:00  model đánh giá risk_score = 0.87
12:00  sau điều tra mới xác nhận FRAUD hoặc LEGITIMATE
```

Prediction là đánh giá tại thời điểm giao dịch.

Fraud label là kết quả xác minh sau và được dùng cho training/evaluation.

---

## 6. Database hiện tại: 29 bảng

Database PostgreSQL hiện tại có **29 bảng**.

### Tổ chức và nhân viên

1. `BRANCH`
2. `ROLE`
3. `EMPLOYEE`
4. `SYSTEM_USER`

### Khách hàng và hành vi

5. `CUSTOMER`
6. `CUSTOMER_ONLINE_ACCOUNT`
7. `CUSTOMER_DEVICE`
8. `LOGIN_EVENT`

### Tài khoản và thẻ

9. `ACCOUNT_TYPE`
10. `BANK_ACCOUNT`
11. `ACCOUNT_HOLDER`
12. `ACCOUNT_STATUS_HISTORY`
13. `CARD`

### Giao dịch

14. `TRANSACTION_TYPE`
15. `TERMINAL`
16. `BANK_TRANSACTION`
17. `TRANSFER_REQUEST`
18. `TRANSACTION_POSTING`

### Khoản vay

19. `LOAN_TYPE`
20. `LOAN`
21. `REPAYMENT_SCHEDULE`
22. `LOAN_PAYMENT`

### Fraud Detection

23. `MODEL_VERSION`
24. `RISK_ASSESSMENT`
25. `REVIEW_CASE`
26. `FRAUD_LABEL_EVENT`

### Tích hợp và truy vết

27. `EVENT_OUTBOX`
28. `NOTIFICATION_OUTBOX`
29. `AUDIT_LOG`

> `create_table.txt` là nguồn tham chiếu chính cho schema PostgreSQL hiện tại.

---

## 7. Vai trò các công nghệ

| Thành phần | Vai trò |
|---|---|
| PostgreSQL | Operational Database |
| FastAPI / Backend | API nghiệp vụ |
| Fraud Scoring | Đánh giá rủi ro trước posting |
| Kafka | Vận chuyển event đã commit |
| MinIO | Data Lake: Bronze/Silver/Gold/ML data |
| Airflow | Điều phối batch ETL, data quality, training/evaluation |
| Dashboard | Reporting / Analytics |
| Machine Learning | Fraud Detection |

### Lưu ý

Airflow không nằm trên đường xử lý từng giao dịch realtime.

Luồng realtime:

```text
Request → Fraud Scoring → Decision → Posting → Commit
```

Luồng data:

```text
Committed Event → Kafka → Bronze → Silver → Gold / ML Feature Mart
```

---

## 8. Model Lifecycle

```text
Historical Data
      |
      v
Silver
      |
      v
ML Feature Mart
      |
      v
Point-in-time Dataset
      |
      v
Train / Validation / Test
      |
      v
Candidate Model
      |
      v
Evaluation
      |
      v
Approval
      |
      v
Active Model
      |
      v
Realtime Scoring
```

Model nên được version hóa bằng `MODEL_VERSION`.

Các trạng thái:

```text
CANDIDATE
ACTIVE
RETIRED
```

`RISK_ASSESSMENT` phải lưu model/version đã dùng để chấm giao dịch.

---

## 9. Outbox Pattern

Outbox giúp tránh trường hợp:

```text
Database đã commit
nhưng event gửi sang Kafka bị mất.
```

Luồng:

```text
Business Transaction
      |
      +-- update transaction
      +-- posting
      +-- update balance
      +-- insert EVENT_OUTBOX
      |
      v
    COMMIT
      |
      v
Outbox Publisher
      |
      v
    Kafka
```

Consumer cần hỗ trợ idempotency/deduplication theo event key.

---

## 10. Quy tắc chọn dữ liệu cho ETL

Không lấy toàn bộ database theo kiểu:

```text
Có bảng nào thì lấy hết bảng đó.
```

Phải xuất phát từ use case:

```text
Báo cáo cần trả lời câu hỏi gì?
Model cần feature gì?
```

Sau đó mới chọn bảng, cột và lịch sử cần thiết.

---

## 11. Thứ tự triển khai đề xuất

### Phase 1 — Core Banking Transfer

- transfer request;
- Pending;
- risk decision;
- posting;
- balance;
- commit;
- idempotency;
- concurrent transaction test.

### Phase 2 — Event Pipeline

```text
PostgreSQL → Outbox → Kafka → Bronze
```

### Phase 3 — Data Warehouse

```text
Bronze → Silver → Gold → Dashboard
```

### Phase 4 — Machine Learning

```text
Silver → ML Feature Mart → Training → Evaluation → Active Model
```

---

## 12. Trạng thái dự án

Khi trao đổi hoặc cập nhật tài liệu, luôn phân biệt:

- **ĐÃ CHỐT**
- **ĐÃ LẬP TRÌNH**
- **ĐÃ CHẠY KIỂM CHỨNG**
- **ĐỀ XUẤT MỚI**

Không được coi một thành phần là đã hoàn thành chỉ vì nó xuất hiện trong sơ đồ.

---

## 13. Tài liệu quan trọng

Các tài liệu hiện có trong dự án:

```text
README.md
AGENTS.md
create_table.txt
TAI_LIEU_THAM_CHIEU_DU_AN_GIAN_LAN(1).md
TONG_QUAN_HE_THONG_DU_DOAN_GIAO_DICH_GIAN_LAN(1).docx
Dac_ta_CSDL_Ngan_hang_Rang_buoc_day_du(1).docx
```

Trong đó:

- `README.md`: giới thiệu dự án cho thành viên và người xem repository.
- `AGENTS.md`: hướng dẫn AI/coding agent hiểu đúng dự án.
- `create_table.txt`: schema PostgreSQL hiện tại gồm 29 bảng.

---

## 14. Git workflow

Không phát triển trực tiếp trên `main`.

Ví dụ:

```bash
git checkout -b feature/init-database
git checkout -b feature/fraud-scoring
git checkout -b feature/kafka-publisher
git checkout -b feature/bronze-consumer
git checkout -b feature/silver-pipeline
```

Quy trình:

```text
Create branch
    ↓
Develop
    ↓
Test
    ↓
Commit
    ↓
Push
    ↓
Pull Request
    ↓
Review
    ↓
Merge main
```

---

## 15. Kết luận

Dự án là một hệ thống thống nhất:

```text
Banking Simulation
      +
Data Engineering
      +
Analytics
      +
Fraud Detection
```

Trong đó Fraud Scoring xử lý rủi ro trước posting, còn Kafka/MinIO/Airflow xử lý dữ liệu sau commit để phục vụ báo cáo và Machine Learning.
