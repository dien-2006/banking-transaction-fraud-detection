import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

interface PgError extends Error { code?: string; constraint?: string; table?: string; column?: string }

const creationConflicts: Record<string, { code: string; field: string; message: string }> = {
  employee_employeecode_key: { code: 'EMPLOYEE_CODE_EXISTS', field: 'code', message: 'Mã nhân viên bị trùng. Vui lòng kiểm tra danh sách trước khi thử lại.' },
  employee_phone_key: { code: 'EMPLOYEE_PHONE_EXISTS', field: 'phone', message: 'Số điện thoại đã được sử dụng cho nhân viên khác.' },
  employee_email_key: { code: 'EMPLOYEE_EMAIL_EXISTS', field: 'email', message: 'Email đã được sử dụng cho nhân viên khác.' },
  fk_employee_branch: { code: 'BRANCH_NOT_FOUND', field: 'branchId', message: 'Chi nhánh không còn tồn tại. Vui lòng chọn lại.' },
  fk_employee_role: { code: 'ROLE_NOT_FOUND', field: 'roleId', message: 'Vai trò không còn tồn tại. Vui lòng chọn lại.' },
  branch_branchcode_key: { code: 'BRANCH_CODE_EXISTS', field: 'code', message: 'Mã chi nhánh bị trùng. Vui lòng kiểm tra danh sách trước khi thử lại.' },
  card_cardnumber_key: { code: 'CARD_NUMBER_EXISTS', field: 'cardNumber', message: 'Chưa cấp được số thẻ do trùng số. Vui lòng kiểm tra danh sách trước khi thử lại.' },
  loan_loancode_key: { code: 'LOAN_CODE_EXISTS', field: 'code', message: 'Chưa cấp được mã khoản vay do trùng mã. Vui lòng kiểm tra danh sách trước khi thử lại.' },
  fk_card_account: { code: 'ACCOUNT_NOT_FOUND', field: 'accountId', message: 'Tài khoản liên kết không còn tồn tại. Vui lòng chọn lại.' },
  fk_card_customer: { code: 'CUSTOMER_NOT_FOUND', field: 'customerId', message: 'Khách hàng không còn tồn tại. Vui lòng chọn lại hồ sơ đã có.' },
  fk_loan_customer: { code: 'CUSTOMER_NOT_FOUND', field: 'customerId', message: 'Khách hàng vay không còn tồn tại. Vui lòng chọn lại.' },
  fk_loan_type: { code: 'LOAN_PRODUCT_NOT_FOUND', field: 'loanTypeId', message: 'Sản phẩm vay không còn tồn tại. Vui lòng tải lại danh mục.' },
  customer_nationalid_key: { code: 'CUSTOMER_IDENTITY_EXISTS', field: 'nationalId', message: 'CCCD / giấy tờ định danh đã được sử dụng. Vui lòng kiểm tra hồ sơ khách hàng đã có.' },
  customer_customercode_key: { code: 'CUSTOMER_CODE_EXISTS', field: 'code', message: 'Mã khách hàng bị trùng. Vui lòng tải lại danh sách và thử tạo lại.' },
  bank_account_accountnumber_key: { code: 'ACCOUNT_NUMBER_EXISTS', field: 'accountNumber', message: 'Số tài khoản đã tồn tại. Hệ thống chưa cấp được số mới; vui lòng kiểm tra danh sách và thử lại.' },
  fk_holder_customer: { code: 'CUSTOMER_NOT_FOUND', field: 'customerId', message: 'Khách hàng đã chọn không còn tồn tại. Vui lòng tải lại và chọn khách hàng khác.' },
  fk_bank_account_branch: { code: 'BRANCH_NOT_FOUND', field: 'branchId', message: 'Chi nhánh đã chọn không còn tồn tại. Vui lòng tải lại danh mục chi nhánh.' },
  fk_bank_account_type: { code: 'ACCOUNT_TYPE_NOT_FOUND', field: 'accountTypeId', message: 'Loại tài khoản đã chọn không còn tồn tại. Vui lòng tải lại danh mục loại tài khoản.' },
};

@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  catch(error: PgError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (error.code === '23502' && error.table === 'branch' && error.column === 'branchcode') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'CONFIGURATION', message: 'Chức năng cấp mã chi nhánh chưa được cấu hình. Vui lòng liên hệ quản trị viên.' });
      return;
    }
    if (error.code === '23502' && error.table === 'employee' && error.column === 'employeecode') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'CONFIGURATION', message: 'Chức năng cấp mã nhân viên chưa được cấu hình. Vui lòng liên hệ quản trị viên.' });
      return;
    }
    const conflict = error.constraint && creationConflicts[error.constraint];
    if (conflict && (error.code === '23505' || error.code === '23503')) {
      response.status(HttpStatus.CONFLICT).json({ statusCode: HttpStatus.CONFLICT, ...conflict });
      return;
    }
    const marker = error.message?.match(/(AUTH_INVALID|AUTH_BLOCKED|FORBIDDEN|NOT_FOUND|CONFLICT|VALIDATION|ACCOUNT_INACTIVE|CONFIGURATION|INTEGRITY|IMMUTABLE):([^\n]+)/);
    if (!marker && !error.code?.startsWith('23')) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({statusCode:HttpStatus.INTERNAL_SERVER_ERROR,code:'INTERNAL_ERROR',message:'Internal server error'});
      return;
    }
    const code = marker?.[1] ?? 'INTEGRITY';
    const status = ({
      AUTH_INVALID: HttpStatus.UNAUTHORIZED,
      AUTH_BLOCKED: HttpStatus.FORBIDDEN,
      FORBIDDEN: HttpStatus.FORBIDDEN,
      NOT_FOUND: HttpStatus.NOT_FOUND,
      CONFLICT: HttpStatus.CONFLICT,
      VALIDATION: HttpStatus.UNPROCESSABLE_ENTITY,
      ACCOUNT_INACTIVE: HttpStatus.UNPROCESSABLE_ENTITY,
      CONFIGURATION: HttpStatus.SERVICE_UNAVAILABLE,
      INTEGRITY: HttpStatus.CONFLICT,
      IMMUTABLE: HttpStatus.CONFLICT,
    } as Record<string, number>)[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({ statusCode: status, code,
      message: code === 'IMMUTABLE'
        ? 'Giao dịch đã hoàn tất, không thể thay đổi hoặc xử lý lại. Vui lòng sử dụng nghiệp vụ hoàn/đảo giao dịch nếu cần.'
        : marker?.[2]?.trim() ?? 'Database integrity constraint rejected the request' });
  }
}
