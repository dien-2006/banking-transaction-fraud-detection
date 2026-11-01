import type {
  ApiAccount,
  ApiTransaction,
  PageResult,
} from "@/services/bank.service";

import { formatCurrency, formatDateTime, formatDate } from "./presentation";
import { loadAllPages } from "./paged-data";
export { formatCurrency };

export const customerStatuses: Record<string, string> = {
  Active: "Đang hoạt động",
  Frozen: "Tạm phong tỏa",
  Closed: "Đã đóng",
  Inactive: "Ngừng hoạt động",
  Blocked: "Đã khóa",
  Expired: "Hết hạn",
  Success: "Thành công",
  Pending: "Đang xử lý",
  Failed: "Thất bại",
  Cancelled: "Đã hủy",
  Paid: "Đã thanh toán",
  Partial: "Thanh toán một phần",
  Overdue: "Quá hạn",
};
export const transactionTypes: Record<string, string> = {
  TRANSFER: "Chuyển khoản",
  DEPOSIT: "Nạp tiền",
  WITHDRAWAL: "Rút tiền",
  LOAN_PAYMENT: "Trả khoản vay",
  OPENING_BALANCE: "Số dư mở tài khoản",
  REVERSAL: "Hoàn giao dịch",
};
export const formatVnd = (value: string | number) =>
  formatCurrency(value, "VND");
export const customerDate = (value?: string | null) => formatDate(value);
export function accountKind(account: Pick<ApiAccount, "accounttypename">) {
  return /saving|tiết kiệm/i.test(account.accounttypename)
    ? "Tiết kiệm"
    : /card|thẻ/i.test(account.accounttypename)
      ? "Thẻ"
      : "Thanh toán";
}
export function transactionView(
  transaction: ApiTransaction,
  accounts: ApiAccount[],
) {
  const source = accounts.find(
    (account) =>
      Number(account.accountid) === Number(transaction.sourceaccountid),
  );
  const destination = accounts.find(
    (account) =>
      Number(account.accountid) === Number(transaction.destinationaccountid),
  );
  const direction =
    source && destination
      ? "internal"
      : destination
        ? "in"
        : source
          ? "out"
          : "unknown";
  const sign =
    transaction.status !== "Success"
      ? ""
      : direction === "in"
        ? "+"
        : direction === "out"
          ? "−"
          : "";
  return {
    raw: transaction,
    direction,
    amount: Number(transaction.amount),
    amountText: sign + formatCurrency(transaction.amount, transaction.currency),
    account:
      source && destination
        ? `${source.accountnumber} → ${destination.accountnumber}`
        : ((source ?? destination)?.accountnumber ?? "—"),
    type:
      direction === "internal"
        ? "Chuyển giữa tài khoản"
        : (transactionTypes[transaction.typecode] ?? transaction.typename),
    time: formatDateTime(transaction.transactiondate),
    description: transaction.description || transaction.typename,
  };
}

/** Fetch only the signed-in customer's authorized history, including all API pages. */
export async function loadCustomerTransactions(
  load: (
    params: Record<string, string | number>,
  ) => Promise<PageResult<ApiTransaction>>,
) {
  const items = await loadAllPages(load, (item) => item.transactionid);
  return items.sort(
    (a, b) =>
      Date.parse(b.transactiondate) - Date.parse(a.transactiondate) ||
      Number(b.transactionid) - Number(a.transactionid),
  );
}

export function customerTransactionsCsv(
  transactions: ApiTransaction[],
  accounts: ApiAccount[],
) {
  const quote = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = transactions.map((item) => {
    const view = transactionView(item, accounts);
    return [
      formatDateTime(item.transactiondate),
      item.transactioncode,
      view.description,
      view.type,
      view.account,
      view.amountText,
      customerStatuses[item.status] ?? item.status,
    ];
  });
  return (
    "\ufeff" +
    [
      [
        "Thời gian",
        "Mã giao dịch",
        "Nội dung",
        "Loại",
        "Tài khoản",
        "Số tiền",
        "Trạng thái",
      ],
      ...rows,
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n")
  );
}
