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
    <dl>{view.fields.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{key === "principalamount" && record[key] != null ? formatCurrency(String(record[key]),"VND") : key === "expirydate" && record[key] ? formatDate(String(record[key])) : String(record[key] ?? "Chưa cập nhật")}</dd></div>)}</dl>
    <footer><button type="button" className="btn-secondary" onClick={onAnother}>Tạo tiếp</button><button type="button" className="btn-primary" onClick={onClose}>Đóng</button></footer>
  </section>;
}
