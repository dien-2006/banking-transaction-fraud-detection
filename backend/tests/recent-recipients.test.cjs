require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { CustomerController } = require('../dist/http/customer.controller');
const { DatabaseService } = require('../dist/database/database.service');

async function queryText() {
  let sql, values;
  await DatabaseService.prototype.recentTransferRecipients.call({pool:{query:async (text, args) => {
    sql=text; values=args; return {rows:[]};
  }}}, 101);
  assert.deepEqual(values, [101]);
  return sql;
}

test('historical recipients are scoped by authenticated customer, never an input customer ID', async () => {
  let identity;
  const controller = new CustomerController({recentTransferRecipients: async id => {identity=id; return [];}}, {});
  await controller.recipients({role:'customer', customerId:101});
  assert.equal(identity,101);
  assert.throws(() => controller.recipients({role:'employee'}), /Customer identity required/);
});

test('recipient query handles full history, deduplication, isolation and current destination eligibility in PostgreSQL', {
  skip: !process.env.RECIPIENT_SQL_TEST_CONTAINER,
}, async () => {
  let sql=await queryText();
  const destinations = [10,10,11,12,13,14,15,16,17,18,19,20,21];
  const transfers=destinations.map((id,i)=>`(${i+1},${i===6?202:101},${id})`).join(',');
  const transactions=destinations.map((_,i)=>`(${i+1},${i===12?2:1},'${({3:'Pending',4:'Failed',5:'Cancelled'})[i]||'Success'}','VND',timestamp '2026-01-01' + interval '${i} day')`).join(',');
  const accounts=Array.from({length:12},(_,i)=>i+10).map(id=>`(${id},'ACC-${id}','${id===18?'USD':'VND'}','${id===16?'Closed':'Active'}','${id===17?'INTERNAL':'CUSTOMER'}')`).join(',');
  const holders=Array.from({length:12},(_,i)=>i+10).filter(id=>id!==19).map(id=>`(${id},${id},1,'${id===20?'Inactive':'Active'}','PRIMARY_OWNER',date '2020-01-01',NULL::date)`).join(',');
  const fixtures=`WITH src_transfer_request(transactionid,customerid,destinationaccountid) AS (VALUES ${transfers}),
    src_bank_transaction(transactionid,transactiontypeid,status,currency,transactiondate) AS (VALUES ${transactions}),
    src_transaction_type(transactiontypeid,typecode) AS (VALUES (1,'TRANSFER'),(2,'DEPOSIT')),
    src_bank_account(accountid,accountnumber,currency,status,accountcategory) AS (VALUES ${accounts}),
    src_account_holder(accountholderid,accountid,customerid,status,holdertype,startdate,enddate) AS (VALUES ${holders},(99,11,1,'Active','PRIMARY_OWNER',date '2020-01-01',NULL::date)),
    src_customer(customerid,fullname) AS (VALUES (1,'Historical recipient')),
    recent AS (`;
  sql=sql.replace(/WITH recent AS \(/,fixtures).replaceAll('banking.','src_').replaceAll('$1','101');
  const result=spawnSync('docker',['exec','-i',process.env.RECIPIENT_SQL_TEST_CONTAINER,'sh','-c','exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],{
    input:`BEGIN READ ONLY; ${sql}; ROLLBACK;`,encoding:'utf8',timeout:15000,
  });
  assert.equal(result.status,0,result.stderr);
  const rows=result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(rows.map(row=>row.accountId),[11,10]);
  assert.equal(rows[0].accountName,'Historical recipient');
  assert.equal(rows[0].bankName,'D4 Bank');
});
