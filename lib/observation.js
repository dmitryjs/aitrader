import {AppError} from './core.js';
export const INTERVAL_MS=15*60*1000;
export function analyzeCandles(data,symbol,now=Date.now()){
 if(data.retCode!==0||data.result?.symbol!==symbol||data.result?.category!=='spot'||!Number.isFinite(data.time)||Math.abs(now-data.time)>30000)throw new AppError(502,'Свечи Bybit отсутствуют, устарели или относятся к другому рынку.');
 if(!Array.isArray(data.result.list))throw new AppError(502,'Bybit не вернул свечи.');
 const rows=data.result.list.map(r=>({start:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5])})).filter(r=>r.start+INTERVAL_MS<=data.time).sort((a,b)=>a.start-b.start);
 if(rows.length<60)throw new AppError(502,'Недостаточно закрытых свечей для наблюдения.');
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(!Object.values(r).every(Number.isFinite)||r.start%INTERVAL_MS!==0||r.low<=0||r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close)||r.volume<0||(i&&r.start-rows[i-1].start!==INTERVAL_MS))throw new AppError(502,'В свечах обнаружены пропуски или некорректные значения.');
 }
 const last=rows.at(-1);if(data.time-(last.start+INTERVAL_MS)>INTERVAL_MS+5000)throw new AppError(502,'Последняя закрытая свеча устарела.');
 const ema=period=>{let v=rows.slice(0,period).reduce((s,r)=>s+r.close,0)/period;for(const r of rows.slice(period))v+=(r.close-v)*2/(period+1);return v};
 const fast=ema(20),slow=ema(50);
 const ranges=rows.slice(1).map((r,i)=>Math.max(r.high-r.low,Math.abs(r.high-rows[i].close),Math.abs(r.low-rows[i].close)));
 const averageRange=ranges.slice(-14).reduce((a,b)=>a+b,0)/14;
 const recent=rows.slice(-20);
 const trend=last.close>fast&&fast>slow?'up':last.close<fast&&fast<slow?'down':'mixed';
 return {intervalMinutes:15,candleCount:rows.length,lastClosedAt:last.start+INTERVAL_MS,lastClose:last.close,ema20:fast,ema50:slow,averageTrueRange14:averageRange,rangeLow:Math.min(...recent.map(r=>r.low)),rangeHigh:Math.max(...recent.map(r=>r.high)),trend,signal:'none',note:'Средние и диапазон описывают прошлые цены. Они не подтверждают прибыльность сделки. Незакрытая свеча исключена.'};
}
