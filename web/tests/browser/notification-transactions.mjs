import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtureResponse,transactionRows} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000',errors=[];
await mkdir('/tmp/d4-notification-transactions',{recursive:true});
try{
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test');localStorage.setItem('d4-session',JSON.stringify({id:'101',role:'customer',customerId:101,name:'Kiểm tra thông báo'}));});
  const rows=[901,901,902,903,904,905,906,907,null].map((id,i)=>({notificationoutboxid:i+1,transactionid:id,notificationtype:i===1||id===903?'TRANSACTION_UNDER_REVIEW':id===902?'TRANSACTION_BLOCKED':id?'TRANSACTION_COMPLETED':'SYSTEM_UPDATE',status:'SENT',createdat:'2026-11-11T10:00:00'}));
  const reads=[];let fail=true;
  await page.route('**/api/v1/**',route=>{
   assert.equal(route.request().method(),'GET');const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');
   if(path==='/me/notifications')return route.fulfill({json:{items:rows,total:rows.length,page:1,pageSize:100}});
   if(/^\/me\/transactions\/\d+$/.test(path)){
    const id=Number(path.split('/').at(-1));reads.push(id);
    if(id===905)return route.fulfill({json:null});
    if(id===906&&fail)return route.fulfill({status:503,json:{message:'Không thể tải giao dịch. Vui lòng thử lại.'}});
    const status=id===902?'Cancelled':id===903?'Pending':id===904?'Failed':'Success';
    return route.fulfill({json:{transaction:{...transactionRows[0],transactionid:id===907?999:id,transactioncode:`ACTUAL-${id}`,typecode:'TRANSFER',typename:'Chuyển khoản',status,amount:'123456',currency:'VND',fee:'0',description:`Nội dung đúng giao dịch ${id}`,decision:status==='Pending'?'REVIEW':status==='Cancelled'?'BLOCK':'ALLOW'},postings:[],transfer:{sourceAccountNumber:'1000000000000001',sourceAccountName:'Người chuyển kiểm thử',destinationAccountNumber:'1000000000000099',destinationAccountName:'Người nhận kiểm thử'}}});
   }
   return route.fulfill({json:fixtureResponse(url,'customer')});
  });
  await page.goto(base+'/customer/notifications');
  for(const [index,id] of [901,901,902,903,904,905,906,907].entries()){
   await page.locator('.notice-row').nth(index).click();const dialog=page.getByRole('dialog',{name:'Chi tiết giao dịch',exact:true});await dialog.waitFor();
   if(id===905){await dialog.getByRole('alert').filter({hasText:'Không tìm thấy giao dịch'}).waitFor();assert.equal(await dialog.locator('.d4-transaction-result').count(),0);}
   else if(id===907){await dialog.getByRole('alert').filter({hasText:'không khớp'}).waitFor();assert.equal(await dialog.locator('.d4-transaction-result').count(),0);}
   else{
    if(id===906){await dialog.getByRole('alert').waitFor();fail=false;await dialog.getByRole('button',{name:'Thử lại',exact:true}).click();}
    const outcome=id===902?'cancelled':id===903?'pending':id===904?'failed':'success';
    await dialog.locator(`[data-outcome="${outcome}"]`).waitFor();await dialog.getByText(`ACTUAL-${id}`,{exact:true}).waitFor();
    assert.ok((await dialog.innerText()).includes(`Nội dung đúng giao dịch ${id}`));
    await dialog.getByText('Người nhận kiểm thử',{exact:true}).waitFor();
    await dialog.getByText('1000000000000099',{exact:true}).waitFor();
    const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=845);
    if(index===0)await page.screenshot({path:`/tmp/d4-notification-transactions/receipt-${width}.png`});
   }
   await dialog.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  await page.getByRole('button',{name:'Trang sau',exact:true}).click();const before=reads.length;
  await page.locator('.notice-row').first().click();await page.getByRole('dialog').waitFor();assert.equal(reads.length,before);
  assert.ok(reads.filter(id=>id===901).length>=2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.close();console.log('PASS exact notification mapping, live statuses, transfer details, authorization errors, retry and nontransaction notices',width);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
