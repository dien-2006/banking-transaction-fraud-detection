"use client";
import { TransactionRecordResult } from "@/components/transaction-result";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui";
import { useListPagination } from "@/components/list-pagination";
import {
  customerDate,
  customerTransactionsCsv,
  transactionTypes,
  transactionView,
} from "@/lib/customer-data";
import {
  amountRanges,
  emptyHistoryFilters,
  filterCustomerHistory,
  historyDay,
  type HistoryFilters,
} from "@/lib/customer-history";
import type { ApiTransaction } from "@/services/bank.service";
import {
  useCustomerAccounts,
  useCustomerTransactions,
} from "./customer-queries";
import {
  CustomerEmpty,
  CustomerLoading,
  CustomerPager,
  CustomerPanel,
} from "./customer-ui";
import {
  HistoryFrequent,
  HistorySummary,
  HistoryTable,
} from "./customer-history-widgets";
import { ReferenceArtwork } from "./reference-artwork";
import "./customer-transactions.css";

export function CustomerTransactions() {
  const query = useCustomerTransactions(),
    accountsQuery = useCustomerAccounts();
  const accounts = accountsQuery.data ?? [];
  const [draft, setDraft] = useState<HistoryFilters>({
    ...emptyHistoryFilters,
  });
  const [filters, setFilters] = useState<HistoryFilters>({
    ...emptyHistoryFilters,
  });
  const [dateDialog, setDateDialog] = useState(false),
    [dateError, setDateError] = useState("");
  const [month, setMonth] = useState("");
  const [selected, setSelected] = useState<ApiTransaction | null>(null);
  const filtered = useMemo(
    () => filterCustomerHistory(query.data ?? [], filters),
    [query.data, filters],
  );
  const months = useMemo(
    () =>
      [
        ...new Set(
          (query.data ?? []).map((row) =>
            historyDay(row.transactiondate).slice(0, 7),
          ),
        ),
      ]
        .sort()
        .reverse(),
    [query.data],
  );
  const list = useListPagination(filtered, { fitViewportOnly: true });
  const ready = query.isSuccess && accountsQuery.isSuccess;
  const set = (key: keyof HistoryFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const invalidDates = !!draft.from && !!draft.to && draft.from > draft.to;
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidDates) {
      setDateError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setDateError("");
    setFilters({ ...draft });
    setMonth("");
    list.setPage(1);
  };
  const reset = () => {
    setDraft({ ...emptyHistoryFilters });
    setFilters({ ...emptyHistoryFilters });
    setDateError("");
    setMonth("");
    list.setPage(1);
  };
  const dateLabel =
    draft.from || draft.to
      ? `${draft.from ? customerDate(draft.from) : "Bắt đầu"} – ${draft.to ? customerDate(draft.to) : "Hiện tại"}`
      : "Tất cả thời gian";
  const preset = (days: number | null) => {
    if (days === null) {
      setDraft((current) => ({ ...current, from: "", to: "" }));
      return;
    }
    const to = historyDay(new Date().toISOString()),
      from = new Date(`${to}T12:00:00+07:00`);
    from.setUTCDate(from.getUTCDate() - days + 1);
    setDraft((current) => ({
      ...current,
      from: historyDay(from.toISOString()),
      to,
    }));
    setDateError("");
  };
  const exportCsv = () => {
    if (!ready || !filtered.length) return;
    const url = URL.createObjectURL(
      new Blob([customerTransactionsCsv(filtered, accounts)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "lich-su-giao-dich.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="customer-screen customer-history-screen history-reference-screen">
      <header className="customer-page-hero history-hero">
        <ReferenceArtwork region="transferHero" className="history-hero-art" />
        <div className="history-hero-copy">
          <nav aria-label="Đường dẫn">
            <Link href="/customer">Trang chủ</Link>
            <ChevronRight size={13} />
            <span>Lịch sử giao dịch</span>
          </nav>
          <h1>
            Lịch sử <span>giao dịch</span>
          </h1>
          <p>
            Tra cứu toàn bộ giao dịch của bạn một cách nhanh chóng và dễ dàng.
          </p>
        </div>
        <p className="history-hero-slogan" aria-hidden="true">
          Mỗi giao dịch
          <br />
          là một bước tiến
          <br />
          cùng bạn!
        </p>
      </header>
      <CustomerPanel
        title="Bộ lọc giao dịch"
        className="history-filter-panel"
        action={
          <button
            type="button"
            className="customer-text-button"
            onClick={reset}
          >
            Đặt lại
          </button>
        }
      >
        <form onSubmit={apply}>
          <div className="history-filter-primary">
            <label>
              Thời gian
              <button
                type="button"
                className="history-date-picker"
                aria-label="Chọn thời gian"
                onClick={() => setDateDialog(true)}
                title={dateLabel}
              >
                <CalendarDays size={17} />
                <span>{dateLabel}</span>
                <ChevronDown size={15} />
              </button>
            </label>
            <label>
              Loại giao dịch
              <select
                aria-label="Loại giao dịch"
                value={draft.type}
                onChange={(e) => set("type", e.target.value)}
              >
                <option value="">Tất cả giao dịch</option>
                {Object.entries(transactionTypes).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tài khoản
              <select
                aria-label="Tài khoản"
                value={draft.account}
                onChange={(e) => set("account", e.target.value)}
              >
                <option value="">Tất cả tài khoản</option>
                {accounts.map((row) => (
                  <option value={row.accountid} key={row.accountid}>
                    {row.accountnumber}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Số tiền (VND)
              <select
                aria-label="Khoảng số tiền"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
              >
                {amountRanges.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="customer-button history-search-button"
              disabled={!ready}
            >
              <Search size={16} />
              Tìm kiếm
            </button>
          </div>
          <div className="history-filter-secondary">
            <label className="history-query">
              <Search size={15} />
              <input
                type="search"
                aria-label="Tìm mã hoặc nội dung giao dịch"
                value={draft.search}
                onChange={(e) => set("search", e.target.value)}
                placeholder="Tìm mã hoặc nội dung giao dịch…"
              />
            </label>
            <select
              aria-label="Trạng thái giao dịch"
              value={draft.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Success">Thành công</option>
              <option value="Pending">Đang xử lý</option>
              <option value="Failed">Thất bại</option>
              <option value="Cancelled">Đã hủy</option>
            </select>
            <span>Áp dụng bộ lọc bằng nút Tìm kiếm.</span>
          </div>
          {dateError && (
            <p className="history-filter-error" role="alert">
              {dateError}
            </p>
          )}
        </form>
      </CustomerPanel>
      {!ready ? (
        query.isError || accountsQuery.isError ? (
          <CustomerEmpty
            error
            retry={() => {
              void query.refetch();
              void accountsQuery.refetch();
            }}
          >
            Không thể tải lịch sử giao dịch.
          </CustomerEmpty>
        ) : (
          <CustomerLoading />
        )
      ) : (
        <div className="history-workspace">
          <CustomerPanel
            className="customer-list-panel history-list-panel"
            panelRef={list.panelRef}
            title="Danh sách giao dịch"
            action={
              <button
                type="button"
                className="history-export"
                disabled={!filtered.length}
                onClick={exportCsv}
              >
                <Download size={15} />
                Xuất file
              </button>
            }
          >
            {filtered.length ? (
              <HistoryTable
                rows={list.visibleItems}
                accounts={accounts}
                onView={setSelected}
              />
            ) : (
              <CustomerEmpty>Không có giao dịch phù hợp.</CustomerEmpty>
            )}
            <CustomerPager
              page={list.page}
              pageSize={list.pageSize}
              total={filtered.length}
              onPage={list.setPage}
            />
          </CustomerPanel>
          <aside className="history-aside">
            <HistorySummary
              rows={filtered}
              accounts={accounts}
              month={month}
              months={months}
              onMonth={setMonth}
            />
            <HistoryFrequent
              rows={filtered}
              onShowAll={reset}
              onChoose={(description, type) => {
                const next = { ...filters, search: description, type };
                setFilters(next);
                setDraft(next);
                setMonth("");
                list.setPage(1);
              }}
            />
          </aside>
        </div>
      )}
      <Modal
        open={dateDialog}
        onOpenChange={setDateDialog}
        title="Chọn thời gian giao dịch"
        description="Chọn khoảng ngày rồi bấm Tìm kiếm để áp dụng bộ lọc."
      >
        <div className="history-date-presets">
          <button type="button" onClick={() => preset(7)}>
            7 ngày gần đây
          </button>
          <button type="button" onClick={() => preset(30)}>
            30 ngày gần đây
          </button>
          <button type="button" onClick={() => preset(null)}>
            Tất cả thời gian
          </button>
        </div>
        <div className="history-date-fields">
          <label>
            Từ ngày
            <input
              type="date"
              aria-label="Từ ngày"
              value={draft.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </label>
          <label>
            Đến ngày
            <input
              type="date"
              aria-label="Đến ngày"
              value={draft.to}
              onChange={(e) => set("to", e.target.value)}
            />
          </label>
        </div>
        {invalidDates && (
          <p className="history-filter-error" role="alert">
            Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.
          </p>
        )}
        <div className="history-date-actions">
          <button
            type="button"
            className="customer-button"
            disabled={invalidDates}
            onClick={() => {
              setDateError("");
              setDateDialog(false);
            }}
          >
            Dùng khoảng ngày
          </button>
        </div>
      </Modal>
      <Modal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title="Chi tiết giao dịch"
        description="Thông tin thực tế của giao dịch trên tài khoản của bạn."
      >
        {selected && (
          <TransactionRecordResult
            transaction={selected}
            account={transactionView(selected, accounts).account}
            hidden={false}
          />
        )}
      </Modal>
    </div>
  );
}
