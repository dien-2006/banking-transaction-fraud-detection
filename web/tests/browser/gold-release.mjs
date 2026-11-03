import assert from 'node:assert/strict';
import {fixtureResponse} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3001';
try {
 const page=await browser.newPage({viewport:{width:1366,height:768}}),requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test');localStorage.setItem('d4-session',JSON.stringify({role:'admin',id:'1',userId:1,employeeId:2,branchId:3,name:'Snapshot test'}));});
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/analytics/snapshot'))requests.push(url);
  if(url.pathname.endsWith('/analytics'))throw new Error('Dashboard must request one pinned snapshot');
  return route.fulfill({json:fixtureResponse(url,'admin')});
 });
 await page.goto(base+'/admin/insights');
 await page.getByText(/Bản dữ liệu đã kiểm tra/).waitFor();
 assert.equal(requests.length,1);
 await page.getByLabel('Từ ngày',{exact:true}).fill('2026-11-01');
 await page.getByLabel('Đến ngày',{exact:true}).fill('2026-11-02');
 await page.getByRole('button',{name:'Lọc',exact:true}).click();
 await page.waitForResponse(r=>r.url().includes('/analytics/snapshot')&&r.url().includes('from=2026-11-01'));
 assert.equal(requests.length,2);
 assert.equal(requests[1].searchParams.get('to'),'2026-11-02');
 assert.deepEqual(errors,[]);
 console.log('PASS single-release dashboard, publication timestamp and server-side date bounds');
 await page.close();
}finally{await browser.close();}
