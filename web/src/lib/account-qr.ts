const accountNumberPattern = /^[A-Za-z0-9-]{1,30}$/;

/** Public receiving details only: never encode balances, login IDs or credentials. */
export function accountQrPayload(accountNumber: string): string {
  if (!accountNumberPattern.test(accountNumber)) throw new Error("Số tài khoản không hợp lệ để tạo QR.");
  // A short payload makes the printed/displayed QR less dense for real cameras.
  return `D4BANK:1:${accountNumber}`;
}

/** QR is untrusted input; only the account number is passed to server verification. */
export function accountNumberFromQr(text: string): string {
  const invalid = () => new Error("Đây không phải mã QR chuyển tiền D4 Bank hợp lệ.");
  if (text.length > 1024) throw invalid();
  if (text.startsWith("D4BANK:")) {
    const compact = /^D4BANK:1:([A-Za-z0-9-]{1,30})$/.exec(text);
    if (!compact) throw invalid();
    return compact[1];
  }
  // Keep every QR downloaded before the compact format working.
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw invalid(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const data = value as Record<string, unknown>;
  if (data.type !== "D4BANK_TRANSFER" || data.version !== 1 || data.currency !== "VND"
    || typeof data.accountNumber !== "string" || !accountNumberPattern.test(data.accountNumber)
    || Object.keys(data).some(key => !["type", "version", "currency", "accountNumber"].includes(key))) throw invalid();
  return data.accountNumber;
}
