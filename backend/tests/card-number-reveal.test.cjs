require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('class-validator');
const {plainToInstance}=require('class-transformer');
const {CardNumberRevealService,CardNumberRevealDto,CardNumberRevealController}=require('../dist/http/card-number-reveal');

test('card number reveal requires customer role and a password',async()=>{
 const service=new CardNumberRevealService({transaction:()=>assert.fail('No lookup allowed')},{check:()=>assert.fail('No throttle allowed')});
 await assert.rejects(()=>service.reveal(1,{role:'employee',customerId:1},'test'),/Chỉ chủ thẻ/);
 for(const password of ['',undefined])assert.ok((await validate(plainToInstance(CardNumberRevealDto,{password}))).length);
 assert.ok((await validate(plainToInstance(CardNumberRevealDto,{password:'test',customerId:9}),{whitelist:true,forbidNonWhitelisted:true})).length);
 assert.deepEqual(Reflect.getMetadata('roles',CardNumberRevealController),['customer']);
 const headers=Reflect.getMetadata('__headers__',CardNumberRevealController.prototype.reveal);
 assert.ok(headers.some(header=>header.name==='Cache-Control'&&header.value==='no-store, private'));
});
test('incorrect password or foreign card returns 403 and never writes an audit or reveals a number',async()=>{
 let parameters;
 const service=new CardNumberRevealService({transaction:async(_context,work)=>work({query:async(sql,args)=>{assert.match(sql,/c\.customerid=\$2/);assert.match(sql,/a\.passwordhash=public\.crypt/);parameters=args;return {rows:[]};}})},{check:async()=>{}});
 await assert.rejects(()=>service.reveal(7,{role:'customer',customerId:101},'test-password'),error=>error.getStatus()===403);
 assert.deepEqual(parameters,[7,101,'test-password']);
});
test('successful reveal audits access without recording the password, full number or hashes',async()=>{
 const audits=[],limits=[];
 const service=new CardNumberRevealService({transaction:async(_context,work)=>work({query:async(sql,args)=>{
  if(sql.includes('SELECT c.cardid'))return {rows:[{cardid:'7',cardnumber:'9000000000000007'}]};
  audits.push(args);return {rows:[]};
 }})},{check:async(...args)=>limits.push(args)});
 const result=await service.reveal(7,{role:'customer',customerId:101},'test-password');
 assert.deepEqual(result,{cardId:7,cardNumber:'9000000000000007',expiresIn:30});
 assert.deepEqual(limits,[['card-number-reveal','101',5,900]]);
 assert.ok(!JSON.stringify(audits).includes(result.cardNumber));assert.ok(!JSON.stringify(audits).includes('test-password'));
 assert.equal(JSON.parse(audits[0][1]).customerId,101);
});
test('rate limiting rejects before card data is read',async()=>{
 const service=new CardNumberRevealService({transaction:()=>assert.fail('No lookup after rate limit')},{check:async()=>{throw new Error('rate limit');}});
 await assert.rejects(()=>service.reveal(7,{role:'customer',customerId:101},'test'),/rate limit/);
});
