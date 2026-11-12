# Chạy D4 Bank

Các lệnh Docker chạy tại thư mục gốc dự án (có `docker-compose.yaml`). Không dùng `down` để chuyển giữa web, batch và stream.

Máy local khoảng 6 GB RAM nên kiểm tra batch và cụm Kafka 3 broker theo từng lượt. Nếu chạy đồng thời toàn bộ stack, Spark/Airflow và Kafka có thể hết RAM hoặc swap. Có thể `docker compose stop` nhóm tạm không dùng; thao tác này giữ dữ liệu và volume.

## Web và cơ sở dữ liệu

```bash
docker compose up -d postgres-bank redis
docker compose up -d --no-deps banking-api notification-sender
docker compose up -d minio hive-metastore trino
docker compose run --rm --no-deps trino-init
```

Ở terminal riêng:

```bash
cd web
npm run dev
```

Các trang nghiệp vụ của admin, nhân viên và khách hàng đọc PostgreSQL qua Banking API. D4 Insights của admin đọc MinIO Gold qua Trino. Chỉ bật MinIO/Trino sẽ đọc được Gold hiện có, **không tự tạo batch mới**.

OTP chuyển tiền có hiệu lực 5 phút; nút gửi lại dùng bộ đếm riêng 60 giây, đồng bộ với giới hạn phía API. Lỗi gửi email/tra cứu hồ sơ phải giải phóng khóa gửi lại. API báo ACCEPTED chỉ có nghĩa Brevo đã nhận yêu cầu, không xác nhận email đã tới hộp thư; đối chiếu Transactional Logs của Brevo để kiểm tra sent/delivered/blocked. Kiểm tra giao diện bằng `cd web` rồi `npm run test:otp` (email và giao dịch được giả lập).

Thanh toán khoản vay ở cuối hộp thoại chi tiết khoản vay cần `LOAN_SETTLEMENT_ACCOUNT_ID` trong `.env` gốc. Giá trị phải là ID tài khoản ngân hàng `INTERNAL`, tiền VND và đang hoạt động, do người quản trị chọn để thu nợ. Khi chưa cấu hình, khách hàng vẫn xem được form/số tiền nhưng không thể xác nhận gửi lệnh. Sau khi đặt giá trị, chạy lại `docker compose up -d --no-deps banking-api` để API nhận cấu hình. Có thể kiểm tra giao diện bằng `cd web` rồi `npm run test:loan-payment`; các lệnh thanh toán trong browser test đều được giả lập.

## Batch tự động hằng ngày

```bash
docker compose up -d minio minio-init spark-master spark-worker postgres-airflow airflow-init trino trino-init
docker compose up -d airflow-webserver airflow-scheduler
docker compose exec airflow-webserver airflow dags unpause banking_bronze_silver_gold
```

DAG chạy lúc 01:00 giờ Việt Nam. Để chạy ngay một lượt mới (run id do Airflow tạo):

```bash
docker compose exec airflow-webserver airflow dags trigger banking_bronze_silver_gold
```

Luồng: PostgreSQL → Bronze → kiểm tra Bronze → Silver/Quarantine → kiểm tra Silver → Gold → kiểm tra Gold → publish release Trino → D4 Insights. V1 đọc full snapshot của 20 bảng trên cùng snapshot PostgreSQL để tránh bỏ sót transaction commit muộn. Task `commit_watermarks` hiện là bước tương thích, không đẩy watermark incremental. Silver và Gold có đường dẫn riêng theo batch để retry không đọc nhầm dữ liệu batch khác. Dữ liệu Quarantine không được cộng vào Gold.

## Stream liên tục

```bash
docker compose --profile realtime up -d kafka1 kafka2 kafka3 kafka-init outbox-publisher bronze-consumer
docker compose exec bronze-consumer python -m scripts.audit_stream
```

Luồng: giao dịch commit → outbox → Kafka → Bronze. Consumer chỉ commit offset sau khi lưu và kiểm tra object thành công. Stream hiện **không đẩy trực tiếp lên biểu đồ web**; Kafka không thay thế nguồn PostgreSQL của trang giao dịch. `ENABLE_REALTIME_SILVER_MERGE=true` chỉ bổ sung dataset sự kiện `silver/domain_event` trong lần batch kế tiếp.

Nếu Kafka báo `Invalid cluster.id`, đối chiếu `KAFKA_CLUSTER_ID` với `cluster.id` trong `meta.properties` của cả ba volume; giữ ID của cụm hiện hữu. Không format lại hay xóa volume để chữa lỗi cấu hình.

## Kiểm tra

Kiểm tra ba luồng đăng ký của khách hàng và xử lý hồ sơ vay của nhân viên/admin khi web đang chạy: trong thư mục `web`, chạy `npm run test:products` (cần Playwright). Browser test giả lập toàn bộ thao tác ghi. Backend có `tests/customer-products.test.cjs`; kiểm tra tích hợp chỉ chạy khi `CUSTOMER_SELF_SERVICE_TEST_DB` trỏ tới database kiểm thử riêng có tiền tố `d4_selfservice_`, không dùng database nghiệp vụ hiện tại.

Giao diện dùng menu thu gọn khi chiều rộng dưới 1100 px. Trên điện thoại, bảng nhiều cột có thể vuốt ngang; biểu mẫu dài cuộn trong hộp thoại và giữ nút lưu ở cuối khung. Khi web đang chạy, dùng `cd web` rồi `npm run test:responsive` để kiểm tra điều hướng, bảng và hộp thoại tại 320, 390, 768 và 1024 px bằng Playwright. Các API trong bài kiểm tra được giả lập, không ghi dữ liệu ngân hàng.

```bash
docker compose ps
conda run -n bank-fraud python -m scripts.healthcheck
docker compose exec bronze-consumer python -m scripts.audit_stream
```

Healthcheck tổng thể báo lỗi khi Spark/Airflow/Kafka chưa được bật, kể cả web vẫn hoạt động. Backend health: `http://localhost:8000/api/v1/health`. Airflow: `http://localhost:8081`; Trino: `http://localhost:8084`; MinIO: `http://localhost:9001`.

Kiểm tra batch trong bucket riêng, không ghi đè Gold phục vụ web:

```bash
docker compose run --rm --no-deps -e MINIO_ENDPOINT=http://minio:9000 -e POSTGRES_HOST=postgres-bank -e POSTGRES_INTERNAL_PORT=5432 --entrypoint /opt/spark/bin/spark-submit spark-master --master 'local[2]' --conf spark.sql.shuffle.partitions=2 /workspace/scripts/audit_pipeline.py
```

Script tự tạo bucket `d4-audit-*`, giữ lại bằng chứng kiểm tra; không sửa số dư hay tạo giao dịch PostgreSQL. Cần truyền `MINIO_ENDPOINT=http://minio:9000`, `POSTGRES_HOST=postgres-bank`, `POSTGRES_INTERNAL_PORT=5432` cho lệnh kiểm tra trong container nếu `.env` đang cấu hình địa chỉ localhost cho máy host.

Để dùng lại bộ bucket audit đã có mà không tạo bucket mới, thêm `--prefix <tên-bộ-bucket>` và `--batch-id <mã-lượt-mới>` cùng `--existing-buckets` vào cuối lệnh. Mỗi lượt giữ dữ liệu trong đường dẫn riêng; không xóa các lượt cũ.

## Cập nhật bản vá Banking/Risk

Các thay đổi cần cập nhật đồng bộ function SQL và image API. Các lệnh sau chạy trên môi trường local đã có `.env` và PostgreSQL; không chạy lại `create_table.sql` trên database hiện hữu:

```bash
docker compose build banking-api spark-master airflow-webserver
conda run -n bank-fraud python -m scripts.provision_runtime_roles --apply
conda run -n bank-fraud python -m pip install -r docker/requirements-inference.txt
conda run -n bank-fraud python -m scripts.register_joblib_model --apply --publish-artifact
docker compose stop banking-api
conda run -n bank-fraud python -m scripts.apply_function_fixes --apply
docker compose up -d --no-deps banking-api notification-sender
docker compose --profile realtime up -d outbox-publisher bronze-consumer
```

`apply_function_fixes` cập nhật nguyên tử 29 function; không sửa bảng, cột, constraint, trigger hoặc index. `provision_runtime_roles` tạo các role runtime không có superuser và lưu bốn cặp credential vào duy nhất `.env` local với quyền 0600; `.env.example` là bản mẫu. Compose chỉ truyền các biến cần thiết cho từng service. API có quyền nghiệp vụ cần thiết; ETL chỉ đọc, publisher chỉ đọc/cập nhật outbox. Credential admin vẫn dùng riêng cho bootstrap/bảo trì và không truyền vào các service runtime. Worker chỉ mount các thư mục code cần thiết, không mount repo root chứa secret.

API dùng đúng `models/fraud_detection_model.joblib` và `models/model_metadata.json`. Một worker Python nội bộ cache pipeline XGBoost, nhận 19 feature lấy tại cùng mốc thời gian từ PostgreSQL và trả xác suất trước khi financial processing bắt đầu. Khoảng cách giao dịch tính bằng phút, tỷ lệ failed login là `failed / (failed + success + 1)`. Request cùng khách hàng được tuần tự hóa để kiểm tra velocity thấy các commit trước. SQL đối chiếu context dự đoán với giao dịch, ghi SHA-256/model version/feature snapshot vào `risk_assessment.reasonjson` hiện có. Không fallback sang logistic nếu joblib chưa sẵn sàng. Threshold `0.408` chỉ thuộc đánh giá offline; policy online vẫn REVIEW `0.60`, BLOCK `0.90` và RuleScore như AGENTS.md.

Trước khi cập nhật API lần đầu hoặc thay artifact, đăng ký identity theo hash và lưu bản chính xác vào MinIO (thực hiện ngoài luồng commit):

```bash
conda run -n bank-fraud python -m pip install -r docker/requirements-inference.txt
conda run -n bank-fraud python -m scripts.register_joblib_model --apply --publish-artifact
conda run -n bank-fraud python -m scripts.apply_function_fixes --apply
docker compose build banking-api
docker compose up -d --no-deps banking-api
```

Không ghi đè model gốc để loại cảnh báo pickle. Runtime CPU đã pin phiên bản và kiểm tra lại 4.500 mẫu test với metadata; khi chuyển môi trường cần chạy lại kiểm tra. Model mới phải có identity ACTIVE tương ứng trước khi reload/deploy. Profile `model-sync` và trainer logistic cũ phục vụ artifact JSON nghiên cứu, không điều khiển model joblib đang chạy trên API.

Hive metastore persist tại `/opt/hive/metastore_db`. Nếu nâng từ cấu hình mount cũ `/opt/hive/data`, dừng Hive và sao lưu/copy thư mục Derby hiện có vào volume trước khi recreate; giữ dữ liệu `warehouse`, không xóa volume. Gold publish dùng advisory lock và từ chối snapshot cũ hơn release đang phục vụ. DQ đưa giao dịch Success thiếu completed outbox và loan payment không đối soát được vào Quarantine.

Worker retry với backoff, tối đa 8 lần trong mỗi vòng đời process. Event hết budget vẫn nằm `FAILED` trong outbox và bị tạm ngưng; sửa nguyên nhân rồi restart worker để mở lượt retry mới. Không xóa event/offset để xử lý lỗi.

`.env` đã được bỏ theo dõi Git. Secret từng có trong lịch sử cần được đổi và xử lý theo quy trình riêng; không tự force-push lịch sử. Mã OTP chỉ ở email; trạng thái provider tiếp nhận yêu cầu không đồng nghĩa email đã được phát thành công.

Để chủ động đổi bốn secret local (PostgreSQL admin, MinIO root, JWT và OTP hash), dùng `conda run -n bank-fraud python -m scripts.rotate_local_secrets --apply`, chạy lại `provision_runtime_roles --apply`, rồi recreate các service liên quan để nạp env mới. Web cần đăng nhập lại. Brevo API key phải đổi ở tài khoản Brevo; script không thay key bên ngoài.


docker compose up -d postgres-bank redis demo-bootstrap banking-api
