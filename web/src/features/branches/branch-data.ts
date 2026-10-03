export type BranchRow = { code: string; name: string; address: string; region: string; staff: number; customers: number; image: string };

export const branchRows: BranchRow[] = [
  { code: "CN001", name: "Hội sở", address: "Số 123 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội", region: "Miền Bắc", staff: 120, customers: 125430, image: "/branch-head-office.png" },
  { code: "CN002", name: "Chi nhánh Đà Nẵng", address: "Số 456 Nguyễn Văn Linh, Đà Nẵng", region: "Miền Trung", staff: 85, customers: 98250, image: "/branch-da-nang.png" },
  { code: "CN003", name: "Chi nhánh TP.HCM", address: "Số 789 Nguyễn Huệ, Quận 1, TP.HCM", region: "Miền Nam", staff: 120, customers: 210430, image: "/branch-ho-chi-minh.png" },
  { code: "CN004", name: "Chi nhánh Cần Thơ", address: "Số 321 Võ Văn Kiệt, Cần Thơ", region: "Miền Nam", staff: 65, customers: 65120, image: "/branch-head-office.png" },
  { code: "CN005", name: "Chi nhánh Hải Phòng", address: "Số 654 Lê Hồng Phong, Hải Phòng", region: "Miền Bắc", staff: 60, customers: 72310, image: "/branch-da-nang.png" },
];
