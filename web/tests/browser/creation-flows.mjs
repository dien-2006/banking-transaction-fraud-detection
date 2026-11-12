import assert from 'node:assert/strict';
import {fixtureResponse} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.WEB_AUDIT_URL || 'http://localhost:3001';
const b=await chromium.launch();
try{
 for(const role of ['employee','admin']){
  const p=await b.newPage({viewport:{width:1366,height:768}});
  await p.addInitScript(role=>{
   localStorage.setItem('d4-access-token','test-only');
   localStorage.setItem('d4-session',JSON.stringify({id:'1',role,userId:1,employeeId:2,branchId:3,name:'Kiểm tra'}));
  },role);
  const writes=[];
  await p.route('**/api/v1/**',r=>{
   const url=new URL(r.request().url());
   if(r.request().method()==='POST'){
    const resource=url.pathname.split('/').at(-1),body=r.request().postDataJSON();
    writes.push({resource,body});
    const results={
     customers:{customerid:42,customercode:'C0000042',fullname:body.name},
     accounts:{accountid:7,accountnumber:'1000000000000007',currency:'VND'},
     cards:{cardid:1,maskedcardnumber:'************0008',cardtype:body.cardType,expirydate:body.expiryDate},
     loans:{loanid:1,loancode:'LN00000001',principalamount:body.principal,termmonths:body.termMonths,status:'Pending'}
    };
    return r.fulfill({json:results[resource]});
   }
   if(url.pathname.endsWith('/admin/customers'))return r.fulfill({json:{items:[{customerid:42,customercode:'C0000042',fullname:'Nguyễn Văn An',status:'Active'}],total:1,page:1,pageSize:20}});
   if(url.pathname.endsWith('/management/customers/42/accounts'))return r.fulfill({json:[{accountid:'7',accountnumber:'1000000000000007',branchid:3,branchname:'Chi nhánh 3',accounttypename:'Thanh toán'}]});
   const response=fixtureResponse(url,role);
   if(url.pathname.endsWith('/admin/reference-data')){
    response.loanTypes=[{id:1,name:'Vay kiểm thử',maximumAmount:50000000,defaultInterestRate:8.5,maximumTermMonths:36}];
    response.cardTypes=['Debit','Credit'];
   }
   return r.fulfill({json:response});
  });
  for(const [resource,button,title] of [['customers','Thêm khách hàng','Thêm khách hàng'],['accounts','Mở tài khoản','Mở tài khoản'],['cards','Phát hành thẻ','Phát hành thẻ'],['loans','Tạo hồ sơ vay','Tạo hồ sơ vay']]){
   await p.setViewportSize({width:1366,height:768});
   await p.goto(base+'/'+role+'/'+resource);
   await p.getByRole('button',{name:button,exact:true}).click();
   const d=p.getByRole('dialog',{name:title,exact:true});
   await d.waitFor();
   if(resource==='accounts'){
    assert.ok(await d.locator('.account-owner-picker').evaluate(owner=>!!(owner.compareDocumentPosition(document.querySelector('select[name="branchId"]'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Choose the account owner before account details');
    assert.equal(await d.getByText(/ID 42/).count(),0,'Account form displays the business customer code');
    for(const size of [{width:1366,height:768},{width:375,height:812}]){
     await p.setViewportSize(size);
     await p.screenshot({path:'/tmp/d4-account-form-'+role+'-empty-'+size.width+'.png'});
     const footer=await d.locator('form > footer').boundingBox();
     assert.ok(footer.y>=0&&footer.y+footer.height<=size.height,'Account actions remain visible before choosing a customer');
    }
    await p.setViewportSize({width:1366,height:768});
   }
   assert.equal(await d.locator('input[name="code"],input[name="cardNumber"],input[name="accountNumber"],input[name="customerId"],input[name="accountId"]').count(),0);
   const before=writes.length;
   if(resource==='customers'){
    await d.getByLabel('Họ tên',{exact:true}).fill('Khách hàng mới');
   }else{
    if(resource==='accounts'||resource==='loans') {
     const branches=d.getByLabel('Chi nhánh',{exact:true});
     const options=await branches.locator('option').evaluateAll(items=>items.filter(item=>item.value).map(item=>({value:item.value,disabled:item.disabled})));
     assert.ok(options.length>1,'Show all reference branches instead of filtering to the employee branch');
     for(const option of options)assert.equal(option.disabled,role==='employee'&&option.value!=='3');
     await branches.selectOption('3');
    }
    if(resource==='accounts'){
     assert.equal(await d.locator('[name="category"]').count(),0);
     await d.getByLabel('Loại tài khoản',{exact:true}).selectOption({index:1});
     await d.getByRole('button',{name:'Mở tài khoản',exact:true}).click();
     await d.getByRole('alert').filter({hasText:/Vui lòng chọn khách hàng/}).waitFor();
     assert.equal(writes.length,before,'Opening an account requires an existing owner');
    }
    if(resource==='loans'){
     await d.getByLabel('Sản phẩm vay',{exact:true}).selectOption('1');
     assert.equal(await d.getByLabel('Lãi suất (%/năm)',{exact:true}).inputValue(),'8.5');
     await d.getByLabel('Số tiền vay (VND)',{exact:true}).fill('10000000');
     await d.getByLabel('Kỳ hạn (tháng)',{exact:true}).fill('12');
    }
    await d.getByRole('button',{name:/Nguyễn Văn An/}).click();
    if(resource==='accounts'){
     await d.locator('.account-owner-selected').getByText('C0000042',{exact:true}).waitFor();
     assert.equal(await d.getByText(/ID 42/).count(),0);
    }else await d.getByText(/ID 42/).waitFor();
    if(resource==='cards'){
     await d.getByLabel('Tài khoản liên kết',{exact:true}).selectOption('7');
     await d.getByLabel('Loại thẻ',{exact:true}).fill('Debit');
     await d.getByLabel('Ngày hết hạn',{exact:true}).fill('2099-01-01');
     await d.getByLabel('Hạn mức ngày (VND)',{exact:true}).fill('1000000');
     await d.getByLabel('PIN ban đầu',{exact:true}).fill('1234');
     await d.getByLabel('Xác nhận PIN',{exact:true}).fill('4321');
     await d.getByRole('button',{name:'Phát hành thẻ',exact:true}).click();
     await d.getByRole('alert').filter({hasText:/không khớp/}).waitFor();
     assert.equal(writes.length,before);
     await d.getByLabel('Xác nhận PIN',{exact:true}).fill('1234');
    }
   }
   for(const size of [{width:1366,height:768},{width:375,height:812}]){
    await p.setViewportSize(size);
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const f=await d.locator('form > footer').boundingBox();
    assert.ok(f.y>=0&&f.y+f.height<=size.height,resource+' footer');
    await p.screenshot({path:'/tmp/d4-create-'+role+'-'+resource+'-'+size.width+'.png'});
   }
   const action=resource==='customers'?'Tạo khách hàng':button;
   await d.getByRole('button',{name:action,exact:true}).click();
   await d.getByLabel('Kết quả tạo hồ sơ',{exact:true}).waitFor();
   assert.equal(writes.length,before+1);
   const sent=writes.at(-1).body;
   if(resource!=='customers')assert.equal(sent.customerId,42);
   if(resource==='accounts')assert.equal(sent.category,'CUSTOMER');
   assert.equal('code' in sent,false);assert.equal('cardNumber' in sent,false);assert.equal('accountNumber' in sent,false);
   if(resource==='cards'){assert.equal(sent.accountId,7);assert.equal('confirmPin' in sent,false);assert.equal(await d.getByText('1234',{exact:true}).count(),0);}
   if(resource==='loans')await d.getByText(/đang chờ phê duyệt/).waitFor();
   await d.getByRole('button',{name:'Đóng',exact:true}).click();
   await d.waitFor({state:'hidden'});
   console.log(role,resource,'PASS');
  }
  await p.close();
 }
}finally{await b.close();}
