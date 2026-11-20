import assert from 'node:assert/strict';
import test from 'node:test';
import {moduleUrl} from './module-loader.mjs';
const {newRequestKey}=await import(await moduleUrl('request-key'));
test('request keys remain UUID v4 when HTTP does not expose randomUUID',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 const getRandomValues=globalThis.crypto.getRandomValues.bind(globalThis.crypto);
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues}});
  assert.equal(typeof globalThis.crypto.randomUUID,'undefined');
  const values=Array.from({length:100},()=>newRequestKey());
  for(const value of values)assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(values).size,100);
 }finally{Object.defineProperty(globalThis,'crypto',original);}
});
test('missing browser randomness fails clearly instead of using weak keys',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});assert.throws(newRequestKey,/Không thể tạo mã yêu cầu an toàn/);}
 finally{Object.defineProperty(globalThis,'crypto',original);}
});
