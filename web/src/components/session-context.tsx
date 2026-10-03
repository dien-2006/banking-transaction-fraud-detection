"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/types";

const SessionContext = createContext<SessionUser | null>(null);

export const SessionProvider = SessionContext.Provider;

export function useSessionUser() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSessionUser must be used inside DashboardShell");
  return session;
}
