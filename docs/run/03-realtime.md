# Vận hành Realtime pipeline

## Phạm vi hiện tại

```text
PostgreSQL EVENT_OUTBOX
  -> Outbox Publisher
  -> Kafka topic banking.transaction-events.v1
  -> Bronze Consumer
  -> MinIO bronze/kafka/events/*.json
```

Realtime hiện dừng ở durable Bronze. `ENABLE_REALTIME_SILVER_MERGE=false` là chủ ý; không tự bật merge Silver và không training model.

## 1. Chuẩn bị Kafka cluster ID

Nếu `.env` còn placeholder:

```bash
docker run --rm confluentinc/cp-kafka:7.9.0 kafka-storage random-uuid
```

Chép kết quả vào `KAFKA_CLUSTER_ID`.

## 2. Start Realtime cùng hệ thống

```bash
docker compose --profile realtime up -d --build
docker compose --profile realtime ps -a
conda run -n bank-fraud python -m scripts.healthcheck
```

Các container `bank-kafka1`, `bank-kafka2`, `bank-kafka3`, `bank-outbox-publisher` và `bank-bronze-consumer` phải `Up`/`healthy`. `kafka-init` có `Exited (0)` là bình thường.

## 3. Kiểm tra Kafka

```bash
docker compose exec kafka1 kafka-topics \
  --bootstrap-server kafka1:29092 \
  --describe \
  --topic banking.transaction-events.v1
```

Mong đợi: 3 partition, replication factor 3 và đủ ISR. Kafka UI ở `http://localhost:8080`.

## 4. Tạo giao dịch để phát event

```bash
docker compose run --rm demo-bootstrap
```

Mở `http://localhost:8000/docs`, gọi `POST /transactions/transfers` với ID mà bootstrap in ra. Chỉ giao dịch có `decision=ALLOW` và hoàn tất posting với `status=Success` mới tạo `TransactionCompleted`. `ALLOW` không đồng nghĩa `Success`.

## 5. Theo dõi publisher và consumer

```bash
docker compose logs -f outbox-publisher bronze-consumer
```

Kiểm tra outbox mà không sửa dữ liệu:

```bash
docker compose exec postgres-bank sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SET search_path TO banking; SELECT status, count(*) FROM event_outbox GROUP BY status ORDER BY status;"'
```

Kiểm tra consumer lag:

```bash
docker compose exec kafka1 kafka-consumer-groups \
  --bootstrap-server kafka1:29092 \
  --describe \
  --group bronze-transaction-writer-v1
```

Khi xử lý xong, `LAG` phải về `0`.

## 6. Kiểm tra event trong MinIO

Mở MinIO Console `http://localhost:9001`, bucket `bronze`:

```text
kafka/events/date=YYYY-MM-DD/
  topic=banking.transaction-events.v1/
  partition=<n>/
  offset=<n>-<sha256-prefix>.json
```

Consumer chỉ commit offset sau khi ghi object và `stat_object` thành công. Cùng topic/partition/offset tạo cùng tên object, nên retry không sinh tên ngẫu nhiên mới.

## 7. Kiểm tra restart

```bash
docker compose --profile realtime restart outbox-publisher bronze-consumer
docker compose --profile realtime ps outbox-publisher bronze-consumer
```

Sau restart, kiểm tra log và lag. Realtime dùng at-least-once; downstream phải chịu được duplicate event.

## 8. Test end-to-end

Khi Core + Batch + Realtime đang chạy:

```bash
conda run -n bank-fraud python -m scripts.e2e_test
```

Script tạo giao dịch mới, đợi outbox publish, xác nhận Bronze, trigger DAG và query transaction từ Gold qua Trino. Script có ghi thêm dữ liệu demo vào database và lakehouse.
