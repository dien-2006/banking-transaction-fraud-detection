"use client";

import {
  BadgePlus,
  Ban,
  CreditCard,
  Filter,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { StaffHero } from "@/components/staff-hero";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ListPagination,
  useListPagination,
} from "@/components/list-pagination";
import { RecordViewButton } from "@/components/record-view-button";
import { useSessionUser } from "@/components/session-context";
import { bankService } from "@/services/bank.service";
import { loadCards, type BankCard, type CardStatus } from "@/lib/card-data";
import { ResourceCreateDialog } from "@/features/live/resource-create-dialog";

const typeTone: Record<BankCard["type"], string> = {
  Debit: "bg-rose-50 text-red-500",
  Credit: "bg-blue-50 text-blue-600",
  Gold: "bg-amber-50 text-amber-600",
  Platinum: "bg-violet-100 text-violet-600",
};
const statusTone: Record<CardStatus, string> = {
  "Đang hoạt động": "bg-emerald-50 text-emerald-600",
  "Tạm khóa": "bg-amber-50 text-orange-500",
  "Đã đóng": "bg-rose-50 text-red-500",
  "Hết hạn": "bg-red-50 text-red-500",
};

function CardHero() {
  return (
    <StaffHero
      kind="cards"
      eyebrow="QUẢN LÝ THẺ"
      title="Danh sách"
      accent="thẻ"
      description="Quản lý phát hành, trạng thái và hạn mức giao dịch của thẻ."
    />
  );
}

export function CardsPage() {
  const user = useSessionUser();
  const { role } = user;
  const cardsQuery = useQuery({
    queryKey: ["admin-cards-old-ui", role, user.id, user.branchId],
    queryFn: () => loadCards(bankService.cards),
    staleTime: 60_000,
  });
  const bankCards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("Danh sách thẻ");
  const data = useMemo(
    () =>
      bankCards.filter(
        (card) =>
          (!query ||
            Object.values(card)
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (!type || card.type === type) &&
          (!status || card.status === status),
      ),
    [query, type, status, bankCards],
  );
  const pagination = useListPagination(data, { fitViewportOnly: true });
  useEffect(() => pagination.setPage(1), [query, type, status]);
  const countStatus = (value: string) =>
    bankCards.filter((card) => card.status === value).length;
  const now = new Date();
  const newCards = bankCards.filter((card) => {
    const issued = new Date(card.issueDate);
    return (
      issued.getFullYear() === now.getFullYear() &&
      issued.getMonth() === now.getMonth()
    );
  }).length;
  const kpis: Array<[typeof CreditCard, string, string]> = [
    [
      CreditCard,
      role === "employee" ? "Thẻ tại chi nhánh" : "Tổng số thẻ",
      String(bankCards.length),
    ],
    [BadgePlus, "Phát hành tháng này", String(newCards)],
    [ShieldCheck, "Thẻ đang hoạt động", String(countStatus("Đang hoạt động"))],
    [Ban, "Thẻ bị khóa", String(countStatus("Tạm khóa"))],
  ];
  const types = Array.from(new Set(bankCards.map((card) => card.type))).sort();
  const palette = ["#f5223e", "#ff8f9d", "#ffb42c", "#2764df"];
  const typeCounts = types.map((label) => ({
    label,
    count: bankCards.filter((card) => card.type === label).length,
  }));
  const composition =
    typeCounts.length > 4
      ? [
          ...typeCounts.slice(0, 3),
          {
            label: "Khác",
            count: typeCounts
              .slice(3)
              .reduce((sum, item) => sum + item.count, 0),
          },
        ]
      : typeCounts;
  const percent = (count: number) =>
    bankCards.length ? Math.round((count / bankCards.length) * 100) : 0;
  let boundary = 0;
  const gradient = composition
    .map((item, index) => {
      const start = boundary;
      boundary += (item.count / Math.max(bankCards.length, 1)) * 100;
      return `${palette[index]} ${start}% ${boundary}%`;
    })
    .join(", ");
  const latestCards = [...bankCards]
    .sort(
      (a, b) =>
        Date.parse(b.issueDate) - Date.parse(a.issueDate) ||
        Number(b.id) - Number(a.id),
    )
    .slice(0, 3);

  return (
    <div className="staff-data-page customers-page-content flex flex-col gap-2.5 text-navy">
      <CardHero />
      <section className="grid grid-cols-4 gap-3">
        {kpis.map(([Icon, label, value], index) => (
          <article className="card flex items-center gap-3 p-3" key={label}>
            <span className="grid size-11 place-items-center rounded-full bg-[#ffe9ec] text-coral">
              <Icon size={21} />
            </span>
            <div>
              <p className="text-xs">{label}</p>
              <b className="text-2xl">{cardsQuery.data ? value : "—"}</b>
              <small
                className={`block text-[9px] ${index === 3 ? "text-red-500" : "text-emerald-500"}`}
              >
                {cardsQuery.isError
                  ? "Không tải được dữ liệu"
                  : cardsQuery.isPending
                    ? "Đang tải…"
                    : "Theo dữ liệu được cấp quyền"}
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="d4-page-toolbar card flex h-12 justify-between px-3">
        <div className="flex h-full gap-4">
          {(role === "employee"
            ? ["Danh sách thẻ", "Quản lý phát hành thẻ", "Thống kê"]
            : [
                "Danh sách thẻ",
                "Quản lý phát hành thẻ",
                "Thống kê",
                "Lịch sử thay đổi",
              ]
          ).map((item) => (
            <button
              className={
                tab === item
                  ? "border-b-2 border-coral px-2 text-xs font-semibold text-coral"
                  : "px-2 text-xs"
              }
              onClick={() => setTab(item)}
              disabled={item !== "Danh sách thẻ"}
              title={
                item !== "Danh sách thẻ"
                  ? "Chức năng chưa được triển khai"
                  : undefined
              }
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <ResourceCreateDialog
          resource="cards"
          onCreated={() => {
            void cardsQuery.refetch();
          }}
        />
      </section>
      {tab !== "Danh sách thẻ" ? (
        <section className="card flex-1 p-5">
          <h2 className="text-lg font-black">{tab}</h2>
          <p className="mt-2 text-sm text-slate-500">
            Dữ liệu mô phỏng cho phân hệ quản lý thẻ D4 Bank.
          </p>
        </section>
      ) : (
        <section className="grid min-h-0 flex-1 grid-cols-[1.9fr_.7fr] gap-3">
          <article
            ref={pagination.panelRef}
            className="d4-list-panel card flex min-h-0 flex-col p-3"
          >
            <div className="grid grid-cols-[1.7fr_.65fr_.65fr_.3fr] gap-2">
              <label className="relative">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={15}
                />
                <input
                  aria-label="Tìm kiếm thẻ"
                  className="h-9 w-full rounded-lg border pl-9 text-[10px]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm số thẻ đã che, mã khách hàng, tài khoản..."
                />
              </label>
              <select
                aria-label="Loại thẻ"
                className="rounded-lg border px-2 text-[10px]"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">Tất cả loại thẻ</option>
                {types.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                aria-label="Trạng thái thẻ"
                className="rounded-lg border px-2 text-[10px]"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.keys(statusTone).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <button
                onClick={() => pagination.setPage(1)}
                className="rounded-lg border border-coral text-[10px] text-coral"
              >
                <Filter className="inline" size={13} /> Lọc
              </button>
            </div>
            <div className="staff-table-scroll mt-2 min-h-0 overflow-auto">
              <table className="w-full table-fixed text-left text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Số thẻ",
                      "Khách hàng",
                      "ID tài khoản",
                      "Loại thẻ",
                      "Hạn thẻ",
                      "Hạn mức/ngày (VNĐ)",
                      "Trạng thái",
                      "Ngày phát hành",
                      "Thao tác",
                    ].map((item) => (
                      <th className="p-2 font-medium" key={item}>
                        {item}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cardsQuery.isPending && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-3 text-center text-slate-500"
                      >
                        Đang tải thẻ…
                      </td>
                    </tr>
                  )}
                  {cardsQuery.isError && (
                    <tr>
                      <td colSpan={9} className="p-3 text-center text-red-600">
                        Không thể tải danh sách thẻ.{" "}
                        <button
                          onClick={() => {
                            void cardsQuery.refetch();
                          }}
                        >
                          Thử lại
                        </button>
                      </td>
                    </tr>
                  )}
                  {cardsQuery.isSuccess && !data.length && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-3 text-center text-slate-500"
                      >
                        Không có thẻ phù hợp.
                      </td>
                    </tr>
                  )}
                  {pagination.visibleItems.map((card, index) => (
                    <tr className="border-t" key={card.id}>
                      <td className="p-1.5 font-semibold">
                        <span className="mr-1 inline-grid size-7 place-items-center rounded-full bg-[#fff0f0] text-coral">
                          <UserRound size={14} />
                        </span>
                        {card.number}
                      </td>
                      <td className="p-1.5">{card.holder}</td>
                      <td className="p-1.5">{card.account}</td>
                      <td className="p-1.5">
                        <span
                          className={`inline-block rounded px-1 text-center ${typeTone[card.type] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {card.type}
                        </span>
                      </td>
                      <td className="p-1.5">{card.expiry}</td>
                      <td className="p-1.5">{card.limit}</td>
                      <td className="p-1.5">
                        <span
                          className={`inline-block rounded px-1 text-center ${statusTone[card.status] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {card.status}
                        </span>
                      </td>
                      <td className="p-1.5">{card.issuedAt}</td>
                      <td className="p-1.5 text-center">
                        <RecordViewButton
                          record={card}
                          title={`Chi tiết thẻ ${index + 1}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination {...pagination} noun="thẻ" />
          </article>
          <aside className="staff-secondary-panels grid min-h-0 grid-rows-[1.1fr_.95fr_1.15fr] gap-3">
            <article className="card p-3">
              <h2 className="text-base font-black">Cơ cấu thẻ theo loại</h2>
              <div className="flex items-center gap-4 pt-2">
                <div
                  className="grid size-28 shrink-0 place-items-center rounded-full"
                  style={{
                    background: bankCards.length
                      ? `conic-gradient(${gradient})`
                      : "#edf0f5",
                  }}
                >
                  <div className="grid size-16 place-items-center rounded-full bg-white text-center">
                    <b className="text-xl">
                      {cardsQuery.data
                        ? bankCards.length.toLocaleString("vi-VN")
                        : "—"}
                    </b>
                    <span className="text-[9px]">thẻ</span>
                  </div>
                </div>
                <div className="space-y-2 text-[10px]">
                  {composition.map((item, index) => (
                    <p
                      className="flex min-w-0 items-center gap-2"
                      key={item.label}
                    >
                      <i
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: palette[index] }}
                      />
                      <span className="min-w-0 truncate" title={item.label}>
                        {item.label}
                      </span>
                      <b className="whitespace-nowrap">
                        {percent(item.count)}% ({item.count})
                      </b>
                    </p>
                  ))}
                </div>
              </div>
            </article>
            <article className="card p-3">
              <h2 className="text-base font-black">Thẻ theo trạng thái</h2>
              <div className="mt-3 space-y-2 text-[10px]">
                {Object.keys(statusTone).map((label, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_minmax(30px,1fr)_auto] items-center gap-2"
                    key={String(label)}
                  >
                    <span>{label}</span>
                    <span className="h-3 overflow-hidden rounded bg-slate-100">
                      <i
                        className={`block h-full rounded ${["bg-emerald-500", "bg-amber-400", "bg-rose-300", "bg-red-500"][index]}`}
                        style={{ width: `${percent(countStatus(label))}%` }}
                      />
                    </span>
                    <span>
                      {percent(countStatus(label))}% ({countStatus(label)})
                    </span>
                  </div>
                ))}
              </div>
            </article>
            <article className="card flex min-h-0 flex-col p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-black">Thẻ mới phát hành</h2>
                <button
                  onClick={() => {
                    setQuery("");
                    setType("");
                    setStatus("");
                    pagination.setPage(1);
                  }}
                  className="shrink-0 whitespace-nowrap text-[10px] text-coral"
                >
                  Xem tất cả →
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {latestCards.map((card) => (
                  <div
                    className="flex items-center gap-2 text-[10px]"
                    key={card.id}
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-[#fff0f0] text-coral">
                      <UserRound size={15} />
                    </span>
                    <p className="min-w-0 flex-1">
                      <b className="block truncate">{card.holder}</b>
                      <span className="text-slate-500">
                        {card.type} - **** {card.number.slice(-4)}
                      </span>
                    </p>
                    <time className="text-slate-500">{card.issuedAt}</time>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>
      )}
    </div>
  );
}
