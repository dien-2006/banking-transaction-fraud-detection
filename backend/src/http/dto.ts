import { IsIn, IsInt, IsNumberString, IsOptional, IsPositive, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString() username!: string;
  @IsString() password!: string;
  @IsIn(['customer', 'employee', 'admin']) role!: string;
  @IsOptional() @IsString() deviceCode?: string;
}
export class TransferDto {
  @IsInt() @IsPositive() sourceAccountId!: number;
  @IsInt() @IsPositive() destinationAccountId!: number;
  @IsNumberString() amount!: string;
  @IsString() @Length(1, 100) idempotencyKey!: string;
  @IsIn(['Counter', 'ATM', 'POS', 'MobileBanking', 'InternetBanking', 'System']) channel!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsString() @Length(20, 200) otpAuthorizationToken!: string;
}
export class TransferOtpRequestDto {
  @IsInt() @IsPositive() sourceAccountId!: number;
  @IsInt() @IsPositive() destinationAccountId!: number;
  @IsNumberString() amount!: string;
  @IsString() @Length(1, 100) idempotencyKey!: string;
  @IsIn(['MobileBanking','InternetBanking']) channel!: string;
}
export class TransferOtpVerifyDto extends TransferOtpRequestDto {
  @IsString() @Length(20, 100) challengeId!: string;
  @IsString() @Length(6, 6) code!: string;
}
export class ReviewDto {
  @IsIn(['APPROVE', 'REJECT']) action!: string;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}
export class MovementDto {
  @IsIn(['DEPOSIT', 'WITHDRAWAL', 'OPENING_BALANCE']) type!: string;
  @IsInt() @IsPositive() debitAccountId!: number;
  @IsInt() @IsPositive() creditAccountId!: number;
  @IsNumberString() amount!: string;
  @IsString() @Length(1, 40) transactionCode!: string;
  @IsIn(['Counter', 'ATM', 'MobileBanking', 'InternetBanking', 'System']) channel!: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}
export class LoanPaymentDto {
  @IsInt() @IsPositive() loanId!: number;
  @IsInt() @IsPositive() scheduleId!: number;
  @IsInt() @IsPositive() sourceAccountId!: number;
  @IsInt() @IsPositive() internalCreditAccountId!: number;
  @IsNumberString() amount!: string;
  @IsString() @Length(1, 40) transactionCode!: string;
}
export class ReversalDto {
  @IsString() @Length(1, 40) transactionCode!: string;
  @IsString() @Length(1, 255) reason!: string;
}
