import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsString, IsUUID, Length, Matches, MaxLength, ValidateBy } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegistrationEmailDto {
  @Transform(lower) @IsEmail({}, { message: 'Email không hợp lệ.' }) @MaxLength(150)
  email!: string;
}

export class RegistrationDto extends RegistrationEmailDto {
  @Transform(trim) @IsString() @Length(1, 150, { message: 'Họ tên phải từ 1 đến 150 ký tự.' })
  name!: string;
  @Transform(trim) @Matches(/^\+?[0-9]{9,15}$/, { message: 'Điện thoại phải gồm 9–15 chữ số, có thể bắt đầu bằng +.' })
  phone!: string;
  @Transform(lower) @Matches(/^[a-z0-9][a-z0-9._-]{2,49}$/, { message: 'Tên đăng nhập gồm 3–50 ký tự: chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.' })
  username!: string;
  @IsString() @Length(8, 72, { message: 'Mật khẩu phải có ít nhất 8 ký tự.' })
  @ValidateBy({ name: 'bcryptByteLimit', validator: {
    validate: (v: unknown) => typeof v === 'string' && Buffer.byteLength(v, 'utf8') <= 72,
    defaultMessage: () => 'Mật khẩu không được vượt quá 72 byte UTF-8.',
  } })
  password!: string;
  @IsUUID() challengeId!: string;
  @Matches(/^\d{6}$/, { message: 'OTP phải gồm 6 chữ số.' }) code!: string;
  @IsBoolean() @Equals(true, { message: 'Vui lòng xác nhận thông tin đăng ký.' }) acceptedTerms!: boolean;
}
