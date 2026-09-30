# Hướng dẫn chạy dự án

Bộ tài liệu này dành cho người mới clone repository và người vận hành local.

Đọc theo thứ tự:

1. [Cài đặt và chạy lần đầu](01-quick-start.md)
2. [Vận hành Batch pipeline](02-batch.md)
3. [Vận hành Realtime pipeline](03-realtime.md)
4. [Kiểm tra MinIO và query Gold bằng Trino](04-minio-trino.md)
5. [Xử lý lỗi thường gặp](05-troubleshooting.md)

Các nguyên tắc cần nhớ:

- Batch tự chạy lần đầu qua Airflow; không cần chạy từng file ETL bằng tay.
- Realtime là profile riêng và có thể chạy đồng thời với Batch.
- Realtime hiện dừng ở Bronze; không tự merge vào Silver và không training model.
- Các service có tên `*-init`, cùng `demo-bootstrap` và `airflow-batch-bootstrap`, là job chạy một lần. Trạng thái `Exited (0)` là bình thường.
- Không dùng `docker compose down -v` nếu muốn giữ PostgreSQL, MinIO, Kafka và Airflow metadata.
- PostgreSQL schema là contract cố định; không chạy script sửa schema để phục vụ ETL.
