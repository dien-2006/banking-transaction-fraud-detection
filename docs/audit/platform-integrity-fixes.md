# Bản vá tính toàn vẹn nền tảng — 03/11/2026

Phạm vi gồm các thay đổi của đợt rà soát và phần hoàn tất trên nhánh `fix/platform-integrity`. Không sửa `sql/create_table.sql`, không đổi bảng/cột/PK/FK/CHECK, không xóa giao dịch, bucket hay offset. Một số thay đổi đầu đợt đã được lưu trong các commit của workspace trước khi tiếp tục công việc; báo cáo này mô tả kết quả tổng thể.

## Banking và Risk/ML

- `sql/z_04_financial_operations.sql`: Decision Engine có một function policy dùng cho cả inference và boundary tests. BLOCK vẫn ưu tiên REVIEW; các threshold không đổi.
- API load artifact local/cached, kiểm tra coefficients và mapping model version, rồi truyền model context vào cùng DB transaction. SQL tính xác suất theo coefficients thực tế đã load; không chọn tùy ý một model ACTIVE để gắn nhãn kết quả.
- Lưu artifact version và point-in-time features trong `reasonjson` hiện có. Không thêm metadata column vào PostgreSQL. Giao dịch hiện tại không bị tính vào lịch sử velocity của chính nó.
- Financial helper từ chối posting nếu không có ALLOW hoặc REVIEW đã APPROVED. Deferred validator hiện có cũng kiểm risk gate và posting của non-Success.
- Khóa account dùng `FOR NO KEY UPDATE` theo thứ tự account ID: vẫn tuần tự hóa thay đổi balance nhưng tương thích khóa FK KEY SHARE. Kiểm thử hai lệnh 600 trên số dư 1.000 cho đúng một Success, một Failed, số dư cuối 400, không deadlock.
- Chặn reversal LOAN_PAYMENT cho đến khi có thiết kế compensation khoản vay; không hoàn tiền trong khi kỳ vẫn Paid.
- Audit mới và API đọc audit loại card number/PIN hash/password hash khỏi JSON.
- `scripts/apply_function_fixes.py --apply` đã áp dụng nguyên tử 26 function trên local. Script chỉ lấy function bodies, không chạy DDL bảng/constraint/trigger/index.
- `docker/postgres-init.sh` xử lý quoting FK tới `system_user` khi khởi tạo PostgreSQL 17 mới; source DDL và contract bảng được giữ nguyên.

## Model lifecycle

- Promote kiểm tra tập feature theo tên, không phụ thuộc thứ tự key JSON sau serialize.
- Model sync validate trước khi thay cache, giữ cache tốt khi download/artifact lỗi. Cache được publish atomic với mode 0644 để API chạy UID `node` đọc được file do sync UID root tạo.
- Cache API giữ artifact đang dùng nếu reload mới lỗi hoặc thiếu mapping. Cold start không có artifact hợp lệ sẽ fail closed; MinIO không nằm trong đường commit tài chính.
- Training lấy trạng thái thiết bị/velocity/login/ratio từ feature snapshot đã ghi lúc assessment; unusual time dùng giờ Việt Nam. Latest label được chọn trước khi loại UNKNOWN.
- Feature Mart được ghi theo training batch, tránh ghi đè provenance của lần training trước. Mẫu thiếu feature được thống kê rõ.
- Đã chạy training thật bằng Spark trên Silver audit. Kết quả: **SKIPPED**, 0 mẫu hợp lệ, 150 mẫu thiếu feature bị loại có thống kê. Không tạo label giả, không train/promote model không đủ dữ liệu. Model local hiện phục vụ là bootstrap `v1`.

## Batch và Gold

- V1 dùng full snapshot cho 20 bảng vì event timestamp/sequence không bảo đảm thứ tự commit. Mọi JDBC reader import cùng PostgreSQL exported snapshot; không tăng event-time watermark có thể bỏ sót late commit.
- Silver được version theo batch. Gold chỉ đọc Silver đã qua DQ của đúng batch; retry run cũ không đọc Silver run mới.
- Gold build/DQ luôn chọn release theo batch. Candidate qua đủ grain/FK/business checks mới đủ điều kiện publish; retry validated release không ghi đè dữ liệu đã được kiểm chứng.
- Audit hỗ trợ `--existing-buckets --prefix ... --batch-id ...`: dùng bucket audit sẵn có, mỗi run giữ đường dẫn riêng. Đợt này không tạo thêm bucket.
- Full batch Spark đã pass extract → Bronze DQ → Silver → Silver DQ/Quarantine → Gold → Gold DQ; re-run giữ nguyên counts. Test dùng `d4-audit-batch-20261102-v2-*`, batch `fix_validation_20261103_resume`, không publish vào Gold/Trino phục vụ web.
- Counts audit: `fact_transaction=1233`, `fact_transaction_posting=1458`, `fact_risk_assessment=933`; đủ 10 dimensions và 7 facts, không duplicate/null grain hay thiếu reference trong kết quả DQ.
- 1.780 transaction bị loại vào Quarantine theo business checks, cùng các child records liên quan. Đây là dữ liệu nguồn cũ; không sửa balance/trạng thái của chúng để vượt DQ. Không cộng các metric lỗi chồng lặp thành tổng record.
- Đã kiểm tra thêm JDBC extraction bằng role `d4_etl` chỉ đọc trên đủ 20 bảng, batch `fix_etl_role_20261103`.

## Stream, xác thực và secret

- Publisher TypeScript là implementation chính duy nhất; Python publisher cũ trở thành thông báo chuyển sang service chính. Test retry/ACK chạy đúng publisher đang deploy.
- Outbox và notification có backoff và budget 8 lần/process. Event lỗi vẫn ở FAILED, được loại khỏi claim trong lúc backoff/hết budget để không chặn event mới; sửa nguyên nhân và restart worker để mở lượt replay. Metadata retry hiện là runtime state, không bền vững qua restart.
- Consumer vẫn put object → stat object → commit offset. Audit sau deploy: PUBLISHED=509, lag=0 ở cả ba partition, tìm thấy 2/2 event gần nhất trong Bronze. Không tạo giao dịch live mới trong lượt khắc phục.
- AuthGuard kiểm tra lại actor active/role/branch/device hiện tại. Token cũ không tiếp tục giữ quyền sau khi actor bị khóa hoặc đổi quyền.
- Login và đổi PIN có rate limit bằng Redis; test đồng thời xác nhận limit được thực thi atomic và có TTL.
- OTP phân biệt provider ACCEPTED với delivery; lưu message ID ngoài business DB và sửa lời nhắc trên web. Chưa có webhook theo dõi delivered/bounced tự động.
- `.env` và `.env.*` không được Git/Docker build context theo dõi. Worker chỉ mount các thư mục code cần thiết, không mount repo root chứa credential.
- Đã tạo và dùng bốn role runtime không có superuser: banking, outbox, notification và ETL. File môi trường theo service không chứa mật khẩu quản trị PostgreSQL hay secret của service khác; ETL có object-store credential phục vụ pipeline. API vẫn có quyền DML cần cho function invoker, chưa phải mô hình chỉ cấp EXECUTE/SECURITY DEFINER.
- Đã đổi bốn secret local từng bị version control: PostgreSQL admin password, MinIO root password, JWT secret, OTP hash secret. Kiểm tra credential PostgreSQL/MinIO từ commit cũ bị từ chối. Giá trị mới chỉ lưu trong `.env` ignored và các env file scoped mode 0600; không in vào log/chat. Cần đăng nhập lại web/MinIO.
- Brevo API key chưa được thu hồi/đổi ở tài khoản ngoài hệ thống. Lịch sử Git còn chứa secret cũ; không rewrite/force-push lịch sử.

## Validation

| Kiểm tra | Kết quả |
|---|---|
| Python, gồm PostgreSQL integration trên container riêng | 48 passed |
| Backend build + tests, bật Redis integration | 24 passed, không skip |
| Web tests | 39 passed |
| Typecheck backend/web | Pass |
| SQL review/rollback/reversal/loan suite trên DB riêng | Pass, transaction test rollback |
| Khởi tạo mới PostgreSQL 17 bằng init loader | Pass |
| Full Spark batch + Gold DQ + retry | Pass, không tăng counts |
| Spark JDBC bằng ETL role | Pass |
| Spark regression từ image Airflow mới | Pass business date Việt Nam, exact posting amount, legitimate reversal gate |
| Training trên dữ liệu audit | SKIPPED đúng điều kiện thiếu mẫu hợp lệ |
| Compose config và git diff whitespace | Pass |
| Local API health + model context | Healthy, role d4_banking không superuser, artifact v1 |
| Stream reconciliation sau refresh credential | Pass, lag 0 |

Đã build image backend, Spark và Airflow; lỗi timeout download dependency Airflow được retry với timeout hữu hạn và build đã thành công. Chưa chạy toàn DAG bằng scheduler trên stack chính hoặc browser E2E thật trong đợt này. Airflow/Spark cluster chính giữ trạng thái dừng ban đầu; đã kiểm tra toàn bộ stage bằng Spark local và launcher của image Airflow. Máy local có RAM khoảng 5,7 GiB và swap đã gần đầy khi kiểm tra, nên không bật thêm toàn bộ cluster cùng Kafka/Trino đang chạy.

GitHub Actions được bổ sung để chạy contract tests trên database `d4_ci`, build/typecheck/test backend và web, đồng thời từ chối tracked `.env`. Workflow chưa được chạy trên GitHub trong lượt này. Test tài chính ghi dữ liệu được giới hạn vào database thử `d4_*`; không reset số dư demo trên database người dùng.

## Phần còn cần xử lý

1. Thu hồi/đổi Brevo API key trên tài khoản Brevo và cập nhật env scoped sau đó. Không đăng key vào chat.
2. Đối soát nguồn dữ liệu demo cũ và gắn label có căn cứ cho giao dịch có point-in-time features. Không tự sửa số dư/lịch sử hoặc chế tạo nhãn FRAUD/LEGITIMATE.
3. Khi đủ tài nguyên, chạy DAG mới và publish Gold chính; không clear/replay batch cũ với input chưa có version manifests. Bộ Gold audit hiện chỉ là bằng chứng kiểm thử.
4. Chưa thực hiện chaos test ACK/crash/restart bằng Kafka thật hay browser E2E REVIEW/BLOCK. Test unit producer, Redis thật, SQL thật và stream reconciliation không thay thế các bài kiểm tra này.

Hướng dẫn vận hành/cập nhật: [running.md](../../running.md). Không push/merge PR trong lượt này.
