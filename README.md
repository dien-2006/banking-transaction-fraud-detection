# D4 Bank — Banking Transaction Fraud Detection & Data Platform

**Nền tảng mô phỏng ngân hàng tích hợp phát hiện gian lận và phân tích dữ liệu.**

D4 Bank kết nối toàn bộ hành trình của một giao dịch: khách hàng gửi yêu cầu chuyển tiền, hệ thống đánh giá rủi ro bằng Rule Engine và Machine Learning, ngân hàng xử lý tiền, sau đó dữ liệu được đưa vào nền tảng phân tích qua Batch và Realtime.

Triển khai web/API trên EC2: xem [hướng dẫn Docker production trong running.md](running.md#triển-khai-webapi-trên-ec2-bằng-docker).
Profile `web` đóng gói frontend và gateway HTTP/HTTPS, gọi API cùng origin;
DB vẫn được khởi tạo thủ công, không tự tạo bảng hoặc nhập dữ liệu khi bật Docker.

Dự án kết hợp ba lĩnh vực: **ứng dụng ngân hàng**, **phát hiện gian lận**, và **Data Engineering**. Giao diện phục vụ khách hàng, nhân viên và quản trị viên; dữ liệu nghiệp vụ được lưu trong PostgreSQL, còn dữ liệu phân tích được tổ chức trên MinIO theo mô hình Bronze → Silver → Gold.

## Mục lục

- [Chức năng chính](#chức-năng-chính)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Luồng giao dịch ngân hàng](#luồng-giao-dịch-ngân-hàng)
- [Phát hiện gian lận](#phát-hiện-gian-lận)
- [Nền tảng dữ liệu](#nền-tảng-dữ-liệu)
- [Mô hình dữ liệu phân tích](#mô-hình-dữ-liệu-phân-tích)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
- [API và các dịch vụ](#api-và-các-dịch-vụ)
- [Kiểm thử](#kiểm-thử)
- [Nguyên tắc thiết kế](#nguyên-tắc-thiết-kế)

## Chức năng chính

### Khách hàng

- Đăng nhập và quản lý hồ sơ cá nhân.
- Đăng ký tài khoản đăng nhập tại `/register`: họ tên, điện thoại, email, tên đăng nhập và mật khẩu; xác minh email bằng OTP trước khi lưu. Mã khách hàng tự cấp; hồ sơ và tài khoản đăng nhập được tạo trong cùng một transaction DB, chưa có tài khoản ngân hàng và chưa xác minh KYC. Email đã có hồ sơ không được đăng ký thêm hồ sơ từ form này; dùng luồng kích hoạt cho hồ sơ hiện có hoặc liên hệ chi nhánh hỗ trợ. OTP đăng ký tách biệt với OTP chuyển tiền, hết hạn sau 5 phút, tối đa 5 lần thử; gửi lại sau 60 giây. Gửi lại cùng yêu cầu sau lỗi mạng không tạo thêm khách hàng nhờ dấu yêu cầu trong audit log hiện có. Cần cấu hình Brevo hợp lệ.
- Khách hàng đã được chi nhánh tạo hồ sơ dùng `/activate` (liên kết **Kích hoạt ngân hàng trực tuyến** tại trang đăng nhập): nhập mã khách hàng, email đã lưu, tên đăng nhập và mật khẩu; xác nhận OTP để tạo đăng nhập cho đúng hồ sơ hiện có. Chỉ hỗ trợ hồ sơ Active, có email không dùng chung với hồ sơ khác và chưa có đăng nhập; hồ sơ đã có đăng nhập, kể cả bị vô hiệu hóa, phải được chi nhánh hỗ trợ khôi phục. Không tạo thêm khách hàng, tài khoản ngân hàng hay tự cập nhật KYC. OTP kích hoạt có namespace/HMAC riêng, hết hạn 5 phút, tối đa 5 lần thử, gửi lại sau 60 giây; API không tiết lộ hồ sơ có tồn tại qua phản hồi yêu cầu OTP. Khi lưu, khóa hồ sơ và kiểm tra lại trạng thái/email; đăng nhập và dấu yêu cầu trong audit log được commit cùng nhau để thử lại an toàn. Không thay đổi schema.
- Xem tài khoản, số dư, thẻ và lịch sử giao dịch.
- Tự mở thêm tài khoản khách hàng tại chi nhánh và sản phẩm đang hoạt động; số tài khoản được tự cấp, số dư ban đầu bằng 0. Tự phát hành thẻ ghi nợ mô phỏng trên tài khoản VND mà mình đứng tên chính, với PIN được băm và số thẻ chỉ trả về dạng đã che. Hạn mức thẻ do server cấu hình qua `CUSTOMER_CARD_DAILY_LIMIT` (mặc định 50.000.000 VND/ngày), hiệu lực 3 năm; không tự phát hành thẻ tín dụng.
- Gửi hồ sơ vay theo lãi suất và giới hạn của sản phẩm trong DB. Hồ sơ lưu ở trạng thái `Pending`; hệ thống chọn nhân viên đang hoạt động của chi nhánh để tiếp nhận. Nhân viên/admin nhấn **Xử lý**, chọn tài khoản VND do khách hàng vay đứng tên chính, nhập lý do rồi **Phê duyệt và giải ngân**. Banking Core dùng nghiệp vụ `DEPOSIT` hiện có để ghi nợ tài khoản nguồn ngân hàng và ghi có đúng số tiền vay vào tài khoản nhận, theo quyền phê duyệt nhân viên/admin, không gọi model. Chỉ `Success` mới kích hoạt khoản vay và tạo lịch trả nợ từ ngày giải ngân, trong cùng transaction. Lệnh giải ngân cũ đang `REVIEW` có thể được nhân viên xác nhận lại tại trang Khoản vay; thiếu số dư không tạo dư nợ. Từ chối hồ sơ chưa có lệnh chờ chuyển sang `Cancelled`.
- Khách hàng chỉ chọn tài khoản ngân hàng của mình để nhận tiền vay và trích tiền trả nợ; không cần cấu hình ID tài khoản giải ngân/thu nợ trong `.env`. Backend tự xử lý đối ứng từ tài khoản ngân hàng có sẵn trong DB: giải ngân ưu tiên tài khoản đủ số dư rồi cùng chi nhánh; trả nợ ưu tiên tài khoản đã giải ngân, sau đó tài khoản từng nhận trả nợ của hồ sơ, rồi tài khoản cùng chi nhánh. Không tự tạo tài khoản hoặc số dư. Mỗi lệnh giữ nguyên khóa khi thử lại; khóa khoản vay ngăn hai lệnh khác nhau giải ngân trùng. Liên kết khoản vay/chứng từ lưu trong `audit_log` hiện có, không thêm bảng/cột. Chứng từ giải ngân không dùng chức năng đảo giao dịch chung; cần quy trình bù trừ khoản vay riêng.
- Chi tiết khoản vay khách hàng hiển thị chứng từ giải ngân và tài khoản nhận. Khoản vay cũ `Active/Overdue` vẫn trả nợ trực tuyến từ tài khoản khách hàng theo lịch hiện có; hệ thống không tự giải ngân lại hoặc sửa số dư dữ liệu cũ.
- Ba thao tác đăng ký dùng mã yêu cầu để chống tạo trùng khi gửi lại. Kết quả và dấu kiểm tra yêu cầu được ghi vào audit log trong cùng transaction với sản phẩm; PIN không được lưu trong audit log. Không thêm bảng hoặc đổi schema.
- Form tự mở thẻ có lựa chọn bắt buộc: ghi nợ tiêu chuẩn, ghi nợ nội địa (Napas), ghi nợ Visa hoặc ghi nợ Mastercard. Danh sách do API cung cấp; loại đã chọn được kiểm tra ở server, ghi vào `card.cardtype` và tham gia kiểm tra gửi lại yêu cầu. Đây là các biến thể mô phỏng của thẻ ghi nợ, chưa tích hợp các mạng thanh toán thực tế.
- Chuyển tiền với xác minh người nhận và OTP qua email.
- Người nhận gần đây được lấy từ toàn bộ lịch sử chuyển tiền thành công của khách hàng, dùng được khi đăng nhập lại hoặc đổi thiết bị. Danh sách gộp theo tài khoản nhận và sắp xếp lần chuyển mới nhất trước; chỉ gợi ý tài khoản khách hàng VND đang hoạt động và xác minh lại trước khi chuyển. Bốn người nhận đầu hiển thị trên trang, nút “Xem tất cả” mở danh sách đầy đủ.
- Mỗi tài khoản khách hàng VND đang hoạt động có mã QR nhận tiền với biểu tượng D4 Bank ở giữa. Ảnh PNG tải xuống gồm logo ngân hàng, tên chủ tài khoản, số tài khoản và QR. Trang Chuyển tiền đọc QR qua camera hoặc ảnh, xác minh người nhận từ DB và tiếp tục qua xác nhận/OTP như chuyển khoản thông thường. QR này dùng trong D4 Bank, chưa tích hợp mạng thanh toán ngân hàng bên ngoài.
- Camera quét QR ưu tiên độ nét cao, hỗ trợ chọn thiết bị và tự động lấy nét nếu camera cho phép. QR mới dùng dữ liệu ngắn để giảm mật độ ô; QR JSON đã tải ở phiên bản trước vẫn được đọc bình thường.
- Theo dõi kết quả giao dịch, xem và tải ảnh PNG biên nhận theo đúng trạng thái giao dịch.
- Nhấn thông báo có giao dịch liên kết để mở ngay chi tiết bằng `notification_outbox.transactionid`, kể cả giao dịch ngoài trang lịch sử đang xem. API kiểm tra quyền sở hữu trước khi trả thông tin chuyển/nhận; trạng thái lấy từ giao dịch hiện tại, không suy ra từ nội dung thông báo. Thông báo không liên kết giao dịch vẫn hiển thị nội dung thông thường.
- Tra cứu khoản vay, lịch trả nợ và trạng thái từng kỳ.
- Trong chi tiết khoản vay có phần thanh toán bên dưới lịch trả nợ: chọn kỳ và tài khoản nguồn, kiểm tra gốc/lãi/phí còn lại do DB đối chiếu, rồi xác nhận trả nợ. Dùng API `pay_loan` hiện có và giữ đúng kết quả Success/Pending/Cancelled/Failed. Khách hàng chọn tài khoản nguồn của mình; Banking Core tự xác định đối ứng ngân hàng từ dữ liệu DB, không yêu cầu nhập ID tài khoản thu nợ. Mã giao dịch được giữ nguyên khi thử lại sau lỗi mạng.
- Quản lý thiết bị, đổi mật khẩu, đổi PIN thẻ và xem thông báo.
- Trong chi tiết thẻ, chính chủ có thể nhấn **Hiện số thẻ** và xác thực bằng mật khẩu đăng nhập. Số đầy đủ chỉ hiện trong hộp thoại tối đa 30 giây; tự che khi chuyển cửa sổ, ẩn tab hoặc đóng hộp thoại. API chỉ cho khách hàng xem thẻ của mình, giới hạn 5 lần thử/15 phút theo khách hàng và trả `Cache-Control: no-store`. Nhật ký chỉ lưu việc truy cập, không lưu mật khẩu hoặc số thẻ đầy đủ; API danh sách vẫn trả số đã che.

### Nhân viên ngân hàng

- Thêm khách hàng với mã tự cấp dạng `C0000001` theo ID tự tăng; không cần nhập mã thủ công. Dãy số có thể có khoảng trống khi thao tác tạo không hoàn tất.
- Form tạo khách hàng chỉ bắt buộc họ tên (tối đa 150 ký tự). Các thông tin khác có thể bỏ trống và lưu NULL; nếu nhập thì kiểm tra định dạng, độ dài theo schema, ngày sinh hợp lệ và không ở tương lai. Giấy tờ định danh phải duy nhất khi được cung cấp.
- Hai form tạo khách hàng/mở tài khoản hiển thị lỗi bằng tiếng Việt, chỉ rõ giấy tờ hoặc số tài khoản bị trùng và các lựa chọn không còn tồn tại. Lỗi kết nối yêu cầu kiểm tra danh sách trước khi gửi lại vì kết quả lưu có thể chưa xác định.
- Hồ sơ chưa gắn tài khoản hoặc khoản vay hiển thị cho chính nhân viên đã tạo, dựa trên audit log. Khi hồ sơ đã gắn chi nhánh, quyền truy cập tuân theo chi nhánh.
- Tạo hồ sơ khách hàng mới tại trang Khách hàng. Trang Tài khoản chỉ mở tài khoản cho khách hàng đã có hồ sơ bằng cách tìm tên hoặc mã; không tạo thêm hồ sơ khách hàng từ form mở tài khoản.
- Form mở tài khoản chỉ phục vụ khách hàng, không có lựa chọn nhóm tài khoản nội bộ. API bắt buộc có khách hàng sở hữu và từ chối yêu cầu tạo tài khoản nội bộ cho cả admin lẫn nhân viên.
- Số tài khoản được tự cấp khi mở, dựa trên identity sequence hiện có (thông thường 16 chữ số), không cần nhập thủ công. Cơ chế cấp số giữ constraint duy nhất và bỏ qua số đã tồn tại; không thay đổi schema.
- Phát hành thẻ yêu cầu ID khách hàng đã có và tài khoản đang hoạt động thực sự thuộc khách hàng đó. Số thẻ mô phỏng được tự cấp, kết quả chỉ trả số đã che; PIN 4–6 chữ số được xác nhận trên form, băm khi lưu và không trả lại qua API.
- Tạo khoản vay yêu cầu ID khách hàng đã có; mã `LN...` tự cấp. Lãi suất mặc định, số tiền và kỳ hạn tối đa lấy từ sản phẩm vay. Hồ sơ mới có trạng thái `Pending`, không tự duyệt hoặc giải ngân.
- Cả bốn form hiển thị kết quả sau khi lưu, gồm mã/số thực tế do backend trả về. Không yêu cầu nhập ID bằng tay: tìm tên/mã/ID để chọn đúng hồ sơ, giữ nguyên phạm vi chi nhánh theo quyền.
- Tra cứu khách hàng, tài khoản, thẻ, khoản vay và giao dịch trong phạm vi chi nhánh.
- Thực hiện chuyển khoản tại quầy sau khi xác minh yêu cầu của khách hàng.
- Xử lý các nghiệp vụ nạp/rút tiền và quản lý tài khoản.
- Kiểm tra giao dịch cần duyệt, đưa ra quyết định chấp thuận hoặc từ chối.
- Trang giám sát có tab Giao dịch nghi ngờ lọc quyết định REVIEW/BLOCK từ các hồ sơ review được cấp quyền. Tab Tài khoản cần review gom hồ sơ OPEN/IN_REVIEW theo tài khoản nguồn; nút Xem hồ sơ mở đúng danh sách chưa hoàn tất của tài khoản đã chọn.
- Quản lý khoản vay và ghi nhận nhãn gian lận phục vụ phân tích, Machine Learning.

### Quản trị viên

- Thêm hồ sơ nhân viên với mã `EMP...` tự cấp từ identity hiện có; tên, chi nhánh, vai trò, điện thoại, email, ngày vào làm và lương là bắt buộc. Giới tính/ngày sinh có thể để trống, lương có thể bằng 0. Danh mục chi nhánh và vai trò lấy từ DB và được kiểm tra còn hoạt động khi lưu; API kiểm tra định dạng, ngày sinh không ở tương lai, ngày vào làm không trước ngày sinh, lương không âm và nằm trong NUMERIC(19,2). Email chuẩn hóa chữ thường; điện thoại/email phải duy nhất. Sau khi lưu hiển thị mã và thông tin thực tế, làm mới danh sách; việc cấp tài khoản đăng nhập nhân viên là thao tác riêng của admin. Không thay đổi cấu trúc bảng.

- Thêm chi nhánh với mã tự cấp `CN...` từ identity hiện có; không nhập mã trên web. Bắt buộc tên, tỉnh/thành phố, địa chỉ và ngày bắt đầu hoạt động (mặc định hôm nay); điện thoại có thể bỏ trống và lưu NULL. API kiểm tra khoảng trắng, độ dài theo schema, định dạng điện thoại và ngày hợp lệ. Sau khi tạo, hiển thị mã thực tế từ DB và làm mới danh sách/danh mục chi nhánh. Không thêm bảng hoặc cột.

- Mặc định xem dữ liệu toàn bộ chi nhánh. Các API danh sách khách hàng, tài khoản, thẻ, khoản vay, giao dịch và hồ sơ review hỗ trợ lọc `branchId`; tham số này không thể thay đổi phạm vi chi nhánh của nhân viên.
- Theo dõi hoạt động ngân hàng qua dashboard tổng quan.
- Quản lý chi nhánh, nhân viên và tài khoản hệ thống.
- Tra cứu giao dịch rủi ro và nhật ký thao tác.
- Tạo cảnh báo thủ công bằng mã giao dịch và lý do tại trang Giám sát rủi ro. API chỉ tạo hồ sơ OPEN khi giao dịch còn Pending và quyết định Risk mới nhất là REVIEW; hồ sơ đã có được trả lại, không mở lại hoặc ghi đè lý do. Thao tác ghi audit bằng trigger hiện có, không đổi quyết định Risk, số dư hoặc posting.
- Xem báo cáo trên dữ liệu Gold qua Trino tại khu vực D4 Insights.

### Xử lý dữ liệu và Machine Learning

- Kết hợp Rule Engine với mô hình XGBoost để đánh giá giao dịch.
- Phát sự kiện đã commit bằng Transactional Outbox và Kafka.
- Thu thập dữ liệu từ PostgreSQL và Kafka vào MinIO.
- Chuẩn hóa, kiểm tra chất lượng và đưa dữ liệu không hợp lệ vào Quarantine.
- Xây dựng 10 bảng chiều và 7 bảng sự kiện phục vụ phân tích.
- Lập lịch pipeline bằng Airflow; lưu dữ liệu và kết quả kiểm tra theo từng batch.

### Policy thao tác nhân viên/admin

Nghiệp vụ tài chính tại quầy và phê duyệt giải ngân do nhân viên/admin xác nhận không gọi model ML hoặc Rule Engine, không tạo kết quả dự đoán giả. Banking Core kiểm tra người xử lý đang hoạt động, quyền chi nhánh và ghi bằng chứng `STAFF_TRANSACTION_AUTHORIZATION` vào audit log. Chỉ nhánh được xác thực này mới được hạch toán theo quyền nhân viên; giao dịch khách hàng trực tuyến vẫn phải qua Risk/ML với policy V1 hiện tại.

Phê duyệt khoản vay ghi có vào tài khoản VND đã chọn của người vay, đồng thời ghi nợ tài khoản nguồn ngân hàng. Chỉ khi hạch toán thành công mới kích hoạt khoản vay và tạo lịch trả nợ. Chứng từ, bút toán và outbox vẫn lưu trong DB để đối soát/chống trùng; chứng từ giải ngân được ẩn khỏi danh sách lịch sử giao dịch thông thường. Hồ sơ giải ngân cũ đang REVIEW có thể được nhân viên xác nhận lại tại trang Khoản vay để hoàn tất lệnh hiện có, không tạo lệnh mới.

## Kiến trúc hệ thống

```mermaid
flowchart TB
    Web[Web Next.js] --> API[Banking API NestJS]
    API --> Risk[Rule Engine + XGBoost]
    API --> Core[Banking Core / PostgreSQL]
    Risk --> Decision{ALLOW / REVIEW / BLOCK}
    Decision -->|ALLOW hoặc REVIEW được duyệt| Core
    Core --> Commit[Posting + Balance + Status + Outbox / COMMIT]

    Commit --> Publisher[Outbox Publisher]
    Publisher --> Kafka[Kafka]
    Kafka --> Consumer[Bronze Consumer]
    Consumer --> Bronze[MinIO Bronze]

    Core -->|Snapshot 20 bảng| Extract[Spark JDBC]
    Extract --> Bronze
    Bronze --> Silver[Spark / Silver]
    Silver --> DQ[Data Quality]
    Silver --> Quarantine[Quarantine]
    DQ --> Gold[Gold / 10 Dimensions + 7 Facts]
    Gold --> Trino[Trino]
    Trino --> Insights[D4 Insights / BI]
    DQ --> Features[Curated Data / Feature Mart]
    Features --> Training[ML Training & Evaluation]

    Airflow[Airflow] -. Điều phối Batch .-> Extract
    Airflow -. Điều phối Batch .-> Silver
    Airflow -. Điều phối Batch .-> Gold
```

Hệ thống có ba vùng trách nhiệm:

| Vùng | Trách nhiệm |
|---|---|
| **Banking Core** | Kiểm tra nghiệp vụ, khóa tài khoản, debit/credit, cập nhật số dư, trạng thái và outbox |
| **Risk/Fraud** | Tính điểm rule, dự đoán xác suất gian lận và quyết định ALLOW/REVIEW/BLOCK |
| **Data Platform** | Kafka, thu thập dữ liệu, xử lý Spark, điều phối Airflow, lưu trữ MinIO và phân tích Trino |

**COMMIT là ranh giới giữa giao dịch ngân hàng và nền tảng dữ liệu.** Một giao dịch đã commit không bị đảo ngược vì Kafka, Spark, MinIO hoặc Airflow tạm ngừng hoạt động.

## Công nghệ sử dụng

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Giao diện | Next.js, React, TypeScript, Tailwind CSS | Không gian làm việc cho ba nhóm người dùng |
| Biểu đồ và dữ liệu giao diện | ECharts, TanStack Query | Trực quan hóa, tải và quản lý cache dữ liệu |
| Backend | NestJS, TypeScript | API, xác thực, phân quyền và điều phối nghiệp vụ |
| Cơ sở dữ liệu nghiệp vụ | PostgreSQL, PL/pgSQL | Lưu dữ liệu, thực thi nghiệp vụ và bảo đảm transaction |
| Xác thực | JWT, Redis | Phiên đăng nhập, OTP và giới hạn tần suất yêu cầu |
| Email | Brevo | Gửi OTP và thông báo giao dịch |
| Phát hiện gian lận | Python, XGBoost, scikit-learn, joblib | Dự đoán xác suất gian lận |
| Realtime | Apache Kafka | Truyền sự kiện sau commit |
| Data Lake | MinIO, Parquet | Lưu dữ liệu Bronze, Silver, Gold và Quarantine |
| Xử lý dữ liệu | Apache Spark / PySpark | Trích xuất, biến đổi, kiểm tra và xây dựng dữ liệu phân tích |
| Điều phối | Apache Airflow | Lập lịch, retry và theo dõi từng bước Batch |
| Truy vấn phân tích | Trino, Hive Metastore | Truy vấn các bảng và view Gold |
| Triển khai | Docker Compose | Đóng gói và kết nối các dịch vụ |

## Luồng giao dịch ngân hàng

Ví dụ một khách hàng chuyển tiền từ tài khoản A sang tài khoản B:

1. Khách hàng chọn tài khoản nguồn, nhập số tài khoản nhận và số tiền.
2. API xác minh thông tin người nhận; khách hàng xác nhận giao dịch bằng OTP.
3. Hệ thống lấy dữ liệu hành vi trước giao dịch, chạy Rule Engine và model XGBoost.
4. Decision Engine quyết định **ALLOW**, **REVIEW** hoặc **BLOCK**.
5. Giao dịch ALLOW, hoặc REVIEW đã được nhân viên duyệt, đi vào xử lý tài chính.
6. PostgreSQL khóa tài khoản và kiểm tra lại quyền giao dịch, trạng thái tài khoản, số dư.
7. Posting debit/credit, thay đổi số dư, trạng thái thành công và sự kiện outbox được ghi trong cùng transaction.
8. Sau commit, publisher chuyển sự kiện tới Kafka để hệ thống dữ liệu tiếp nhận.

| Quyết định | Cách xử lý |
|---|---|
| **ALLOW** | Được phép bước vào xử lý tài chính |
| **REVIEW** | Chờ nhân viên kiểm tra; chỉ xử lý tài chính sau APPROVE |
| **BLOCK** | Dừng yêu cầu, không tạo posting tài chính |

**ALLOW không đồng nghĩa với SUCCESS.** Ví dụ, giao dịch có rủi ro thấp vẫn có thể thất bại vì tài khoản không đủ số dư khi được khóa và kiểm tra lại.

API dùng `idempotencyKey` để nhận diện các lần gửi lại cùng một yêu cầu. PostgreSQL kiểm tra nội dung yêu cầu và giữ việc retry không tạo thêm một lần chuyển tiền.

## Phát hiện gian lận

### Rule Engine

Sáu rule tạo điểm rủi ro theo chính sách V1:

| Rule | Điều kiện | Điểm |
|---|---|---:|
| R01 — HIGH_AMOUNT | Số tiền từ 50.000.000 VND | +20 |
| R02 — NEW_DEVICE | Thiết bị mới hoặc chưa được tin cậy | +20 |
| R03 — UNUSUAL_TIME | Giao dịch từ 00:00 đến trước 05:00 | +10 |
| R04 — HIGH_VELOCITY | Có ít nhất 5 giao dịch trong cửa sổ 10 phút | +25 |
| R05 — FAILED_LOGIN | Có ít nhất 5 lần đăng nhập thất bại/bị chặn trong 30 phút | +15 |
| R06 — AMOUNT_ANOMALY | Số tiền từ 5 lần mức trung bình 30 ngày | +20 |

`RuleScore` là tổng điểm các rule được kích hoạt, tối đa 100.

| RuleScore | RiskLevel |
|---|---|
| 0–39 | LOW |
| 40–59 | MEDIUM |
| 60–79 | HIGH |
| 80–100 | CRITICAL |

### Machine Learning

Model online là pipeline **XGBoost** tại [`models/fraud_detection_model.joblib`](models/fraud_detection_model.joblib), đi kèm [`models/model_metadata.json`](models/model_metadata.json).

Model sử dụng **19 feature** thuộc các nhóm:

- Thông tin giao dịch: số tiền, kênh và loại giao dịch.
- Thời gian: giờ, ngày trong tuần và giao dịch ban đêm.
- Tài khoản: số ngày từ khi mở tài khoản.
- Hành vi giao dịch: tần suất trong 1 giờ, 24 giờ, 7 ngày, 30 ngày; mức tiền trung bình, lớn nhất và khoảng cách giữa các giao dịch.
- Đăng nhập: số lần thành công, thất bại và tỷ lệ thất bại.

API giữ một worker Python để cache model trong bộ nhớ. Feature được lấy trước giao dịch; xác suất, danh tính artifact và feature snapshot được liên kết với kết quả đánh giá để truy vết.

Notebook phục vụ chuẩn bị dữ liệu, huấn luyện và đánh giá nằm trong [`notebooks/`](notebooks/). Các module trong [`ml/`](ml/) phục vụ inference và vòng đời artifact; bộ trainer JSON/logistic được giữ riêng cho nghiên cứu, tách với model joblib online.

### Decision Engine

```text
Nếu ModelProbability >= 0.90 hoặc RuleScore >= 80 → BLOCK
Nếu ModelProbability >= 0.60 hoặc RuleScore >= 60 → REVIEW
Các trường hợp còn lại                         → ALLOW
```

BLOCK được xét trước REVIEW. Xác suất model và điểm rule được lưu riêng trong `risk_assessment`, cùng model version và thông tin giải thích.

## Nền tảng dữ liệu

### Batch: từ PostgreSQL đến Gold

```text
PostgreSQL — cùng một snapshot cho 20 bảng
    → Spark JDBC
    → Bronze
    → Bronze Data Quality
    → Silver / Quarantine
    → Silver Data Quality
    → Gold
    → Gold Data Quality
    → Publish release trên Trino
```

V1 sử dụng **full snapshot nhất quán** cho 20 bảng nguồn. Các reader cùng nhìn một trạng thái PostgreSQL, giúp giữ quan hệ giữa giao dịch, posting, risk và các bảng tham chiếu.

DAG [`banking_bronze_silver_gold`](airflow/dags/banking_data_pipeline.py) chạy lúc **01:00 hằng ngày theo giờ Việt Nam**. Airflow điều phối; logic xử lý nằm trong các module Spark. Mỗi stage có thể retry độc lập.

### Realtime: từ Outbox đến Bronze

```text
Giao dịch COMMIT → EVENT_OUTBOX → Publisher → Kafka → Consumer → Bronze
```

Publisher chỉ đọc sự kiện đã commit. Consumer lưu và kiểm tra object trên MinIO trước khi commit Kafka offset.

Cơ chế truyền là **at-least-once**: sự kiện có thể được gửi lại khi retry. Bronze giữ dữ liệu để audit/replay; các bước xử lý sau sử dụng khóa sự kiện để deduplicate.

Các trang nghiệp vụ trên web đọc PostgreSQL qua API. Kafka cung cấp dữ liệu sự kiện cho Data Platform; khi bật `ENABLE_REALTIME_SILVER_MERGE`, Batch tạo thêm dataset `domain_event` để phân tích và đối soát. Các bảng Silver nghiệp vụ lấy PostgreSQL Batch làm nguồn chuẩn.

### Vai trò của các lớp dữ liệu

| Lớp | Nội dung và mục đích |
|---|---|
| **Bronze** | Dữ liệu nguồn và metadata thu thập, phục vụ audit và replay |
| **Silver** | Dữ liệu đã chuẩn hóa, kiểm tra và deduplicate theo khóa nghiệp vụ |
| **Quarantine** | Record không hợp lệ kèm dữ liệu gốc và lý do để đối soát |
| **Gold** | Dimensions, facts và view phục vụ báo cáo, dashboard |
| **Pipeline Control** | Metadata batch, kết quả các stage và thông tin release |

Silver và Gold được tổ chức theo **release của từng batch**. Gold đọc Silver đã qua DQ của đúng batch; sau khi Gold đạt kiểm tra, hệ thống publish release cho analytics. Chạy lại cùng batch giữ tính idempotent và không nhân bản dữ liệu phân tích.

## Mô hình dữ liệu phân tích

PostgreSQL có **29 bảng nghiệp vụ**. Data Platform chọn **20 bảng nguồn** theo [`config/sources.yaml`](config/sources.yaml) để xây dựng Gold gồm **10 dimensions và 7 facts**.

**Dimension** mô tả đối tượng dùng để phân tích; **fact** lưu các sự kiện và số đo nghiệp vụ.

| Dimensions | Mô tả |
|---|---|
| `dim_date`, `dim_time` | Ngày và thời gian |
| `dim_customer`, `dim_account` | Khách hàng và tài khoản |
| `dim_account_type`, `dim_branch` | Loại tài khoản và chi nhánh |
| `dim_transaction_type`, `dim_channel` | Loại giao dịch và kênh |
| `dim_device`, `dim_model` | Thiết bị và phiên bản model |

| Facts | Một dòng đại diện cho |
|---|---|
| `fact_transaction` | Một giao dịch ngân hàng |
| `fact_transaction_posting` | Một posting debit hoặc credit |
| `fact_risk_assessment` | Một lần đánh giá rủi ro |
| `fact_fraud_review` | Một hồ sơ kiểm tra giao dịch |
| `fact_fraud_label_event` | Một sự kiện gán nhãn gian lận |
| `fact_login_event` | Một sự kiện đăng nhập |
| `fact_loan_payment` | Một lần thanh toán khoản vay |

Trino cung cấp các view tổng hợp theo giao dịch, rủi ro, review, model, đăng nhập và trả nợ. D4 Insights sử dụng release Gold để hiển thị dữ liệu phân tích nhất quán trong cùng một lần tải dashboard.

## Cấu trúc mã nguồn

```text
.
├── web/                    # Giao diện Next.js cho customer, employee, admin
├── backend/                # NestJS API, OTP, phân quyền, publisher, email worker
├── sql/                    # Schema, functions, views, triggers và Trino SQL
├── streaming/              # Kafka consumer ghi dữ liệu Bronze
├── data_engineering/
│   ├── ingestion/batch/    # PostgreSQL snapshot → Bronze
│   ├── bronze/             # Kiểm tra dữ liệu raw
│   ├── silver/             # Chuẩn hóa, validate, deduplicate
│   ├── quality/            # DQ và Quarantine
│   ├── gold/               # Build dimensions, facts và release
│   ├── common/             # Config, contracts, Spark, pipeline state
│   └── jobs/               # Điểm chạy các stage
├── airflow/dags/           # DAG điều phối Batch
├── ml/                     # Inference và quản lý artifact
├── models/                 # Model joblib và metadata
├── notebooks/              # Chuẩn bị dữ liệu, huấn luyện và đánh giá
├── config/                 # Source mapping và quy tắc Data Quality
├── scripts/                # Bootstrap, kiểm tra và công cụ vận hành
├── tests/                  # Python, SQL và integration tests
├── docker/                 # Dockerfiles và cấu hình dịch vụ
├── docs/                   # Tài liệu hướng dẫn chi tiết
├── docker-compose.yaml     # Khai báo các dịch vụ
└── .env.example            # Mẫu cấu hình local
```

Các file `sql/z_*.sql` là phần thực thi nghiệp vụ. NestJS gọi function `banking_api.*` đã cài trong PostgreSQL, ví dụ `create_transfer`, `resolve_review` và `pay_loan`. Backend quản lý transaction và context của request; PostgreSQL thực hiện các thao tác tài chính bên trong transaction đó.

## Cài đặt và chạy

### 1. Chuẩn bị

- Git.
- Docker Engine hoặc Docker Desktop, kèm Docker Compose V2.
- Node.js 22 và npm để chạy giao diện trên máy.
- Khuyến nghị ít nhất **8 GB RAM trống** cho toàn bộ stack.
- Python 3.11 cho các script chạy trên máy và kiểm thử Python.

Với Windows/WSL, bật WSL integration trong Docker Desktop trước khi chạy lệnh Docker.

```bash
git clone https://github.com/dien-2006/banking-transaction-fraud-detection.git
cd banking-transaction-fraud-detection
```

### 2. Cấu hình môi trường

Tạo `.env` nếu máy chưa có file cấu hình:

```bash
test -f .env || cp .env.example .env
```

Điền các nhóm thông tin phù hợp với môi trường:

| Nhóm | Biến tiêu biểu |
|---|---|
| PostgreSQL | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` |
| API và phiên đăng nhập | `JWT_SECRET`, `CORS_ORIGINS`, `BANKING_API_PORT` |
| OTP và email | `REDIS_URL`, `OTP_HASH_SECRET`, `BREVO_API_KEY`, `OTP_SENDER_EMAIL` |
| MinIO | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, các biến `MINIO_BUCKET_*` |
| Airflow | `AIRFLOW_DB_PASSWORD`, `AIRFLOW_ADMIN_USERNAME`, `AIRFLOW_ADMIN_PASSWORD`, `AIRFLOW_ADMIN_EMAIL` |
| Kafka | `KAFKA_CLUSTER_ID`, `KAFKA_TRANSACTION_TOPIC` |
| Khoản vay | Nhận tiền và trả nợ qua tài khoản khách hàng; đối ứng ngân hàng tự xác định từ DB |

OTP sử dụng email khách hàng trong database và sender đã được xác minh trên Brevo. Các tài khoản PostgreSQL, MinIO và Airflow dùng giá trị do người triển khai cấu hình.

Chỉ dùng `.env` để cấu hình local; `.env.example` là bản mẫu không chứa secret thật. Chạy `python -m scripts.provision_runtime_roles --apply` sau khi PostgreSQL sẵn sàng và bạn đã tự nạp schema/function để tạo tài khoản runtime và lưu bốn cặp `BANKING_DB_*`, `OUTBOX_DB_*`, `NOTIFICATION_DB_*`, `ETL_DB_*` vào cùng `.env`. Docker Compose chọn từng biến cần thiết và truyền đúng tài khoản DB cho mỗi dịch vụ; không truyền toàn bộ `.env` hay credential quản trị vào API/worker. Sau khi sửa cấu hình, tạo lại các container liên quan bằng `docker compose up -d --no-deps --force-recreate <service>`.

### 3. Khởi động các dịch vụ

Trên môi trường mới, bật PostgreSQL trước:

```bash
docker compose up -d postgres-bank
```

PostgreSQL chỉ tạo database theo `POSTGRES_DB` và các đối tượng hệ thống mặc định.
Schema `banking`, `banking_api`, bảng, function và dữ liệu nghiệp vụ **không được tự tạo**.
Bạn tự chạy SQL bằng công cụ quản trị database trước khi bật API/worker/batch.
Các file của thư mục `sql/` vẫn có thể đọc trong container tại `/banking-sql`;
chỉ mount thư mục này không thực thi SQL.

Nếu muốn chủ động nạp toàn bộ schema và các file `z_*.sql` có sẵn trên database
trống, có thể chạy thủ công script sau. Không chạy trên database đã có bảng:

```bash
docker compose exec -T postgres-bank bash -s < docker/postgres-init.sh
```

Sau khi đã tạo đầy đủ schema/function và cấp tài khoản runtime theo bước 2:

```bash
docker compose up -d --build
docker compose ps -a
```

`demo-bootstrap` không chạy mặc định và API không phụ thuộc dịch vụ này. Chỉ khi
muốn nạp dữ liệu demo sau khi tạo schema, chạy `docker compose --profile demo run --rm demo-bootstrap`.
Compose vẫn khởi động các thành phần Batch và trigger `bootstrap_first_run` của DAG khi bật toàn bộ stack.

Database và volume đã tồn tại được giữ lại. Tài khoản đăng nhập web nằm trong `customer_online_account` hoặc `system_user`; sử dụng tài khoản đã được cấp trong database của môi trường triển khai.

Theo dõi quá trình khởi động:

```bash
docker compose logs -f banking-api airflow-scheduler
```

### 4. Chạy giao diện

Tạo `web/.env.local` với địa chỉ API:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Ở terminal riêng:

```bash
cd web
npm ci
npm run dev
```

Mở **http://localhost:3000**. Sau đăng nhập, hệ thống chuyển người dùng tới không gian làm việc tương ứng với vai trò.

### 5. Bật Realtime

```bash
docker compose --profile realtime up -d --build
```

Profile này khởi động cụm Kafka 3 broker, tạo topic, chạy outbox publisher, Bronze consumer và Kafka UI. Với cụm mới có thể tạo cluster ID bằng:

```bash
docker run --rm confluentinc/cp-kafka:7.9.0 kafka-storage random-uuid
```

Đặt ID vào `KAFKA_CLUSTER_ID` trước khi khởi tạo cụm. Với cụm đã có dữ liệu, giữ nguyên ID đang sử dụng.

### 6. Chạy Batch theo yêu cầu

Ngoài lịch hằng ngày, có thể tạo một lượt chạy mới:

```bash
docker compose exec airflow-webserver airflow dags trigger banking_bronze_silver_gold
```

Xem lịch sử và log:

```bash
docker compose exec airflow-webserver airflow dags list-runs -d banking_bronze_silver_gold
docker compose logs -f airflow-scheduler spark-master spark-worker
```

### 7. Dừng và chạy lại

```bash
docker compose --profile realtime stop
docker compose --profile realtime up -d
```

`stop` giữ lại dữ liệu và volume để tiếp tục sử dụng ở lần chạy sau.

## API và các dịch vụ

Các địa chỉ dưới đây dùng cổng mặc định trong Compose:

| Dịch vụ | Địa chỉ |
|---|---|
| Web | http://localhost:3000 |
| API Swagger | http://localhost:8000/docs |
| API health | http://localhost:8000/api/v1/health |
| Kafka UI | http://localhost:8080 |
| Airflow | http://localhost:8081 |
| Spark Master UI | http://localhost:8082 |
| Trino HTTP | http://localhost:8084 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |
| PostgreSQL | `localhost:5432` |

API nghiệp vụ có prefix **`/api/v1`**. Các nhóm endpoint chính:

| Nhóm | Ví dụ | Mục đích |
|---|---|---|
| Xác thực | `POST /auth/login` | Đăng nhập và nhận JWT |
| Đăng ký khách hàng | `POST /auth/registration/otp`, `POST /auth/registration` | Gửi OTP email, xác minh và tạo tài khoản đăng nhập mới |
| Khách hàng | `GET /me/accounts`, `GET /me/loans` | Tra cứu dữ liệu của người dùng |
| OTP | `POST /security/otp/request`, `POST /security/otp/verify` | Xác minh giao dịch |
| Chuyển tiền | `POST /transactions/transfers` | Chuyển khoản online |
| Tại quầy | `POST /transactions/counter-transfers` | Chuyển khoản do nhân viên thực hiện |
| Review | `POST /transactions/reviews/:id` | APPROVE hoặc REJECT giao dịch |
| Quản lý | `/management/*` | Thao tác trên các đối tượng nghiệp vụ |
| Dashboard | `/admin/*` | Tổng quan và tra cứu theo quyền |
| Analytics | `GET /analytics/snapshot` | Dữ liệu Gold cho dashboard phân tích |

Sau khi đăng nhập, gửi JWT trong header:

```http
Authorization: Bearer <access-token>
```

Luồng chuyển khoản online gồm ba request dùng cùng thông tin giao dịch: yêu cầu OTP → xác minh OTP → tạo transfer với `otpAuthorizationToken`. Swagger cung cấp mô tả API để tra cứu và thử request.

## Kiểm thử

### Python

Từ thư mục gốc, dùng môi trường Python 3.11:

```bash
python -m pip install -r requirements.txt
python -m pytest -q
```

Để chạy thêm worker inference thật, cài dependency đã pin:

```bash
python -m pip install -r docker/requirements-inference.txt
```

### Backend

```bash
cd backend
npm ci
npm run typecheck
npm run test:web
```

### Frontend

```bash
cd web
npm ci
npm run typecheck
npm run test:web
npm run build
```

### Integration và end-to-end

PostgreSQL integration tests dùng database thử riêng có tên bắt đầu bằng `d4_`, đã nạp schema và function. Sau khi cấu hình các biến kết nối tới database thử:

```bash
RUN_BANKING_INTEGRATION=1 python -m pytest -q tests/integration
```

Tests bao phủ risk boundary, idempotency, posting/rollback, review, snapshot và phân quyền runtime. Các bài kiểm tra cần Redis hoặc worker joblib được bật riêng bằng `RUN_REDIS_INTEGRATION=1` và `RUN_JOBLIB_INTEGRATION=1` trong môi trường test backend.

Luồng review chỉ nhận quyết định mới khi hồ sơ còn `OPEN/IN_REVIEW`, giao dịch còn `Pending`, quyết định rủi ro mới nhất là `REVIEW` và chưa có bút toán. Retry cùng người xử lý, hành động và lý do trả về kết quả cũ, kể cả khi phê duyệt dẫn tới `Failed` do thiếu số dư. Giao dịch đã hoàn tất hoặc dữ liệu lệch trạng thái bị trả về HTTP 409; lỗi `IMMUTABLE` cũng trả về 409 thay vì 500. Các bản ghi cũ cần đối soát riêng, không tự động đổi trạng thái.

Chạy riêng các test chống xử lý review lặp/đồng thời và rollback trên database thử đã nạp SQL mới:

```bash
RUN_BANKING_INTEGRATION=1 python -m pytest -q tests/integration/test_review_guards.py
```

Để kiểm chứng toàn tuyến API → PostgreSQL → Outbox → Kafka → Bronze → Batch → Trino, sử dụng [`scripts/e2e_test.py`](scripts/e2e_test.py). Script yêu cầu `E2E_ACCESS_TOKEN` của admin/nhân viên và `E2E_ALLOW_DEMO_TRANSFER=1`, vì bài kiểm tra tạo một giao dịch demo có commit thật.

## Nguyên tắc thiết kế

- **PostgreSQL là nguồn dữ liệu nghiệp vụ chuẩn.** ETL và ML sử dụng contract schema hiện có.
- **ALLOW khác SUCCESS.** Chỉ kết quả xử lý tài chính mới quyết định trạng thái thành công.
- **Debit/credit nguyên tử.** Posting, số dư, trạng thái và success outbox cùng nằm trong transaction.
- **Sự kiện đi qua Transactional Outbox.** Kafka nhận sự kiện sau commit.
- **Bronze giữ raw; Silver chuẩn hóa; Gold phục vụ phân tích.** Dữ liệu không hợp lệ đi vào Quarantine.
- **Retry và replay có định danh.** Request key, event key và batch/release giúp kiểm soát duplicate và truy vết.
- **Model artifact nằm ngoài PostgreSQL.** Database lưu danh tính phiên bản và kết quả đánh giá; API cache model để inference.

Các quy tắc đóng góp và invariant của hệ thống được mô tả trong [`AGENTS.md`](AGENTS.md).
