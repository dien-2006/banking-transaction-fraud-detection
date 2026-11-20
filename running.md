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
| 2 | `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;` | Chạy riêng để chuẩn bị hash mật khẩu |
| 3 — tùy chọn | [sql/examble_data.sql](sql/examble_data.sql) | Nạp dữ liệu mẫu trước foundation để tránh trùng ID danh mục/model |
| 4 | [sql/z_01_foundation.sql](sql/z_01_foundation.sql) | Schema API và các hàm nền |
| 5 | [sql/z_02_views.sql](sql/z_02_views.sql) | View đọc dữ liệu |
| 6 | [sql/z_03_integrity.sql](sql/z_03_integrity.sql) | Audit và kiểm tra tính toàn vẹn |
| 7 | [sql/z_04_financial_operations.sql](sql/z_04_financial_operations.sql) | Giao dịch, risk và xử lý tài chính |
| 8 | [sql/z_05_management_operations.sql](sql/z_05_management_operations.sql) | Tạo/cập nhật hồ sơ, tài khoản, thẻ, khoản vay |
| 9 | [sql/z_06_api_queries.sql](sql/z_06_api_queries.sql) | Truy vấn phục vụ API/web |
| 10 | [sql/z_07_outbox_and_indexes.sql](sql/z_07_outbox_and_indexes.sql) | Outbox và index theo thiết kế có sẵn |

`z_01` tự thêm danh mục giao dịch và model bootstrap. Vì vậy không chạy `z_01`
trước bộ INSERT có ID cố định trong `examble_data.sql`. Thứ tự trên dành cho DB
trống; nếu đã chạy một phần và gặp trùng ID, dừng script, kiểm tra dữ liệu đã commit
trước khi quyết định chạy tiếp. Không bỏ qua lỗi hoặc chạy lại toàn bộ INSERT.
Nên tắt Auto-commit khi nạp seed, Commit một lần sau khi cả file thành công và
Rollback nếu có lỗi.

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

### Cập nhật chức năng thêm chi nhánh tự cấp mã

Form quản trị thêm chi nhánh không nhập mã. Mã `CN...` được cấp trong function
`banking_api.create_branch` từ identity `branchid` hiện có; giữ nguyên các mã cũ.
Tên chi nhánh, tỉnh/thành phố, địa chỉ và ngày bắt đầu hoạt động là bắt buộc;
điện thoại có thể để trống. Ngày mặc định hôm nay, có thể chọn lại.

Khi nâng cấp DB đã có trên EC2:

1. Push/pull code mới. Trong DBeaver kết nối đúng DB EC2, chạy **riêng toàn bộ khối**
   `CREATE OR REPLACE FUNCTION banking_api.create_branch ... $$;` ở đầu
   `sql/z_05_management_operations.sql`. Commit nếu tắt Auto-commit.
2. Build và recreate API/web:

```bash
docker compose --profile web build banking-api web
docker compose --profile web up -d --no-deps banking-api web
```

Không chạy lại `create_table.sql` hay dữ liệu INSERT. Không đổi bảng, cột hoặc constraint.
Nếu DB chưa cập nhật function, API trả lỗi cấu hình cấp mã thay vì yêu cầu người dùng nhập mã.
Mã có thể có khoảng trống khi một lần lưu thất bại; không reset sequence để lấp khoảng trống.

Kiểm thử browser: `cd web && npm run test:branch-create` với `WEB_AUDIT_URL` trỏ tới web thử nghiệm.
Script dùng API mô phỏng, không tạo chi nhánh trong DB thật.

### Cập nhật chức năng thêm nhân viên tự cấp mã

Form admin thêm nhân viên tự cấp mã `EMP...` từ identity `employeeid` hiện có,
giữ nguyên các mã nhân viên cũ. Các trường bắt buộc: họ tên, chi nhánh, vai trò,
điện thoại, email, ngày vào làm và lương (VND). Giới tính/ngày sinh có thể bỏ trống;
lương có thể bằng 0. Chi nhánh và vai trò lấy từ DB, phải còn hoạt động khi lưu.
Điện thoại/email không được trùng nhân viên khác. Đây là thao tác tạo hồ sơ,
chưa tạo `system_user`, tên đăng nhập hay mật khẩu.

Khi nâng cấp DB đang có trên EC2, sau khi push/pull code mới:

1. Trong DBeaver, kết nối đúng DB EC2, chạy **riêng toàn bộ khối**
   `CREATE OR REPLACE FUNCTION banking_api.create_employee ... $$;` trong
   `sql/z_05_management_operations.sql`. Commit nếu tắt Auto-commit.
2. Nếu chưa áp dụng thay đổi chi nhánh ở mục trước, chạy riêng khối `create_branch` nữa.
   Không chạy lại bảng hoặc dữ liệu INSERT.
3. Build và recreate API/web:

```bash
docker compose --profile web build banking-api web
docker compose --profile web up -d --no-deps banking-api web
```

Không đổi bảng, cột, PK/FK hay constraint. Khi function chưa được cập nhật,
API báo lỗi cấu hình cấp mã nhân viên. Không reset sequence để lấp khoảng trống mã.
Kiểm thử browser: `cd web && npm run test:employee-create` với `WEB_AUDIT_URL`
trỏ tới web thử nghiệm; script mô phỏng API, không sửa DB hoặc cấp đăng nhập thật.

### Cập nhật giải ngân và thanh toán khoản vay

Khi nâng cấp DB đang có dữ liệu, tạm dừng thao tác duyệt vay/review trong lúc cập nhật:

1. Pull bản code mới. Trong DBeaver, đúng DB EC2, mở một transaction (`BEGIN;`),
   chạy toàn bộ định nghĩa function trong `sql/z_04_financial_operations.sql`,
   sau đó chạy riêng toàn bộ khối `CREATE OR REPLACE FUNCTION banking_api.approve_loan ... $$;`
   trong `sql/z_05_management_operations.sql`, rồi `COMMIT;`. Nếu có lỗi, `ROLLBACK;`
   và kiểm tra lỗi trước khi tiếp tục. Không chạy lại `create_table.sql` hoặc INSERT dữ liệu.
2. Không cần thêm ID tài khoản giải ngân/thu nợ vào `.env`. Khách hàng nhận tiền
   và trả nợ bằng tài khoản ngân hàng của mình trên web; đối ứng ngân hàng được backend
   tự xử lý từ dữ liệu DB hiện có. Hệ thống không tự tạo tài khoản hoặc số dư.
3. Build và recreate API/web:

```bash
docker compose --profile web build banking-api web
docker compose --profile web up -d --no-deps banking-api web
```

4. Nhân viên/admin vào Khoản vay → Xử lý → chọn tài khoản nhận của khách hàng →
   nhập lý do → **Xác nhận duyệt và giải ngân**. Chỉ kết quả `Success` mới cộng tiền
   vào tài khoản nhận và tạo lịch trả nợ. `Pending/REVIEW` xử lý tiếp tại Fraud & Review;
   `BLOCK` hoặc thiếu tiền không ghi có. Nếu lỗi mạng, thử lại **đúng lệnh** hiện tại.
5. Khách hàng xem chứng từ giải ngân và phần trả nợ trong chi tiết khoản vay.
   Khoản vay cũ đang Active/Overdue vẫn trả nợ trực tuyến theo lịch hiện có;
   bản cập nhật không tự cộng tiền, sửa lịch cũ hoặc giải ngân lại khoản đã duyệt.

Kiểm thử tài chính riêng: tạo DB kiểm thử rỗng có tên `d4_loan_test_*`, nạp schema
và SQL theo thứ tự ở mục 2, rồi chạy test bằng URL DB loopback (không dùng DB thật):

```bash
cd backend
LOAN_DISBURSEMENT_TEST_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/d4_loan_test_NAME' node --test tests/loan-disbursement.test.cjs
```

### Cập nhật trạng thái giải ngân và email biến động tiền

Bản sửa giao diện này đọc trạng thái lệnh giải ngân và bút toán hiện có trong DB;
không thêm bảng/cột và không cần chạy lại SQL nếu đã cập nhật phần giải ngân ở trên.
Sau khi đưa code lên Git, trên EC2 chạy tại thư mục dự án:

```bash
git pull
docker compose --profile web build banking-api web
docker compose --profile web up -d --no-deps banking-api web notification-sender
```

Hồ sơ đã gửi giải ngân nhưng được Risk trả `REVIEW` hiển thị **Chờ thẩm định giải ngân**.
Nút **Thẩm định** mở đúng hồ sơ tại Fraud & Review; khoản vay chỉ chuyển sang đang
trả nợ sau khi hạch toán thành công. Danh sách tự kiểm tra lại mỗi 15 giây.
Email thành công ghi số tài khoản và số tiền **+ Ghi có / − Ghi nợ** theo bút toán
của khách hàng. Email giao dịch chờ xử lý/thất bại chỉ ghi số tiền yêu cầu, không
báo đã cộng/trừ. Không tự gửi lại các email đã đánh dấu gửi thành công.

### Cập nhật chức năng đăng ký khách hàng

Trang `/register` dùng Brevo (`BREVO_API_KEY`, `OTP_SENDER_EMAIL`, `OTP_SENDER_NAME`)
và Redis để xác minh email. Đăng ký thành công chỉ tạo hồ sơ + tài khoản đăng nhập;
khách hàng mở tài khoản ngân hàng riêng sau khi đăng nhập. Email đã có hồ sơ không
được tự nhận quyền truy cập từ form này.

Khi cập nhật từ phiên bản chưa có đăng ký:

1. Commit/push code rồi pull đúng bản trên EC2.
2. Khi đã tạm dừng các thao tác tạo tài khoản, dùng DBeaver chạy riêng khối
   `CREATE OR REPLACE FUNCTION banking_api.register_customer_online_account ... $$;`
   trong `sql/z_05_management_operations.sql`, Commit nếu tắt Auto-commit.
   Bản function mới chuẩn hóa tên đăng nhập và chặn trùng không phân biệt hoa/thường.
   Không chạy lại `create_table.sql`, INSERT hoặc đổi cấu trúc bảng.
3. Build và recreate API/web:

```bash
docker compose --profile web build banking-api web
docker compose --profile web up -d --no-deps banking-api web gateway
```

Compose đặt `TRUST_PROXY_HOPS=1` cho API sau Caddy, để giới hạn đăng ký theo IP
người truy cập. Khi chạy API trực tiếp ngoài Docker, mặc định không tin header proxy.
Nếu thay số lớp proxy cần xem lại cấu hình tin cậy trước khi triển khai.

Log API của bản mới có sự kiện `registration_otp_accepted`, kèm `challengeId` và
`messageId` để đối chiếu trong Brevo Transactional Logs. Không ghi OTP, địa chỉ
người nhận hoặc API key. Nếu provider từ chối, log chỉ ghi HTTP status và mã lỗi
đã lọc, không ghi nguyên nội dung lỗi có thể chứa thông tin nhạy cảm.

Kiểm thử đăng ký bằng email thử nghiệm: gửi mã, thử OTP sai/hết hạn, gửi lại mã,
tạo thành công rồi đăng nhập bằng tài khoản vừa tạo. Email accepted từ provider
chưa bảo đảm delivery; xem Spam và trạng thái provider khi không nhận được mã.

### Kích hoạt đăng nhập cho khách hàng đã có hồ sơ

Nhân viên thêm khách hàng và mở tài khoản ngân hàng không tự cấp mật khẩu đăng nhập.
Cung cấp mã khách hàng cho chính chủ và bảo đảm email trong hồ sơ là đúng email của khách hàng.
Tại trang đăng nhập, khách hàng chọn **Kích hoạt ngân hàng trực tuyến** (`/activate`),
nhập mã khách hàng (không phải số tài khoản), email đã đăng ký, tên đăng nhập và mật khẩu,
rồi xác nhận OTP email. Hồ sơ cần đang hoạt động, chưa có đăng nhập và email không dùng chung
với hồ sơ khác. Nếu thiếu/sai/trùng email, liên hệ chi nhánh đối soát trước; chức năng này
không đặt lại mật khẩu của đăng nhập đã tồn tại và không tạo hồ sơ khách hàng thứ hai.

API: `POST /api/v1/auth/activation/otp` và `POST /api/v1/auth/activation`.
Dùng cùng Redis/Brevo/`OTP_HASH_SECRET` đã cấu hình, không thêm biến môi trường hoặc bảng DB.
OTP kích hoạt tách biệt OTP đăng ký/chuyển tiền, có hiệu lực 5 phút, khóa sau 5 lần nhập sai,
gửi lại sau 60 giây. Vì bảo vệ thông tin hồ sơ, phản hồi gửi mã không xác nhận hồ sơ có tồn tại;
chỉ email đủ điều kiện mới được gửi mã. Log gửi được provider tiếp nhận có sự kiện
`activation_otp_accepted` với `challengeId`/`messageId`, không chứa OTP hoặc địa chỉ email.

Để triển khai phần kích hoạt lên EC2, push/pull bản code mới rồi chạy tại thư mục dự án:

```bash
docker compose --profile web build banking-api web
docker compose --profile web up -d --no-deps banking-api web
```

Không cần chạy lại SQL cho phần kích hoạt nếu DB đã có các function của bản đăng ký trước đó.
Kiểm thử browser tự động: `cd web && npm run test:activation` với `WEB_AUDIT_URL` trỏ tới web thử nghiệm;
script dùng API mô phỏng, không gửi email thật hoặc sửa DB.

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
| Không nhận OTP | Nếu đã hiện ô nhập mã, xem Brevo Transactional Logs: accepted chưa phải delivered. `sending platform ... disabled` cần xử lý trạng thái tài khoản với Brevo; `sender ... not valid` cần xác minh sender/domain khớp `OTP_SENDER_EMAIL`. Đổi `.env` phải recreate API |
| Chưa trả được khoản vay | Kiểm tra khoản vay/lịch trả nợ, số dư khả dụng của tài khoản khách hàng và log API; không cần cấu hình ID tài khoản thu nợ |
| DB mới chưa đăng nhập được | Tạo bảng thôi chưa có người dùng; khôi phục backup hoặc chuẩn bị dữ liệu hợp lệ |
| Hive báo không tạo được `metastore_db` trên volume mới | Cập nhật Compose và `docker/hive/start-metastore.sh`: init cấp quyền volume, wrapper dùng thư mục con `catalog` cho DB mới. Catalog cũ ở root vẫn được giữ nguyên; không xóa volume |
| Airflow Scheduler báo `Health check exceeded timeout (10s)` | Bản mới dùng health server nội bộ `127.0.0.1:8974/health` thay Airflow CLI. Cập nhật Compose, chờ task đang chạy hoàn tất rồi recreate riêng scheduler; HTTP 503 vẫn được coi là unhealthy |
| Máy treo/chậm khi bật toàn bộ | Kiểm tra RAM/swap và dừng nhóm dữ liệu không dùng; không reset DB/volume |

Sau khi cập nhật Compose và script Hive trên máy đích, khởi động lại riêng metastore:

```bash
docker compose stop hive-metastore
docker compose up -d --force-recreate hive-metastore
docker compose ps hive-metastore
docker compose logs --tail 80 hive-metastore
```

Không chỉ sửa quyền ghi trên volume rỗng rồi giữ URL Derby cũ: Derby không tạo
được database ngay tại thư mục mount đã tồn tại. Wrapper chọn thư mục con chưa
được tạo cho lần đầu và dùng lại catalog đã có cho lần sau. Nếu Hive vẫn lỗi,
kiểm tra log; không xóa metastore volume vì nó giữ thông tin catalog của Trino.

Sau khi đổi healthcheck Scheduler, chỉ recreate khi task batch đang chạy đã hoàn tất
để tránh ngắt Spark driver của LocalExecutor:

```bash
docker compose up -d --no-deps --force-recreate airflow-scheduler
docker compose ps airflow-scheduler
docker inspect airflow-scheduler --format '{{json .State.Health}}'
```

Scheduler có thời gian khởi động 60 giây trước khi tính lỗi healthcheck. Endpoint
này kiểm tra heartbeat của chính scheduler và không được publish ra host. Nếu vẫn
unhealthy, xem log healthcheck và RAM/CPU; không tăng parallelism hoặc bỏ kiểm tra
heartbeat để che tình trạng thiếu tài nguyên.

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

### Bản sửa backend: nghiệp vụ nhân viên và trả vay không chạy Risk/ML

Bản này dùng lại các function Banking Core có sẵn; không cần chạy SQL mới trong DBeaver hoặc `scripts.apply_function_fixes`. Các file SQL được giữ ở bản trước thay đổi `1e92edf7`. Sau khi code mới đã được commit/push theo yêu cầu và pull đúng nhánh trên EC2:

```bash
docker compose --profile web build banking-api web
docker compose --profile web up -d --no-deps banking-api web
docker compose logs --tail 100 banking-api
```

Backend ghi dấu cho phép nghiệp vụ vào các bảng hiện có, không tạo điểm dự đoán ML. Nhân viên/admin và trả vay online được miễn Risk/ML; chuyển tiền thông thường của khách hàng vẫn qua Risk/ML. Giải ngân/thu nợ chỉ hoàn tất khi core hạch toán thành công; lệnh cũ đang REVIEW cần được người có quyền xác nhận, không được tự động cộng tiền khi chỉ đọc danh sách. Không chạy lại schema/seed hoặc xóa volume.
