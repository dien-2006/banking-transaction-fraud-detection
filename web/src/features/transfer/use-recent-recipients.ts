"use client";
import { useQuery } from "@tanstack/react-query";
import { bankService } from "@/services/bank.service";

// The authenticated API derives recipients from successful historical transfers.
export function useRecentRecipients(customerId: string) {
  return useQuery({
    queryKey: ["customer", customerId, "recipients"],
    queryFn: bankService.customerRecipients,
    refetchInterval: 15_000,
  });
}
