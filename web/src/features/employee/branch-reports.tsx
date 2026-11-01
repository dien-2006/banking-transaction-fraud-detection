"use client";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useSessionUser } from "@/components/session-context";
import { apiRequest, toQuery } from "@/services/api.client";
import { dateKey, formatCurrency } from "@/lib/presentation";
import {
  CustomerEmpty,
  CustomerLoading,
  CustomerMetric,
  CustomerPanel,
} from "@/features/customer/customer-ui";

interface BranchReport {
  branch?: {
    branchid: number;
    branchcode: string;
    branchname: string;
    customercount: number;
    accountcount: number;
    employeecount: number;
  };
  transactionCount: number;
  successfulAmount: string | number;
  riskyTransactionCount: number;
  activeLoanCount: number;
  openReviewCount: number;
}
export function BranchReports() {
  const user = useSessionUser(),
    today = dateKey(new Date());
  const [draft, setDraft] = useState({
      from: `${today.slice(0, 7)}-01`,
      to: today,
    }),
    [range, setRange] = useState(draft),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["branch-reports", user.id, user.branchId, range],
    queryFn: () => {
      const next = new Date(`${range.to}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return apiRequest<BranchReport>(
        "/admin/branch-dashboard" +
          toQuery({
            from: `${range.from}T00:00:00`,
            to: `${next.toISOString().slice(0, 10)}T00:00:00`,
          }),
      );
    },
    enabled: !!user.branchId,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.from > draft.to) {
      setError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setError("");
    setRange({ ...draft });
  };
  return (
    <div className="branch-report-page flex min-h-0 flex-col gap-3">
      <header className="d4-banner rounded-xl border border-red-100 p-4">
        <h1 className="text-2xl font-bold">Báo cáo chi nhánh</h1>
        <p className="mt-1 text-xs text-slate-500">
          {query.data?.branch?.branchname ??
            `Chi nhánh #${user.branchId ?? "—"}`}{" "}
          · Dữ liệu nghiệp vụ trong phạm vi được cấp quyền.
        </p>
      </header>
      <form
        className="card flex flex-wrap items-end gap-3 p-3"
        onSubmit={submit}
      >
        {(["from", "to"] as const).map((key) => (
          <label className="text-xs" key={key}>
            {key === "from" ? "Từ ngày" : "Đến ngày"}
            <input
              type="date"
              required
              className="field mt-1"
              aria-label={key === "from" ? "Từ ngày" : "Đến ngày"}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <button className="btn-primary" type="submit">
          <CalendarDays size={15} />
          Áp dụng
        </button>
        <button
          type="button"
          className="btn-secondary"
          aria-label="Tải lại báo cáo"
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={15} />
        </button>
        {error && (
          <p className="w-full text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </form>
      {!user.branchId ? (
        <CustomerEmpty error>
          Chưa xác định được chi nhánh của bạn. Vui lòng đăng nhập lại.
        </CustomerEmpty>
      ) : query.isPending ? (
        <CustomerLoading />
      ) : query.isError ? (
        <CustomerEmpty error retry={() => void query.refetch()}>
          Không thể tải báo cáo chi nhánh.
        </CustomerEmpty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <CustomerMetric
              label="Giao dịch trong kỳ"
              value={query.data.transactionCount}
            />
            <CustomerMetric
              label="Giá trị giao dịch thành công (VND)"
              value={formatCurrency(query.data.successfulAmount)}
            />
            <CustomerMetric
              label="Giao dịch REVIEW / BLOCK"
              value={query.data.riskyTransactionCount}
            />
            <CustomerMetric
              label="Review đang chờ trong kỳ"
              value={query.data.openReviewCount}
            />
            <CustomerMetric
              label="Khoản vay đang hoạt động"
              value={query.data.activeLoanCount}
              caption="Tại thời điểm tải báo cáo"
            />
            <CustomerMetric
              label="Khách hàng tại chi nhánh"
              value={query.data.branch?.customercount ?? "—"}
              caption="Tại thời điểm tải báo cáo"
            />
          </div>
          <CustomerPanel title="Phạm vi báo cáo">
            <p className="p-4 text-sm leading-6 text-slate-500">
              Số lượng giao dịch và review tính trong khoảng ngày đã chọn, bao
              gồm ngày kết thúc. Số tài khoản, khách hàng và khoản vay là trạng
              thái hiện tại của chi nhánh. Dữ liệu được lấy từ PostgreSQL.
            </p>
          </CustomerPanel>
        </>
      )}
    </div>
  );
}
