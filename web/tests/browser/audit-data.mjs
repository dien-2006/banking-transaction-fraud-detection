import assert from 'node:assert/strict';
import {fixtureResponse} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000';
const rows=[
 {auditid:5,userid:null,entitytype:'BANK_ACCOUNT',entityid:15,action:'UPDATE',createdat:'2026-11-20 12:00:00',oldvalue:{balance:'100'},newvalue:{balance:'200'}},
 {auditid:4,userid:2,actor_name:'Nguyễn An',actor_code:'EMP002',entitytype:'TRANSACTION_POSTING',entityid:9,action:'INSERT',createdat:'2026-11-20 11:00:00'},
 {auditid:3,userid:3,actor_name:'Lê Bình',actor_code:'EMP003',entitytype:'LOAN',entityid:7,action:'STATUS_CHANGE',createdat:'2026-11-20 10:00:00'},
 {auditid:2,userid:2,actor_name:'Nguyễn An',entitytype:'CUSTOMER',entityid:5,action:'INSERT',createdat:'2026-11-19 09:00:00'},
 {auditid:1,userid:null,entitytype:'BANK_TRANSACTION',entityid:1,action:'INSERT',createdat:'2026-11-19 08:00:00'},
];
try {
 for(const timezoneId of ['UTC','Asia/Ho_Chi_Minh']) {
  const page=await browser.newPage({viewport:{width:1440,height:900},timezoneId}),errors=[];let auditRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({role:'admin',id:'1',userId:1,employeeId:2,branchId:3,name:'Audit test'}));});
  await page.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/admin/audit-logs')){auditRequests++;return route.fulfill({json:{items:rows,total:rows.length,page:1,pageSize:100}});}
   return route.fulfill({json:fixtureResponse(url,'admin')});
  });
  await page.goto(base+'/admin/audit-logs');
  const table=page.locator('table'),total=page.locator('.audit-kpis article').first().locator('b');
  await table.getByRole('cell',{name:'Chưa ghi nhận người thực hiện',exact:true}).first().waitFor();
  assert.equal(await total.innerText(),'5');
  assert.equal(await table.getByRole('cell',{name:'Hệ thống',exact:true}).count(),0);
  assert.equal(await table.getByRole('cell',{name:'Bút toán giao dịch',exact:true}).count(),1);
  assert.match(await table.getByRole('row').filter({has:page.getByRole('cell',{name:'5',exact:true})}).first().innerText(),/12:00:00 20\/11\/2026/);
  await page.getByLabel('Ngày ghi nhật ký',{exact:true}).fill('2026-11-20');
  await page.waitForFunction(()=>document.querySelector('.audit-kpis article b')?.textContent==='3');
  assert.equal(await table.locator('tbody tr').count(),3);
  await page.getByLabel('Người dùng',{exact:true}).selectOption('2');
  await page.waitForFunction(()=>document.querySelector('.audit-kpis article b')?.textContent==='1');
  assert.equal(await table.locator('tbody tr').count(),1);
  assert.equal(await table.getByRole('cell',{name:'Nguyễn An',exact:true}).count(),1);
  await page.getByRole('button',{name:'Thống kê hoạt động',exact:true}).click();
  const stats=page.getByRole('heading',{name:'Thống kê hoạt động',exact:true}).locator('..');
  assert.match(await stats.innerText(),/Tạo mới\s+1/);assert.match(await stats.innerText(),/Cập nhật\s+0/);
  const refreshed=page.waitForResponse(r=>r.url().includes('/admin/audit-logs'));
  await page.getByRole('button',{name:'Làm mới nhật ký',exact:true}).click();await refreshed;
  assert.equal(auditRequests,2);assert.deepEqual(errors,[]);
  console.log(`PASS audit: staff names, unattributed actors, filtered totals, refresh and Vietnam timestamps in ${timezoneId}`);
  await page.close();
 }
} finally {await browser.close();}
