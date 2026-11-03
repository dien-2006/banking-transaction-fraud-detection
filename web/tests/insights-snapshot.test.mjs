import assert from 'node:assert/strict';
import test from 'node:test';
import {moduleUrl} from './module-loader.mjs';
const {validateAnalyticsSnapshot,analyticsDatasets}=await import(await moduleUrl('insights-data'));
test('Gold dashboard accepts only complete snapshots and preserves release metadata',()=>{
 const snapshot={release:{schema_name:'gold_r_'+'a'.repeat(20),batch_id:'release-one',published_at:'2026-11-02 12:00:00'},datasets:Object.fromEntries(Object.keys(analyticsDatasets).map(k=>[k,[]]))};
 assert.equal(validateAnalyticsSnapshot(snapshot),snapshot);
 for(const bad of [null,[],{}, {...snapshot,release:null},{...snapshot,datasets:{}},{...snapshot,datasets:{...snapshot.datasets,risk:null}},{...snapshot,datasets:{...snapshot.datasets,risk:[null]}}]) assert.throws(()=>validateAnalyticsSnapshot(bad));
});
