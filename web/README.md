# D4 Bank Web

## Chạy development

```bash
cd web
npm install
npm run dev
```

Mở `http://localhost:3000` và đăng nhập bằng tài khoản đã được tạo trong PostgreSQL.
Banking API NestJS cần chạy tại `http://localhost:8000`; có thể đổi địa chỉ bằng
`NEXT_PUBLIC_API_URL` trong cấu hình môi trường của web.

## Kiểm tra production build

```bash
npm run typecheck
npm run test:web
npm run build
npm start
```

## Các trang đang sử dụng

`src/app/[role]/[[...slug]]/page.tsx` chọn trang cho Admin, Nhân viên và Khách hàng.
Các đường dẫn không được hỗ trợ trả về trang 404. Tổng quan Admin/Nhân viên dùng
`AdminOverview`; khách hàng dùng các trang riêng trong `src/features/customer`.

Khách hàng có trang chủ, tài khoản, chuyển tiền, lịch sử giao dịch, khoản vay,
thẻ, thông báo và hồ sơ. Số dư, giao dịch, khoản vay, thẻ và hồ sơ lấy từ Banking
API theo phiên đăng nhập. Cache được tách theo người dùng và xóa khi đổi phiên.
Các fixture số dư và giao dịch cũ đã được loại bỏ.

D4 Insights là trang báo cáo phân tích của admin, dùng dữ liệu Gold qua Trino.
Các biểu đồ được bố trí theo hàng với chiều cao tối thiểu, hỗ trợ cuộn trang
và hiển thị trên điện thoại; giữ bộ lọc ngày và các mục phân tích hiện có.

Tổng quan nghiệp vụ lấy PostgreSQL qua API dashboard. Tổng khách hàng theo
cùng phạm vi danh sách khách hàng: liên kết tài khoản/khoản vay tại chi nhánh,
hoặc hồ sơ chưa được gán chi nhánh do chính nhân viên tạo (theo audit).
KPI là tổng lũy kế; dòng bên dưới là phát sinh tháng và so với tháng trước.
Kỳ báo cáo dùng `SOURCE_TIMEZONE`, không cộng dữ liệu phát sinh tương lai vào
biểu đồ tháng/ngày. Giao dịch rủi ro tính theo đánh giá mới nhất mỗi giao dịch;
review đang chờ lấy trạng thái OPEN/IN_REVIEW, không suy ra từ trạng thái giao dịch.
Thống kê từng chi nhánh chỉ tính khách hàng đã có liên kết tại chi nhánh, nên
không gồm hồ sơ mới chưa được gán. Bảng rủi ro/review hỗ trợ cuộn ngang;
thiếu điểm/xác suất hiển thị Chưa đánh giá thay vì gán 0.

Danh sách giao dịch, khách hàng, nhân viên, tài khoản và khoản vay tải đủ các
trang API trong phạm vi được cấp quyền trước khi tìm kiếm và tính thống kê.
Đổi trang hoặc lọc danh sách không làm thay đổi các chỉ số tổng. Phản hồi phân
trang chồng lặp hoặc thay đổi tổng được báo lỗi để người dùng tải lại.
Các bảng phân trang dùng chiều cao hàng thực tế để thêm/bớt bản ghi theo khung
hiển thị, kể cả khi đổi kích thước màn hình hoặc cỡ chữ. Không thêm hàng rỗng
và không thay đổi dữ liệu nguồn; danh sách tài khoản khách hàng vẫn cố định
2 tài khoản/trang. Chạy `npm run test:lists` để kiểm tra bố cục các bảng.
Danh sách khách hàng hiển thị Địa chỉ từ `address` và Phân khúc từ
`customersegment`; địa chỉ trống hiển thị dấu gạch, không lấy phân khúc thay thế.
Schema hiện tại chưa có trạng thái KYC, nên trang không hiển thị thống kê
xác minh; các chỉ số trạng thái lấy từ `customer.status`.

Trang Tài khoản tính Tổng số dư khách hàng (VND) từ tài khoản `CUSTOMER`
bằng VND trong phạm vi được cấp quyền; không cộng số dư đối ứng `INTERNAL`.
Danh sách vẫn hiển thị tài khoản nội bộ theo quyền. Tên chủ được tra cứu từ
hồ sơ khách hàng trong cùng phạm vi, dùng ID khi chưa có tên; bảng, chi tiết,
gợi ý gần đây và tìm kiếm dùng cùng tên chủ.

Trang Chi nhánh giữ banner, bộ lọc và bảng trong lúc tải dữ liệu. Mỗi yêu cầu
đọc danh sách có thời hạn 15 giây; khi lỗi, người dùng có thể bấm Thử lại.
Chạy `npm run test:branches` trên bản production local để kiểm tra trạng thái
tải, hết thời gian chờ, lỗi API, tải lại và danh sách rỗng trên desktop/mobile.

Thông báo nhân viên lấy từ API; trạng thái đã đọc lưu theo tài khoản trên trình
duyệt và đồng bộ với chuông thông báo. Các nút thêm mới dùng API quản lý hiện có.
Nhấn thông báo review/khoản vay (kể cả trong chuông thông báo) mở đúng hồ sơ
qua `reviewId`/`loanId` và tự mở hộp thoại chi tiết hoặc xử lý. Liên kết lấy ID
từ khóa thông báo `review-<id>`/`loan-<id>` do API cấp, không phân tích nội dung
hay tự suy ra tài khoản. Trang đích chỉ tìm trong dữ liệu được API cấp quyền;
hồ sơ không còn truy cập được có thông báo riêng, không mở hồ sơ thay thế.
Xóa bộ lọc/Đặt lại để trở về toàn bộ danh sách. Không tự phê duyệt từ liên kết.

Danh sách giao dịch tra `fullname` và `customercode` từ hồ sơ khách hàng được
cấp quyền theo `initiatedbycustomerid`. Danh sách, giao dịch gần đây, chi tiết
và tìm kiếm dùng cùng thông tin; không tạo mã khách hàng từ ID. Nếu chưa tra
được hồ sơ thì hiển thị rõ trạng thái thiếu tên và ID riêng, không gán tên giả.

Trang Thẻ và Fraud & Review cũng tra tên/mã khách hàng và số tài khoản từ
API hồ sơ/tài khoản theo cùng phạm vi quyền. Không hiển thị ID như số tài khoản
hoặc tự tạo mã khách hàng. Thẻ vẫn chỉ dùng số đã che; bảng rộng cuộn ngang
trong khung. Thống kê thẻ bị khóa theo trạng thái `Blocked` (Đã khóa).
Review gom tài khoản theo ID ổn định, độc lập với quá trình tải tên/số tài khoản;
mức rủi ro, điểm và quyết định vẫn lấy nguyên từ bản ghi đánh giá của DB.

Danh sách khoản vay tra tên khách hàng từ hồ sơ được cấp quyền, giữ ID khi
chưa tra được tên. Số tiền vay là `principalamount`; dư nợ theo lịch là
`outstandingamount` do view DB tổng hợp gốc, lãi và phí của kỳ chưa tất toán.
Hai chỉ số được ghi nhãn riêng; kỳ trả một phần cần đối soát số tiền còn lại.

Trang thẻ có tìm kiếm, lọc trạng thái, xem chi tiết và đổi PIN. Trang khoản vay
hiển thị lịch trả nợ. Hồ sơ hỗ trợ đổi mật khẩu; chuyển tiền dùng luồng xác minh
người nhận và OTP của API. Những dịch vụ chưa kết nối hiển thị hướng dẫn sử dụng.

Trang chuyển tiền hiển thị tài khoản nguồn, người nhận gần đây và thông tin hạn
mức ở cột bên phải. Tên người nhận được tự động tra cứu khi ngừng nhập số tài
khoản và được xác minh lại ở bước tiếp tục. Người nhận được lưu trong phiên trình duyệt sau giao dịch
thành công và luôn được xác minh lại trước khi chuyển. Tổng tiền đã chuyển hôm
nay tính theo tài khoản nguồn và ngày Việt Nam; hạn mức ngày chưa được API cung
cấp được hiển thị là chưa cập nhật.

Lịch sử giao dịch dùng bộ lọc phía trên, bảng 8 cột và cột tổng quan bên phải.
Bộ lọc ngày tính theo giờ Việt Nam; khoảng số tiền áp dụng cho VND. Thu/chi và
biểu đồ chỉ cộng giao dịch VND thành công với bên ngoài, bỏ qua chuyển giữa các
tài khoản của chính khách hàng. Tổng không đổi khi phân trang. Chọn kỳ ở cột
tổng quan chỉ đổi thống kê; xuất CSV lấy toàn bộ kết quả lọc, giữ đúng loại tiền
và trạng thái. Giao dịch thường gặp được nhóm từ lịch sử thành công thực tế.

Khoản vay khách hàng hiển thị các hợp đồng bên trái, lịch trả nợ và nhóm sản
phẩm đang sử dụng bên phải. Dư nợ theo lịch gồm gốc, lãi và phí các kỳ chưa tất
toán; tiến độ tính theo số kỳ hoàn tất. Lịch trả nợ và số tiền đến hạn trong
tháng được tổng hợp từ mọi khoản vay đang trả nợ, không phụ thuộc trang hay bộ
lọc. Nếu thiếu lịch hoặc khoản đã trả một phần chưa có số tiền đã trả, giao
diện yêu cầu tải lại/đối soát. Đăng ký khoản vay mới mở hướng dẫn liên hệ chi
nhánh; không gửi yêu cầu tới API quản lý dành cho nhân viên.

Trang thẻ khách hàng dùng các hình thẻ theo loại sản phẩm, bộ lọc, xem chi tiết
và đổi PIN. Số thẻ luôn được che, mạng thẻ chỉ hiện khi có trong tên loại thẻ.
Khung hạn mức hiển thị hạn mức giao dịch mỗi ngày, không suy ra dư nợ tín dụng.
Giao dịch gần đây lấy theo tài khoản liên kết, không gán giao dịch cho từng thẻ
khi API chưa có liên kết này. Mở/khóa thẻ, đổi hạn mức và đăng ký thanh toán
trực tuyến mở hướng dẫn liên hệ chi nhánh; đổi PIN dùng API khách hàng hiện có.

Hồ sơ cá nhân dùng thông tin đăng ký từ API, gồm khung cá nhân bên trái và bảo
mật, thông báo, hỗ trợ bên phải. Số định danh chỉ hiện phần cuối nếu được cung
cấp; không gán dấu xác minh hay trạng thái bật thông báo/sinh trắc học khi chưa
có dữ liệu. Đổi mật khẩu và xem thiết bị dùng API khách hàng. Chỉnh sửa hồ sơ,
lưu ảnh và thay đổi kênh nhận thông báo hiển thị hướng dẫn theo tính năng hiện
có; thời gian thiết bị hiển thị theo giờ Việt Nam.

Sidebar/header dùng kích thước chung trong `src/app/globals.css`. Khung khách hàng
dùng `customer-ui.css` và `customer-workspace.css`; trang chủ còn dùng
`customer-home.css` cho shell và banner. Trên desktop đủ chiều cao, danh sách
điều chỉnh số dòng theo phần không gian còn lại. Màn hình nhỏ có thể cuộn;
nội dung và bảng không dùng CSS zoom để thu nhỏ.

`public/customer-home-reference.png` cung cấp các vùng minh họa; văn bản và điều
khiển của giao diện vẫn là HTML.

TypeScript của frontend và backend bật `noUnusedLocals` và `noUnusedParameters`
để phát hiện biến, tham số và import thừa trong các lần kiểm tra tiếp theo.


## Kiểm tra giao diện ba role

`npm run test:web` chạy kiểm tra dữ liệu, phân trang, ngày giờ, tiền tệ,
phiên đăng nhập và xử lý lỗi API. `npm run typecheck` kiểm tra TypeScript;
`npm run build` kiểm tra bản production. Backend có `npm run test:web` riêng
trong thư mục `backend`, dùng database/Trino giả lập để kiểm tra phân quyền và
hợp đồng API, không tạo giao dịch trong PostgreSQL.

Để chạy kiểm tra trình duyệt, khởi động bản web ở cổng 3001 bằng
`npm run start -- --port 3001`, rồi chạy `npm run test:browser` ở terminal khác.
Môi trường cần có Playwright và Chromium; nếu module không nằm trong dependency
cục bộ, đặt `PLAYWRIGHT_MODULE` thành đường dẫn tới `playwright/index.mjs`.
`WEB_AUDIT_URL` đổi địa chỉ web và `WEB_AUDIT_OUTPUT` đổi thư mục ảnh/kết quả
(mặc định `/tmp/d4-web-audit`). `WEB_AUDIT_FILTER` lọc route bằng biểu thức chính quy
để chạy lại một nhóm trang. Các request API được chặn bằng fixture; bài kiểm
tra thao tác chỉ gửi thay đổi tới mock, không ghi vào database thật.

Báo cáo Nhân viên dùng `/admin/branch-dashboard` trong chi nhánh của phiên đăng
nhập; Gold analytics dành cho Admin. Backend kiểm tra chi nhánh trước các thao
tác quản lý của Nhân viên. Hồ sơ ba role dùng cùng cấu trúc thông tin và quy tắc
đổi mật khẩu; thông báo trên trang và chuông dùng chung trạng thái đã đọc theo
tài khoản. Banner Thẻ, Insights và Nhật ký dùng chữ HTML, chỉ lấy phần minh họa
từ ảnh thiết kế.

Chi tiết đợt rà soát: [web-three-roles-review.md](../docs/audit/web-three-roles-review.md).


Nhân viên và Admin có **Chuyển khoản tại quầy** trong trang Giao dịch. Nhân viên
chỉ chọn tài khoản nguồn thuộc chi nhánh của mình; tài khoản nhận có thể thuộc
chi nhánh D4 Bank khác. API tra cứu người có quyền trên tài khoản nguồn và tự
xác minh tên người nhận. Trước khi gửi, nhân viên kiểm tra bản xác nhận và xác
nhận đã xác minh yêu cầu của khách hàng tại quầy. Đây là xác nhận nghiệp vụ của
nhân viên, không phải OTP của khách hàng.

`POST /api/v1/transactions/counter-transfers` dành cho staff; yêu cầu
`customerId`, `sourceAccountId`, `destinationAccountId`, `amount`, UUID
`idempotencyKey`, `customerVerified: true` và `description` tùy chọn. Backend
ép kênh `Counter`, kiểm tra lại nhân viên/chi nhánh/chủ tài khoản, dùng hàm
`banking_api.create_transfer` hiện có và ghi audit nhân viên/xác nhận trong cùng
transaction. Gửi lại cùng mã nhưng đổi nội dung bị từ chối. Kết quả `Pending`
hiển thị chờ kiểm tra; không tự chuyển thành thành công. Luồng chuyển khoản
Khách hàng và OTP giữ nguyên. Kiểm thử riêng: `tests/browser/counter-transfer.mjs`.


Các giao dịch tài chính dùng màn hình kết quả chung: chuyển tiền Khách hàng,
chuyển khoản tại quầy và nạp/rút tại quầy. Mẫu này cũng hiển thị khi xem chi tiết
giao dịch trong lịch sử của ba role, danh sách gần đây và giao dịch tài khoản
liên kết thẻ của Khách hàng. Có số tiền/loại tiền, mã, thời gian, thông tin liên
quan, sao chép mã và tải thông tin dạng văn bản. Chế độ ẩn số dư được giữ khi
xem/tải chi tiết từ danh sách gần đây.

Chỉ trạng thái `Success` được hiển thị thành công. `Failed`, `Cancelled`,
`Pending`, yêu cầu API bị từ chối và lỗi chưa xác định kết quả được phân biệt.
Phản hồi 200 thiếu định danh, mã, số tiền hoặc trạng thái hợp lệ cũng được coi
là chưa xác định kết quả. Lỗi mạng/5xx không kết luận tiền chưa bị trừ hoặc giao dịch đã thất bại; giao
diện hướng dẫn kiểm tra lịch sử/thử lại cùng mã. Các lỗi OTP trước khi gửi lệnh
vẫn ở biểu mẫu xác thực. Kiểm tra riêng: `tests/browser/transaction-results.mjs`.

Chi tiết trạng thái và kiểm thử: [transaction-result-screens.md](../docs/audit/transaction-result-screens.md).
