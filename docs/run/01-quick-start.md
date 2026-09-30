# Cài đặt và chạy lần đầu

## 1. Yêu cầu

- Docker Engine và Docker Compose V2 (`docker compose`).
- Khuyến nghị tối thiểu 8 GB RAM trống cho toàn bộ stack.
- Conda chỉ cần khi chạy test hoặc script Python từ host. Môi trường của dự án là `bank-fraud`.
- Các cổng mặc định chưa bị ứng dụng khác chiếm: `5432`, `8000`, `8080` đến `8084`, `9000`, `9001`, `9092` đến `9094`.

Kiểm tra nhanh:

```bash
docker --version
docker compose version
conda env list
```

## 2. Chuẩn bị biến môi trường

Từ thư mục gốc repository:

```bash
test -f .env || cp .env.example .env
```

Mở `.env`, thay các giá trị `change_me_*` và không commit file này.

Nếu sẽ chạy Realtime, tạo Kafka cluster ID:

```bash
docker run --rm confluentinc/cp-kafka:7.9.0 kafka-storage random-uuid
```

Chép kết quả vào `KAFKA_CLUSTER_ID` trong `.env`. Không để `REPLACE_WITH_GENERATED_CLUSTER_ID` khi bật Realtime.

## 3. Chạy Core + Batch

```bash
docker compose up -d --build
docker compose ps -a
```

Compose tự tạo PostgreSQL và dữ liệu demo trên volume mới, tạo bucket MinIO, chạy Spark/Airflow/Trino, unpause DAG `banking_bronze_silver_gold`, trigger `bootstrap_first_run`, rồi đăng ký 10 dimension và 7 fact trong `hive.gold`.

Theo dõi lần build/run đầu:

```bash
docker compose logs -f airflow-scheduler spark-master spark-worker
```

Nhấn `Ctrl+C` chỉ dừng xem log, không dừng container.

## 4. Kiểm tra service

```bash
docker compose ps -a
curl -fsS http://localhost:8000/health
curl -fsS http://localhost:8081/health
curl -fsS http://localhost:9000/minio/health/ready
curl -fsS http://localhost:8084/v1/info
```

Service dài hạn phải `Up`/`healthy`. Job init có thể là `Exited (0)` và không phải lỗi.

## 5. Bật Realtime

Realtime chạy cùng Batch, không cần tắt service nào:

```bash
docker compose --profile realtime up -d --build
docker compose --profile realtime ps -a
conda run -n bank-fraud python -m scripts.healthcheck
```

Xem chi tiết tại [hướng dẫn Realtime](03-realtime.md).

## 6. Conda và test

```bash
conda run -n bank-fraud python --version
conda run -n bank-fraud python -m pytest -q
```

Hoặc:

```bash
conda activate bank-fraud
python -m pytest -q
```

Nếu môi trường `bank-fraud` chưa tồn tại, repository hiện chưa có file khóa Conda riêng. Có thể dùng container Docker để chạy hệ thống; không tự coi một môi trường với dependency tùy ý là cấu hình chuẩn.

## 7. Dừng và chạy lại

Giữ nguyên toàn bộ dữ liệu:

```bash
docker compose --profile realtime stop
docker compose --profile realtime up -d
```

Không chạy `docker compose down -v` trừ khi chủ động muốn xóa toàn bộ volume local.
