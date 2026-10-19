export const PAPER_RULES={initial:1000,fee:.001,slip:.0005,risk:.005,allocation:.2,dailyLoss:.02,drawdown:.1};
const day=t=>Math.floor((t+10800000)/86400000);
export function createPaper(now=Date.now()){return {version:1,cash:1000,equity:1000,peak:1000,position:null,trades:[],usedSignals:[],day:day(now),dayStart:1000,lastUpdate:now,halted:false};}
function quote(snapshot,now){const q=snapshot.market;if(q?.symbol!=='BTCUSDT'||q.market!=='spot'||![q.bid,q.ask,q.sourceTime].every(Number.isFinite)||q.bid<=0||q.ask<q.bid||Math.abs(now-q.sourceTime)>30000)throw Error('Для виртуальной сделки нужны свежие bid/ask BTC/USDT.');return q;}
export function openPaper(account,snapshot,report,now=Date.now()){
 const q=quote(snapshot,now),c=snapshot.candidate;
 if(!report?.experimentReady||report.rules?.id!=='btc-ema-cross-v1'||!Number.isFinite(report.dataReceivedAt)||report.dataReceivedAt>now+5000||now-report.dataReceivedAt>86400000)throw Error('Сначала нужен завершённый исторический тест стратегии за последние сутки.');
 if(account.position||account.halted)throw Error('Уже есть позиция или сработал лимит сессии.');
 if(c?.signal!=='paper-candidate'||now-c.candleClosedAt>300000||now<c.candleClosedAt||account.usedSignals.includes(c.candleClosedAt))throw Error('Нет нового действующего учебного сигнала.');
 const a=structuredClone(account);if(day(now)!==a.day){a.day=day(now);a.dayStart=a.equity;}
 if(a.equity<=a.dayStart*(1-PAPER_RULES.dailyLoss))throw Error('Достигнут дневной лимит потерь виртуального счёта.');
 const entry=q.ask*(1+PAPER_RULES.slip),distance=1.5*c.atr,stop=entry-distance,target=entry+2*distance;
 if(!Number.isFinite(distance)||distance<=0||stop<=0)throw Error('Некорректные уровни стратегии.');
 const costPerNet=entry/(1-PAPER_RULES.fee),unitLoss=costPerNet-stop*(1-PAPER_RULES.slip)*(1-PAPER_RULES.fee);
 const qty=Math.floor(Math.min(a.cash*PAPER_RULES.allocation/costPerNet,a.equity*PAPER_RULES.risk/unitLoss)*1e8)/1e8;
 if(qty<=0)throw Error('Недостаточно виртуального остатка.');
 const cost=qty*costPerNet;a.cash-=cost;a.position={qty,cost,entry,stop,target,openedAt:now};a.usedSignals.push(c.candleClosedAt);a.lastUpdate=now;a.equity=a.cash+qty*q.bid*(1-PAPER_RULES.fee);return a;
}
export function markPaper(account,snapshot,now=Date.now(),manual=false){
 const q=quote(snapshot,now),a=structuredClone(account);const p=a.position;
 let reason=null;
 if(p){
  if(now-a.lastUpdate>45000)reason='Перерыв наблюдения: выход по первой доступной цене';
  else if(q.bid<=p.stop)reason='Стоп по наблюдаемой цене';
  else if(q.bid>=p.target)reason='Цель по наблюдаемой цене';
  else if(snapshot.candidate?.exitTrend)reason='Обратное направление средних';
  else if(now-p.openedAt>=86400000)reason='Истекли 24 часа';
  else if(manual)reason='Ручное закрытие';
  const equity=a.cash+p.qty*q.bid*(1-PAPER_RULES.fee);
  if(equity<=a.peak*(1-PAPER_RULES.drawdown)){reason='Лимит просадки';a.halted=true;}
  if(reason){const exit=q.bid*(1-PAPER_RULES.slip),received=p.qty*exit*(1-PAPER_RULES.fee);a.cash+=received;a.trades.push({...p,exit,closedAt:now,pnl:received-p.cost,reason});a.position=null;}
 }
 a.equity=a.cash+(a.position?a.position.qty*q.bid*(1-PAPER_RULES.fee):0);a.peak=Math.max(a.peak,a.equity);
 if(a.equity<=a.peak*(1-PAPER_RULES.drawdown))a.halted=true;
 if(day(now)!==a.day){a.day=day(now);a.dayStart=a.equity;}
 a.lastUpdate=now;return a;
}
