import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtureResponse,cardRows} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(),base=process.env.WEB_AUDIT_URL||'http://localhost:3000';
const raw='9000000000008052',formatted='9000 0000 0000 8052',errors=[];
await mkdir('/tmp/d4-card-number',{recursive:true});
try{
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.addInitScript(()=>{localStorage.setItem('d4-access-token','test-only');localStorage.setItem('d4-session',JSON.stringify({id:'101',role:'customer',customerId:101,name:'Kiểm tra thẻ'}));});
  let requests=0;
  await page.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');
   if(path==='/me/cards')return route.fulfill({json:[{...cardRows[0],cardid:71,maskedcardnumber:'************8052',status:'Active'}]});
   if(route.request().method()==='POST'){
    assert.equal(path,'/me/cards/71/reveal-number');requests++;const body=route.request().postDataJSON();assert.deepEqual(Object.keys(body),['password']);
    return route.fulfill({status:body.password==='correct-password'?200:403,headers:{'Cache-Control':'no-store, private'},json:body.password==='correct-password'?{cardId:71,cardNumber:raw,expiresIn:30}:{message:'Không thể xác thực quyền xem thẻ. Vui lòng kiểm tra mật khẩu đăng nhập.'}});
   }
   return route.fulfill({json:fixtureResponse(url,'customer')});
  });
  await page.goto(base+'/customer/cards');await page.getByRole('button',{name:/Xem thẻ/}).first().click();
  const dialog=page.getByRole('dialog',{name:'Thông tin thẻ',exact:true});
  assert.ok(!(await page.locator('body').innerText()).includes(formatted));assert.equal(requests,0);
  await dialog.getByRole('button',{name:'Hiện số thẻ',exact:true}).click();
  await dialog.getByLabel('Mật khẩu đăng nhập để xem số thẻ',{exact:true}).fill('incorrect-password');
  await dialog.getByRole('button',{name:'Xác thực và hiện số thẻ',exact:true}).click();await dialog.getByRole('alert').waitFor();
  assert.ok(await page.evaluate(()=>!!localStorage.getItem('d4-access-token')));
  const reveal=async()=>{
   if(await dialog.getByRole('button',{name:'Hiện số thẻ',exact:true}).count())await dialog.getByRole('button',{name:'Hiện số thẻ',exact:true}).click();
   await dialog.getByLabel('Mật khẩu đăng nhập để xem số thẻ',{exact:true}).fill('correct-password');
   await dialog.getByRole('button',{name:'Xác thực và hiện số thẻ',exact:true}).click();
   await dialog.locator('.card-number-value strong').getByText(formatted,{exact:true}).waitFor();
   assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).includes(raw));
  };
  await reveal();await page.screenshot({path:`/tmp/d4-card-number/revealed-${width}.png`});
  await page.clock.runFor(31_000);assert.ok(!(await dialog.innerText()).includes(formatted));
  await reveal();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.ok(!(await dialog.innerText()).includes(formatted));
  await reveal();await dialog.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();assert.ok(!(await page.locator('body').innerText()).includes(formatted));
  await page.getByRole('button',{name:/Xem thẻ/}).first().click();await dialog.getByRole('button',{name:'Hiện số thẻ',exact:true}).waitFor();assert.ok(!(await dialog.innerText()).includes(formatted));
  assert.equal(requests,4);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.close();console.log('PASS card reveal reauthentication, wrong-password session, auto-hide, blur, close and no storage',width);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
