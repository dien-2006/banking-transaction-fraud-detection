import { Body, Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../security/auth.guard';
import { CurrentUser, Roles } from '../security/decorators';
import { CustomerAccountDto, CustomerCardDto, CustomerLoanDto, LoanDecisionDto } from './customer-products.dto';
import { CustomerProductsService } from './customer-products.service';

@Controller('me/products')
@Roles('customer')
export class CustomerProductsController {
  constructor(private readonly products:CustomerProductsService) {}
  @Get('catalog') catalog(@CurrentUser() user:AuthUser){return this.products.catalog(user);}
  @Post('accounts') account(@Body() dto:CustomerAccountDto,@CurrentUser() user:AuthUser,@Req() req:Request){return this.products.create('account',dto,user,req.ip);}
  @Post('cards') card(@Body() dto:CustomerCardDto,@CurrentUser() user:AuthUser,@Req() req:Request){return this.products.create('card',dto,user,req.ip);}
  @Post('loans') loan(@Body() dto:CustomerLoanDto,@CurrentUser() user:AuthUser,@Req() req:Request){return this.products.create('loan',dto,user,req.ip);}
}
@Controller('management/loans')
@Roles('employee','admin')
export class LoanDecisionController {
  constructor(private readonly products:CustomerProductsService) {}
  @Post(':id/decision') decide(@Param('id',ParseIntPipe) id:number,@Body() dto:LoanDecisionDto,@CurrentUser() user:AuthUser,@Req() req:Request){return this.products.decideLoan(id,dto,user,req.ip);}
}
