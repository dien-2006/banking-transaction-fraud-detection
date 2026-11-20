import type { PoolClient } from 'pg';

export interface TransactionEmailDetail {
  transaction: {transactioncode: string; amount: string | number; currency: string; status: string};
  postings: {accountid: string | number; postingtype: string; amount: string | number}[];
}

export async function loadTransactionEmailDetails(client: PoolClient, transactionId: number, customerId: number): Promise<string> {
  // Extract NUMERIC as text before pg parses JSON, preserving all currency digits.
  const result = await client.query<{result: TransactionEmailDetail; amount: string}>(
    `SELECT detail AS result, detail->'transaction'->>'amount' AS amount
     FROM (SELECT banking_api.get_transaction($1, $2::BIGINT) AS detail) authorized`, [transactionId, customerId]);
  const detail = result.rows[0]?.result;
  if (!detail?.transaction) throw new Error('Missing notification transaction detail');
  const postings = await client.query<{accountid:string;accountnumber:string;postingtype:string;amount:string}>(`SELECT p.accountid,a.accountnumber,p.postingtype,p.amount::text
    FROM banking.transaction_posting p JOIN banking.bank_account a USING(accountid)
    JOIN banking.bank_transaction t USING(transactionid)
    WHERE p.transactionid=$2 AND EXISTS (
      SELECT 1 FROM banking.account_holder h WHERE h.accountid=p.accountid
        AND h.customerid=$1 AND h.holdertype IN ('PRIMARY_OWNER','JOINT_OWNER')
        AND h.startdate<=t.transactiondate::date
        AND (h.enddate IS NULL OR h.enddate>=t.transactiondate::date))
    ORDER BY p.postingid`, [customerId, transactionId]);
  return transactionEmailDetails({...detail, transaction: {...detail.transaction, amount: result.rows[0].amount}, postings: postings.rows},
    new Map(postings.rows.map(posting => [String(posting.accountid), posting.accountnumber])));
}

function money(value: string | number, currency: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Invalid notification amount');
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return `${BigInt(match[1]).toLocaleString('vi-VN')}${fraction === '00' ? '' : ',' + fraction} ${currency}`;
}

/** Signs describe committed ledger entries on the recipient's own accounts only. */
export function transactionEmailDetails(detail: TransactionEmailDetail, accounts: ReadonlyMap<string, string>): string {
  if (!detail?.transaction || !Array.isArray(detail.postings)) throw new Error('Missing notification transaction detail');
  const transaction = detail.transaction;
  const status: Record<string, string> = {Success:'Thành công', Pending:'Đang xử lý', Failed:'Thất bại', Cancelled:'Đã hủy'};
  const lines = [`Mã giao dịch: ${transaction.transactioncode}`, `Trạng thái: ${status[transaction.status] ?? transaction.status}`];
  if (transaction.status !== 'Success') {
    lines.push(`Số tiền yêu cầu: ${money(transaction.amount, transaction.currency)}`,
      'Giao dịch này chưa được hạch toán thành công; chưa ghi nhận cộng/trừ tiền.');
  } else {
    const owned = detail.postings.filter(posting => accounts.has(String(posting.accountid)));
    if (!owned.length) throw new Error('Missing recipient ledger entries');
    for (const posting of owned) {
      if (!['CREDIT', 'DEBIT'].includes(posting.postingtype)) throw new Error('Invalid notification posting type');
      const credit = posting.postingtype === 'CREDIT';
      lines.push(`Tài khoản ${accounts.get(String(posting.accountid))}: ${credit ? '+' : '−'}${money(posting.amount, transaction.currency)} (${credit ? 'Ghi có' : 'Ghi nợ'})`);
    }
  }
  return '\n' + lines.join('\n');
}
