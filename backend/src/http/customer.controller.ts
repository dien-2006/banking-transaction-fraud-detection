import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../security/decorators';
import { AuthUser } from '../security/auth.guard';
import { DeviceRegisterDto, DeviceStatusDto, PasswordChangeDto, PinChangeDto } from './management.dto';
import { SecurityThrottle } from '../security/throttle.service';

@Controller('me')
export class CustomerController {
  constructor(private readonly db: DatabaseService, private readonly throttle: SecurityThrottle) {}
  private id(user: AuthUser): number {
    if (!user.customerId) throw new ForbiddenException('Customer identity required');
    return user.customerId;
  }
  @Get() profile(@CurrentUser() user: AuthUser) {
    return this.db.function('banking_api.get_customer_profile', [this.id(user)]);
  }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthUser) {
    return this.db.function('banking_api.customer_dashboard', [this.id(user)]);
  }
  @Get('accounts') accounts(@CurrentUser() user: AuthUser) {
    return this.db.function('banking_api.get_customer_accounts', [this.id(user)]);
  }
  @Get('cards') cards(@CurrentUser() user: AuthUser) {
    return this.db.function('banking_api.get_customer_cards', [this.id(user)]);
  }
  @Get('loans') loans(@CurrentUser() user: AuthUser) {
    return this.db.function('banking_api.get_customer_loans', [this.id(user)]);
  }
  @Get('loans/:id/schedule') loanSchedule(@CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number) {
    return this.db.function('banking_api.get_loan_schedule', [id, this.id(user)]);
  }
  @Get('devices') devices(@CurrentUser() user: AuthUser) {
    return this.db.function('banking_api.list_customer_devices', [this.id(user)]);
  }
  @Post('devices') registerDevice(@CurrentUser()user:AuthUser,@Body()dto:DeviceRegisterDto){
    return this.db.function('banking_api.register_customer_device',[this.id(user),dto.deviceCode,dto.deviceType,dto.deviceName,dto.operatingSystem]);
  }
  @Get('notifications') notifications(@CurrentUser() user: AuthUser,
    @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.db.function('banking_api.list_notifications', [this.id(user), Number(page), Number(pageSize)]);
  }
  @Get('transactions/:id') transaction(@CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number) {
    return this.db.function('banking_api.get_transaction', [id, this.id(user)]);
  }
  @Post('password') changePassword(@CurrentUser() user: AuthUser,@Body() dto:PasswordChangeDto) {
    return this.db.function('banking_api.change_customer_password',[this.id(user),dto.oldPassword,dto.newPassword]);
  }
  @Post('cards/:id/pin') async changePin(@CurrentUser() user:AuthUser,@Param('id',ParseIntPipe)id:number,@Body()dto:PinChangeDto){
    await this.throttle.check('card-pin', `${this.id(user)}:${id}`, 5, 900);
    return this.db.function('banking_api.change_card_pin',[this.id(user),id,dto.oldPin,dto.newPin]);
  }
  @Patch('devices/:id') deviceStatus(@CurrentUser()user:AuthUser,@Param('id',ParseIntPipe)id:number,@Body()dto:DeviceStatusDto){
    return this.db.function('banking_api.change_device_status',[this.id(user),id,dto.status,null]);
  }
}
