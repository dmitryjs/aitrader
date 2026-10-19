import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePlan} from '../lib/core.js';
import {reviewTrade} from '../lib/providers.js';
const input={budget:1000,entry:100,stop:90,target:120,lossLimit:10,feePercent:0,slippagePercent:0};
test('target scenario matches hand calculated one BTC purchase and rejects missing target',()=>{const p=calculatePlan(input);assert.equal(p.quantity,1);assert.equal(p.estimatedProfit,20);assert.equal(p.rewardRisk,2);assert.equal(p.breakEvenPrice,100);assert.throws(()=>calculatePlan({...input,target:undefined}));assert.throws(()=>calculatePlan({...input,target:99}));assert.throws(()=>calculatePlan({...input,target:Infinity}))});
test('a target above entry can still lose money after round trip costs',()=>{const p=calculatePlan({...input,target:100.1,feePercent:.1,slippagePercent:.2});assert.ok(p.estimatedProfit<0);assert.ok(p.breakEvenPrice>100.1);assert.ok(p.estimatedLoss<=10);assert.ok(p.cashRequired<=1000)});
test('review preserves computed numbers on model outage and rejects stale Bybit response',async()=>{
 const original=globalThis.fetch;let stale=false;
 globalThis.fetch=async url=>{assert.ok(url.startsWith('https://api.bybit.com/'));return new Response(JSON.stringify({retCode:0,time:Date.now()-(stale?60000:0),result:{list:[{symbol:'BTCUSDT',lastPrice:'100',price24hPcnt:'0',turnover24h:'1000'}]}}))};
 try{const r=await reviewTrade(input,{});assert.equal(r.plan.estimatedProfit,20);assert.equal(r.executionEnabled,false);assert.match(r.explanationError,/POLZA_API_KEY/);stale=true;await assert.rejects(()=>reviewTrade(input,{}),/устарел/)}finally{globalThis.fetch=original}
});
test('review sends only server computed plan to model and does not place orders',async()=>{
 const original=globalThis.fetch;let completions=0,quotes=0;
 globalThis.fetch=async(url,opts)=>{
  const reply=x=>new Response(JSON.stringify(x));
  if(url.startsWith('https://api.bybit.com/')){quotes++;assert.equal(opts.method,undefined);return reply({retCode:0,time:Date.now(),result:{list:[{symbol:'BTCUSDT',lastPrice:'100',price24hPcnt:'0',turnover24h:'1000'}]}})}
  if(url.includes('/models?'))return reply({data:[{id:'openai/gpt-6-astra'}]});
  assert.equal(url,'https://polza.ai/api/v1/chat/completions');completions++;
  const body=JSON.parse(opts.body);const data=JSON.parse(body.messages[1].content[0].text);assert.equal(data.calculatedPlan.estimatedProfit,20);assert.equal(data.calculatedPlan.quantity,1);assert.equal(body.tools,undefined);return reply({choices:[{message:{content:'Сценарий рассчитан.'}}]});
 };
 try{const r=await reviewTrade({...input,plan:{quantity:9999}},{POLZA_API_KEY:'test-only'});assert.equal(r.explanation,'Сценарий рассчитан.');assert.equal(quotes,1);assert.equal(completions,1)}finally{globalThis.fetch=original}
});
