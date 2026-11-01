# Chuyển khoản tại quầy cho Nhân viên

Ngày 01/11/2026. Nhân viên và Admin có nút **Chuyển khoản tại quầy** trong trang Giao dịch. Khách hàng tiếp tục dùng luồng chuyển khoản và OTP hiện có.

## Hợp đồng quyền và dữ liệu

- `GET /api/v1/transactions/counter-transfers/sources/:id/holders`: chỉ staff, người có quyền trên tài khoản nguồn đang hoạt động; giới hạn chi nhánh của Nhân viên.
- `POST /api/v1/transactions/counter-transfers`: chỉ staff; nhân viên phải còn hoạt động, role/branch phải khớp dữ liệu hiện tại. Backend kiểm tra người yêu cầu có quyền sử dụng tài khoản nguồn VND của chi nhánh; tài khoản nhận phải là tài khoản khách hàng VND đang hoạt động và có chủ tài khoản hợp lệ. Người nhận được phép ở chi nhánh khác.
- Tra cứu người nhận qua endpoint destinations hiện có được mở cho staff; giao dịch online vẫn yêu cầu `customerId` và OTP như trước.
- Request gồm customerId, sourceAccountId, destinationAccountId, amount, UUID idempotencyKey, customerVerified=true và description tùy chọn. Client không được chọn kênh hoặc tự cung cấp employeeId. Kênh luôn là Counter; nhân viên lấy từ phiên và kiểm tra lại với database.
- `customerVerified` là xác nhận nghiệp vụ của nhân viên về việc đã kiểm tra danh tính/quyền/yêu cầu của khách hàng tại quầy. Nó không phải cơ chế xác minh giấy tờ tự động hoặc OTP.

## Toàn vẹn tài chính

`CounterTransferService` dùng `DatabaseService.transaction` để kiểm tra quyền, lấy advisory lock theo mã yêu cầu, gọi `banking_api.create_transfer` hiện có và ghi audit trong cùng transaction. Không sửa PostgreSQL schema, stored function tài chính, trigger bất biến, threshold risk hay outbox.

Mã idempotency có namespace theo user thực hiện. Retry cùng lệnh trả kết quả cũ; đổi khách hàng, nguồn, đích, tiền hoặc nội dung với cùng mã trả 409. UI giữ nguyên lệnh/mã khi lỗi mạng hoặc 5xx, kể cả đóng/mở lại hộp thoại trong trang hiện tại; không cho chỉnh nội dung khi chưa biết kết quả. Bản nháp không được lưu bền qua reload/điều hướng: nếu rời trang khi chưa rõ kết quả, phải tra cứu lịch sử trước khi lập lệnh mới.

Core tiếp tục chịu trách nhiệm kiểm soát rủi ro, khóa tài khoản theo thứ tự, kiểm tra số dư, posting cân bằng, trạng thái và outbox. `Pending`, `Cancelled`, `Failed` không bị đổi thành `Success` trên UI. Kết quả chờ kiểm tra hiển thị rõ tiền chưa được hạch toán.

Không cập nhật `bank_transaction.employeeid` sau khi core trả thành công vì lịch sử tài chính đã được bảo vệ bất biến. Nhân viên được truy vết bằng audit context userId và bản ghi `COUNTER_TRANSFER_REQUEST` chứa employeeId, customerId và xác nhận yêu cầu. Audit thất bại làm rollback cả giao dịch.

## Xác minh

- Backend: 13 test đã qua, gồm 5 test mới cho role/branch/owner/attestation, trạng thái core, audit, idempotency/conflict, holder lookup và rollback/release của transaction wrapper.
- Frontend: 35 test đã qua; TypeScript và production build đã qua.
- Browser: Admin/Nhân viên ở desktop và điện thoại; chọn nguồn/người yêu cầu, xác minh tên nhận, bước kiểm tra, checkbox bắt buộc, khóa lúc gửi, retry cùng UUID sau 503/đóng-mở modal và kết quả Pending. Khách hàng không thấy nút tại quầy. API mock; không chuyển tiền thật.
- Bố cục trang Giao dịch: 12/12 lượt kiểm tra cho ba role ở bốn viewport sau khi thêm nút mới.
- API thật sau build/recreate container: staff holder lookup 200; staff với nguồn hợp lệ/đích không tồn tại trả 422 và không tạo transfer; thiếu attestation bị validation 400; customer role trả 403. Các POST thật đều bị từ chối trước xử lý tài chính.
- Container banking-api đã cập nhật; healthcheck dùng 127.0.0.1 để tránh localhost trỏ IPv6 trong Alpine trong khi API nghe IPv4. Healthcheck đã healthy và PostgreSQL health trả ok.

Chưa chạy một lệnh chuyển khoản thật có commit. Các worker/container khác không được recreate; không chạy bootstrap hoặc reset dữ liệu.
