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
    username: actor.code,
    name: actor.name,
    role: actor.role,
    subtitle: actor.role === "customer" ? "Khách hàng cá nhân" : actor.role === "admin" ? "Quản trị hệ thống" : "Nhân viên ngân hàng",
    phone: actor.phone,
    email: actor.email,
    status: "Active",
  };
}

export const authService = {
  async login(username: string, password: string, role: Role, remember = true): Promise<SessionUser> {
    const deviceCode=role==="customer"?getDeviceCode():undefined;
    let response = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username.trim(), password, role, deviceCode }),
    });
    let user = mapActor(response.user);
    sessionStore.save(response.accessToken, JSON.stringify(user), remember);
    if(role==="customer"&&deviceCode&&!response.user.deviceId){
      const registered=await apiRequest("/me/devices",{method:"POST",body:JSON.stringify({deviceCode,deviceType:"Desktop",deviceName:navigator.platform||"Web Browser",operatingSystem:navigator.userAgent.slice(0,80)})}).then(()=>true).catch(()=>false);
      if(registered){response=await apiRequest<LoginResponse>("/auth/login",{method:"POST",body:JSON.stringify({username:username.trim(),password,role,deviceCode})});user=mapActor(response.user);sessionStore.save(response.accessToken,JSON.stringify(user),remember);}
    }
    return user;
  },
  logout(): void { sessionStore.clear(); },
  changePassword(oldPassword:string,newPassword:string){return apiRequest<void>("/auth/password",{method:"POST",body:JSON.stringify({oldPassword,newPassword})});},
  getSession(): SessionUser | null {
    const raw = sessionStore.session();
    if (!raw || !sessionStore.token()) return null;
    try { return JSON.parse(raw) as SessionUser; }
    catch { sessionStore.clear(); return null; }
  },
};

function getDeviceCode():string{
  const key="d4-device-code",existing=localStorage.getItem(key);
  if(existing)return existing;
  const value=typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key,value);return value;
}
