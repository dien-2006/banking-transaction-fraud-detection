"use client";
import { TransactionRecordResult } from "@/components/transaction-result";
import {
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  CreditCard,
  Globe,
  KeyRound,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui";
import { useListPagination } from "@/components/list-pagination";
import { useSessionUser } from "@/components/session-context";
import {
  bankService,
  type ApiCard,
  type ApiTransaction,
} from "@/services/bank.service";
import {
  customerDate,
  formatVnd,
  loadCustomerTransactions,
  transactionView,
} from "@/lib/customer-data";
import {
  cardKinds,
  customerCardKind,
  customerCardMask,
  customerCardType,
  filterCustomerCards,
  linkedCardTransactions,
  type CardKind,
} from "@/lib/customer-cards";
import { useCustomerAccounts } from "./customer-queries";
import {
  CustomerEmpty,
  CustomerLoading,
  CustomerPager,
  CustomerPanel,
  CustomerStatus,
} from "./customer-ui";
import {
  CustomerCardFace,
  CustomerCardTile,
  CustomerCardTransactions,
  useCardGallery,
} from "./customer-card-widgets";
import { ReferenceArtwork } from "./reference-artwork";
import "./customer-cards.css";

const services = {
  open: {
    title: "Mở thẻ mới",
    text: "Liên hệ chi nhánh quản lý tài khoản để được tư vấn loại thẻ, điều kiện phát hành và hồ sơ đăng ký. Web hiện chưa hỗ trợ gửi yêu cầu mở thẻ trực tiếp.",
  },
  lock: {
    title: "Khóa / Mở thẻ",
    text: "Khi cần khóa hoặc mở lại thẻ, hãy liên hệ chi nhánh quản lý tài khoản để được xác minh và hỗ trợ. Thao tác khóa/mở thẻ trực tiếp chưa được hỗ trợ trên web khách hàng.",
  },
  limit: {
    title: "Điều chỉnh hạn mức",
    text: "Bạn có thể xem hạn mức giao dịch trong ngày của từng thẻ ở khung Hạn mức sử dụng. Để điều chỉnh, vui lòng liên hệ chi nhánh quản lý tài khoản.",
  },
  online: {
    title: "Đăng ký thanh toán trực tuyến",
    text: "Liên hệ chi nhánh để kiểm tra khả năng thanh toán trực tuyến và điều kiện sử dụng của thẻ. Không cung cấp PIN hoặc OTP cho người khác.",
  },
  lost: {
    title: "Báo mất thẻ",
    text: "Khi bị mất thẻ hoặc nghi ngờ lộ thông tin, hãy liên hệ ngay chi nhánh quản lý tài khoản để yêu cầu khóa thẻ và được hướng dẫn xử lý. Kiểm tra lịch sử giao dịch để phát hiện giao dịch chưa rõ.",
  },
  offers: {
    title: "Ưu đãi dành cho chủ thẻ",
    text: "Liên hệ chi nhánh D4 Bank để cập nhật chương trình ưu đãi, đối tác áp dụng và điều kiện tham gia theo loại thẻ của bạn.",
  },
} as const;
type Service = keyof typeof services;

export function CustomerCards() {
  const user = useSessionUser();
  const query = useQuery({
    queryKey: ["customer", user.id, "cards"],
    queryFn: bankService.customerCards,
  });
  const accounts = useCustomerAccounts();
  const cards = query.data ?? [];
  const transactions = useQuery({
    queryKey: ["customer", user.id, "transactions"],
    queryFn: () => loadCustomerTransactions(bankService.listTransactions),
    enabled: query.isSuccess && cards.length > 0,
  });
  const [kind, setKind] = useState<CardKind>("all"),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ApiCard | null>(null),
    [selectedTransaction, setSelectedTransaction] =
      useState<ApiTransaction | null>(null);
  const [limitId, setLimitId] = useState<number | null>(null),
    [service, setService] = useState<Service | null>(null),
    [pinPicker, setPinPicker] = useState(false);
  const [pinCard, setPinCard] = useState<ApiCard | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const pinMutation = useMutation({
    mutationFn: (input: { id: number; oldPin: string; newPin: string }) =>
      bankService.changeCardPin(input.id, input.oldPin, input.newPin),
    onSuccess: () => {
      setPinCard(null);
      setMessage("Đổi PIN thành công.");
    },
  });
  const filtered = filterCustomerCards(cards, kind, status, search);
  const gallery = useCardGallery(filtered.length);
  const linked = useMemo(
    () => linkedCardTransactions(transactions.data ?? [], cards),
    [transactions.data, cards],
  );
  const recent = useListPagination(linked, { fitViewportOnly: true });
  const limitCard = cards.find((card) => card.cardid === limitId) ?? cards[0];
  const accountNumber = (id: number) =>
    accounts.data?.find((account) => account.accountid === id)?.accountnumber ??
    (accounts.isError
      ? "Không thể tải tài khoản liên kết"
      : "Chưa cập nhật tài khoản liên kết");
  const openPin = (card: ApiCard) => {
    if (card.status !== "Active") return;
    setError("");
    setMessage("");
    pinMutation.reset();
    setSelected(null);
    setPinPicker(false);
    setPinCard(card);
  };
  const changePin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pinCard || pinMutation.isPending) return;
    setError("");
    if (
      !cards.some(
        (card) => card.cardid === pinCard.cardid && card.status === "Active",
      )
    ) {
      setError("Thẻ không còn ở trạng thái hoạt động.");
      return;
    }
    const data = new FormData(event.currentTarget),
      oldPin = String(data.get("oldPin") ?? ""),
      newPin = String(data.get("newPin") ?? "");
    if (!/^\d{4,6}$/.test(oldPin) || !/^\d{4,6}$/.test(newPin))
      return setError("PIN phải gồm 4–6 chữ số.");
    if (newPin !== String(data.get("confirmPin") ?? ""))
      return setError("PIN xác nhận không khớp.");
    pinMutation.mutate({ id: pinCard.cardid, oldPin, newPin });
  };
  return (
    <div className="customer-screen customer-cards-screen">
      <header className="customer-page-hero cards-hero">
        <img
          className="cards-hero-art"
          src="/customer-cards-hero-art-v2.png"
          alt=""
          aria-hidden="true"
        />
        <div className="cards-hero-copy">
          <nav aria-label="Đường dẫn">
            <Link href="/customer">Trang chủ</Link>
            <ChevronRight size={13} />
            <span>Thẻ của tôi</span>
          </nav>
          <h1>
            Thẻ <span>của tôi</span>
          </h1>
          <p>Quản lý thẻ, theo dõi giao dịch và sử dụng thẻ an toàn.</p>
        </div>
        <p className="cards-hero-slogan" aria-hidden="true">
          Một chiếc thẻ
          <br />
          Vạn trải nghiệm
        </p>
      </header>
      {query.isPending ? (
        <CustomerLoading />
      ) : query.isError ? (
        <CustomerEmpty error retry={() => void query.refetch()}>
          Không thể tải danh sách thẻ.
        </CustomerEmpty>
      ) : (
        <>
          <div className="cards-toolbar">
            <nav className="cards-kind-tabs" aria-label="Loại thẻ">
              {cardKinds
                .filter(
                  ([value]) =>
                    value !== "other" ||
                    cards.some((card) => customerCardKind(card) === "other"),
                )
                .map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={kind === value}
                    onClick={() => {
                      setKind(value);
                      gallery.setPage(1);
                    }}
                  >
                    {label} (
                    {value === "all"
                      ? cards.length
                      : cards.filter((card) => customerCardKind(card) === value)
                          .length}
                    )
                  </button>
                ))}
            </nav>
            <button
              type="button"
              className="customer-button cards-open"
              onClick={() => setService("open")}
            >
              <Plus size={17} />
              Mở thẻ mới
            </button>
          </div>
          <div className="cards-workspace">
            <div className="cards-main">
              <section
                className="customer-box cards-gallery"
                aria-label="Danh sách thẻ"
              >
                <header>
                  <h2>Thẻ của bạn</h2>
                  <div className="cards-gallery-filters">
                    <label className="cards-search">
                      <Search size={14} />
                      <input
                        type="search"
                        aria-label="Tìm thẻ"
                        placeholder="Số cuối, loại thẻ…"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          gallery.setPage(1);
                        }}
                      />
                    </label>
                    <select
                      aria-label="Trạng thái thẻ"
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        gallery.setPage(1);
                      }}
                    >
                      {[
                        ["", "Tất cả trạng thái"],
                        ["Active", "Đang hoạt động"],
                        ["Blocked", "Đã khóa"],
                        ["Expired", "Hết hạn"],
                        ["Closed", "Đã đóng"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </header>
                <div className="cards-grid" ref={gallery.gridRef}>
                  {filtered
                    .slice(
                      (gallery.page - 1) * gallery.pageSize,
                      gallery.page * gallery.pageSize,
                    )
                    .map((card) => (
                      <CustomerCardTile
                        key={card.cardid}
                        card={card}
                        holder={user.name}
                        onView={() => {
                          setSelected(card);
                          setLimitId(card.cardid);
                        }}
                      />
                    ))}
                  {!filtered.length && (
                    <CustomerEmpty>
                      {cards.length
                        ? "Không tìm thấy thẻ phù hợp."
                        : "Bạn chưa có thẻ tại D4 Bank."}
                    </CustomerEmpty>
                  )}
                </div>
                <CustomerPager
                  page={gallery.page}
                  pageSize={gallery.pageSize}
                  total={filtered.length}
                  onPage={gallery.setPage}
                />
              </section>
              <CustomerPanel
                title="Giao dịch gần đây"
                className="customer-list-panel cards-recent"
                panelRef={recent.panelRef}
                action={
                  <Link className="cards-see-all" href="/customer/transactions">
                    Xem tất cả <ArrowRight size={14} />
                  </Link>
                }
              >
                <p className="cards-linked-note">
                  Trên tài khoản liên kết với thẻ; chưa phân tách theo từng thẻ.
                </p>
                {!cards.length ? (
                  <CustomerEmpty>
                    Chưa có tài khoản liên kết với thẻ để hiển thị.
                  </CustomerEmpty>
                ) : transactions.isError || accounts.isError ? (
                  <CustomerEmpty
                    error
                    retry={() => {
                      void transactions.refetch();
                      void accounts.refetch();
                    }}
                  >
                    Không thể tải giao dịch tài khoản liên kết.
                  </CustomerEmpty>
                ) : !transactions.isSuccess || !accounts.isSuccess ? (
                  <CustomerLoading />
                ) : linked.length ? (
                  <CustomerCardTransactions
                    rows={recent.visibleItems}
                    accounts={accounts.data}
                    onView={setSelectedTransaction}
                  />
                ) : (
                  <CustomerEmpty>
                    Chưa có giao dịch trên tài khoản liên kết với thẻ.
                  </CustomerEmpty>
                )}
                <CustomerPager
                  page={recent.page}
                  pageSize={recent.pageSize}
                  total={linked.length}
                  onPage={recent.setPage}
                />
              </CustomerPanel>
            </div>
            <aside className="cards-aside">
              <CustomerPanel title="Hạn mức sử dụng" className="cards-limit">
                {limitCard ? (
                  <>
                    <select
                      aria-label="Thẻ xem hạn mức"
                      value={limitCard.cardid}
                      onChange={(e) => setLimitId(Number(e.target.value))}
                    >
                      {cards.map((card) => (
                        <option key={card.cardid} value={card.cardid}>
                          {customerCardMask(card)} · {customerCardType(card)}
                        </option>
                      ))}
                    </select>
                    <div className="cards-limit-info">
                      <div className="cards-limit-ring" aria-hidden="true">
                        <CreditCard size={26} />
                        <small>Trong ngày</small>
                      </div>
                      <div>
                        <span>Hạn mức giao dịch/ngày</span>
                        <b>{formatVnd(limitCard.dailylimit)}</b>
                        <small>
                          <CustomerStatus status={limitCard.status} />
                        </small>
                      </div>
                    </div>
                    <p className="cards-aside-note">
                      Thông tin hạn mức tín dụng và số tiền đã sử dụng chưa được
                      cung cấp.
                    </p>
                    <button
                      type="button"
                      className="cards-limit-details"
                      onClick={() => setSelected(limitCard)}
                    >
                      Xem chi tiết <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <p className="cards-aside-note">
                    Bạn chưa có thẻ để xem hạn mức.
                  </p>
                )}
              </CustomerPanel>
              <CustomerPanel title="Chức năng nhanh" className="cards-actions">
                {message && (
                  <div className="cards-feedback" role="status">
                    {message}
                    <button
                      type="button"
                      aria-label="Đóng thông báo"
                      onClick={() => setMessage("")}
                    >
                      ×
                    </button>
                  </div>
                )}
                <div>
                  {(
                    [
                      ["lock", "Khóa / Mở thẻ", LockKeyhole],
                      ["pin", "Đổi PIN", KeyRound],
                      [
                        "limit",
                        "Điều chỉnh hạn mức",
                        ChartNoAxesColumnIncreasing,
                      ],
                      ["online", "Đăng ký thanh toán trực tuyến", Globe],
                      ["lost", "Báo mất thẻ", TriangleAlert],
                    ] as const
                  ).map(([value, label, Icon]) => {
                    return (
                      <button
                        type="button"
                        key={value}
                        onClick={() =>
                          value === "pin"
                            ? setPinPicker(true)
                            : setService(value)
                        }
                      >
                        <i>
                          <Icon size={21} />
                        </i>
                        <span>{label}</span>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                </div>
              </CustomerPanel>
              <section className="customer-box cards-offers">
                <ReferenceArtwork region="gift" className="cards-offers-art" />
                <div>
                  <h2>
                    Ưu đãi dành cho chủ thẻ
                    <br />
                    D4 Bank
                  </h2>
                  <p>
                    Cập nhật chương trình và điều kiện áp dụng cho thẻ của bạn.
                  </p>
                  <button type="button" onClick={() => setService("offers")}>
                    Tìm hiểu thêm <ArrowRight size={14} />
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
        title="Thông tin thẻ"
        description="Số thẻ được che để bảo vệ thông tin của bạn."
      >
        {selected && (
          <>
            <CustomerCardFace card={selected} holder={user.name} />
            <dl className="customer-record cards-detail-record">
              {[
                ["Số thẻ", customerCardMask(selected)],
                ["Loại thẻ", customerCardType(selected)],
                ["Tài khoản liên kết", accountNumber(selected.accountid)],
                ["Ngày phát hành", customerDate(selected.issuedate)],
                ["Ngày hết hạn", customerDate(selected.expirydate)],
                ["Hạn mức mỗi ngày", formatVnd(selected.dailylimit)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <div>
                <dt>Trạng thái</dt>
                <dd>
                  <CustomerStatus status={selected.status} />
                </dd>
              </div>
            </dl>
            {accounts.isError && (
              <button
                type="button"
                className="customer-text-button"
                onClick={() => void accounts.refetch()}
              >
                Tải lại tài khoản liên kết
              </button>
            )}
            {selected.status === "Active" && (
              <button
                type="button"
                className="customer-button cards-detail-pin"
                onClick={() => openPin(selected)}
              >
                <KeyRound size={16} />
                Đổi PIN thẻ này
              </button>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={pinPicker}
        onOpenChange={setPinPicker}
        title="Chọn thẻ đổi PIN"
        description="Chỉ đổi PIN cho thẻ đang hoạt động."
      >
        <div className="cards-pin-picker">
          {cards.length ? (
            cards.map((card) => (
              <button
                type="button"
                disabled={card.status !== "Active"}
                key={card.cardid}
                onClick={() => openPin(card)}
              >
                <CreditCard size={19} />
                <span>
                  <b>{customerCardMask(card)}</b>
                  <small>{customerCardType(card)}</small>
                </span>
                <CustomerStatus status={card.status} />
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <CustomerEmpty>Bạn chưa có thẻ để đổi PIN.</CustomerEmpty>
          )}
        </div>
      </Modal>
      <Modal
        open={!!pinCard}
        onOpenChange={(open) =>
          !open && !pinMutation.isPending && setPinCard(null)
        }
        title="Đổi PIN thẻ"
        description={`Thẻ ${pinCard ? customerCardMask(pinCard) : ""}. PIN gồm 4–6 chữ số.`}
      >
        <form className="cards-pin-form" onSubmit={changePin}>
          <fieldset disabled={pinMutation.isPending}>
            {[
              ["oldPin", "PIN hiện tại"],
              ["newPin", "PIN mới"],
              ["confirmPin", "Xác nhận PIN mới"],
            ].map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  autoComplete={name === "oldPin" ? "off" : "new-password"}
                  maxLength={6}
                  name={name}
                  required
                />
              </label>
            ))}
          </fieldset>
          {(error || pinMutation.isError) && (
            <p role="alert">{error || pinMutation.error?.message}</p>
          )}
          <button className="customer-button" disabled={pinMutation.isPending}>
            {pinMutation.isPending ? "Đang cập nhật…" : "Xác nhận đổi PIN"}
          </button>
        </form>
      </Modal>
      <Modal
        open={!!service}
        onOpenChange={(open) => !open && setService(null)}
        title={service ? services[service].title : "Dịch vụ thẻ"}
        description="Hỗ trợ sử dụng thẻ D4 Bank."
      >
        {service && (
          <div className="cards-service-guide">
            <ShieldCheck size={32} />
            <p>{services[service].text}</p>
            <Link href="/customer/accounts">
              Xem tài khoản và chi nhánh quản lý <ArrowRight size={16} />
            </Link>
            <Link href="/customer/profile">
              Hồ sơ và bảo mật <ArrowRight size={16} />
            </Link>
            {service === "lost" && (
              <Link href="/customer/transactions">
                Kiểm tra lịch sử giao dịch <ArrowRight size={16} />
              </Link>
            )}
          </div>
        )}
      </Modal>
      <Modal
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
        title="Chi tiết giao dịch"
        description="Giao dịch trên tài khoản liên kết với thẻ."
      >
        {selectedTransaction && (
          <TransactionRecordResult
            transaction={selectedTransaction}
            account={
              transactionView(selectedTransaction, accounts.data ?? []).account
            }
            hidden={false}
          />
        )}
      </Modal>
    </div>
  );
}
