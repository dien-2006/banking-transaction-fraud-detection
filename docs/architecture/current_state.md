# Current State Discovery — Automated ETL

> Historical audit trước đợt implementation end-to-end. Các nhận định “chưa có code/service” bên dưới mô tả thời điểm audit, không phải trạng thái hiện tại. Trạng thái chạy và hướng dẫn hiện hành nằm trong `README.md`.

Ngày kiểm tra: 2026-09-28 (UTC)

Phạm vi: TASK 01 — discovery; không triển khai ETL, không sửa schema và không thay đổi dữ liệu/container.

## 1. Kết luận nhanh

Repository hiện có PostgreSQL DDL đầy đủ cho schema `banking` gồm 29 bảng và một Docker Compose có PostgreSQL, MinIO, Airflow, Kafka. Runtime được kiểm tra read-only cho thấy PostgreSQL, MinIO và Airflow đang chạy; tuy nhiên chưa có pipeline ETL tự động theo kiến trúc đã chốt:

- PostgreSQL 17.11 đang healthy; schema runtime có đủ 29 bảng và khớp inventory trong `sql/create_table.sql` ở mức bảng, cột, kiểu, nullability, PK/FK/UNIQUE/CHECK/default/index đã đối chiếu.
- MinIO đang live nhưng volume chỉ có metadata `.minio.sys`; chưa có bucket Bronze, Silver hoặc Quarantine.
- Airflow webserver, scheduler và metadata database đang chạy, nhưng `airflow dags list` trả về `No data found`; không có DAG hay schedule ETL.
- Không có Spark service/image/job source, `spark-submit`, PySpark, PostgreSQL JDBC JAR hoặc Spark provider trong runtime Airflow.
- Không có Trino. Đây phù hợp với việc Trino thuộc future architecture.
- Kafka có trong Compose nhưng cả ba broker đang restart-loop. Kafka không thuộc initial historical batch của target hiện tại.
- Không có source code ETL hoặc test source có thể chạy. Chỉ còn các file `.pyc` bị ignore, cho thấy dấu vết của một pipeline Kafka/snapshot cũ nhưng không phải source có thể duy trì hoặc kiểm chứng.
- `requirements.txt` và `README.md` rỗng. `database/init`, `airflow/dags`, `src`, `tests` đều rỗng ngoài cache/bytecode bị ignore.

Vì vậy khoảng cách thực tế là: source OLTP đã tồn tại và có dữ liệu; orchestration shell/storage service tồn tại; toàn bộ Spark ETL, Bronze/Silver/Quarantine, DQ, state/watermark, run summary và automated DAG còn thiếu.

## 2. Phương pháp và source of truth

Ưu tiên dùng:

1. Kiến trúc mới trong Master Prompt hiện tại.
2. DDL thực tế `sql/create_table.sql`.
3. Metadata read-only từ PostgreSQL container đang chạy.
4. File/config/runtime khác trong repository.

Điểm lệch tài liệu:

- `AGENTS.md` đang là file rỗng; hướng dẫn 634 dòng thực tế nằm trong `AGENT.md` và tự nhận là `AGENTS.md`.
- `AGENT.md` nói source là `create_table.txt`, nhưng repository chỉ có `sql/create_table.sql`.
- `README.md` hiện rỗng.
- `docs/gold-data-model.md` mô tả Gold cũ 14 dimension/6 fact, mâu thuẫn với future architecture mới (10 dimension/6 fact). Tài liệu này không phải source of truth cho ETL hiện tại.

Không có thao tác ghi nào lên PostgreSQL/MinIO/Airflow trong discovery. Dữ liệu runtime chỉ được đọc để xác minh.

## 3. Inventory repository

### 3.1 Source/config được track

| Path | Nội dung hiện tại |
|---|---|
| `sql/create_table.sql` | DDL schema `banking`, 29 bảng, 2 partial unique index và 22 index thường/partial phục vụ truy vấn |
| `docker-compose.yaml` | 10 service: PostgreSQL OLTP, 3 Kafka, Kafka UI, MinIO, PostgreSQL Airflow, Airflow init/webserver/scheduler |
| `.env.example` | Biến cho PostgreSQL, Kafka, MinIO, Airflow; có bucket Bronze/Silver và future Gold/ML |
| `.env` | File local bị ignore; tên biến gần giống `.env.example`, thêm `AIRFLOW_UID`; không ghi giá trị secret vào tài liệu này |
| `AGENT.md` | Hướng dẫn kiến trúc cũ/một phần còn hữu ích, nhưng cần đồng bộ kiến trúc mới |
| `AGENTS.md` | Rỗng |
| `README.md` | Rỗng |
| `requirements.txt` | Rỗng |
| `docs/python-environment.md` | Mô tả environment cũ; tham chiếu `environment.yml` không tồn tại và nói PySpark chưa được chọn |
| `docs/gold-data-model.md` | Tài liệu Gold cũ; future-only và đang lệch mô hình Gold mới |
| `common/__init__.py`, `config/__init__.py`, `scripts/__init__.py`, `spark/__init__.py`, `kafka/__init__.py` | Package placeholder rỗng |
| `kafka/producer.py` | Rỗng |
| `images/*` | 10 ảnh UI/sơ đồ, ngoài phạm vi ETL hiện tại |
| `airflow/logs/*` | Log runtime từng bị track; hai entry đang ở trạng thái deleted trong worktree trước TASK 01 |

Các directory runtime/scaffold `airflow/dags`, `airflow/include`, `airflow/plugins`, `database/init`, `pipeline_control` và `src` hiện rỗng. `ingestion/*`, `spark/bronze_to_silver` và `tests` chỉ có cache/bytecode bị ignore như mô tả dưới đây.

### 3.2 Dấu vết không phải source implementation

Các thư mục `ingestion`, `spark/bronze_to_silver`, `tests`, `common` và `scripts` chứa `.pyc` bị ignore nhưng thiếu `.py` tương ứng. String metadata cho thấy pipeline cũ từng có:

- initial snapshot PostgreSQL → Bronze;
- Kafka topic/outbox publisher/snapshot diff/bronze consumer;
- một job Bronze → Silver;
- contract/catalog và các test initial load/incremental/Silver.

Các artifact này không đủ điều kiện để coi là `IMPLEMENTED` hoặc `TESTED`: bytecode không phải source, một phần là Python 3.11 và một phần Python 3.12, config/catalog được tham chiếu không còn tồn tại, và container cũ hiện lỗi module-not-found. `.pytest_cache` chỉ lưu tên 31 test từ lần chạy trước, không có test source.

## 4. PostgreSQL schema thực tế

### 4.1 Xác minh runtime

- Container: `bank-postgres`, image `postgres:17`, trạng thái healthy.
- PostgreSQL runtime: 17.11; database thực tế lấy từ `.env` local, schema nghiệp vụ `banking`.
- Có đúng 29 base table trong `banking`.
- Database đang có dữ liệu ở tất cả 29 bảng. Row count quan sát read-only:

| Table | Rows | Table | Rows |
|---|---:|---|---:|
| account_holder | 1,800 | account_status_history | 1,900 |
| account_type | 4 | audit_log | 350 |
| bank_account | 1,800 | bank_transaction | 3,500 |
| branch | 20 | card | 1,100 |
| customer | 1,500 | customer_device | 1,700 |
| customer_online_account | 1,250 | employee | 80 |
| event_outbox | 250 | fraud_label_event | 1,500 |
| loan | 120 | loan_payment | 120 |
| loan_type | 4 | login_event | 2,000 |
| model_version | 3 | notification_outbox | 350 |
| repayment_schedule | 720 | review_case | 150 |
| risk_assessment | 1,500 | role | 5 |
| system_user | 60 | terminal | 100 |
| transaction_posting | 6,160 | transaction_type | 6 |
| transfer_request | 1,500 |  |  |

`database/init` đang rỗng và `sql/create_table.sql` không được mount vào `/docker-entrypoint-initdb.d`. Schema runtime tồn tại nhờ named volume hiện hữu; một deployment sạch hiện không tự tạo 29 bảng.

### 4.2 Ký hiệu inventory

- `!`: `NOT NULL`; `?`: nullable.
- `IDENTITY`: `GENERATED BY DEFAULT AS IDENTITY`.
- Giá trị sau `=` là `DEFAULT`.
- Mỗi table đều nêu PK, FK, UNIQUE và CHECK. Index hiệu năng được tổng hợp ở mục 4.4.
- Tất cả timestamp trong source là `timestamp without time zone`; không có `timestamptz`.

### 4.3 Inventory 29 tables

#### 1. `branch`

- Columns: `branchid integer ! IDENTITY`; `branchcode varchar(20) !`; `branchname varchar(150) !`; `address varchar(255) !`; `city varchar(100) !`; `phone varchar(20) ?`; `opendate date !`; `status varchar(20) ! = 'Active'`; `createdat timestamp ! = CURRENT_TIMESTAMP`.
- PK: `branchid`. UNIQUE: `branchcode`.
- CHECK: `status IN ('Active','Inactive')`.

#### 2. `role`

- Columns: `roleid integer ! IDENTITY`; `rolename varchar(100) !`; `description varchar(255) ?`; `status varchar(20) ! = 'Active'`.
- PK: `roleid`. UNIQUE: `rolename`.
- CHECK: `status IN ('Active','Inactive')`.

#### 3. `employee`

- Columns: `employeeid integer ! IDENTITY`; `employeecode varchar(20) !`; `branchid integer !`; `roleid integer !`; `fullname varchar(150) !`; `gender varchar(10) ?`; `dateofbirth date ?`; `phone varchar(20) !`; `email varchar(150) !`; `hiredate date !`; `salary numeric(19,2) !`; `status varchar(20) ! = 'Active'`.
- PK: `employeeid`. UNIQUE: `employeecode`, `phone`, `email`.
- FK: `branchid → branch.branchid`; `roleid → role.roleid`.
- CHECK: gender nullable hoặc `Male/Female/Other/Unknown`; `salary >= 0`; status `Active/Inactive`.

#### 4. `system_user`

- Columns: `userid integer ! IDENTITY`; `employeeid integer !`; `username varchar(100) !`; `passwordhash varchar(255) !`; `lastlogin timestamp ?`; `isactive boolean ! = true`; `createdat timestamp ! = CURRENT_TIMESTAMP`.
- PK: `userid`. UNIQUE: `employeeid`, `username`.
- FK: `employeeid → employee.employeeid`.
- CHECK: `lastlogin IS NULL OR lastlogin >= createdat`.

#### 5. `customer`

- Columns: `customerid bigint ! IDENTITY`; `customercode varchar(20) !`; `fullname varchar(150) !`; `gender varchar(10) ?`; `dateofbirth date ?`; `nationalid varchar(30) ?`; `phone varchar(20) ?`; `email varchar(150) ?`; `address varchar(255) ?`; `occupation varchar(100) ?`; `customertype varchar(30) ?`; `createddate timestamp ! = CURRENT_TIMESTAMP`; `status varchar(20) ! = 'Active'`; `customersegment varchar(30) ?`.
- PK: `customerid`. UNIQUE: `customercode`, `nationalid` (PostgreSQL vẫn cho nhiều `NULL`).
- CHECK: gender nullable hoặc `Male/Female/Other/Unknown`; status `Active/Inactive/Blocked`.

#### 6. `customer_online_account`

- Columns: `onlineaccountid bigint ! IDENTITY`; `customerid bigint !`; `username varchar(100) !`; `passwordhash varchar(255) !`; `registereddate timestamp ! = CURRENT_TIMESTAMP`; `lastlogin timestamp ?`; `isactive boolean ! = true`.
- PK: `onlineaccountid`. UNIQUE: `customerid`, `username`.
- FK: `customerid → customer.customerid`.
- CHECK: `lastlogin IS NULL OR lastlogin >= registereddate`.

#### 7. `customer_device`

- Columns: `deviceid bigint ! IDENTITY`; `customerid bigint !`; `devicecode varchar(100) !`; `devicetype varchar(30) !`; `devicename varchar(100) ?`; `operatingsystem varchar(80) ?`; `firstseenat timestamp ! = CURRENT_TIMESTAMP`; `lastseenat timestamp ?`; `istrusted boolean ! = false`; `status varchar(20) ! = 'Active'`.
- PK: `deviceid`. UNIQUE: `devicecode`; composite `(customerid, deviceid)` để làm target cho composite FK.
- FK: `customerid → customer.customerid`.
- CHECK: device type `Mobile/Tablet/Desktop/Other`; status `Active/Blocked/Removed`; `lastseenat` null hoặc không trước `firstseenat`.

#### 8. `login_event`

- Columns: `logineventid bigint ! IDENTITY`; `customerid bigint !`; `deviceid bigint ?`; `logintime timestamp ! = CURRENT_TIMESTAMP`; `ipaddress varchar(45) ?`; `status varchar(20) !`; `failurereason varchar(255) ?`.
- PK: `logineventid`.
- FK: `customerid → customer.customerid`; `(customerid, deviceid) → customer_device(customerid, deviceid)`.
- CHECK: status `Success/Failed/Blocked`; Success yêu cầu `failurereason IS NULL`, Failed/Blocked yêu cầu reason khác null.

#### 9. `account_type`

- Columns: `accounttypeid integer ! IDENTITY`; `typename varchar(100) !`; `minbalance numeric(19,2) ! = 0`; `interestrate numeric(8,4) ! = 0`; `description varchar(255) ?`; `status varchar(20) ! = 'Active'`.
- PK: `accounttypeid`. UNIQUE: `typename`.
- CHECK: `minbalance >= 0`; `interestrate >= 0`; status `Active/Inactive`.

#### 10. `bank_account`

- Columns: `accountid bigint ! IDENTITY`; `accountnumber varchar(30) !`; `branchid integer !`; `accounttypeid integer !`; `opendate date !`; `balance numeric(19,2) ! = 0`; `currency char(3) ! = 'VND'`; `status varchar(20) ! = 'Active'`; `createdat timestamp ! = CURRENT_TIMESTAMP`; `updatedat timestamp ?`; `accountcategory varchar(20) !`.
- PK: `accountid`. UNIQUE: `accountnumber`.
- FK: `branchid → branch.branchid`; `accounttypeid → account_type.accounttypeid`.
- CHECK: currency chỉ `VND`; status `Active/Frozen/Closed`; category `CUSTOMER/INTERNAL`; `updatedat` null hoặc không trước `createdat`.

#### 11. `account_holder`

- Columns: `accountholderid bigint ! IDENTITY`; `accountid bigint !`; `customerid bigint !`; `holdertype varchar(30) !`; `startdate date !`; `enddate date ?`; `status varchar(20) ! = 'Active'`.
- PK: `accountholderid`.
- FK: `accountid → bank_account.accountid`; `customerid → customer.customerid`.
- Partial UNIQUE: `(accountid, customerid) WHERE status='Active'`; `accountid WHERE status='Active' AND holdertype='PRIMARY_OWNER'`.
- CHECK: holder type `PRIMARY_OWNER/JOINT_OWNER/AUTHORIZED_USER`; status `Active/Inactive`; Active phải không có `enddate`, Inactive phải có `enddate >= startdate`.

#### 12. `account_status_history`

- Columns: `historyid bigint ! IDENTITY`; `accountid bigint !`; `oldstatus varchar(20) ?`; `newstatus varchar(20) !`; `changeddate timestamp ! = CURRENT_TIMESTAMP`; `changedbytype varchar(20) !`; `employeeid integer ?`; `reason varchar(255) ?`.
- PK: `historyid`.
- FK: `accountid → bank_account.accountid`; `employeeid → employee.employeeid`.
- CHECK: old status nullable hoặc `Active/Frozen/Closed`; new status `Active/Frozen/Closed`; actor `Employee/System`.

#### 13. `card`

- Columns: `cardid bigint ! IDENTITY`; `cardnumber varchar(30) !`; `accountid bigint !`; `issuedate date !`; `expirydate date !`; `cardtype varchar(30) !`; `pinhash varchar(255) !`; `status varchar(20) ! = 'Active'`; `dailylimit numeric(19,2) !`; `customerid bigint !`.
- PK: `cardid`. UNIQUE: `cardnumber`.
- FK: `accountid → bank_account.accountid`; `customerid → customer.customerid`.
- CHECK: `expirydate > issuedate`; `dailylimit > 0`; status `Active/Blocked/Expired/Closed`.

#### 14. `transaction_type`

- Columns: `transactiontypeid integer ! IDENTITY`; `typecode varchar(30) !`; `typename varchar(100) !`; `description varchar(255) ?`; `status varchar(20) ! = 'Active'`.
- PK: `transactiontypeid`. UNIQUE: `typecode`, `typename`.
- CHECK: code `TRANSFER/DEPOSIT/WITHDRAWAL/LOAN_PAYMENT/OPENING_BALANCE/REVERSAL`; status `Active/Inactive`.

#### 15. `terminal`

- Columns: `terminalid bigint ! IDENTITY`; `terminalcode varchar(40) !`; `branchid integer ?`; `terminaltype varchar(20) !`; `locationname varchar(150) ?`; `address varchar(255) ?`; `status varchar(20) ! = 'Active'`.
- PK: `terminalid`. UNIQUE: `terminalcode`.
- FK: `branchid → branch.branchid`.
- CHECK: type `ATM/POS/COUNTER`; status `Active/Inactive/Maintenance`.

#### 16. `bank_transaction`

- Columns: `transactionid bigint ! IDENTITY`; `transactioncode varchar(40) !`; `transactiontypeid integer !`; `employeeid integer ?`; `terminalid bigint ?`; `deviceid bigint ?`; `channel varchar(30) !`; `amount numeric(19,2) !`; `fee numeric(19,2) ! = 0`; `currency char(3) ! = 'VND'`; `transactiondate timestamp ! = CURRENT_TIMESTAMP`; `ipaddress varchar(45) ?`; `latitude numeric(9,6) ?`; `longitude numeric(9,6) ?`; `description varchar(255) ?`; `status varchar(20) !`; `initiatedbycustomerid bigint ?`; `cardid bigint ?`; `originaltransactionid bigint ?`.
- PK: `transactionid`. UNIQUE: `transactioncode`.
- FK: transaction type, employee, terminal, initiated customer, card; self-FK `originaltransactionid → transactionid`; composite `(initiatedbycustomerid, deviceid) → customer_device(customerid, deviceid)`.
- CHECK: channel `Counter/ATM/POS/MobileBanking/InternetBanking/System`; `amount > 0`; `fee >= 0`; currency `VND`; status `Pending/Success/Failed/Cancelled`; latitude `[-90,90]`; longitude `[-180,180]`.

#### 17. `transfer_request`

- Columns: `transferrequestid bigint ! IDENTITY`; `transactionid bigint !`; `customerid bigint !`; `sourceaccountid bigint !`; `destinationaccountid bigint !`; `idempotencykey varchar(100) !`; `amount numeric(19,2) !`; `currency char(3) ! = 'VND'`; `requestedat timestamp ! = CURRENT_TIMESTAMP`; `status varchar(20) !`.
- PK: `transferrequestid`. UNIQUE: `transactionid`, `idempotencykey`.
- FK: transaction; customer; source account và destination account đều tới `bank_account.accountid`.
- CHECK: source khác destination; `amount > 0`; currency `VND`; status `Pending/Approved/Rejected/Completed/Failed/Cancelled`.

#### 18. `transaction_posting`

- Columns: `postingid bigint ! IDENTITY`; `transactionid bigint !`; `accountid bigint !`; `postingtype varchar(10) !`; `amount numeric(19,2) !`; `postingdate timestamp ! = CURRENT_TIMESTAMP`; `description varchar(255) ?`.
- PK: `postingid`.
- FK: `transactionid → bank_transaction.transactionid`; `accountid → bank_account.accountid`.
- CHECK: posting type `DEBIT/CREDIT`; `amount > 0`.

#### 19. `loan_type`

- Columns: `loantypeid integer ! IDENTITY`; `loantypename varchar(100) !`; `maxamount numeric(19,2) !`; `defaultinterestrate numeric(8,4) !`; `maxtermmonths integer !`; `description varchar(255) ?`; `status varchar(20) ! = 'Active'`.
- PK: `loantypeid`. UNIQUE: `loantypename`.
- CHECK: `maxamount > 0`; default interest `>= 0`; max term `> 0`; status `Active/Inactive`.

#### 20. `loan`

- Columns: `loanid bigint ! IDENTITY`; `loancode varchar(30) !`; `customerid bigint !`; `branchid integer !`; `employeeid integer !`; `loantypeid integer !`; `principalamount numeric(19,2) !`; `interestrate numeric(8,4) !`; `termmonths integer !`; `startdate date !`; `enddate date !`; `status varchar(20) !`.
- PK: `loanid`. UNIQUE: `loancode`.
- FK: customer, branch, employee, loan type.
- CHECK: principal `> 0`; interest `>= 0`; term `> 0`; end không trước start; status `Pending/Active/Paid/Overdue/Cancelled`.

#### 21. `repayment_schedule`

- Columns: `scheduleid bigint ! IDENTITY`; `loanid bigint !`; `installmentno integer !`; `duedate date !`; `principaldue numeric(19,2) !`; `interestdue numeric(19,2) !`; `penaltydue numeric(19,2) ! = 0`; `status varchar(20) !`.
- PK: `scheduleid`. UNIQUE: `(loanid, scheduleid)`, `(loanid, installmentno)`.
- FK: `loanid → loan.loanid`.
- CHECK: installment `> 0`; principal/interest/penalty `>= 0`; status `Pending/Partial/Paid/Overdue`.

#### 22. `loan_payment`

- Columns: `loanpaymentid bigint ! IDENTITY`; `loanid bigint !`; `scheduleid bigint ?`; `paymentdate timestamp ! = CURRENT_TIMESTAMP`; `amountpaid numeric(19,2) !`; `principalpaid numeric(19,2) !`; `interestpaid numeric(19,2) !`; `penaltyfee numeric(19,2) ! = 0`; `paymentchannel varchar(30) !`; `employeeid integer ?`; `note varchar(255) ?`; `transactionid bigint !`.
- PK: `loanpaymentid`. UNIQUE: `transactionid`.
- FK: loan; composite `(loanid, scheduleid) → repayment_schedule(loanid, scheduleid)`; employee; transaction.
- CHECK: amount `> 0`; components `>= 0`; `amountpaid = principalpaid + interestpaid + penaltyfee`; channel `Counter/Account/Online`; Counter yêu cầu employee, Account/Online yêu cầu employee null.

#### 23. `model_version`

- Columns: `modelversionid bigint ! IDENTITY`; `modelname varchar(100) !`; `modeltype varchar(50) !`; `status varchar(20) !`; `createdat timestamp ! = CURRENT_TIMESTAMP`; `description varchar(255) ?`.
- PK: `modelversionid`.
- CHECK: status `CANDIDATE/ACTIVE/RETIRED`.

#### 24. `risk_assessment`

- Columns: `riskassessmentid bigint ! IDENTITY`; `transactionid bigint !`; `modelversionid bigint !`; `riskscore numeric(8,6) !`; `decision varchar(20) !`; `reasonjson jsonb ?`; `assessedat timestamp ! = CURRENT_TIMESTAMP`.
- PK: `riskassessmentid`.
- FK: transaction; model version.
- CHECK: risk score trong `[0,1]`; decision `ALLOW/REVIEW/BLOCK`.

#### 25. `review_case`

- Columns: `reviewcaseid bigint ! IDENTITY`; `transactionid bigint !`; `status varchar(20) !`; `revieweruserid integer ?`; `createdat timestamp ! = CURRENT_TIMESTAMP`; `reviewedat timestamp ?`; `reason varchar(255) ?`.
- PK: `reviewcaseid`.
- FK: transaction; `revieweruserid → system_user.userid`.
- CHECK: status `OPEN/IN_REVIEW/APPROVED/REJECTED/CLOSED`; `reviewedat` null hoặc không trước `createdat`.

#### 26. `fraud_label_event`

- Columns: `fraudlabeleventid bigint ! IDENTITY`; `transactionid bigint !`; `label varchar(20) !`; `labeledat timestamp ! = CURRENT_TIMESTAMP`; `labelsource varchar(50) !`; `note varchar(255) ?`.
- PK: `fraudlabeleventid`.
- FK: transaction.
- CHECK: label `FRAUD/LEGITIMATE/UNKNOWN`.

#### 27. `event_outbox`

- Columns: `eventoutboxid bigint ! IDENTITY`; `eventkey varchar(100) !`; `aggregatetype varchar(50) !`; `aggregateid varchar(100) !`; `eventtype varchar(100) !`; `payloadjson jsonb !`; `createdat timestamp ! = CURRENT_TIMESTAMP`; `publishedat timestamp ?`; `status varchar(20) ! = 'PENDING'`.
- PK: `eventoutboxid`. UNIQUE: `eventkey`.
- CHECK: status `PENDING/PUBLISHED/FAILED`; `publishedat` null hoặc không trước `createdat`.

#### 28. `notification_outbox`

- Columns: `notificationoutboxid bigint ! IDENTITY`; `customerid bigint !`; `transactionid bigint ?`; `notificationtype varchar(50) !`; `status varchar(20) ! = 'PENDING'`; `createdat timestamp ! = CURRENT_TIMESTAMP`; `sentat timestamp ?`.
- PK: `notificationoutboxid`.
- FK: customer; transaction.
- CHECK: status `PENDING/SENT/FAILED`; `sentat` null hoặc không trước `createdat`.

#### 29. `audit_log`

- Columns: `auditid bigint ! IDENTITY`; `userid integer ?`; `entitytype varchar(50) !`; `entityid varchar(100) !`; `action varchar(30) !`; `oldvalue jsonb ?`; `newvalue jsonb ?`; `createdat timestamp ! = CURRENT_TIMESTAMP`; `ipaddress varchar(45) ?`.
- PK: `auditid`.
- FK: `userid → system_user.userid`.
- CHECK: action `INSERT/UPDATE/DELETE/STATUS_CHANGE`; INSERT cần new-only, DELETE cần old-only, UPDATE/STATUS_CHANGE cần cả old và new.

### 4.4 Indexes ngoài PK/UNIQUE constraint

- Quan hệ/lookup: `employee(branchid)`, `customer_device(customerid)`, `bank_account(branchid)`, `account_holder(customerid)`, `transaction_posting(transactionid)`, `transaction_posting(accountid)`, `loan(customerid)`, `repayment_schedule(loanid)`, `review_case(transactionid)`, `fraud_label_event(transactionid)`.
- Thời gian/trạng thái: `login_event(customerid, logintime)`, `bank_transaction(transactiondate)`, `bank_transaction(initiatedbycustomerid, transactiondate)`, `bank_transaction(status)`, `transfer_request(customerid, requestedat)`, `audit_log(createdat)`.
- Fraud/device/audit: `bank_transaction(deviceid)`, `risk_assessment(transactionid)`, `risk_assessment(riskscore)`, `audit_log(entitytype, entityid)`.
- Partial operational: `event_outbox(createdat) WHERE status='PENDING'`; `notification_outbox(createdat) WHERE status='PENDING'`.
- Hai partial unique index của `account_holder` đã nêu ở inventory.

## 5. Quan hệ giữa các table

Các quan hệ FK được nhóm như sau (mỗi mũi tên là child → parent):

```text
Tổ chức
employee → branch, role
system_user → employee
terminal → branch

Khách hàng và truy cập
customer_online_account → customer
customer_device → customer
login_event → customer, customer_device (composite customerid + deviceid)

Tài khoản và thẻ
bank_account → branch, account_type
account_holder → bank_account, customer
account_status_history → bank_account, employee
card → bank_account, customer

Giao dịch
bank_transaction → transaction_type, employee, terminal, customer, card,
                   customer_device (composite), bank_transaction (reversal/self)
transfer_request → bank_transaction, customer, bank_account (source), bank_account (destination)
transaction_posting → bank_transaction, bank_account

Khoản vay
loan → customer, branch, employee, loan_type
repayment_schedule → loan
loan_payment → loan, repayment_schedule (composite), employee, bank_transaction

Fraud/review/label
risk_assessment → bank_transaction, model_version
review_case → bank_transaction, system_user
fraud_label_event → bank_transaction

Operational/audit
notification_outbox → customer, bank_transaction
audit_log → system_user
event_outbox không có FK vật lý; aggregateid/payloadjson là liên kết logic
```

Các cardinality đáng chú ý:

- `customer ↔ bank_account` là many-to-many qua `account_holder`; partial unique index chỉ cho một primary owner active trên mỗi account.
- Một `bank_transaction` có thể có nhiều posting, risk assessment, review case và fraud label event.
- `transfer_request.transactionid` và `loan_payment.transactionid` là UNIQUE nên mỗi bảng có quan hệ tối đa một-một với transaction tương ứng.
- Một loan có nhiều installment và payment; payment có thể không gắn `scheduleid` vì cột này nullable.
- Self-FK của transaction biểu diễn reversal/original transaction.

## 6. Khả năng incremental từ schema hiện tại

### 6.1 Những gì schema hỗ trợ

- Mọi bảng đều có PK identity số nguyên/bigint. PK có thể làm high-watermark cho insert mới nếu chứng minh record chỉ append và transaction commit không làm bỏ sót ID.
- Các bảng mang tính event/history có cả ID và event time: `login_event`, `account_status_history`, `transaction_posting`, `loan_payment`, `risk_assessment`, `fraud_label_event`, `audit_log`, các outbox.
- `bank_account` là bảng duy nhất có cột tên `updatedat`, nhưng cột nullable, không default và DDL không có trigger buộc cập nhật.
- `event_outbox` có ID, `createdat`, `publishedat`, status và event key unique; phù hợp future realtime outbox, nhưng không có bằng chứng payload bao phủ mọi bảng/change cần cho historical ETL.

### 6.2 BLOCKED / SCHEMA GAP cho incremental đáng tin cậy

- Hầu hết bảng mutable không có `updated_at`, version/LSN hoặc delete marker. ID/timestamp tạo không phát hiện update/delete của record cũ.
- Các timestamp nghiệp vụ đều không có timezone. ETL phải có cấu hình timezone nguồn rõ ràng; không được tự giả định UTC.
- `bank_account.updatedat` chưa đủ tin cậy làm watermark nếu application không đảm bảo non-null và update ở mọi mutation.
- Không có ETL run/state/watermark table trong schema nguồn; chưa có external control store tương đương.

Strategy an toàn ở phase sau, không phải implementation trong TASK 01:

1. Initial run: full historical snapshot qua Spark JDBC.
2. Event/append-only table: chỉ dùng PK/event time incremental sau khi test đặc tính append-only và xử lý late commit/rerun overlap.
3. Mutable table không có change signal: full snapshot/compare hoặc periodic reconciliation; không tuyên bố incremental hoàn chỉnh bằng `MAX(id)`.
4. Watermark/state lưu ngoài OLTP hoặc trong control schema/database được chốt riêng; chỉ commit sau run SUCCESS.

Không đề xuất thêm cột vào source chỉ để ETL thuận tiện trong TASK 01.

## 7. Infrastructure hiện tại

| Component | Khai báo | Runtime đã verify | Kết luận |
|---|---|---|---|
| PostgreSQL OLTP | `postgres-bank`, PostgreSQL 17, named volume, port 5432, healthcheck | Healthy; 29 table; dữ liệu hiện hữu | KEEP source và volume; init deployment đang không tái lập được |
| MinIO | `minio/minio:latest`, named volume, port 9000/9001 | Health endpoint thành công; không có bucket user | Service chạy nhưng storage layout ETL chưa tồn tại |
| Airflow | 2.10.5, LocalExecutor, webserver/scheduler/init + PostgreSQL metadata | Metadata/scheduler healthy; web health OK; không có DAG/import error | Orchestrator shell chạy, pipeline chưa có; DAG mới mặc định paused |
| Spark | Không có service/image/config | Host và Airflow không có `spark-submit`; Airflow không có PySpark/Spark provider/JDBC JAR | Thiếu hoàn toàn |
| Kafka | 3 broker KRaft + UI | Cả 3 broker restart-loop; lỗi listener `0.0.0.0`; UI process up nhưng cluster không healthy | Future-only cho kiến trúc mới; không được làm dependency của batch ETL |
| Trino | Không khai báo | Không có container/config | Future-only, đúng phạm vi chưa implement |
| Docker Compose | 10 service, 6 named volume, 1 bridge network | `docker compose config --quiet` pass | Cấu hình syntactically hợp lệ nhưng chưa đủ target ETL |

Ba container cũ `bronze-consumer`, `outbox-publisher`, `snapshot-diff` vẫn tồn tại dưới Compose project nhưng không còn trong file Compose hiện tại và đều exited. Log gần nhất có module-not-found/network failure. Đây là orphan runtime, không phải component đang hoạt động; TASK 01 không xóa chúng.

### 7.1 Airflow runtime/dependencies

- Mount: `airflow/dags`, `airflow/logs`, `airflow/plugins`, `src`; tất cả source directory liên quan đang rỗng.
- `AIRFLOW__CORE__DAGS_ARE_PAUSED_AT_CREATION=true`: kể cả có DAG mới, cần chính sách enable rõ ràng để đạt mục tiêu tự chạy schedule.
- Airflow image hiện có Pandas 2.1.4, PyArrow 19.0.0, Amazon provider 9.2.0 và psycopg2; không có PySpark, MinIO SDK package, Spark provider, Java/spark-submit hoặc PostgreSQL JDBC JAR được tìm thấy.
- Dùng stock Airflow image, không có Dockerfile/constraints riêng để tái lập dependency.

### 7.2 MinIO

- Named volume: `bank-fraud-detection_minio_data`.
- Chưa có bucket Bronze/Silver/Quarantine; `.env.example` chỉ “suggested buckets” Bronze, Silver, Gold, ML.
- Chưa có init job tạo bucket, versioning/lifecycle/encryption/policy, path/partition convention, manifest hoặc idempotency contract.
- Không có biến/config riêng cho Quarantine, run state hoặc DQ artifacts.

### 7.3 Volumes và network

Compose khai báo và runtime có:

- `postgres_bank_data` — dữ liệu OLTP, phải bảo toàn.
- `postgres_airflow_data` — metadata Airflow.
- `minio_data` — data lake, hiện chưa có bucket user.
- `kafka1_data`, `kafka2_data`, `kafka3_data` — future Kafka.
- Bridge network duy nhất: `bank-fraud-network`.

Không có Spark volume, artifact volume, JDBC driver mount, control-state volume hoặc network policy riêng. PostgreSQL init mount tới `database/init` nhưng thư mục rỗng.

## 8. ETL/DAG/Spark/dependency/config/test hiện tại

### ETL scripts và Spark jobs

- Không có `.py` ETL implementation.
- `spark/__init__.py` rỗng; `spark/bronze_to_silver/job.py` chỉ còn bytecode cache, source đã mất.
- Không có Spark submit wrapper, Spark config, package coordinates (`org.postgresql:postgresql`, Hadoop AWS), schema contract hoặc table catalog.
- Không có Bronze Parquet writer, Silver writer, quarantine writer, DQ runner, state store hay summary writer.

### DAGs

- `airflow/dags` rỗng.
- Airflow trả `No data found` cho cả DAG list và import errors.
- Không có target task chain, dependency check, retries, callbacks, failure-state handler hoặc schedule.

### Python dependencies

- `requirements.txt` rỗng; `environment.yml` được docs nhắc tới nhưng không tồn tại.
- Host `python3` là 3.12.3 nhưng không có pip/pytest/PySpark/PyArrow/MinIO/Psycopg/Pandas.
- Airflow container có một số data packages gián tiếp nhưng thiếu Spark runtime; dependency không được quản lý bởi repository.

### Environment variables/configs

- Có config PostgreSQL credentials/port, MinIO root credentials/endpoints/bucket names, Kafka và Airflow.
- Thiếu JDBC URL/driver path, Spark master/deploy mode/resources, source schema/table selection, Bronze/Silver/Quarantine paths, schedule, timezone normalization contract, batch size/partition column, watermark overlap/state backend, run-summary target, DQ thresholds và retention.
- `.env.example` dùng `latest` cho MinIO/Kafka UI nên build không tái lập chính xác.
- Chưa có dedicated read-only ETL PostgreSQL credential; dùng admin source credential sẽ là rủi ro least-privilege.
- `.env` local có `AIRFLOW_UID` nhưng `.env.example` không có: config drift nhỏ.

### Tests

- Không có test source; `tests` chỉ còn ignored bytecode.
- Host không có pytest nên `python3 -m pytest --collect-only` thất bại với `No module named pytest`.
- Cache liệt kê test cũ về initial load/contracts/Silver/incremental, nhưng không thể chạy và không đại diện target Spark JDBC → Parquet pipeline mới.
- Không có integration test PostgreSQL→Spark→MinIO, schema/DQ test, replay/idempotency test, watermark failure test hoặc Airflow DAG parse/test.

## 9. Phân loại component/file

Không file nào bị xóa trong TASK 01.

### KEEP

| Path/component | Lý do |
|---|---|
| `sql/create_table.sql` | DDL nguồn thực tế; không sửa source schema để phục vụ ETL |
| PostgreSQL `postgres_bank_data` | Có dữ liệu hiện hữu; tuyệt đối bảo toàn |
| PostgreSQL/MinIO/Airflow metadata service concept | Đúng tech stack target, dù Compose cần refactor |
| `images/*` | Ngoài phạm vi ETL, không có lý do xóa |
| `docs/gold-data-model.md` về mặt lịch sử | Giữ làm artifact để refactor theo future architecture, không dùng triển khai hiện tại |

### REFACTOR

| Path/component | Cần làm ở task sau |
|---|---|
| `docker-compose.yaml` | Thêm Spark/runtime, health/dependency/init phù hợp; tách Kafka future khỏi critical path; build Airflow image tái lập; không đụng volume OLTP |
| `.env.example` | Bổ sung ETL/JDBC/Spark/Quarantine/state/schedule config, pin image; loại bỏ config drift |
| `.gitignore` | Rà lại generated/runtime artifacts; chính sách log/cache |
| `AGENT.md` / `AGENTS.md` | Hợp nhất đúng tên và cập nhật kiến trúc mới |
| `docs/python-environment.md` | Đồng bộ Python/Spark/Java/dependency thực tế |
| `docs/gold-data-model.md` | Future-only; sửa 14→10 dimension và fact names theo quyết định mới, không implement |
| Empty package structure (`common`, `config`, `scripts`, `spark`) | Có thể tái dùng namespace nhưng cần cấu trúc modular cho ETL mới |
| Airflow config | Cần DAG schedule thực sự active, connection/secrets, retry/failure behavior |

### REPLACE

| Path/component | Lý do |
|---|---|
| `README.md` | Rỗng, cần mô tả kiến trúc/phạm vi/vận hành mới |
| `requirements.txt` | Rỗng, không mô tả dependency |
| Legacy Kafka/snapshot design thể hiện trong bytecode | Kiến trúc mới yêu cầu initial batch PostgreSQL → Spark JDBC → MinIO, không Kafka-first |
| Missing source behind orphan ingestion containers | Container không chạy được và không còn source; nếu cần chức năng tương đương phải triển khai theo target mới |

### DELETE_CANDIDATE

Chỉ đánh dấu; chưa xóa:

- Toàn bộ `__pycache__`, `.pyc`, `.pytest_cache` — generated artifact, source tương ứng không tồn tại.
- Tracked `airflow/logs/*` — runtime output không nên version control; worktree đã có deletion trước TASK 01.
- `kafka/producer.py` và các placeholder Kafka rỗng nếu sau này Kafka được tách sang future module rõ ràng.
- Ba orphan container cũ và image `bank-pipeline-ingestion:3.11` sau khi xác nhận không cần phục hồi; không phải file repository và không xử lý trong TASK 01.

## 10. Gap analysis: current → target ETL

| Target stage/capability | Current state | Gap |
|---|---|---|
| PostgreSQL source | 29 bảng, dữ liệu có thật, container healthy | Thiếu dedicated read-only JDBC user/config; clean bootstrap không tạo schema |
| Spark JDBC extract | Không Spark, không JDBC JAR/job | Thiếu toàn bộ runtime, job, partition/snapshot strategy, table selection |
| Bronze Parquet trên MinIO | MinIO live nhưng không bucket | Thiếu bucket/init/layout/metadata `_ingested_at`, `_source_table`, `_source_system`, `_batch_id`, writer và manifest |
| Bronze validation | Không có | Thiếu schema/count/file/readability/reconciliation checks |
| Spark Bronze→Silver | Chỉ còn bytecode legacy | Thiếu source job mới, explicit schema và normalization rules |
| Quarantine | Không bucket/config/code | Thiếu rejected payload, reason, stage, run/batch metadata và retry policy |
| Silver Parquet | Không bucket/data/job | Thiếu clean/dedup/idempotent write contract và partition strategy |
| Data Quality | Không source tests/rules | Thiếu structural, relational, financial/business DQ và threshold behavior |
| Incremental/watermark | Không state store; schema change signal yếu | Reliable incremental bị giới hạn; watermark commit-after-success chưa có |
| Run context/state | Không có | Thiếu `run_id`, `batch_id`, timing/source/target/count/status/error schema và persistence |
| Run summary | Không có | Thiếu aggregation/log/notification target |
| Airflow orchestration | Scheduler healthy, zero DAG | Thiếu toàn bộ target DAG, schedule, retry, failure path, connections |
| Observability/recovery | Docker logs rời rạc | Thiếu structured metrics/log correlation, replay/runbook và failure state |
| Automated deployment | Compose syntax pass | Thiếu custom images, health gates, init jobs và end-to-end startup verification |

## 11. Technical debt, schema gaps và risks

### Technical debt

1. Source code quan trọng từng tồn tại nhưng hiện chỉ còn bytecode; repository không tái lập được trạng thái mà orphan containers đã chạy.
2. Empty README/requirements, sai tên `AGENT(S).md`, docs nhắc file không tồn tại.
3. Runtime schema phụ thuộc volume cũ; clean Compose deployment không chạy `sql/create_table.sql`.
4. Runtime logs từng được track; worktree đã dirty trước TASK 01.
5. Image `latest` và stock Airflow có dependency gián tiếp, không có lock/custom image.
6. Future Gold document mâu thuẫn quyết định kiến trúc mới.
7. Kafka đang lỗi dù ngoài critical path; làm nhiễu health/operations nếu luôn bật cùng stack ETL.

### BLOCKED / SCHEMA GAP

1. Reliable update/delete incremental cho phần lớn bảng mutable: thiếu change timestamp/version/CDC contract.
2. Timestamp normalization: source dùng timestamp không timezone; phải chốt timezone nguồn và DST/invalid-time behavior.
3. ETL state/watermark/run-summary store chưa được xác định; không nên tự thêm vào OLTP.
4. Chưa chốt tập bảng/cột thật sự cần ingest. Không được mặc định copy cả 29 bảng, đặc biệt các secret/PII như `passwordhash`, `pinhash`, national ID, contact/address.

### Data-quality/business risks cần kiểm tra ở Silver/DQ sau này

- DDL không tự enforce cân bằng tổng DEBIT = CREDIT theo transaction.
- DDL không chặn posting cho transaction Pending/Failed/Cancelled.
- DDL không enforce amount/currency/customer/status nhất quán giữa `transfer_request` và `bank_transaction`.
- `card.customerid` và `card.accountid` không được constraint rằng customer là holder hợp lệ của account.
- `account_status_history` không ràng buộc `changedbytype='Employee'` với `employeeid` non-null hoặc System với null.
- Composite FK nullable cho device/schedule có semantics PostgreSQL: nếu thành phần nullable thì FK có thể không được kiểm tra như quan hệ đầy đủ; DQ cần xử lý rõ.
- Không có completion/update timestamp đáng tin cậy cho transaction/status mutable; ingestion time không được dùng thay business time.

### Operational/security risks

- Bronze “near-raw” có thể chứa password/PIN hash và PII nếu ingest mù toàn bảng. Cần allowlist, encryption/access policy và data-minimization decision trước implementation.
- MinIO root credential và PostgreSQL admin credential đang là kiểu config duy nhất; chưa có least-privilege service accounts.
- MinIO không healthcheck trong Compose và chưa có bucket policy/versioning/lifecycle.
- DAG mặc định paused làm mục tiêu auto-schedule không đạt nếu không có enable/deployment policy.
- Không có end-to-end test nên chưa có bằng chứng retry-safe/idempotent/recoverable.

## 12. Trạng thái TASK 01

- **DESIGNED:** current-state map, schema/relationship inventory, classification và target gap analysis đã được lập.
- **IMPLEMENTED:** chỉ thêm tài liệu discovery này; không triển khai ETL.
- **TESTED:** đã chạy kiểm tra read-only/static/runtime được liệt kê ở mục 13. PostgreSQL/MinIO/Airflow/Compose đã được kiểm chứng theo phạm vi discovery; ETL không thể test vì chưa tồn tại.
- **BLOCKED:** không block TASK 01. Các blocker cho task triển khai sau gồm Spark/runtime thiếu hoàn toàn, test source thiếu và reliable incremental gặp schema gap nêu trên.

## 13. Verification commands đã chạy

Các nhóm lệnh chính (credentials không được in):

```bash
rg --files
find . ...
git status --short
git ls-files
git log --stat
sed ... AGENT.md docker-compose.yaml sql/create_table.sql docs/* .env.example
docker compose config --quiet
docker compose config --services
docker compose config --volumes
docker compose ps --all
docker ps
docker logs ...
docker inspect ...
docker exec bank-postgres psql ... information_schema/pg_catalog queries
docker exec airflow-scheduler airflow dags list
docker exec airflow-scheduler airflow dags list-import-errors
curl http://localhost:9000/minio/health/live
curl http://localhost:8081/health
docker exec bank-minio ls -la /data
spark-submit --version
python3 --version
python3 -m pip check
python3 -m pytest --collect-only -q
```

Kết quả test/verification không được nâng thành tuyên bố ETL đã chạy. Không bắt đầu TASK 02.
