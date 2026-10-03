import type { Role, Stat, Transaction } from "@/types";

export const transactions: Transaction[] = [
  { id: "D4T240901", customer: "Nguyễn Minh Anh", type: "Chuyển khoản", amount: 12500000, time: "30/09/2026 09:24", status: "Thành công", risk: "Thấp" },
  { id: "D4T240902", customer: "Trần Quốc Bảo", type: "Thanh toán", amount: 2850000, time: "30/09/2026 09:18", status: "Đang xử lý", risk: "Trung bình" },
  { id: "D4T240903", customer: "Lê Thu Hà", type: "Nhận tiền", amount: 42000000, time: "30/09/2026 08:57", status: "Thành công", risk: "Thấp" },
  { id: "D4T240904", customer: "Phạm Gia Huy", type: "Chuyển khoản", amount: 98000000, time: "30/09/2026 08:41", status: "Thất bại", risk: "Cao" },
  { id: "D4T240905", customer: "Đỗ Ngọc Linh", type: "Thanh toán", amount: 760000, time: "30/09/2026 08:32", status: "Thành công", risk: "Thấp" },
  { id: "D4T240906", customer: "Vũ Hoàng Nam", type: "Chuyển khoản", amount: 17600000, time: "30/09/2026 08:11", status: "Thành công", risk: "Trung bình" }
];

export const roleStats: Record<Role, Stat[]> = {
  admin: [
    { label: "Tổng khách hàng", value: "24.892", change: "+12,5% tháng này", tone: "blue" },
    { label: "Tổng số dư", value: "2.480 tỷ ₫", change: "+8,2% tháng này", tone: "green" },
    { label: "Giao dịch hôm nay", value: "18.294", change: "+6,4% so với hôm qua", tone: "orange" },
    { label: "Cảnh báo gian lận", value: "28", change: "8 cảnh báo mức cao", tone: "red" }
  ],
  employee: [
    { label: "Khách hàng phụ trách", value: "286", change: "+12 khách hàng", tone: "blue" },
    { label: "Yêu cầu hôm nay", value: "42", change: "18 đã hoàn thành", tone: "green" },
    { label: "Hồ sơ vay chờ xử lý", value: "16", change: "5 hồ sơ ưu tiên", tone: "orange" },
    { label: "Cảnh báo cần xử lý", value: "7", change: "2 cảnh báo mức cao", tone: "red" }
  ],
  customer: [
    { label: "Tổng số dư", value: "284.560.000 ₫", change: "+4,2% tháng này", tone: "blue" },
    { label: "Chi tiêu tháng này", value: "18.240.000 ₫", change: "72% ngân sách", tone: "orange" },
    { label: "Tiền vào", value: "42.800.000 ₫", change: "+8,6% tháng này", tone: "green" },
    { label: "Khoản vay còn lại", value: "126.400.000 ₫", change: "Kỳ tới 05/10", tone: "red" }
  ]
};

export const customers = [
  ["KH102498", "Nguyễn Minh Anh", "0912 345 678", "Hà Nội", "Đã xác minh", "Đang hoạt động"],
  ["KH102499", "Trần Quốc Bảo", "0988 215 006", "TP. Hồ Chí Minh", "Đã xác minh", "Đang hoạt động"],
  ["KH102500", "Lê Thu Hà", "0904 624 112", "Đà Nẵng", "Chờ xác minh", "Tạm khóa"],
  ["KH102501", "Phạm Gia Huy", "0936 810 532", "Hải Phòng", "Đã xác minh", "Đang hoạt động"]
];

export const loans = [
  ["LN240812", "Nguyễn Minh Anh", "Vay mua nhà", "1.250.000.000 ₫", "7,2%", "Đang trả"],
  ["LN240813", "Trần Quốc Bảo", "Vay kinh doanh", "480.000.000 ₫", "8,5%", "Chờ duyệt"],
  ["LN240814", "Lê Thu Hà", "Vay tiêu dùng", "85.000.000 ₫", "11,2%", "Đang thẩm định"]
];

export const fraudCases = [
  ["FR240091", "D4T240904", "Phạm Gia Huy", "98.000.000 ₫", "87/100", "Thiết bị mới, số tiền bất thường", "Chờ review"],
  ["FR240092", "D4T240906", "Vũ Hoàng Nam", "17.600.000 ₫", "62/100", "Tần suất giao dịch cao", "Chờ xử lý"],
  ["FR240093", "D4T240887", "Ngô Minh Trang", "52.000.000 ₫", "48/100", "Giao dịch ngoài giờ", "Đã xử lý"]
];
