const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const { JoblibFraudModel } = require('../dist/database/joblib-model');
const { DatabaseService } = require('../dist/database/database.service');

const features = {amount: 100000, channel: 'InternetBanking', type_code: 'TRANSFER',
  hour: 12, day_of_week: 3, is_night_transaction: 0, account_age_days: 30,
  txn_count_1h: 1, txn_count_24h: 2, txn_count_7d: 3, txn_count_30d: 4,
  avg_amount_30d: 100000, max_amount_30d: 100000, amount_to_avg_ratio: 1,
  failed_login_count_24h: 0, successful_login_count_24h: 1, failed_login_count_1h: 0,
  time_since_last_transaction: 30, login_failure_ratio_24h: 0};

test('online inference binds the prediction to source, customer, amount, clock and DB model identity', async () => {
  const calls=[];
  const client={query: async (sql,args) => {
    calls.push({sql,args});
    if(sql.includes('clock_timestamp')) return {rows:[{assessed_at:'2026-11-04 12:00:00'}]};
    if(sql.includes('joblib_features')) return {rows:[{features}]};
    if(sql.includes('model_version')) return {rows:[{modelversionid:'42'}]};
    return {rows:[]};
  }};
  const fake={fraudModel:{predict:async f=>{assert.equal(f,features);return {probability:.65,version:'joblib-test',databaseName:'xgb-test',sha256:'a'.repeat(64)};}}};
  await DatabaseService.prototype.prepareRisk.call(fake,client,'banking_api.create_transfer',[7,8,9,'100000','key','InternetBanking']);
  assert.ok(calls[0].sql.includes('pg_advisory_xact_lock'));
  assert.deepEqual(calls.find(c=>c.sql.includes('joblib_features')).args,[7,8,'100000','InternetBanking','TRANSFER','2026-11-04 12:00:00']);
  const context=JSON.parse(calls.at(-1).args[0]);
  assert.equal(context.engine,'joblib'); assert.equal(context.modelVersionId,'42');
  assert.equal(context.request.sourceAccountId,8); assert.equal(context.probability,.65);
  assert.deepEqual(context.modelFeatures,features);
});

test('the actual joblib worker caches one process and correlates concurrent predictions',
  {skip:process.env.RUN_JOBLIB_INTEGRATION!=='1'}, async()=>{
    const model=new JoblibFraudModel(new ConfigService(process.env));
    try {
      const first=await model.predict(features),pid=model.child.pid;
      const results=await Promise.all(Array.from({length:8},()=>model.predict(features)));
      const identity=await model.identity();
      assert.equal(identity.sha256,first.sha256);
      assert.equal(Object.hasOwn(identity,'probability'),false);
      assert.match(first.version,/^joblib-[a-f0-9]{16}$/);
      assert.ok(first.probability>=0 && first.probability<=1);
      for(const result of results)assert.deepEqual(result,first);
      assert.equal(model.child.pid,pid);
      await assert.rejects(model.predict({...features,amount:NaN}),e=>e.getStatus()===503);
      assert.equal((await model.predict(features)).sha256,first.sha256);
    } finally {model.close();}
  });

test('readiness requires both a loadable model and its ACTIVE database identity',async()=>{
  const fake={fraudModel:{identity:async()=>({version:'joblib-valid',databaseName:'xgb-valid'})},
    pool:{query:async()=>({rows:[{modelversionid:42}]})}};
  assert.deepEqual(await DatabaseService.prototype.riskModelHealth.call(fake),
    {engine:'joblib',version:'joblib-valid',modelVersionId:42});
  fake.pool.query=async()=>({rows:[]});
  await assert.rejects(DatabaseService.prototype.riskModelHealth.call(fake),/not ACTIVE/);
  fake.fraudModel.identity=async()=>{throw new Error('bad artifact')};
  await assert.rejects(DatabaseService.prototype.riskModelHealth.call(fake),/bad artifact/);
});
