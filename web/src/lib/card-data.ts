import { loadAllPages } from "./paged-data";
import { formatDate } from "./presentation";
import { customerCardMask, customerCardType } from "./customer-cards";
import { recordStatus } from "./record-status";
import type { PageResult } from "@/services/bank.service";
export type CardStatus = "Đang hoạt động" | "Đã khóa" | "Đã đóng" | "Hết hạn";
export type BankCard = {
  id: string;
  number: string;
  holder: string;
  account: string;
  type: string;
  expiry: string;
  limit: string;
  status: CardStatus;
  statusCode: string;
  issuedAt: string;
  issueDate: string;
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
    type: customerCardType({ cardtype: String(row.cardtype ?? "—") }),
    expiry: date(row.expirydate, true),
    limit: Number(row.dailylimit ?? 0).toLocaleString("vi-VN"),
    status: recordStatus(String(row.status), "card").label as CardStatus,
    statusCode: String(row.status),
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
