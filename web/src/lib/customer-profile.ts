import { formatDateTime } from "./presentation";
import { customerDate } from "./customer-data";

export function profileValue(value: unknown, fallback = "Chưa cập nhật") {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim() || fallback
    : fallback;
}
export function profileInitials(value: unknown) {
  const words = profileValue(value, "").split(/\s+/).filter(Boolean);
  return words.length
    ? [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])]
        .map((word) => Array.from(word)[0])
        .join("")
        .toLocaleUpperCase("vi")
    : "?";
}
export function profileIdentity(value: unknown) {
  const text = profileValue(value, "");
  if (!text) return "Không hiển thị trên web";
  return text.length > 4
    ? `•••• •••• ${text.slice(-4)}`
    : "Thông tin được bảo vệ";
}
export function customerProfileType(value: unknown) {
  const type = profileValue(value, "");
  if (/^(individual|personal|retail|cá nhân)$/i.test(type))
    return "Khách hàng cá nhân";
  if (/^(business|corporate|doanh nghiệp)$/i.test(type))
    return "Khách hàng doanh nghiệp";
  return type || "Khách hàng D4 Bank";
}
export function customerProfileFields(profile: Record<string, unknown>) {
  const gender = profileValue(profile.gender);
  return [
    ["fullname", "Họ và tên", profileValue(profile.fullname)],
    ["customercode", "Mã khách hàng", profileValue(profile.customercode)],
    [
      "dateofbirth",
      "Ngày sinh",
      customerDate(profileValue(profile.dateofbirth, "")),
    ],
    [
      "gender",
      "Giới tính",
      (
        {
          Male: "Nam",
          Female: "Nữ",
          Other: "Khác",
          Unknown: "Chưa cập nhật",
        } as Record<string, string>
      )[gender] ?? gender,
    ],
    ["phone", "Số điện thoại", profileValue(profile.phone)],
    ["email", "Email", profileValue(profile.email)],
    ["nationalid", "Số CCCD/CMND", profileIdentity(profile.nationalid)],
    ["address", "Địa chỉ", profileValue(profile.address)],
    ["occupation", "Nghề nghiệp", profileValue(profile.occupation)],
  ];
}
export function profileDeviceTime(value: unknown) {
  return formatDateTime(value);
}
