import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumberString, IsOptional, IsPositive, IsString, Length, MaxLength, MinLength, Matches, ValidateBy } from 'class-validator';
import { Transform } from 'class-transformer';

export class BranchCreateDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() || undefined : value ?? undefined)
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Vui lòng nhập tên chi nhánh.' }) @MinLength(1, { message: 'Vui lòng nhập tên chi nhánh.' })
  @MaxLength(150, { message: 'Tên chi nhánh không được vượt quá 150 ký tự.' }) name!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Vui lòng nhập địa chỉ chi nhánh.' }) @MinLength(1, { message: 'Vui lòng nhập địa chỉ chi nhánh.' })
  @MaxLength(255, { message: 'Địa chỉ không được vượt quá 255 ký tự.' }) address!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Vui lòng nhập tỉnh/thành phố.' }) @MinLength(1, { message: 'Vui lòng nhập tỉnh/thành phố.' })
  @MaxLength(100, { message: 'Tỉnh/thành phố không được vượt quá 100 ký tự.' }) city!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() || undefined : value ?? undefined)
  @IsOptional() @IsString() @MaxLength(20, { message: 'Số điện thoại không được vượt quá 20 ký tự.' })
  @Matches(/^\+?[0-9][0-9 ().-]{5,19}$/, { message: 'Số điện thoại liên hệ không đúng định dạng.' }) phone?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Vui lòng chọn ngày bắt đầu hoạt động hợp lệ.' })
  @IsDateString({ strict: true }, { message: 'Ngày bắt đầu hoạt động không hợp lệ.' }) openDate!: string;
}
export class BranchUpdateDto { @IsString() @MaxLength(150) name!:string; @IsString() @MaxLength(255) address!:string; @IsString() @MaxLength(100) city!:string; @IsString() @MaxLength(20) phone!:string; }
export class StatusDto { @IsString() status!:string; @IsOptional() @IsString() @MaxLength(255) reason?:string; }

const optionalCustomerText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value ?? undefined;
const notFutureBirthDate = ValidateBy({
  name: 'notFutureBirthDate',
  validator: {
    validate: (value: unknown) => typeof value === 'string'
      && value <= new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10),
    defaultMessage: () => 'Ngày sinh không được ở tương lai.',
  },
});

export class CustomerCreateDto {
  @Transform(optionalCustomerText) @IsOptional() @IsString() @MaxLength(20)
  code?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Vui lòng nhập họ tên.' }) @MinLength(1, { message: 'Vui lòng nhập họ tên.' }) @MaxLength(150, { message: 'Họ tên không được vượt quá 150 ký tự.' })
  name!: string;
  @Transform(optionalCustomerText) @IsOptional() @IsIn(['Male','Female','Other','Unknown'], { message: 'Giới tính không hợp lệ. Vui lòng chọn lại.' })
  gender?: string;
  @Transform(optionalCustomerText) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày sinh phải có định dạng YYYY-MM-DD.' })
  @IsDateString({ strict: true }, { message: 'Ngày sinh không hợp lệ.' }) @notFutureBirthDate
  birthDate?: string;
  @Transform(optionalCustomerText) @IsOptional() @IsString({ message: 'Giấy tờ định danh phải là chuỗi ký tự.' }) @MaxLength(30, { message: 'CCCD / giấy tờ định danh không được vượt quá 30 ký tự.' })
  nationalId?: string;
  @Transform(optionalCustomerText) @IsOptional() @IsString({ message: 'Số điện thoại không đúng định dạng.' }) @MaxLength(20, { message: 'Số điện thoại không được vượt quá 20 ký tự.' })
  @Matches(/^\+?[0-9][0-9 ().-]{5,19}$/, { message: 'Số điện thoại không đúng định dạng.' })
  phone?: string;
  @Transform(optionalCustomerText) @IsOptional() @IsEmail({}, { message: 'Email không đúng định dạng. Ví dụ: ten@example.com.' }) @MaxLength(150, { message: 'Email không được vượt quá 150 ký tự.' })
  email?: string;
  @Transform(optionalCustomerText) @IsOptional() @IsString({ message: 'Địa chỉ phải là chuỗi ký tự.' }) @MaxLength(255, { message: 'Địa chỉ không được vượt quá 255 ký tự.' })
  address?: string;
  @Transform(optionalCustomerText) @IsOptional() @IsString({ message: 'Nghề nghiệp phải là chuỗi ký tự.' }) @MaxLength(100, { message: 'Nghề nghiệp không được vượt quá 100 ký tự.' })
  occupation?: string;
  @Transform(optionalCustomerText) @IsOptional() @IsString({ message: 'Loại khách hàng phải là chuỗi ký tự.' }) @MaxLength(30, { message: 'Loại khách hàng không được vượt quá 30 ký tự.' })
  customerType?: string;
  @Transform(optionalCustomerText) @IsOptional() @IsString({ message: 'Phân khúc phải là chuỗi ký tự.' }) @MaxLength(30, { message: 'Phân khúc không được vượt quá 30 ký tự.' })
  segment?: string;
}
export class CustomerUpdateDto { @IsString() @MaxLength(150) name!:string; @IsString() @MaxLength(20) phone!:string; @IsEmail() email!:string; @IsString() @MaxLength(255) address!:string; @IsString() @MaxLength(100) occupation!:string; @IsString() @MaxLength(30) customerType!:string; @IsString() @MaxLength(30) segment!:string; }

export class EmployeeCreateDto {
  @Transform(optionalCustomerText) @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsInt({ message: 'Vui lòng chọn chi nhánh.' }) @IsPositive({ message: 'Vui lòng chọn chi nhánh.' }) branchId!: number;
  @IsInt({ message: 'Vui lòng chọn vai trò.' }) @IsPositive({ message: 'Vui lòng chọn vai trò.' }) roleId!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Vui lòng nhập họ tên nhân viên.' }) @MinLength(1, { message: 'Vui lòng nhập họ tên nhân viên.' })
  @MaxLength(150, { message: 'Họ tên không được vượt quá 150 ký tự.' }) name!: string;
  @Transform(optionalCustomerText) @IsOptional()
  @IsIn(['Male','Female','Other','Unknown'], { message: 'Giới tính không hợp lệ.' }) gender?: string;
  @Transform(optionalCustomerText) @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày sinh phải có định dạng YYYY-MM-DD.' })
  @IsDateString({ strict: true }, { message: 'Ngày sinh không hợp lệ.' }) @notFutureBirthDate birthDate?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Vui lòng nhập số điện thoại.' }) @MaxLength(20, { message: 'Số điện thoại tối đa 20 ký tự.' })
  @Matches(/^\+?[0-9][0-9 ().-]{5,19}$/, { message: 'Số điện thoại không đúng định dạng.' }) phone!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'Vui lòng nhập email hợp lệ.' }) @MaxLength(150, { message: 'Email tối đa 150 ký tự.' }) email!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Vui lòng chọn ngày vào làm hợp lệ.' })
  @IsDateString({ strict: true }, { message: 'Ngày vào làm không hợp lệ.' })
  @ValidateBy({ name: 'hireAfterBirth', validator: {
    validate: (value: unknown, args) => {
      const birth = (args?.object as { birthDate?: string })?.birthDate;
      return !birth || (typeof value === 'string' && value >= birth);
    }, defaultMessage: () => 'Ngày vào làm không được trước ngày sinh.',
  } }) hireDate!: string;
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/, { message: 'Lương phải từ 0 trở lên, tối đa 17 chữ số nguyên và 2 chữ số thập phân.' }) salary!: string;
}
export class EmployeeUpdateDto { @IsInt() @IsPositive() branchId!:number; @IsInt() @IsPositive() roleId!:number; @IsString() @MaxLength(150) name!:string; @IsString() @MaxLength(20) phone!:string; @IsEmail() email!:string; @IsNumberString() salary!:string; }
export class RegisterLoginDto { @IsString() @Length(3,100) username!:string; @IsString() @MinLength(8) password!:string; }

export class AccountOpenDto {
  @Transform(optionalCustomerText) @IsOptional()
  @IsString({ message: 'Số tài khoản không hợp lệ.' })
  @MaxLength(30, { message: 'Số tài khoản không được vượt quá 30 ký tự.' }) accountNumber?: string;
  @IsInt({ message: 'Vui lòng chọn chi nhánh hợp lệ.' }) @IsPositive({ message: 'Vui lòng chọn chi nhánh hợp lệ.' }) branchId!: number;
  @IsInt({ message: 'Vui lòng chọn loại tài khoản hợp lệ.' }) @IsPositive({ message: 'Vui lòng chọn loại tài khoản hợp lệ.' }) accountTypeId!: number;
  @IsInt({ message: 'Vui lòng chọn khách hàng đã có hồ sơ.' }) @IsPositive({ message: 'Vui lòng chọn khách hàng đã có hồ sơ.' }) customerId!: number;
  @IsOptional() @IsIn(['CUSTOMER'], { message: 'Chỉ hỗ trợ mở tài khoản cho khách hàng.' }) category?: string;
}
const positiveMoney = ValidateBy({ name: 'positiveMoney', validator: {
  validate: (value: unknown) => typeof value === 'string' && /^\d{1,17}(?:\.\d{1,2})?$/.test(value)
    && BigInt(value.replace('.', '')) > 0n,
  defaultMessage: () => 'Số tiền phải lớn hơn 0, tối đa 17 chữ số nguyên và 2 chữ số thập phân.',
} });
export class CardIssueDto {
  @Transform(optionalCustomerText) @IsOptional() @IsString() @MaxLength(30) cardNumber?: string;
  @IsInt({message:'Vui lòng chọn tài khoản.'}) @IsPositive({message:'Vui lòng chọn tài khoản.'}) accountId!: number;
  @IsInt({message:'Vui lòng chọn khách hàng.'}) @IsPositive({message:'Vui lòng chọn khách hàng.'}) customerId!: number;
  @IsOptional() @IsDateString({strict:true},{message:'Ngày phát hành không hợp lệ.'}) issueDate?: string;
  @IsDateString({strict:true},{message:'Vui lòng chọn ngày hết hạn hợp lệ.'}) expiryDate!: string;
  @Transform(({value})=>typeof value==='string'?value.trim():value)
  @IsString() @MinLength(1,{message:'Vui lòng chọn hoặc nhập loại thẻ.'}) @MaxLength(30,{message:'Loại thẻ tối đa 30 ký tự.'}) cardType!: string;
  @Matches(/^[0-9]{4,6}$/, {message:'PIN phải gồm 4 đến 6 chữ số.'}) pin!: string;
  @positiveMoney dailyLimit!: string;
}
export class LimitDto { @IsNumberString() limit!:string; }

export class LoanCreateDto {
  @Transform(optionalCustomerText) @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsInt({message:'Vui lòng chọn khách hàng vay.'}) @IsPositive({message:'Vui lòng chọn khách hàng vay.'}) customerId!: number;
  @IsInt({message:'Vui lòng chọn chi nhánh.'}) @IsPositive({message:'Vui lòng chọn chi nhánh.'}) branchId!: number;
  @IsInt({message:'Vui lòng chọn sản phẩm vay.'}) @IsPositive({message:'Vui lòng chọn sản phẩm vay.'}) loanTypeId!: number;
  @positiveMoney principal!: string;
  @Matches(/^\d{1,4}(?:\.\d{1,4})?$/, {message:'Lãi suất phải từ 0 đến 9999,9999 và có tối đa 4 chữ số thập phân.'}) interestRate!: string;
  @IsInt({message:'Kỳ hạn phải là số tháng nguyên.'}) @IsPositive({message:'Kỳ hạn phải lớn hơn 0.'}) termMonths!: number;
  @IsDateString({strict:true},{message:'Ngày bắt đầu không hợp lệ.'}) startDate!: string;
}
export class FraudLabelDto { @IsIn(['FRAUD','LEGITIMATE','UNKNOWN']) label!:string; @IsOptional() @IsString() @MaxLength(50) source?:string; @IsOptional() @IsString() @MaxLength(255) note?:string; }

export class PasswordChangeDto { @IsString() oldPassword!:string; @IsString() @MinLength(8) newPassword!:string; }
export class PinChangeDto { @IsString() @Length(4,6) oldPin!:string; @IsString() @Length(4,6) newPin!:string; }
export class DeviceStatusDto { @IsIn(['Active','Blocked','Removed']) status!:string; @IsOptional() @IsBoolean() trusted?:boolean; }
export class DeviceRegisterDto { @IsString() @Length(8,100) deviceCode!:string; @IsIn(['Mobile','Tablet','Desktop','Other']) deviceType!:string; @IsString() @MaxLength(100) deviceName!:string; @IsString() @MaxLength(80) operatingSystem!:string; }
