# Vận hành Batch pipeline

## Luồng Batch

```text
PostgreSQL
  -> Bronze
  -> Bronze DQ
  -> Silver + Quarantine
  -> Silver DQ
  -> validated Silver release
  -> Gold
  -> Gold DQ
```

DAG Airflow là `banking_bronze_silver_gold`, chạy lúc `01:00 Asia/Ho_Chi_Minh` mỗi ngày. Airflow chỉ điều phối; code xử lý chính nằm trong `data_engineering/` và chạy bằng Spark.

## Chạy tự động trên máy mới clone

```bash
docker compose up -d --build
```

`airflow-batch-bootstrap` chờ scheduler, unpause DAG và tạo `bootstrap_first_run` đúng một lần trên Airflow metadata mới. Không cần gọi từng stage bằng tay.

Kiểm tra run và task:

```bash
docker compose exec airflow-webserver \
  airflow dags list-runs -d banking_bronze_silver_gold

docker compose exec airflow-webserver \
  airflow tasks states-for-dag-run banking_bronze_silver_gold bootstrap_first_run
```

## Trigger một run mới

Dùng run ID duy nhất:

```bash
docker compose exec airflow-webserver \
  airflow dags trigger banking_bronze_silver_gold \
  --run-id manual_validation_001
```

Không tái sử dụng run ID cũ.

## Theo dõi log

```bash
docker compose logs -f airflow-scheduler spark-master spark-worker
```

Hoặc mở Airflow tại `http://localhost:8081`, đăng nhập bằng `AIRFLOW_ADMIN_USERNAME` và `AIRFLOW_ADMIN_PASSWORD` trong `.env`.

## Kiểm tra output MinIO

Mở MinIO Console tại `http://localhost:9001`. Các bucket/path chính:

- `bronze/`: Batch raw và ingestion metadata để audit/replay.
- `silver/`: dữ liệu canonical đã normalize, validate, deduplicate.
- `quarantine/`: record không hợp lệ kèm lý do lỗi.
- `gold/dimensions/` và `gold/facts/`: 10 dimension và 7 fact.
- `pipeline-control/runs/<batch_id>/`: metric từng stage.
- `pipeline-control/silver/active_release.json`: Silver đã qua DQ cho training; Gold pin snapshot theo batch. V1 dùng full snapshot nhất quán, chưa đẩy incremental watermark.

Xem lệnh CLI tại [hướng dẫn MinIO và Trino](04-minio-trino.md).

## Kiểm tra Gold DQ

Task `gold_dq` phải thành công. Contract kiểm tra primary key và 35 quan hệ logic giữa dimension/fact. Hive/Trino không cung cấp physical foreign key metadata, nên DBeaver có thể không vẽ đường quan hệ dù DQ đã kiểm tra.

```bash
docker compose exec trino trino --execute \
  "SHOW TABLES FROM hive.gold"

docker compose exec trino trino --execute \
  "SELECT decision, count(*) FROM hive.gold.fact_risk_assessment GROUP BY decision ORDER BY decision"
```

## Idempotency và retry

- Stage dùng cùng `batch_id` có đường dẫn deterministic.
- Watermark chỉ commit sau khi Silver DQ đạt.
- Gold deterministic overwrite; chạy lại không tự nhân bản record.
- Nếu Gold fail nhưng Silver hợp lệ, retry Gold/Gold DQ, không cần xóa dữ liệu hay extract lại.
- Invalid record vào Quarantine, không sửa thành dữ liệu giả để vượt DQ.

## Batch không làm gì

- Không chạy Kafka consumer.
- Không training model.
- Không cần Kafka để banking transaction commit.
- Không sửa PostgreSQL schema.
