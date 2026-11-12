import { Body, Controller, ForbiddenException, Header, Injectable, Param, ParseIntPipe, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../security/auth.guard';
import { CurrentUser, Roles } from '../security/decorators';
import { SecurityThrottle } from '../security/throttle.service';

export class CardNumberRevealDto {
  @IsString() @Length(1,200) password!:string;
}
@Injectable()
export class CardNumberRevealService {
  constructor(private readonly db:DatabaseService,private readonly throttle:SecurityThrottle) {}
  async reveal(cardId:number,user:AuthUser,password:string) {
    if(user.role!=='customer'||!user.customerId)throw new ForbiddenException('Chỉ chủ thẻ được xem thông tin này.');
    await this.throttle.check('card-number-reveal',String(user.customerId),5,900);
    return this.db.transaction({},async client=>{
      const result=await client.query(`SELECT c.cardid,c.cardnumber FROM banking.card c
        JOIN banking.customer owner ON owner.customerid=c.customerid
        JOIN banking.customer_online_account a ON a.customerid=c.customerid
        WHERE c.cardid=$1 AND c.customerid=$2 AND owner.status='Active' AND a.isactive
          AND a.passwordhash=public.crypt($3,a.passwordhash)
        FOR SHARE OF c,owner,a`,[cardId,user.customerId,password]);
      const card=result.rows[0];
      // One response for incorrect credentials and inaccessible cards avoids exposing ownership.
      if(!card)throw new ForbiddenException('Không thể xác thực quyền xem thẻ. Vui lòng kiểm tra mật khẩu đăng nhập.');
      await client.query(`INSERT INTO banking.audit_log(entitytype,entityid,action,newvalue)
        VALUES('CARD_ACCESS',$1,'INSERT',$2::jsonb)`,[String(cardId),JSON.stringify({customerId:user.customerId,operation:'REVEAL_CARD_NUMBER'})]);
      return {cardId:Number(card.cardid),cardNumber:card.cardnumber,expiresIn:30};
    });
  }
}
@Controller('me/cards')
@Roles('customer')
export class CardNumberRevealController {
  constructor(private readonly numbers:CardNumberRevealService) {}
  @Post(':id/reveal-number')
  @Header('Cache-Control','no-store, private')
  @Header('Pragma','no-cache')
  reveal(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:AuthUser,@Body() dto:CardNumberRevealDto){
    return this.numbers.reveal(id,user,dto.password);
  }
}
