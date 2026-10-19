import {initDashboard} from './dashboard.js';
import {coachView} from './coach.js';
import {createPaper,openPaper,markPaper} from './paper.js';
export async function initObserver({api,extension,showPage,fmt}){
 const $=s=>document.querySelector(s);
 const renderDashboard=initDashboard();
 let running=false,timer=null,epoch=0,context=null,lastQuoteAt=0,lastSnapshot=null,lastStrategy=null,marketKey='',quoteBusy=false,aiBusy=false,lastAIKey='',aiTimes=[],lastAIAt=0,report=null,paper=null;
 let preparing=false,coachError='',coachAction=null,launch=0;
 const save=async()=>{const data={report,paper};if(extension)await chrome.storage.local.set({experiment:data});else localStorage.setItem('trade-lens-experiment',JSON.stringify(data))};
 try{const saved=extension?(await chrome.storage.local.get('experiment')).experiment:JSON.parse(localStorage.getItem('trade-lens-experiment')||'null');if(saved){report=saved.report;if(saved.paper?.version===1&&Number.isFinite(saved.paper.cash)&&Array.isArray(saved.paper.trades))paper=saved.paper;}}catch{}
 const line=s=>{$('#watch-status').textContent=s};
 function showCoach(){
  renderDashboard({paper,running,context,snapshot:lastStrategy});
  const v=coachView({running,preparing,error:coachError,report,paper,context,snapshot:lastStrategy});coachAction=v.action;
  $('#coach-title').textContent=v.title;$('#coach-body').textContent=v.body;$('#coach-action').textContent=v.label;$('#coach-action').disabled=!v.action||preparing;
  $('#coach-pause').hidden=!running&&!preparing;$('#coach-levels').hidden=!v.levels;
  if(v.levels){$('#coach-entry').textContent=fmt(v.levels.entry)+' USDT';$('#coach-target').textContent=fmt(v.levels.target)+' USDT';$('#coach-stop').textContent=fmt(v.levels.stop)+' USDT'}
  const pnl=paper?paper.equity-1000:0;$('#coach-result').textContent='Результат тренировки: '+(pnl>0?'+':'')+Number(pnl).toLocaleString('ru-RU',{maximumFractionDigits:2})+' USDT';
 }
 async function prepareCoach(){
  if(preparing)return;const current=++launch;preparing=true;coachError='';showCoach();
  try{
   if(!await start())throw Error('Открой вкладку BTC/USDT и нажми значок Trade Lens в панели браузера.');
   if(!report?.experimentReady||!Number.isFinite(report.dataReceivedAt)||Date.now()-report.dataReceivedAt>86400000){
    const result=await api('backtest');if(current!==launch||!running)return;report=result;
   }
   if(current!==launch||!running)return;
   if(!paper)paper=createPaper();await save();showReport();lastQuoteAt=0;
  }catch(e){if(current===launch){coachError=e.message;$('#advanced').open=!running;}}
  finally{if(current===launch){preparing=false;showPaper()}}
 }
 function showReport(){
  if(!report)return;
  const rows=[['Разработка',report.development],['Проверка',report.validation],['Финальный тест',report.finalTest],['Двойная комиссия',report.stress]];
  $('#backtest-output').textContent=rows.map(([n,r])=>`${n}: ${fmt(r.pnl)} USDT · ${r.tradeCount} сделок · просадка ${fmt(r.maxDrawdownPercent)}%`).join('\n')+`\nУдержание BTC в финальном периоде: ${fmt(report.finalTest.buyHoldPnl)} USDT\nХранение USDT: 0 USDT\n${report.gateReason}\n${report.paperGate?'':'Учебная сессия разрешена только для исследования провалившей отбор стратегии. Реальная торговля закрыта.'}\nДанные получены: ${new Date(report.dataReceivedAt).toLocaleString()}\n`+report.limitations.join('\n');
 }
 function showPaper(){
  showCoach();
  $('#paper-start').disabled=!!paper||!report?.experimentReady||Date.now()-report.dataReceivedAt>86400000;
  const fresh=lastStrategy&&Math.abs(Date.now()-lastStrategy.market.sourceTime)<30000;
  $('#paper-open').disabled=!running||!paper||!!paper.position||paper.halted||!fresh||lastStrategy.candidate.signal!=='paper-candidate'||!report?.experimentReady||Date.now()-report.dataReceivedAt>86400000;
  $('#paper-close').disabled=!running||!paper?.position;
  if(!paper){$('#paper-output').textContent='Учебный счёт: 1 000 виртуальных USDT. Цель эксперимента: +10 USDT. До проверки истории входы закрыты.';return}
  const p=paper.position;
  $('#paper-output').textContent=`ВИРТУАЛЬНЫЙ СЧЁТ · НЕ СЧЁТ BYBIT\nОценка: ${fmt(paper.equity)} USDT\nОбщий результат: ${fmt(paper.equity-1000)} USDT\nЗакрытые сделки: ${paper.trades.length}\n${paper.halted?'Сработал лимит просадки. Новые входы закрыты.':''}\n`+(p?`Открыто ${fmt(p.qty)} BTC · вход ${fmt(p.entry)}\nСтоп ${fmt(p.stop)} · цель ${fmt(p.target)}`:'Открытых позиций нет.')+'\n'+paper.trades.slice(-5).reverse().map(t=>`${new Date(t.closedAt).toLocaleString()}: ${fmt(t.pnl)} USDT · ${t.reason}`).join('\n');
 }
 async function readContext(){
  if(!extension)return {symbol:$('#watch-symbol').value,ui:{labels:[]},tabId:null};
  const r=await chrome.runtime.sendMessage({type:'watchContext'});if(r.error)throw Error(r.error);return r;
 }
 async function explain(symbol,key,requestEpoch){
  const now=Date.now();aiTimes=aiTimes.filter(t=>now-t<3600000);
  if(aiBusy||key===lastAIKey||now-lastAIAt<60000||aiTimes.length>=12||!$('#watch-ai').checked)return;
  aiBusy=true;lastAIAt=now;aiTimes.push(now);lastAIKey=key;
  $('#watch-explanation').textContent='Astra составляет сводку…';
  try{const d=await api('observeExplain',{symbol});if(!running||epoch!==requestEpoch||context?.symbol!==symbol)return;
   $('#watch-explanation').textContent=d.answer+'\n'+d.model+' · данные на '+new Date(d.market.sourceTime).toLocaleTimeString();
   if($('#watch-voice').checked&&globalThis.speechSynthesis){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(d.answer);u.lang='ru-RU';speechSynthesis.speak(u)}
  }catch(e){if(epoch===requestEpoch)$('#watch-explanation').textContent=e.message}finally{aiBusy=false}
 }
 async function refresh(symbol,requestEpoch){
  if(quoteBusy)return;quoteBusy=true;lastQuoteAt=Date.now();
  try{
   const d=await api('observe',{symbol});if(!running||epoch!==requestEpoch||context?.symbol!==symbol)return;
   lastSnapshot=d;coachError='';
   const o=d.observation,trend={up:'Последние закрытия и средние направлены вверх',down:'Последние закрытия и средние направлены вниз',mixed:'Средние не дают согласованного направления'}[o.trend];
   $('#watch-market').textContent=`${symbol.replace('USDT','/USDT')} · спот\nПоследняя цена: ${fmt(d.market.price)} USDT\nОтвет Bybit: ${new Date(d.market.sourceTime).toLocaleTimeString()}\n${trend}\nДиапазон последних 20 свечей по 15 минут: ${fmt(o.rangeLow)}–${fmt(o.rangeHigh)}\nСредний диапазон движения свечи: ${fmt(o.averageTrueRange14)} USDT\n${o.note}`;
   line('Наблюдение активно · данные обновляются каждые 15 секунд.');
   void explain(symbol,symbol+':'+o.lastClosedAt+':'+o.trend,requestEpoch);
   // Paper BTC position remains watched even if the user opens another supported coin.
   if(symbol==='BTCUSDT'||paper?.position){
    const s=await api('strategy');if(!running||epoch!==requestEpoch)return;lastStrategy=s;
    $('#strategy-output').textContent=s.candidate.reason+'\nПравило: EMA 20 пересекает EMA 50 вверх, цена выше EMA 200. Средние считаются по закрытым часовым свечам.\n'+(s.candidate.signal==='paper-candidate'?`Учебные ориентиры: вход ${fmt(s.candidate.entry)}, стоп ${fmt(s.candidate.stop)}, цель ${fmt(s.candidate.target)}. Это не заявка.`:'Сейчас входа нет. Ожидание — часть стратегии.');
    if(paper){paper=markPaper(paper,s);await save();if(!paper.position&&s.candidate.signal==='paper-candidate'){try{const preview=openPaper(paper,s,report);$('#strategy-output').textContent+='\nУчебная покупка: '+fmt(preview.position.qty)+' BTC · расходы '+fmt(preview.position.cost)+' USDT. Подтверждение кнопкой ниже.'}catch(e){$('#strategy-output').textContent+='\n'+e.message}}}
   }else{$('#strategy-output').textContent='Стратегия первого эксперимента проверяется только для BTC/USDT.';lastStrategy=null}
   showPaper();
  }catch(e){if(epoch===requestEpoch){lastStrategy=null;coachError='Нет свежих данных. '+e.message;line('Свежие данные недоступны: '+e.message);$('#watch-market').textContent='Обновление не получено. Предыдущие цены не используются для нового входа.';showPaper()}}finally{quoteBusy=false}
 }
 async function tick(){
  if(!running)return;
  try{
   const c=await readContext();if(!running)return;
   const key=c.tabId+':'+c.symbol;if(key!==marketKey){marketKey=key;epoch++;lastQuoteAt=0;lastStrategy=null;lastSnapshot=null;$('#watch-market').textContent='Получение данных новой пары…';$('#watch-explanation').textContent='Сводка обновится автоматически.'}
   context=c;$('#risk-form').elements.symbol.value=c.symbol;
   const pointer=c.ui?.pointer;$('#watch-context').textContent=extension?`Открыта ${c.symbol.replace('USDT','/USDT')} · спот\nЭлементы страницы: ${c.ui?.labels?.join(', ')||'пока не распознаны'}\n`+(pointer&&Date.now()-pointer.at<10000?`Мышь: ${pointer.x}, ${pointer.y}${pointer.label?' · '+pointer.label:''}`:'Движение мыши внутри страницы пока не получено.')+(c.ui?.lastClick?'\nПоследнее нажатие: '+c.ui.lastClick.label+' (не подтверждение сделки)':''):'Веб-режим: выбранная пара. Для чтения вкладки и мыши нужно расширение.';
   if(Date.now()-lastQuoteAt>=15000)void refresh(c.symbol,epoch);
   if(lastSnapshot&&Date.now()-lastSnapshot.market.sourceTime>45000)line('Котировка устарела. Новые учебные входы приостановлены.');
   showPaper();
  }catch(e){if(context){epoch++;context=null;lastStrategy=null;lastQuoteAt=0;globalThis.speechSynthesis?.cancel()}line(e.message);$('#watch-market').textContent='Наблюдение на паузе. Данные предыдущей страницы скрыты.';$('#watch-explanation').textContent='Сводка возобновится после возврата на разрешённую вкладку.';showPaper()}
  finally{if(running)timer=setTimeout(tick,2000)}
 }
 async function start(){
  if(running)return true;
  try{if(extension){const r=await chrome.runtime.sendMessage({type:'watchStart'});if(r.error)throw Error(r.error)}
   running=true;epoch++;lastQuoteAt=0;$('#watch-start').disabled=true;$('#watch-stop').disabled=false;line('Подключение наблюдения…');void tick();return true;
  }catch(e){line(e.message);coachError=e.message;return false}
 }
 async function stop(){launch++;preparing=false;coachError='';running=false;epoch++;clearTimeout(timer);globalThis.speechSynthesis?.cancel();if(extension)await chrome.runtime.sendMessage({type:'watchStop'});$('#watch-start').disabled=false;$('#watch-stop').disabled=true;line('Наблюдение остановлено. Виртуальная позиция, если она открыта, не отслеживается; после перерыва будет закрыта по первой полученной цене.');showPaper()}
 $('#watch-start').onclick=start;$('#watch-stop').onclick=stop;
 $('#backtest').onclick=async()=>{if($('#backtest').disabled)return;$('#backtest').disabled=true;$('#backtest-output').textContent='Загрузка примерно 200 дней истории Bybit и проверка стратегии. Это может занять до минуты.';try{report=await api('backtest');await save();showReport();showPaper()}catch(e){$('#backtest-output').textContent='Тест не выполнен: '+e.message}finally{$('#backtest').disabled=false}};
 $('#paper-start').onclick=async()=>{if(paper)return;if(!report?.experimentReady)return;paper=createPaper();await save();showPaper()};
 $('#paper-open').onclick=async()=>{if(!running||!paper)return;$('#paper-open').disabled=true;try{const s=await api('strategy');if(!running)throw Error('Наблюдение остановлено.');paper=openPaper(paper,s,report);lastStrategy=s;coachError='';await save();showPaper()}catch(e){coachError=e.message;line(e.message);showCoach()}};
 $('#paper-close').onclick=async()=>{if(!paper?.position)return;try{const s=await api('strategy');paper=markPaper(paper,s,Date.now(),true);await save();showPaper()}catch(e){line(e.message)}};
 $('#watch-review').onclick=()=>{const symbol=context?.symbol||'BTCUSDT';$('#risk-form').elements.symbol.value=symbol;showPage('risk')};
 for(const control of ['buy','limit'])$('#guide-'+control).onclick=async()=>{if(!extension){line('Подсветка доступна в расширении.');return}try{const r=await chrome.runtime.sendMessage({type:'highlight',control});if(r.error)throw Error(r.error);line(r.found===1?'Элемент обведён на странице. Нажатия и отправки заявки не было.':`Найдено элементов: ${r.found}. Однозначно подсветить не удалось.`)}catch(e){line(e.message)}};
 $('#experiment-export').onclick=()=>{const blob=new Blob([JSON.stringify({report,paper},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='trade-lens-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $('#coach-action').onclick=async()=>{const action=coachAction;if(action==='buy')await $('#paper-open').onclick();else if(action==='start'||action==='prepare')await prepareCoach();else if(action==='retry'){coachError='';lastQuoteAt=0;if(!report?.experimentReady)await prepareCoach();else showCoach()}};
 $('#coach-pause').onclick=stop;
 $('#disconnect').addEventListener('click',()=>void stop());
 if(extension)$('#watch-symbol-label').hidden=true;showReport();showPaper();
 window.addEventListener('pagehide',()=>{running=false;epoch++;clearTimeout(timer);if(extension)void chrome.runtime.sendMessage({type:'watchStop'}).catch(()=>{})});
}
