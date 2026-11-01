const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
const API_PREFIX = "/api/v1";
const TOKEN_KEY = "d4-access-token";
const SESSION_KEY = "d4-session";
export const SESSION_CHANGED_EVENT = "d4-session-changed";

export interface ApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
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
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  },
  clear(): void {
    if (typeof window === "undefined") return;
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(SESSION_KEY);
    }
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  },
};

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body !== undefined)
    headers.set("Content-Type", "application/json");
  const token = sessionStore.token();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${API_PREFIX}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new ApiError(
      response.ok
        ? "Phản hồi từ hệ thống không hợp lệ. Vui lòng thử lại."
        : "Không thể kết nối dịch vụ. Vui lòng thử lại.",
      response.status,
    );
  }
  if (!response.ok) {
    const error =
      body && typeof body === "object" ? (body as ApiErrorBody) : {};
    if (
      response.status === 401 &&
      error.code !== "AUTH_INVALID" &&
      path !== "/auth/login" &&
      typeof window !== "undefined" &&
      sessionStore.token() === token
    ) {
      sessionStore.clear();
      window.dispatchEvent(new Event("d4-session-expired"));
    }
    const message = Array.isArray(error.message)
      ? error.message.join(", ")
      : error.message;
    throw new ApiError(
      message ||
        (response.status === 403
          ? "Bạn không có quyền thực hiện thao tác này."
          : "Không thể hoàn tất yêu cầu. Vui lòng thử lại."),
      response.status,
      error.code,
    );
  }
  return body as T;
}

export function toQuery(
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "")
      search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}
