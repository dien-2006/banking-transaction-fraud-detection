import { loadAllPages } from "./paged-data";
import { dateKey, formatDateTime } from "./presentation";
import type { PageResult } from "@/services/bank.service";
export const auditActions: Record<string, string> = {
  INSERT: "Tạo mới",
  UPDATE: "Cập nhật",
  DELETE: "Xóa",
  STATUS_CHANGE: "Đổi trạng thái",
};
export const auditEntities: Record<string, string> = {
  CUSTOMER: "Khách hàng",
  BANK_ACCOUNT: "Tài khoản",
  CARD: "Thẻ",
  LOAN: "Khoản vay",
  BANK_TRANSACTION: "Giao dịch",
  COUNTER_TRANSFER_REQUEST: "Lệnh chuyển khoản tại quầy",
  REVIEW_CASE: "Hồ sơ review",
  EMPLOYEE: "Nhân viên",
  BRANCH: "Chi nhánh",
  SYSTEM_USER: "Tài khoản đăng nhập",
};

export function presentAuditLog(row: Record<string, unknown>) {
  const date = new Date(String(row.createdat ?? ""));
  const validDate = Number.isFinite(date.getTime());
  const day = validDate ? dateKey(date) : "";
  const action = String(row.action ?? "—");
  const entity = String(row.entitytype ?? "—");
  const old =
    row.oldvalue && typeof row.oldvalue === "object"
      ? (row.oldvalue as Record<string, unknown>)
      : {};
  const next =
    row.newvalue && typeof row.newvalue === "object"
      ? (row.newvalue as Record<string, unknown>)
      : {};
  // Only retain names of changed fields, never snapshot values or credentials.
  const sensitive =
    /password|secret|token|pin|credential|nationalid|cardnumber/i;
  const fields = Array.from(
    new Set([...Object.keys(old), ...Object.keys(next)]),
  ).filter(
    (key) =>
      !sensitive.test(key) &&
      JSON.stringify(old[key]) !== JSON.stringify(next[key]),
  );
  return {
    id: String(row.auditid ?? "—"),
    time: validDate ? formatDateTime(date.toISOString(), "—") : "—",
    day,
    userKey: row.userid == null ? "__system" : String(row.userid),
    user: row.userid == null ? "Hệ thống" : `User #${row.userid}`,
    ip: String(row.ipaddress ?? "—"),
    action,
    type: auditActions[action] ?? action,
    entity,
    target: auditEntities[entity] ?? entity,
    entityId: String(row.entityid ?? "—"),
    changes: fields.length ? fields.join(", ") : "—",
  };
}

export async function loadAuditLogs(
  loadPage: (params: {
    page: number;
    pageSize: number;
  }) => Promise<PageResult<Record<string, unknown>>>,
) {
  return (await loadAllPages(loadPage, (row) => String(row.auditid ?? ""))).map(
    presentAuditLog,
  );
}
