import assert from 'node:assert/strict';
import { fixtureResponse, branches } from './fixtures.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const base = process.env.WEB_AUDIT_URL || 'http://localhost:3000';
try {
  for (const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:568}]) {
    const page = await browser.newPage({ viewport });
    const errors = [], writes = [];
    let created = null, refs = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('d4-access-token','test-only');
      localStorage.setItem('d4-session',JSON.stringify({id:'1',role:'admin',userId:1,employeeId:2,branchId:3,name:'Kiểm tra'}));
    });
    await page.route('**/api/v1/**', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.endsWith('/management/branches') && request.method() === 'POST') {
        const body = request.postDataJSON(); writes.push(body);
        if (writes.length === 1) return route.fulfill({status:409,json:{code:'BRANCH_CODE_EXISTS',message:'Mã chi nhánh bị trùng. Vui lòng kiểm tra danh sách trước khi thử lại.'}});
        if (writes.length === 2) return route.fulfill({status:503,json:{code:'CONFIGURATION',message:'Chức năng cấp mã chi nhánh chưa được cấu hình. Vui lòng liên hệ quản trị viên.'}});
        created = {branchid:13,branchcode:'CN013',branchname:body.name,city:body.city,address:body.address,phone:body.phone??null,opendate:body.openDate,status:'Active',employeecount:0,customercount:0};
        return route.fulfill({json:created});
      }
      assert.equal(request.method(),'GET');
      if (url.pathname.endsWith('/admin/reference-data')) { refs++; return route.fulfill({status:503,json:{message:'Simulated reference failure'}}); }
      if (url.pathname.endsWith('/admin/branches')) {
        const all = created ? [created,...branches] : branches;
        const n = Number(url.searchParams.get('page')||1), size = Number(url.searchParams.get('pageSize')||20);
        return route.fulfill({json:{items:all.slice((n-1)*size,n*size),total:all.length,page:n,pageSize:size}});
      }
      return route.fulfill({json:fixtureResponse(url,'admin')});
    });
    await page.goto(base+'/admin/branches');
    await page.getByRole('button',{name:'Thêm chi nhánh',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:'Thêm chi nhánh',exact:true});
    await dialog.waitFor();
    assert.equal(await dialog.locator('input[name="code"],input[name="branchid"]').count(),0);
    assert.match(await dialog.getByLabel('Ngày bắt đầu hoạt động',{exact:true}).inputValue(),/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(await dialog.getByLabel('Số điện thoại liên hệ',{exact:true}).getAttribute('required'),null);
    const create = dialog.getByRole('button',{name:'Tạo chi nhánh',exact:true});
    assert.equal(await create.isEnabled(),true);
    await page.screenshot({path:`/tmp/d4-branch-create-${viewport.width}.png`});
    await create.click();
    await dialog.getByRole('alert').filter({hasText:'Vui lòng nhập tên chi nhánh'}).waitFor();
    assert.equal(writes.length,0);
    await dialog.getByLabel('Tên chi nhánh',{exact:true}).fill('  ');
    await dialog.getByLabel('Tỉnh / Thành phố',{exact:true}).fill('Hà Nội');
    await dialog.getByLabel('Địa chỉ chi nhánh',{exact:true}).fill('12 Đường Kiểm Thử');
    await create.click();
    await dialog.getByRole('alert').filter({hasText:'Vui lòng nhập tên chi nhánh'}).waitFor();
    assert.equal(writes.length,0);
    await dialog.getByLabel('Tên chi nhánh',{exact:true}).fill('Chi nhánh kiểm thử');
    await dialog.getByLabel('Số điện thoại liên hệ',{exact:true}).fill('khong-hop-le');
    await create.click();
    await dialog.getByRole('alert').filter({hasText:'Số điện thoại không đúng định dạng'}).waitFor();
    assert.equal(writes.length,0);
    await dialog.getByLabel('Số điện thoại liên hệ',{exact:true}).fill('');
    await create.click();
    await dialog.getByRole('alert').filter({hasText:'Mã chi nhánh bị trùng'}).waitFor();
    await create.click();
    await dialog.getByRole('alert').filter({hasText:'Chức năng cấp mã chi nhánh chưa được cấu hình'}).waitFor();
    const footer = await dialog.locator('form > footer').boundingBox(), bounds = await dialog.boundingBox();
    assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=viewport.width+1 && bounds.y+bounds.height<=viewport.height+1);
    assert.ok(footer.y>=bounds.y && footer.y+footer.height<=bounds.y+bounds.height+1);
    await create.click();
    await dialog.getByRole('status').filter({hasText:'Đã tạo chi nhánh'}).waitFor();
    await dialog.getByText('CN013',{exact:true}).waitFor();
    assert.equal(writes.length,3); assert.equal(writes.at(-1).code,undefined); assert.equal(writes.at(-1).phone,undefined);
    assert.equal(refs,0,'Branch creation works without fetching unrelated reference data');
    await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
    await page.getByRole('table').getByText('CN013',{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    console.log('PASS branch form, required/optional fields, conflicts, configuration error, refreshed list and layout',viewport.width);
    await page.close();
  }
} finally { await browser.close(); }
