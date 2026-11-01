import { loadAllPages } from "./paged-data";
import { formatDate } from "./presentation";
import { customerCardMask } from "./customer-cards";
import type { PageResult } from "@/services/bank.service";
export type CardStatus = "Đang hoạt động" | "Tạm khóa" | "Đã đóng" | "Hết hạn";
export type BankCard = {
  id: string;
  number: string;
  holder: string;
  account: string;
  type: string;
  expiry: string;
  limit: string;
  status: CardStatus;
  issuedAt: string;
  issueDate: string;
};

const statuses: Record<string, CardStatus> = {
  Active: "Đang hoạt động",
  Blocked: "Tạm khóa",
  Closed: "Đã đóng",
  Expired: "Hết hạn",
};

export function presentCard(row: Record<string, unknown>): BankCard {
  const date = (value: unknown, monthOnly = false) => {
    const formatted = formatDate(value, "—");
    return monthOnly && formatted !== "—" ? formatted.slice(3) : formatted;
  };
  return {
    id: String(row.cardid),
    number: customerCardMask({
      maskedcardnumber: String(row.maskedcardnumber ?? ""),
    }),
    holder: String(
      row.fullname ??
        row.customername ??
        `Khách hàng #${row.customerid ?? "—"}`,
    ),
    account: String(row.accountid ?? "—"),
    type: String(row.cardtype ?? "—"),
    expiry: date(row.expirydate, true),
    limit: Number(row.dailylimit ?? 0).toLocaleString("vi-VN"),
    status: statuses[String(row.status)] ?? (String(row.status) as CardStatus),
    issuedAt: date(row.issuedate),
    issueDate: String(row.issuedate ?? ""),
  };
}

export async function loadCards(
  loadPage: (params: {
    page: number;
    pageSize: number;
  }) => Promise<PageResult<Record<string, unknown>>>,
) {
  return (await loadAllPages(loadPage, (row) => String(row.cardid ?? ""))).map(
    presentCard,
  );
}
