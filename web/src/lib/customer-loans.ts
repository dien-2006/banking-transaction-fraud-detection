import type { ApiLoan, LoanScheduleItem } from "@/services/bank.service";
import { historyDay } from "./customer-history";

export const isRepayingLoan = (loan: ApiLoan) =>
  loan.status === "Active" || loan.status === "Overdue";

export function installmentTotal(row: LoanScheduleItem) {
  return (
    Number(row.principaldue) + Number(row.interestdue) + Number(row.penaltydue)
  );
}

/** A Partial row does not identify how much was paid in the current API contract. */
export function installmentRemaining(row: LoanScheduleItem): number | null {
  if (row.status === "Paid") return 0;
  if (row.status === "Partial" && row.paidamount == null) return null;
  return Math.max(0, installmentTotal(row) - Number(row.paidamount ?? 0));
}

export function loanProgress(loan: ApiLoan, schedule?: LoanScheduleItem[]) {
  if (loan.status === "Paid")
    return {
      paid: schedule?.filter((row) => row.status === "Paid").length ?? 0,
      total: schedule?.length ?? 0,
      percent: 100,
    };
  if (!schedule?.length || !isRepayingLoan(loan)) return null;
  const paid = schedule.filter((row) => row.status === "Paid").length;
  return {
    paid,
    total: schedule.length,
    percent: Math.round((paid / schedule.length) * 100),
  };
}

export function customerLoanOverview(
  loans: ApiLoan[],
  schedules: Map<number, LoanScheduleItem[]>,
  today = historyDay(new Date().toISOString()),
) {
  const active = loans.filter(isRepayingLoan);
  const complete = active.every((loan) => schedules.has(loan.loanid));
  const upcoming = active
    .flatMap((loan) =>
      (schedules.get(loan.loanid) ?? [])
        .filter((row) => row.status !== "Paid")
        .map((row) => ({ ...row, loan })),
    )
    .sort(
      (a, b) =>
        a.duedate.localeCompare(b.duedate) ||
        a.loanid - b.loanid ||
        a.installmentno - b.installmentno,
    );
  const monthly = upcoming.filter(
    (row) => row.duedate.slice(0, 7) === today.slice(0, 7),
  );
  const amounts = monthly.map(installmentRemaining);
  return {
    total: loans.length,
    active: active.length,
    pending: loans.filter((loan) => loan.status === "Pending").length,
    overdue: loans.filter((loan) => loan.status === "Overdue").length,
    outstanding: active.reduce(
      (sum, loan) => sum + Number(loan.outstandingamount),
      0,
    ),
    complete,
    monthlyAmount:
      complete && amounts.every((amount) => amount !== null)
        ? amounts.reduce<number>((sum, amount) => sum + amount!, 0)
        : null,
    monthlyCount: monthly.length,
    nextDate: monthly[0]?.duedate,
    upcoming: complete ? upcoming : [],
  };
}

export function loanTerm(months: number) {
  const years = Math.floor(months / 12),
    remainder = months % 12;
  return [years ? `${years} năm` : "", remainder ? `${remainder} tháng` : ""]
    .filter(Boolean)
    .join(" ");
}

export function customerLoanProducts(loans: ApiLoan[]) {
  const products = new Map<string, number>();
  for (const loan of loans)
    products.set(loan.loantypename, (products.get(loan.loantypename) ?? 0) + 1);
  return [...products].map(([name, count]) => ({ name, count }));
}
