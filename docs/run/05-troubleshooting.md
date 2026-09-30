# Xử lý lỗi thường gặp

## 1. Container init hiện `Exited (0)`

Đây là trạng thái bình thường với `airflow-init`, `airflow-batch-bootstrap`, `demo-bootstrap`, `minio-init`, `trino-init` và `kafka-init`.

Chỉ `Exited` khác `0`, `Error`, `unhealthy` hoặc restart liên tục mới cần điều tra:

```bash
docker compose ps -a
docker compose logs --tail=200 <service-name>
```

## 2. Kafka container không xuất hiện

Kafka thuộc profile `realtime`:

```bash
docker compose --profile realtime up -d
```

Batch và Realtime chạy đồng thời. Nếu broker dừng, kiểm tra Kafka cluster ID trong `.env` và log:

```bash
docker compose logs --tail=200 kafka1 kafka2 kafka3
```

## 3. MinIO không có dữ liệu

Kiểm tra theo thứ tự:

1. `minio` healthy và `minio-init` là `Exited (0)`.
2. Batch: Airflow DAG phải success.
3. Realtime: transaction `Success`, outbox `PUBLISHED`, consumer healthy, lag bằng 0.
4. Đúng path: Batch ở `bronze`, `silver`, `gold`; Realtime ở `bronze/kafka/events`.

```bash
docker compose logs --tail=200 minio-init airflow-scheduler
docker compose --profile realtime logs --tail=200 outbox-publisher bronze-consumer
```

Không xóa volume MinIO để “thử lại”; xác định stage chưa chạy trước.

## 4. Trino `unhealthy` hoặc `trino-init` lỗi

```bash
docker compose logs --tail=200 hive-metastore trino trino-init
docker compose restart hive-metastore trino
docker compose up -d trino-init
```

Chờ Hive Metastore và Trino healthy. Kiểm tra:

```bash
curl -fsS http://localhost:8084/v1/info
docker compose exec trino trino --execute "SHOW SCHEMAS FROM hive"
```

## 5. DBeaver connect được nhưng không có table

- Catalog `hive`, schema `gold`.
- JDBC URL: `jdbc:trino://localhost:8084/hive/gold`.
- Chạy `docker compose up -d trino-init` sau khi Gold có dữ liệu.
- Refresh và xác nhận bằng `SHOW TABLES FROM hive.gold`.

## 6. Airflow DAG fail

```bash
docker compose exec airflow-webserver \
  airflow dags list-runs -d banking_bronze_silver_gold
docker compose logs --tail=300 airflow-scheduler spark-master spark-worker
```

Mở task fail trong Airflow UI. Retry stage lỗi thay vì xóa database. Airflow driver và Spark worker phải cùng minor Python version:

```bash
docker compose exec airflow-scheduler python --version
docker compose exec spark-worker python3 --version
```

## 7. Port đã được sử dụng

Thay port host trong `.env`: `POSTGRES_PORT`, `BANKING_API_PORT`, `AIRFLOW_PORT`, `SPARK_MASTER_UI_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`, `TRINO_PORT`, `KAFKA_UI_PORT`, `KAFKA1_PORT` đến `KAFKA3_PORT`.

Sau khi sửa:

```bash
docker compose --profile realtime up -d
```

## 8. Orphan container warning

Warning orphan không nhất thiết làm stack lỗi. Xác định container trước:

```bash
docker compose ps -a
docker ps -a --filter label=com.docker.compose.project=bank-fraud-detection
```

Không tự thêm `--remove-orphans` nếu chưa chắc container không còn cần thiết.

## 9. Không dùng `down -v` để sửa lỗi thường

Lệnh này xóa named volume của PostgreSQL, Kafka, MinIO, Airflow và Hive Metastore. Thay vào đó:

```bash
docker compose restart <service-name>
docker compose up -d <service-name>
docker compose logs --tail=200 <service-name>
```
