# Màn hình kết quả giao dịch dùng chung

Áp dụng cho các luồng tài chính hiện có trong web: chuyển tiền Khách hàng, chuyển khoản tại quầy, nạp/rút tại quầy của Nhân viên và Admin. Mẫu cũng được dùng khi xem chi tiết giao dịch từ lịch sử ba role và danh sách gần đây/tài khoản/thẻ của Khách hàng. Không thêm luồng tài chính hoặc API ghi mới trong đợt này.

## Trạng thái

| Nguồn kết quả | Giao diện |
| --- | --- |
| Success / Thành công | Biểu tượng xanh, xác nhận giao dịch đã hạch toán |
| Failed / Thất bại | Màn hình không thành công, kiểm tra chi tiết/lịch sử |
| Cancelled / Đã hủy | Màn hình giao dịch bị hủy, không đổi thành Success |
| Pending / Đang xử lý | Màn hình chờ kiểm tra, nhắc không tạo thêm lệnh trùng |
| API từ chối yêu cầu 4xx | Màn hình yêu cầu chưa được chấp nhận, hiển thị nguyên nhân |
| Lỗi mạng/5xx hoặc phản hồi tài chính thiếu/sai | Màn hình chưa xác định kết quả; không kết luận đã trừ hay chưa trừ tiền |

ALLOW/REVIEW/BLOCK và trạng thái lạ không được coi là Success. Chỉ phản hồi tài chính có định danh, mã, số tiền dương hợp lệ và trạng thái cuối/đang chờ trong hợp đồng được đưa vào luồng kết quả API thành công. JSON null, thiếu trường hoặc trạng thái sai được xử lý như lỗi chưa xác định; giữ mã yêu cầu/thông tin đã gửi cho retry. Lỗi OTP trước khi gửi lệnh vẫn hiển thị trong biểu mẫu OTP.

## Thành phần

- `web/src/components/transaction-result.tsx` và CSS: trạng thái, biểu tượng, số tiền, mã, thời gian, chi tiết, nút sao chép/tải thông tin/xem lịch sử. Có nhãn trạng thái và thông báo cho trình đọc màn hình, tự đưa vùng tiêu đề vào tầm nhìn.
- `TransactionRecordResult`: dùng dữ liệu API trực tiếp cho màn xem lịch sử; giữ đúng loại tiền và chế độ ẩn số dư. Bản tải xuống khi đang ẩn cũng chỉ chứa giá trị đã ẩn.
- `TransactionResultButton`: thay phần xem giao dịch chung của staff bằng cùng mẫu kết quả.
- `web/src/lib/transaction-outcome.ts`: quy tắc trạng thái và kiểm tra cấu trúc phản hồi tài chính.

Chỉ có mã giao dịch thực tế mới hiện nút sao chép/tải. File văn bản được gọi là “Thông tin giao dịch”, giữ đúng trạng thái; không biến thông tin Pending/Failed thành biên lai thành công. Màn lỗi gửi lệnh giữ nguyên cơ chế idempotency và khóa chỉnh sửa khi chưa biết kết quả hiện có. Không tự gửi lại lệnh, không đổi nonce để che lỗi, không sửa backend/SQL/policy risk/posting/outbox.

## Xác minh

- 38/38 unit test frontend đã qua, gồm trạng thái, lỗi chưa xác định và phản hồi tài chính không hợp lệ.
- TypeScript và production build đã qua.
- 43 trường hợp browser đã được bao phủ qua lượt ma trận và lượt bổ sung phản hồi sai: chuyển tiền khách hàng; counter transfer cả hai role staff; nạp/rút cả hai role; lịch sử ba role; chi tiết từ Trang chủ/Tài khoản/Thẻ. Bao gồm mobile, lỗi API 422/503, response 200 null, retry giữ nguyên nội dung/mã và ẩn số dư.
- Sao chép mã và nội dung file tải xuống đã được kiểm tra; file giữ đúng trạng thái thành công/thất bại/chờ/hủy.
- Tất cả request tài chính trong browser test dùng mock; không chuyển tiền hoặc tạo giao dịch thật. Ảnh kiểm tra cục bộ ở `/tmp/d4-results`.

Chạy: phục vụ bản production trên cổng 3001, rồi chạy `node tests/browser/transaction-results.mjs` với Playwright/Chromium có sẵn. `RESULT_STATUS=MALFORMED` chạy riêng trường hợp response 200 null; `WEB_AUDIT_URL` đổi địa chỉ web. `npm run test:browser` đã bao gồm bài kiểm tra mới.
