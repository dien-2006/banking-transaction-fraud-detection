const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { validateArtifact, CachedFraudModel, FEATURES } = require('../dist/database/fraud-model');
const { AuthGuard } = require('../dist/security/auth.guard');
const { DeliveryRetry } = require('../dist/delivery-retry');
const { publishBatch } = require('../dist/producer');

test('model reload retains the last valid cache and requires an explicit candidate mapping', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd4-model-')), path = join(dir, 'model.json');
  const model = { version: 'v1', intercept: -3.5, weights: Object.fromEntries(FEATURES.map(k => [k, 0.1])) };
  try {
    writeFileSync(path, JSON.stringify(model));
    const cache = new CachedFraudModel({get: (key, fallback) => key === 'MODEL_CACHE_PATH' ? path : fallback});
    assert.equal(cache.snapshot().artifact.version, 'v1');
    writeFileSync(path, '{broken');
    assert.equal(cache.snapshot().artifact.version, 'v1');
    assert.throws(() => validateArtifact({...model, weights: {}}));
    writeFileSync(path, JSON.stringify({...model, version: 'candidate-2'}));
    assert.throws(() => cache.snapshot(), /database mapping/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('a signed JWT cannot retain access after actor permissions are revoked', async () => {
  const user = {role:'customer', actorType:'customer', customerId:1};
  const request = {headers:{authorization:'Bearer signed'}};
  const context = {getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>request})};
  let active = true;
  const guard = new AuthGuard({verifyAsync:async()=>user},{getAllAndOverride:()=>false},{isActorActive:async()=>active});
  assert.equal(await guard.canActivate(context),true);
  active = false;
  await assert.rejects(guard.canActivate(context),e=>e.getStatus()===401);
});

test('failed delivery is delayed, bounded and excluded before claiming new work', async () => {
  let time = 0;
  const retry = new DeliveryRetry(()=>time, 2);
  retry.failed(1);
  assert.deepEqual(retry.excluded(),['1']);
  time = 1000;
  assert.deepEqual(retry.excluded(),[]);
  assert.equal(retry.failed(1),true);
  time = 1e9;
  assert.deepEqual(retry.excluded(),['1']);
  const calls=[];
  const client={query:async(sql,args)=>{calls.push([sql,args]);return {rows:[]};},release:()=>{}};
  await publishBatch({connect:async()=>client},{send:async()=>{}},retry);
  assert.deepEqual(calls.find(([sql])=>sql.includes('claim_ready_outbox'))[1][1],['1']);
});

test('the deployed TypeScript publisher marks published only after Kafka ACK; failures remain retryable', async () => {
  for(const failed of [false,true]) {
    const calls=[], event={eventoutboxid:7,eventkey:'completed:7',eventtype:'TransactionCompleted',aggregateid:'7',aggregatetype:'BANK_TRANSACTION',createdat:'2026-11-03T00:00:00Z',payloadjson:{transaction_id:7}};
    const client={query:async(sql)=>{calls.push(sql);return {rows:sql.includes('claim_ready')?[event]:[]};},release:()=>calls.push('release')};
    const transport={send:async args=>{calls.push('Kafka ACK');assert.equal(args.acks,-1);assert.equal(JSON.parse(args.messages[0].value).event_id,event.eventkey);if(failed)throw new Error('Kafka unavailable');}};
    await publishBatch({connect:async()=>client},transport,new DeliveryRetry());
    assert.equal(calls.some(c=>c.includes('mark_outbox_published')), !failed);
    assert.equal(calls.some(c=>c.includes('mark_outbox_failed')), failed);
    if(!failed)assert.ok(calls.indexOf('Kafka ACK')<calls.findIndex(c=>c.includes('mark_outbox_published')));
    assert.ok(calls.includes('COMMIT'));
    assert.equal(calls.at(-1),'release');
  }
});
