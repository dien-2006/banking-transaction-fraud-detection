"use client";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui";
import { useSessionUser } from "@/components/session-context";
import { bankService, type ApiLoan } from "@/services/bank.service";
import { customerDate } from "@/lib/customer-data";
import {
  customerLoanOverview,
  customerLoanProducts,
  installmentRemaining,
  isRepayingLoan,
} from "@/lib/customer-loans";
import { useCustomerRecordCapacity } from "./customer-layout";
import {
  CustomerEmpty,
  CustomerLoading,
  CustomerMetric,
  CustomerPager,
  CustomerPanel,
} from "./customer-ui";
import { CustomerLoanArt } from "./customer-loan-art";
import {
  LoanRecord,
  LoanScheduleDetails,
  loanIcon,
  loanMoney,
} from "./customer-loan-widgets";
import "./customer-loans.css";

export function CustomerLoans() {
  const user = useSessionUser();
  const query = useQuery({
    queryKey: ["customer", user.id, "loans"],
    queryFn: bankService.customerLoans,
  });
  const [selected, setSelected] = useState<ApiLoan | null>(null);
  const [status, setStatus] = useState(""),
    [product, setProduct] = useState("");
  const [hidden, setHidden] = useState(false),
    [guide, setGuide] = useState(false),
    [allSchedule, setAllSchedule] = useState(false);
  const [page, setPage] = useState(1);
  const { pageSize, bodyRef } = useCustomerRecordCapacity(
    ".loans-record",
    3,
    true,
  );
  const loans = query.data ?? [];
  const schedules = useQueries({
    queries: loans.map((loan) => ({
      queryKey: ["customer", user.id, "loan-schedule", loan.loanid],
      queryFn: () => bankService.loanSchedule(loan.loanid),
      enabled: isRepayingLoan(loan) || selected?.loanid === loan.loanid,
    })),
  });
  const scheduleData = new Map(
    loans.flatMap((loan, i) =>
      schedules[i].isSuccess ? [[loan.loanid, schedules[i].data] as const] : [],
    ),
  );
  const summary = customerLoanOverview(loans, scheduleData);
  const scheduleError = loans.some(
    (loan, i) => isRepayingLoan(loan) && schedules[i].isError,
  );
  const retrySchedules = () =>
    loans.forEach((loan, i) => {
      if (isRepayingLoan(loan) && schedules[i].isError)
        void schedules[i].refetch();
    });
  const products = customerLoanProducts(loans);
  const filtered = loans.filter(
    (loan) =>
      (!status || loan.status === status) &&
      (!product || loan.loantypename === product),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / pageSize)),
  );
  const selectedQuery = selected
    ? schedules[loans.findIndex((loan) => loan.loanid === selected.loanid)]
    : undefined;
  const money = (value: string | number) => loanMoney(value, hidden);
  return (
    <div className="customer-screen customer-loans-screen">
      <header className="customer-page-hero loans-hero">
        <CustomerLoanArt />
        <div className="loans-hero-copy">
          <nav aria-label="Đường dẫn">
            <Link href="/customer">Trang chủ</Link>
            <ChevronRight size={13} />
            <span>Khoản vay của tôi</span>
          </nav>
          <h1>
            Khoản vay <span>của tôi</span>
          </h1>
          <p>
            Quản lý các khoản vay hiện tại, theo dõi lịch trả nợ và đăng ký
            khoản vay mới.
          </p>
        </div>
        <p className="loans-hero-slogan" aria-hidden="true">
          Đồng hành cùng bạn
          <br />
          hiện thực hóa
          <br />
          những ước mơ!
        </p>
      </header>
      {query.isPending ? (
        <CustomerLoading />
      ) : query.isError ? (
        <CustomerEmpty error retry={() => void query.refetch()}>
          Không thể tải khoản vay của bạn.
        </CustomerEmpty>
      ) : (
        <>
          <div className="customer-metrics loans-metrics">
            <CustomerMetric
              label="Tổng dư nợ theo lịch"
              value={
                <>
                  {money(summary.outstanding)}
                  <button
                    type="button"
                    className="loans-visibility"
                    aria-label={
                      hidden ? "Hiện số tiền khoản vay" : "Ẩn số tiền khoản vay"
                    }
                    onClick={() => setHidden(!hidden)}
                  >
                    {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </>
              }
              caption="Gốc, lãi và phí các kỳ chưa tất toán"
              icon={Wallet}
            />
            <CustomerMetric
              label="Khoản vay đang trả nợ"
              value={summary.active}
              caption={`Trên tổng ${summary.total} khoản vay · ${summary.pending} chờ duyệt`}
              icon={CalendarDays}
            />
            <CustomerMetric
              label="Thanh toán tháng này"
              value={
                summary.complete
                  ? summary.monthlyAmount === null
                    ? "Cần đối soát"
                    : money(summary.monthlyAmount)
                  : scheduleError
                    ? "Chưa tải được"
                    : "Đang tải…"
              }
              caption={
                summary.complete
                  ? summary.monthlyAmount === null
                    ? "Có kỳ thanh toán một phần; kiểm tra lịch trả nợ."
                    : summary.nextDate
                      ? `Đến hạn gần nhất: ${customerDate(summary.nextDate)}`
                      : "Không có kỳ đến hạn trong tháng này."
                  : scheduleError
                    ? "Mở lịch trả nợ để thử lại."
                    : "Đang tổng hợp các kỳ đến hạn."
              }
              icon={FileText}
            />
            <div className="loans-new">
              <button
                type="button"
                className="customer-button"
                onClick={() => setGuide(true)}
              >
                <Plus size={19} />
                Đăng ký khoản vay mới
              </button>
            </div>
          </div>
          <div className="loans-workspace">
            <CustomerPanel
              title="Danh sách khoản vay"
              className="customer-list-panel loans-list-panel"
              action={
                <select
                  aria-label="Trạng thái khoản vay"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  {[
                    ["", "Tất cả trạng thái"],
                    ["Active", "Đang trả nợ"],
                    ["Overdue", "Quá hạn"],
                    ["Pending", "Chờ phê duyệt"],
                    ["Paid", "Đã tất toán"],
                    ["Cancelled", "Đã hủy"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              }
            >
              {product && (
                <div className="loans-filter-tag">
                  <span>{product}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProduct("");
                      setPage(1);
                    }}
                  >
                    Bỏ lọc sản phẩm ×
                  </button>
                </div>
              )}
              <div
                className="customer-panel-body loans-list-body"
                ref={bodyRef}
              >
                {filtered.length ? (
                  <div className="loans-record-list">
                    {filtered
                      .slice(
                        (currentPage - 1) * pageSize,
                        currentPage * pageSize,
                      )
                      .map((loan) => (
                        <LoanRecord
                          key={loan.loanid}
                          loan={loan}
                          schedule={scheduleData.get(loan.loanid)}
                          error={
                            !!schedules[
                              loans.findIndex(
                                (row) => row.loanid === loan.loanid,
                              )
                            ]?.isError
                          }
                          hidden={hidden}
                          onView={() => setSelected(loan)}
                        />
                      ))}
                  </div>
                ) : (
                  <CustomerEmpty>
                    {loans.length
                      ? "Không có khoản vay phù hợp với bộ lọc."
                      : "Bạn chưa có khoản vay tại D4 Bank."}
                  </CustomerEmpty>
                )}
              </div>
              <CustomerPager
                page={currentPage}
                pageSize={pageSize}
                total={filtered.length}
                onPage={setPage}
              />
            </CustomerPanel>
            <aside className="loans-aside">
              <CustomerPanel
                title="Lịch trả nợ sắp tới"
                className="loans-upcoming"
                action={
                  <button
                    type="button"
                    className="loans-see-all"
                    onClick={() => setAllSchedule(true)}
                  >
                    Xem tất cả <ArrowRight size={14} />
                  </button>
                }
              >
                {!summary.complete ? (
                  scheduleError ? (
                    <CustomerEmpty error retry={retrySchedules}>
                      Chưa tải đủ lịch trả nợ.
                    </CustomerEmpty>
                  ) : (
                    <CustomerLoading />
                  )
                ) : summary.upcoming.length ? (
                  <div className="loans-timeline">
                    {summary.upcoming.slice(0, 4).map((row) => (
                      <button
                        type="button"
                        key={row.scheduleid}
                        onClick={() => setSelected(row.loan)}
                        aria-label={`Kỳ ${row.installmentno} ${row.loan.loancode}`}
                        data-overdue={row.status === "Overdue"}
                      >
                        <span className="loans-timeline-dot" />
                        <span>
                          <b>{customerDate(row.duedate)}</b>
                          <small>
                            {row.loan.loantypename}
                            {row.status === "Overdue" ? " · Quá hạn" : ""}
                          </small>
                        </span>
                        <strong>
                          {installmentRemaining(row) === null
                            ? "Cần đối soát"
                            : money(installmentRemaining(row)!)}
                        </strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="loans-aside-note">
                    Không có kỳ thanh toán chưa tất toán.
                  </p>
                )}
              </CustomerPanel>
              <CustomerPanel
                title="Sản phẩm vay của bạn"
                className="loans-products"
                action={
                  <button
                    type="button"
                    className="loans-see-all"
                    onClick={() => {
                      setProduct("");
                      setStatus("");
                      setPage(1);
                    }}
                  >
                    Xem tất cả <ArrowRight size={14} />
                  </button>
                }
              >
                {products.length ? (
                  <div className="loans-product-list">
                    {products.map((row) => {
                      const Icon = loanIcon(row.name);
                      return (
                        <button
                          type="button"
                          key={row.name}
                          onClick={() => {
                            setProduct(row.name);
                            setStatus("");
                            setPage(1);
                          }}
                        >
                          <i>
                            <Icon size={23} />
                          </i>
                          <span>
                            <b>{row.name}</b>
                            <small>
                              {row.count} khoản vay trong hồ sơ của bạn
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="loans-aside-note">
                    Liên hệ chi nhánh để được tư vấn khoản vay phù hợp.
                  </p>
                )}
              </CustomerPanel>
              <section className="customer-box loans-safety">
                <CustomerLoanArt security />
                <div>
                  <h2>
                    Khoản vay an toàn
                    <br />
                    Tài chính vững vàng
                  </h2>
                  <p>
                    <ShieldCheck size={14} />
                    Theo dõi kỳ hạn và dư nợ
                  </p>
                  <p>
                    <ShieldCheck size={14} />
                    Kiểm tra thông tin hợp đồng
                  </p>
                  <button type="button" onClick={() => setGuide(true)}>
                    Hỗ trợ khoản vay <ArrowRight size={14} />
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.loantypename ?? "Chi tiết khoản vay"}
        description={`Mã khoản vay: ${selected?.loancode ?? ""}`}
      >
        {selected && (
          <LoanScheduleDetails
            loan={selected}
            rows={selectedQuery?.data}
            pending={!!selectedQuery?.isPending}
            error={!!selectedQuery?.isError}
            hidden={hidden}
            retry={() => void selectedQuery?.refetch()}
          />
        )}
      </Modal>
      <Modal
        open={allSchedule}
        onOpenChange={setAllSchedule}
        title="Lịch trả nợ của tôi"
        description="Các kỳ chưa tất toán, sắp xếp theo ngày đến hạn; bao gồm kỳ quá hạn."
      >
        {!summary.complete ? (
          scheduleError ? (
            <CustomerEmpty error retry={retrySchedules}>
              Chưa tải đủ lịch trả nợ.
            </CustomerEmpty>
          ) : (
            <CustomerLoading />
          )
        ) : summary.upcoming.length ? (
          <div className="loans-all-schedule">
            {summary.upcoming.map((row) => (
              <button
                key={row.scheduleid}
                type="button"
                onClick={() => {
                  setAllSchedule(false);
                  setSelected(row.loan);
                }}
              >
                <span>
                  <b>
                    {row.loan.loancode} · Kỳ {row.installmentno}
                  </b>
                  <small>
                    {customerDate(row.duedate)} · {row.loan.loantypename}
                  </small>
                </span>
                <strong>
                  {installmentRemaining(row) === null
                    ? "Cần đối soát"
                    : money(installmentRemaining(row)!)}
                </strong>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <CustomerEmpty>Không có kỳ thanh toán chưa tất toán.</CustomerEmpty>
        )}
      </Modal>
      <Modal
        open={guide}
        onOpenChange={setGuide}
        title="Đăng ký và hỗ trợ khoản vay"
        description="Chi nhánh D4 Bank sẽ tư vấn sản phẩm và tiếp nhận hồ sơ của bạn."
      >
        <div className="loans-guide">
          <p>
            Để đăng ký khoản vay mới, vui lòng liên hệ chi nhánh quản lý tài
            khoản. Nhân viên sẽ tư vấn lãi suất, kỳ hạn, hồ sơ cần chuẩn bị và
            hướng dẫn đăng ký.
          </p>
          <p>
            Bạn có thể kiểm tra thông tin cá nhân và tài khoản trước khi liên
            hệ. Việc gửi hồ sơ vay trực tiếp trên web chưa được hỗ trợ.
          </p>
          <Link href="/customer/profile">
            Kiểm tra hồ sơ cá nhân <ArrowRight size={16} />
          </Link>
          <Link href="/customer/accounts">
            Xem tài khoản và chi nhánh quản lý <ArrowRight size={16} />
          </Link>
        </div>
      </Modal>
    </div>
  );
}
