// Frozen before fetching history. Experimental, spot long only; not trained.
export const RULES=Object.freeze({id:'btc-ema-cross-v1',symbol:'BTCUSDT',intervalMinutes:60,fast:20,slow:50,trend:200,atr:14,stopAtr:1.5,rewardRisk:2,maxHoldBars:24,riskFraction:.005,maxAllocation:.2,dailyLossFraction:.02,maxDrawdown:.1,initialCash:1000,fee:.001,slippage:.0005});
const HOUR=3600000;
export function prepareBars(rows,serverTime){
 if(!Array.isArray(rows))throw Error('Нет свечей для проверки.');
 const bars=rows.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5])})).filter(b=>b.time+HOUR<=serverTime).sort((a,b)=>a.time-b.time);
 if(bars.length<220)throw Error('Недостаточно часовых свечей.');
 for(let i=0;i<bars.length;i++){const b=bars[i];if(!Object.values(b).every(Number.isFinite)||b.time%HOUR||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.volume<0||(i&&b.time-bars[i-1].time!==HOUR))throw Error('История содержит пропуски или некорректные свечи.');}
 return bars;
}
export function indicators(bars){
 const series=p=>{let sum=0,v=null;return bars.map((b,i)=>{if(i<p){sum+=b.close;if(i===p-1)v=sum/p}else v+=(b.close-v)*2/(p+1);return v})};
 const fast=series(RULES.fast),slow=series(RULES.slow),trend=series(RULES.trend),tr=bars.map((b,i)=>i?Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close)):b.high-b.low);
 return bars.map((b,i)=>({fast:fast[i],slow:slow[i],trend:trend[i],atr:i>=14?tr.slice(i-13,i+1).reduce((a,b)=>a+b,0)/14:null}));
}
export function entrySignal(bars,ix,i){return i>=200&&ix[i].fast>ix[i].slow&&ix[i-1].fast<=ix[i-1].slow&&bars[i].close>ix[i].trend&&ix[i].atr>0;}
export function candidate(bars,price,now){
 const ix=indicators(bars),i=bars.length-1,closed=bars[i].time+HOUR;
 const signal=entrySignal(bars,ix,i);
 const fresh=now>=closed&&now-closed<=5*60000;
 const near=Math.abs(price-bars[i].close)<=.25*ix[i].atr;
 return {rules:RULES,exitTrend:ix[i].fast<ix[i].slow,signal:signal&&fresh&&near?'paper-candidate':'wait',candleClosedAt:closed,atr:ix[i].atr,reason:!signal?'Условия стратегии не совпали. Покупку пропускаем.':!fresh?'Сигнал старше пяти минут. Вход пропускаем.':!near?'Цена ушла от сигнала. Вход пропускаем.':'Учебный сигнал: пересечение вверх и цена выше долгой средней. Прибыльность не доказана.',entry:price,stop:price-RULES.stopAtr*ix[i].atr,target:price+RULES.rewardRisk*RULES.stopAtr*ix[i].atr};
}
export function positionSize(cash,entry,stop,fee=RULES.fee){
 // Bybit buy fee is taken in base coin. qty is NET base coin after the buy fee.
 const costPerNet=entry/(1-fee),lossPerNet=costPerNet-stop*(1-RULES.slippage)*(1-fee);
 if(cash<=0||stop<=0||entry<=stop||lossPerNet<=0)return {qty:0,cost:0};
 const qty=Math.floor(Math.min(cash*RULES.maxAllocation/costPerNet,cash*RULES.riskFraction/lossPerNet)*1e8)/1e8;
 return {qty,cost:qty*costPerNet};
}
function runWindow(bars,ix,start,end,fee){
 let cash=1000,position=null,peak=1000,drawdown=0,day='',dayStart=1000,halted=false;const trades=[];let costs=0;
 const close=(raw,time,reason)=>{const price=raw*(1-RULES.slippage),received=position.qty*price*(1-fee);cash+=received;costs+=position.qty*price*fee;trades.push({entryTime:position.time,exitTime:time,entry:position.entry,exit:price,qty:position.qty,pnl:received-position.cost,reason});position=null};
 for(let i=start;i<end;i++){
  const b=bars[i],mark=cash+(position?position.qty*b.open*(1-fee):0);
  const date=Math.floor((b.time+3*HOUR)/(24*HOUR));if(date!==day){day=date;dayStart=mark;}
  if(position){
   if(b.open<=position.stop)close(b.open,b.time,'stop-gap');
   else if(ix[i-1].fast<ix[i-1].slow||i-position.index>=RULES.maxHoldBars)close(b.open,b.time,'trend-or-time');
  }
  if(!position&&!halted&&cash>dayStart*(1-RULES.dailyLossFraction)&&entrySignal(bars,ix,i-1)&&Math.abs(b.open-bars[i-1].close)<=.25*ix[i-1].atr){
   const entry=b.open*(1+RULES.slippage),stop=entry-RULES.stopAtr*ix[i-1].atr,target=entry+RULES.rewardRisk*RULES.stopAtr*ix[i-1].atr;
   const size=positionSize(cash,entry,stop,fee);
   if(size.qty>0){position={...size,entry,stop,target,index:i,time:b.time};cash-=size.cost;costs+=size.cost*fee;}
  }
  if(position){
   // If both levels occur in a candle, assume the adverse stop was first.
   if(b.low<=position.stop)close(Math.min(b.open,position.stop),b.time,'stop');
   else if(b.high>=position.target)close(position.target,b.time,'target');
  }
  const equity=cash+(position?position.qty*b.close*(1-fee):0);peak=Math.max(peak,equity);drawdown=Math.max(drawdown,(peak-equity)/peak);
  if(drawdown>=RULES.maxDrawdown){halted=true;if(position)close(b.close,b.time,'drawdown');}
 }
 if(position)close(bars[end-1].close,bars[end-1].time,'period-end');
 const gains=trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0),losses=-trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0);
 const buyHold=1000/(bars[start].open*(1+RULES.slippage))*(1-fee)*bars[end-1].close*(1-RULES.slippage)*(1-fee)-1000;
 return {from:bars[start].time,to:bars[end-1].time+HOUR,endEquity:cash,pnl:cash-1000,returnPercent:(cash/1000-1)*100,maxDrawdownPercent:drawdown*100,tradeCount:trades.length,winRatePercent:trades.length?trades.filter(t=>t.pnl>0).length/trades.length*100:0,profitFactor:losses?gains/losses:null,estimatedFees:costs,buyHoldPnl:buyHold,cashBaselinePnl:0,trades};
}
export function backtest(bars){
 if(bars.length<24*90)throw Error('Нужно не менее 90 дней непрерывной часовой истории.');
 const ix=indicators(bars),first=200,n=bars.length-first,a=first+Math.floor(n*.6),b=first+Math.floor(n*.8);
 const development=runWindow(bars,ix,first,a,RULES.fee),validation=runWindow(bars,ix,a,b,RULES.fee),finalTest=runWindow(bars,ix,b,bars.length,RULES.fee),stress=runWindow(bars,ix,b,bars.length,RULES.fee*2);
 // This gate only admits a paper experiment. Never unlocks live execution.
 const paperGate=validation.pnl>0&&finalTest.pnl>0&&stress.pnl>0&&finalTest.tradeCount>=20&&finalTest.maxDrawdownPercent<=5;
 return {experimentReady:true,rules:RULES,development,validation,finalTest,stress,paperGate,liveEnabled:false,gateReason:paperGate?'Критерии учебного эксперимента выполнены. Реальная торговля не разрешена.':'Стратегия не прошла предварительный отбор: нужны положительные validation/test/stress, минимум 20 сделок в финальном тесте и просадка не выше 5%.',limitations:['Параметры заданы заранее и не обучались. Разбиение по времени 60/20/20 после прогрева индикаторов.','Вход на открытии следующего часа; комиссия 0.1% с каждой стороны, проскальзывание 0.05% с каждой стороны. Stress удваивает комиссию.','Модель не воспроизводит очередь заявок, частичное исполнение и историческую глубину стакана. При касании обоих уровней внутри свечи первым считается стоп.','Один период и один инструмент не доказывают будущую прибыль. Buy-and-hold использует весь капитал; стратегия ограничивает одну позицию 20% капитала.','Дневной лимит 2% блокирует новые входы по реализованному результату дня (UTC+3); просадка оценивается по закрытиям часов.']};
}
