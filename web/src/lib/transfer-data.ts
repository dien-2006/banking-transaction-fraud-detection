import { dateKey } from "./presentation";
import type {
  ApiTransaction,
  TransferDestination,
} from "@/services/bank.service";

export function validateTransferDestination(
  destination: TransferDestination | null,
  sourceId: number,
): TransferDestination {
  if (
    !destination ||
    !destination.accountName?.trim() ||
    !destination.accountNumber?.trim() ||
    !Number.isInteger(destination.accountId) ||
    destination.accountId <= 0
  )
    throw new Error("Không tìm thấy tài khoản nhận đang hoạt động.");
  if (destination.accountId === sourceId)
    throw new Error("Tài khoản nhận phải khác tài khoản nguồn.");
  if (destination.currency !== "VND")
    throw new Error("Chuyển tiền hiện chỉ hỗ trợ tài khoản VND.");
  return destination;
}

export function transferredToday(
  rows: ApiTransaction[],
  sourceId: number,
  now = new Date(),
) {
  const today = dateKey(now);
  return rows
    .filter(
      (row) =>
        row.sourceaccountid === sourceId &&
        row.typecode === "TRANSFER" &&
        row.currency === "VND" &&
        row.status === "Success" &&
        dateKey(row.transactiondate) === today,
    )
    .reduce((sum, row) => sum + Number(row.amount), 0);
}
