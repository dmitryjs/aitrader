import {openPaper} from './paper.js';
// The instruction is derived from verified state, never from free-form model text.
export function coachView({running=false,preparing=false,error='',report=null,paper=null,context=null,snapshot=null,now=Date.now()}){
 const view=(title,body,label,action=null,levels=null)=>({title,body,label,action,levels});
 const money=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
 if(preparing)return view('Проверяю, можно ли начинать','Загружаю историю и проверяю стратегию. Пока ничего не покупай.','Проверка…');
 if(error)return view('Сейчас ничего не покупать',error,'Повторить',running?'retry':'start');
 if(!running)return view(paper?.position?'Наблюдение остановлено':'Начнём с тестовых денег',paper?.position?'Есть виртуальная позиция. Возобнови наблюдение: после перерыва она закроется по первой доступной цене.':'Я проверю стратегию и буду показывать только следующий шаг. Деньги в Bybit не используются.',paper?'Продолжить тренировку':'Начать тренировку','start');
 const fresh=snapshot&&Number.isFinite(snapshot.market?.sourceTime)&&Math.abs(now-snapshot.market.sourceTime)<30000;
 if(!context)return view('Вернись на вкладку Bybit','Наблюдение возобновится автоматически. Пока ничего не покупай.','Жду вкладку');
 if(context.symbol!=='BTCUSDT'&&!paper?.position)return view('Открой BTC/USDT на Bybit','Первая стратегия работает только с биткоином. После перехода продолжу автоматически.','Жду BTC/USDT');
 if(!fresh)return view('Проверяю текущую цену','Для решения нужны свежие данные. Пока ничего не покупай.','Жду данные');
 if(paper?.position){const p=paper.position;return view('BTC куплен виртуально. Теперь ждём',`Продам виртуальную позицию при достижении цели или уровня ограничения убытка. Оставь панель открытой.`, 'Ждём продажи',null,{entry:p.entry,stop:p.stop,target:p.target,qty:p.qty,cost:p.cost});}
 if(!report?.experimentReady||!Number.isFinite(report.dataReceivedAt)||now-report.dataReceivedAt>86400000)return view('Нужно проверить стратегию','Проверку и подготовку виртуального счёта выполню сам.','Проверить и продолжить','prepare');
 if(!report.paperGate)return view('Сейчас ничего не покупать','Стратегия не прошла историческую проверку. Оснований для покупки нет.','Покупка недоступна');
 if(context.symbol!=='BTCUSDT')return view('Открой BTC/USDT на Bybit','Первая стратегия работает только с биткоином. После перехода продолжу автоматически.','Жду BTC/USDT');
 if(paper?.halted)return view('На сегодня остановились','Сработал лимит потерь учебного счёта. Новые покупки отключены.','Покупка недоступна');
 if(!paper)return view('Подготовлю тестовый счёт','Создам 1 000 виртуальных USDT. Реальные деньги не нужны.','Продолжить','prepare');
 if(snapshot.candidate?.signal==='paper-candidate'){
  try{const preview=openPaper(paper,snapshot,report,now).position;
   return view(`Купить BTC виртуально на ${money(preview.cost)} USDT`,'Нажми кнопку ниже в помощнике. На сайте Bybit ничего покупать не нужно.',`Купить виртуально за ${money(preview.cost)} USDT`,'buy',preview);
  }catch(e){return view('Сейчас ничего не покупать',e.message,'Ждём следующего сигнала');}
 }
 const last=paper.trades.at(-1);
 if(last)return view('Виртуальная сделка закрыта',`Результат сделки: ${last.pnl>=0?'+':''}${money(last.pnl)} USDT. Сейчас новую покупку не делаем — ждём следующего сигнала.`,'Ждём следующего сигнала');
 return view('Сейчас ничего не покупать','Условия для входа ещё не появились. Я слежу за ценой и покажу, когда появится учебная покупка.','Ждём сигнала');
}
