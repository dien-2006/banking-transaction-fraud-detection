import { loadAllPages } from "./paged-data";
import { bankDate, dateKey, formatDateTime } from "./presentation";
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
  TRANSACTION_POSTING: "Bút toán giao dịch",
  RISK_ASSESSMENT: "Đánh giá rủi ro",
  FRAUD_LABEL_EVENT: "Nhãn gian lận",
  CUSTOMER_DEVICE: "Thiết bị khách hàng",
  ACCOUNT_HOLDER: "Chủ tài khoản",
  LOAN_PAYMENT: "Thanh toán khoản vay",
  REPAYMENT_SCHEDULE: "Lịch trả nợ",
  MODEL_VERSION: "Phiên bản mô hình",
  BUSINESS_AUTHORIZATION: "Xác nhận nghiệp vụ",
  LOAN_DISBURSEMENT: "Giải ngân khoản vay",
  CUSTOMER_PRODUCT: "Đăng ký sản phẩm",
  CUSTOMER_REGISTRATION: "Đăng ký khách hàng",
  CUSTOMER_ACTIVATION: "Kích hoạt ngân hàng trực tuyến",
  CARD_ACCESS: "Truy cập thông tin thẻ",
  NOTIFICATION_OUTBOX: "Thông báo",
  EVENT_OUTBOX: "Sự kiện nghiệp vụ",
};
const fieldLabels: Record<string,string> = {
  balance:'Số dư',updatedat:'Thời gian cập nhật',status:'Trạng thái',amount:'Số tiền',fee:'Phí',
  fullname:'Họ tên',email:'Email',phone:'Điện thoại',address:'Địa chỉ',branchid:'Chi nhánh',
  employeeid:'Nhân viên phụ trách',customerid:'Khách hàng',transactionid:'Giao dịch',
  reviewedat:'Thời gian duyệt',revieweruserid:'Người duyệt',reason:'Lý do',description:'Nội dung',
};

export function presentAuditLog(row: Record<string, unknown>) {
  const date = bankDate(String(row.createdat ?? ""));
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
    userKey: row.userid == null ? "__unrecorded" : String(row.userid),
    actorKnown: row.userid != null,
    actorCode: row.userid == null ? "—" : String(row.actor_code ?? "—"),
    user: row.userid == null ? "Chưa ghi nhận người thực hiện"
      : String(row.actor_name || `Người dùng #${row.userid}`),
    ip: String(row.ipaddress ?? "—"),
    action,
    type: auditActions[action] ?? action,
    entity,
    target: auditEntities[entity] ?? entity,
    entityId: String(row.entityid ?? "—"),
    changes: fields.length ? fields.map(field=>fieldLabels[field] ?? field).join(", ") : "—",
    changedFields: fields,
    timestamp: validDate ? date.getTime() : 0,
  };
}

export async function loadAuditLogs(
  loadPage: (params: {
    page: number;
    pageSize: number;
  }) => Promise<PageResult<Record<string, unknown>>>,
) {
  return (await loadAllPages(loadPage, (row) => String(row.auditid ?? ""))).map(presentAuditLog)
    .sort((a,b)=>b.timestamp-a.timestamp || b.id.localeCompare(a.id,'en',{numeric:true}));
}

/** Every counter/chart uses this exact filtered list, never the unfiltered cache. */
export function summarizeAuditLogs(logs: ReturnType<typeof presentAuditLog>[]) {
  const actions = new Map<string,{key:string;label:string;count:number}>();
  const entities = new Map<string,{key:string;label:string;count:number}>();
  const actors = new Map<string,{id:string;name:string;count:number}>();
  for(const log of logs) {
    const action=actions.get(log.action) ?? {key:log.action,label:log.type,count:0};action.count++;actions.set(log.action,action);
    const entity=entities.get(log.entity) ?? {key:log.entity,label:log.target,count:0};entity.count++;entities.set(log.entity,entity);
    if(log.actorKnown) {
      const actor=actors.get(log.userKey) ?? {id:log.userKey,name:log.user,count:0};actor.count++;actors.set(log.userKey,actor);
    }
  }
  return {total:logs.length,actors:actors.size,unattributed:logs.filter(log=>!log.actorKnown).length,
    updates:actions.get('UPDATE')?.count ?? 0,statusChanges:actions.get('STATUS_CHANGE')?.count ?? 0,
    actionCounts:[...actions.values()].sort((a,b)=>a.label.localeCompare(b.label,'vi')),
    entityCounts:[...entities.values()].sort((a,b)=>b.count-a.count || a.key.localeCompare(b.key)),
    topActors:[...actors.values()].sort((a,b)=>b.count-a.count || a.id.localeCompare(b.id)),
  };
}
