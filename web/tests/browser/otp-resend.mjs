import assert from 'node:assert/strict';
import {fixtureResponse,transactionRows} from './fixtures.mjs';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000';
try{for(const width of [1366,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),requests=[],errors=[];let transfers=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install();
 await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({role:'customer',id:'101',customerId:101,name:'OTP test'}));});
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.includes('/transactions/destinations/'))return route.fulfill({json:{accountId:999,accountNumber:'9988776655',accountName:'Người nhận OTP test',currency:'VND',bankName:'D4 Bank'}});
  if(url.pathname.endsWith('/security/otp/request')){
   requests.push(req.postDataJSON());
   if(requests.length===2)return route.fulfill({status:503,json:{message:'Không thể gửi email OTP'}});
   if(requests.length===3)return route.fulfill({status:429,json:{message:'Vui lòng chờ 12 giây trước khi gửi lại OTP',retryAfter:12}});
   return route.fulfill({json:{challengeId:`mock-challenge-${requests.length}`,expiresIn:300,resendAfter:60,destinationMasked:'ot***@example.invalid',deliveryStatus:'ACCEPTED'}});
  }
  if(url.pathname.endsWith('/security/otp/verify')){
   assert.equal(req.postDataJSON().challengeId,'mock-challenge-4');
   return route.fulfill({json:{authorizationToken:'mock-authorization-1234567890',expiresIn:120}});
  }
  if(url.pathname.endsWith('/transactions/transfers')&&req.method()==='POST'){
   transfers++;return route.fulfill({json:{...transactionRows[0],transactionid:88,transactioncode:'TX-OTP-TEST',status:'Pending',decision:'REVIEW'}});
  }
  assert.equal(req.method(),'GET');return route.fulfill({json:fixtureResponse(url,'customer')});
 });
 await page.goto(`${base}/customer/transfer`);
 await page.getByLabel('Tài khoản nhận',{exact:true}).fill('9988776655');
 await page.getByText('Người nhận OTP test',{exact:true}).waitFor();
 await page.getByLabel('Số tiền',{exact:true}).fill('1000');
 await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
 await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
 const resend=page.getByRole('button',{name:/Gửi lại mã OTP/});
 await resend.waitFor();assert.equal(await resend.isDisabled(),true);
 await page.clock.fastForward(55_000);assert.equal(await resend.isDisabled(),true);assert.equal(requests.length,1);
 await page.clock.fastForward(6_000);
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Gửi lại mã OTP'&&!button.disabled));
 assert.match(await page.locator('.transfer-otp small').innerText(),/Mã còn hiệu lực/);
 await resend.click();await page.getByText('Không thể gửi email OTP',{exact:true}).waitFor();
 assert.equal(await resend.isDisabled(),false);
 await resend.click();await page.getByText('Vui lòng chờ 12 giây trước khi gửi lại OTP',{exact:true}).waitFor();
 assert.equal(await resend.isDisabled(),true);
 await page.clock.fastForward(13_000);
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Gửi lại mã OTP'&&!button.disabled));
 await resend.click();await page.waitForFunction(()=>document.querySelector('.transfer-otp button')?.disabled);
 assert.equal(requests.length,4);for(const request of requests)assert.deepEqual(request,requests[0]);
 assert.equal(transfers,0,'Resending OTP must never create a transaction');
 await page.getByLabel('Mã xác nhận gồm 6 chữ số').fill('123456');
 await page.getByRole('button',{name:'Xác nhận chuyển tiền',exact:true}).click();
 await page.locator('.d4-transaction-result[data-outcome="pending"]').waitFor();assert.equal(transfers,1);
 assert.deepEqual(errors,[]);console.log('PASS OTP resend, expiry, provider failure, cooldown and latest challenge',width);
 await page.close();
}}finally{await browser.close();}
