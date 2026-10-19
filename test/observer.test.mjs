import test from 'node:test';
import assert from 'node:assert/strict';
import {initObserver} from '../extension/observer.js';
test('observation starts without screenshots or user questions, refreshes API and stops timers',async()=>{
 const keys=['document','window','localStorage','setTimeout','clearTimeout'];const original=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));const nodes=new Map();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',value:key==='#watch-symbol'?'ETHUSDT':'',checked:key==='#watch-ai',disabled:false,addEventListener(){},elements:{symbol:{value:'BTCUSDT'}}});return nodes.get(key)};
 const calls=[];let scheduled=null;
 globalThis.document={querySelector:node};globalThis.window={addEventListener(){}};globalThis.localStorage={getItem(){return null},setItem(){}};globalThis.setTimeout=fn=>{scheduled=fn;return 1};globalThis.clearTimeout=()=>{scheduled=null};
 const api=async(action,{symbol}={})=>{calls.push({action,symbol});const market={symbol,price:100,sourceTime:Date.now()};if(action==='observe')return {market,observation:{trend:'up',rangeLow:98,rangeHigh:102,averageTrueRange14:1,lastClosedAt:1,note:'test'}};if(action==='observeExplain')return {market,answer:'Автоматическая сводка',model:'test'};throw Error('Unexpected '+action)};
 try{
  await initObserver({api,extension:false,showPage(){},fmt:String});await node('#watch-start').onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.map(c=>c.action),['observe','observeExplain']);assert.ok(calls.every(c=>c.symbol==='ETHUSDT'));assert.match(node('#watch-explanation').textContent,/Автоматическая/);assert.ok(scheduled);await node('#watch-stop').onclick();assert.equal(scheduled,null);assert.equal(node('#watch-start').disabled,false);
 }finally{for(const k of keys){if(original[k]===undefined)delete globalThis[k];else globalThis[k]=original[k]}}
});
