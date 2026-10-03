import type { Role, SessionUser } from "@/types";

export const demoUsers: Record<Role, SessionUser> = {
  admin: { id: "1", employeeCode: "AD001", username: "hoangan.admin", name: "Nguyễn Hoàng An", role: "admin", subtitle: "Admin hệ thống", gender: "Nam", dateOfBirth: "15/08/1990", phone: "0912 345 678", email: "hoangan@d4bank.vn", branchCode: "D4-HO", branchName: "Hội sở D4 Bank", hireDate: "12/03/2018", lastLogin: "30/09/2026 09:32", createdAt: "12/03/2018", status: "Active" },
  employee: { id: "19", employeeCode: "NV019", username: "thuhuong.employee", name: "Trần Thu Hương", role: "employee", subtitle: "Chuyên viên giao dịch", gender: "Nữ", dateOfBirth: "21/11/1995", phone: "0988 215 006", email: "thuhuong@d4bank.vn", branchCode: "D4-HN", branchName: "Chi nhánh Hà Nội", hireDate: "05/06/2021", lastLogin: "30/09/2026 09:18", createdAt: "05/06/2021", status: "Active" },
  customer: { id: "102498", employeeCode: "KH102498", username: "minhanh.customer", name: "Nguyễn Minh Anh", role: "customer", subtitle: "Khách hàng ưu tiên", gender: "Nam", dateOfBirth: "09/04/1993", phone: "0912 345 678", email: "minhanh@example.com", branchCode: "D4-HN", branchName: "Chi nhánh Hà Nội", lastLogin: "30/09/2026 09:24", createdAt: "18/07/2022", status: "Active" }
};

export const authService = {
  async login(username: string, password: string, role: Role): Promise<SessionUser> {
    await new Promise((resolve) => setTimeout(resolve, 450));
    if (!username.trim() || password.length < 6) throw new Error("Thông tin đăng nhập không hợp lệ");
    const user = demoUsers[role];
    localStorage.setItem("d4-session", JSON.stringify(user));
    return user;
  },
  logout() { localStorage.removeItem("d4-session"); },
  getSession(): SessionUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("d4-session");
    if (!raw) return null;
    try { return JSON.parse(raw) as SessionUser; } catch { return null; }
  }
};
