# Kiểm tra MinIO và query Gold bằng Trino

## MinIO

- API/S3 endpoint: `http://localhost:9000`
- Console: `http://localhost:9001`
- Tài khoản: `MINIO_ROOT_USER` và `MINIO_ROOT_PASSWORD` trong `.env`

Bucket tự tạo: `bronze`, `silver`, `gold`, `quarantine`, `pipeline-control`, `ml-models`.

Nếu bucket rỗng sau lần start đầu, kiểm tra DAG Batch. Realtime chỉ ghi vào `bronze/kafka/events` sau khi có outbox event được publish.

Liệt kê object không cần cài MinIO Client trên host:

```bash
set -a
. ./.env
set +a
docker run --rm --network bank-fraud-network \
  -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc:RELEASE.2025-08-13T08-35-41Z \
  ls --recursive local/gold
```

Đổi `local/gold` thành `local/bronze/kafka/events`, `local/silver`, `local/quarantine` hoặc `local/pipeline-control` khi cần.

## Trino CLI

- HTTP/JDBC port host: `8084`
- Catalog: `hive`
- Schema: `gold`

```bash
docker compose exec trino trino --execute "SHOW SCHEMAS FROM hive"
docker compose exec trino trino --execute "SHOW TABLES FROM hive.gold"
docker compose exec trino trino --execute \
  "SELECT count(*) FROM hive.gold.fact_transaction"
```

Nếu Gold đã build nhưng table chưa đăng ký:

```bash
docker compose up -d trino-init
docker compose logs --tail=100 trino-init
```

`trino-init` kết thúc `Exited (0)` là bình thường.

## Kết nối DBeaver

Dùng driver Trino:

| Trường | Giá trị |
|---|---|
| Host | `localhost` |
| Port | `8084` |
| Database/Catalog | `hive` |
| Schema | `gold` |
| Username | `pipeline` |
| Password | để trống |
| JDBC URL | `jdbc:trino://localhost:8084/hive/gold` |

Không bật SSL hoặc password authentication trong local. Nếu `gold/Tables` chưa hiện, Refresh/F5 hoặc reconnect.

## Query mẫu

```sql
SELECT decision, count(*) AS total
FROM hive.gold.fact_risk_assessment
GROUP BY decision
ORDER BY decision;
```

```sql
SELECT t.transaction_id, t.status, r.decision,
       r.rule_score, r.model_probability
FROM hive.gold.fact_transaction t
JOIN hive.gold.fact_risk_assessment r
  ON r.transaction_id = t.transaction_id
ORDER BY t.transaction_id DESC
LIMIT 20;
```

## Vì sao DBeaver không vẽ quan hệ?

Gold dùng external Hive tables trên object storage. Hive/Trino không expose physical PK/FK metadata như PostgreSQL, nên DBeaver không có metadata để tự vẽ đường nối.

Project vẫn định nghĩa primary key và 35 quan hệ logic trong Gold catalog, rồi kiểm tra orphan/uniqueness bằng Gold DQ.
