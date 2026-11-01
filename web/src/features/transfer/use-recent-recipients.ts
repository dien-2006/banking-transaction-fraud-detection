"use client";
import { useEffect, useState } from "react";
import type { TransferDestination } from "@/services/bank.service";

// Only recipients of completed transfers in this browser session are remembered.
export function useRecentRecipients(customerId: string) {
  const key = `d4-transfer-recipients:${customerId}`;
  const [recipients, setRecipients] = useState<TransferDestination[]>([]);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      setRecipients(
        Array.isArray(stored)
          ? stored
              .filter(
                (row): row is TransferDestination =>
                  !!row &&
                  typeof row === "object" &&
                  Number.isInteger(row.accountId) &&
                  typeof row.accountNumber === "string" &&
                  typeof row.accountName === "string" &&
                  row.currency === "VND" &&
                  typeof row.bankName === "string",
              )
              .slice(0, 8)
          : [],
      );
    } catch {
      setRecipients([]);
    }
  }, [key]);
  const remember = (recipient: TransferDestination) => {
    const next = [
      recipient,
      ...recipients.filter((row) => row.accountId !== recipient.accountId),
    ].slice(0, 8);
    setRecipients(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* The transfer result remains valid if browser storage is unavailable. */
    }
  };
  return { recipients, remember };
}
