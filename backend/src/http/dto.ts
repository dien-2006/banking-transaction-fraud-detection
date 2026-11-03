import {
  Equals,
  IsBoolean,
  IsUUID,
  Matches,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class LoginDto {
  @IsString() username!: string;
  @IsString() password!: string;
  @IsOptional() @IsIn(["customer", "employee", "admin"]) role?: string;
  @IsOptional() @IsString() deviceCode?: string;
}
export class TransferDto {
  @IsInt() @IsPositive() sourceAccountId!: number;
  @IsInt() @IsPositive() destinationAccountId!: number;
  @IsString() @Matches(/^\d{1,17}(?:\.\d{1,2})?$/) amount!: string;
  @IsString() @Length(1, 100) idempotencyKey!: string;
  @IsIn(["MobileBanking", "InternetBanking"]) channel!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsString() @Length(20, 200) otpAuthorizationToken!: string;
}
export class TransferOtpRequestDto {
  @IsInt() @IsPositive() sourceAccountId!: number;
  @IsInt() @IsPositive() destinationAccountId!: number;
  @IsString() @Matches(/^\d{1,17}(?:\.\d{1,2})?$/) amount!: string;
  @IsString() @Length(1, 100) idempotencyKey!: string;
  @IsIn(["MobileBanking", "InternetBanking"]) channel!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}
export class TransferOtpVerifyDto extends TransferOtpRequestDto {
  @IsString() @Length(20, 100) challengeId!: string;
  @IsString() @Length(6, 6) code!: string;
}
export class ReviewDto {
  @IsIn(["APPROVE", "REJECT"]) action!: string;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}
export class MovementDto {
  @IsIn(["DEPOSIT", "WITHDRAWAL", "OPENING_BALANCE"]) type!: string;
  @IsInt() @IsPositive() debitAccountId!: number;
  @IsInt() @IsPositive() creditAccountId!: number;
  @IsString() @Matches(/^\d{1,17}(?:\.\d{1,2})?$/) amount!: string;
  @IsString() @Length(1, 40) transactionCode!: string;
  @IsIn(["Counter", "ATM", "MobileBanking", "InternetBanking", "System"])
  channel!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}
export class LoanPaymentDto {
  @IsInt() @IsPositive() loanId!: number;
  @IsInt() @IsPositive() scheduleId!: number;
  @IsInt() @IsPositive() sourceAccountId!: number;
  @IsString() @Matches(/^\d{1,17}(?:\.\d{1,2})?$/) amount!: string;
  @IsString() @Length(1, 40) transactionCode!: string;
}
export class ReversalDto {
  @IsString() @Length(1, 40) transactionCode!: string;
  @IsString() @Length(1, 255) reason!: string;
}

export class CounterTransferDto {
  @IsInt() @IsPositive() customerId!: number;
  @IsInt() @IsPositive() sourceAccountId!: number;
  @IsInt() @IsPositive() destinationAccountId!: number;
  @IsString() @Matches(/^\d{1,17}(?:\.\d{1,2})?$/) amount!: string;
  @IsUUID() idempotencyKey!: string;
  @IsBoolean() @Equals(true) customerVerified!: boolean;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}
