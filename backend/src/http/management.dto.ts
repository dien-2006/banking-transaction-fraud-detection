import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumberString, IsOptional, IsPositive, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class BranchCreateDto { @IsString() @MaxLength(20) code!:string; @IsString() @MaxLength(150) name!:string; @IsString() @MaxLength(255) address!:string; @IsString() @MaxLength(100) city!:string; @IsString() @MaxLength(20) phone!:string; @IsDateString() openDate!:string; }
export class BranchUpdateDto { @IsString() @MaxLength(150) name!:string; @IsString() @MaxLength(255) address!:string; @IsString() @MaxLength(100) city!:string; @IsString() @MaxLength(20) phone!:string; }
export class StatusDto { @IsString() status!:string; @IsOptional() @IsString() @MaxLength(255) reason?:string; }

export class CustomerCreateDto { @IsString() @MaxLength(20) code!:string; @IsString() @MaxLength(150) name!:string; @IsIn(['Male','Female','Other']) gender!:string; @IsDateString() birthDate!:string; @IsString() @MaxLength(30) nationalId!:string; @IsString() @MaxLength(20) phone!:string; @IsEmail() email!:string; @IsString() @MaxLength(255) address!:string; @IsString() @MaxLength(100) occupation!:string; @IsString() @MaxLength(30) customerType!:string; @IsString() @MaxLength(30) segment!:string; }
export class CustomerUpdateDto { @IsString() @MaxLength(150) name!:string; @IsString() @MaxLength(20) phone!:string; @IsEmail() email!:string; @IsString() @MaxLength(255) address!:string; @IsString() @MaxLength(100) occupation!:string; @IsString() @MaxLength(30) customerType!:string; @IsString() @MaxLength(30) segment!:string; }

export class EmployeeCreateDto { @IsString() @MaxLength(20) code!:string; @IsInt() @IsPositive() branchId!:number; @IsInt() @IsPositive() roleId!:number; @IsString() @MaxLength(150) name!:string; @IsIn(['Male','Female','Other']) gender!:string; @IsDateString() birthDate!:string; @IsString() @MaxLength(20) phone!:string; @IsEmail() email!:string; @IsDateString() hireDate!:string; @IsNumberString() salary!:string; }
export class EmployeeUpdateDto { @IsInt() @IsPositive() branchId!:number; @IsInt() @IsPositive() roleId!:number; @IsString() @MaxLength(150) name!:string; @IsString() @MaxLength(20) phone!:string; @IsEmail() email!:string; @IsNumberString() salary!:string; }
export class RegisterLoginDto { @IsString() @Length(3,100) username!:string; @IsString() @MinLength(8) password!:string; }

export class AccountOpenDto { @IsString() @MaxLength(30) accountNumber!:string; @IsInt() @IsPositive() branchId!:number; @IsInt() @IsPositive() accountTypeId!:number; @IsOptional() @IsInt() @IsPositive() customerId?:number; @IsOptional() @IsIn(['CUSTOMER','INTERNAL']) category?:string; }
export class CardIssueDto { @IsString() @MaxLength(30) cardNumber!:string; @IsInt() @IsPositive() accountId!:number; @IsInt() @IsPositive() customerId!:number; @IsDateString() issueDate!:string; @IsDateString() expiryDate!:string; @IsString() @MaxLength(30) cardType!:string; @IsString() @Length(4,6) pin!:string; @IsNumberString() dailyLimit!:string; }
export class LimitDto { @IsNumberString() limit!:string; }

export class LoanCreateDto { @IsString() @MaxLength(30) code!:string; @IsInt() @IsPositive() customerId!:number; @IsInt() @IsPositive() branchId!:number; @IsInt() @IsPositive() loanTypeId!:number; @IsNumberString() principal!:string; @IsNumberString() interestRate!:string; @IsInt() @IsPositive() termMonths!:number; @IsDateString() startDate!:string; }
export class FraudLabelDto { @IsIn(['FRAUD','LEGITIMATE','UNKNOWN']) label!:string; @IsOptional() @IsString() @MaxLength(50) source?:string; @IsOptional() @IsString() @MaxLength(255) note?:string; }

export class PasswordChangeDto { @IsString() oldPassword!:string; @IsString() @MinLength(8) newPassword!:string; }
export class PinChangeDto { @IsString() @Length(4,6) oldPin!:string; @IsString() @Length(4,6) newPin!:string; }
export class DeviceStatusDto { @IsIn(['Active','Blocked','Removed']) status!:string; @IsOptional() @IsBoolean() trusted?:boolean; }
export class DeviceRegisterDto { @IsString() @Length(8,100) deviceCode!:string; @IsIn(['Mobile','Tablet','Desktop','Other']) deviceType!:string; @IsString() @MaxLength(100) deviceName!:string; @IsString() @MaxLength(80) operatingSystem!:string; }
