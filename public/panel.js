import {initObserver} from './observer.js';
const $=s=>document.querySelector(s),extension=!!globalThis.chrome?.runtime?.id;
let config={base:location.origin,token:''},context=null,busy=false,answerText='';
function showPage(id){document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==id)}
const fmt=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:8});
function status(s){$('#status').textContent=s;}
async function api(action,data={}){
 if(!config.token)throw new Error('Сначала подключи сервер кодом доступа.');
 const r=await fetch(config.base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(85000)});
 let d;try{d=await r.json()}catch{throw new Error('Сервер не вернул JSON. Проверь URL и защиту деплоя Vercel.');}
 if(!r.ok)throw new Error(d.error||'Ошибка сервера: '+r.status);return d;
}
function clearCapture(){context=null;$('#preview').removeAttribute('src');$('#preview-wrap').hidden=true;$('#capture-info').textContent=extension?'Выдели область. Снимок отправляется только вместе с вопросом.':'Веб-страница не читает вкладку Bybit. Для этого нужно расширение.';}
async function loadCapture(){if(!extension)return;const {capture}=await chrome.storage.session.get('capture');clearCapture();if(capture?.error){status(capture.error);return}if(capture?.image){context=capture;$('#preview').src=capture.image;$('#preview-wrap').hidden=false;$('#capture-info').textContent='Выбрано '+new Date(capture.capturedAt).toLocaleTimeString()+'. Проверяй снимок перед отправкой.'}}
$('#connect').onclick=async()=>{try{
 const token=$('#token').value.trim();if(token.length<32)throw new Error('Код APP_ACCESS_TOKEN должен быть не короче 32 символов.');
 let base=location.origin;
 if(extension){const u=new URL($('#backend').value.trim());if(u.protocol!=='https:'||!u.hostname.endsWith('.vercel.app')||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/')throw new Error('Нужен корневой HTTPS-адрес проекта .vercel.app.');base=u.origin;
 const allowed=await chrome.permissions.request({origins:[base+'/*']});if(!allowed)throw new Error('Не разрешён доступ к выбранному серверу.');}
 config={base,token};const d=await api('status');if(extension)await chrome.storage.local.set({config});
 $('#token').value='';$('#setup').open=false;$('#advanced').open=false;document.body.dataset.connection='ready';status('Сервер доступен. '+(d.polzaConfigured?'Ключ Polza задан; модель ещё нужно проверить.':'В Vercel отсутствует ключ Polza.')+' Торговля отключена.');
 }catch(e){status(e.message)}};
$('#disconnect').onclick=async()=>{config.token='';if(extension){await chrome.storage.local.remove('config');await chrome.storage.session.clear()}clearCapture();$('#setup').open=true;globalThis.speechSynthesis?.cancel();document.body.dataset.connection='missing';$('#advanced').open=true;status('Код доступа удалён.');};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('#capture').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'select'});if(r.error)throw new Error(r.error);status('Обведи область на странице Bybit. Esc — отмена.')}catch(e){status(e.message);$('#capture-info').textContent=e.message}};
$('#remove-capture').onclick=async()=>{clearCapture();if(extension)await chrome.storage.session.set({capture:null})};
$('#ask').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('#submit').disabled=true;status('Запрос к модели…');try{
 if(context&&extension){const r=await chrome.runtime.sendMessage({type:'validateTab'});if(r.error||r.bound?.tabId!==context.tabId)throw new Error('Вкладка изменилась. Выдели область заново.');}
 if(context&&Date.now()-context.capturedAt>120000)throw new Error('Снимок старше двух минут. Выдели область заново.');
 const d=await api('chat',{symbol:$('#risk-form').elements.symbol.value,question:$('#question').value,context:context?{image:context.image,url:context.url,capturedAt:context.capturedAt}:null});answerText=d.answer;$('#answer').textContent=d.answer;status('Ответ: '+d.model+' · '+new Date(d.answeredAt).toLocaleTimeString()+ (d.market?.status==='unavailable'?' · свежие рыночные данные недоступны.':''));
 }catch(e){status(e.message)}finally{busy=false;$('#submit').disabled=false}};
$('#speak').onclick=()=>{if(!answerText){status('Сначала получи ответ модели.');return}if(!globalThis.speechSynthesis){status('Озвучка браузера недоступна.');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(answerText);u.lang='ru-RU';u.onerror=()=>status('Не удалось озвучить ответ. Текст доступен.');speechSynthesis.speak(u)};
$('#market').onclick=async()=>{try{const d=await api('market');$('#market-output').textContent=`${d.symbol} · spot\nЦена: ${fmt(d.price)} USDT\nИзменение за 24ч: ${fmt(d.price24hChangePercent)}%\nОтвет Bybit: ${new Date(d.sourceTime).toLocaleString()}\n${d.note}`;}catch(e){$('#market-output').textContent=e.message}};
$('#account').onclick=async()=>{try{const d=await api('account');$('#account-output').textContent=`Bybit DEMO · только чтение\nОценка счёта: ${d.totalEquityUSD??'не получена'} USD\n`+d.coins.map(c=>`${c.coin}: кошелёк ${c.walletBalance}; заблокировано ${c.locked??'не получено'}`).join('\n')+'\n'+d.note+'\nПолучено: '+new Date(d.receivedAt).toLocaleString();}catch(e){$('#account-output').textContent=e.message}};
$('#model-check').onclick=async()=>{try{const d=await api('checkModel');$('#model-output').textContent=`Модель найдена: ${d.id}\nИзображения по каталогу: ${d.imageSupported?'поддерживаются':'не подтверждены'}\nФактический текстовый/визуальный запрос проверяется отдельно.`;}catch(e){$('#model-output').textContent=e.message}};
$('#risk-form').onsubmit=async e=>{e.preventDefault();try{const values=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,k==='symbol'?v:Number(v)]));const d=await api('risk',values);$('#risk-output').textContent=`Количество: ${fmt(d.quantity)} ${d.symbol.replace('USDT','')}\nНужно средств: ${fmt(d.cashRequired)} USDT\nУбыток по сценарию: ${fmt(d.estimatedLoss)} USDT\n\n${d.notice}`;}catch(e){$('#risk-output').textContent=e.message}};
$('#entry-market').onclick=async()=>{try{
 const d=await api('market',{symbol:$('#risk-form').elements.symbol.value});$('#risk-form').elements.entry.value=d.price;
 $('#risk-output').textContent='Последняя цена: '+fmt(d.price)+' USDT · ответ Bybit '+new Date(d.sourceTime).toLocaleString()+'. Это ориентир входа, не гарантированная цена исполнения.';
}catch(e){$('#risk-output').textContent=e.message}};
$('#review').onclick=async()=>{
 const form=$('#risk-form');if(!form.reportValidity())return;
 const values=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,k==='symbol'?v:Number(v)]));
 $('#review').disabled=true;$('#risk-output').textContent='Проверка цены, расчёт и объяснение Astra…';
 try{const d=await api('review',values),p=d.plan;
 $('#risk-output').textContent=`ПЛАН ПОКУПКИ ${p.symbol.replace('USDT','/USDT')} · БЕЗ ПЛЕЧА
Последняя цена Bybit: ${fmt(d.market.price)} USDT
Время ответа API: ${new Date(d.market.sourceTime).toLocaleString()}
Твой вход: ${fmt(p.entry)} · отличие от цены: ${fmt(d.entryDistancePercent)}%
Стоп: ${fmt(p.stop)} · цель: ${fmt(p.target)}

РАСЧЁТ КОДОМ
Количество: ${fmt(p.quantity)} ${p.symbol.replace('USDT','')}
Нужно средств с расходами: ${fmt(p.cashRequired)} USDT
Убыток у стопа с расходами: ${fmt(p.estimatedLoss)} USDT
Результат у цели с расходами: ${fmt(p.estimatedProfit)} USDT
Результат / риск: ${fmt(p.rewardRisk)}
Цена безубыточности с расходами: ${fmt(p.breakEvenPrice)} USDT

${d.warnings.join('\n')}

ОБЪЯСНЕНИЕ ${d.model||'НЕДОСТУПНО'}
${d.explanation||d.explanationError}

Заявка не отправлена. Это сценарий, не торговый сигнал.`;
 }catch(e){$('#risk-output').textContent=e.message}finally{$('#review').disabled=false}
};
$('#open-review').onclick=()=>showPage('risk');
(async()=>{clearCapture();if(extension){$('#capture').disabled=false;const stored=await chrome.storage.local.get('config');if(stored.config){config=stored.config;$('#backend').value=config.base;$('#setup').open=false;status('Настройки загружены. Соединение в этой сессии ещё не проверено.');}chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.capture)loadCapture()});await loadCapture();}else{$('#backend-label').hidden=true;$('#capture').hidden=true;}document.body.dataset.connection=config.token?'ready':'missing';if(!config.token)$('#advanced').open=true;await initObserver({api,extension,showPage,fmt});})();
