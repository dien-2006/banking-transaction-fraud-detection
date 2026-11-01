export function recordText(
  row: Record<string, unknown>,
  keys: string[],
  fallback = "—",
): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return fallback;
}

export function activeStatus(value: string): boolean {
  return [
    "active",
    "working",
    "verified",
    "approved",
    "đang hoạt động",
    "đang làm việc",
  ].includes(value.trim().toLocaleLowerCase("vi"));
}
