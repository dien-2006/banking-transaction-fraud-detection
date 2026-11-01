import type { ApiCard, ApiTransaction } from "@/services/bank.service";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi");
export const cardKinds = [
  ["all", "Tất cả thẻ"],
  ["credit", "Thẻ tín dụng"],
  ["debit", "Thẻ ghi nợ"],
  ["virtual", "Thẻ ảo"],
  ["other", "Thẻ khác"],
] as const;
export type CardKind = (typeof cardKinds)[number][0];

export function customerCardKind(card: Pick<ApiCard, "cardtype">): CardKind {
  const type = normalize(card.cardtype);
  if (/\bvirtual\b|\bao\b/.test(type)) return "virtual";
  if (/\bcredit\b|tin dung/.test(type)) return "credit";
  if (/\bdebit\b|ghi no/.test(type)) return "debit";
  return "other";
}

/** Always reveal at most the last four digits, even if an upstream response is malformed. */
export function customerCardMask(card: Pick<ApiCard, "maskedcardnumber">) {
  const suffix = card.maskedcardnumber.trim().match(/(\d{1,4})$/)?.[1];
  return `•••• •••• •••• ${suffix ?? "••••"}`;
}

export function customerCardType(card: Pick<ApiCard, "cardtype">) {
  const kind = customerCardKind(card);
  return /^(credit|debit|virtual)$/i.test(card.cardtype.trim())
    ? cardKinds.find(([value]) => value === kind)![1]
    : card.cardtype;
}

export function filterCustomerCards(
  cards: ApiCard[],
  kind: CardKind,
  status: string,
  search: string,
) {
  const text = normalize(search.replace(/\s+/g, " ").trim());
  return cards.filter(
    (card) =>
      (kind === "all" || customerCardKind(card) === kind) &&
      (!status || card.status === status) &&
      normalize(
        `${customerCardMask(card)} ${card.cardtype} ${customerCardType(card)}`,
      ).includes(text),
  );
}

/** Account-level activity cannot be attributed to an individual card by the current API. */
export function linkedCardTransactions(
  rows: ApiTransaction[],
  cards: ApiCard[],
) {
  const accounts = new Set(cards.map((card) => Number(card.accountid)));
  return rows.filter(
    (row) =>
      accounts.has(Number(row.sourceaccountid)) ||
      accounts.has(Number(row.destinationaccountid)),
  );
}
