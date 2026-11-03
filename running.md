# Chạy D4 Bank

Các lệnh Docker chạy tại thư mục gốc dự án (có `docker-compose.yaml`). Không dùng `down` để chuyển giữa web, batch và stream.

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

Luồng: PostgreSQL → Bronze → kiểm tra Bronze → Silver/Quarantine → kiểm tra Silver → watermark → Gold → kiểm tra Gold → đăng ký bảng/view Trino → D4 Insights. Dữ liệu Quarantine không được cộng vào Gold. Số lượng trên Insights vì thế có thể thấp hơn danh sách nghiệp vụ PostgreSQL.

## Stream liên tục

```bash
docker compose --profile realtime up -d kafka1 kafka2 kafka3 kafka-init outbox-publisher bronze-consumer
docker compose exec bronze-consumer python -m scripts.audit_stream
```

Luồng: giao dịch commit → outbox → Kafka → Bronze. Consumer chỉ commit offset sau khi lưu và kiểm tra object thành công. Stream hiện **không đẩy trực tiếp lên biểu đồ web**; Kafka không thay thế nguồn PostgreSQL của trang giao dịch. `ENABLE_REALTIME_SILVER_MERGE=true` chỉ bổ sung dataset sự kiện `silver/domain_event` trong lần batch kế tiếp.

Nếu Kafka báo `Invalid cluster.id`, đối chiếu `KAFKA_CLUSTER_ID` với `cluster.id` trong `meta.properties` của cả ba volume; giữ ID của cụm hiện hữu. Không format lại hay xóa volume để chữa lỗi cấu hình.

## Kiểm tra

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
