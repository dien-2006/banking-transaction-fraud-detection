# GIAI ĐOẠN 2 — FULL UI/UX AUDIT

**Dự án:** D4 Bank — Banking Transaction Fraud Detection  
**Ngày đánh giá:** 27/10/2026 (UTC)  
**Phạm vi:** Frontend Next.js/TypeScript trong `web/`  
**Chế độ:** Audit only — không sửa source code, business logic, database hay cấu hình  
**Chuẩn tham chiếu:** WCAG 2.2 AA, heuristic usability hiện đại và yêu cầu nghiệp vụ trong repository

## 1. Kết luận điều hành

Frontend có hệ thống màu sắc, biểu tượng và khung điều hướng tương đối thống nhất; trang đăng nhập có label, thông báo lỗi và autocomplete cơ bản; luồng chuyển tiền đã thể hiện 4 bước; nhiều danh sách có loading/error/empty state. Tuy nhiên, hệ thống **chưa đạt trạng thái sẵn sàng để nghiệm thu UI/UX**.

Các rủi ro lớn nhất là:

- Hai trang thông báo làm `npm run typecheck` thất bại, có thể chặn production build.
- Nhiều thao tác nhạy cảm dùng `window.prompt`, kể cả mật khẩu/PIN; các nghiệp vụ quan trọng thiếu form, kiểm tra, tóm tắt và xác nhận an toàn.
- Giao diện desktop bị ép vừa màn hình bằng `zoom: .6/.8/.94` và `overflow: hidden`, làm chữ rất nhỏ, che nội dung và không phải thiết kế responsive thực sự.
- Tên người nhận vẫn sửa được sau khi backend xác minh số tài khoản trong luồng chuyển tiền.
- Tiết kiệm và thanh toán chưa có trang/luồng nghiệp vụ; nhiều shortcut/nút chỉ mở nội dung minh họa.
- Trạng thái đã đọc thông báo, cài đặt thông báo, OTP/sinh trắc học và ảnh đại diện có phần chỉ tồn tại trong local state hoặc hiển thị cố định, dễ tạo kỳ vọng sai.

Không phát hiện P0 chỉ từ source UI. Có **5 P1, 14 P2 và 1 P3** trong báo cáo này.

## 2. Phương pháp và giới hạn

### 2.1 Bằng chứng đã sử dụng

- Đọc `AGENTS.md`, `README.md`, `web/README.md` và toàn bộ routing/frontend có liên quan.
- Đối chiếu route đang chạy tại `src/app/[role]/[[...slug]]/page.tsx` với navigation và component được render thực tế.
- Rà soát bố cục, sidebar, header, typography, màu, icon, form, button, table, modal, loading/error/empty state, responsive, accessibility, tính nhất quán và luồng thao tác.
- Chạy kiểm tra không phá hủy `npm run typecheck`; kết quả thất bại với 2 lỗi TS2352 ở hai trang thông báo.
- Thử xác định khả năng render/browser automation: không có trình duyệt/Playwright khả dụng và ứng dụng không phục vụ tại `localhost:3000` hoặc API tại `localhost:8000` trong phiên audit.

### 2.2 Giới hạn kiểm chứng

- Không có file báo cáo Giai đoạn 1 trong `docs/audit/` tại thời điểm kiểm tra; phần kiến trúc được đối chiếu lại trực tiếp từ repository và bối cảnh phiên làm việc.
- Không chụp được ảnh bằng chứng và không thao tác end-to-end trong trình duyệt.
- Các kích thước **320, 375, 768, 1024, 1440, 1920 px: NOT TESTED ở runtime**. Kết luận responsive chỉ dựa trên CSS/DOM và được đánh dấu `SUSPECTED` khi phụ thuộc vào render thực tế.
- Không đo contrast bằng browser/computed styles và không chạy screen reader. Không khẳng định đạt WCAG 2.2 AA.
- Không thay đổi bất kỳ code ứng dụng, database hoặc dữ liệu nào.

## 3. Kiến trúc giao diện và route đang hoạt động

| Vai trò | Route chính đang render | Nhận xét |
|---|---|---|
| Customer | `/customer`, `/accounts`, `/transfer`, `/transactions`, `/loans`, `/cards`, `/notifications`, `/profile` | Tài khoản/giao dịch/vay/thẻ dùng chung `CustomerLivePage`; tiết kiệm và thanh toán không có route riêng. |
| Employee | Tổng quan, customers, accounts, transactions, loans, cards, fraud, reports, notifications, profile | Các trang nghiệp vụ dùng `LiveResourcePage`; thông báo/hồ sơ có giao diện riêng. |
| Admin | Tổng quan, branches, employees, customers, accounts, transactions, loans, cards, fraud, insights, audit logs | Các trang danh sách dùng `LiveResourcePage`; Insights dùng bảng raw từ Trino. |
| Chung | `/login`, `/forgot-password`, `/register`, `/{role}/about`, `/{role}/news` | Quên mật khẩu/đăng ký là trang hướng dẫn, không phải workflow tự phục vụ. |

Nguồn: `src/app/[role]/[[...slug]]/page.tsx:19-54`, `src/config/navigation.ts:7-32`.

## 4. Đánh giá theo từng trang

Ký hiệu: **Tốt** = có cấu trúc hợp lý trong source; **Cần sửa** = có bằng chứng cụ thể; **NT** = chưa thể kiểm thử runtime.

| Trang/nhóm trang | Bố cục, sidebar, header | Typography, màu, icon | Form, button, table, modal | Loading, error, empty | Responsive, accessibility | Nhất quán, khả dụng và thao tác thực tế |
|---|---|---|---|---|---|---|
| Đăng nhập | Bố cục hai cột rõ; mobile ẩn showcase. Không dùng sidebar/header dashboard. | Nhận diện đỏ/xanh nhất quán; kích thước form đủ đọc. | Label/autocomplete/error live region tốt. Checkbox custom không phản ánh trạng thái rõ; nút ngôn ngữ không hoạt động. | Có submitting, success và error. | Có breakpoint 1023/560; chưa render 6 viewport. Thiếu skip link; focus custom chưa đầy đủ. | Luồng chọn role rõ, nhưng quên mật khẩu không tự phục vụ. |
| Trang chủ khách hàng | Nhiều khối tài chính, shortcut, giao dịch và hỗ trợ; dày thông tin. | Màu/icon nhất quán, nhưng nhiều chữ 9–12 px và còn bị co bằng JS `zoom`. | Dialog Radix ở trang chủ tốt hơn modal tự viết; nhiều shortcut chỉ minh họa. | Khi đang tải, KPI có thể hiện 0 trước khi dòng “Đang tải” xuất hiện. Có error/empty cơ bản. | Desktop ép vừa một viewport; nguy cơ chữ quá nhỏ. Mobile có CSS riêng nhưng chưa render. | Dữ liệu thật xen nội dung “minh họa”; caption gọi dữ liệu là “giao dịch mẫu”. |
| Dashboard admin/nhân viên | KPI, chart, risk table và branch/audit cùng một màn hình; quá dày. | Có hệ màu rủi ro, nhưng chữ 8–14 px; chart phụ thuộc màu và chữ nhỏ. | Table/modal xem chi tiết có, không có bộ lọc thời gian ngay dashboard. | Skeleton và error có; empty trong bảng có. | Bị `zoom`; biểu đồ donut/bar thiếu mô tả dữ liệu đầy đủ cho AT. | Có giá trị vận hành nhưng độ nén cao, khó quét và so sánh. |
| Tài khoản khách hàng | Active route là danh sách generic, không phải giao diện tài khoản chuyên biệt đã tồn tại trong source. | Icon và card đồng nhất, status còn raw tiếng Anh. | Không có chi tiết tài khoản đầy đủ, search/filter/pagination. | Có loading/error/empty và nút làm mới. | Hàng flex có nguy cơ tràn ở 320/375 khi đủ value/status/action. | Không khớp `web/README.md` và component thiết kế riêng. |
| Chuyển tiền | Luồng 4 bước và màn xác nhận là nền tảng tốt. | Thị giác rõ, nhưng có số liệu “↑ 8%” hardcode và icon con mắt không tương tác. | Tên người nhận sửa được sau xác minh; lỗi chủ yếu generic; thiếu resend/countdown OTP; tải biên lai không hoạt động. | Có pending/error; tài khoản nguồn chưa có skeleton riêng. | Stepper 4 nhãn có nguy cơ chật ở 320 px; desktop dùng JS `zoom`. | Rủi ro nhầm người nhận và thiếu feedback sau copy/download. |
| Lịch sử giao dịch | Chỉ là danh sách generic tối đa 100 bản ghi. | Trạng thái/type raw, thiếu phân cấp detail. | Thiếu lọc trạng thái/loại/thời gian/tài khoản và pagination; không mở chi tiết. | Có loading/error/empty. | Có nguy cơ tràn hàng; chưa render. | Chưa đáp ứng nhu cầu tra cứu lịch sử thực tế. |
| Thẻ của tôi | Danh sách generic; component thẻ chuyên biệt tồn tại nhưng không được route dùng. | Số thẻ đã che là điểm tốt; status raw. | Đổi PIN bằng prompt; không có quản lý khóa/mở khóa/hạn mức theo form. | Có loading/error/empty. | Prompt không thân thiện AT/mobile. | Luồng quản lý thẻ không đủ an toàn và thiếu xác nhận. |
| Khoản vay | Danh sách generic. | Số tiền/lãi suất dễ nhận biết, status raw. | Thanh toán yêu cầu 3 ID nội bộ và số tiền qua prompt, không có kỳ trả nợ dễ chọn hay xác nhận. | Có loading/error/empty; success quá chung. | Prompt không responsive/accessible có kiểm soát. | Không phù hợp ngôn ngữ khách hàng; nguy cơ nhập nhầm cao. |
| Tiết kiệm | Chỉ là tổng số dư/modal danh sách tài khoản tiết kiệm trên trang chủ. | Dùng icon/màu nhất quán. | Không có mở/tất toán/xem kỳ hạn/lãi suất; không có route. | Chưa có state nghiệp vụ riêng. | NT runtime. | **NOT IMPLEMENTED** như một tính năng hoàn chỉnh. |
| Thanh toán | Shortcut “Thanh toán hóa đơn” mở thông báo minh họa. | Nhất quán thị giác với shortcut khác. | Không có chọn nhà cung cấp, hóa đơn, nguồn tiền, xác nhận hoặc biên lai. | Không có state nghiệp vụ. | NT runtime. | **NOT IMPLEMENTED** như một tính năng hoàn chỉnh. |
| D4 Insights/Báo cáo | Banner + selector + bảng; thiếu dashboard phân tích. | Cột raw/snake_case và giá trị chưa format. | Không filter ngày, search, pagination, export hoặc drill-down; limit cố định 500. | Có loading/error/empty. | Bảng cuộn ngang; desktop bị `zoom .6`. | Không đủ khả năng “insight”; chủ yếu là data preview kỹ thuật. |
| Admin resources | Khung chung nhất quán giữa 9 module. | Màu/icon nhất quán; status raw và badge một màu. | Nhiều hành động trọng yếu dùng prompt, thiếu xác nhận; create form dùng ID kỹ thuật ở vài trường. | Có loading/error/empty/pagination. | Table fixed + ellipsis; modal tự viết thiếu quản lý focus. | Nhanh cho demo nhưng không an toàn cho vận hành ngân hàng. |
| Employee resources | Chung khung admin và giới hạn menu theo vai trò. | Nhất quán nhưng quá nén. | Approve/reject/reversal/status có thao tác tức thời hoặc prompt; chưa hiện đủ context. | Có state cơ bản. | Cùng vấn đề zoom/table/modal. | Giao diện chưa giảm sai sót tác nghiệp. |
| Thông báo customer | Tab, icon theo loại, list có empty. | Màu phân loại rõ. | Modal tự viết; “đã đọc” chỉ local. | Có text loading/error/empty nhưng không retry/live region. | Typecheck lỗi; modal thiếu focus/Escape/label. | Reload làm mất trạng thái đọc. |
| Thông báo employee | Nội dung đúng vai trò và có tab Fraud/vay/công việc/hệ thống. | Dùng cùng style customer. | Header bell không lấy thông báo nhân viên; read local. | Có loading/error/empty. | Typecheck lỗi; modal accessibility chưa đủ. | Trang và chuông header cho hai kết quả không nhất quán. |
| Hồ sơ customer/employee | Bố cục hồ sơ + security/settings dễ hiểu. | Icon/màu nhất quán. | Nhiều nút chỉ mở modal demo; toggle không lưu; nhân viên đổi mật khẩu bằng prompt. | Có error; loading state riêng không rõ. | Modal tự viết và JS zoom; profile panel có thể kéo ra ngoài viewport. | Hiển thị “OTP/sinh trắc học đã bật” cố định, dễ gây hiểu nhầm. |
| Giới thiệu | Nội dung chia card rõ, hình có alt. | Nhiều chữ 9–12 px; số liệu hardcode. | “Tìm hiểu thêm” không có handler; link chi nhánh luôn trỏ `/admin/branches` kể cả customer/employee. | Nội dung tĩnh, không cần state. | Bị `zoom .75`; chưa render. | Link vượt vai trò gây điều hướng không phù hợp. |
| Tin tức | Có category và bố cục editorial. | Visual nhất quán nhưng dày chữ 9–12 px; tin năm 2024 trong hệ thống 2026. | Nhiều nút “Xem…” không có handler/link. | Không có loading/error vì dữ liệu hardcode; category rỗng không có empty message riêng. | Bị `zoom .8`; grid phức tạp ở màn nhỏ chưa kiểm chứng. | Trông tương tác nhưng phần lớn không mở bài chi tiết. |
| Quên mật khẩu/Đăng ký | Card đơn giản, rõ ràng. | Nhất quán thương hiệu. | Chỉ hướng dẫn, không workflow. | Không có state động. | Cấu trúc đơn giản, có khả năng responsive tốt; NT runtime. | Trang quên mật khẩu nói có thể đổi trong profile nhưng profile customer chỉ hiển thị demo. |

## 5. Kiểm tra responsive theo kích thước yêu cầu

| Viewport | Kết quả runtime | Đánh giá từ source |
|---:|---|---|
| 320 px | NOT TESTED | Menu chuyển sang drawer, nhưng hàng dữ liệu customer, stepper chuyển tiền và nhiều nhóm nút có nguy cơ chật/tràn. |
| 375 px | NOT TESTED | Tương tự 320 px; login có breakpoint 560 px và có khả năng xếp dọc tốt. |
| 768 px | NOT TESTED | Sidebar dạng drawer; grid nhiều trang giảm cột, nhưng shell vẫn khóa chiều cao và một số nội dung phụ thuộc overflow cục bộ. |
| 1024 px | NOT TESTED | Là điểm gãy nhạy cảm: một số component bắt đầu JS `zoom` tại 1024 trong khi CSS shell desktop chỉ bắt đầu tại 1100. |
| 1440 px | NOT TESTED | Nhiều trang bị CSS `zoom .6/.75/.8/.94`; nội dung có thể vừa nhưng chữ/target bị thu nhỏ. |
| 1920 px | NOT TESTED | Vẫn giữ hệ số zoom cố định thay vì dùng không gian rộng; nguy cơ giao diện nhỏ bất thường và mật độ quá cao. |

## 6. Danh sách phát hiện chi tiết

### UIUX-001 — Hai trang thông báo làm type-check thất bại

- **Mức độ:** P1 — High
- **Trạng thái:** CONFIRMED
- **Module:** Customer notifications, Employee notifications, build frontend
- **Bằng chứng:** `src/features/customer/customer-notifications.tsx:36`; `src/features/employee/employee-notifications.tsx:55`; lệnh `npm run typecheck` trả TS2352 ở cả hai vị trí.
- **Mô tả/nguyên nhân:** Ép `Record<string, unknown>[]` trực tiếp sang interface cụ thể không có cấu trúc tương thích theo TypeScript.
- **Hành vi thực tế:** Type-check exit code 2; production pipeline có chạy type-check/build có thể bị chặn.
- **Hành vi mong đợi:** Frontend type-check sạch; payload thông báo được định kiểu/parse rõ trước khi render.
- **Cách tái hiện:** Trong `web/`, chạy `npm run typecheck`.
- **Hướng khắc phục:** Định nghĩa response DTO tại service, generic đúng cho API, hoặc validate/map payload thay vì cast mù.
- **Test case:** `npm run typecheck` exit 0; render cả payload hợp lệ, thiếu trường và sai enum mà không crash.

### UIUX-002 — Mật khẩu và PIN được nhập qua `window.prompt`

- **Mức độ:** P1 — High
- **Trạng thái:** CONFIRMED
- **Module:** Hồ sơ nhân viên; customer profile/list; thẻ
- **Bằng chứng:** `src/features/live/staff-profile-page.tsx:56-62`; `src/features/live/customer-live-page.tsx:41-42`.
- **Mô tả/nguyên nhân:** Prompt trình duyệt không cung cấp UX kiểm soát được, không có xác nhận mật khẩu/PIN mới, strength rules, show/hide, trợ giúp hoặc lỗi theo trường; chuỗi nhập vào prompt thường không được che như `type=password`.
- **Hành vi thực tế:** Người dùng nhập bí mật trong dialog native và gửi ngay khi đủ hai prompt.
- **Hành vi mong đợi:** Form modal bảo mật với input password, xác nhận giá trị mới, validation, pending/error, chống double submit và thông báo kết quả.
- **Cách tái hiện:** Customer > Thẻ > Đổi PIN; hoặc Employee > Hồ sơ > Đổi mật khẩu.
- **Hướng khắc phục:** Dùng dialog chuẩn, input `type=password`, schema validation, field error, confirm field và yêu cầu re-auth phù hợp.
- **Test case:** Kiểm tra bàn phím/screen reader, mismatch, PIN sai định dạng, API error, submit lặp và bí mật không hiển thị plaintext.

### UIUX-003 — Thanh toán khoản vay yêu cầu ID nội bộ và không có bước xác nhận

- **Mức độ:** P1 — High
- **Trạng thái:** CONFIRMED
- **Module:** Customer loans
- **Bằng chứng:** `src/features/live/customer-live-page.tsx:43-44`.
- **Mô tả/nguyên nhân:** UI bắt khách hàng tự nhập `scheduleId`, `sourceAccountId`, `internalCreditAccountId` và số tiền qua bốn prompt rồi gọi API ngay.
- **Hành vi thực tế:** Khách hàng phải biết khóa kỹ thuật; không thấy kỳ hạn, số tiền phải trả, tài khoản nguồn dạng lựa chọn hay trang xác nhận.
- **Hành vi mong đợi:** Chọn kỳ đến hạn từ lịch trả nợ, chọn tài khoản sở hữu, hệ thống tự xác định tài khoản thu nợ, hiển thị breakdown và yêu cầu xác nhận/OTP nếu policy cần.
- **Cách tái hiện:** Customer > Khoản vay > khoản Active > “Thanh toán kỳ”.
- **Hướng khắc phục:** Thiết kế wizard nghiệp vụ dựa trên dữ liệu API, không expose internal ID, khóa số tiền theo lịch và thêm receipt/result.
- **Test case:** Kỳ đã trả/quá hạn, tài khoản không sở hữu, thiếu số dư, double click, API pending/review/failed và màn 320 px.

### UIUX-004 — Thao tác trọng yếu của nhân viên/admin thiếu form và xác nhận an toàn

- **Mức độ:** P1 — High
- **Trạng thái:** CONFIRMED
- **Module:** Admin/Employee transactions, accounts, cards, fraud, loans, login provisioning
- **Bằng chứng:** `src/features/live/live-resource-page.tsx:87-91` và các action button trong cùng file.
- **Mô tả/nguyên nhân:** Đổi trạng thái, tạo login, reversal, nạp/rút/mở số dư và gắn nhãn fraud dùng prompt; duyệt/từ chối review và duyệt khoản vay gọi mutation trực tiếp từ nút.
- **Hành vi thực tế:** Thiếu summary đối tượng, old/new state, warning không thể hoàn tác, reason bắt buộc có cấu trúc và bước xác nhận cuối.
- **Hành vi mong đợi:** Dialog nghiệp vụ theo từng action, hiển thị dữ liệu định danh đã che, tác động tài chính, lý do, quyền hạn và confirm rõ động từ.
- **Cách tái hiện:** Employee/Admin > Giao dịch/Fraud/Khoản vay/Tài khoản > nhấn action tương ứng.
- **Hướng khắc phục:** Thay prompt/action trực tiếp bằng form có validation, review screen, idempotent pending state và result chi tiết.
- **Test case:** Hủy dialog, double submit, lỗi API, reversal không hợp lệ, reject không reason, thao tác bằng keyboard và screen reader.

### UIUX-005 — Tên người nhận sửa được sau khi hệ thống xác minh tài khoản

- **Mức độ:** P1 — High
- **Trạng thái:** CONFIRMED
- **Module:** Chuyển tiền
- **Bằng chứng:** Backend result gán tên tại `src/features/transfer/transfer-flow.tsx:28`; input tên vẫn có `onChange` tại dòng 45; transaction dùng `destinationId` đã resolve ở dòng 30-32.
- **Mô tả/nguyên nhân:** UI tách destination ID đã xác minh khỏi tên hiển thị nhưng không khóa trường tên.
- **Hành vi thực tế:** Sau khi resolve, người dùng có thể sửa tên hiển thị; màn xác nhận có thể cho cảm giác tiền sẽ đến tên đã sửa trong khi API vẫn chuyển tới account ID cũ.
- **Hành vi mong đợi:** Tên chủ tài khoản là readonly, được đánh dấu “đã xác minh”; thay số tài khoản phải vô hiệu kết quả resolve và xác minh lại.
- **Cách tái hiện:** Nhập số tài khoản hợp lệ > Tiếp tục > quay lại > sửa tên người nhận > tiếp tục.
- **Hướng khắc phục:** Không cho sửa tên; ràng buộc trạng thái verified với account number và clear destination khi account thay đổi.
- **Test case:** Sửa account sau resolve, back/forward, whitespace, tài khoản tự chuyển, tên Unicode và xác nhận tên khớp response API.

### UIUX-006 — Ép toàn bộ workspace bằng `zoom` và cắt overflow

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED (mức ảnh hưởng tại từng viewport: NOT TESTED)
- **Module:** Shell, dashboard, resource pages, customer pages, about/news
- **Bằng chứng:** `src/app/globals.css:98-105,111-150,187-190`; JS zoom tại `customer-home.tsx:101-135`, `transfer-flow.tsx:33`, `customer-profile.tsx:12`, hai trang notifications.
- **Mô tả/nguyên nhân:** Layout desktop dùng `height:100dvh`, `overflow:hidden`, rồi thu trang xuống 60–94% để vừa một màn hình.
- **Hành vi thực tế:** Chữ, icon và hit target bị thu nhỏ; nội dung dài có thể bị che; zoom trình duyệt/OS và reflow không được tôn trọng ổn định.
- **Hành vi mong đợi:** Layout responsive tự reflow, cho main content cuộn dọc, giữ cỡ chữ/target tối thiểu và không phụ thuộc CSS `zoom`.
- **Cách tái hiện:** Mở dashboard/resource ở 1440×700 hoặc 1024 px, tăng browser zoom lên 200%, kiểm tra nội dung/scroll/focus.
- **Hướng khắc phục:** Bỏ fit-to-viewport; dùng container, grid breakpoints và scrolling có chủ đích; kiểm tra WCAG reflow 320 CSS px.
- **Test case:** 320/375/768/1024/1440/1920, 200% zoom, chữ hệ thống lớn và chiều cao 600/700 px.

### UIUX-007 — Tiết kiệm và thanh toán chưa có workflow hoàn chỉnh

- **Mức độ:** P2 — Medium
- **Trạng thái:** NOT IMPLEMENTED
- **Module:** Customer navigation/home
- **Bằng chứng:** Navigation customer không có route savings/payments tại `src/config/navigation.ts:23-29`; shortcut không có `href` tại `src/features/customer/customer-home.tsx:18-24`; fallback tại dòng 246 báo chưa kết nối.
- **Mô tả/nguyên nhân:** Hai tính năng được trình bày như dịch vụ nhưng chỉ mở modal danh sách/minh họa.
- **Hành vi thực tế:** Không mở/tất toán tiết kiệm, không chọn hóa đơn/nhà cung cấp, không xác nhận/thanh toán/nhận biên lai.
- **Hành vi mong đợi:** Nếu trong scope, có route và luồng đầy đủ; nếu chưa, phải ghi rõ “Sắp ra mắt” và không tạo affordance như thao tác đang hoạt động.
- **Cách tái hiện:** Customer home > “Tiết kiệm” hoặc “Thanh toán hóa đơn”.
- **Hướng khắc phục:** Xác định scope nghiệp vụ rồi thiết kế workflow; tạm thời đổi copy/state để không gây hiểu nhầm.
- **Test case:** Navigation, deep link, empty account, thiếu số dư, cancel/failed/success và receipt.

### UIUX-008 — Route customer đang dùng trang generic thay vì giao diện chuyên biệt có sẵn

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Accounts, transactions, cards, loans
- **Bằng chứng:** Route dùng `CustomerLivePage` tại `src/app/[role]/[[...slug]]/page.tsx:24-28`; repository vẫn có `customer-accounts.tsx`, `customer-transactions.tsx`, `customer-cards.tsx`, `customer-loans.tsx`; `web/README.md` mô tả trang accounts riêng.
- **Mô tả/nguyên nhân:** Routing và tài liệu/asset UI không đồng bộ, tạo hai hướng giao diện tồn tại song song.
- **Hành vi thực tế:** Bốn trang customer có cùng một danh sách generic, khác đáng kể trang chủ và thiết kế chuyên biệt.
- **Hành vi mong đợi:** Một UI contract duy nhất; route dùng component đúng hoặc loại bỏ/tài liệu hóa rõ phần legacy.
- **Cách tái hiện:** So sánh `/customer/accounts` với component `CustomerAccounts` và mô tả trong README.
- **Hướng khắc phục:** Chốt design system và route source of truth, sau đó hợp nhất hành vi/dữ liệu mà không nhân đôi component.
- **Test case:** Visual regression giữa 4 module, breadcrumb/header/sidebar và trạng thái API đồng nhất.

### UIUX-009 — Nhiều điều khiển trông hoạt động nhưng thực tế là placeholder

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Customer home/profile, transfer, about, news
- **Bằng chứng:** Placeholder customer home `customer-home.tsx:243-246`; profile demo `customer-profile.tsx:19-23`; nút tải biên lai không handler `transfer-flow.tsx:60`; About “Tìm hiểu thêm” `about-page.tsx:47`; nhiều nút News `news-page.tsx:47,51,56`.
- **Mô tả/nguyên nhân:** Button/action affordance được dùng cho nội dung tĩnh hoặc chưa nối sự kiện.
- **Hành vi thực tế:** Người dùng nhấn nhưng không có navigation/thay đổi, hoặc chỉ nhận thông báo minh họa sau khi đã kỳ vọng workflow thật.
- **Hành vi mong đợi:** Nút hoạt động thật, hoặc disabled/“Sắp ra mắt” từ trước; link phải có destination rõ.
- **Cách tái hiện:** Nhấn các nút được nêu trên.
- **Hướng khắc phục:** Lập inventory action, phân loại live/demo/disabled và áp dụng copy/visual state thống nhất.
- **Test case:** Mỗi button/link phải có kết quả quan sát được, focus state và analytics/event mong đợi.

### UIUX-010 — Trạng thái thông báo không nhất quán và không bền vững

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Header bell, customer/employee notifications
- **Bằng chứng:** Header chỉ query customer và trả `[]` cho role khác tại `src/components/shell.tsx:20-31`; read header là một boolean local dòng 21/31/42; customer read local `customer-notifications.tsx:29,68-70`; employee read local `employee-notifications.tsx:48,90-92`.
- **Mô tả/nguyên nhân:** Có ba nguồn state riêng, không có API mark-read thống nhất.
- **Hành vi thực tế:** Employee có thông báo trên trang nhưng chuông header báo trống; reload có thể làm thông báo đã đọc trở lại chưa đọc; “đánh dấu đã đọc” trên header đánh dấu toàn bộ chỉ trong memory.
- **Hành vi mong đợi:** Cùng một notification store/API, unread count theo user, mark-one/mark-all được lưu và đồng bộ giữa header/trang.
- **Cách tái hiện:** Đăng nhập employee, so chuông và trang notifications; mở/đánh dấu rồi reload.
- **Hướng khắc phục:** Chuẩn hóa DTO/read timestamp, query key và mutation; optimistic update có rollback.
- **Test case:** Multi-tab, reload, polling, mark one/all, API failure và badge count.

### UIUX-011 — Search/ngôn ngữ và một số điều khiển header không có chức năng

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Login, admin/employee header
- **Bằng chứng:** Nút ngôn ngữ không có handler tại `src/features/auth/auth-form.tsx:73`; ô search admin/employee không có state/onChange/result tại `src/components/shell.tsx:132`.
- **Mô tả/nguyên nhân:** Điều khiển được render như chức năng hoàn chỉnh nhưng chưa nối logic.
- **Hành vi thực tế:** Nhập search không tạo kết quả; chọn ngôn ngữ không mở menu/đổi locale.
- **Hành vi mong đợi:** Có chức năng đúng hoặc loại bỏ/disabled kèm giải thích.
- **Cách tái hiện:** Login > nhấn “Tiếng Việt”; Admin/Employee > nhập ô tìm kiếm.
- **Hướng khắc phục:** Xác định search scope và i18n; không giữ interactive affordance giả.
- **Test case:** Keyboard, empty/no result, navigation result, Escape và locale persistence.

### UIUX-012 — Table toàn cục ép fixed layout và ellipsis, làm mất dữ liệu quan trọng

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED (mức cắt cụ thể tại runtime: NOT TESTED)
- **Module:** Tất cả bảng
- **Bằng chứng:** `src/app/globals.css:21-68` đặt `table-layout:fixed`, row 44 px, `overflow:hidden`, `text-overflow:ellipsis`, `white-space:nowrap`; dashboard còn row 27 px tại dòng 75-80.
- **Mô tả/nguyên nhân:** Contract toàn cục ưu tiên đồng đều hình thức hơn khả năng đọc dữ liệu.
- **Hành vi thực tế:** Nội dung dài bị cắt mà đa số cell không có tooltip/detail; bảng nhiều cột bị nén, đặc biệt khi kết hợp zoom .6.
- **Hành vi mong đợi:** Cột theo dữ liệu, horizontal scroll có chủ đích, ưu tiên cột chính, full value qua detail/tooltip accessible.
- **Cách tái hiện:** Dùng tên khách hàng/mô tả dài; mở bảng transaction/audit ở 320–1024 px.
- **Hướng khắc phục:** Bỏ rule global; cấu hình table theo module, responsive column priority/card view và accessible detail.
- **Test case:** Chuỗi Unicode dài, 200% zoom, keyboard scroll và screen reader headers.

### UIUX-013 — Modal tự viết thiếu quản lý focus và semantics đầy đủ

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Notifications, profiles, transaction detail, resource create, profile panel
- **Bằng chứng:** `customer-notifications.tsx:89`, `employee-notifications.tsx:123-131`, `customer-profile.tsx:23`, `staff-profile-page.tsx:102`, `live-resource-page.tsx` transaction detail, `resource-create-dialog.tsx:29`, `profile-panel.tsx:40-47`.
- **Mô tả/nguyên nhân:** Nhiều overlay chỉ có `role=dialog/aria-modal`, thiếu `aria-labelledby`, focus trap, focus restore và Escape; nút “×” ở một số dialog không có accessible name. Profile panel không phải dialog, kéo được không giới hạn.
- **Hành vi thực tế:** Focus có thể đi ra nền; keyboard không chắc đóng được; panel có thể kéo khỏi viewport.
- **Hành vi mong đợi:** Dùng primitive dialog thống nhất (như `components/ui.tsx` đã có), title/description liên kết, focus trap/restore, Escape và target đóng đủ lớn.
- **Cách tái hiện:** Mở modal, chỉ dùng Tab/Shift+Tab/Escape; kéo profile panel sát biên.
- **Hướng khắc phục:** Chuẩn hóa toàn bộ modal/panel trên Radix Dialog/Popover và giới hạn drag.
- **Test case:** Screen reader announcement, focus first/return, Escape, click backdrop và 320 px.

### UIUX-014 — Hồ sơ hiển thị/trữ trạng thái bảo mật và thông báo không đúng nguồn thật

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Customer/Employee profile
- **Bằng chứng:** Setting local mặc định true tại `customer-profile.tsx:10`, `staff-profile-page.tsx:21`; nhãn OTP/sinh trắc học hardcode tại `customer-profile.tsx:20`, `staff-profile-page.tsx:96`; toggle chỉ `setState` tại `customer-profile.tsx:21`, `staff-profile-page.tsx:97`.
- **Mô tả/nguyên nhân:** UI không lấy/lưu trạng thái security preference từ API nhưng trình bày như trạng thái tài khoản thật.
- **Hành vi thực tế:** Mọi người dùng thấy “Đã bật”; toggle mất sau reload; không có save/success/error.
- **Hành vi mong đợi:** Hiển thị trạng thái từ backend, mutation có pending/rollback/feedback; tính năng chưa có phải ghi rõ.
- **Cách tái hiện:** Mở profile, đổi toggle, reload; đăng nhập user khác.
- **Hướng khắc phục:** Tách view-only security state khỏi demo; nối API trước khi cho phép điều khiển.
- **Test case:** Load true/false, mutation failure, reload, user switch và permission.

### UIUX-015 — Loading/error của trang chủ có thể trình bày số 0 như dữ liệu thật

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Customer home, transfer overview
- **Bằng chứng:** Các fallback `?? 0`/mảng rỗng được render trước state tại `customer-home.tsx:66-94,137-172`; loading/error chỉ xuất hiện gần bảng tại dòng 200-201; transfer dùng account list rỗng/fallback 0 tại `transfer-flow.tsx:17-25,36-40`.
- **Mô tả/nguyên nhân:** Loading state không bao phủ các KPI và account cards.
- **Hành vi thực tế:** Trong lúc tải hoặc khi lỗi, user có thể thấy tổng số dư 0, 0 thẻ/tài khoản như dữ liệu hợp lệ.
- **Hành vi mong đợi:** Skeleton/disabled state toàn vùng; lỗi không thay bằng số liệu tài chính giả; retry rõ ràng.
- **Cách tái hiện:** Throttle/disable API rồi mở `/customer` và `/customer/transfer`.
- **Hướng khắc phục:** Dùng state machine loading/error/success cho toàn query result và stale-data indicator.
- **Test case:** Slow 3G, timeout, partial API failure, refetch và cached stale data.

### UIUX-016 — Lịch sử giao dịch thiếu công cụ tra cứu cốt lõi

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Customer transactions
- **Bằng chứng:** Route gọi `listTransactions({page:1,pageSize:100})` cố định tại `src/features/live/customer-live-page.tsx:12`; UI chung tại dòng 44 không có filter/search/pagination/detail.
- **Mô tả/nguyên nhân:** Danh sách generic không triển khai yêu cầu lọc/truy vết.
- **Hành vi thực tế:** Chỉ xem tối đa 100 bản ghi đầu; không lọc theo thời gian, type, status, account; không mở posting/risk/reversal detail.
- **Hành vi mong đợi:** Filter server-side, pagination/cursor, detail, reference giao dịch gốc/reversal và export nếu scope cho phép.
- **Cách tái hiện:** Customer > Lịch sử giao dịch với hơn 100 bản ghi.
- **Hướng khắc phục:** Thiết kế transaction history riêng, URL-synced filters và detail drawer/modal.
- **Test case:** Filter kết hợp, timezone/date boundary, no result, page transition và deep link detail.

### UIUX-017 — D4 Insights chỉ là bảng raw, chưa phải trải nghiệm analytics

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Admin Insights, Employee reports
- **Bằng chứng:** `src/features/live/live-analytics-page.tsx:6` lấy `limit:500`; dòng 6 render key object trực tiếp làm header và `String(value)` làm cell.
- **Mô tả/nguyên nhân:** Không có semantic mapping/format/visualization/filter/export/drill-down.
- **Hành vi thực tế:** Người dùng thấy tên cột kỹ thuật, ngày/số/percent raw; không phân tích xu hướng hoặc nguyên nhân.
- **Hành vi mong đợi:** Dataset-specific dashboard với KPI, biểu đồ accessible, date range, unit/format, data freshness và export.
- **Cách tái hiện:** Admin > D4 Insights, lần lượt chọn 6 dataset.
- **Hướng khắc phục:** Tạo presentation schema theo dataset, không render trực tiếp object key từ API.
- **Test case:** Schema thay đổi, null, 500+ rows, locale number/date, empty Gold và Trino error.

### UIUX-018 — Feedback sau thao tác không đủ cụ thể và chưa hỗ trợ assistive technology

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Customer lists; Admin/Employee resource actions
- **Bằng chứng:** Customer chỉ báo “Thao tác đã được xử lý” tại `customer-live-page.tsx:44`; resource action chỉ hiện error dưới bảng và không có success message tại `live-resource-page.tsx`; các vùng này không có `role=status`/`aria-live`.
- **Mô tả/nguyên nhân:** Mutation dùng một state chung cho nhiều hàng/action, không gắn phản hồi với đối tượng thao tác.
- **Hành vi thực tế:** Không biết action nào thành công, trạng thái cuối ra sao; screen reader không được thông báo; lỗi có thể xuất hiện ngoài viewport.
- **Hành vi mong đợi:** Inline/toast accessible nêu action, đối tượng, kết quả, mã tham chiếu; pending khóa đúng hàng.
- **Cách tái hiện:** Thực hiện change status/approve/reject/change PIN/pay loan và quan sát phản hồi.
- **Hướng khắc phục:** Mutation state theo row/action, live region, error recovery và refetch confirmation.
- **Test case:** Hai action liên tiếp, concurrent rows, API 4xx/5xx, focus vào lỗi và retry.

### UIUX-019 — Luồng OTP và màn kết quả chuyển tiền chưa hoàn chỉnh

- **Mức độ:** P2 — Medium
- **Trạng thái:** CONFIRMED
- **Module:** Transfer
- **Bằng chứng:** OTP chỉ có input/ghi chú tại `transfer-flow.tsx:57-58`; quay lại rồi tiến tiếp gọi request OTP mới tại dòng 31; “Tải biên lai” không handler và copy không feedback tại dòng 60.
- **Mô tả/nguyên nhân:** Thiếu countdown, resend có kiểm soát, đổi kênh, trạng thái challenge; action kết quả chưa nối đầy đủ.
- **Hành vi thực tế:** User không biết khi nào resend được; có thể tạo nhiều challenge/rate-limit; download không làm gì; copy không xác nhận thành công/thất bại.
- **Hành vi mong đợi:** Countdown/resend state, masked destination rõ, invalid/expired attempts, receipt thật và toast copy.
- **Cách tái hiện:** Tới bước OTP, quay lại/tiếp tục nhiều lần; hết hạn; nhấn download/copy.
- **Hướng khắc phục:** Mô hình hóa challenge state và hoàn thiện result actions.
- **Test case:** Resend limit, expired/wrong OTP, network retry, REVIEW/BLOCK/FAILED/SUCCESS, clipboard denied và receipt generation failure.

### UIUX-020 — Cỡ chữ/target quá nhỏ và khả năng truy cập chưa đạt bằng chứng WCAG 2.2 AA

- **Mức độ:** P3 — Low (có thể nâng P2 sau kiểm thử người dùng/AT)
- **Trạng thái:** CONFIRMED (mức tuân thủ WCAG cuối cùng: NOT TESTED)
- **Module:** Toàn frontend, đặc biệt dashboard/about/news/sidebar
- **Bằng chứng:** Sidebar 11 px và subtitle 9 px tại `shell.tsx:60,117-122`; dashboard dùng 8–10 px tại `admin-overview.tsx:38,46,51,54-56,71-75`; About/News nhiều text 9–11 px; CSS zoom tiếp tục thu nhỏ. Không tìm thấy skip link toàn app; chỉ customer-home có `prefers-reduced-motion`.
- **Mô tả/nguyên nhân:** Thiết kế mật độ cao ưu tiên ép vừa viewport; accessibility pattern không được áp dụng hệ thống.
- **Hành vi thực tế:** Chữ/chạm khó dùng, nhất là thị lực kém/màn hình độ phân giải cao; chart donut/bar thiếu bảng dữ liệu/mô tả tương đương; focus/target cần kiểm chứng thêm.
- **Hành vi mong đợi:** Text thân bài thường tối thiểu khoảng 14–16 px, target tối thiểu 24×24 CSS px, visible focus, skip link, reduced motion toàn app và chart có text alternative/data table.
- **Cách tái hiện:** Browser zoom 200%, keyboard-only, screen reader, forced colors và reduced motion.
- **Hướng khắc phục:** Accessibility baseline trong design system; loại bỏ zoom; audit contrast/focus/target bằng công cụ và người dùng thật.
- **Test case:** axe/Lighthouse kết hợp manual WCAG 1.4.4, 1.4.10, 2.4.1, 2.4.7/2.4.11, 2.5.8, 4.1.2/4.1.3.

## 7. Các mâu thuẫn tài liệu/giao diện cần quyết định

- `web/README.md` nói đăng nhập demo chấp nhận mật khẩu tối thiểu 6 ký tự, trong khi form yêu cầu 8 ký tự (`auth-form.tsx:15`).
- `web/README.md` mô tả `/customer/accounts` dùng giao diện riêng, nhưng route hiện dùng `CustomerLivePage` generic.
- Trang quên mật khẩu nói customer có thể đổi mật khẩu trong Hồ sơ cá nhân, nhưng customer profile chuyên biệt chỉ mở modal minh họa; một nút đổi mật khẩu thật lại nằm trong nhánh generic `CustomerLivePage` mà route profile không sử dụng.
- About/News chứa số liệu/nội dung hardcode (nhiều tin năm 2024) trong khi các dashboard khác nhấn mạnh live data 2026; cần phân biệt rõ content CMS/static với dữ liệu vận hành.

## 8. Kế hoạch cải thiện đề xuất

1. **Chặn phát hành:** sửa type contract của notifications; thay prompt bí mật/nghiệp vụ tài chính; khóa tên người nhận đã xác minh.
2. **An toàn thao tác:** chuẩn hóa dialog xác nhận và form cho loan payment, reversal, nạp/rút, approve/reject, status và credential/PIN.
3. **Nền layout:** bỏ `zoom`/fixed viewport; tạo responsive shell/table/modal thực sự và kiểm thử 6 viewport + 200% zoom.
4. **Truthful UI:** đánh dấu/ẩn chức năng demo, đồng bộ trạng thái notifications/profile với backend, bỏ số liệu hardcode khỏi vùng live.
5. **Hoàn thiện chức năng:** transaction history, savings, payments, receipt, OTP resend và Insights theo dataset.
6. **Accessibility:** dialog/focus/live region, text/target size, skip link, chart alternatives, contrast và reduced-motion.
7. **Regression:** bổ sung component tests, keyboard/a11y tests và screenshot tests theo role/viewport sau khi ứng dụng render được.

## 9. Top 20 vấn đề UI/UX cần ưu tiên

1. **P1 — UIUX-001:** Type-check hỏng ở hai trang thông báo.
2. **P1 — UIUX-002:** Mật khẩu/PIN nhập qua `window.prompt`.
3. **P1 — UIUX-003:** Thanh toán khoản vay yêu cầu ID nội bộ và không xác nhận.
4. **P1 — UIUX-004:** Hành động tài chính/quản trị trọng yếu thiếu form và confirmation.
5. **P1 — UIUX-005:** Tên người nhận sửa được sau khi xác minh.
6. **P2 — UIUX-006:** Dùng `zoom` + `overflow:hidden` thay cho responsive/reflow.
7. **P2 — UIUX-007:** Tiết kiệm và thanh toán chưa triển khai đầy đủ.
8. **P2 — UIUX-010:** Notification state/header không đồng bộ và không persist.
9. **P2 — UIUX-013:** Modal/panel thiếu quản lý focus và semantics đầy đủ.
10. **P2 — UIUX-015:** Loading/error có thể hiển thị số dư/KPI 0 như dữ liệu thật.
11. **P2 — UIUX-016:** Lịch sử giao dịch thiếu filter, pagination và detail.
12. **P2 — UIUX-019:** OTP/resend/receipt/copy feedback chưa hoàn chỉnh.
13. **P2 — UIUX-012:** Table fixed + ellipsis làm mất dữ liệu quan trọng.
14. **P2 — UIUX-018:** Feedback mutation chung chung, không có live region.
15. **P2 — UIUX-014:** Profile hiển thị security/settings không dựa vào trạng thái thật.
16. **P2 — UIUX-017:** D4 Insights chỉ render bảng raw.
17. **P2 — UIUX-008:** Route customer generic mâu thuẫn thiết kế chuyên biệt/tài liệu.
18. **P2 — UIUX-009:** Nhiều nút/shortcut trông hoạt động nhưng chỉ là placeholder.
19. **P2 — UIUX-011:** Search admin/employee và language selector không hoạt động.
20. **P3 — UIUX-020:** Chữ/target quá nhỏ và chưa có bằng chứng đạt WCAG 2.2 AA.

## 10. Phần chưa thể kiểm chứng

- Pixel alignment, chồng lấn, overflow thực tế và visual consistency trên 6 viewport.
- Contrast ratio computed, focus order thực tế, screen reader announcement và touch target sau browser scaling.
- Luồng đăng nhập/chuyển tiền/approve/reject end-to-end với API và PostgreSQL thật.
- Nội dung lỗi từ backend có thân thiện hay rò rỉ chi tiết kỹ thuật khi render thực tế.
- Hiệu năng Web Vitals, font/image loading, layout shift và tương tác trên thiết bị thật.

**Điểm dừng:** Báo cáo này chỉ hoàn thành Giai đoạn 2. Không thực hiện Giai đoạn 3 hoặc sửa code.
