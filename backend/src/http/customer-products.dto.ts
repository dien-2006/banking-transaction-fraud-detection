import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { customerCardTypes } from './customer-card-policy';

export class ProductRequestDto {
  @IsUUID() requestKey!: string;
}
export class CustomerAccountDto extends ProductRequestDto {
  @IsInt() @IsPositive() branchId!: number;
  @IsInt() @IsPositive() accountTypeId!: number;
}
export class CustomerCardDto extends ProductRequestDto {
  @IsInt() @IsPositive() accountId!: number;
  @IsOptional() @IsIn(customerCardTypes.map(type=>type.value), {message:'Vui lòng chọn loại thẻ ghi nợ được hỗ trợ.'}) cardType?: string;
  @Matches(/^[0-9]{4,6}$/, {message:'PIN phải gồm 4 đến 6 chữ số.'}) pin!: string;
}
export class CustomerLoanDto extends ProductRequestDto {
  @IsInt() @IsPositive() branchId!: number;
  @IsInt() @IsPositive() loanTypeId!: number;
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/, {message:'Số tiền vay không hợp lệ.'}) principal!: string;
  @IsInt() @IsPositive() termMonths!: number;
}
export class LoanApprovalDto {
  @IsString() @Length(3,255) @MaxLength(255) reason!: string;
}
export class LoanDecisionDto extends LoanApprovalDto {
  @IsIn(['APPROVE','REJECT']) decision!: 'APPROVE'|'REJECT';
}
