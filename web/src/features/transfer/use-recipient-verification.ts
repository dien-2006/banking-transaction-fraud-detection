"use client";
import { useEffect, useState } from "react";
import { validateTransferDestination } from "@/lib/transfer-data";
import { bankService, type TransferDestination } from "@/services/bank.service";

type Verification = {
  account: string;
  sourceId: number;
  status: "idle" | "checking" | "verified" | "error";
  destination: TransferDestination | null;
  message: string;
};

export function useRecipientVerification(
  account: string,
  sourceId: number,
  enabled: boolean,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Verification | null>(null);
  useEffect(() => {
    if (!enabled || !account) {
      setResult(null);
      return;
    }
    let current = true;
    setResult({
      account,
      sourceId,
      status: "checking",
      destination: null,
      message: "Đang xác minh tên người nhận…",
    });
    const timer = window.setTimeout(async () => {
      try {
        const destination = validateTransferDestination(
          await bankService.resolveDestination(account),
          sourceId,
        );
        if (current)
          setResult({
            account,
            sourceId,
            status: "verified",
            destination,
            message: destination.accountName,
          });
      } catch (caught) {
        if (current)
          setResult({
            account,
            sourceId,
            status: "error",
            destination: null,
            message:
              caught instanceof Error
                ? caught.message
                : "Không thể xác minh tên người nhận. Vui lòng thử lại.",
          });
      }
    }, 400);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [account, sourceId, enabled, attempt]);

  // Clear the previous name during the render that receives a different account.
  const value: Verification =
    !enabled || !account
      ? {
          account,
          sourceId,
          status: "idle",
          destination: null,
          message: "Tự động xác minh sau khi nhập số tài khoản",
        }
      : result?.account === account && result.sourceId === sourceId
        ? result
        : {
            account,
            sourceId,
            status: "checking",
            destination: null,
            message: "Đang xác minh tên người nhận…",
          };
  const retry = () => {
    setResult({
      account,
      sourceId,
      status: "checking",
      destination: null,
      message: "Đang xác minh tên người nhận…",
    });
    setAttempt((value) => value + 1);
  };
  return { ...value, retry };
}
