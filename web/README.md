# D4 Bank Web

## Chạy development

```bash
cd web
npm install
npm run dev
```

Mở `http://localhost:3000`. Dùng tài khoản demo bất kỳ, mật khẩu tối thiểu 6 ký tự và chọn vai trò cần xem.

## Kiểm tra production build

```bash
npm run typecheck
npm run build
npm start
```

## Trang chủ khách hàng

`/customer` có giao diện riêng theo mẫu Tổng quan: banner chào theo phiên đăng nhập,
tổng số dư, tài khoản, tiết kiệm, thẻ, lối tắt, giao dịch gần đây và hỗ trợ.
Các thao tác ẩn/hiện số dư, tùy chỉnh lối tắt (trong lần xem hiện tại), xem chi tiết
và tìm giao dịch minh họa hoạt động ở phía trình duyệt. Thanh tìm kiếm trên cùng
tìm các mục điều hướng. Hồ sơ cá nhân được mở từ menu tài khoản góc phải.

Dữ liệu nằm trong `src/features/customer/home-data.ts`, chỉ trả fixture cho ID
khách hàng demo `102498`; không sử dụng danh sách giao dịch toàn hệ thống của admin.
Đây không phải kiểm soát quyền backend hay dữ liệu tài chính thực. Các dịch vụ chưa
kết nối và ưu đãi đều có thông báo minh họa, không tạo giao dịch hoặc gửi yêu cầu.
Các trang đích Thẻ/Khoản vay vẫn là giao diện có sẵn; trang Tài khoản được thiết kế
riêng như mô tả bên dưới.

CSS được giới hạn trong lớp `customer-shell`/`customer-home`; trang admin và nhân viên
giữ nguyên. Trang chủ trên desktop (rộng từ 1100px) cố định trong chiều cao màn hình:
sidebar/header dùng chung kích thước với admin (160px/40px). Banner dùng tỷ lệ
1269:191 của khung banner trang quản lý admin và cùng khoảng cách dưới header;
banner không bị ảnh hưởng bởi zoom nội dung. Phần bên dưới tự đo và co vừa khung
khi thay đổi kích thước cửa sổ, không cắt nội dung hoặc cuộn cả trang. Chi tiết được
mở trong hộp thoại. Màn hình nhỏ hơn vẫn có thể cuộn để giữ chữ dễ đọc.
`public/customer-home-reference.png` là ảnh mẫu người dùng cung cấp;
chỉ các vùng minh họa được hiển thị bằng CSS, còn văn bản và điều khiển là HTML.

`/customer/accounts` có trang Tài khoản của tôi riêng theo ảnh mẫu, không dùng bảng
quản trị tài khoản toàn hệ thống. Trang gồm ba tài khoản của khách hàng demo, giao
dịch gần đây, ẩn/hiện số dư, chi tiết tài khoản/giao dịch và các tab phân tích.
Những nút nghiệp vụ chưa kết nối sẽ hiện cảnh báo minh họa và không tạo giao dịch.

Toàn bộ dashboard của admin, nhân viên và khách hàng được khóa trong chiều cao màn
hình desktop. Layout dùng chung ẩn phần tràn của trang; các trang nội dung lớn dùng
tỷ lệ thu nhỏ riêng để vẫn hiển thị trong một khung mà không tạo cuộn toàn trang.
