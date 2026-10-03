import { customers, fraudCases, loans, roleStats, transactions } from "@/mocks/data";
import type { Role, Transaction } from "@/types";

const wait = () => new Promise((resolve) => setTimeout(resolve, 280));
export const bankService = {
  async dashboard(role: Role) { await wait(); return { stats: roleStats[role], transactions }; },
  async transactions(query = "") { await wait(); return transactions.filter((x) => Object.values(x).join(" ").toLowerCase().includes(query.toLowerCase())); },
  async customers() { await wait(); return customers; },
  async loans() { await wait(); return loans; },
  async fraudCases() { await wait(); return fraudCases; },
  async transfer(input: Omit<Transaction, "id" | "time" | "status" | "risk" | "type">) {
    await wait();
    const created: Transaction = { ...input, id: `D4T${Date.now().toString().slice(-6)}`, time: new Date().toLocaleString("vi-VN"), status: "Thành công", risk: "Thấp", type: "Chuyển khoản" };
    transactions.unshift(created);
    return created;
  }
};
