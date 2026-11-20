# Hướng dẫn chạy D4 Bank

Chạy lệnh tại thư mục gốc có `docker-compose.yaml`, trừ đoạn có lệnh `cd` chuyển thư mục.
Dùng một file `.env` cho mỗi máy. Các bước khởi tạo DB do bạn chủ động thực hiện;
Docker không tự tạo bảng, schema hoặc nạp dữ liệu mẫu.

| Trường hợp | Bắt đầu ở đâu |
| --- | --- |
| Clone mới, DB trống | Bước 1 → 2 → 3 → 4 |
| EC2 đã khôi phục DB từ backup | Bước 1 → nhánh backup ở bước 2 → 3 → 4 |
| DB và cấu hình đã sẵn sàng, chỉ bật lại web | Bước 4, bỏ lệnh build nếu image chưa thay đổi |
| Sửa code và muốn cập nhật bản đang chạy | Phần 6 |
| Chạy frontend local để sửa giao diện | Phần 5 |
| Cần D4 Insights, batch hoặc stream | Phần 7 |

## 1. Chuẩn bị sau khi clone

Máy cần Git, Docker Engine kèm Docker Compose v2 và Python 3 có `venv`.
Python 3.11 phù hợp với bộ thư viện inference hiện tại. Chạy npm trực tiếp trên
local cần Node.js 22; EC2 chạy Docker không cần cài Node trên host.

Tạo `.env` nếu chưa có; không ghi đè file cấu hình đang dùng:

```bash
cp -n .env.example .env
chmod 600 .env
python3 -m venv .venv
.venv/bin/python -m pip install 'psycopg[binary]==3.2.13' python-dotenv
```

### Thư viện cần chuẩn bị

Phân biệt thư viện trên host và thư viện trong container:

| Chạy ở đâu | Thư viện | Cách cài |
| --- | --- | --- |
| EC2 host, chạy script cấp quyền DB | `psycopg`, `python-dotenv` | Dùng `.venv` và lệnh pip ở trên |
| Backend trong Docker | Node dependencies + Python inference/XGBoost | `Dockerfile.backend` tự cài bằng `npm ci` và `docker/requirements-inference.txt` |
| Frontend trong Docker | Next.js, React và dependencies trong lockfile | `Dockerfile.web` tự cài bằng `npm ci` |
| Airflow/Spark trong Docker | Thư viện ETL, PySpark, Java và JDBC JAR | Dockerfile tương ứng tự cài khi build nhóm batch |
| Bronze consumer trong Docker | Kafka client, MinIO, PostgreSQL client | `Dockerfile.streaming` tự cài từ `docker/requirements-streaming.txt` |

Nếu chỉ chạy web/API/model bằng Docker, không cần cài Node.js, Java, Spark hoặc
XGBoost trực tiếp lên EC2 host. Máy cần truy cập được các registry/package repository
trong lần pull/build đầu tiên.

Nếu cần chạy script đăng ký model trên host, cài thêm **trong venv Python 3.11**:

```bash
.venv/bin/python -m pip install -r docker/requirements-inference.txt
```

`requirements.txt` ở gốc phục vụ môi trường Python data platform/kiểm thử; file này
không chứa toàn bộ thư viện inference. Chỉ khi chạy công cụ data platform trực tiếp
trên host mới cài thêm:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

Cài PySpark bằng pip không thay thế việc chuẩn bị Java/JDBC cho job Spark trên host.
Để chạy batch theo hướng dẫn này, dùng các container Airflow/Spark đã đóng gói sẵn.

### Cấu hình môi trường

Mở `.env`, điền các biến sau. Không commit file này hoặc gửi nội dung secret vào chat.

| Biến | Cách cấu hình |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database và tài khoản quản trị để khởi tạo/bảo trì |
| `JWT_SECRET`, `OTP_HASH_SECRET` | Mỗi secret ít nhất 32 ký tự ngẫu nhiên, riêng cho từng môi trường |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Cần khi bật nhóm dữ liệu/MinIO |
| `POSTGRES_BIND_ADDRESS`, `BANKING_API_BIND_ADDRESS` | Giữ `127.0.0.1` |
| `PUBLIC_HOST` | `:80` khi thử bằng IP; tên domain như `bank.example.com` khi dùng HTTPS |
| `WEB_HTTP_PORT`, `WEB_HTTPS_PORT` | Mặc định `80`, `443` |
| `CORS_ORIGINS` | `http://<IP-EC2>` hoặc `https://bank.example.com`; local npm dùng `http://localhost:3000` |
| `BREVO_API_KEY`, `OTP_SENDER_EMAIL`, `OTP_SENDER_NAME` | Cấu hình Brevo và email gửi đã xác minh để nhận OTP |

`BANKING_DB_*`, `OUTBOX_DB_*`, `NOTIFICATION_DB_*`, `ETL_DB_*` được cấp ở bước 3.
Script chạy trên host dùng `POSTGRES_HOST` mặc định `localhost` và `POSTGRES_PORT`;
không đặt host này thành tên container khi dùng script trên host.

## 2. Khởi tạo hoặc khôi phục DB — chỉ làm khi cần

Chỉ bật PostgreSQL và Redis trước, chưa bật API/worker:

```bash
docker compose up -d postgres-bank redis
docker compose ps postgres-bank redis
```

### Nếu DB hoàn toàn mới

Trong DBeaver, kết nối tới database theo `.env` bằng tài khoản quản trị.
Local dùng `127.0.0.1:5432` nếu chưa đổi cổng. Khi truy cập DB EC2 từ máy cá nhân,
dùng SSH tunnel trong DBeaver tới `127.0.0.1:5432` của EC2; không mở public cổng DB.

Chạy **Execute SQL Script** cho từng file theo đúng thứ tự:

| Thứ tự | File | Mục đích |
| --- | --- | --- |
| 1 | [sql/create_table.sql](sql/create_table.sql) | Tạo schema và bảng trên DB trống |
| 2 | [sql/z_01_foundation.sql](sql/z_01_foundation.sql) | Extension, schema API và các hàm nền |
| 3 — tùy chọn | [sql/examble_data.sql](sql/examble_data.sql) | Nạp bộ dữ liệu mô phỏng của dự án |
| 4 | [sql/z_02_views.sql](sql/z_02_views.sql) | View đọc dữ liệu |
| 5 | [sql/z_03_integrity.sql](sql/z_03_integrity.sql) | Audit và kiểm tra tính toàn vẹn |
| 6 | [sql/z_04_financial_operations.sql](sql/z_04_financial_operations.sql) | Giao dịch, risk và xử lý tài chính |
| 7 | [sql/z_05_management_operations.sql](sql/z_05_management_operations.sql) | Tạo/cập nhật hồ sơ, tài khoản, thẻ, khoản vay |
| 8 | [sql/z_06_api_queries.sql](sql/z_06_api_queries.sql) | Truy vấn phục vụ API/web |
| 9 | [sql/z_07_outbox_and_indexes.sql](sql/z_07_outbox_and_indexes.sql) | Outbox và index theo thiết kế có sẵn |

Nếu dùng dữ liệu mẫu, nạp **trước** khi tạo trigger để không xử lý snapshot lịch sử
như giao dịch mới. Chạy đến hết `examble_data.sql`, gồm khối `sync_seed_identities`
ở cuối file. Nếu DBeaver tắt Auto-commit, Commit sau khi mỗi script chạy thành công;
khi có lỗi, xử lý lỗi trước khi chuyển bước, không tiếp tục nạp phần còn lại.

Bỏ qua dữ liệu mẫu thì DB chưa có tài khoản đăng nhập hoặc dữ liệu nghiệp vụ để sử dụng.
Cần tự chuẩn bị dữ liệu hợp lệ và đăng ký model ở bước 3.

### Nếu khôi phục DB từ backup

Khôi phục backup đã có đủ schema, bảng, view, function, trigger và dữ liệu.
Không chạy lại `create_table.sql` hoặc `examble_data.sql` trên DB vừa khôi phục.
Đối chiếu phiên bản SQL trong backup với code đang deploy; chỉ áp dụng bản cập nhật
cần thiết khi đã sao lưu. Chạy bước 3 để cấp quyền cho runtime roles của máy đích.

## 3. Cấp quyền runtime và kiểm tra model

Sau khi DB đã có đủ các đối tượng ở bước 2:

```bash
.venv/bin/python -m scripts.provision_runtime_roles --apply
```

Script cấp bốn role runtime không có superuser và lưu credential trong `.env`.
Không truyền credential quản trị PostgreSQL vào API. Nếu tạo lại view sau bước này,
chạy lại script để cấp quyền cho view mới. `sql/quyen.sql` chỉ dành cho role mặc định
`d4_banking`; dùng script trên nếu đã đổi tên role trong `.env`.

Trong DBeaver kiểm tra model và audit trigger:

```sql
SELECT modelversionid, modelname, modeltype, status
FROM banking.model_version
ORDER BY modelversionid;

SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'banking.customer'::regclass
  AND NOT tgisinternal;
```

Dữ liệu mẫu đã đăng ký model XGBoost `ACTIVE` khớp file `.joblib` trong Git.
`SIMULATED_RULE_V1` là bản dành cho lịch sử mô phỏng; không đổi các risk assessment
cũ sang model mới chỉ bằng cách thay ID. `trg_audit_customer` cần hoạt động (`O` hoặc `A`).

Nếu không nạp mẫu hoặc thay file model, đăng ký đúng artifact hiện có, không train lại:

```bash
.venv/bin/python -m pip install -r docker/requirements-inference.txt
.venv/bin/python -m scripts.register_joblib_model --apply
```

Lệnh này đăng ký metadata vào `model_version`, không lưu binary model vào DB.
Nếu cần lưu thêm bản artifact vào MinIO, bật `minio` và `minio-init`, cài thư viện
`minio` vào venv rồi thêm `--publish-artifact` vào lệnh đăng ký.

<a id="triển-khai-webapi-trên-ec2-bằng-docker"></a>

## 4. Triển khai web/API trên EC2 bằng Docker

Các bước 1–3 phải xong trước khi bật nhóm này. Không dùng `npm run dev` trên EC2.

```bash
python3 -m scripts.check_web_deployment
docker compose --profile web build banking-api web
docker compose --profile web up -d postgres-bank redis banking-api web gateway notification-sender
docker compose --profile web ps
```

Nhóm này chạy web, API, PostgreSQL, Redis, gateway và worker gửi thông báo;
không tự bật Spark/Airflow/Kafka. Web đợi API healthy, gateway đợi web healthy.
API health kiểm tra cả model XGBoost và bản đăng ký ACTIVE trong DB.

Khi `PUBLIC_HOST=:80`, mở `http://<IP-EC2>` rồi kiểm tra trên EC2:

```bash
python3 -m scripts.check_web_deployment --url http://127.0.0.1
```

Khi dùng domain, trỏ domain tới EC2 và đặt `PUBLIC_HOST=bank.example.com`.
Mở cổng web 80/443, chạy lại `up` ở trên rồi kiểm tra:

```bash
python3 -m scripts.check_web_deployment --url https://bank.example.com
```

Caddy cấp/gia hạn TLS khi domain và cổng đã sẵn sàng. Camera QR trên điện thoại
cần HTTPS; HTTP theo IP chỉ để thử những luồng không cần quyền camera.
Không public cổng PostgreSQL/API hoặc dashboard dữ liệu; SSH chỉ cấp cho người quản trị.

Trình duyệt gọi `/api/v1` cùng origin; Caddy chuyển request đến `banking-api:8000`.
Image web chủ động build URL API rỗng, nên không cần build lại web khi đổi IP/domain.
Biến `NEXT_PUBLIC_API_URL` ở `.env` không điều khiển URL của image web này.

Sau khi chạy: kiểm tra đăng nhập từng quyền, dữ liệu danh sách, thông báo, OTP
và thao tác nghiệp vụ bằng tài khoản thử nghiệm. Không dùng mật khẩu demo công khai
cho website public. Kiểm tra HTTP/health đạt không thay thế kiểm thử chuyển tiền.

## 5. Chạy local để phát triển giao diện

DB/model/quyền vẫn phải được chuẩn bị theo bước 1–3. Chỉ bật backend core:

```bash
docker compose up -d postgres-bank redis
docker compose up -d --build banking-api notification-sender
```

Ở terminal khác:

```bash
cd web
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Mở `http://localhost:3000`; đặt `CORS_ORIGINS=http://localhost:3000` trong `.env`
và recreate API nếu vừa đổi cấu hình. Lệnh npm trên truyền URL API rõ ràng vì Next
không tự đọc `.env` ở thư mục gốc của repository khi chạy trong `web`.

Nếu muốn thử chính bản Docker production trên local, dùng bước 4 và mở
`http://localhost` khi cổng 80 đang trống. Không cần chạy thêm npm dev.
Tránh bật tất cả nhóm dữ liệu khi máy thiếu RAM; có thể `docker compose stop`
những service không dùng, giữ nguyên volume.

## 6. Cập nhật code hoặc bật lại sau khi tắt máy

### Chỉ bật lại bản đã cài

DB và image giữ nguyên, không nạp SQL hay tạo lại secret:

```bash
docker compose --profile web up -d postgres-bank redis banking-api web gateway notification-sender
```

### Cập nhật code trên DB đã có dữ liệu

Sao lưu DB trước khi cập nhật. Commit/push đầy đủ code, SQL và ảnh cần thiết lên
nhánh làm việc; không đưa `.env` lên Git. Trên máy đích, pull đúng nhánh/commit rồi:

```bash
python3 -m scripts.check_web_deployment
docker compose --profile web build banking-api web
docker compose --profile web up -d postgres-bank redis banking-api web gateway notification-sender
```

Không chạy lại seed hoặc tạo bảng. Nếu bản cập nhật có đổi SQL function/view/trigger,
dừng API và các worker đang ghi, áp dụng đúng phần SQL được hướng dẫn, cấp lại quyền
nếu tạo lại view, rồi bật lại đúng các service trước đó. Script
`scripts.apply_function_fixes --apply` chỉ cập nhật một tập function được chọn;
không thay thế việc nạp đủ `z_01` đến `z_07` hoặc khôi phục trigger.

Chỉ thay `.env` thì chạy lại `up -d` của service liên quan để recreate và nhận env mới;
`docker compose restart` không nạp env mới. Không xóa volume để cập nhật code.

## 7. Các nhóm tùy chọn

### D4 Insights: đọc Gold đã có

```bash
docker compose up -d minio minio-init hive-metastore trino
docker compose run --rm --no-deps trino-init
```

D4 Insights đọc MinIO Gold qua Trino; chỉ bật các service này không tự sinh dữ liệu
Gold. Các trang nghiệp vụ còn lại đọc PostgreSQL qua Banking API.

### Batch ETL

```bash
docker compose up -d minio minio-init spark-master spark-worker postgres-airflow airflow-init trino trino-init
docker compose up -d airflow-webserver airflow-scheduler
docker compose exec airflow-webserver airflow dags unpause banking_bronze_silver_gold
```

DAG chạy lúc 01:00 giờ Việt Nam. Chạy ngay một lượt riêng:

```bash
docker compose exec airflow-webserver airflow dags trigger banking_bronze_silver_gold
```

Luồng: PostgreSQL → Bronze → Silver/Quarantine → kiểm tra DQ → Gold → publish Trino.
Retry dùng đường dẫn theo batch; không đưa dữ liệu Quarantine lên Gold.

### Stream liên tục

```bash
docker compose --profile realtime up -d kafka1 kafka2 kafka3 kafka-init outbox-publisher bronze-consumer
docker compose exec bronze-consumer python -m scripts.audit_stream
```

Luồng: giao dịch commit → outbox → Kafka → Bronze. Consumer chỉ commit offset sau
khi lưu bền vững. Stream không thay PostgreSQL làm nguồn cho các trang giao dịch.
Nếu Kafka lỗi `cluster.id`, giữ ID của cụm và volume đang dùng; không format lại volume.

## 8. Kiểm tra và xử lý lỗi

```bash
docker compose --profile web ps
docker compose logs --tail 100 banking-api web gateway notification-sender
curl -f http://127.0.0.1:8000/api/v1/health
```

URL dịch vụ mặc định trên host: API `8000`, web gateway `80/443`, MinIO Console
`9001`, Trino `8084`, Airflow `8081`. Các dashboard nội bộ trên EC2 nên truy cập qua
SSH tunnel. `python -m scripts.healthcheck` kiểm tra cả hệ thống dữ liệu và có thể
báo thiếu Spark/Airflow/Kafka ngay cả khi nhóm web hoạt động bình thường.

| Lỗi | Kiểm tra/cách xử lý |
| --- | --- |
| API/model unhealthy | Kiểm tra bảng `model_version` có ACTIVE khớp hash artifact; chạy đăng ký ở bước 3 khi cần |
| Web không tải danh sách | Kiểm tra view `z_02`, query `z_06` và quyền runtime; không tạo lại bảng |
| Tạo khách hàng xong nhân viên không thấy | Kiểm tra `trg_audit_customer` ở bước 3; thiếu thì khôi phục từ `z_03` khi đã dừng ghi. Hồ sơ cũ thiếu audit cần xác minh người tạo, không tự gán quyền |
| Trùng khóa chính sau nhập seed | Trong DBeaver chỉ chạy khối `DO $sync_seed_identities$` cuối `examble_data.sql` khi dừng ghi; không chạy lại INSERT |
| Không nhận OTP | Kiểm tra cấu hình Brevo/sender và trạng thái delivery của provider; accepted không đồng nghĩa đã vào hộp thư |
| Chưa trả được khoản vay | Đặt `LOAN_SETTLEMENT_ACCOUNT_ID` là tài khoản INTERNAL VND đang hoạt động dùng để thu nợ, rồi recreate API |
| DB mới chưa đăng nhập được | Tạo bảng thôi chưa có người dùng; khôi phục backup hoặc chuẩn bị dữ liệu hợp lệ |
| Máy treo/chậm khi bật toàn bộ | Kiểm tra RAM/swap và dừng nhóm dữ liệu không dùng; không reset DB/volume |

Các lệnh kiểm thử code, không thay thế kiểm tra triển khai thực tế:

```bash
.venv/bin/python -m pip install pytest
.venv/bin/python -m pytest -q tests/test_compose_environment.py tests/test_web_deployment.py
cd backend
npm ci
npm run test:web
cd ../web
npm ci
npm run typecheck
npm run test:web
cd ..
```

Trong thư mục `web`, browser tests cần Playwright và web đang chạy: `npm run test:products`,
`npm run test:responsive`, `npm run test:otp`. Các bài này giả lập API để không
thực hiện nghiệp vụ trên DB thật. Test tích hợp DB chỉ dùng database kiểm thử riêng.

Muốn đổi mật khẩu đăng nhập hàng loạt, chạy riêng trong terminal:

```bash
.venv/bin/python -m scripts.reset_login_passwords --apply
```

Nhập mật khẩu mới hai lần; script chỉ cập nhật hash đăng nhập, không thay số dư
hoặc PIN. Không cần đổi mật khẩu mỗi lần bật container. Không dùng
`docker compose down -v`, xóa schema hoặc reset volume để chữa lỗi web.
