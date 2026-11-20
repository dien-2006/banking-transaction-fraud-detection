/** UUID v4 from browser randomness, including HTTP contexts without randomUUID. */
export function newRequestKey(): string {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Không thể tạo mã yêu cầu an toàn. Vui lòng cập nhật trình duyệt rồi thử lại.");
  }
  const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;
  bytes[8]=(bytes[8]&63)|128;
  const value=Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
