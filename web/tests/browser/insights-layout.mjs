import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtureResponse} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000';
const artifactDir=process.env.INSIGHTS_ARTIFACT_DIR||'/tmp/d4-insights-layout';
await mkdir(artifactDir,{recursive:true});
try {
 for(const width of [1920,1440,1366,1024,768,390]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({role:'admin',id:'1',userId:1,employeeId:2,branchId:3,name:'Insights test'}));});
  await page.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url()),body=fixtureResponse(url,'admin');
   if(url.pathname.endsWith('/analytics/snapshot')) {
    body.datasets.risk=[{full_date:'2026-11-01',risk_level:'LOW',decision:'ALLOW',assessment_count:2006},{full_date:'2026-11-01',risk_level:'HIGH',decision:'BLOCK',assessment_count:1},{full_date:'2026-11-01',risk_level:'MEDIUM',decision:'REVIEW',assessment_count:1}];
    body.datasets.reviews=[{full_date:'2026-11-01',status:'APPROVED',review_count:51},{full_date:'2026-11-01',status:'REJECTED',review_count:51},{full_date:'2026-11-01',status:'OPEN',review_count:50}];
   }
   return route.fulfill({json:body});
  });
  await page.goto(base+'/admin/insights');
  await page.getByText(/Bản dữ liệu đã kiểm tra/).waitFor();
  await page.locator('.insight-chart canvas').first().waitFor();
  assert.equal(await page.getByRole('heading',{name:'Phí giao dịch theo loại',exact:true}).count(),0);
  assert.equal(await page.locator('.insights-overview-grid > article').count(),8);
  assert.ok(await page.locator('.d4-distribution-legend').filter({hasText:'0,05%'}).count()>0);
  const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth+1,items:[...document.querySelectorAll('.insight-bar-label b,.insight-panel-heading h2,.d4-distribution-legend strong')].filter(el=>{
   const panel=el.closest('article').getBoundingClientRect(),box=el.getBoundingClientRect();return box.right>panel.right+1||box.left<panel.left-1||el.scrollWidth>el.clientWidth+1;
  }).map(el=>el.textContent)}));
  assert.deepEqual(overflow,{page:false,items:[]},`overflow at ${width}px: ${JSON.stringify(overflow)}`);
  await page.screenshot({path:`${artifactDir}/overview-${width}.png`,fullPage:true});
  await page.getByRole('heading',{name:'Phân bố rủi ro giao dịch',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`${artifactDir}/risk-${width}.png`});
  // All existing tabs must remain reachable after the layout changes.
  for(const tab of ['Phân tích khách hàng','Phân tích giao dịch','Phân tích sản phẩm','Phân tích rủi ro','Báo cáo tùy chỉnh']) {
   await page.getByRole('button',{name:tab,exact:true}).click();
   await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${tab}: overflow at ${width}px`);
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS Insights ${width}px: fee panel removed; values visible; all tabs reachable`);
  await page.close();
 }
}finally{await browser.close();}
