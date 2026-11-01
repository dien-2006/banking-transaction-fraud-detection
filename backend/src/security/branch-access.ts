import { ForbiddenException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { AuthUser } from './auth.guard';

export function employeeBranch(user: AuthUser): number | null {
  if (user.role !== 'employee') return null;
  const branch = Number(user.branchId);
  if (!Number.isSafeInteger(branch) || branch <= 0) throw new ForbiddenException('Branch identity required');
  return branch;
}

export function assertBranch(user: AuthUser, requested: number): void {
  const branch = employeeBranch(user);
  if (branch !== null && Number(requested) !== branch) throw new ForbiddenException('Đối tượng không thuộc chi nhánh của bạn');
}

const resources = {
  account: 'SELECT 1 FROM banking.bank_account WHERE accountid=$1 AND branchid=$2',
  card: 'SELECT 1 FROM banking.card c JOIN banking.bank_account a USING(accountid) WHERE c.cardid=$1 AND a.branchid=$2',
  loan: 'SELECT 1 FROM banking.loan WHERE loanid=$1 AND branchid=$2',
  customer: `SELECT 1 FROM banking.customer c WHERE c.customerid=$1 AND (
    EXISTS(SELECT 1 FROM banking.account_holder h JOIN banking.bank_account a USING(accountid) WHERE h.customerid=c.customerid AND h.status='Active' AND a.branchid=$2)
    OR EXISTS(SELECT 1 FROM banking.loan l WHERE l.customerid=c.customerid AND l.branchid=$2))`,
  transaction: `SELECT 1 FROM banking.bank_transaction t WHERE t.transactionid=$1 AND (
    EXISTS(SELECT 1 FROM banking.transfer_request r JOIN banking.bank_account a ON a.accountid IN (r.sourceaccountid,r.destinationaccountid) WHERE r.transactionid=t.transactionid AND a.branchid=$2)
    OR EXISTS(SELECT 1 FROM banking.transaction_posting p JOIN banking.bank_account a USING(accountid) WHERE p.transactionid=t.transactionid AND a.branchid=$2))`,
} as const;

/** Resource branches are immutable through the web management contracts. */
export async function assertResourceBranch(db: DatabaseService, user: AuthUser, resource: keyof typeof resources, id: number): Promise<void> {
  const branch = employeeBranch(user);
  if (branch === null) return;
  const result = await db.pool.query(resources[resource], [id, branch]);
  if (!result.rows.length) throw new ForbiddenException('Đối tượng không thuộc chi nhánh của bạn');
}
