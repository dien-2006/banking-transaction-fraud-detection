# Source → Bronze → Silver Mapping

Ngày thiết kế: 2026-09-28

Tài liệu này là column-level target mapping cho 22 source table đã chọn trong TASK 02. Không phải implementation và không thay đổi PostgreSQL schema.

## 1. Quy ước chung

### 1.1 Datatype representation

| PostgreSQL | Bronze Parquet/Spark | Silver |
|---|---|---|
| `INTEGER` | `INT32` | `int` |
| `BIGINT` | `INT64` | `long` |
| `NUMERIC(p,s)` | `DECIMAL(p,s)` | `decimal(p,s)`, không dùng floating point cho tiền |
| `VARCHAR/CHAR` | UTF-8 string, giữ giá trị source | `string` sau normalize/validate |
| `DATE` | Parquet DATE | `date` |
| `TIMESTAMP WITHOUT TIME ZONE` | `TIMESTAMP_MICROS`, kèm `_source_timezone` | `timestamp` UTC sau khi diễn giải source là `Asia/Ho_Chi_Minh` theo runtime contract đã verify |
| `BOOLEAN` | BOOLEAN | `boolean` |
| `JSONB` | canonical UTF-8 JSON string; JDBC projection phải giữ đủ JSON | canonical JSON string sau parse validation; typed payload cần contract riêng |

Bronze giữ nguyên tên/cột source và thêm metadata được định nghĩa trong `ingestion_design.md`. Silver đổi tên camel/compound source name thành `snake_case`; việc đổi tên không tạo dữ liệu mới.

### 1.2 Transformation codes

- `IDENTITY`: giữ nguyên giá trị/type tương ứng.
- `TRIM`: trim outer whitespace; empty nullable string có thể chuẩn hóa null theo rule đã chốt, không áp dụng mù cho free text.
- `ENUM`: trim và chỉ chấp nhận vocabulary từ CHECK constraint; unknown → Quarantine.
- `TS_UTC`: diễn giải source local timestamp bằng `_source_timezone`, chuyển UTC; ambiguous/invalid → Quarantine.
- `CHAR_CODE`: trim fixed CHAR, uppercase khi source constraint quy định mã uppercase.
- `JSON_CANON`: parse JSON, canonical serialization; parse failure → Quarantine.
- `IP_CANON`: validate IPv4/IPv6 rồi canonicalize; null giữ null.
- `FREE_TEXT`: giữ nội dung, chỉ kiểm tra length/encoding; không tự sửa nghĩa.

### 1.3 Sensitive classification

- `INTERNAL`: technical/business identifier hoặc metadata nội bộ.
- `PII`: thông tin cá nhân.
- `RESTRICTED_PII`: định danh cá nhân rủi ro cao.
- `FINANCIAL`: số tài khoản, balance, amount, loan/payment data.
- `SECURITY`: device/IP/idempotency/security status.
- `PRECISE_LOCATION`: latitude/longitude.
- `MODEL_RISK`: score, decision, model reasoning/labels/review.
- `FREE_TEXT_SENSITIVE`: text có thể chứa PII hoặc dữ liệu nghiệp vụ không cấu trúc.
- `DYNAMIC_SENSITIVE`: JSON có classification phụ thuộc payload contract.
- `LOW`: danh mục/thông tin ít nhạy cảm; vẫn là dữ liệu nội bộ nếu policy yêu cầu.

`N` trong bảng là nullable (`Y/N`). Key dùng `PK`, `FK table.column`, `UQ` đúng theo DDL. DQ luôn bao gồm schema type, nullability và length/precision của source; bảng dưới nêu rule bổ sung quan trọng.

Để bảng gọn, datatype ghi `TIMESTAMP` ở các dòng bên dưới chính là PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` trong DDL, không phải `TIMESTAMPTZ`.

## 2. Transaction domain

| Source table | Source column | PostgreSQL datatype | N | PK/FK/UQ | Bronze representation | Silver dataset | Silver column | Silver datatype | Transformation | DQ rule | Sensitive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bank_transaction | transactionid | BIGINT | N | PK | INT64 | silver.bank_transaction | transaction_id | long | IDENTITY | > 0; unique | INTERNAL |
| bank_transaction | transactioncode | VARCHAR(40) | N | UQ | UTF-8 | silver.bank_transaction | transaction_code | string | TRIM | non-empty; unique; max 40 | INTERNAL |
| bank_transaction | transactiontypeid | INTEGER | N | FK transaction_type.transactiontypeid | INT32 | silver.bank_transaction | transaction_type_id | int | IDENTITY | FK must resolve | INTERNAL |
| bank_transaction | employeeid | INTEGER | Y | FK employee.employeeid | INT32 | silver.bank_transaction | employee_id | int | IDENTITY | FK source validation; referenced table ngoài scope | INTERNAL |
| bank_transaction | terminalid | BIGINT | Y | FK terminal.terminalid | INT64 | silver.bank_transaction | terminal_id | long | IDENTITY | FK resolve khi non-null | INTERNAL |
| bank_transaction | deviceid | BIGINT | Y | composite FK với initiatedbycustomerid | INT64 | silver.bank_transaction | device_id | long | IDENTITY | composite FK semantics; device không được đứng một mình | SECURITY |
| bank_transaction | channel | VARCHAR(30) | N | — | UTF-8 | silver.bank_transaction | channel | string | ENUM | Counter/ATM/POS/MobileBanking/InternetBanking/System | LOW |
| bank_transaction | amount | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.bank_transaction | amount | decimal(19,2) | IDENTITY | > 0 | FINANCIAL |
| bank_transaction | fee | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.bank_transaction | fee | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| bank_transaction | currency | CHAR(3) | N | — | UTF-8 | silver.bank_transaction | currency | string | CHAR_CODE | exactly VND | FINANCIAL |
| bank_transaction | transactiondate | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.bank_transaction | transaction_at | timestamp UTC | TS_UTC | valid source-local time | INTERNAL |
| bank_transaction | ipaddress | VARCHAR(45) | Y | — | UTF-8 | silver.bank_transaction | ip_address | string | IP_CANON | valid IPv4/IPv6 when non-null | SECURITY |
| bank_transaction | latitude | NUMERIC(9,6) | Y | — | DECIMAL(9,6) | silver.bank_transaction | latitude | decimal(9,6) | IDENTITY | -90..90 | PRECISE_LOCATION |
| bank_transaction | longitude | NUMERIC(9,6) | Y | — | DECIMAL(9,6) | silver.bank_transaction | longitude | decimal(9,6) | IDENTITY | -180..180 | PRECISE_LOCATION |
| bank_transaction | description | VARCHAR(255) | Y | — | UTF-8 | silver.bank_transaction | description | string | FREE_TEXT | max 255; valid UTF-8 | FREE_TEXT_SENSITIVE |
| bank_transaction | status | VARCHAR(20) | N | — | UTF-8 | silver.bank_transaction | status | string | ENUM | Pending/Success/Failed/Cancelled | FINANCIAL |
| bank_transaction | initiatedbycustomerid | BIGINT | Y | FK customer.customerid; composite FK device | INT64 | silver.bank_transaction | initiated_by_customer_id | long | IDENTITY | customer FK; pair with device when present | PII |
| bank_transaction | cardid | BIGINT | Y | FK card.cardid | INT64 | silver.bank_transaction | card_id | long | IDENTITY | FK source validation; card ngoài scope | FINANCIAL |
| bank_transaction | originaltransactionid | BIGINT | Y | self FK bank_transaction.transactionid | INT64 | silver.bank_transaction | original_transaction_id | long | IDENTITY | resolve self FK; not self-reference unless business allows | FINANCIAL |
| transfer_request | transferrequestid | BIGINT | N | PK | INT64 | silver.transfer_request | transfer_request_id | long | IDENTITY | > 0; unique | INTERNAL |
| transfer_request | transactionid | BIGINT | N | FK bank_transaction.transactionid; UQ | INT64 | silver.transfer_request | transaction_id | long | IDENTITY | FK resolve; unique | INTERNAL |
| transfer_request | customerid | BIGINT | N | FK customer.customerid | INT64 | silver.transfer_request | customer_id | long | IDENTITY | FK resolve | PII |
| transfer_request | sourceaccountid | BIGINT | N | FK bank_account.accountid | INT64 | silver.transfer_request | source_account_id | long | IDENTITY | FK resolve; differs destination | FINANCIAL |
| transfer_request | destinationaccountid | BIGINT | N | FK bank_account.accountid | INT64 | silver.transfer_request | destination_account_id | long | IDENTITY | FK resolve; differs source | FINANCIAL |
| transfer_request | idempotencykey | VARCHAR(100) | N | UQ | UTF-8 | silver.transfer_request | idempotency_key | string | TRIM | non-empty; unique; max 100 | SECURITY |
| transfer_request | amount | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.transfer_request | amount | decimal(19,2) | IDENTITY | > 0; reconcile transaction amount | FINANCIAL |
| transfer_request | currency | CHAR(3) | N | — | UTF-8 | silver.transfer_request | currency | string | CHAR_CODE | exactly VND; reconcile transaction | FINANCIAL |
| transfer_request | requestedat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.transfer_request | requested_at | timestamp UTC | TS_UTC | valid source-local time | INTERNAL |
| transfer_request | status | VARCHAR(20) | N | — | UTF-8 | silver.transfer_request | status | string | ENUM | Pending/Approved/Rejected/Completed/Failed/Cancelled | FINANCIAL |
| transaction_posting | postingid | BIGINT | N | PK | INT64 | silver.transaction_posting | posting_id | long | IDENTITY | > 0; unique | INTERNAL |
| transaction_posting | transactionid | BIGINT | N | FK bank_transaction.transactionid | INT64 | silver.transaction_posting | transaction_id | long | IDENTITY | FK resolve | INTERNAL |
| transaction_posting | accountid | BIGINT | N | FK bank_account.accountid | INT64 | silver.transaction_posting | account_id | long | IDENTITY | FK resolve | FINANCIAL |
| transaction_posting | postingtype | VARCHAR(10) | N | — | UTF-8 | silver.transaction_posting | posting_type | string | ENUM | DEBIT/CREDIT | FINANCIAL |
| transaction_posting | amount | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.transaction_posting | amount | decimal(19,2) | IDENTITY | > 0; Debit=Credit per Success transaction | FINANCIAL |
| transaction_posting | postingdate | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.transaction_posting | posting_at | timestamp UTC | TS_UTC | valid time; no posting for non-Success | FINANCIAL |
| transaction_posting | description | VARCHAR(255) | Y | — | UTF-8 | silver.transaction_posting | description | string | FREE_TEXT | max 255 | FREE_TEXT_SENSITIVE |
| transaction_type | transactiontypeid | INTEGER | N | PK | INT32 | silver.transaction_type | transaction_type_id | int | IDENTITY | > 0; unique | INTERNAL |
| transaction_type | typecode | VARCHAR(30) | N | UQ | UTF-8 | silver.transaction_type | type_code | string | ENUM | TRANSFER/DEPOSIT/WITHDRAWAL/LOAN_PAYMENT/OPENING_BALANCE/REVERSAL; unique | LOW |
| transaction_type | typename | VARCHAR(100) | N | UQ | UTF-8 | silver.transaction_type | type_name | string | TRIM | non-empty; unique | LOW |
| transaction_type | description | VARCHAR(255) | Y | — | UTF-8 | silver.transaction_type | description | string | FREE_TEXT | max 255 | LOW |
| transaction_type | status | VARCHAR(20) | N | — | UTF-8 | silver.transaction_type | status | string | ENUM | Active/Inactive | LOW |

## 3. Customer, device and login domain

| Source table | Source column | PostgreSQL datatype | N | PK/FK/UQ | Bronze representation | Silver dataset | Silver column | Silver datatype | Transformation | DQ rule | Sensitive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| customer | customerid | BIGINT | N | PK | INT64 | silver.customer | customer_id | long | IDENTITY | > 0; unique | PII |
| customer | customercode | VARCHAR(20) | N | UQ | UTF-8 | silver.customer | customer_code | string | TRIM | non-empty; unique | PII |
| customer | fullname | VARCHAR(150) | N | — | UTF-8 | silver.customer | full_name | string | TRIM | non-empty; max 150 | PII |
| customer | gender | VARCHAR(10) | Y | — | UTF-8 | silver.customer | gender | string | ENUM | null hoặc Male/Female/Other/Unknown | PII |
| customer | dateofbirth | DATE | Y | — | DATE | silver.customer | date_of_birth | date | IDENTITY | not future; plausible range is policy rule TBD | PII |
| customer | nationalid | VARCHAR(30) | Y | UQ | UTF-8 | silver.customer | national_id | string | TRIM | unique when non-null; max 30 | RESTRICTED_PII |
| customer | phone | VARCHAR(20) | Y | — | UTF-8 | silver.customer | phone | string | TRIM | max 20; format policy TBD | PII |
| customer | email | VARCHAR(150) | Y | — | UTF-8 | silver.customer | email | string | TRIM | max 150; valid email policy TBD | PII |
| customer | address | VARCHAR(255) | Y | — | UTF-8 | silver.customer | address | string | FREE_TEXT | max 255 | PII |
| customer | occupation | VARCHAR(100) | Y | — | UTF-8 | silver.customer | occupation | string | TRIM | max 100 | PII |
| customer | customertype | VARCHAR(30) | Y | — | UTF-8 | silver.customer | customer_type | string | TRIM | vocabulary not constrained: monitor unknowns | PII |
| customer | createddate | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.customer | created_at | timestamp UTC | TS_UTC | valid source-local time | INTERNAL |
| customer | status | VARCHAR(20) | N | — | UTF-8 | silver.customer | status | string | ENUM | Active/Inactive/Blocked | PII |
| customer | customersegment | VARCHAR(30) | Y | — | UTF-8 | silver.customer | customer_segment | string | TRIM | vocabulary not constrained | PII |
| customer_device | deviceid | BIGINT | N | PK; part UQ | INT64 | silver.customer_device | device_id | long | IDENTITY | > 0; unique | SECURITY |
| customer_device | customerid | BIGINT | N | FK customer.customerid; part UQ | INT64 | silver.customer_device | customer_id | long | IDENTITY | FK resolve | PII |
| customer_device | devicecode | VARCHAR(100) | N | UQ | UTF-8 | silver.customer_device | device_code | string | TRIM | non-empty; unique | SECURITY |
| customer_device | devicetype | VARCHAR(30) | N | — | UTF-8 | silver.customer_device | device_type | string | ENUM | Mobile/Tablet/Desktop/Other | SECURITY |
| customer_device | devicename | VARCHAR(100) | Y | — | UTF-8 | silver.customer_device | device_name | string | TRIM | max 100 | SECURITY |
| customer_device | operatingsystem | VARCHAR(80) | Y | — | UTF-8 | silver.customer_device | operating_system | string | TRIM | max 80 | SECURITY |
| customer_device | firstseenat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.customer_device | first_seen_at | timestamp UTC | TS_UTC | valid source-local time | SECURITY |
| customer_device | lastseenat | TIMESTAMP | Y | — | TIMESTAMP_MICROS local | silver.customer_device | last_seen_at | timestamp UTC | TS_UTC | null hoặc >= first_seen_at | SECURITY |
| customer_device | istrusted | BOOLEAN | N | — | BOOLEAN | silver.customer_device | is_trusted | boolean | IDENTITY | non-null | SECURITY |
| customer_device | status | VARCHAR(20) | N | — | UTF-8 | silver.customer_device | status | string | ENUM | Active/Blocked/Removed | SECURITY |
| login_event | logineventid | BIGINT | N | PK | INT64 | silver.login_event | login_event_id | long | IDENTITY | > 0; unique | SECURITY |
| login_event | customerid | BIGINT | N | FK customer.customerid; composite FK device | INT64 | silver.login_event | customer_id | long | IDENTITY | FK resolve | PII |
| login_event | deviceid | BIGINT | Y | composite FK customer_device | INT64 | silver.login_event | device_id | long | IDENTITY | `(customer_id,device_id)` resolve khi device non-null | SECURITY |
| login_event | logintime | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.login_event | login_at | timestamp UTC | TS_UTC | valid source-local time | SECURITY |
| login_event | ipaddress | VARCHAR(45) | Y | — | UTF-8 | silver.login_event | ip_address | string | IP_CANON | valid IPv4/IPv6 | SECURITY |
| login_event | status | VARCHAR(20) | N | — | UTF-8 | silver.login_event | status | string | ENUM | Success/Failed/Blocked | SECURITY |
| login_event | failurereason | VARCHAR(255) | Y | — | UTF-8 | silver.login_event | failure_reason | string | FREE_TEXT | null cho Success; required cho Failed/Blocked | FREE_TEXT_SENSITIVE |

## 4. Account domain

| Source table | Source column | PostgreSQL datatype | N | PK/FK/UQ | Bronze representation | Silver dataset | Silver column | Silver datatype | Transformation | DQ rule | Sensitive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bank_account | accountid | BIGINT | N | PK | INT64 | silver.bank_account | account_id | long | IDENTITY | > 0; unique | FINANCIAL |
| bank_account | accountnumber | VARCHAR(30) | N | UQ | UTF-8 | silver.bank_account | account_number | string | TRIM | non-empty; unique | FINANCIAL |
| bank_account | branchid | INTEGER | N | FK branch.branchid | INT32 | silver.bank_account | branch_id | int | IDENTITY | FK resolve | INTERNAL |
| bank_account | accounttypeid | INTEGER | N | FK account_type.accounttypeid | INT32 | silver.bank_account | account_type_id | int | IDENTITY | FK resolve | INTERNAL |
| bank_account | opendate | DATE | N | — | DATE | silver.bank_account | open_date | date | IDENTITY | valid date | FINANCIAL |
| bank_account | balance | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.bank_account | balance | decimal(19,2) | IDENTITY | exact decimal; reconcile with postings requires opening balance | FINANCIAL |
| bank_account | currency | CHAR(3) | N | — | UTF-8 | silver.bank_account | currency | string | CHAR_CODE | exactly VND | FINANCIAL |
| bank_account | status | VARCHAR(20) | N | — | UTF-8 | silver.bank_account | status | string | ENUM | Active/Frozen/Closed | FINANCIAL |
| bank_account | createdat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.bank_account | created_at | timestamp UTC | TS_UTC | valid source-local time | INTERNAL |
| bank_account | updatedat | TIMESTAMP | Y | — | TIMESTAMP_MICROS local | silver.bank_account | updated_at | timestamp UTC | TS_UTC | null hoặc >= created_at; not reliable watermark yet | INTERNAL |
| bank_account | accountcategory | VARCHAR(20) | N | — | UTF-8 | silver.bank_account | account_category | string | ENUM | CUSTOMER/INTERNAL | FINANCIAL |
| account_holder | accountholderid | BIGINT | N | PK | INT64 | silver.account_holder | account_holder_id | long | IDENTITY | > 0; unique | INTERNAL |
| account_holder | accountid | BIGINT | N | FK bank_account.accountid; partial UQ | INT64 | silver.account_holder | account_id | long | IDENTITY | FK resolve | FINANCIAL |
| account_holder | customerid | BIGINT | N | FK customer.customerid; partial UQ | INT64 | silver.account_holder | customer_id | long | IDENTITY | FK resolve | PII |
| account_holder | holdertype | VARCHAR(30) | N | — | UTF-8 | silver.account_holder | holder_type | string | ENUM | PRIMARY_OWNER/JOINT_OWNER/AUTHORIZED_USER | FINANCIAL |
| account_holder | startdate | DATE | N | — | DATE | silver.account_holder | start_date | date | IDENTITY | valid date | FINANCIAL |
| account_holder | enddate | DATE | Y | — | DATE | silver.account_holder | end_date | date | IDENTITY | Active→null; Inactive→non-null and >= start | FINANCIAL |
| account_holder | status | VARCHAR(20) | N | partial UQ predicate | UTF-8 | silver.account_holder | status | string | ENUM | Active/Inactive; active uniqueness rules | FINANCIAL |
| account_type | accounttypeid | INTEGER | N | PK | INT32 | silver.account_type | account_type_id | int | IDENTITY | > 0; unique | INTERNAL |
| account_type | typename | VARCHAR(100) | N | UQ | UTF-8 | silver.account_type | type_name | string | TRIM | non-empty; unique | LOW |
| account_type | minbalance | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.account_type | minimum_balance | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| account_type | interestrate | NUMERIC(8,4) | N | — | DECIMAL(8,4) | silver.account_type | interest_rate | decimal(8,4) | IDENTITY | >= 0 | FINANCIAL |
| account_type | description | VARCHAR(255) | Y | — | UTF-8 | silver.account_type | description | string | FREE_TEXT | max 255 | LOW |
| account_type | status | VARCHAR(20) | N | — | UTF-8 | silver.account_type | status | string | ENUM | Active/Inactive | LOW |
| account_status_history | historyid | BIGINT | N | PK | INT64 | silver.account_status_history | history_id | long | IDENTITY | > 0; unique | INTERNAL |
| account_status_history | accountid | BIGINT | N | FK bank_account.accountid | INT64 | silver.account_status_history | account_id | long | IDENTITY | FK resolve | FINANCIAL |
| account_status_history | oldstatus | VARCHAR(20) | Y | — | UTF-8 | silver.account_status_history | old_status | string | ENUM | null hoặc Active/Frozen/Closed | FINANCIAL |
| account_status_history | newstatus | VARCHAR(20) | N | — | UTF-8 | silver.account_status_history | new_status | string | ENUM | Active/Frozen/Closed | FINANCIAL |
| account_status_history | changeddate | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.account_status_history | changed_at | timestamp UTC | TS_UTC | valid source-local time | INTERNAL |
| account_status_history | changedbytype | VARCHAR(20) | N | — | UTF-8 | silver.account_status_history | changed_by_type | string | ENUM | Employee/System | INTERNAL |
| account_status_history | employeeid | INTEGER | Y | FK employee.employeeid | INT32 | silver.account_status_history | employee_id | int | IDENTITY | source FK; actor/null consistency is additional DQ | INTERNAL |
| account_status_history | reason | VARCHAR(255) | Y | — | UTF-8 | silver.account_status_history | reason | string | FREE_TEXT | max 255 | FREE_TEXT_SENSITIVE |

## 5. Branch and terminal domain

| Source table | Source column | PostgreSQL datatype | N | PK/FK/UQ | Bronze representation | Silver dataset | Silver column | Silver datatype | Transformation | DQ rule | Sensitive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| branch | branchid | INTEGER | N | PK | INT32 | silver.branch | branch_id | int | IDENTITY | > 0; unique | INTERNAL |
| branch | branchcode | VARCHAR(20) | N | UQ | UTF-8 | silver.branch | branch_code | string | TRIM | non-empty; unique | INTERNAL |
| branch | branchname | VARCHAR(150) | N | — | UTF-8 | silver.branch | branch_name | string | TRIM | non-empty; max 150 | LOW |
| branch | address | VARCHAR(255) | N | — | UTF-8 | silver.branch | address | string | FREE_TEXT | non-empty; max 255 | INTERNAL |
| branch | city | VARCHAR(100) | N | — | UTF-8 | silver.branch | city | string | TRIM | non-empty; max 100 | LOW |
| branch | phone | VARCHAR(20) | Y | — | UTF-8 | silver.branch | phone | string | TRIM | max 20 | INTERNAL |
| branch | opendate | DATE | N | — | DATE | silver.branch | open_date | date | IDENTITY | valid date | LOW |
| branch | status | VARCHAR(20) | N | — | UTF-8 | silver.branch | status | string | ENUM | Active/Inactive | LOW |
| branch | createdat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.branch | created_at | timestamp UTC | TS_UTC | valid source-local time | INTERNAL |
| terminal | terminalid | BIGINT | N | PK | INT64 | silver.terminal | terminal_id | long | IDENTITY | > 0; unique | INTERNAL |
| terminal | terminalcode | VARCHAR(40) | N | UQ | UTF-8 | silver.terminal | terminal_code | string | TRIM | non-empty; unique | INTERNAL |
| terminal | branchid | INTEGER | Y | FK branch.branchid | INT32 | silver.terminal | branch_id | int | IDENTITY | FK resolve when non-null | INTERNAL |
| terminal | terminaltype | VARCHAR(20) | N | — | UTF-8 | silver.terminal | terminal_type | string | ENUM | ATM/POS/COUNTER | LOW |
| terminal | locationname | VARCHAR(150) | Y | — | UTF-8 | silver.terminal | location_name | string | TRIM | max 150 | INTERNAL |
| terminal | address | VARCHAR(255) | Y | — | UTF-8 | silver.terminal | address | string | FREE_TEXT | max 255 | INTERNAL |
| terminal | status | VARCHAR(20) | N | — | UTF-8 | silver.terminal | status | string | ENUM | Active/Inactive/Maintenance | LOW |

## 6. Fraud, review and model domain

| Source table | Source column | PostgreSQL datatype | N | PK/FK/UQ | Bronze representation | Silver dataset | Silver column | Silver datatype | Transformation | DQ rule | Sensitive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| risk_assessment | riskassessmentid | BIGINT | N | PK | INT64 | silver.risk_assessment | risk_assessment_id | long | IDENTITY | > 0; unique | MODEL_RISK |
| risk_assessment | transactionid | BIGINT | N | FK bank_transaction.transactionid | INT64 | silver.risk_assessment | transaction_id | long | IDENTITY | FK resolve | INTERNAL |
| risk_assessment | modelversionid | BIGINT | N | FK model_version.modelversionid | INT64 | silver.risk_assessment | model_version_id | long | IDENTITY | FK resolve | MODEL_RISK |
| risk_assessment | rulescore | SMALLINT | N | — | INT16 | silver.risk_assessment | rule_score | smallint | IDENTITY | 0..100 | MODEL_RISK |
| risk_assessment | risklevel | VARCHAR(20) | N | — | UTF-8 | silver.risk_assessment | risk_level | string | ENUM | LOW/MEDIUM/HIGH/CRITICAL | MODEL_RISK |
| risk_assessment | modelprobability | NUMERIC(8,6) | N | — | DECIMAL(8,6) | silver.risk_assessment | model_probability | decimal(8,6) | IDENTITY | 0..1 | MODEL_RISK |
| risk_assessment | decision | VARCHAR(20) | N | — | UTF-8 | silver.risk_assessment | decision | string | ENUM | ALLOW/REVIEW/BLOCK | MODEL_RISK |
| risk_assessment | reasonjson | JSONB | Y | — | canonical JSON UTF-8 | silver.risk_assessment | reason_json | string JSON | JSON_CANON | valid JSON; payload policy/schema currently absent | MODEL_RISK |
| risk_assessment | assessedat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.risk_assessment | assessed_at | timestamp UTC | TS_UTC | valid source-local time | MODEL_RISK |
| review_case | reviewcaseid | BIGINT | N | PK | INT64 | silver.review_case | review_case_id | long | IDENTITY | > 0; unique | MODEL_RISK |
| review_case | transactionid | BIGINT | N | FK bank_transaction.transactionid | INT64 | silver.review_case | transaction_id | long | IDENTITY | FK resolve | INTERNAL |
| review_case | status | VARCHAR(20) | N | — | UTF-8 | silver.review_case | status | string | ENUM | OPEN/IN_REVIEW/APPROVED/REJECTED/CLOSED | MODEL_RISK |
| review_case | revieweruserid | INTEGER | Y | FK system_user.userid | INT32 | silver.review_case | reviewer_user_id | int | IDENTITY | source FK; referenced dataset ngoài scope | PII |
| review_case | createdat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.review_case | created_at | timestamp UTC | TS_UTC | valid source-local time | MODEL_RISK |
| review_case | reviewedat | TIMESTAMP | Y | — | TIMESTAMP_MICROS local | silver.review_case | reviewed_at | timestamp UTC | TS_UTC | null hoặc >= created_at | MODEL_RISK |
| review_case | reason | VARCHAR(255) | Y | — | UTF-8 | silver.review_case | reason | string | FREE_TEXT | max 255 | FREE_TEXT_SENSITIVE |
| fraud_label_event | fraudlabeleventid | BIGINT | N | PK | INT64 | silver.fraud_label_event | fraud_label_event_id | long | IDENTITY | > 0; unique | MODEL_RISK |
| fraud_label_event | transactionid | BIGINT | N | FK bank_transaction.transactionid | INT64 | silver.fraud_label_event | transaction_id | long | IDENTITY | FK resolve | INTERNAL |
| fraud_label_event | label | VARCHAR(20) | N | — | UTF-8 | silver.fraud_label_event | label | string | ENUM | FRAUD/LEGITIMATE/UNKNOWN | MODEL_RISK |
| fraud_label_event | labeledat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.fraud_label_event | labeled_at | timestamp UTC | TS_UTC | valid source-local time; no future leakage into earlier features | MODEL_RISK |
| fraud_label_event | labelsource | VARCHAR(50) | N | — | UTF-8 | silver.fraud_label_event | label_source | string | TRIM | non-empty; vocabulary not constrained | MODEL_RISK |
| fraud_label_event | note | VARCHAR(255) | Y | — | UTF-8 | silver.fraud_label_event | note | string | FREE_TEXT | max 255 | FREE_TEXT_SENSITIVE |
| model_version | modelversionid | BIGINT | N | PK | INT64 | silver.model_version | model_version_id | long | IDENTITY | > 0; unique | MODEL_RISK |
| model_version | modelname | VARCHAR(100) | N | — | UTF-8 | silver.model_version | model_name | string | TRIM | non-empty; not unique in DDL | MODEL_RISK |
| model_version | modeltype | VARCHAR(50) | N | — | UTF-8 | silver.model_version | model_type | string | TRIM | non-empty; vocabulary not constrained | MODEL_RISK |
| model_version | status | VARCHAR(20) | N | — | UTF-8 | silver.model_version | status | string | ENUM | CANDIDATE/ACTIVE/RETIRED | MODEL_RISK |
| model_version | createdat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.model_version | created_at | timestamp UTC | TS_UTC | valid source-local time | MODEL_RISK |
| model_version | description | VARCHAR(255) | Y | — | UTF-8 | silver.model_version | description | string | FREE_TEXT | max 255 | MODEL_RISK |

## 7. Loan domain

| Source table | Source column | PostgreSQL datatype | N | PK/FK/UQ | Bronze representation | Silver dataset | Silver column | Silver datatype | Transformation | DQ rule | Sensitive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| loan | loanid | BIGINT | N | PK | INT64 | silver.loan | loan_id | long | IDENTITY | > 0; unique | FINANCIAL |
| loan | loancode | VARCHAR(30) | N | UQ | UTF-8 | silver.loan | loan_code | string | TRIM | non-empty; unique | FINANCIAL |
| loan | customerid | BIGINT | N | FK customer.customerid | INT64 | silver.loan | customer_id | long | IDENTITY | FK resolve | PII |
| loan | branchid | INTEGER | N | FK branch.branchid | INT32 | silver.loan | branch_id | int | IDENTITY | FK resolve | INTERNAL |
| loan | employeeid | INTEGER | N | FK employee.employeeid | INT32 | silver.loan | employee_id | int | IDENTITY | source FK; referenced dataset ngoài scope | PII |
| loan | loantypeid | INTEGER | N | FK loan_type.loantypeid | INT32 | silver.loan | loan_type_id | int | IDENTITY | FK resolve | INTERNAL |
| loan | principalamount | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.loan | principal_amount | decimal(19,2) | IDENTITY | > 0; <= loan type max is cross-table policy candidate | FINANCIAL |
| loan | interestrate | NUMERIC(8,4) | N | — | DECIMAL(8,4) | silver.loan | interest_rate | decimal(8,4) | IDENTITY | >= 0 | FINANCIAL |
| loan | termmonths | INTEGER | N | — | INT32 | silver.loan | term_months | int | IDENTITY | > 0; max term cross-table check | FINANCIAL |
| loan | startdate | DATE | N | — | DATE | silver.loan | start_date | date | IDENTITY | valid date | FINANCIAL |
| loan | enddate | DATE | N | — | DATE | silver.loan | end_date | date | IDENTITY | >= start_date | FINANCIAL |
| loan | status | VARCHAR(20) | N | — | UTF-8 | silver.loan | status | string | ENUM | Pending/Active/Paid/Overdue/Cancelled | FINANCIAL |
| loan_type | loantypeid | INTEGER | N | PK | INT32 | silver.loan_type | loan_type_id | int | IDENTITY | > 0; unique | INTERNAL |
| loan_type | loantypename | VARCHAR(100) | N | UQ | UTF-8 | silver.loan_type | loan_type_name | string | TRIM | non-empty; unique | LOW |
| loan_type | maxamount | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.loan_type | maximum_amount | decimal(19,2) | IDENTITY | > 0 | FINANCIAL |
| loan_type | defaultinterestrate | NUMERIC(8,4) | N | — | DECIMAL(8,4) | silver.loan_type | default_interest_rate | decimal(8,4) | IDENTITY | >= 0 | FINANCIAL |
| loan_type | maxtermmonths | INTEGER | N | — | INT32 | silver.loan_type | maximum_term_months | int | IDENTITY | > 0 | FINANCIAL |
| loan_type | description | VARCHAR(255) | Y | — | UTF-8 | silver.loan_type | description | string | FREE_TEXT | max 255 | LOW |
| loan_type | status | VARCHAR(20) | N | — | UTF-8 | silver.loan_type | status | string | ENUM | Active/Inactive | LOW |
| repayment_schedule | scheduleid | BIGINT | N | PK; part composite UQ | INT64 | silver.repayment_schedule | schedule_id | long | IDENTITY | > 0; unique | FINANCIAL |
| repayment_schedule | loanid | BIGINT | N | FK loan.loanid; part UQ | INT64 | silver.repayment_schedule | loan_id | long | IDENTITY | FK resolve | FINANCIAL |
| repayment_schedule | installmentno | INTEGER | N | UQ with loanid | INT32 | silver.repayment_schedule | installment_number | int | IDENTITY | > 0; unique per loan | FINANCIAL |
| repayment_schedule | duedate | DATE | N | — | DATE | silver.repayment_schedule | due_date | date | IDENTITY | valid date | FINANCIAL |
| repayment_schedule | principaldue | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.repayment_schedule | principal_due | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| repayment_schedule | interestdue | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.repayment_schedule | interest_due | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| repayment_schedule | penaltydue | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.repayment_schedule | penalty_due | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| repayment_schedule | status | VARCHAR(20) | N | — | UTF-8 | silver.repayment_schedule | status | string | ENUM | Pending/Partial/Paid/Overdue | FINANCIAL |
| loan_payment | loanpaymentid | BIGINT | N | PK | INT64 | silver.loan_payment | loan_payment_id | long | IDENTITY | > 0; unique | FINANCIAL |
| loan_payment | loanid | BIGINT | N | FK loan.loanid; composite FK schedule | INT64 | silver.loan_payment | loan_id | long | IDENTITY | FK resolve | FINANCIAL |
| loan_payment | scheduleid | BIGINT | Y | composite FK repayment_schedule | INT64 | silver.loan_payment | schedule_id | long | IDENTITY | pair `(loan_id,schedule_id)` resolve when non-null | FINANCIAL |
| loan_payment | paymentdate | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.loan_payment | payment_at | timestamp UTC | TS_UTC | valid source-local time | FINANCIAL |
| loan_payment | amountpaid | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.loan_payment | amount_paid | decimal(19,2) | IDENTITY | > 0; equals components | FINANCIAL |
| loan_payment | principalpaid | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.loan_payment | principal_paid | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| loan_payment | interestpaid | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.loan_payment | interest_paid | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| loan_payment | penaltyfee | NUMERIC(19,2) | N | — | DECIMAL(19,2) | silver.loan_payment | penalty_fee | decimal(19,2) | IDENTITY | >= 0 | FINANCIAL |
| loan_payment | paymentchannel | VARCHAR(30) | N | — | UTF-8 | silver.loan_payment | payment_channel | string | ENUM | Counter/Account/Online | FINANCIAL |
| loan_payment | employeeid | INTEGER | Y | FK employee.employeeid | INT32 | silver.loan_payment | employee_id | int | IDENTITY | Counter→required; Account/Online→null | PII |
| loan_payment | note | VARCHAR(255) | Y | — | UTF-8 | silver.loan_payment | note | string | FREE_TEXT | max 255 | FREE_TEXT_SENSITIVE |
| loan_payment | transactionid | BIGINT | N | FK bank_transaction.transactionid; UQ | INT64 | silver.loan_payment | transaction_id | long | IDENTITY | FK resolve; unique; linked transaction should be Success | FINANCIAL |

## 8. Event outbox batch representation

| Source table | Source column | PostgreSQL datatype | N | PK/FK/UQ | Bronze representation | Silver dataset | Silver column | Silver datatype | Transformation | DQ rule | Sensitive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| event_outbox | eventoutboxid | BIGINT | N | PK | INT64 | silver.event_outbox | event_outbox_id | long | IDENTITY | > 0; unique | INTERNAL |
| event_outbox | eventkey | VARCHAR(100) | N | UQ | UTF-8 | silver.event_outbox | event_key | string | TRIM | non-empty; unique | INTERNAL |
| event_outbox | aggregatetype | VARCHAR(50) | N | — | UTF-8 | silver.event_outbox | aggregate_type | string | TRIM | non-empty; observed BANK_TRANSACTION; vocabulary not constrained | INTERNAL |
| event_outbox | aggregateid | VARCHAR(100) | N | — | UTF-8 | silver.event_outbox | aggregate_id | string | TRIM | non-empty; no physical FK | INTERNAL |
| event_outbox | eventtype | VARCHAR(100) | N | — | UTF-8 | silver.event_outbox | event_type | string | TRIM | non-empty; observed TransactionRiskAssessed; vocabulary not constrained | INTERNAL |
| event_outbox | payloadjson | JSONB | N | — | canonical JSON UTF-8 | silver.event_outbox | payload_json | string JSON | JSON_CANON | valid JSON object; per-event schema/version currently absent | DYNAMIC_SENSITIVE |
| event_outbox | createdat | TIMESTAMP | N | — | TIMESTAMP_MICROS local | silver.event_outbox | outbox_created_at | timestamp UTC | TS_UTC | valid source-local time; not guaranteed business occurred time | INTERNAL |
| event_outbox | publishedat | TIMESTAMP | Y | — | TIMESTAMP_MICROS local | silver.event_outbox | published_at | timestamp UTC | TS_UTC | null hoặc >= outbox_created_at; should align status | INTERNAL |
| event_outbox | status | VARCHAR(20) | N | — | UTF-8 | silver.event_outbox | publish_status | string | ENUM | PENDING/PUBLISHED/FAILED; PUBLISHED should have published_at | INTERNAL |

## 9. Streaming Bronze → Silver event mapping

Mapping dưới chỉ dùng field thực tế trong outbox và transport metadata. Nó không tuyên bố payload hiện tại đủ tạo domain row.

| Source | Source field | Available | Bronze field | Silver target | Transformation/DQ | Gap/sensitivity |
|---|---|---:|---|---|---|---|
| event_outbox | `eventkey` | Yes | `event_id` | `silver.domain_event.event_id` | non-null, unique, stable dedup | INTERNAL |
| event_outbox | `eventtype` | Yes | `event_type` | `silver.domain_event.event_type` | non-empty, route only supported type | INTERNAL |
| event_outbox | no field | No | `event_version` | `silver.domain_event.event_version` | required target contract | **SCHEMA GAP** |
| event_outbox | no business-time field | No | `occurred_at` | `silver.domain_event.occurred_at` | do not substitute ingestion time | **SCHEMA GAP** |
| event_outbox | `aggregatetype` | Yes | `aggregate_type` | `silver.domain_event.aggregate_type` | non-empty | INTERNAL |
| event_outbox | `aggregateid` | Yes | `aggregate_id` | `silver.domain_event.aggregate_id` | non-empty; validate type-specific format | INTERNAL |
| event_outbox | `payloadjson` | Yes | `payload` | `silver.domain_event.payload_json` | JSON_CANON; versioned schema required before domain projection | DYNAMIC_SENSITIVE |
| current payload only | `source` JSON key | Observed, not constrained | `source` | `silver.domain_event.source` | validate when present; provenance should also come from config | **CONTRACT GAP** |
| event_outbox | no fields | No | correlation/causation/trace | corresponding Silver fields | cannot derive | **SCHEMA GAP** |
| event_outbox | `eventoutboxid` | Yes | `_source_pk` | audit metadata | exact long | INTERNAL |
| event_outbox | `createdat` | Yes | `outbox_created_at` | audit metadata | TS_UTC | INTERNAL; not occurred_at |
| Kafka | topic/partition/offset/timestamp | Transport | `_kafka_*` | audit metadata | coordinate uniqueness; offset monotonic per partition | INTERNAL |
| Consumer | ingestion time | Generated | `_ingested_at` | audit metadata | UTC; >= observable transport time within tolerance | INTERNAL |

### Existing `TransactionCompleted` payload

| Payload key thực tế | JSON type | Bronze | Có thể map Silver domain? | Kết luận |
|---|---|---|---|---|
| `transaction_id` | number | preserved in payload + optional extracted long after validation | Chỉ map được transaction reference | 250/250 khớp `aggregateid`; không có assessment PK |
| `status` | string | preserved in payload | cập nhật trạng thái transaction canonical | Chỉ `Success` được emit sau financial commit |

Event không được dùng để synthesize `silver.risk_assessment`. Consumer giữ raw envelope trong Bronze; Silver deduplicate theo `event_id`, rồi hội tụ `TransactionCompleted` với Batch `bank_transaction` theo `transaction_id`.

## 10. Cross-dataset DQ rules

1. `transfer_request.transactionid` phải resolve đúng một transaction loại TRANSFER; amount/currency/customer phải nhất quán theo business contract được chốt.
2. Posting chỉ hợp lệ cho transaction Success và tổng Debit = tổng Credit trong cùng transaction. Không tự sửa chênh lệch.
3. `bank_transaction.originaltransactionid` dùng cho reversal; không xóa hoặc overwrite transaction gốc.
4. Device composite FK phải kiểm tra cả customer và device; nullable composite semantics không được coi là quan hệ hợp lệ nếu chỉ có một vế.
5. Active account holder phải tuân thủ hai partial unique index; snapshot dedup không được làm mất joint holder hợp lệ.
6. `risk_assessment` là prediction, `fraud_label_event` là label; không thay thế lẫn nhau.
7. Label/review đến sau không được backfill làm feature tại thời điểm assessment/transaction.
8. Loan payment total phải bằng ba components và transaction liên kết phải Success trước khi tính là thanh toán đã thực thi.
9. Batch/stream duplicate phải được phát hiện theo source PK/event ID và payload hash; Kafka offset không thay event identity.

## 11. Sensitive-data decisions và scope gaps

- Bronze selected datasets vẫn chứa PII, account numbers, balance, transaction geo/IP và model reasoning. Cần encryption/access policy/retention trước implementation.
- Authentication secrets không có trong 22-table scope vì `customer_online_account`, `system_user` và `card` không được chọn; đây là data minimization có chủ ý, không phải source schema thay đổi.
- `employeeid`, `revieweruserid`, `cardid` vẫn xuất hiện dưới dạng FK nhưng referenced datasets ngoài scope. Silver giữ identifier để lineage; referential DQ đầy đủ là **SCOPE GAP**.
- Free-text/JSON không được log nguyên nội dung trong error messages. Quarantine phải có access policy ít nhất nghiêm bằng Bronze.

## 12. Coverage và trạng thái

- **DESIGNED:** 22 source tables, 194 source columns, batch Bronze representation, Silver names/types/transformation/DQ/sensitivity và streaming event mapping.
- **BLOCKED / SCHEMA GAP:** event contract fields và reliable mutable-table incremental như nêu trong `ingestion_design.md`.
- Không có source column nào được thêm hoặc giả định. Các field bắt đầu `_` và canonical envelope là target metadata/contract, được đánh dấu tách biệt với PostgreSQL source.
