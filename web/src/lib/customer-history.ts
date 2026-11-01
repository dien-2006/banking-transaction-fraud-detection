import { dateKey, formatTime } from "./presentation";
import type { ApiAccount, ApiTransaction } from "@/services/bank.service";
import { transactionTypes, transactionView } from "./customer-data";

export const emptyHistoryFilters = {
  search: "",
  type: "",
  status: "",
  account: "",
  from: "",
  to: "",
  amount: "",
};
export type HistoryFilters = typeof emptyHistoryFilters;
export const historyDay = dateKey;
export const historyDate = (value: string) => {
  const day = dateKey(value);
  return day ? day.split("-").reverse().join("/") : "Chưa cập nhật";
};
export const historyTime = formatTime;
export const amountRanges = [
  { value: "", label: "Tất cả số tiền" },
  { value: "under1m", label: "Dưới 1 triệu" },
  { value: "1m-10m", label: "1 đến dưới 10 triệu" },
  { value: "10m-50m", label: "10 đến dưới 50 triệu" },
  { value: "50m-plus", label: "Từ 50 triệu" },
];

export function filterCustomerHistory(
  rows: ApiTransaction[],
  filters: HistoryFilters,
) {
  if (filters.from && filters.to && filters.from > filters.to) return [];
  const search = filters.search.trim().toLocaleLowerCase("vi");
  return rows.filter((row) => {
    const day = historyDay(row.transactiondate),
      amount = Number(row.amount);
    return (
      (!filters.type || row.typecode === filters.type) &&
      (!filters.status || row.status === filters.status) &&
      (!filters.account ||
        row.sourceaccountid === Number(filters.account) ||
        row.destinationaccountid === Number(filters.account)) &&
      (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to) &&
      (!filters.amount ||
        (row.currency === "VND" &&
          ((filters.amount === "under1m" && amount < 1e6) ||
            (filters.amount === "1m-10m" && amount >= 1e6 && amount < 1e7) ||
            (filters.amount === "10m-50m" && amount >= 1e7 && amount < 5e7) ||
            (filters.amount === "50m-plus" && amount >= 5e7)))) &&
      `${row.transactioncode} ${row.description ?? ""} ${row.typename} ${transactionTypes[row.typecode] ?? ""}`
        .toLocaleLowerCase("vi")
        .includes(search)
    );
  });
}
export type HistoryDay = { day: string; incoming: number; outgoing: number };
export function summarizeCustomerHistory(
  rows: ApiTransaction[],
  accounts: ApiAccount[],
) {
  let incoming = 0,
    outgoing = 0;
  const days = new Map<string, HistoryDay>();
  for (const row of rows) {
    if (row.status !== "Success" || row.currency !== "VND") continue;
    const direction = transactionView(row, accounts).direction;
    if (direction !== "in" && direction !== "out") continue;
    const key = historyDay(row.transactiondate),
      day = days.get(key) ?? { day: key, incoming: 0, outgoing: 0 };
    if (direction === "in") {
      incoming += Number(row.amount);
      day.incoming += Number(row.amount);
    } else {
      outgoing += Number(row.amount);
      day.outgoing += Number(row.amount);
    }
    days.set(key, day);
  }
  return {
    total: rows.length,
    pending: rows.filter((row) => row.status === "Pending").length,
    incoming,
    outgoing,
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}
export function historyChartBuckets(days: HistoryDay[], limit = 7) {
  const size = Math.max(1, Math.ceil(days.length / limit));
  const buckets: {
    from: string;
    to: string;
    incoming: number;
    outgoing: number;
  }[] = [];
  for (let i = 0; i < days.length; i += size) {
    const group = days.slice(i, i + size);
    buckets.push({
      from: group[0].day,
      to: group[group.length - 1].day,
      incoming: group.reduce((sum, row) => sum + row.incoming, 0),
      outgoing: group.reduce((sum, row) => sum + row.outgoing, 0),
    });
  }
  return buckets;
}
export function frequentCustomerTransactions(rows: ApiTransaction[]) {
  const groups = new Map<
    string,
    {
      key: string;
      description: string;
      type: string;
      currency: string;
      count: number;
      total: number;
    }
  >();
  for (const row of rows) {
    if (row.status !== "Success") continue;
    const description =
      row.description ||
      row.typename ||
      transactionTypes[row.typecode] ||
      row.typecode;
    const key = JSON.stringify([row.typecode, row.currency, description]);
    const group = groups.get(key) ?? {
      key,
      description,
      type: row.typecode,
      currency: row.currency,
      count: 0,
      total: 0,
    };
    group.count++;
    group.total += Number(row.amount);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.count - a.count || a.description.localeCompare(b.description, "vi"),
    )
    .slice(0, 4);
}
export function historyAccountLabel(
  row: ApiTransaction,
  accounts: ApiAccount[],
) {
  const source = accounts.find(
      (account) => account.accountid === row.sourceaccountid,
    ),
    destination = accounts.find(
      (account) => account.accountid === row.destinationaccountid,
    );
  const mask = (account: ApiAccount) =>
    `•••• ${account.accountnumber.slice(-4)}`;
  return source && destination
    ? `${mask(source)} → ${mask(destination)}`
    : source || destination
      ? mask((source || destination)!)
      : "—";
}
