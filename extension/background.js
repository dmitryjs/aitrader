chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const valid=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['bybit.com','www.bybit.com'].includes(u.hostname)}catch{return false}};
async function bind(tab){
 if(!tab?.id||!valid(tab.url))throw new Error('Открой вкладку bybit.com и нажми значок расширения.');
 await chrome.storage.session.set({bound:{tabId:tab.id,windowId:tab.windowId,url:tab.url},capture:null,pending:null});
 await chrome.sidePanel.setOptions({tabId:tab.id,path:'panel.html',enabled:true});
}
chrome.action.onClicked.addListener(tab=>{
 // open must remain within the user gesture; bind asynchronously before subsequent capture.
 chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});
 bind(tab).catch(e=>chrome.storage.session.set({capture:{error:e.message},bound:null}));
});
chrome.commands.onCommand.addListener((command,tab)=>{
 if(tab?.windowId)chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});
 bind(tab).then(()=>command==='select-area'?startSelection():undefined).catch(e=>chrome.storage.session.set({capture:{error:e.message},bound:null}));
});
async function boundActive(){
 const {bound}=await chrome.storage.session.get('bound');if(!bound)throw new Error('Сначала открой расширение кнопкой на вкладке Bybit.');
 const [active]=await chrome.tabs.query({active:true,windowId:bound.windowId});
 if(active?.id!==bound.tabId||!valid(active.url)||new URL(active.url).origin!==new URL(bound.url).origin)throw new Error('Разрешённая вкладка не активна. Вернись на неё и открой расширение заново.');
 return {...bound,url:active.url};
}
async function startSelection(){
 // A panel can outlive a reload or be reopened by the browser itself.
 // Recover only on an explicit selection request and an already accessible Bybit tab.
 const [active]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
 if(!active?.url)throw new Error('Нет доступа к вкладке. На странице Bybit нажми значок Trade Lens в панели браузера или Alt+Shift+X. Открытия боковой панели недостаточно.');
 if(!valid(active.url))throw new Error('Выделение доступно только на https://www.bybit.com или https://bybit.com.');
 await bind(active);
 const bound=await boundActive(),nonce=crypto.randomUUID();
 await chrome.storage.session.set({capture:null,pending:{nonce,tabId:bound.tabId,createdAt:Date.now()}});
 try{await chrome.scripting.executeScript({target:{tabId:bound.tabId},args:[nonce],func:nonce=>{
  document.getElementById('__trade_lens_selection')?.remove();
  const overlay=document.createElement('div');overlay.id='__trade_lens_selection';overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.2);cursor:crosshair;touch-action:none';
  const box=document.createElement('div');box.style.cssText='position:absolute;border:2px solid #d9fba3;background:rgba(217,251,163,.1);pointer-events:none';overlay.append(box);
  const hint=document.createElement('div');hint.textContent='Trade Lens: обведи область. Esc — отмена.';hint.style.cssText='position:absolute;top:12px;left:12px;background:#172119;color:#e5f2d7;padding:10px 14px;font:14px sans-serif;pointer-events:none';overlay.append(hint);document.documentElement.append(overlay);
  let start;const clean=()=>{overlay.remove();document.removeEventListener('keydown',escape,true)};
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();clean();chrome.runtime.sendMessage({type:'cancelSelection',nonce}).catch(()=>{})}};document.addEventListener('keydown',escape,true);
  overlay.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();start={x:e.clientX,y:e.clientY};overlay.setPointerCapture(e.pointerId)});
  overlay.addEventListener('pointermove',e=>{if(!start)return;Object.assign(box.style,{left:Math.min(start.x,e.clientX)+'px',top:Math.min(start.y,e.clientY)+'px',width:Math.abs(start.x-e.clientX)+'px',height:Math.abs(start.y-e.clientY)+'px'})});
  overlay.addEventListener('pointerup',e=>{if(!start)return;const x=Math.max(0,Math.min(start.x,e.clientX)),y=Math.max(0,Math.min(start.y,e.clientY)),width=Math.min(innerWidth-x,Math.abs(start.x-e.clientX)),height=Math.min(innerHeight-y,Math.abs(start.y-e.clientY));clean();
   requestAnimationFrame(()=>requestAnimationFrame(()=>chrome.runtime.sendMessage({type:'selection',nonce,rect:{x,y,width,height,vw:innerWidth,vh:innerHeight}}).catch(()=>{})));
  });
 }});}catch{
  await chrome.storage.session.set({pending:null});
  throw new Error('Браузер не разрешил выделение. На вкладке Bybit нажми значок Trade Lens в панели браузера или Alt+Shift+X.');
 }
}
async function completeSelection(msg,sender){
 const {pending}=await chrome.storage.session.get('pending');
 if(!pending||pending.nonce!==msg.nonce||sender.tab?.id!==pending.tabId||Date.now()-pending.createdAt>60000)throw new Error('Выделение устарело.');
 const bound=await boundActive(),r=msg.rect;
 if(!r||!Object.values(r).every(Number.isFinite)||r.width<8||r.height<8||r.vw<=0||r.vh<=0||r.x<0||r.y<0||r.x+r.width>r.vw+1||r.y+r.height>r.vh+1)throw new Error('Выдели область больше 8 пикселей.');
 const full=await chrome.tabs.captureVisibleTab(bound.windowId,{format:'png'});
 await boundActive(); // Abort if user switched during capture.
 const latest=await chrome.storage.session.get('pending');
 if(latest.pending?.nonce!==msg.nonce)throw new Error('Страница изменилась во время снимка. Выдели область заново.');
 const bitmap=await createImageBitmap(await (await fetch(full)).blob());
 const sx=bitmap.width/r.vw,sy=bitmap.height/r.vh;
 const scale=Math.min(1,1400/(r.width*sx),1400/(r.height*sy));
 const canvas=new OffscreenCanvas(Math.max(1,Math.round(r.width*sx*scale)),Math.max(1,Math.round(r.height*sy*scale)));
 canvas.getContext('2d').drawImage(bitmap,r.x*sx,r.y*sy,r.width*sx,r.height*sy,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.86});
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const u=new URL(bound.url);await chrome.storage.session.set({pending:null,capture:{image:'data:image/jpeg;base64,'+btoa(binary),url:u.origin+u.pathname,capturedAt:Date.now(),tabId:bound.tabId}});
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
 (async()=>{
  if(msg.type==='select'){if(sender.tab)throw new Error('Команда доступна только панели.');await startSelection();return {ok:true};}
  if(msg.type==='selection'){await completeSelection(msg,sender);return {ok:true};}
  if(msg.type==='cancelSelection'){const {pending}=await chrome.storage.session.get('pending');if(pending?.nonce===msg.nonce&&sender.tab?.id===pending.tabId)await chrome.storage.session.set({pending:null});return {ok:true};}
  if(msg.type==='validateTab'){if(sender.tab)throw new Error('Недоступно.');return {bound:await boundActive()};}
  throw new Error('Неизвестная команда.');
 })().then(respond).catch(async e=>{if(msg.type==='selection')await chrome.storage.session.set({capture:{error:e.message},pending:null});respond({error:e.message})});return true;
});
chrome.tabs.onActivated.addListener(async({tabId})=>{const {bound}=await chrome.storage.session.get('bound');if(bound&&tabId!==bound.tabId)await chrome.storage.session.set({capture:null,pending:null})});
chrome.tabs.onUpdated.addListener(async(tabId,info)=>{
 const {bound}=await chrome.storage.session.get('bound');
 if(bound?.tabId!==tabId||!(info.url||info.status==='loading'))return;
 const url=info.url||bound.url;
 const sameOrigin=valid(url)&&new URL(url).origin===new URL(bound.url).origin;
 await chrome.storage.session.set({capture:null,pending:null,bound:sameOrigin?{...bound,url}:null});
});
chrome.tabs.onRemoved.addListener(async tabId=>{const {bound}=await chrome.storage.session.get('bound');if(bound?.tabId===tabId)await chrome.storage.session.clear()});
