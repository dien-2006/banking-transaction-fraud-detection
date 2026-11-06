const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { validateArtifact, CachedFraudModel, FEATURES } = require('../dist/database/fraud-model');
const { AuthGuard } = require('../dist/security/auth.guard');
const { DeliveryRetry } = require('../dist/delivery-retry');
const { publishBatch } = require('../dist/producer');
const { SecurityThrottle } = require('../dist/security/throttle.service');

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
    assert.equal(cache.snapshot().artifact.version, 'v1');
    const cold = new CachedFraudModel({get: (key, fallback) => key === 'MODEL_CACHE_PATH' ? path : fallback});
    assert.throws(() => cold.snapshot(), /validated fraud model/);
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
    const calls=[], event={eventoutboxid:7,eventkey:'completed:7',eventtype:'TransactionCompleted',aggregateid:'7',aggregatetype:'BANK_TRANSACTION',createdat:'2026-11-03T07:00:00Z',event_occurred_at:'2026-11-03T00:00:00Z',payloadjson:{transaction_id:7}};
    const client={query:async(sql)=>{calls.push(sql);return {rows:sql.includes('claim_ready')?[event]:[]};},release:()=>calls.push('release')};
    const transport={send:async args=>{calls.push('Kafka ACK');assert.equal(args.acks,-1);const envelope=JSON.parse(args.messages[0].value);assert.equal(envelope.event_id,event.eventkey);assert.equal(envelope.occurred_at,event.event_occurred_at);if(failed)throw new Error('Kafka unavailable');}};
    await publishBatch({connect:async()=>client},transport,new DeliveryRetry());
    assert.equal(calls.some(c=>c.includes('mark_outbox_published')), !failed);
    assert.equal(calls.some(c=>c.includes('mark_outbox_failed')), failed);
    if(!failed)assert.ok(calls.indexOf('Kafka ACK')<calls.findIndex(c=>c.includes('mark_outbox_published')));
    assert.ok(calls.includes('COMMIT'));
    assert.equal(calls.at(-1),'release');
  }
});

test('security rate limit is atomic under concurrent requests and expires',
  {skip:process.env.RUN_REDIS_INTEGRATION!=='1'}, async()=>{
    const {execFile}=require('node:child_process'),{promisify}=require('node:util'),{randomUUID}=require('node:crypto');
    const run=promisify(execFile);
    const actor=randomUUID();
    const redis=async args=>JSON.parse((await run('docker',['compose','exec','-T','redis','redis-cli','--json',...args])).stdout.trim());
    let key;
    const throttle=new SecurityThrottle({assertReady:()=>{},client:{eval:async(script,options)=>{
      key=options.keys[0];return redis(['EVAL',script,String(options.keys.length),...options.keys,...options.arguments]);
    }}});
    try{
      const results=await Promise.allSettled(Array.from({length:6},()=>throttle.check('test-rate',actor,5,60)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
      const rejected=results.filter(r=>r.status==='rejected');
      assert.equal(rejected.length,1);assert.equal(rejected[0].reason.getStatus(),429);
      const ttl=await redis(['TTL',key]);assert.ok(ttl>0&&ttl<=60);
      assert.equal(key.includes(actor),false);
    }finally{if(key)await redis(['DEL',key]);}
  });
