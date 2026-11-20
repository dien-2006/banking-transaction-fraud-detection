import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtureResponse,accountRows,loanRows} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WEB_AUDIT_URL||'http://localhost:3000',browser=await chromium.launch(),errors=[];
await mkdir('/tmp/d4-self-service',{recursive:true});
async function login(page,role){page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(role=>{
 localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({role,id:'101',customerId:role==='customer'?101:undefined,userId:1,employeeId:2,branchId:3,name:'Kiểm tra đăng ký'}));
},role);}
try{
 for(const width of (process.env.PRODUCT_TEST_WIDTHS??"1366,390,320").split(",").filter(Boolean).map(Number)){
  const height=width===320?568:844,page=await browser.newPage({viewport:{width,height}});await login(page,'customer');
  const writes=[],saved=new Map(),added={accounts:[],cards:[],loans:[]};let failFirst=true;
  const accounts=[...accountRows.slice(0,2),{...accountRows[2],accountid:90,status:'Frozen'},{...accountRows[3],accountid:91,holdertype:'JOINT_OWNER'},{...accountRows[4],accountid:92,currency:'USD'}];
  await page.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');
   if(route.request().method()==='POST'){
    assert.match(path,/^\/me\/products\/(accounts|cards|loans)$/);const kind=path.split('/').at(-1),body=route.request().postDataJSON();writes.push({kind,body});assert.match(body.requestKey,/^[0-9a-f-]{36}$/);
    for(const key of ['customerId','accountNumber','cardNumber','interestRate','dailyLimit'])assert.ok(!(key in body));
    if(kind==='cards')assert.ok(['Debit','Debit Napas','Debit Visa','Debit Mastercard'].includes(body.cardType));
    if(saved.has(body.requestKey))return route.fulfill({json:saved.get(body.requestKey)});
    const result=kind==='accounts'?{...accountRows[0],accountid:701,accountnumber:'1000000000000701',balance:'0',availablebalance:'-50000'}:kind==='cards'?{cardid:801,accountid:body.accountId,maskedcardnumber:'************0801',cardtype:body.cardType,status:'Active',dailylimit:'50000000',expirydate:'2029-11-12',issuedate:'2026-11-12'}:{...loanRows[0],loanid:901,loancode:'LN00000901',principalamount:body.principal,termmonths:body.termMonths,status:'Pending'};
    added[kind].push(result);saved.set(body.requestKey,result);
    if(kind==='accounts'&&failFirst){failFirst=false;return route.fulfill({status:503,json:{message:'Mất kết nối sau khi lưu thử nghiệm'}});}return route.fulfill({json:result});
   }
   if(path==='/me/accounts')return route.fulfill({json:[...accounts,...added.accounts]});
   if(path==='/me/cards')return route.fulfill({json:added.cards});
   if(path==='/me/loans')return route.fulfill({json:added.loans});
   return route.fulfill({json:fixtureResponse(url,'customer')});
  });
  for(const [kind,button,title] of [['accounts','Mở tài khoản mới','Mở tài khoản mới'],['cards','Mở thẻ mới','Mở thẻ ghi nợ'],['loans','Đăng ký khoản vay mới','Đăng ký khoản vay']]){
   await page.goto(base+'/customer/'+kind);await page.getByRole('button',{name:button,exact:true}).first().click();const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.locator('form').waitFor();
   if(kind!=='cards')await dialog.getByLabel('Chi nhánh *',{exact:true}).selectOption('3');
   if(kind==='accounts')await dialog.getByLabel('Loại tài khoản *',{exact:true}).selectOption('1');
   if(kind==='cards'){
    assert.equal(await dialog.getByLabel('Loại thẻ *',{exact:true}).locator('option').count(),5);
    await dialog.getByLabel('Loại thẻ *',{exact:true}).selectOption(width===1366?'Debit Mastercard':width===390?'Debit Napas':'Debit Visa');
    assert.equal(await dialog.getByLabel('Tài khoản liên kết *',{exact:true}).locator('option').count(),4);
    await dialog.getByLabel('Tài khoản liên kết *',{exact:true}).selectOption('1');await dialog.getByLabel('PIN mới *',{exact:true}).fill('4829');await dialog.getByLabel('Xác nhận PIN *',{exact:true}).fill('9138');
   }
   if(kind==='loans'){
    assert.equal(await dialog.getByLabel('Chi nhánh *',{exact:true}).locator('option').count(),2);
    await dialog.getByLabel('Sản phẩm vay *',{exact:true}).selectOption('1');await dialog.getByLabel('Số tiền vay (VND) *',{exact:true}).fill('1000000');await dialog.getByLabel('Kỳ hạn (tháng) *',{exact:true}).fill('12');
   }
   await dialog.getByRole('checkbox').check();const bounds=await dialog.boundingBox(),footer=await dialog.locator('form > footer').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1);assert.ok(footer.y>=0&&footer.y+footer.height<=height);
   await page.screenshot({path:`/tmp/d4-self-service/${kind}-form-${width}.png`});
   const submit=dialog.getByRole('button',{name:kind==='accounts'?'Mở tài khoản':kind==='cards'?'Phát hành thẻ':'Gửi hồ sơ vay',exact:true});
   if(kind==='cards'){const count=writes.length;await submit.click();await dialog.getByRole('alert').filter({hasText:'PIN xác nhận chưa khớp'}).waitFor();assert.equal(writes.length,count);await dialog.getByLabel('Xác nhận PIN *',{exact:true}).fill('4829');}
   await submit.click();
   if(kind==='accounts'){await dialog.getByRole('alert').filter({hasText:'Kết quả có thể đã được lưu'}).waitFor();assert.ok(await dialog.getByLabel('Chi nhánh *',{exact:true}).isDisabled());await dialog.getByRole('button',{name:'Thử lại yêu cầu',exact:true}).click();assert.equal(added.accounts.length,1);assert.deepEqual(writes[0],writes[1]);}
   await dialog.getByRole('heading',{name:kind==='accounts'?'Đã mở tài khoản':kind==='cards'?'Đã phát hành thẻ':'Đã tiếp nhận hồ sơ vay',exact:true}).waitFor();await page.screenshot({path:`/tmp/d4-self-service/${kind}-result-${width}.png`});
   await dialog.getByRole('button',{name:'Đóng',exact:true}).click();await dialog.waitFor({state:'hidden'});
   if(kind==='accounts')await page.getByText('1000000000000701',{exact:true}).first().waitFor();if(kind==='loans')await page.getByText('LN00000901',{exact:true}).first().waitFor();
   console.log('PASS customer application, validation, responsive dialog and updated list',kind,width);
  }
  assert.equal(writes.length,4);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.close();
 }
 for(const role of (process.env.PRODUCT_TEST_ROLES??"employee,admin").split(",").filter(Boolean)){
  const page=await browser.newPage({viewport:{width:390,height:844}});await login(page,role);
  const rows=[{...loanRows[0],loanid:901,loancode:'LN00000901',status:'Pending'},{...loanRows[0],loanid:902,loancode:'LN00000902',status:'Pending'}],decisions=[];
  await page.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');
   if(route.request().method()==='POST'){assert.match(path,/^\/management\/loans\/\d+\/decision$/);const data=route.request().postDataJSON();const row=rows.find(row=>String(row.loanid)===path.split('/')[3]);if(row.status!=='Pending')return route.fulfill({status:409,json:{message:'Hồ sơ đã được xử lý'}});decisions.push(data);row.status=data.decision==='APPROVE'?'Active':'Cancelled';return route.fulfill({json:{...row,...(data.decision==='APPROVE'?{disbursement:{transactionid:500,transactioncode:'LD-'+data.requestKey,typecode:'DEPOSIT',amount:'1000000',currency:'VND',status:'Success',destinationaccountid:data.destinationAccountId}}:{})}});}
   if(path.endsWith('/disbursement-options')){const row=rows.find(r=>String(r.loanid)===path.split('/')[3]);return route.fulfill({json:{loanId:row.loanid,status:row.status,ready:true,accounts:[{accountId:1,accountNumber:'1000000000000001'}],disbursement:null}});}
   if(path==='/admin/loans')return route.fulfill({json:{items:rows,total:rows.length,page:1,pageSize:20}});return route.fulfill({json:fixtureResponse(url,role)});
  });
  await page.goto(base+'/'+role+'/loans');
  for(const decision of ['REJECT','APPROVE']){
   await page.getByRole('button',{name:'Xử lý',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'Xử lý hồ sơ vay',exact:true});await dialog.getByLabel('Quyết định *',{exact:true}).selectOption(decision);
   const confirm=dialog.getByRole('button',{name:decision==='APPROVE'?'Xác nhận duyệt và giải ngân':'Xác nhận từ chối',exact:true});assert.ok(await confirm.isDisabled());await dialog.getByLabel('Lý do xử lý *',{exact:true}).fill(decision==='APPROVE'?'Đã kiểm tra hồ sơ thử nghiệm':'Hồ sơ thử nghiệm chưa đủ điều kiện');
   if(decision==='APPROVE')await dialog.getByLabel('Tài khoản nhận giải ngân *',{exact:true}).selectOption('1');
   await page.screenshot({path:`/tmp/d4-self-service/${role}-${decision}.png`});await confirm.click();await dialog.getByRole('button',{name:'Đóng',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  assert.deepEqual(decisions.map(row=>row.decision),['REJECT','APPROVE']);assert.equal(await page.getByRole('button',{name:'Xử lý',exact:true}).count(),0);await page.close();console.log('PASS staff loan approval/rejection and reason',role);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
