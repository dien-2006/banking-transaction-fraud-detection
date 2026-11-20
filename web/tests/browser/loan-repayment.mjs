import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtureResponse,accountRows,loanRows} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000',errors=[];
await mkdir('/tmp/d4-loan-payment',{recursive:true});
const cases=[['Success',1366],['Pending',390],['Failed',320],['Cancelled',390],['network',390],['malformed',390],['insufficient',390],['pending-payment',390],['no-settlement',390]];
try{
 for(const [scenario,width] of cases.filter(([name])=>!process.env.LOAN_PAYMENT_CASES||process.env.LOAN_PAYMENT_CASES.split(',').includes(name))){
  const height=width===320?568:844,page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({role:'customer',id:'101',customerId:101,name:'Kiểm tra trả nợ'}));});
  const writes=[],loan={...loanRows[0],loanid:41,loancode:'LN-PAYMENT-41',status:'Active',termmonths:1,principalamount:'1111',outstandingamount:'1118.87'};
  const schedule={scheduleid:417,loanid:41,installmentno:1,duedate:'2026-12-12',principaldue:'1111',interestdue:'7.87',penaltydue:'0',status:'Pending'};
  let paid=false;
  await page.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');
   if(route.request().method()==='POST'){
    assert.equal(path,'/transactions/loan-payments');const data=route.request().postDataJSON();writes.push(data);
    assert.deepEqual(Object.keys(data).sort(),['amount','loanId','scheduleId','sourceAccountId','transactionCode'].sort());
    assert.equal(data.loanId,41);assert.equal(data.scheduleId,417);assert.equal(data.amount,'1118.87');assert.ok(data.transactionCode.length<=40);
    await new Promise(resolve=>setTimeout(resolve,150));
    if(scenario==='network'&&writes.length===1)return route.fulfill({status:503,json:{message:'Mất kết nối sau khi gửi lệnh'}});
    const status=['Success','Pending','Failed','Cancelled'].includes(scenario)?scenario:'Success';paid=status==='Success';
    return route.fulfill({json:{transactionid:731,transactioncode:scenario==='malformed'?'WRONG-CODE':data.transactionCode,typecode:'LOAN_PAYMENT',typename:'Trả khoản vay',amount:'1118.87',currency:'VND',status,decision:status==='Pending'?'REVIEW':status==='Cancelled'?'BLOCK':'ALLOW',transactiondate:'2026-11-12T12:00:00',sourceaccountid:1}});
   }
   if(path==='/me/loans')return route.fulfill({json:[{...loan,status:paid?'Paid':'Active'}]});
   if(path==='/me/accounts')return route.fulfill({json:[{...accountRows[0],availablebalance:scenario==='insufficient'?'50':'10000'}]});
   if(path==='/me/loans/41/schedule')return route.fulfill({json:[{...schedule,status:paid?'Paid':'Pending'}]});
   if(path==='/me/loans/41/payment-options')return route.fulfill({json:{loanId:41,status:paid?'Paid':'Active',ready:scenario!=='no-settlement',unavailableReason:scenario==='no-settlement'?'Ngân hàng chưa cấu hình tài khoản nhận tiền trả nợ.':null,schedules:paid?[]:[{scheduleId:417,installmentNo:1,dueDate:'2026-12-12',status:'Pending',principal:'1111',interest:'7.87',penalty:'0',total:'1118.87',pendingPayment:scenario==='pending-payment'}]}});
   return route.fulfill({json:fixtureResponse(url,'customer')});
  });
  await page.goto(base+'/customer/loans');await page.getByRole('button',{name:'Xem chi tiết LN-PAYMENT-41',exact:true}).click();
  const dialog=page.getByRole('dialog'),payment=dialog.getByRole('region',{name:'Thanh toán khoản vay',exact:true});
  if(scenario==='no-settlement'){await payment.getByText('Ngân hàng chưa cấu hình tài khoản nhận tiền trả nợ.',{exact:true}).waitFor();assert.equal(await payment.getByRole('button',{name:'Tiếp tục thanh toán',exact:true}).count(),0);await page.close();continue;}
  await payment.getByLabel('Tài khoản nguồn *',{exact:true}).selectOption('1');
  if(scenario==='pending-payment'){
   assert.ok(await payment.getByLabel('Kỳ thanh toán *',{exact:true}).locator('option[value="417"]').evaluate(option=>option.disabled));assert.equal(writes.length,0);
  }else{
   await payment.getByLabel('Kỳ thanh toán *',{exact:true}).selectOption('417');
   const prepare=payment.getByRole('button',{name:'Tiếp tục thanh toán',exact:true});
   if(['insufficient','no-settlement'].includes(scenario)){
    assert.ok(await prepare.isDisabled());assert.equal(writes.length,0);
    await payment.getByText(scenario==='insufficient'?'Tài khoản không đủ số dư khả dụng. Vui lòng chọn tài khoản khác.':'Ngân hàng chưa cấu hình tài khoản nhận tiền trả nợ.',{exact:true}).waitFor();
   }else{
    await prepare.click();assert.equal(writes.length,0);
    const confirm=payment.getByRole('button',{name:'Xác nhận trả nợ',exact:true});
    await confirm.evaluate(node=>{node.click();node.click();});
    const expected=scenario==='Success'?'success':scenario==='Pending'?'pending':scenario==='Failed'?'failed':scenario==='Cancelled'?'cancelled':'unknown';
    await payment.locator(`[data-outcome="${expected}"]`).waitFor();assert.equal(writes.length,1);
    if(scenario==='network'){
     await payment.getByRole('button',{name:'Thử lại đúng lệnh',exact:true}).click();await payment.locator('[data-outcome="success"]').waitFor();
     assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
    }
    if(scenario==='Pending')await payment.getByRole('heading',{name:'Giao dịch đang chờ nhân viên phê duyệt',exact:true}).waitFor();
    if(scenario==='malformed')assert.equal(await payment.locator('[data-outcome="success"]').count(),0);
   }
  }
  await payment.scrollIntoViewIfNeeded();const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`/tmp/d4-loan-payment/${scenario}-${width}.png`});await page.close();console.log('PASS loan repayment',scenario,width);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
