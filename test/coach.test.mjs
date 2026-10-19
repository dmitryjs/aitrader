import test from 'node:test';
import assert from 'node:assert/strict';
import {coachView,gateSummary} from '../extension/coach.js';
import {createPaper,openPaper,enableResearch} from '../extension/paper.js';
const now=Date.now();
const snapshot={market:{symbol:'BTCUSDT',market:'spot',bid:100,ask:100.01,sourceTime:now},candidate:{signal:'paper-candidate',candleClosedAt:now-1000,atr:2}};
const report={experimentReady:true,paperGate:true,rules:{id:'btc-ema-cross-v1'},dataReceivedAt:now};
const state={running:true,report,paper:createPaper(now),context:{symbol:'BTCUSDT'},snapshot,now};
test('one step view gives no purchase instruction before a successful historical gate',()=>{const v=coachView({...state,report:{...report,paperGate:false}});assert.equal(v.action,'research');assert.match(v.title,/не прошла/);assert.match(v.body,/не покупает BTC/);assert.match(v.notice,/не пройдена/)});
test('stale or absent quotes never become a purchase instruction',()=>{for(const snapshot of [null,{...state.snapshot,market:{...state.snapshot.market,sourceTime:now-60000}}])assert.equal(coachView({...state,snapshot}).action,null)});
test('buy instruction names virtual money and carries exact previewed cost and exit levels',()=>{const v=coachView(state),p=openPaper(state.paper,snapshot,report,now).position;assert.equal(v.action,'buy');assert.match(v.title,/виртуально/);assert.match(v.body,/На сайте Bybit ничего покупать не нужно/);assert.deepEqual(v.levels,p);assert.ok(p.cost<=200)});
test('holding and paused positions cannot produce a second buy instruction',()=>{const paper=openPaper(state.paper,snapshot,report,now);assert.equal(coachView({...state,paper}).action,null);const paused=coachView({...state,paper,running:false});assert.equal(paused.action,'start');assert.match(paused.body,/перерыва/)});
test('preparation has one disabled state; wrong coin prompts navigation, not a buy',()=>{assert.equal(coachView({...state,preparing:true}).action,null);const v=coachView({...state,context:{symbol:'ETHUSDT'},snapshot:null});assert.match(v.title,/Открой BTC/);assert.equal(v.action,null)});

test('failed gate remains visible after research consent; a refreshed report needs new consent',()=>{
 const failed={...report,paperGate:false,validation:{pnl:-2},finalTest:{pnl:3,tradeCount:4,maxDrawdownPercent:1},stress:{pnl:-1}};
 const paper=enableResearch(state.paper,failed,now);
 const v=coachView({...state,report:failed,paper});
 assert.equal(v.action,'buy');assert.match(v.notice,/4 сделок/);assert.match(v.notice,/-2 USDT/);assert.equal(failed.paperGate,false);
 assert.equal(coachView({...state,report:{...failed,dataReceivedAt:now+1},paper}).action,'research');
});
test('gate explanation lists only failed criteria and separates insufficient evidence from losses',()=>{
 const r={validation:{pnl:2},finalTest:{pnl:3,tradeCount:4,maxDrawdownPercent:6},stress:{pnl:1}};
 const text=gateSummary(r);assert.match(text,/4 сделок/);assert.match(text,/6%/);assert.doesNotMatch(text,/Проверочный период|Двойная комиссия/);
});
