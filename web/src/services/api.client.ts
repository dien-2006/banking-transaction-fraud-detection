const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const API_PREFIX = "/api/v1";
const TOKEN_KEY = "d4-access-token";
const SESSION_KEY = "d4-session";

export interface ApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

function storageWith(key: string): Storage | null {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem(key) !== null) return localStorage;
  if (sessionStorage.getItem(key) !== null) return sessionStorage;
  return null;
}

export const sessionStore = {
  token: () => storageWith(TOKEN_KEY)?.getItem(TOKEN_KEY) ?? null,
  session: () => storageWith(SESSION_KEY)?.getItem(SESSION_KEY) ?? null,
  save(token: string, session: string, remember: boolean): void {
    this.clear();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(SESSION_KEY, session);
  },
  clear(): void {
    if (typeof window === "undefined") return;
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(SESSION_KEY);
    }
  },
};

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = sessionStore.token();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${API_PREFIX}${path}`, { ...init, headers, cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && typeof window !== "undefined") {
      sessionStore.clear();
      window.dispatchEvent(new Event("d4-session-expired"));
    }
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(message || `API error ${response.status}`, response.status, body.code);
  }
  return body;
}

export function toQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}
