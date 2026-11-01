"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, SESSION_CHANGED_EVENT } from "@/services/api.client";
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (attempt, error) =>
              attempt < 2 &&
              (!(error instanceof ApiError) ||
                error.status >= 500 ||
                error.status === 429),
          },
        },
      }),
  );
  useEffect(() => {
    const clear = () => client.clear();
    const storageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === "d4-session" ||
        event.key === "d4-access-token"
      )
        clear();
    };
    window.addEventListener(SESSION_CHANGED_EVENT, clear);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, clear);
      window.removeEventListener("storage", storageChanged);
    };
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
