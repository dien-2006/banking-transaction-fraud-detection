import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Injectable,
  Post,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Request } from "express";
import { DatabaseService } from "../database/database.service";
import { AuthUser } from "../security/auth.guard";
import { employeeBranch } from "../security/branch-access";
import { CurrentUser, Roles } from "../security/decorators";
import { CounterTransferDto } from "./dto";

function minorUnits(value: string): bigint {
  if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(value))
    throw new UnprocessableEntityException("Số tiền VND không hợp lệ");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

@Injectable()
export class CounterTransferService {
  constructor(private readonly db: DatabaseService) {}

  async holders(user: AuthUser, accountId: number) {
    if (!["admin", "employee"].includes(user.role))
      throw new ForbiddenException();
    const branch = employeeBranch(user);
    const rows = await this.db.pool.query(
      `SELECT c.customerid, c.customercode, c.fullname, h.holdertype
      FROM banking.bank_account a JOIN banking.account_holder h USING(accountid) JOIN banking.customer c USING(customerid)
      WHERE a.accountid=$1 AND ($2::int IS NULL OR a.branchid=$2) AND a.accountcategory='CUSTOMER'
      AND a.status='Active' AND a.currency='VND' AND h.status='Active' AND c.status='Active'
      AND h.startdate<=CURRENT_DATE AND (h.enddate IS NULL OR h.enddate>=CURRENT_DATE)
      ORDER BY CASE h.holdertype WHEN 'PRIMARY_OWNER' THEN 0 ELSE 1 END, c.customerid`,
      [accountId, branch],
    );
    return rows.rows;
  }

  async create(user: AuthUser, dto: CounterTransferDto, ip?: string) {
    if (
      !["admin", "employee"].includes(user.role) ||
      !user.userId ||
      !user.employeeId
    )
      throw new ForbiddenException("Chỉ nhân viên được chuyển khoản tại quầy");
    const branch = employeeBranch(user);
    if (dto.customerVerified !== true)
      throw new ForbiddenException(
        "Cần xác minh yêu cầu của khách hàng tại quầy",
      );
    if (
      minorUnits(dto.amount) <= 0n ||
      dto.sourceAccountId === dto.destinationAccountId
    )
      throw new UnprocessableEntityException(
        "Số tiền phải lớn hơn 0 và hai tài khoản phải khác nhau",
      );
    const key = `counter:${user.userId}:${dto.idempotencyKey}`;
    const description = dto.description?.trim() || null;
    return this.db.transaction(
      { userId: user.userId, ipAddress: ip },
      async (client) => {
        const actor = await client.query(
          `/* counter-actor */ SELECT e.branchid, r.rolename
        FROM banking.system_user su JOIN banking.employee e USING(employeeid) JOIN banking.role r USING(roleid)
        WHERE su.userid=$1 AND e.employeeid=$2 AND su.isactive AND e.status='Active' FOR SHARE OF su,e`,
          [user.userId, user.employeeId],
        );
        const identity = actor.rows[0];
        const isAdmin =
          identity &&
          (/admin/i.test(identity.rolename) ||
            identity.rolename === "Quản trị hệ thống");
        if (
          !identity ||
          (user.role === "admin") !== !!isAdmin ||
          (branch !== null && Number(identity.branchid) !== branch)
        )
          throw new ForbiddenException(
            "Quyền hoặc chi nhánh đã thay đổi. Vui lòng đăng nhập lại",
          );
        // The core takes the same lock. Namespacing prevents collision with online transfers.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [key],
        );
        const existing = await client.query(
          `/* counter-existing */ SELECT tr.transactionid, tr.customerid, tr.sourceaccountid, tr.destinationaccountid, tr.amount, t.description, t.channel, a.branchid
        FROM banking.transfer_request tr JOIN banking.bank_transaction t USING(transactionid)
        JOIN banking.bank_account a ON a.accountid=tr.sourceaccountid WHERE tr.idempotencykey=$1`,
          [key],
        );
        const prior = existing.rows[0];
        if (prior) {
          if (branch !== null && Number(prior.branchid) !== branch)
            throw new ForbiddenException();
          if (
            Number(prior.customerid) !== dto.customerId ||
            Number(prior.sourceaccountid) !== dto.sourceAccountId ||
            Number(prior.destinationaccountid) !== dto.destinationAccountId ||
            minorUnits(String(prior.amount)) !== minorUnits(dto.amount) ||
            (prior.description || null) !== description ||
            prior.channel !== "Counter"
          )
            throw new ConflictException(
              "Mã yêu cầu đã dùng với nội dung chuyển khoản khác",
            );
          const result = await client.query(
            "SELECT banking_api.transaction_result($1) AS result",
            [prior.transactionid],
          );
          return result.rows[0].result;
        }
        const source = await client.query(
          `/* counter-source */ SELECT a.branchid FROM banking.bank_account a
        JOIN banking.account_holder h USING(accountid) JOIN banking.customer c USING(customerid)
        WHERE a.accountid=$1 AND h.customerid=$2 AND a.accountcategory='CUSTOMER' AND a.status='Active' AND a.currency='VND'
        AND h.status='Active' AND h.startdate<=CURRENT_DATE AND (h.enddate IS NULL OR h.enddate>=CURRENT_DATE) AND c.status='Active'`,
          [dto.sourceAccountId, dto.customerId],
        );
        if (
          !source.rows.length ||
          (branch !== null && Number(source.rows[0].branchid) !== branch)
        )
          throw new ForbiddenException(
            "Khách hàng hoặc tài khoản nguồn không thuộc phạm vi được cấp quyền",
          );
        // Receiving accounts may belong to another branch, but must be active customer accounts.
        const destination = await client.query(
          `/* counter-destination */ SELECT a.accountid FROM banking.bank_account a
        WHERE a.accountid=$1 AND a.status='Active' AND a.currency='VND' AND a.accountcategory='CUSTOMER'
        AND EXISTS (SELECT 1 FROM banking.account_holder h JOIN banking.customer c USING(customerid)
          WHERE h.accountid=a.accountid AND h.holdertype='PRIMARY_OWNER' AND h.status='Active' AND c.status='Active'
          AND h.startdate<=CURRENT_DATE AND (h.enddate IS NULL OR h.enddate>=CURRENT_DATE))`,
          [dto.destinationAccountId],
        );
        if (!destination.rows.length)
          throw new UnprocessableEntityException(
            "Tài khoản nhận không hợp lệ hoặc không hoạt động",
          );
        // Preserve the existing risk decision, locking, postings, status and outbox implementation.
        const result = await client.query(
          `SELECT banking_api.create_transfer($1,$2,$3,$4,$5,'Counter',NULL,$6,$7) AS result`,
          [
            dto.customerId,
            dto.sourceAccountId,
            dto.destinationAccountId,
            dto.amount,
            key,
            ip ?? null,
            description,
          ],
        );
        const transaction = result.rows[0].result;
        await client.query(
          `INSERT INTO banking.audit_log(userid,entitytype,entityid,action,newvalue,ipaddress)
        VALUES ($1,'COUNTER_TRANSFER_REQUEST',$2,'INSERT',$3::jsonb,$4)`,
          [
            user.userId,
            String(transaction.transactionid),
            JSON.stringify({
              employeeId: user.employeeId,
              customerId: dto.customerId,
              customerVerified: true,
              idempotencyKey: key,
            }),
            ip ?? null,
          ],
        );
        return transaction;
      },
    );
  }
}

@Controller("transactions/counter-transfers")
@Roles("admin", "employee")
export class CounterTransferController {
  constructor(private readonly transfers: CounterTransferService) {}
  @Get("sources/:id/holders")
  holders(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.transfers.holders(user, id);
  }
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CounterTransferDto,
    @Req() request: Request,
  ) {
    return this.transfers.create(user, dto, request.ip);
  }
}
