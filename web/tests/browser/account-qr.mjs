import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { QRCodeWriter, BarcodeFormat, EncodeHintType } from "@zxing/library";
import { fixtureResponse, accountRows, transactionRows } from "./fixtures.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();
const base = process.env.WEB_AUDIT_URL || "http://localhost:3000";
const source = { ...accountRows[0], accountnumber: "DEMO-0001", accounttypename: "Thanh toán" };
const destination = { ...accountRows[1] };
const rows = [source, destination, { ...accountRows[2], status: "Frozen" }, accountRows[22], accountRows[23]];
const errors = [], writes = [];
await mkdir("/tmp/d4-qr", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__qrCardLabels = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      window.__qrCardLabels.push(String(args[0]));
      return fillText.apply(this, args);
    };
    localStorage.setItem("d4-access-token", "test-only");
    localStorage.setItem("d4-session", JSON.stringify({ id: "101", role: "customer", customerId: 101, name: "Khách hàng QR" }));
  });
  let otpContext;
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/me/accounts")) return route.fulfill({ json: rows });
    if (url.pathname.includes("/transactions/destinations/")) {
      const account = url.pathname.split("/").at(-1);
      if (account.startsWith("404")) return route.fulfill({ status: 404, json: { message: "Không tìm thấy tài khoản nhận đang hoạt động." } });
      const row = account === source.accountnumber ? source : destination;
      return route.fulfill({ json: { accountId: row.accountid, accountNumber: row.accountnumber, accountName: "Chủ tài khoản được DB xác minh", currency: "VND", bankName: "D4 Bank" } });
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (url.pathname.endsWith("/security/otp/request")) {
        otpContext = body;
        return route.fulfill({ json: { challengeId: "qr-test-challenge-12345", expiresIn: 300, destinationMasked: "qr***@example.test" } });
      }
      if (url.pathname.endsWith("/security/otp/verify")) return route.fulfill({ json: { authorizationToken: "test-qr-authorization-token" } });
      assert.ok(url.pathname.endsWith("/transactions/transfers"));
      const { otpAuthorizationToken, ...context } = body;
      assert.equal(otpAuthorizationToken, "test-qr-authorization-token");
      assert.deepEqual(context, otpContext);
      writes.push(body);
      return route.fulfill({ json: { ...transactionRows[0], transactioncode: "TX-QR-001", status: "Success", amount: body.amount } });
    }
    return route.fulfill({ json: fixtureResponse(url, "customer") });
  });
  await page.goto(base + "/customer/accounts");
  const qrButton = number => page.getByRole("button", { name: `Mã QR nhận tiền tài khoản ${number}`, exact: true });
  const showAccount = async number => {
    await page.locator('.customer-accounts-list.d4-list-panel').waitFor();
    const panel=page.locator('.customer-accounts-list');
    const previous=panel.getByRole('button',{name:'Trang trước',exact:true});
    while(await previous.isEnabled())await previous.click();
    for(let i=0;i<=rows.length;i++){
      if(await qrButton(number).count())return;
      const next=panel.getByRole('button',{name:'Trang sau',exact:true});
      assert.ok(await next.isEnabled(),'Receiving account remains reachable through pagination');
      await next.click();
    }
    assert.fail('Receiving account not found');
  };
  await showAccount(rows[2].accountnumber);
  assert.equal(await qrButton(rows[2].accountnumber).isDisabled(), true);
  assert.equal(await qrButton(rows[3].accountnumber).count(), 0);
  assert.equal(await qrButton(rows[4].accountnumber).count(), 0);
  for(const size of [{width:1920,height:1080},{width:1366,height:900},{width:1100,height:800},{width:1024,height:768},{width:375,height:812}]){
    await page.setViewportSize(size);
    const layout=await page.locator('.customer-account-actions').evaluateAll(groups=>groups.map(group=>{
      const cell=group.closest('td').getBoundingClientRect();
      return {left:cell.left,right:cell.right,buttons:[...group.querySelectorAll('button')].map(button=>{
        const r=button.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,height:r.height};
      })};
    }));
    assert.ok(layout.some(row=>row.buttons.length===2));
    for(const row of layout){
      for(const button of row.buttons)assert.ok(button.x>=row.left-1&&button.right<=row.right+1,'Account actions fit their column');
      if(row.buttons.length===2){
        assert.ok(Math.abs(row.buttons[0].y-row.buttons[1].y)<1,'Details and QR remain on one row');
        assert.ok(Math.abs(row.buttons[0].height-row.buttons[1].height)<1,'Actions have matching heights');
      }
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`/tmp/d4-qr/account-actions-${size.width}.png`});
  }
  await page.setViewportSize({width:1366,height:900});
  const images = [];
  const screenImages = [];
  for (const account of [source, destination]) {
    await showAccount(account.accountnumber);
    await qrButton(account.accountnumber).click();
    const dialog = page.getByRole("dialog", { name: "QR nhận tiền", exact: true });
    await dialog.getByRole("img", { name: `Mã QR nhận tiền tài khoản ${account.accountnumber}`, exact: true }).waitFor();
    const centerColors = await dialog.locator('.receiving-qr-image img').evaluate(async image => {
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(canvas.width/2-30, canvas.height/2-30, 60, 60).data;
      let colors=0;
      for(let i=0;i<pixels.length;i+=4) if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>80) colors++;
      return colors;
    });
    assert.ok(centerColors>20, 'The bank mark is embedded in the QR image itself');
    assert.equal(await dialog.locator('.receiving-qr-bank svg').count(), 1, 'Use the bank logo');
    for (const size of [{ width: 1366, height: 768 }, { width: 1024, height: 600 },
      { width: 375, height: 667 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 375, height: 480 }]) {
      await page.setViewportSize(size);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.y >= 11 && bounds.y + bounds.height <= size.height - 11, `QR dialog fits ${size.width}x${size.height}`);
      assert.ok(await dialog.evaluate(node => node.scrollHeight <= node.clientHeight + 1), 'QR dialog needs no scrolling');
      for (const item of [dialog.getByRole('button', { name: 'Đóng hộp thoại' }), dialog.getByRole('link', { name: 'Tải ảnh QR', exact: true }), dialog.locator('.receiving-qr-image')]) {
        const box = await item.boundingBox();
        assert.ok(box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height + 1, 'QR, close and download stay inside dialog');
      }
      await page.screenshot({ path: `/tmp/d4-qr/receive-${account.accountid}-${size.width}-${size.height}.png` });
      if(size.width===375&&size.height===480) screenImages.push(await dialog.locator('.receiving-qr-image img').screenshot());
    }
    const pending = page.waitForEvent("download");
    await dialog.getByRole("link", { name: "Tải ảnh QR", exact: true }).click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), `D4Bank-QR-${account.accountnumber}.png`);
    const buffer = await readFile(await download.path());
    assert.deepEqual([...buffer.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
    assert.equal(buffer.readUInt32BE(16), 1120, 'Download is the complete receiving card');
    assert.ok(buffer.readUInt32BE(20)>buffer.readUInt32BE(16), 'Card includes identity and branding above the QR');
    const painted=await page.evaluate(()=>window.__qrCardLabels);
    for(const label of ['QR nhận tiền','Khách hàng QR',account.accountnumber,'Bank']) assert.ok(painted.includes(label));
    await download.saveAs(`/tmp/d4-qr/card-${account.accountid}.png`);
    images.push(buffer);
    await dialog.getByRole("button", { name: "Đóng hộp thoại" }).click();
  }
  assert.notDeepEqual(images[0], images[1], "Each account has a different QR");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "Ẩn số dư", exact: true }).click();
  assert.ok(await page.getByRole("button", { name: "Mã QR nhận tiền", exact: true }).first().isDisabled());
  assert.equal(writes.length, 0);
  console.log("PASS account-specific PNG, active VND receiving accounts, privacy and responsive dialog");

  await page.goto(base + "/customer/transfer");
  const openScanner = async () => {
    await page.getByRole("button", { name: "Quét QR", exact: true }).click();
    return page.getByRole("dialog", { name: "Quét QR chuyển tiền", exact: true });
  };
  const upload = async buffer => {
    const scanner = await openScanner();
    await scanner.getByLabel("Chọn ảnh QR", { exact: true }).setInputFiles({ name: "qr.png", mimeType: "image/png", buffer });
    return scanner;
  };
  const qrBuffer = async payload => {
    const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 0, 0, new Map([[EncodeHintType.MARGIN, 4]]));
    const bits = Array.from({ length: matrix.getHeight() }, (_, y) => Array.from({ length: matrix.getWidth() }, (_, x) => matrix.get(x, y)));
    const data = await page.evaluate(bits => {
      const canvas = document.createElement("canvas"); canvas.width = bits[0].length * 10; canvas.height = bits.length * 10;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "black";
      bits.forEach((row, y) => row.forEach((bit, x) => { if (bit) ctx.fillRect(x * 10, y * 10, 10, 10); }));
      return canvas.toDataURL("image/png").split(",")[1];
    }, bits);
    return Buffer.from(data, "base64");
  };
  const payload = accountNumber => JSON.stringify({ type: "D4BANK_TRANSFER", version: 1, currency: "VND", accountNumber });
  const foreign = await qrBuffer("https://example.test/foreign-payment");
  let scanner = await upload(foreign);
  await scanner.getByRole("alert").filter({ hasText: /không phải mã QR/ }).waitFor();
  assert.equal(await page.getByLabel("Tài khoản nhận", { exact: true }).inputValue(), "");
  await scanner.getByRole("button", { name: "Đóng hộp thoại" }).click();
  scanner = await upload(await qrBuffer(payload("4040000001")));
  await scanner.waitFor({ state: "hidden" });
  await page.getByText("Không tìm thấy tài khoản nhận đang hoạt động.", { exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: "Tiếp tục", exact: true }).isDisabled());
  scanner = await upload(images[0]);
  await scanner.waitFor({ state: "hidden" });
  await page.getByText("Tài khoản nhận phải khác tài khoản nguồn.", { exact: true }).waitFor();
  scanner = await upload(images[1]);
  await scanner.waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("Tài khoản nhận", { exact: true }).inputValue(), destination.accountnumber);
  await page.getByText("Chủ tài khoản được DB xác minh", { exact: true }).waitFor();
  scanner = await upload(screenImages[1]);
  await scanner.waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("Tài khoản nhận", { exact: true }).inputValue(), destination.accountnumber);
  await page.getByText("Chủ tài khoản được DB xác minh", { exact: true }).waitFor();
  scanner = await upload(await qrBuffer(payload(destination.accountnumber)));
  await scanner.waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("Tài khoản nhận", { exact: true }).inputValue(), destination.accountnumber);
  assert.equal(writes.length, 0);
  console.log("PASS complete card and small on-screen QR decoding, foreign/invalid/self recipient rejection and DB verification");

  scanner = await openScanner();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
  });
  await scanner.getByRole("button", { name: "Mở camera", exact: true }).click();
  await scanner.getByRole("alert").filter({ hasText: /chưa cho phép/ }).waitFor();
  await scanner.getByRole("button", { name: "Đóng hộp thoại" }).click();
  scanner = await openScanner();
  await page.evaluate(() => {
    window.__cameraRequested = false;
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.__cameraRequested = true; window.__resolveCamera = resolve; });
  });
  await scanner.getByRole("button", { name: "Mở camera", exact: true }).click();
  await page.waitForFunction(() => window.__cameraRequested);
  await scanner.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 400;
    const stream = canvas.captureStream(10); window.__qrTrack = stream.getTracks()[0]; window.__resolveCamera(stream);
  });
  await page.waitForFunction(() => window.__qrTrack.readyState === "ended");
  scanner = await openScanner();
  await page.evaluate(async base64 => {
    const image = new Image(); image.src = "data:image/png;base64," + base64; await image.decode();
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      const stream = canvas.captureStream(10); window.__qrTrack = stream.getTracks()[0]; return stream;
    };
  }, images[1].toString("base64"));
  await scanner.getByRole("button", { name: "Mở camera", exact: true }).click();
  await scanner.waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.__qrTrack.readyState === "ended");
  assert.equal(writes.length, 0);
  console.log("PASS camera decoding, permission failure and track cleanup including closing during a permission request");

  // Real-camera-like frames: small off-centre QR, mild blur and multiple cameras.
  scanner = await openScanner();
  await page.evaluate(async base64 => {
    const image = new Image(); image.src = "data:image/png;base64," + base64; await image.decode();
    window.__cameraRequests = []; window.__cameraTracks = []; window.__focusRequests = [];
    navigator.mediaDevices.enumerateDevices = async () => [
      { deviceId: "cam-front", kind: "videoinput", label: "Camera trước", groupId: "front" },
      { deviceId: "cam-rear", kind: "videoinput", label: "Camera sau", groupId: "rear" },
    ];
    navigator.mediaDevices.getUserMedia = async request => {
      window.__cameraRequests.push(request);
      const rear = request.video.deviceId?.exact === "cam-rear";
      const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#b4b6b8"; ctx.fillRect(0, 0, 1280, 720);
      const stream = canvas.captureStream(10), track = stream.getTracks()[0];
      const settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), deviceId: rear ? "cam-rear" : "cam-front" });
      track.getCapabilities = () => ({ focusMode: ["continuous"] });
      track.applyConstraints = async constraints => { window.__focusRequests.push(constraints); };
      window.__cameraTracks.push(track);
      if (rear) setTimeout(() => {
        ctx.save(); ctx.translate(720, 330); ctx.rotate(.07); ctx.filter = "blur(.35px)";
        ctx.drawImage(image, -140, -140 * image.height / image.width, 280, 280 * image.height / image.width); ctx.restore();
      }, 500);
      return stream;
    };
  }, images[1].toString("base64"));
  await scanner.getByRole("button", { name: "Mở camera", exact: true }).click();
  await scanner.getByText(/Chưa nhận được QR/).waitFor({ timeout: 15000 });
  await scanner.getByLabel("Chọn camera", { exact: true }).selectOption("cam-rear");
  await scanner.waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.__cameraTracks.every(track => track.readyState === "ended"));
  const cameraRequests = await page.evaluate(() => ({ requests: window.__cameraRequests, focus: window.__focusRequests }));
  assert.equal(cameraRequests.requests[0].video.width.ideal, 1920);
  assert.equal(cameraRequests.requests[0].video.height.ideal, 1080);
  assert.equal(cameraRequests.requests[1].video.deviceId.exact, "cam-rear");
  assert.ok(cameraRequests.focus.some(request => request.advanced?.[0]?.focusMode === "continuous"));
  assert.equal(writes.length, 0);
  console.log("PASS small blurred off-centre camera frame, high resolution request, autofocus, no-read guidance and switching cameras");

  await page.getByLabel("Số tiền", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  assert.equal(writes.length, 0);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  assert.equal(writes.length, 0);
  await page.getByLabel("Mã xác nhận gồm 6 chữ số", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Xác nhận chuyển tiền", exact: true }).click();
  await page.getByRole("heading", { name: "Giao dịch thành công", exact: true }).waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].destinationAccountId, destination.accountid);
  assert.equal(writes[0].amount, "1000");
  assert.deepEqual(errors, []);
  console.log("PASS QR payment still requires confirmation, OTP and one explicit financial request; all writes mocked");
} finally { await browser.close(); }
