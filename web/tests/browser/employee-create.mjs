import assert from 'node:assert/strict';
import {fixtureResponse,employees} from './fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
const base=process.env.WEB_AUDIT_URL||'http://localhost:3000';
try{
 for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:568}]){
  const page=await browser.newPage({viewport});const errors=[],writes=[];let created=null,referenceReady=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('d4-access-token','test-only');
   localStorage.setItem('d4-session',JSON.stringify({id:'1',role:'admin',userId:1,employeeId:2,branchId:3,name:'Kiểm tra'}));
  });
  await page.route('**/api/v1/**',route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==='POST'){
    assert.ok(url.pathname.endsWith('/management/employees'),'Creating a profile must not create a login');
    const body=request.postDataJSON();writes.push(body);
    if(writes.length===1)return route.fulfill({status:409,json:{code:'EMPLOYEE_EMAIL_EXISTS',field:'email',message:'Email đã được sử dụng cho nhân viên khác.'}});
    if(writes.length===2)return route.fulfill({status:409,json:{code:'EMPLOYEE_PHONE_EXISTS',field:'phone',message:'Số điện thoại đã được sử dụng cho nhân viên khác.'}});
    if(writes.length===3)return route.fulfill({status:503,json:{code:'CONFIGURATION',message:'Chức năng cấp mã nhân viên chưa được cấu hình. Vui lòng liên hệ quản trị viên.'}});
    created={employeeid:99,employeecode:'EMP0099',fullname:body.name,branchid:body.branchId,roleid:body.roleId,branchname:'Chi nhánh kiểm thử',rolename:'Giao dịch viên kiểm thử',hiredate:body.hireDate,salary:body.salary,email:body.email,phone:body.phone,status:'Active'};
    return route.fulfill({json:created});
   }
   if(url.pathname.endsWith('/admin/reference-data')){
    if(!referenceReady)return route.fulfill({status:503,json:{message:'Không thể tải danh mục thử nghiệm'}});
    const data=fixtureResponse(url,'admin');data.branches=[{id:1,name:'Chi nhánh kiểm thử'}];data.roles=[{id:7,name:'Giao dịch viên kiểm thử'}];return route.fulfill({json:data});
   }
   if(url.pathname.endsWith('/admin/employees')){
    const all=created?[created,...employees]:employees,n=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||20);
    return route.fulfill({json:{items:all.slice((n-1)*size,n*size),total:all.length,page:n,pageSize:size}});
   }
   return route.fulfill({json:fixtureResponse(url,'admin')});
  });
  await page.goto(base+'/admin/employees');
  await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Thêm nhân viên',exact:true});await dialog.waitFor();
  const create=dialog.getByRole('button',{name:'Tạo nhân viên',exact:true});
  assert.equal(await dialog.locator('input[name="code"],input[name="employeeid"],input[name="branchId"],input[name="roleId"]').count(),0);
  await dialog.getByRole('alert').filter({hasText:'Không thể tải danh mục tham chiếu'}).waitFor();
  assert.equal(await create.isDisabled(),true);
  referenceReady=true;await dialog.getByRole('button',{name:'Thử lại',exact:true}).click();
  await dialog.getByLabel('Vai trò',{exact:true}).selectOption('7');
  await dialog.getByLabel('Chi nhánh',{exact:true}).selectOption('1');
  assert.equal(await dialog.getByLabel('Giới tính',{exact:true}).getAttribute('required'),null);
  assert.equal(await dialog.getByLabel('Ngày sinh',{exact:true}).getAttribute('required'),null);
  await create.click();await dialog.getByRole('alert').filter({hasText:'Vui lòng nhập họ tên'}).waitFor();
  await dialog.getByLabel('Họ tên',{exact:true}).fill('Nhân viên kiểm thử');
  await dialog.getByLabel('Điện thoại',{exact:true}).fill('invalid-phone');
  await dialog.getByLabel('Email',{exact:true}).fill('EMPLOYEE@EXAMPLE.INVALID');
  await dialog.getByLabel('Lương (VND)',{exact:true}).fill('-1');
  await create.click();await dialog.getByRole('alert').filter({hasText:'Lương phải từ 0'}).waitFor();assert.equal(writes.length,0);
  await dialog.getByLabel('Lương (VND)',{exact:true}).fill('0');
  await create.click();await dialog.getByRole('alert').filter({hasText:'Số điện thoại không đúng định dạng'}).waitFor();
  await dialog.getByLabel('Điện thoại',{exact:true}).fill('0901234567');
  await dialog.getByLabel('Ngày sinh',{exact:true}).fill('2000-01-01');
  await dialog.getByLabel('Ngày vào làm',{exact:true}).fill('1999-12-31');
  await create.click();await dialog.getByRole('alert').filter({hasText:'Ngày vào làm không được trước ngày sinh'}).waitFor();assert.equal(writes.length,0);
  await dialog.getByLabel('Ngày sinh',{exact:true}).fill('');
  await dialog.getByLabel('Ngày vào làm',{exact:true}).fill('2026-11-20');
  const bounds=await dialog.boundingBox(),footer=await dialog.locator('form > footer').boundingBox();
  assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
  assert.ok(footer.y>=bounds.y&&footer.y+footer.height<=bounds.y+bounds.height+1);
  await page.screenshot({path:`/tmp/d4-employee-create-${viewport.width}.png`});
  await create.click();await dialog.getByRole('alert').filter({hasText:'Email đã được sử dụng'}).waitFor();assert.equal(await dialog.getByLabel('Email',{exact:true}).getAttribute('aria-invalid'),'true');
  await create.click();await dialog.getByRole('alert').filter({hasText:'Số điện thoại đã được sử dụng'}).waitFor();assert.equal(await dialog.getByLabel('Điện thoại',{exact:true}).getAttribute('aria-invalid'),'true');
  await create.click();await dialog.getByRole('alert').filter({hasText:'Chức năng cấp mã nhân viên chưa được cấu hình'}).waitFor();
  await create.click();await dialog.getByRole('status').filter({hasText:'Đã tạo hồ sơ nhân viên'}).waitFor();
  await dialog.getByText('EMP0099',{exact:true}).waitFor();await dialog.getByText('Chi nhánh kiểm thử',{exact:true}).waitFor();await dialog.getByText('Giao dịch viên kiểm thử',{exact:true}).waitFor();
  await dialog.getByText(/Tài khoản đăng nhập và mật khẩu chưa được tạo/).waitFor();
  assert.equal(writes.length,4);const sent=writes.at(-1);assert.equal(sent.code,undefined);assert.equal(sent.birthDate,undefined);assert.equal(sent.gender,undefined);assert.equal(sent.salary,'0');assert.equal(sent.email,'employee@example.invalid');assert.equal(sent.branchId,1);assert.equal(sent.roleId,7);assert.equal(sent.password,undefined);
  await dialog.getByRole('button',{name:'Đóng',exact:true}).click();await page.getByRole('table').getByText('EMP0099',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  console.log('PASS employee creation, reference retry, required/optional fields, dates, salary, duplicate errors and layout',viewport.width);await page.close();
 }
}finally{await browser.close();}
