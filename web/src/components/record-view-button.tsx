"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";

const fieldNames: Record<string, string> = {
  code: "Mã",
  id: "Mã",
  name: "Tên",
  holder: "Chủ thẻ",
  customer: "Khách hàng",
  branch: "Chi nhánh",
  position: "Chức vụ",
  email: "Email",
  phone: "Điện thoại",
  number: "Số thẻ",
  identity: "CMND/CCCD",
  type: "Loại",
  expiry: "Hạn thẻ",
  limit: "Hạn mức",
  status: "Trạng thái",
  issuedAt: "Ngày phát hành",
  time: "Thời gian",
  account: "Tài khoản",
  detail: "Chi tiết",
  risk: "Mức độ rủi ro",
  assignee: "Người xử lý",
  user: "Người dùng",
  ip: "IP Address",
  target: "Đối tượng",
  level: "Mức độ",
  avatar: "Ảnh đại diện",
};

export function RecordViewButton({
  record,
  title = "Chi tiết bản ghi",
  labels,
}: {
  record: object | readonly unknown[];
  title?: string;
  labels?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const entries: Array<[string, unknown]> = Array.isArray(record)
    ? record.map((value, index) => [labels?.[index] ?? `Thông tin ${index + 1}`, value])
    : Object.entries(record).map(([key, value]) => [fieldNames[key] ?? key, value]);

  return (
    <>
      <button className="d4-view-button" onClick={() => setOpen(true)}>
        Xem
      </button>
      <Modal open={open} onOpenChange={setOpen} title={title}>
        <div className="divide-y rounded-xl bg-slate-50 px-4">
          {entries
            .filter(([key]) => key !== "Ảnh đại diện")
            .map(([key, value]) => (
              <div className="flex items-center justify-between gap-6 py-3 text-sm" key={key}>
                <span className="text-slate-500">{key}</span>
                <b className="max-w-[65%] break-words text-right text-navy">{String(value ?? "—")}</b>
              </div>
            ))}
        </div>
      </Modal>
    </>
  );
}
