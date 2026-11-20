import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtureResponse,loanRows} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000';
await mkdir('/tmp/d4-loan-disbursement',{recursive:true});
try{
 for(const [scenario,width] of [['filtered',390],['linked-network',390],['linked',390],['Success',1366],['Pending',390],['Cancelled',320],['Failed',390],['network',390],['malformed',390],['no-funding',390],['no-accounts',320]]){
  const height=width===320?568:844,page=await browser.newPage({viewport:{width,height}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({id:'1',role:'employee',userId:1,employeeId:1,branchId:3,name:'Kiểm thử giải ngân'}));});
  let status='Pending',transaction=null;
  await page.route('**/api/v1/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/api/v1','');
   if(req.method()==='POST'){
    assert.equal(path,'/management/loans/901/decision');const data=req.postDataJSON();writes.push(data);
    assert.equal(data.decision,'APPROVE');assert.equal(data.destinationAccountId,1);assert.match(data.requestKey,/^[0-9a-f-]{36}$/);
    assert.ok(!('amount' in data));assert.ok(!('sourceAccountId' in data));
    if(writes.length>1)assert.deepEqual(data,writes[0]);
    const outcome=['Success','Pending','Cancelled','Failed'].includes(scenario)?scenario:'Success';
    status=outcome==='Success'?'Active':'Pending';
    transaction={transactionid:701,transactioncode:'LD-'+data.requestKey,typecode:'DEPOSIT',amount:'1000000',currency:'VND',status:outcome,destinationaccountid:1,decision:outcome==='Pending'?'REVIEW':outcome==='Cancelled'?'BLOCK':'ALLOW',reviewcaseid:outcome==='Pending'?81:undefined};
    await new Promise(resolve=>setTimeout(resolve,120));
    if(['network','linked-network'].includes(scenario)&&writes.length===1)return route.fulfill({status:503,json:{message:'Mất kết nối sau khi gửi lệnh'}});
    return route.fulfill({json:{loanid:901,status,disbursement:scenario==='malformed'&&writes.length===1?{...transaction,transactioncode:'WRONG'}:transaction}});
   }
   if(path==='/admin/loans')return route.fulfill({json:{items:[{...loanRows[0],loanid:901,loancode:'LN00000901',principalamount:'1000000',status}],total:1,page:1,pageSize:20}});
   if(path==='/management/loans/901/disbursement-options')return route.fulfill({json:{loanId:901,status,ready:scenario!=='no-funding',unavailableReason:scenario==='no-funding'?'Ngân hàng chưa cấu hình tài khoản nguồn giải ngân.':null,accounts:scenario==='no-accounts'?[]:[{accountId:1,accountNumber:'1000000000000001'}],disbursement:transaction}});
   return route.fulfill({json:fixtureResponse(url,'employee')});
  });
  await page.goto(base+'/employee/loans'+(scenario.startsWith('linked')?'?loanId=901':''));if(scenario==='filtered')await page.getByLabel('Trạng thái khoản vay',{exact:true}).selectOption('Pending');if(!scenario.startsWith('linked'))await page.getByRole('button',{name:'Xử lý',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Xử lý hồ sơ vay',exact:true});
  const confirm=dialog.getByRole('button',{name:'Xác nhận duyệt và giải ngân',exact:true});
  await dialog.getByLabel('Lý do xử lý *',{exact:true}).fill('Đã kiểm tra hồ sơ và tài khoản nhận');
  if(scenario!=='no-accounts')await dialog.getByLabel('Tài khoản nhận giải ngân *',{exact:true}).selectOption('1');
  const box=await dialog.boundingBox(),footer=await dialog.locator('form > footer').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);assert.ok(footer.y+footer.height<=height+1);
  if(['no-funding','no-accounts'].includes(scenario)){assert.equal(await confirm.isDisabled(),true);assert.equal(writes.length,0);}
  else{
   await confirm.evaluate(node=>{node.click();node.click();});
   if(['network','linked-network','malformed'].includes(scenario)){await dialog.getByRole('button',{name:'Thử lại đúng lệnh',exact:true}).click();}
   const outcome=['Success','filtered','linked','linked-network','network','malformed'].includes(scenario)?'success':scenario==='Pending'?'pending':scenario==='Cancelled'?'cancelled':'failed';
   await dialog.locator(`[data-outcome="${outcome}"]`).waitFor();assert.equal(await page.getByRole('dialog').count(),1);
   assert.equal(writes.length,['network','linked-network','malformed'].includes(scenario)?2:1);
   if(scenario==='Pending')assert.match(await dialog.getByRole('link',{name:'Xem hồ sơ review',exact:true}).getAttribute('href'),/employee\/fraud\?reviewId=81$/);
   await page.screenshot({path:`/tmp/d4-loan-disbursement/${scenario}-${width}.png`});
   await dialog.getByRole('button',{name:'Đóng',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  assert.deepEqual(errors,[]);console.log('PASS loan disbursement',scenario,width);await page.close();
 }
}finally{await browser.close();}
