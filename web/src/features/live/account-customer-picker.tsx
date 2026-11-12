"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, UserRound } from "lucide-react";
import { useSessionUser } from "@/components/session-context";
import { bankService } from "@/services/bank.service";
import { recordText } from "@/lib/record-value";

export type AccountCustomer = { id: number; code: string; name: string };

export function AccountCustomerPicker({ selected, onSelect, disabled, label = "Khách hàng sở hữu", showId = true, invalid = false, describedBy }: {
  selected: AccountCustomer | null;
  onSelect: (customer: AccountCustomer | null) => void;
  disabled: boolean;
  label?: string;
  showId?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const user = useSessionUser();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const customers = useQuery({
    queryKey: ["account-owner-options", user.role, user.id, user.branchId, query],
    queryFn: () => bankService.customers({ query, status: "Active", page: 1, pageSize: 20 }),
  });
  const searching = search.trim() !== query || customers.isFetching;
  return (
    <section className="account-owner-picker" aria-label="Chọn khách hàng">
      <label htmlFor={selected ? undefined : "account-owner-search"}>{label} <span className="customer-field-required" aria-hidden="true">*</span></label>
      {selected ? (
        <div className="account-owner-selected">
          <UserRound size={20} />
          <span><strong>{selected.name}</strong><small>{selected.code}{showId && ` · ID ${selected.id}`}</small></span>
          <button type="button" disabled={disabled} onClick={() => onSelect(null)}>Thay đổi</button>
        </div>
      ) : (
        <>
          <div className="account-owner-search">
            <Search size={17} />
            <input id="account-owner-search" type="search"
              placeholder={showId ? "Tìm theo tên, mã hoặc ID khách hàng…" : "Tìm theo mã khách hàng hoặc họ tên…"}
              aria-invalid={invalid || undefined} aria-describedby={describedBy}
              value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="account-owner-options" aria-label="Kết quả tìm khách hàng" aria-busy={searching}>
            {searching ? <p role="status">Đang tìm khách hàng…</p>
              : customers.isError ? <p role="alert">Không thể tải khách hàng. <button type="button" onClick={() => void customers.refetch()}>Thử lại</button></p>
              : !customers.data?.items.length ? <p>Không có khách hàng phù hợp trong phạm vi được cấp quyền.</p>
              : customers.data.items.map((row) => {
                const id = Number(row.customerid);
                const code = recordText(row, ["customercode"]);
                const name = recordText(row, ["fullname"]);
                return <button type="button" key={id} disabled={disabled || !Number.isSafeInteger(id) || id <= 0}
                  onClick={() => onSelect({ id, code, name })}>
                  <UserRound size={18} /><span><strong>{name}</strong><small>{code}{showId && ` · ID ${id}`}</small></span><ChevronRight size={16} />
                </button>;
              })}
          </div>
          {!!customers.data && customers.data.total > 20 && <small>Hiển thị 20 kết quả. Nhập tên hoặc mã để tìm chính xác.</small>}
        </>
      )}
    </section>
  );
}
