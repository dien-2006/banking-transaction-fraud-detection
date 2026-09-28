# Đặc tả mô hình Gold

## 1. Phạm vi và trạng thái

Gold phục vụ Reporting/Analytics của hệ thống ngân hàng giả lập và phân tích rủi ro chuyển khoản. ML Feature Mart là nhánh riêng từ Silver; tài liệu này không định nghĩa training dataset.

- **ĐÃ CHỐT:** cấu trúc Gold mong muốn gồm 14 dimension và 6 fact dưới đây.
- **Đặc tả thiết kế:** grain, khóa, measure, cập nhật và đối soát trong tài liệu này là phương án triển khai sau trao đổi về mô hình Gold.
- **CHƯA LẬP TRÌNH / CHƯA CHẠY KIỂM CHỨNG:** chưa có DDL Gold, ETL hay kết quả đối soát cho mô hình này.
- **ĐỀ XUẤT MỚI, ngoài phạm vi chính:** các bảng bổ sung ở mục 8.

Nguồn schema nghiệp vụ: `sql/create_table.sql`. Gold nhận dữ liệu đã chuẩn hóa từ Silver; tên bảng nghiệp vụ trong tài liệu chỉ nguồn gốc dữ liệu, không yêu cầu Gold đọc trực tiếp PostgreSQL.

## 2. Danh mục dimension

Dùng surrogate key `<entity>_key` trong Gold, giữ khóa nguồn để truy vết. `dim_date` dùng `date_key` dạng YYYYMMDD. Dimension phân loại giữ mã nghiệp vụ ổn định. Dự phòng thành viên UNKNOWN và NOT_APPLICABLE riêng biệt; không âm thầm bỏ fact khi thiếu dimension.

| Dimension | Khóa nghiệp vụ / nguồn | Thuộc tính chính | Chính sách lịch sử |
|---|---|---|---|
| dim_date | Ngày theo Asia/Ho_Chi_Minh | Ngày, tháng, quý, năm, thứ | Sinh lịch, không SCD |
| dim_customer | customerid / customer | Mã khách hàng, loại, phân khúc, trạng thái | SCD2 cho phân khúc/loại/trạng thái cần báo cáo lịch sử |
| dim_account | accountid / bank_account | Số tài khoản, loại, chi nhánh, category, trạng thái | SCD2 cho loại/chi nhánh/category/trạng thái; không chứa balance biến động |
| dim_account_type | accounttypeid / account_type | Tên loại, mô tả, trạng thái | SCD1; nếu cần lịch sử lãi suất/hạn mức phải đặc tả riêng |
| dim_branch | branchid / branch | Mã, tên, thành phố, trạng thái | SCD1 ban đầu; không dùng để khẳng định lịch sử địa giới/tổ chức |
| dim_channel | Mã kênh, danh mục chuẩn hóa | Mã nguồn, hệ mã nguồn, tên hiển thị | Tĩnh; giữ phân biệt Account/Online của loan payment với kênh giao dịch |
| dim_transaction_type | transactiontypeid / transaction_type | TRANSFER, DEPOSIT, WITHDRAWAL, LOAN_PAYMENT, OPENING_BALANCE, REVERSAL | SCD1 |
| dim_transaction_status | bank_transaction.status | Pending, Success, Failed, Cancelled | Tĩnh; không dùng cho transfer request hay login |
| dim_device | deviceid / customer_device | Loại thiết bị, OS, trusted, trạng thái | SCD2 cho thuộc tính thay đổi cần báo cáo lịch sử |
| dim_card | cardid / card | Loại thẻ, ngày cấp/hết hạn, trạng thái | SCD2 cho trạng thái/loại; không đưa PIN hash vào Gold |
| dim_loan_type | loantypeid / loan_type | Tên loại, kỳ hạn tối đa, lãi suất mặc định | SCD1; lãi suất thực tế của hợp đồng nằm tại fact_loan |
| dim_loan_status | loan.status | Pending, Active, Paid, Overdue, Cancelled | Tĩnh |
| dim_decision | risk_assessment.decision | ALLOW, REVIEW, BLOCK | Tĩnh |
| dim_fraud_label | fraud_label_event.label | FRAUD, LEGITIMATE, UNKNOWN | Tĩnh; UNKNOWN nguồn khác với chưa có sự kiện nhãn |

SCD2 dùng `effective_from`, `effective_to` (cận trên loại trừ), `is_current`; không cho khoảng hiệu lực chồng lấn trên cùng khóa nguồn. Chỉ dựng lịch sử có bằng chứng từ event/history. Snapshot hiện tại không đủ để suy ra thuộc tính quá khứ; phần không biết phải được đánh dấu. Lưu cả thời điểm nghiệp vụ và thời điểm ingestion để xử lý dữ liệu đến muộn.

Không sao chép password hash, PIN hash hoặc thông tin định danh không cần thiết vào Gold. Chỉ đưa thông tin cá nhân phục vụ use case đã xác định.

## 3. Grain, khóa và measure của fact

Mỗi fact có surrogate key riêng, đồng thời UNIQUE trên định danh nguồn ở bảng dưới (kèm source_system nếu tích hợp nhiều nguồn). Các ID liên kết như transactionid được giữ để truy vết, không thay thế dimension key.

| Fact | Grain và khóa nguồn duy nhất | Dimension / liên kết | Measure |
|---|---|---|---|
| fact_transaction | Một bank_transaction; transactionid | Date giao dịch, customer khởi tạo, channel, transaction type/status, device, card; source/destination account cho TRANSFER qua transfer_request | amount, fee, transaction_count=1 |
| fact_transaction_posting | Một transaction_posting; postingid | Date posting, account, account type, branch của tài khoản; transactionid | amount, debit_amount, credit_amount, posting_count=1; posting_type là thuộc tính phân loại |
| fact_login | Một login_event; logineventid | Date đăng nhập, customer, device | login_count=1, success_count, failed_count, blocked_count; login_status giữ mã riêng |
| fact_loan | Một loan; loanid | Customer, branch giải ngân, loan type/status; date bắt đầu/kết thúc | principalamount, interestrate, termmonths, loan_count=1 |
| fact_loan_payment | Một loan_payment; loanpaymentid | Date thanh toán, channel thanh toán, customer và loan type tra qua loan; loanid, scheduleid, transactionid | amountpaid, principalpaid, interestpaid, penaltyfee, payment_count=1 |
| fact_fraud | Một risk_assessment; riskassessmentid | Date đánh giá, decision; transactionid, modelversionid; customer/channel/device từ giao dịch nếu có | riskscore, assessment_count=1 |

Giữ timestamp chi tiết ngoài date_key. Chuẩn hóa timestamp nguồn theo múi giờ cấu hình; nguồn SQL dùng TIMESTAMP không timezone nên không tự coi dữ liệu nguồn là UTC.

`fact_fraud` đếm lần đánh giá, không mặc định đếm giao dịch. Số giao dịch được đánh giá dùng COUNT DISTINCT transactionid. Khi cần quyết định cuối cùng, chọn assessedat lớn nhất, rồi riskassessmentid lớn nhất làm tie-break; đây là quyết định đánh giá gần nhất, không tự chứng minh quyết định nào đã được backend dùng để posting.

## 4. Vai trò dimension và quy tắc tổng hợp

- `dim_date`: dùng nhiều FK theo vai trò, ví dụ transaction_date_key, assessed_date_key, start_date_key, end_date_key.
- `dim_account`: giao dịch chuyển khoản có source_account_key và destination_account_key. Giao dịch khác không tự gán một tài khoản từ posting nhiều dòng.
- `dim_branch`: phân biệt source_branch_key, destination_branch_key và terminal_branch_key khi cần. Không gộp thành một branch_key mang nghĩa không rõ. Với loan, branch là chi nhánh trên hợp đồng.
- `dim_customer`: customer khởi tạo giao dịch không nhất thiết là chủ sở hữu duy nhất của tài khoản. Không join toàn bộ ACCOUNT_HOLDER vào fact khiến nhân dòng.
- Với fact lịch sử, tra SCD2 theo thời điểm nghiệp vụ khi lịch sử khả dụng. Thuộc tính cập nhật hiện tại của khoản vay phải được hiểu là hiện tại, không đại diện trạng thái khoản vay trong quá khứ.
- Amount/fee cộng được trong grain tương ứng; interestrate, riskscore và termmonths không phải measure cộng được. Trung bình phải công bố mẫu số và cách trọng số.
- Tổng giá trị chuyển tiền thành công: SUM(amount) từ fact_transaction, lọc type=TRANSFER và status=Success. Tổng mọi trạng thái chỉ là giá trị yêu cầu/giao dịch ghi nhận, không phải tiền đã chuyển.
- Debit/Credit biểu diễn hai phía posting. Không cộng cả hai để tính doanh số. Chênh lệch credit-debit chỉ được dùng theo quy ước tài khoản đã xác định, không mặc định là số dư hiện tại.
- REVERSAL là giao dịch riêng liên kết originaltransactionid. Báo cáo net phải xác định quy tắc bù trừ; không xóa giao dịch gốc.
- Không join trực tiếp các fact một-nhiều rồi SUM amount. Aggregate từng fact về cùng grain trước khi kết hợp.
- Processing time chưa có đủ timestamp hoàn tất trong schema hiện tại: chưa đưa vào measure chính thức và không dùng ingestion time thay thời điểm hoàn tất.

## 5. Nhãn gian lận và review

Trong phạm vi 6 fact, fact_fraud có thể bổ sung `latest_fraud_label_key`, `latest_label_event_id`, `latest_labeledat`, `latest_label_source` và `has_label_event` dưới dạng enrichment cập nhật. Nhãn mới nhất chọn theo labeledat, rồi fraudlabeleventid. Mọi nhãn có nguồn từ FRAUD_LABEL_EVENT; không suy ra nhãn từ decision hoặc REVIEW_CASE.

Đây là **nhãn mới nhất tại lần refresh Gold**, có thể xuất hiện sau assessedat. Không dùng các cột enrichment này làm feature tại thời điểm scoring. Nếu cùng một giao dịch có nhiều assessment, nhãn có thể lặp trên nhiều dòng: số giao dịch fraud phải đếm distinct transactionid hoặc dùng view một dòng mỗi giao dịch.

`has_label_event=false` nghĩa chưa có sự kiện nhãn; khác với có sự kiện mang label UNKNOWN. Báo cáo đánh giá model cần chọn cohort, quy tắc chọn assessment, phiên bản model, mốc cắt nhãn và xử lý giao dịch chưa có nhãn. Không tính giao dịch chưa xác minh là LEGITIMATE.

REVIEW_CASE là quy trình vận hành; không flatten nhiều review vào fact_fraud. Báo cáo lịch sử review hoặc lịch sử thay đổi nhãn cần bảng bổ sung tại mục 8.

## 6. Cập nhật và dữ liệu đến muộn

| Fact | Cách cập nhật |
|---|---|
| fact_transaction | MERGE theo transactionid khi trạng thái/thông tin nguồn thay đổi; một dòng giữ trạng thái mới nhất, không giữ toàn bộ lịch sử chuyển trạng thái |
| fact_transaction_posting | Insert theo postingid, deduplicate replay; thay đổi nguồn bất thường phải đối soát, không tự ghi thêm dòng trùng |
| fact_login | Insert theo logineventid, deduplicate replay |
| fact_loan | MERGE theo loanid; giữ trạng thái mới nhất và điều khoản hiện có; chưa hỗ trợ dư nợ lịch sử |
| fact_loan_payment | Insert theo loanpaymentid, deduplicate replay; chỉ tính thanh toán đã thực thi khi bank_transaction liên kết Success |
| fact_fraud | Insert theo riskassessmentid, deduplicate; refresh enrichment nhãn khi có label event mới |

Không dựa duy nhất vào MAX(transactiondate) để lấy delta: trạng thái có thể đổi sau ngày tạo và nhãn có thể đến muộn. Silver cần event/change metadata đủ xác định cập nhật mới hơn. Hợp đồng event, version/order và watermark chưa được hiện thực; trước ETL phải xác định chúng. Event cũ replay không được ghi đè trạng thái mới.

Fact đến trước dimension có thể dùng unknown/inferred member và được backfill khi dimension đến. Mỗi job cần checkpoint, ingestion timestamp và kiểm tra UNIQUE để chạy lại không tăng số dòng. Snapshot nguồn/đối soát định kỳ bổ sung cho các thay đổi chưa có event.

## 7. Đối soát và tiêu chí nghiệm thu

Đối soát cùng khoảng thời gian và cùng cutoff dữ liệu; phân biệt chênh lệch do late arrival với lỗi thực sự.

1. Mỗi grain duy nhất; số dòng fact khớp số định danh nguồn trong phạm vi được chọn, sau deduplicate.
2. Dimension FK hợp lệ; unknown được theo dõi tỷ lệ; SCD2 không chồng lấn.
3. fact_transaction: số lượng theo type/status/channel và tổng amount/fee khớp Silver.
4. fact_transaction_posting: tổng Debit bằng tổng Credit cho từng giao dịch Success; không có posting tiền cho giao dịch Pending/Failed/Cancelled. Trạng thái bị từ chối ở transfer_request cũng không được có posting. Không ép tổng mỗi phía bằng transaction.amount khi có fee hoặc nhiều posting.
5. fact_login: success_count + failed_count + blocked_count = login_count; tổng theo status khớp nguồn.
6. fact_loan: số khoản vay và tổng principal theo trạng thái khớp nguồn; không gọi tổng principal là dư nợ còn lại.
7. fact_loan_payment: amountpaid = principalpaid + interestpaid + penaltyfee; đối chiếu giao dịch liên kết và trạng thái thực thi.
8. fact_fraud: số assessment theo modelversionid/decision khớp nguồn; riskscore trong [0,1]; nhãn truy được sự kiện nguồn.
9. Replay cùng input không đổi số dòng/tổng tiền; thử cập nhật trạng thái, nhãn đến muộn và dimension đến muộn.
10. Sai lệch tài chính phải được báo lỗi/cách ly, không tự sửa tổng tiền để báo cáo khớp.

Đối soát số dư tài khoản cần số dư đầu kỳ và tập posting đầy đủ với quy ước dấu đã chốt; không suy ra từ một cửa sổ dữ liệu thiếu lịch sử.

## 8. Các bảng bổ sung được đề xuất

Các bảng dưới đây chưa thuộc phạm vi 14 dimension + 6 fact đã chốt:

- dim_model_version: mô tả model/rule, phục vụ so sánh phiên bản. Tạm giữ modelversionid tại fact_fraud để không mất liên kết.
- fact_fraud_label_event: một dòng mỗi sự kiện nhãn, giữ lịch sử xác minh và hỗ trợ báo cáo theo cutoff.
- fact_review_case: một dòng mỗi hồ sơ review; nếu cần lịch sử từng bước cần nguồn event riêng.
- bridge_account_holder: hỗ trợ báo cáo theo các chủ tài khoản/người được ủy quyền và thời gian hiệu lực. Cần quy tắc phân bổ/đếm distinct trước khi dùng tổng tiền.
- fact_account_daily_snapshot: số dư cuối ngày nếu dashboard yêu cầu.
- Fact lịch trả nợ và/hoặc snapshot khoản vay: phân tích đến hạn, quá hạn, dư nợ theo thời gian.

## 9. Thứ tự triển khai đề xuất

1. Core transfer và hợp đồng event đủ tin cậy.
2. Bronze/Silver cho giao dịch, posting, transfer request, risk assessment và dimension cần thiết.
3. Gold transaction/posting/fraud cùng dashboard cơ bản và đối soát.
4. Mở rộng login, loan, loan payment.
5. Chỉ bổ sung snapshot, bridge và lịch sử review/label khi use case cần.

Thiết kế này không thay đổi luồng realtime: Request → Scoring → Decision → Posting → Commit; Kafka và Gold nằm sau commit.
