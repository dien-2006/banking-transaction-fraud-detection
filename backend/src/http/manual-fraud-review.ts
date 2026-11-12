import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../security/auth.guard';

export class ManualFraudReviewDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 40, { message: 'Vui lòng nhập mã giao dịch, tối đa 40 ký tự.' })
  transactionCode!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 255, { message: 'Vui lòng nhập lý do, tối đa 255 ký tự.' })
  reason!: string;
}

export async function createManualFraudReview(db: DatabaseService, user: AuthUser, input: ManualFraudReviewDto) {
  if (user.role !== 'admin' || !user.userId)
    throw new ForbiddenException('Chỉ quản trị viên được tạo cảnh báo thủ công.');
  return db.transaction({ userId: user.userId }, async (client) => {
    // Serialize creation with financial processing; never change the financial state.
    const transaction = (await client.query(
      'SELECT transactionid, status FROM banking.bank_transaction WHERE transactioncode=$1 FOR UPDATE',
      [input.transactionCode],
    )).rows[0];
    if (!transaction) throw new NotFoundException('Không tìm thấy giao dịch với mã đã nhập.');
    // A repeated request returns its case, including after that case was resolved.
    const existing = (await client.query(
      'SELECT reviewcaseid, status FROM banking.review_case WHERE transactionid=$1 ORDER BY reviewcaseid DESC LIMIT 1',
      [transaction.transactionid],
    )).rows[0];
    if (existing) return { reviewId: String(existing.reviewcaseid), status: existing.status, reused: true };
    const risk = (await client.query(
      'SELECT decision FROM banking.risk_assessment WHERE transactionid=$1 ORDER BY assessedat DESC, riskassessmentid DESC LIMIT 1 FOR SHARE',
      [transaction.transactionid],
    )).rows[0];
    if (transaction.status !== 'Pending' || risk?.decision !== 'REVIEW')
      throw new BadRequestException('Chỉ tạo hồ sơ cho giao dịch đang chờ xử lý với quyết định REVIEW. Không thể đưa giao dịch đã hoàn tất, ALLOW hoặc BLOCK vào duyệt lại.');
    const review = (await client.query(
      "INSERT INTO banking.review_case(transactionid,status,reason) VALUES ($1,'OPEN',$2) RETURNING reviewcaseid,status",
      [transaction.transactionid, input.reason],
    )).rows[0];
    // trg_audit_review records the actor and complete case atomically.
    return { reviewId: String(review.reviewcaseid), status: review.status, reused: false };
  });
}
