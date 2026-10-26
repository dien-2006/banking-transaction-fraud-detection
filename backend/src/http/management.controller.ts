import { Body, Controller, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../security/auth.guard';
import { CurrentUser, Roles } from '../security/decorators';
import { AccountOpenDto, BranchCreateDto, BranchUpdateDto, CardIssueDto, CustomerCreateDto, CustomerUpdateDto, DeviceStatusDto, EmployeeCreateDto, EmployeeUpdateDto, FraudLabelDto, LimitDto, LoanCreateDto, RegisterLoginDto, StatusDto } from './management.dto';

@Controller('management')
@Roles('admin','employee')
export class ManagementController {
  constructor(private readonly db:DatabaseService){}
  private context(user:AuthUser,req:Request){return {userId:user.userId,ipAddress:req.ip};}

  @Post('branches') @Roles('admin') createBranch(@Body()d:BranchCreateDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.create_branch',[d.code,d.name,d.address,d.city,d.phone,d.openDate],this.context(u,r));}
  @Patch('branches/:id') @Roles('admin') updateBranch(@Param('id',ParseIntPipe)id:number,@Body()d:BranchUpdateDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.update_branch',[id,d.name,d.address,d.city,d.phone],this.context(u,r));}
  @Patch('branches/:id/status') @Roles('admin') branchStatus(@Param('id',ParseIntPipe)id:number,@Body()d:StatusDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.change_branch_status',[id,d.status],this.context(u,r));}

  @Post('customers') createCustomer(@Body()d:CustomerCreateDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.create_customer',[d.code,d.name,d.gender,d.birthDate,d.nationalId,d.phone,d.email,d.address,d.occupation,d.customerType,d.segment],this.context(u,r));}
  @Patch('customers/:id') updateCustomer(@Param('id',ParseIntPipe)id:number,@Body()d:CustomerUpdateDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.update_customer',[id,d.name,d.phone,d.email,d.address,d.occupation,d.customerType,d.segment],this.context(u,r));}
  @Patch('customers/:id/status') customerStatus(@Param('id',ParseIntPipe)id:number,@Body()d:StatusDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.change_customer_status',[id,d.status],this.context(u,r));}
  @Post('customers/:id/login') registerCustomer(@Param('id',ParseIntPipe)id:number,@Body()d:RegisterLoginDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.register_customer_online_account',[id,d.username,d.password],this.context(u,r));}
  @Patch('customers/:customerId/devices/:deviceId') deviceStatus(@Param('customerId',ParseIntPipe)customerId:number,@Param('deviceId',ParseIntPipe)deviceId:number,@Body()d:DeviceStatusDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.change_device_status',[customerId,deviceId,d.status,d.trusted??null],this.context(u,r));}

  @Post('employees') @Roles('admin') createEmployee(@Body()d:EmployeeCreateDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.create_employee',[d.code,d.branchId,d.roleId,d.name,d.gender,d.birthDate,d.phone,d.email,d.hireDate,d.salary],this.context(u,r));}
  @Patch('employees/:id') @Roles('admin') updateEmployee(@Param('id',ParseIntPipe)id:number,@Body()d:EmployeeUpdateDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.update_employee',[id,d.branchId,d.roleId,d.name,d.phone,d.email,d.salary],this.context(u,r));}
  @Patch('employees/:id/status') @Roles('admin') employeeStatus(@Param('id',ParseIntPipe)id:number,@Body()d:StatusDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.change_employee_status',[id,d.status],this.context(u,r));}
  @Post('employees/:id/login') @Roles('admin') registerEmployee(@Param('id',ParseIntPipe)id:number,@Body()d:RegisterLoginDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.register_system_user',[id,d.username,d.password],this.context(u,r));}

  @Post('accounts') openAccount(@Body()d:AccountOpenDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.open_account',[d.accountNumber,d.branchId,d.accountTypeId,d.customerId??null,d.category??'CUSTOMER'],this.context(u,r));}
  @Patch('accounts/:id/status') accountStatus(@Param('id',ParseIntPipe)id:number,@Body()d:StatusDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.change_account_status',[id,d.status,d.reason??''],this.context(u,r));}
  @Post('cards') issueCard(@Body()d:CardIssueDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.issue_card',[d.cardNumber,d.accountId,d.customerId,d.issueDate,d.expiryDate,d.cardType,d.pin,d.dailyLimit],this.context(u,r));}
  @Patch('cards/:id/status') cardStatus(@Param('id',ParseIntPipe)id:number,@Body()d:StatusDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.change_card_status',[id,d.status],this.context(u,r));}
  @Patch('cards/:id/limit') cardLimit(@Param('id',ParseIntPipe)id:number,@Body()d:LimitDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.change_card_limit',[id,d.limit],this.context(u,r));}

  @Post('loans') createLoan(@Body()d:LoanCreateDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.create_loan',[d.code,d.customerId,d.branchId,u.employeeId,d.loanTypeId,d.principal,d.interestRate,d.termMonths,d.startDate],this.context(u,r));}
  @Post('loans/:id/approve') approveLoan(@Param('id',ParseIntPipe)id:number,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.approve_loan',[id],this.context(u,r));}
  @Post('transactions/:id/fraud-label') fraudLabel(@Param('id',ParseIntPipe)id:number,@Body()d:FraudLabelDto,@CurrentUser()u:AuthUser,@Req()r:Request){return this.db.function('banking_api.add_fraud_label',[id,d.label,d.source??'MANUAL_REVIEW',d.note??null],this.context(u,r));}
}
