const DAY=86400000;
export function periodStart(period,now=Date.now()){
 if(period==='all')return 0;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const today=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))-3*3600000;
 return today-(period==='week'?6:period==='month'?29:0)*DAY;
}
export function periodStats(paper,period='today',now=Date.now()){
 const from=periodStart(period,now);
 const trades=(paper?.trades||[]).filter(t=>Number.isFinite(t.closedAt)&&Number.isFinite(t.pnl)&&t.closedAt>=from&&t.closedAt<=now).slice().sort((a,b)=>b.closedAt-a.closedAt);
 return {from,to:now,trades,count:trades.length,pnl:trades.reduce((s,t)=>s+t.pnl,0),wins:trades.filter(t=>t.pnl>0).length};
}
export function reasonLabel(reason=''){
 if(reason.startsWith('Перерыв'))return 'Закрыто после паузы';
 if(reason.startsWith('Стоп'))return 'Цена упала до уровня выхода';
 if(reason.startsWith('Цель'))return 'Цена достигла цели';
 if(reason.startsWith('Обратное'))return 'Условия для покупки изменились';
 if(reason.startsWith('Истекли'))return 'Прошло 24 часа';
 if(reason.startsWith('Ручное'))return 'Закрыто вручную';
 if(reason.startsWith('Лимит'))return 'Сработал лимит потерь';
 return 'Сделка завершена';
}
export function initDashboard(){
 const $=s=>document.querySelector(s);
 let period='today',limit=20,lastData=null,signature='';
 const number=(n,d=2)=>Number(n).toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
 const signed=n=>(n>0?'+':'')+number(n);
 const when=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(t);
 const date=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',year:'numeric'}).format(t);
 const tone=n=>n>0?'positive':n<0?'negative':'neutral';
 const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 const detailLine=(label,value)=>{const div=node('div','trade-detail-line');div.append(node('dt','',label),node('dd','',value));return div};
 function render({paper=null,running=false,context=null,snapshot=null}={}){
  lastData={paper,running,context,snapshot};const now=Date.now(),stale=paper&&now-paper.lastUpdate>45000;
  $('#profile-balance').textContent=paper?number(paper.equity):'—';
  $('#profile-cash').textContent=paper?number(paper.cash)+' USDT':'Счёт ещё не создан';
  $('#profile-balance-note').textContent=paper?(paper.position?'Оценка с открытой сделкой':'Все средства свободны'):'После старта: 1 000 виртуальных USDT';
  $('#profile-sync').textContent=!running?'Наблюдение выключено':!context?'Наблюдение на паузе':!snapshot||now-snapshot.market.sourceTime>30000?'Обновляю данные':'Наблюдение включено';
  $('#profile-sync').dataset.state=running&&context&&snapshot&&now-snapshot.market.sourceTime<=30000?'active':'paused';
  $('#balance-time').textContent=paper?'Оценка на '+when(paper.lastUpdate)+(stale?' · не обновлялась':''):'';
  const p=paper?.position;$('#open-position').hidden=!p;
  if(p){
   const pnl=paper.equity-paper.cash-p.cost;
   $('#open-position-result').textContent=signed(pnl)+' USDT';$('#open-position-result').className='amount '+tone(pnl);
   $('#open-position-status').textContent=stale?'Оценка устарела':'Пока не продано';
   $('#open-position-summary').textContent=number(p.qty,8)+' BTC · покупка '+number(p.cost)+' USDT';
   $('#open-position-exit').textContent='Выход при росте до '+number(p.target)+' или падении до '+number(p.stop)+' USDT.';
  }
  const stats=periodStats(paper,period,now);
  $('#stat-profit').textContent=signed(stats.pnl);$('#stat-profit').className=tone(stats.pnl);
  $('#stat-count').textContent=String(stats.count);$('#stat-wins').textContent=stats.count?stats.wins+' из '+stats.count:'—';
  $('#period-caption').textContent=(period==='all'?'За всё время':date(stats.from)+(period==='today'?'':' — '+date(now)))+' · время Москвы';
  $('#history-count').textContent=stats.count?'Закрыто '+stats.count:'Пока нет закрытых сделок';
  const key=[period,limit,stats.from,stats.count,stats.pnl,stats.trades[0]?.closedAt].join(':');
  if(signature===key)return;signature=key;
  const list=$('#trade-list');const items=[];
  if(!stats.count){const empty=node('div','empty-history');empty.append(node('div','empty-mark','↔'),node('h3','','Здесь будут твои сделки'),node('p','',paper?'За выбранный период закрытых сделок нет.':'После первой учебной продажи здесь появятся её результат и причина.'));items.push(empty);}
  for(const t of stats.trades.slice(0,limit)){
   const row=node('details','trade-row');const summary=node('summary','trade-summary');
   const identity=node('div','trade-identity');identity.append(node('span','coin-mark','₿'));
   const names=node('div','trade-name');names.append(node('b','','Биткоин'),node('span','','BTC / USDT'));identity.append(names);
   const stamp=node('time','trade-date',when(t.closedAt));stamp.dateTime=new Date(t.closedAt).toISOString();
   const outcome=node('div','trade-outcome');outcome.append(node('b','amount '+tone(t.pnl),signed(t.pnl)+' USDT'),node('span','result-label',t.pnl>0?'В плюс':t.pnl<0?'В минус':'Без изменения'));
   summary.append(identity,stamp,outcome,node('span','row-caret','⌄'));row.append(summary);
   const info=node('div','trade-details');info.append(node('p','trade-reason',reasonLabel(t.reason)));
   const dl=node('dl','');dl.append(detailLine('Купили',when(t.openedAt)),detailLine('Продали',when(t.closedAt)),detailLine('Цена покупки',number(t.entry)+' USDT'),detailLine('Цена продажи',number(t.exit)+' USDT'),detailLine('Количество',number(t.qty,8)+' BTC'),detailLine('Потратили с расходами',number(t.cost)+' USDT'),detailLine('Получили после расходов',number(t.cost+t.pnl)+' USDT'));
   info.append(dl,node('p','muted','Учебная сделка. Комиссии и заданное проскальзывание включены в результат.'));row.append(info);items.push(row);
  }
  list.replaceChildren(...items);$('#history-more').hidden=stats.count<=limit;
 }
 for(const key of ['today','week','month','all'])$('#period-'+key).onclick=()=>{period=key;limit=20;for(const p of ['today','week','month','all'])$('#period-'+p).setAttribute('aria-pressed',String(p===key));render(lastData||{})};
 $('#history-more').onclick=()=>{limit+=20;render(lastData||{})};
 return render;
}
