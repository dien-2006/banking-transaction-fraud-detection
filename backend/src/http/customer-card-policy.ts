// Simulated debit products available for customer self service.
export const customerCardTypes = [
  { value: 'Debit', label: 'Thẻ ghi nợ tiêu chuẩn' },
  { value: 'Debit Napas', label: 'Thẻ ghi nợ nội địa (Napas)' },
  { value: 'Debit Visa', label: 'Thẻ ghi nợ Visa' },
  { value: 'Debit Mastercard', label: 'Thẻ ghi nợ Mastercard' },
] as const;
