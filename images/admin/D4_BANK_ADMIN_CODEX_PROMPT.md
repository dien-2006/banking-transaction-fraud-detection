# D4 BANK ADMIN UI — ONE-SHOT IMPLEMENTATION PROMPT FOR CODEX

## 0. NHIỆM VỤ

Hãy triển khai **toàn bộ giao diện Admin của dự án D4 Bank** trong repository hiện tại dựa trên:

1. Các ảnh giao diện Admin đã được cung cấp trong project/conversation.
2. `AGENTS.md`.
3. `README(2) (2).md`.
4. `create_table.sql`.
5. Các tài liệu đặc tả CSDL/nghiệp vụ hiện có trong project.
6. Codebase hiện tại.

**Ảnh giao diện đã chốt là nguồn chuẩn về UI/UX.**  
**Schema PostgreSQL 29 bảng hiện tại và tài liệu project là nguồn chuẩn về dữ liệu/nghiệp vụ.**

Không chỉ tạo mockup tĩnh. Hãy xây giao diện thành các page/component có cấu trúc tốt, có routing, state, bảng, filter, pagination, chart và sẵn sàng kết nối API/backend.

---

# 1. NGUYÊN TẮC BẮT BUỘC

## 1.1. Không redesign

Không tự sáng tạo lại phong cách.

Phải bám sát các ảnh Admin đã cung cấp về:

- bố cục;
- màu sắc;
- tỷ lệ;
- sidebar;
- topbar;
- hero banner;
- KPI card;
- tabs;
- bảng;
- filter;
- biểu đồ;
- panel bên phải;
- button;
- icon;
- border;
- radius;
- spacing;
- typography;
- trạng thái active;
- cách trình bày dữ liệu.

Có thể điều chỉnh nhỏ để giao diện responsive và code sạch, nhưng không được làm thay đổi nhận diện đã chốt.

---

# 2. NHẬN DIỆN D4 BANK

Phong cách tổng thể:

- Modern banking / fintech.
- Sáng, sạch, chuyên nghiệp.
- Nền chính trắng.
- Đỏ/coral là màu CTA và active.
- Hồng pastel dùng cho banner và vùng nhấn.
- Navy/xanh đậm dùng cho heading và số liệu chính.
- Xanh dương dùng cho một số icon/chart/thông tin phụ.
- Xanh lá cho thành công/đang hoạt động.
- Vàng/cam cho chờ xử lý/tạm khóa/cảnh báo trung bình.
- Đỏ cho lỗi/rủi ro/cảnh báo cao.
- Card bo góc nhẹ.
- Border xám rất nhạt.
- Shadow nhẹ, không nặng.
- Typography sans-serif rõ nét.
- Chữ tiếng Việt phải đúng dấu và sắc nét.

Không dùng dark theme cho các màn hình này.

---

# 3. ADMIN LAYOUT CHUNG

Tất cả trang Admin phải dùng chung một layout.

```text
AdminLayout
├── AdminSidebar
├── Main
│   ├── AdminTopbar
│   └── PageContent
└── overlays/modals/toasts
```

Không copy/paste sidebar và topbar riêng cho từng page.

Tạo reusable components khi hợp lý, ví dụ:

```text
AdminLayout
AdminSidebar
AdminTopbar
PageHero
KpiCard
KpiGrid
PageTabs
FilterBar
SearchInput
SelectFilter
DateRangeFilter
DataTable
StatusBadge
RiskBadge
Pagination
ChartCard
RightPanelCard
EmptyState
LoadingState
ErrorState
ConfirmDialog
DetailDrawer / DetailModal
```

Nếu project đã có component tương đương thì ưu tiên tái sử dụng/thích nghi thay vì tạo trùng.

---

# 4. TOPBAR — CHỐT CỨNG

Topbar chỉ có các menu chính:

```text
Tổng quan
Giới thiệu chúng tôi
Tin tức
```

Bên phải gồm:

```text
Search
Notification bell
Admin avatar
Admin name
"Admin hệ thống"
Dropdown
```

Search có thể dùng placeholder tương tự:

```text
Tìm kiếm khách hàng, tài khoản, giao dịch, nhân viên, chi nhánh...
```

## TUYỆT ĐỐI KHÔNG đưa lên topbar:

```text
Quản trị
Vận hành
Báo cáo
D4 Insights
```

---

# 5. SIDEBAR — CHỐT CỨNG

Thứ tự sidebar:

```text
Tổng quan
Chi nhánh
Nhân viên
Khách hàng
Tài khoản
Giao dịch
Khoản vay
Thẻ
Fraud & Review
D4 Insights
Nhật ký hoạt động
```

Cuối sidebar:

```text
khối minh họa/an toàn dữ liệu
Đăng xuất
```

Mục đang active:

- nền đỏ/coral gradient hoặc màu đỏ giống reference;
- icon và chữ trắng;
- bo góc.

Các mục không active:

- nền trắng;
- chữ/icon navy hoặc xanh.

## KHÔNG thêm vào sidebar:

```text
Cấu hình hệ thống
Báo cáo
Quản lý danh mục
Model
Model Management
```

**D4 Insights bắt buộc nằm trong sidebar.**

---

# 6. ROUTING ĐỀ XUẤT

Nếu codebase đã có convention routing thì tuân theo convention hiện tại. Nếu chưa có, dùng cấu trúc tương đương:

```text
/admin
/admin/about
/admin/news
/admin/branches
/admin/employees
/admin/customers
/admin/accounts
/admin/transactions
/admin/loans
/admin/cards
/admin/fraud-review
/admin/insights
/admin/audit-logs
```

Route `/admin` là Tổng quan.

Không phá các route hiện tại của phần khách hàng.

---

# 7. TRANG TỔNG QUAN

Mục tiêu: dashboard tổng quan toàn hệ thống D4 Bank.

Giữ đúng style ảnh Admin Tổng quan đã chốt.

## Nội dung

Hero banner:

```text
Tổng quan hệ thống / Dashboard Admin
```

Có hình ảnh thương hiệu D4 Bank, skyline hoặc hình minh họa tương tự reference.

KPI ưu tiên:

```text
Tổng khách hàng
Tổng tài khoản
Tổng giao dịch
Tổng khoản vay / tổng dư nợ
Cảnh báo rủi ro
```

Các vùng phân tích:

- xu hướng giao dịch;
- trạng thái giao dịch;
- giao dịch theo loại;
- dữ liệu chi nhánh;
- cảnh báo Fraud;
- hoạt động gần đây;
- các case đang chờ review.

Các card có thể click để chuyển tới module tương ứng.

---

# 8. TRANG GIỚI THIỆU CHÚNG TÔI

Route:

```text
/admin/about
```

Đây là trang nội dung thương hiệu, không phải CRUD.

Giữ:

- topbar Admin;
- sidebar Admin;
- màu D4 Bank;
- banner;
- card;
- typography.

Nội dung phù hợp:

```text
Về D4 Bank
Sứ mệnh
Tầm nhìn
Giá trị cốt lõi
Năng lực/cột mốc nổi bật
Công nghệ và dữ liệu
```

Không biến trang này thành dashboard nghiệp vụ.

---

# 9. TRANG TIN TỨC

Route:

```text
/admin/news
```

Nội dung:

- hero/banner tin tức;
- bài nổi bật;
- danh sách bài mới;
- category/tag;
- ngày đăng;
- thumbnail;
- mô tả ngắn;
- xem chi tiết.

Giữ style đồng nhất với toàn bộ Admin Portal.

---

# 10. TRANG CHI NHÁNH

Route:

```text
/admin/branches
```

Hero:

```text
Danh sách chi nhánh
```

Mục đích:

```text
Quản lý mạng lưới chi nhánh D4 Bank
```

KPI phù hợp:

- tổng chi nhánh;
- chi nhánh đang hoạt động;
- tổng nhân viên theo hệ thống;
- chỉ số khách hàng/giao dịch theo chi nhánh.

Bảng nên thể hiện:

```text
Mã chi nhánh
Tên chi nhánh
Địa chỉ / khu vực
Quản lý
Số nhân viên
Trạng thái
Thao tác
```

Có:

```text
search
filter trạng thái/khu vực
pagination
xem chi tiết
thêm/sửa nếu nghiệp vụ cho phép
```

Panel thống kê bên phải tương tự ảnh reference.

---

# 11. TRANG NHÂN VIÊN

Route:

```text
/admin/employees
```

Hero:

```text
QUẢN LÝ NHÂN VIÊN
Danh sách nhân viên
```

KPI:

```text
Tổng số nhân viên
Nhân viên đang làm việc
Nhân viên tạm nghỉ
Nhân viên đã nghỉ việc
```

Tabs:

```text
Danh sách nhân viên
Cơ cấu tổ chức
Quản lý chức vụ
Lịch sử thay đổi
```

Filter:

```text
Search theo tên/mã/email/SĐT
Chi nhánh
Phòng ban
Trạng thái
```

Primary CTA:

```text
+ Thêm nhân viên
```

Bảng:

```text
Mã NV
Họ và tên
Chi nhánh
Phòng ban
Chức vụ
Số điện thoại
Email
Trạng thái
Thao tác
```

Panel phải:

```text
Cơ cấu nhân viên theo chi nhánh
Cơ cấu nhân viên theo phòng ban
Nhân viên mới gần đây
```

Dữ liệu liên quan trong schema có thể gồm:

```text
EMPLOYEE
BRANCH
ROLE
SYSTEM_USER
```

Không tự giả định field không tồn tại trong schema; nếu UI cần dữ liệu tổng hợp thì map từ API/view phù hợp.

---

# 12. TRANG KHÁCH HÀNG

Route:

```text
/admin/customers
```

Hero:

```text
QUẢN LÝ KHÁCH HÀNG
Danh sách khách hàng
```

KPI:

```text
Tổng số khách hàng
Khách hàng mới
Khách hàng hoạt động
Khách hàng rủi ro
```

Tabs:

```text
Danh sách khách hàng
Phân loại khách hàng
Thống kê
Lịch sử thay đổi
```

Filters:

```text
Search tên/CMND/CCCD/SĐT/email
Chi nhánh
Loại khách hàng
Trạng thái
```

CTA:

```text
+ Thêm khách hàng
```

Bảng:

```text
Mã KH
Họ và tên
CMND/CCCD
Số điện thoại
Loại khách hàng
Chi nhánh
Trạng thái
Ngày đăng ký
Thao tác
```

Panel phải:

```text
Phân bố khách hàng theo loại
Khách hàng theo chi nhánh
Khách hàng mới gần đây
```

Map dữ liệu chủ yếu với `CUSTOMER` và các bảng liên quan.

Không hiển thị thông tin nhạy cảm quá mức cần thiết.

---

# 13. TRANG TÀI KHOẢN

Route:

```text
/admin/accounts
```

Hero:

```text
QUẢN LÝ TÀI KHOẢN
Danh sách tài khoản
```

KPI:

```text
Tổng số tài khoản
Tài khoản mới mở
Tài khoản tạm khóa
Tài khoản rủi ro
```

Tabs:

```text
Danh sách tài khoản
Loại tài khoản
Thống kê
Lịch sử thay đổi
```

Filters:

```text
Search số tài khoản/tên khách hàng/CCCD
Loại tài khoản
Trạng thái
Chi nhánh
```

CTA:

```text
+ Thêm tài khoản
```

Bảng:

```text
Số tài khoản
Tên khách hàng
CMND/CCCD
Loại tài khoản
Số dư
Chi nhánh
Trạng thái
Ngày mở
Thao tác
```

Panel phải:

```text
Cơ cấu tài khoản theo loại
Tài khoản theo trạng thái
Tài khoản mở gần đây
```

Schema liên quan:

```text
BANK_ACCOUNT
ACCOUNT_TYPE
ACCOUNT_HOLDER
ACCOUNT_STATUS_HISTORY
CUSTOMER
BRANCH
```

Format tiền VND nhất quán.

---

# 14. TRANG GIAO DỊCH

Route:

```text
/admin/transactions
```

Hero:

```text
QUẢN LÝ GIAO DỊCH
Danh sách giao dịch
```

KPI:

```text
Tổng giao dịch
Tổng giá trị giao dịch
Giao dịch thành công
Giao dịch thất bại
```

Tabs:

```text
Danh sách giao dịch
Thống kê giao dịch
Giao dịch đáng ngờ
Lịch sử thay đổi
```

Filters:

```text
Search mã giao dịch/số tài khoản/tên khách hàng
Loại giao dịch
Trạng thái
Khoảng ngày
```

Bảng:

```text
Mã giao dịch
Thời gian
Khách hàng
Loại giao dịch
Số tài khoản
Số tiền
Trạng thái
Kênh giao dịch
Thao tác
```

Panel phải:

```text
Cơ cấu giao dịch theo loại
Giao dịch theo kênh
Giao dịch gần đây
```

Schema liên quan:

```text
BANK_TRANSACTION
TRANSACTION_TYPE
TRANSACTION_POSTING
TRANSFER_REQUEST
BANK_ACCOUNT
TERMINAL
```

Quy tắc hiển thị:

- tiền vào có thể xanh;
- tiền ra đỏ;
- thành công xanh;
- đang xử lý cam;
- thất bại đỏ.

Không cho Admin sửa tùy tiện lịch sử giao dịch đã được ghi nhận.

---

# 15. TRANG KHOẢN VAY

Route:

```text
/admin/loans
```

Hero:

```text
QUẢN LÝ KHOẢN VAY
Danh sách khoản vay
```

KPI:

```text
Tổng khoản vay
Tổng dư nợ
Khoản vay đang hoạt động
Khoản vay quá hạn
```

Tabs:

```text
Danh sách khoản vay
Khoản vay chờ duyệt
Khoản vay quá hạn
Thống kê
Lịch sử thay đổi
```

Filters:

```text
Search mã khoản vay/tên khách hàng/CMND/CCCD
Loại vay
Chi nhánh
Trạng thái
```

CTA:

```text
+ Thêm khoản vay
```

Bảng:

```text
Mã khoản vay
Khách hàng
CMND/CCCD
Loại khoản vay
Số tiền vay
Dư nợ còn lại
Ngày giải ngân
Trạng thái
Thao tác
```

Panel phải:

```text
Phân bố khoản vay theo loại
Tình trạng khoản vay
Khoản vay cần chú ý
```

Schema:

```text
LOAN
LOAN_TYPE
REPAYMENT_SCHEDULE
LOAN_PAYMENT
CUSTOMER
```

Cho phép mở chi tiết để xem lịch trả nợ.

---

# 16. TRANG THẺ

Route:

```text
/admin/cards
```

Hero:

```text
QUẢN LÝ THẺ
Danh sách thẻ
```

KPI:

```text
Tổng số thẻ
Thẻ mới phát hành
Thẻ đang hoạt động
Thẻ bị khóa/tạm ngưng
```

Tabs:

```text
Danh sách thẻ
Quản lý phát hành thẻ
Thống kê
Lịch sử thay đổi
```

Filters:

```text
Search số thẻ/tên khách hàng/CMND/CCCD
Loại thẻ
Chi nhánh
Trạng thái
```

CTA:

```text
+ Phát hành thẻ mới
```

Bảng:

```text
Số thẻ
Họ và tên
CMND/CCCD
Loại thẻ
Hạn thẻ
Hạn mức
Trạng thái
Ngày phát hành
Thao tác
```

Panel phải:

```text
Cơ cấu thẻ theo loại
Thẻ theo trạng thái
Thẻ mới phát hành gần đây
```

Schema chính:

```text
CARD
BANK_ACCOUNT
CUSTOMER
```

## Bảo mật

Không hiển thị đầy đủ số thẻ.

Ví dụ:

```text
9704 12** **** 1234
```

Không hiển thị CVV hoặc dữ liệu bí mật.

---

# 17. FRAUD & REVIEW

Route:

```text
/admin/fraud-review
```

Đây là màn hình quan trọng của dự án.

Hero:

```text
QUẢN LÝ FRAUD & REVIEW
Giám sát rủi ro giao dịch
```

Mô tả:

```text
Phát hiện, cảnh báo và xử lý các giao dịch/tài khoản có dấu hiệu bất thường.
```

KPI:

```text
Tổng cảnh báo
Đang chờ xử lý
Đã xử lý
Giao dịch gian lận
```

Tabs:

```text
Danh sách cảnh báo
Giao dịch nghi ngờ
Tài khoản cần review
Báo cáo rủi ro
Lịch sử xử lý
```

Filters:

```text
Search mã giao dịch/số tài khoản/tên khách hàng
Mức độ rủi ro
Loại cảnh báo
Trạng thái
Khoảng ngày
```

Bảng:

```text
Mã cảnh báo
Thời gian
Khách hàng
Loại cảnh báo
Chi tiết
Mức độ rủi ro
Trạng thái
Người xử lý
Thao tác
```

Risk badges:

```text
Thấp
Trung bình
Cao
Rất cao
```

Panel phải:

```text
Tỷ lệ cảnh báo theo mức độ rủi ro
Cảnh báo theo loại
Cảnh báo cần xử lý ngay
```

Schema liên quan:

```text
RISK_ASSESSMENT
REVIEW_CASE
FRAUD_LABEL_EVENT
BANK_TRANSACTION
TRANSFER_REQUEST
CUSTOMER
MODEL_VERSION
```

`MODEL_VERSION` là dữ liệu kỹ thuật phía sau nếu cần hiển thị chi tiết scoring; **không tạo menu Model Management riêng**.

## Review flow

UI phải sẵn sàng hỗ trợ:

```text
Pending transaction
→ Risk assessment
→ ALLOW / REVIEW / BLOCK
→ nếu REVIEW: nhân viên/Admin xem case
→ APPROVE / REJECT theo nghiệp vụ
→ ghi nhận lịch sử xử lý
```

Các action APPROVE/REJECT hoặc thao tác nhạy cảm phải có confirm dialog và audit.

---

# 18. D4 INSIGHTS

Route:

```text
/admin/insights
```

D4 Insights nằm ở **sidebar**, không nằm topbar.

Hero:

```text
D4 INSIGHTS
Phân tích dữ liệu toàn diện
```

Mô tả theo tinh thần:

```text
Biến dữ liệu thành thông tin giá trị, hỗ trợ ra quyết định nhanh chóng,
chính xác và hiệu quả cho toàn hệ thống D4 Bank.
```

KPI:

```text
Tổng khách hàng
Tổng dư nợ
Tổng giao dịch
Cảnh báo rủi ro
```

Tabs:

```text
Tổng quan phân tích
Phân tích khách hàng
Phân tích giao dịch
Phân tích sản phẩm
Phân tích rủi ro
Báo cáo tùy chỉnh
```

Có Date Range Filter.

Các visualization chính:

```text
Xu hướng giao dịch theo thời gian
Cơ cấu khách hàng theo phân khúc
Tăng trưởng sản phẩm theo tháng
Top chi nhánh hiệu quả
Phân tích rủi ro giao dịch
Doanh thu theo sản phẩm
Dự báo xu hướng
```

Chart phải:

- rõ legend;
- tooltip;
- responsive;
- format số đúng;
- không làm rối giao diện.

Khi backend data pipeline đã sẵn sàng, dữ liệu nên đến từ lớp analytics/Gold hoặc API tổng hợp của dự án.

Không hard-code dữ liệu production.

---

# 19. NHẬT KÝ HOẠT ĐỘNG

Route:

```text
/admin/audit-logs
```

Hero:

```text
NHẬT KÝ HOẠT ĐỘNG
Minh bạch mọi hoạt động
```

Mục tiêu:

```text
Theo dõi, giám sát và truy vết toàn bộ hoạt động người dùng trên hệ thống.
```

KPI:

```text
Tổng số hoạt động
Người dùng hoạt động
Hoạt động nhạy cảm
Đăng nhập thành công
```

Tabs:

```text
Danh sách hoạt động
Thống kê hoạt động
Hoạt động nhạy cảm
Đăng nhập hệ thống
Lịch sử thay đổi
```

Filters:

```text
Search người dùng/hành động/mô tả/IP
Người dùng
Loại hoạt động
Mức độ
Khoảng ngày
```

Bảng:

```text
Thời gian
Người dùng
IP Address
Loại hoạt động
Mô tả chi tiết
Đối tượng
Mức độ
Trạng thái
Thao tác
```

Panel phải:

```text
Cơ cấu hoạt động theo loại
Hoạt động theo mức độ rủi ro
Top người dùng hoạt động nhiều nhất
```

Schema:

```text
AUDIT_LOG
SYSTEM_USER
LOGIN_EVENT
```

Audit log ưu tiên **read-only**.

Không cho sửa/xóa log tùy tiện từ UI.

---

# 20. DATABASE — PHẢI TÔN TRỌNG SCHEMA 29 BẢNG

Dự án hiện tại sử dụng schema PostgreSQL 29 bảng.

Không thiết kế frontend dựa trên schema 22 bảng cũ nếu có xung đột.

Trước khi tạo type/interface/API mapping:

1. đọc `create_table.sql`;
2. đọc `AGENTS.md`;
3. đọc README;
4. kiểm tra code backend hiện tại;
5. dùng đúng tên field/status thực tế.

Các nhóm bảng quan trọng:

```text
BRANCH
ROLE
EMPLOYEE
SYSTEM_USER

CUSTOMER
CUSTOMER_ONLINE_ACCOUNT
CUSTOMER_DEVICE
LOGIN_EVENT

ACCOUNT_TYPE
BANK_ACCOUNT
ACCOUNT_HOLDER
ACCOUNT_STATUS_HISTORY
CARD

TRANSACTION_TYPE
TERMINAL
BANK_TRANSACTION
TRANSFER_REQUEST
TRANSACTION_POSTING

LOAN_TYPE
LOAN
REPAYMENT_SCHEDULE
LOAN_PAYMENT

MODEL_VERSION
RISK_ASSESSMENT
REVIEW_CASE
FRAUD_LABEL_EVENT

EVENT_OUTBOX
NOTIFICATION_OUTBOX
AUDIT_LOG
```

Không tự đổi schema chỉ để khớp mockup.

Nếu một thông tin UI là dữ liệu tổng hợp, hãy tạo selector/view-model/API response phù hợp thay vì thêm field tùy tiện vào table.

---

# 21. DỮ LIỆU MOCK VÀ API

Các con số/names trong ảnh reference chỉ là dữ liệu demo.

Ví dụ:

```text
12,430 khách hàng
18,250 tài khoản
125,430 giao dịch
...
```

Không coi các số này là business constant.

Nếu backend/API chưa có:

- tạo service abstraction;
- có thể dùng mock data tách riêng;
- component không phụ thuộc trực tiếp vào hard-coded arrays;
- đánh dấu rõ nơi cần nối API.

Nếu backend đã có endpoint:

- sử dụng endpoint hiện tại;
- không tạo API duplicate không cần thiết.

---

# 22. TABLE REQUIREMENTS

Các bảng Admin phải có UX thống nhất.

Khi phù hợp, hỗ trợ:

```text
search
filter
sorting
pagination
loading
empty
error
row action
detail view
```

Pagination giống style ảnh:

```text
< 1 2 3 4 5 ... N >
10 / trang
```

Không render hàng nghìn record cùng lúc.

---

# 23. STATUS BADGES

Tạo component dùng chung.

Ví dụ semantic:

```text
ACTIVE / SUCCESS / APPROVED
→ green

PENDING / PROCESSING / TEMPORARY
→ yellow/orange

FAILED / BLOCKED / HIGH_RISK / OVERDUE
→ red

INFO / COMPLETED
→ blue when appropriate
```

Không map status bằng text tiếng Việt rải rác trong từng component.

Tạo mapping tập trung nếu architecture phù hợp.

---

# 24. CHARTS

Tái sử dụng chart components/config.

Yêu cầu:

- responsive;
- tooltip;
- legend;
- format số;
- format VND;
- không dùng quá nhiều màu;
- ưu tiên palette D4 Bank;
- chart không được chiếm ưu thế quá mức so với bảng.

Không vẽ chart bằng ảnh tĩnh.

---

# 25. FORMAT DỮ LIỆU

Tạo utility dùng chung cho:

```text
VND
percentage
date
datetime
masked card number
masked identity
account number where necessary
```

Ví dụ VND:

```text
28.650.000 ₫
```

hoặc format hiện tại của project nếu đã có convention.

Không trộn nhiều kiểu format tiền/ngày trong cùng Admin Portal.

---

# 26. SECURITY / PRIVACY UI

Không hiển thị:

- password;
- password hash;
- token;
- CVV;
- toàn bộ số thẻ khi không cần;
- secret;
- dữ liệu nội bộ không dành cho UI.

Mask dữ liệu nhạy cảm.

Các action nguy hiểm phải có confirm:

```text
khóa tài khoản
khóa thẻ
reject review
approve sensitive operation
thay đổi trạng thái quan trọng
```

Sau action cần feedback bằng toast/message.

---

# 27. LOADING / EMPTY / ERROR

Mọi page lấy dữ liệu phải có:

```text
Loading state
Empty state
Error state
```

Không để trang trắng khi API lỗi.

Skeleton/loading phải cùng style D4 Bank.

---

# 28. RESPONSIVE

Reference chính là desktop widescreen.

Ưu tiên pixel fidelity ở desktop.

Sau đó hỗ trợ:

### Tablet

- sidebar có thể collapse;
- grid KPI giảm cột;
- panel phải chuyển xuống dưới;
- table cho phép horizontal scroll.

### Mobile

Không cần biến Admin Portal thành app mobile hoàn toàn khác.

Giữ hierarchy:

```text
Header
KPI
Filter
Primary content
Secondary analytics
```

---

# 29. ACCESSIBILITY

Đảm bảo:

- button có accessible name;
- icon-only button có aria-label;
- form có label;
- keyboard focus rõ;
- contrast đủ;
- modal trap focus nếu framework hỗ trợ;
- table semantic hợp lý.

---

# 30. CODE QUALITY

Không tạo một component khổng lồ cho toàn bộ Admin.

Tách:

```text
layout
pages
features
components
services
types
utils
hooks
```

theo architecture hiện tại của repository.

Không ép architecture mới nếu project đã có convention tốt.

Ưu tiên:

- reusable;
- maintainable;
- typed nếu project dùng TypeScript;
- tránh duplicated markup;
- tránh magic strings;
- tránh inline style lặp lại;
- không thêm dependency nặng nếu không cần.

---

# 31. KHÔNG PHÁ GIAO DIỆN KHÁCH HÀNG

Project đã có giao diện dành cho khách hàng.

Admin là một hệ giao diện riêng nhưng cùng nhận diện D4 Bank.

Không:

- xóa giao diện khách hàng;
- đổi route khách hàng;
- thay customer sidebar bằng admin sidebar;
- làm hỏng component đang hoạt động.

Nếu có thể reuse primitive/design token thì reuse.

---

# 32. THỨ TỰ TRIỂN KHAI

Thực hiện theo thứ tự:

```text
1. Inspect repository
2. Read AGENTS.md
3. Read README
4. Inspect create_table.sql
5. Inspect existing frontend/backend
6. Locate supplied Admin screenshots/assets
7. Determine current framework and conventions
8. Create/reuse D4 design tokens
9. Build AdminLayout
10. Build shared components
11. Implement routes
12. Implement Overview
13. Implement Branches
14. Implement Employees
15. Implement Customers
16. Implement Accounts
17. Implement Transactions
18. Implement Loans
19. Implement Cards
20. Implement Fraud & Review
21. Implement D4 Insights
22. Implement Audit Logs
23. Implement About
24. Implement News
25. Connect existing APIs where available
26. Add mock/service fallback only where necessary
27. Test routing and interaction
28. Run lint/typecheck/tests/build
29. Fix issues
30. Compare final UI with reference screenshots
```

Không dừng ở bước tạo skeleton nếu có thể hoàn thành implementation.

---

# 33. VISUAL ACCEPTANCE CRITERIA

Trước khi kết thúc, tự kiểm tra:

- [ ] Logo D4 Bank đúng vị trí.
- [ ] Topbar chỉ có Tổng quan / Giới thiệu chúng tôi / Tin tức.
- [ ] Sidebar đúng thứ tự đã chốt.
- [ ] D4 Insights ở sidebar.
- [ ] Không có Cấu hình hệ thống.
- [ ] Không có menu Model.
- [ ] Không có Quản lý danh mục.
- [ ] Không có menu Báo cáo riêng ở sidebar.
- [ ] Active menu có nền đỏ/coral.
- [ ] Tất cả page cùng một visual language.
- [ ] Hero banner đúng phong cách reference.
- [ ] KPI cards đồng nhất.
- [ ] Tabs đồng nhất.
- [ ] Search/filter đồng nhất.
- [ ] Table đồng nhất.
- [ ] Pagination đồng nhất.
- [ ] Chart palette đồng nhất.
- [ ] Tiếng Việt đúng dấu.
- [ ] Không có chữ bị mờ/cắt/tràn.
- [ ] Không có layout shift nghiêm trọng.
- [ ] Không có mockup style khác biệt giữa các page.

---

# 34. FUNCTIONAL ACCEPTANCE CRITERIA

- [ ] Tất cả route Admin mở được.
- [ ] Sidebar navigation hoạt động.
- [ ] Topbar navigation hoạt động.
- [ ] Search/filter UI có state hợp lệ.
- [ ] Pagination hoạt động với data source hiện có.
- [ ] Detail/action button không phải nút chết nếu nghiệp vụ đã tồn tại.
- [ ] Loading state hoạt động.
- [ ] Empty state hoạt động.
- [ ] Error state hoạt động.
- [ ] Sensitive values được mask.
- [ ] Fraud review actions có confirm.
- [ ] Audit log không bị chỉnh sửa tùy tiện.
- [ ] Không phá customer UI.
- [ ] Build thành công.
- [ ] Typecheck/lint/tests hiện có không lỗi do phần triển khai mới.

---

# 35. QUY TẮC KHI CÓ MÂU THUẪN

Nếu có mâu thuẫn:

### Visual

```text
Ảnh Admin đã chốt
>
mô tả bằng chữ trong prompt
```

### Database / nghiệp vụ

```text
AGENTS.md / chỉ dẫn project hiện tại
+
create_table.sql PostgreSQL 29 bảng
+
code/backend thực tế
>
tài liệu schema cũ
```

Không tự suy diễn rằng một thành phần đã chạy production chỉ vì nó xuất hiện trong kiến trúc.

---

# 36. YÊU CẦU CUỐI CÙNG CHO CODEX

Hãy chủ động đọc repository và triển khai, không chỉ trả lại hướng dẫn lý thuyết.

Khi hoàn thành:

1. liệt kê file đã tạo/sửa;
2. nêu route đã triển khai;
3. nêu API nào đã kết nối;
4. nêu phần nào đang dùng mock vì backend chưa có;
5. nêu lệnh chạy frontend;
6. báo kết quả build/typecheck/test;
7. nêu các TODO còn lại nếu thực sự chưa thể hoàn thành;
8. không tuyên bố một chức năng hoạt động nếu chưa kiểm chứng.

**Mục tiêu cuối:** tạo một D4 Bank Admin Portal hoàn chỉnh, đồng nhất với toàn bộ ảnh giao diện đã chốt, phù hợp schema 29 bảng và sẵn sàng tích hợp với backend/data pipeline của dự án.
