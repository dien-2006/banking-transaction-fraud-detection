import type { Role, SessionUser } from "@/types";
import { apiRequest, sessionStore } from "./api.client";

interface AuthActor {
  actorType: "customer" | "employee";
  role: Role;
  customerId?: number;
  userId?: number;
  employeeId?: number;
  deviceId?: number;
  branchId?: number;
  code: string;
  name: string;
  email?: string;
  phone?: string;
}

interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthActor;
}

function mapActor(actor: AuthActor): SessionUser {
  return {
    id: String(actor.customerId ?? actor.userId ?? actor.employeeId),
    customerId: actor.customerId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    deviceId: actor.deviceId,
    branchId: actor.branchId,
    employeeCode: actor.code,
    name: actor.name,
    role: actor.role,
    subtitle:
      actor.role === "customer"
        ? "Khách hàng cá nhân"
        : actor.role === "admin"
          ? "Quản trị hệ thống"
          : "Nhân viên ngân hàng",
    phone: actor.phone,
    email: actor.email,
    status: "Active",
  };
}

export const authService = {
  async login(
    username: string,
    password: string,
    remember = true,
  ): Promise<SessionUser> {
    const deviceCode = getDeviceCode();
    let response = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username.trim(), password, deviceCode }),
    });
    let user = mapActor(response.user);
    sessionStore.save(response.accessToken, JSON.stringify(user), remember);
    if (user.role === "customer" && !response.user.deviceId) {
      const registered = await apiRequest("/me/devices", {
        method: "POST",
        body: JSON.stringify({
          deviceCode,
          deviceType: "Desktop",
          deviceName: navigator.platform || "Web Browser",
          operatingSystem: navigator.userAgent.slice(0, 80),
        }),
      })
        .then(() => true)
        .catch(() => false);
      if (registered) {
        // Device registration is optional. A refresh failure must not turn a
        // successful login into an error while leaving a valid session behind.
        try {
          const refreshed = await apiRequest<LoginResponse>("/auth/login", {
            method: "POST",
            body: JSON.stringify({
              username: username.trim(),
              password,
              deviceCode,
            }),
          });
          if (sessionStore.token() === response.accessToken) {
            response = refreshed;
            user = mapActor(response.user);
            sessionStore.save(
              response.accessToken,
              JSON.stringify(user),
              remember,
            );
          }
        } catch (error) {
          if (sessionStore.token() !== response.accessToken) throw error;
        }
      }
    }
    return user;
  },
  logout(): void {
    sessionStore.clear();
  },
  changePassword(oldPassword: string, newPassword: string) {
    return apiRequest<void>("/auth/password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },
  getSession(): SessionUser | null {
    const raw = sessionStore.session();
    if (!raw || !sessionStore.token()) return null;
    try {
      const session = JSON.parse(raw) as SessionUser;
      if (
        !session ||
        !["admin", "employee", "customer"].includes(session.role) ||
        !String(session.id ?? "").trim() ||
        typeof session.name !== "string"
      )
        throw new Error("Invalid session");
      return session;
    } catch {
      sessionStore.clear();
      return null;
    }
  },
};

function getDeviceCode(): string {
  const key = "d4-device-code",
    existing = localStorage.getItem(key);
  if (existing) return existing;
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, value);
  return value;
}
