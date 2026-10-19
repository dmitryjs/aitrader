import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBars,indicators,entrySignal,candidate,positionSize,backtest,RULES} from '../lib/strategy.js';
import {analyzeCandles} from '../lib/observation.js';
import {createPaper,openPaper,markPaper,enableResearch} from '../extension/paper.js';
import {validateSymbol} from '../lib/core.js';
const H=3600000,base=Math.floor((Date.now()-250*24*H)/H)*H;
const bars=n=>Array.from({length:n},(_,i)=>({time:base+i*H,open:100,high:101,low:99,close:100,volume:20}));
const wire=bs=>bs.map(b=>[b.time,b.open,b.high,b.low,b.close,b.volume].map(String));
test('closed candles only; gaps and duplicate timestamps rejected',()=>{const b=bars(230);assert.equal(prepareBars(wire(b),b.at(-1).time).length,229);const g=wire(b);g.splice(100,1);assert.throws(()=>prepareBars(g,b.at(-1).time+H),/пропуски/);assert.throws(()=>prepareBars([...wire(b),wire(b)[10]],b.at(-1).time+H),/пропуски/)});
test('future price changes cannot change historical indicators or entry conditions',()=>{const b=bars(400);b[250]={...b[250],close:105,high:106};const before=indicators(b);const changed=b.map((r,i)=>i>300?{...r,close:10000,high:10001}:r);const after=indicators(changed);assert.deepEqual(before.slice(0,301),after.slice(0,301));for(let i=200;i<=300;i++)assert.equal(entrySignal(b,before,i),entrySignal(changed,after,i))});
test('strategy skips stale and chased signals; only fresh crossover qualifies',()=>{const b=bars(221);b[220]={...b[220],close:102,high:103};const now=b.at(-1).time+H;assert.equal(candidate(b,102,now).signal,'paper-candidate');assert.equal(candidate(b,102,now+6*60000).signal,'wait');assert.equal(candidate(b,120,now).signal,'wait');assert.equal(candidate(bars(221),100,now).signal,'wait')});
test('net base quantity accounts for buy fee and stays inside virtual cash and loss limits',()=>{const p=positionSize(1000,100,98);assert.ok(p.cost<=200);assert.ok(p.cost-p.qty*98*(1-RULES.slippage)*(1-RULES.fee)<=5);assert.ok(p.qty<2);assert.equal(positionSize(1000,100,101).qty,0)});
test('time split is ordered, empty strategy loses no money and never enables real trading',()=>{const r=backtest(bars(24*180));assert.equal(r.development.endEquity,1000);assert.equal(r.finalTest.tradeCount,0);assert.equal(r.paperGate,false);assert.equal(r.experimentReady,true);assert.equal(r.liveEnabled,false);assert.ok(r.development.to<=r.validation.from);assert.ok(r.validation.to<=r.finalTest.from);assert.ok(r.finalTest.buyHoldPnl<0)});
test('market observation excludes incomplete 15 minute candle and refuses stale data',()=>{
 const now=Math.floor(Date.now()/900000)*900000+1000;const rows=Array.from({length:100},(_,i)=>[now-1000-(99-i)*900000,'100','101','99','100','10']);rows.at(-1)[4]='999';rows.at(-1)[2]='999';
 const data={retCode:0,time:now,result:{symbol:'ETHUSDT',category:'spot',list:rows.reverse()}};const d=analyzeCandles(data,'ETHUSDT',now);assert.equal(d.lastClose,100);assert.equal(d.candleCount,99);assert.throws(()=>analyzeCandles({...data,time:now-60000},'ETHUSDT',now),/устарели/);assert.throws(()=>analyzeCandles(data,'SOLUSDT',now),/другому/)
});
test('symbol allowlist rejects derivatives and request injection',()=>{assert.equal(validateSymbol('ETHUSDT'),'ETHUSDT');assert.throws(()=>validateSymbol('BTCUSDT&category=linear'));assert.throws(()=>validateSymbol('DOGEUSDT'))});
const snap=(now,bid=100)=>({market:{symbol:'BTCUSDT',market:'spot',bid,ask:bid+.01,sourceTime:now},candidate:{signal:'paper-candidate',candleClosedAt:now-1000,atr:2,exitTrend:false}});
const report=now=>({experimentReady:true,paperGate:true,rules:{id:'btc-ema-cross-v1'},dataReceivedAt:now});
test('paper requires completed backtest, fresh quotes and user-confirmed opening; failures preserve wallet',()=>{const now=Date.now(),a=createPaper(now);assert.throws(()=>openPaper(a,snap(now),null,now),/тест/);assert.throws(()=>openPaper(a,snap(now-60000),report(now),now),/свежие/);const p=openPaper(a,snap(now),report(now),now);assert.equal(a.position,null);assert.equal(a.cash,1000);assert.ok(p.position.cost<=200);assert.ok(p.equity<1000);assert.throws(()=>openPaper(p,snap(now),report(now),now),/позиция/)});
test('paper stop fills at observed adverse quote, not an invented stop price',()=>{const now=Date.now(),a=openPaper(createPaper(now),snap(now),report(now),now);const b=markPaper(a,snap(now+15000,95),now+15000);assert.equal(b.position,null);assert.equal(b.trades.length,1);assert.equal(b.trades[0].exit,95*(1-PAPER_RULES.slip));assert.ok(b.trades[0].pnl<0);assert.ok(b.equity<1000)});
import {PAPER_RULES} from '../extension/paper.js';
test('paper gap explicitly closes at first available price and records the gap',()=>{const now=Date.now(),a=openPaper(createPaper(now),snap(now),report(now),now);const b=markPaper(a,snap(now+60000,100),now+60000);assert.match(b.trades[0].reason,/Перерыв/);assert.equal(b.position,null);assert.equal(a.trades.length,0)});
test('used signals and daily loss limit cannot open another paper position',()=>{const now=Date.now();let a=openPaper(createPaper(now),snap(now),report(now),now);a=markPaper(a,snap(now+1000),now+1000,true);assert.throws(()=>openPaper(a,snap(now),report(now),now),/сигнала/);const limited={...createPaper(now),cash:979,equity:979};assert.throws(()=>openPaper(limited,snap(now),report(now),now),/дневной/)});

test('failed strategy cannot open via either UI path without explicit paper research consent',()=>{
 const now=Date.now(),r={...report(now),paperGate:false},original=createPaper(now);
 assert.throws(()=>openPaper(original,snap(now),r,now),/отдельно подтверди/);
 const account=enableResearch(original,r,now);
 assert.equal(original.researchConsent,undefined);assert.equal(account.position,null);assert.equal(account.cash,1000);assert.equal(r.paperGate,false);
 const opened=openPaper(account,snap(now),r,now);assert.equal(opened.position.research,true);assert.equal(opened.position.reportAt,now);
 assert.throws(()=>openPaper(account,snap(now),{...r,dataReceivedAt:now+1},now),/отдельно подтверди/);
 assert.throws(()=>enableResearch(original,{...r,dataReceivedAt:now-86400001},now),/тест/);
 assert.throws(()=>openPaper(account,snap(now-60000),r,now),/свежие/);
 assert.throws(()=>openPaper({...account,halted:true},snap(now),r,now),/лимит/);
 assert.throws(()=>openPaper({...account,cash:979,equity:979},snap(now),r,now),/дневной/);
});
