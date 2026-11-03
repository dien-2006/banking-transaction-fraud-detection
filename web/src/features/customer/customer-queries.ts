"use client";
import { useQuery } from "@tanstack/react-query";
import { useSessionUser } from "@/components/session-context";
import { bankService } from "@/services/bank.service";
import { loadCustomerTransactions } from "@/lib/customer-data";

export function useCustomerAccounts() {
  const user = useSessionUser();
  return useQuery({
    queryKey: ["customer", user.id, "accounts"],
    queryFn: bankService.customerAccounts,
    refetchInterval: 15_000,
  });
}
export function useCustomerTransactions() {
  const user = useSessionUser();
  return useQuery({
    queryKey: ["customer", user.id, "transactions"],
    queryFn: () => loadCustomerTransactions(bankService.listTransactions),
    refetchInterval: 15_000,
  });
}
