# Rà soát web D4 Bank — Admin, Nhân viên, Khách hàng

Ngày: 01/11/2026. Phạm vi: frontend và các endpoint NestJS phục vụ web. Các thay đổi có sẵn trong working tree được giữ nguyên. Đợt rà soát này không sửa schema PostgreSQL, SQL nghiệp vụ, policy risk, posting hay outbox; không tạo giao dịch tài chính thật.

## Các lỗi đã sửa

| Nhóm | Vấn đề và thay đổi |
| --- | --- |
| Bố cục | Nhân viên dùng cùng quy tắc workspace với Admin. Thẻ, Fraud và Nhật ký áp dụng bố cục responsive chung; cột phụ xuống dưới bảng trên màn hình hẹp. Bộ lọc và tab không đè lên bảng. |
| Banner | Thẻ, Insights và Nhật ký trước đây cắt trực tiếp ảnh chụp thiết kế, làm lộ header cũ hoặc mất tiêu đề khi đổi chiều cao. Dùng `StaffHero` với chữ HTML và ảnh trang trí được giới hạn riêng. |
| Danh sách | Chi nhánh chuyển sang phân trang đo số dòng dùng chung. Các trang dùng số dòng vừa vùng hiển thị trên desktop, số dòng hữu hạn trên điện thoại; không thêm bản ghi giả để lấp chỗ trống. |
| Dữ liệu phân trang | Dùng chung `loadAllPages` cho các tập dữ liệu được cấp quyền. Kiểm tra số trang, page size, tổng, ID rỗng và bản ghi trùng; báo tải lại khi tập dữ liệu thay đổi. Thống kê không phụ thuộc trang đang xem. |
| Trình bày | Chuẩn hóa ngày/giờ Việt Nam, timestamp không có timezone, ngày sinh, tiền tệ và giá trị thiếu. Không tự đổi trạng thái chưa biết thành đang hoạt động hoặc tạm nghỉ. |
| Hồ sơ | Nút hồ sơ của ba role mở trang hồ sơ tương ứng. Nhân viên/Admin dùng cùng cấu trúc thông tin và quy tắc đổi mật khẩu với Khách hàng: xác nhận, báo lỗi, khóa biểu mẫu và ngăn đóng khi đang gửi. |
| Thông báo | Chuông và trang dùng chung trạng thái đã đọc theo tài khoản. Có trạng thái tải/lỗi/thử lại; lỗi tải không hiển thị thành danh sách rỗng. Nhãn thông báo khách hàng dùng chung tiếng Việt. Đồng bộ trong bộ nhớ khi trình duyệt chặn lưu trạng thái đã đọc. |
| Đăng nhập | Xử lý session không hợp lệ, JSON lỗi/null và phản hồi 401 đến muộn. Lỗi mật khẩu hiện tại không xóa phiên. Lỗi cập nhật token sau bước đăng ký thiết bị không biến lần đăng nhập thành công thành lỗi. |
| Phân quyền | JWT kiểm tra role và actor identity. Nhân viên thiếu branch bị từ chối; API quản lý kiểm tra đối tượng/chi nhánh trước thay đổi, gồm cả hai tài khoản của nghiệp vụ tại quầy. Giữ các lời gọi hàm nghiệp vụ hiện có. |
| Báo cáo | Nhân viên lấy báo cáo PostgreSQL của chi nhánh qua `/admin/branch-dashboard`, không gọi Gold toàn hệ thống. Lọc ngày bao gồm hết ngày kết thúc. Gold dành cho Admin, kiểm tra dataset allowlist và giới hạn số dòng. |
| Trino | Giới hạn thời gian chờ kết nối và truy vấn; lỗi kết nối/phản hồi sai định dạng trả lỗi dịch vụ. Sắp xếp dữ liệu theo ngày mới nhất trước khi áp giới hạn. |
| Mã dư | Loại bỏ popup hồ sơ cũ và stylesheet hồ sơ không còn import. TypeScript bật kiểm tra import/biến/tham số không dùng; quét module frontend không tìm thấy module ngoài app không được tham chiếu. Các xóa file có sẵn trước đợt này không được hoàn tác. |
| Điều hướng | Đường dẫn có segment thừa trả 404; kiểm tra chuyển hướng khi người dùng đi vào role khác. |

## Phạm vi kiểm tra

- Admin: tổng quan, chi nhánh, nhân viên, khách hàng, tài khoản, giao dịch, khoản vay, thẻ, Fraud & Review, Insights, nhật ký, thông báo, hồ sơ, giới thiệu, tin tức.
- Nhân viên: tổng quan, khách hàng, tài khoản, giao dịch, khoản vay, thẻ, Fraud & Review, báo cáo chi nhánh, thông báo, hồ sơ, giới thiệu, tin tức.
- Khách hàng: trang chủ, tài khoản, chuyển tiền, lịch sử giao dịch, khoản vay, thẻ, thông báo, hồ sơ, giới thiệu, tin tức.
- Trang đăng nhập, đăng ký/hướng dẫn cấp tài khoản, khôi phục mật khẩu/hỗ trợ và 404.

## Xác minh

- Frontend `npm run test:web`: **35/35** kiểm tra dữ liệu, trạng thái, CSV, phân trang, ngày giờ, tiền tệ, session và API client.
- Backend `npm run test:web`: **8/8** kiểm tra branch scope, JWT/role, API quản lý, tài khoản của nghiệp vụ tại quầy, allowlist analytics và lỗi/phân trang Trino.
- Frontend/backend TypeScript và production build: đã chạy thành công.
- Browser audit: 37 route × 4 viewport (1536×1024, 1366×768, 1100×640, 375×812). Kiểm tra tràn ngang, lỗi JavaScript, gọi API sai role, chồng cột, dòng cuối bảng/pagination và vùng chữ banner. **148/148 đã qua**, không có lỗi JavaScript hoặc gọi API sai role trong tập kiểm tra.
- Browser interactions: lọc/xem thẻ, kết quả Fraud rỗng, danh mục chi nhánh trong biểu mẫu theo role, đổi mật khẩu cả ba role (validation, lỗi/retry, pending locking), khoảng ngày báo cáo, chọn nguồn chuyển tiền và xác minh lại người nhận, lỗi đăng nhập, thông báo lỗi/retry/đồng bộ khi storage bị chặn. Đã qua với API mock.
- Health API thật `GET /api/v1/health`: trả `status: ok` và database `D4Bank`.
- `git diff --check`: đã qua.

Các browser test dùng múi giờ America/New_York để phát hiện lệch ngày so với ngày ngân hàng Việt Nam. API được mock toàn bộ, gồm các thay đổi mật khẩu; browser audit chỉ cho phép GET. Ảnh và kết quả ở `/tmp/d4-web-audit` là artifact cục bộ; mã test được lưu trong `web/tests/browser`.

## Giới hạn thực tế

- Health xác nhận kết nối PostgreSQL tại thời điểm kiểm tra; không chứng minh mọi hàm nghiệp vụ/Gold hoặc dữ liệu thật đều đúng.
- Chưa chạy E2E giao dịch/OTP, email, worker và Trino với hạ tầng thật trong đợt này. Kiểm tra backend dùng mock, không thay thế integration test PostgreSQL.
- Các chức năng chưa có hợp đồng API (ví dụ sửa ảnh đại diện, chỉnh hồ sơ trực tiếp, sinh trắc học, một số dịch vụ thẻ) tiếp tục hiển thị hướng dẫn hoặc trạng thái chưa hỗ trợ; không giả lập thành công.
- Trạng thái đã đọc thông báo vẫn lưu ở trình duyệt theo tài khoản; không đồng bộ giữa các thiết bị. Header đếm trong các thông báo gần đây đang tải.
- Insights vẫn có giới hạn 1.000 dòng tổng hợp mỗi dataset và có cảnh báo khi chạm giới hạn; không coi đó là tổng toàn bộ lịch sử.
- Nếu chạy API bằng Docker image đã build từ trước, cần build lại `banking-api` để dùng thay đổi source backend. Đợt này không thay thế container API đang phục vụ.

## Chạy lại

Xem `web/README.md`. Frontend: `npm run test:web`, `npm run typecheck`, `npm run build`. Backend: `npm run test:web`, `npm run typecheck`. Browser: phục vụ bản production ở cổng 3001 rồi chạy `npm run test:browser` với Playwright/Chromium có sẵn.

Cập nhật tiếp theo: đã bổ sung và triển khai quyền chuyển khoản tại quầy cho staff. Xem [counter-transfer-access.md](counter-transfer-access.md) cho hợp đồng, xác minh và giới hạn; thay đổi này cập nhật phần ghi chú trước đó về container API chưa được thay thế.
