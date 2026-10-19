import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../extension/background.js',import.meta.url),'utf8');
function browser(){
 const data={};const callbacks={};let injected=0;
 let tab={id:7,windowId:2,url:'https://www.bybit.com/trade/spot/BTC/USDT'};
 const event=name=>({addListener(fn){callbacks[name]=fn}});
 const chrome={storage:{local:{setAccessLevel:async()=>{}},session:{get:async()=>structuredClone(data),set:async v=>Object.assign(data,structuredClone(v)),clear:async()=>{for(const k of Object.keys(data))delete data[k]}}},sidePanel:{setOptions:async()=>{},open:async()=>{}},action:{onClicked:event('action')},commands:{onCommand:event('command')},tabs:{query:async()=>[tab],onActivated:event('activated'),onUpdated:event('updated'),onRemoved:event('removed')},scripting:{executeScript:async()=>{injected++}},runtime:{onMessage:event('message')}};
 vm.runInNewContext(source,{chrome,URL,crypto:{randomUUID:()=>String(Math.random())}});
 const message=(msg,sender={})=>new Promise(resolve=>callbacks.message(msg,sender,resolve));
 return {data,callbacks,message,setTab:t=>{tab=t},injected:()=>injected};
}
test('selection recovers a missing binding on an accessible active Bybit tab',async()=>{const b=browser();const r=await b.message({type:'select'});assert.equal(r.ok,true);assert.equal(b.data.bound.tabId,7);assert.equal(b.injected(),1)});
test('reload keeps granted tab binding but invalidates screenshot and selection',async()=>{const b=browser();await b.message({type:'select'});b.data.capture={image:'old'};await b.callbacks.updated(7,{status:'loading'});assert.equal(b.data.bound.tabId,7);assert.equal(b.data.capture,null);assert.equal(b.data.pending,null);assert.equal((await b.message({type:'select'})).ok,true)});
test('cross-origin navigation clears binding and rejects a non-Bybit page',async()=>{const b=browser();await b.message({type:'select'});await b.callbacks.updated(7,{url:'https://example.com/'});assert.equal(b.data.bound,null);b.setTab({id:7,windowId:2,url:'https://bybit.com.attacker.example/'});assert.match((await b.message({type:'select'})).error,/только/);assert.equal(b.injected(),1)});
test('missing activeTab access gives a concrete recovery action without injection',async()=>{const b=browser();b.setTab({id:7,windowId:2});assert.match((await b.message({type:'select'})).error,/Alt\+Shift\+X/);assert.equal(b.injected(),0)});
test('content scripts cannot request binding or screenshot selection',async()=>{const b=browser();assert.match((await b.message({type:'select'},{tab:{id:7}})).error,/только панели/);assert.equal(b.injected(),0)});
