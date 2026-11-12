import assert from 'node:assert/strict';
import { fixtureResponse } from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.WEB_AUDIT_URL || 'http://localhost:3000';
const browser=await chromium.launch();
const recipients=Array.from({length:12},(_,i)=>({accountId:100+i,accountNumber:`900000000000${String(i).padStart(4,'0')}`,accountName:`Người nhận lịch sử ${i+1}`,bankName:'D4 Bank',currency:'VND'}));
try {
  for (const width of [390,1366]) {
    // A fresh context has no saved recipients, even from another run/device.
    const page=await browser.newPage({viewport:{width,height:844}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      localStorage.setItem('d4-access-token','test');
      localStorage.setItem('d4-session',JSON.stringify({role:'customer',id:'101',customerId:101,userId:1,name:'Test'}));
    });
    let fail=false, reads=0;
    await page.route('**/api/v1/**',route=>{
      assert.equal(route.request().method(),'GET');
      const url=new URL(route.request().url()), path=url.pathname.replace('/api/v1','');
      if(path==='/me/recipients') {reads++;return route.fulfill({status:fail?503:200,json:fail?{message:'Temporary error'}:recipients});}
      if(path.startsWith('/transactions/destinations/'))return route.fulfill({json:recipients.find(row=>row.accountNumber===decodeURIComponent(path.split('/').at(-1)))??null});
      return route.fulfill({json:fixtureResponse(url,'customer')});
    });
    await page.goto(base+'/customer/transfer');
    const panel=page.locator('.transfer-recipients-panel');
    await panel.getByText('Người nhận lịch sử 1',{exact:true}).waitFor();
    assert.equal(await panel.locator('.transfer-recent-recipient').count(),4);
    assert.equal(await page.evaluate(()=>sessionStorage.length),0);
    await panel.getByRole('button',{name:'Xem tất cả'}).click();
    const dialog=page.getByRole('dialog',{name:'Chọn người nhận',exact:true});
    assert.equal(await dialog.locator('.transfer-dialog-list > button').count(),12);
    await dialog.getByText('Người nhận lịch sử 12',{exact:true}).click();
    await page.locator('.transfer-recipient-verification[data-status="verified"]').waitFor();
    await page.locator('.transfer-verification-value').getByText('Người nhận lịch sử 12',{exact:true}).waitFor();
    await page.reload();
    await panel.getByText('Người nhận lịch sử 1',{exact:true}).waitFor();
    assert.ok(reads>=2);
    fail=true;await page.reload();
    await panel.getByText('Không thể tải người nhận.',{exact:true}).waitFor();
    fail=false;await panel.getByRole('button',{name:'Thử lại',exact:true}).click();
    await panel.getByText('Người nhận lịch sử 1',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    await page.close();
    console.log('PASS historical recipients on fresh session, reload, complete list, verification and retry',width);
  }
} finally {await browser.close();}
