"use client";
import { ChevronRight, CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import {
  customerCardKind,
  customerCardMask,
  customerCardType,
} from "@/lib/customer-cards";
import {
  historyAccountLabel,
  historyDate,
  historyTime,
} from "@/lib/customer-history";
import { transactionView } from "@/lib/customer-data";
import type {
  ApiAccount,
  ApiCard,
  ApiTransaction,
} from "@/services/bank.service";
import { CustomerStatus } from "./customer-ui";

export function useCardGallery(total: number) {
  const [grid, setGrid] = useState<HTMLDivElement | null>(null),
    [pageSize, setPageSize] = useState(3),
    [page, setPage] = useState(1);
  useEffect(() => {
    if (!grid) return;
    const measure = () =>
      setPageSize(
        Math.max(
          1,
          getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean)
            .length,
        ),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    measure();
    return () => observer.disconnect();
  }, [grid]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  return { gridRef: setGrid, pageSize, page: currentPage, setPage };
}

export function CustomerCardFace({
  card,
  holder,
}: {
  card: ApiCard;
  holder: string;
}) {
  const scheme = /mastercard/i.test(card.cardtype)
    ? "Mastercard"
    : /visa/i.test(card.cardtype)
      ? "VISA"
      : /napas/i.test(card.cardtype)
        ? "napas"
        : "";
  const expiry = card.expirydate.match(/^(\d{4})-(\d{2})/);
  return (
    <div
      className={`cards-face ${customerCardKind(card)}${scheme === "napas" ? " domestic" : ""}`}
    >
      <div className="cards-face-brand">
        <i>
          <span />
          <span />
          <span />
        </i>
        <b>D4 Bank</b>
        <CreditCard size={21} />
      </div>
      <span className="cards-face-type" title={customerCardType(card)}>
        {customerCardType(card)}
      </span>
      <strong className="cards-face-number">{customerCardMask(card)}</strong>
      <div className="cards-face-bottom">
        <span title={holder}>{holder || "Chưa cập nhật tên"}</span>
        {scheme ? (
          <b>{scheme}</b>
        ) : (
          <small>{expiry ? `${expiry[2]}/${expiry[1].slice(-2)}` : "—"}</small>
        )}
      </div>
    </div>
  );
}

export function CustomerCardTile({
  card,
  holder,
  onView,
}: {
  card: ApiCard;
  holder: string;
  onView: () => void;
}) {
  return (
    <button
      type="button"
      className="cards-tile"
      onClick={onView}
      aria-label={`Xem thẻ ${customerCardMask(card)}`}
    >
      <CustomerCardFace card={card} holder={holder} />
      <div className="cards-tile-caption">
        <span>
          <b title={customerCardType(card)}>{customerCardType(card)}</b>
          <CustomerStatus status={card.status} />
        </span>
        <ChevronRight size={20} />
      </div>
    </button>
  );
}

export function CustomerCardTransactions({
  rows,
  accounts,
  onView,
}: {
  rows: ApiTransaction[];
  accounts: ApiAccount[];
  onView: (row: ApiTransaction) => void;
}) {
  return (
    <div
      className="customer-data-scroll cards-transactions-scroll"
      role="region"
      aria-label="Giao dịch tài khoản liên kết"
      tabIndex={0}
    >
      <table className="customer-data-table cards-transactions-table">
        <colgroup>
          {Array.from({ length: 6 }, (_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {[
              "Thời gian",
              "Tài khoản",
              "Nội dung giao dịch",
              "Số tiền",
              "Trạng thái",
              "Thao tác",
            ].map((label) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const view = transactionView(row, accounts);
            return (
              <tr key={row.transactionid}>
                <td>
                  <time dateTime={row.transactiondate}>
                    {historyDate(row.transactiondate)}
                    <small>{historyTime(row.transactiondate)}</small>
                  </time>
                </td>
                <td title={view.account}>
                  {historyAccountLabel(row, accounts)}
                </td>
                <td title={view.description}>
                  {view.description}
                  <small>{view.type}</small>
                </td>
                <td
                  className={`customer-amount ${row.status === "Success" ? view.direction : "unknown"}`}
                >
                  {view.amountText}
                </td>
                <td>
                  <CustomerStatus status={row.status} />
                </td>
                <td>
                  <button
                    type="button"
                    className="cards-transaction-view"
                    onClick={() => onView(row)}
                    aria-label={`Xem giao dịch ${row.transactioncode}`}
                  >
                    Xem
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
