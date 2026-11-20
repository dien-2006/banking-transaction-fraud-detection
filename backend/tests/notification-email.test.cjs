const test=require('node:test'),assert=require('node:assert/strict');
const {transactionEmailDetails}=require('../dist/notification-email');
const detail=(status='Success')=>({transaction:{transactioncode:'TX-123',amount:'50000000.00',currency:'VND',status},postings:[{accountid:1,postingtype:'DEBIT',amount:'50000000.00'},{accountid:2,postingtype:'CREDIT',amount:'50000000.00'}]});
test('email uses nested transaction and recipient debit posting without exposing the other account',()=>{
 const text=transactionEmailDetails(detail(),new Map([['1','123456']]));
 assert.match(text,/Mã giao dịch: TX-123/);assert.match(text,/123456: −50\.000\.000 VND \(Ghi nợ\)/);assert.ok(!text.includes('Ghi có'));
});
test('disbursement email reports credit; transfer between owned accounts reports both movements',()=>{
 assert.match(transactionEmailDetails(detail(),new Map([['2','654321']])),/654321: \+50\.000\.000 VND \(Ghi có\)/);
 const both=transactionEmailDetails(detail(),new Map([['1','123456'],['2','654321']]));assert.match(both,/Ghi nợ/);assert.match(both,/Ghi có/);
});
test('pending, blocked and failed transactions never claim a debit or credit',()=>{
 for(const status of ['Pending','Cancelled','Failed']){
  const data=detail(status);data.postings=[];
  const text=transactionEmailDetails(data,new Map());assert.match(text,/Số tiền yêu cầu: 50\.000\.000 VND/);assert.match(text,/chưa ghi nhận cộng\/trừ/);assert.ok(!/[+−]/.test(text));
 }
});
test('missing transaction/recipient posting fails closed; decimal strings preserve precision',()=>{
 assert.throws(()=>transactionEmailDetails(null,new Map()),/Missing/);
 assert.throws(()=>transactionEmailDetails(detail(),new Map([['3','NOT-OWNED']])),/recipient ledger/);
 const data=detail();data.postings=[{accountid:2,postingtype:'CREDIT',amount:'99999999999999999.12'}];
 assert.match(transactionEmailDetails(data,new Map([['2','654321']])),/\+99\.999\.999\.999\.999\.999,12 VND/);
 data.postings[0].postingtype='INVALID';assert.throws(()=>transactionEmailDetails(data,new Map([['2','654321']])),/posting type/);
});
