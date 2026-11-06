"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";
import { RecordStatus } from "@/components/record-status";
import { formatCurrency } from "@/lib/presentation";
import type { ApiAccount } from "@/services/bank.service";

export function AccountDetails({
  account,
  hidden = false,
  showOwner = false,
}: {
  account: ApiAccount;
  hidden?: boolean;
  showOwner?: boolean;
}) {
  const amount = (value: string) =>
    hidden
      ? "••••••"
      : value == null
        ? "Chưa cập nhật"
        : formatCurrency(value, account.currency);
  const fields = [
    ["Số tài khoản", hidden ? "••••••" : account.accountnumber],
    ...(showOwner
      ? [
          [
            "Chủ tài khoản",
            account.accountcategory === "INTERNAL"
              ? "Nội bộ ngân hàng"
              : account.customerid == null
                ? "Chưa cập nhật"
                : `Khách hàng #${account.customerid}`,
          ],
        ]
      : []),
    ["Loại tài khoản", account.accounttypename],
    ["Chi nhánh", account.branchname],
    ["Loại tiền", account.currency],
    ["Số dư", amount(account.balance)],
    ["Số dư khả dụng", amount(account.availablebalance)],
    ["Số dư tối thiểu", amount(account.minbalance)],
  ];
  return (
    <dl className="d4-record-details">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "Chưa cập nhật"}</dd>
        </div>
      ))}
      <div>
        <dt>Trạng thái</dt>
        <dd>
          <RecordStatus status={account.status} domain="account" />
        </dd>
      </div>
    </dl>
  );
}

export function AccountDetailsButton({ account }: { account: ApiAccount }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="d4-view-button" onClick={() => setOpen(true)}>
        Xem
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Chi tiết tài khoản">
        <AccountDetails account={account} showOwner />
      </Modal>
    </>
  );
}
