"use client";
import { CheckCircle2 } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/presentation";

export function CreationResult({ resource, record, onClose, onAnother }: {
  resource: string;
  record: Record<string, unknown>;
  onClose: () => void;
  onAnother: () => void;
}) {
  const config: Record<string, { title: string; fields: [string, string][] }> = {
    branches: { title: "Đã tạo chi nhánh", fields: [["Mã chi nhánh", "branchcode"], ["Tên chi nhánh", "branchname"], ["Tỉnh / Thành phố", "city"], ["Địa chỉ", "address"], ["Ngày bắt đầu hoạt động", "opendate"]] },
    employees: { title: "Đã tạo hồ sơ nhân viên", fields: [["Mã nhân viên", "employeecode"], ["Họ tên", "fullname"], ["Chi nhánh", "branchname"], ["Vai trò", "rolename"], ["Ngày vào làm", "hiredate"], ["Lương (VND)", "salary"]] },
    customers: { title: "Đã tạo hồ sơ khách hàng", fields: [["Mã khách hàng", "customercode"], ["ID khách hàng", "customerid"], ["Họ tên", "fullname"]] },
    accounts: { title: "Đã mở tài khoản", fields: [["Số tài khoản", "accountnumber"], ["Đơn vị tiền", "currency"]] },
    cards: { title: "Đã phát hành thẻ", fields: [["Số thẻ (đã che)", "maskedcardnumber"], ["Loại thẻ", "cardtype"], ["Ngày hết hạn", "expirydate"]] },
    loans: { title: "Đã tạo hồ sơ vay", fields: [["Mã khoản vay", "loancode"], ["Số tiền vay (VND)", "principalamount"], ["Kỳ hạn (tháng)", "termmonths"]] },
  };
  const view = config[resource];
  return <section className="creation-result" aria-label="Kết quả tạo hồ sơ">
    <CheckCircle2 size={38} aria-hidden="true" />
    <h2 role="status">{view.title}</h2>
    {resource === "loans" && <p>Hồ sơ đang chờ phê duyệt. Việc tạo hồ sơ chưa giải ngân tiền.</p>}
    <dl>{view.fields.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{["principalamount", "salary"].includes(key) && record[key] != null ? formatCurrency(String(record[key]),"VND") : ["expirydate", "opendate", "hiredate"].includes(key) && record[key] ? formatDate(String(record[key])) : String(record[key] ?? "Chưa cập nhật")}</dd></div>)}</dl>
    {resource === "employees" && <p>Đã tạo hồ sơ nhân viên. Tài khoản đăng nhập và mật khẩu chưa được tạo; quản trị viên cần cấp đăng nhập riêng.</p>}
    {resource === "customers" && <p className="text-sm leading-6 text-slate-500">Cung cấp mã khách hàng này cho chính chủ. Khách hàng chọn “Kích hoạt ngân hàng trực tuyến” tại trang đăng nhập để nhận OTP qua email đã lưu và tự đặt mật khẩu. Nếu hồ sơ chưa có email, cần bổ sung trước khi kích hoạt.</p>}
    <footer><button type="button" className="btn-secondary" onClick={onAnother}>Tạo tiếp</button><button type="button" className="btn-primary" onClick={onClose}>Đóng</button></footer>
  </section>;
}
