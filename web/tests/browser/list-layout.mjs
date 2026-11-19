import assert from 'node:assert/strict';
import {fixtureResponse} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000',errors=[];
const sizes=[{width:1920,height:1080},{width:1366,height:768},{width:1280,height:650},{width:1100,height:640},{width:1366,height:600},{width:1024,height:768},{width:390,height:844}];
function metrics(panel){
 const rows=[...panel.querySelectorAll('tbody tr:not(:has(td[colspan]))')],footer=panel.querySelector('.d4-list-pagination');
 if(!rows.length||!footer)return null;
 const first=rows[0].getBoundingClientRect(),last=rows.at(-1).getBoundingClientRect(),end=footer.getBoundingClientRect();
 return{count:rows.length,row:first.height,last:last.bottom,footer:end.top,bottom:end.bottom,text:footer.textContent};
}
async function settle(page){
 const panel=page.locator('.d4-list-panel').filter({has:page.locator('table')}).first();
 await panel.locator('tbody tr:not(:has(td[colspan]))').first().waitFor();
 await page.waitForFunction(()=>{
  const panel=[...document.querySelectorAll('.d4-list-panel')].find(node=>node.querySelector('table')),rows=panel?.querySelectorAll('tbody tr:not(:has(td[colspan]))');
  if(!rows?.length)return false;
  const fixed=Number(panel.dataset.fixedPageSize);
  if(fixed>0)return rows.length===fixed;
  const footer=panel.querySelector('.d4-list-pagination').getBoundingClientRect(),first=rows[0].getBoundingClientRect(),last=rows[rows.length-1].getBoundingClientRect();
  return innerWidth<1100||innerHeight<640||(last.bottom<=footer.top+1&&footer.top-last.bottom<first.height+2);
 });
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 return panel;
}
try{
 for(const role of ['admin','employee']){
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(role=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({role,id:'1',userId:1,employeeId:2,branchId:3,name:'List layout test'}));},role);
  await page.route('**/api/v1/**',route=>{
   assert.equal(route.request().method(),'GET','Layout tests must not write data');
   const url=new URL(route.request().url()),source=new URL(url);source.searchParams.set('page','1');source.searchParams.set('pageSize','1000');
   const data=fixtureResponse(source,role),resource=url.pathname.split('/').at(-1),id={accounts:'accountid',cards:'cardid',loans:'loanid',customers:'customerid',employees:'employeeid',branches:'branchid','audit-logs':'auditid','fraud-reviews':'reviewcaseid',transactions:'transactionid'}[resource];
   if(id&&Array.isArray(data?.items)&&data.items.length){
    const seeds=data.items,all=Array.from({length:120},(_,index)=>({...seeds[index%seeds.length],[id]:index+1,...(id==='transactionid'?{transactioncode:`TX-LAYOUT-${index+1}`} :{}),...(id==='loanid'?{loancode:`LN-LAYOUT-${index+1}`}:{})}));
    const page=Number(url.searchParams.get('page')||1),pageSize=Number(url.searchParams.get('pageSize')||20);
    data.items=all.slice((page-1)*pageSize,page*pageSize);data.total=all.length;data.page=page;data.pageSize=pageSize;
   }
   return route.fulfill({json:data});
  });
  for(const path of ['cards','loans','customers','accounts','transactions','fraud',...(role==='admin'?['employees','branches','audit-logs']:[])]){
   await page.setViewportSize(sizes[0]);await page.goto(`${base}/${role}/${path}`);
   for(const size of sizes){
    await page.setViewportSize(size);const panel=await settle(page),result=await panel.evaluate(metrics);
    if(role==='admin'&&path==='employees')assert.equal(result.count,8);
    else if(['customers','accounts'].includes(path)||(role==='admin'&&path==='loans'))assert.equal(result.count,7);
    else if(path==='transactions')assert.equal(result.count,role==='employee'?6:5);
    else if(path==='cards')assert.equal(result.count,role==='employee'?11:12);
    else if(path==='fraud')assert.equal(result.count,11);
    else if(role==='admin'&&path==='audit-logs')assert.equal(result.count,11);
    else if(size.width>=1100&&size.height>=640){
     assert.ok(result.last<=result.footer+1,JSON.stringify({role,path,size,result}));assert.ok(result.footer-result.last<result.row+2,JSON.stringify({role,path,size,result}));assert.ok(result.bottom<=size.height+1,JSON.stringify({role,path,size,result}));
    }else assert.ok(result.count>=3&&result.count<=100);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    console.log('PASS fitted list',role,path,size.width,size.height,result.count);
   }
   await page.setViewportSize(sizes[0]);let panel=await settle(page);const normal=await panel.evaluate(metrics);
   const tall=await page.addStyleTag({content:'.dashboard-shell main .d4-list-panel table tbody td {font-size:20px !important;line-height:36px !important;padding-block:8px !important;}'});
   panel=await settle(page);const enlarged=await panel.evaluate(metrics);
   if(role==='admin'&&path==='employees')assert.equal(enlarged.count,8);
   else if(['customers','accounts'].includes(path)||(role==='admin'&&path==='loans'))assert.equal(enlarged.count,7);
   else if(path==='transactions')assert.equal(enlarged.count,role==='employee'?6:5);
   else if(path==='cards')assert.equal(enlarged.count,role==='employee'?11:12);
   else if(path==='fraud')assert.equal(enlarged.count,11);
   else if(role==='admin'&&path==='audit-logs')assert.equal(enlarged.count,11);
   else assert.ok(enlarged.count<normal.count,JSON.stringify({role,path,normal,enlarged}));
   if(['cards','fraud','audit-logs'].includes(path)){
    await panel.locator('tbody tr').last().scrollIntoViewIfNeeded();
    const visible=await panel.evaluate(metrics);assert.ok(visible.last<=visible.footer+1);
   }else assert.ok(enlarged.last<=enlarged.footer+1);
   await tall.evaluate(node=>node.remove());panel=await settle(page);assert.equal((await panel.evaluate(metrics)).count,normal.count);
   await panel.getByRole('button',{name:'Trang sau',exact:true}).click();await panel.getByRole('button',{name:'Trang trước',exact:true}).click();
   console.log('PASS font resize and pagination',role,path);
  }
  await page.close();
 }
 const customer=await browser.newPage();
 customer.on('pageerror',error=>errors.push(error.message));
 await customer.addInitScript(()=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({role:'customer',id:'101',customerId:101,name:'Customer list test'}));});
 await customer.route('**/api/v1/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:fixtureResponse(new URL(route.request().url()),'customer')});});
 for(const path of ['','accounts','transactions','cards']){
  await customer.setViewportSize(sizes[0]);await customer.goto(`${base}/customer/${path}`);
  await customer.locator('.d4-list-panel tbody tr').first().waitFor();
  for(const size of [sizes[0],sizes[1],sizes.at(-1)]){
   await customer.setViewportSize(size);
   await customer.waitForFunction(()=>[...document.querySelectorAll('.d4-list-panel')].filter(panel=>panel.querySelector('table')).every(panel=>{
    const rows=panel.querySelectorAll('tbody tr:not(:has(td[colspan]))'),footer=panel.querySelector('.d4-list-pagination');
    if(!rows.length||!footer)return false;
    if(panel.querySelector('.customer-accounts-table'))return rows.length===2;
    if(innerWidth<1100)return rows.length>=3;
    const first=rows[0].getBoundingClientRect(),last=rows[rows.length-1].getBoundingClientRect(),end=footer.getBoundingClientRect();
    return last.bottom<=end.top+1&&end.top-last.bottom<first.height+2;
   }));
   for(const panel of await customer.locator('.d4-list-panel').filter({has:customer.locator('table')}).all()){
    const result=await panel.evaluate(metrics);
    assert.ok(result.last<=result.footer+1,JSON.stringify({path,size,result}));
    if(await panel.locator('.customer-accounts-table').count())assert.equal(result.count,2,'Explicit two-account limit must remain unchanged');
    const previous=await panel.locator('tbody tr').first().textContent();
    await panel.getByRole('button',{name:'Trang sau',exact:true}).click();
    assert.notEqual(await panel.locator('tbody tr').first().textContent(),previous);
    await panel.getByRole('button',{name:'Trang trước',exact:true}).click();
   }
   assert.ok(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   console.log('PASS customer list',path||'home',size.width);
  }
 }
 await customer.close();
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
