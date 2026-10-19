import {createHmac,timingSafeEqual} from 'node:crypto';
export class AppError extends Error {constructor(status,message){super(message);this.status=status;}}
export function authenticate(header,token){
 if(!token||token.length<32)throw new AppError(503,'В Vercel не настроен APP_ACCESS_TOKEN длиной не менее 32 символов.');
 const value=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7):'';
 const a=Buffer.from(value),b=Buffer.from(token);
 if(a.length!==b.length||!timingSafeEqual(a,b))throw new AppError(401,'Неверный код доступа к помощнику.');
}
export function signGet(timestamp,key,secret,query){return createHmac('sha256',secret).update(timestamp+key+'5000'+query).digest('hex');}
export function isBybit(url){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='bybit.com'||u.hostname==='www.bybit.com');}catch{return false}}
export function validateContext(body){
 const question=typeof body.question==='string'?body.question.trim():'';
 if(!question||question.length>4000)throw new AppError(400,'Вопрос должен содержать от 1 до 4000 символов.');
 let context=null;
 if(body.context){const c=body.context;
  if(!isBybit(c.url)||!Number.isFinite(c.capturedAt)||c.capturedAt>Date.now()+5000||Date.now()-c.capturedAt>120000)throw new AppError(400,'Контекст вкладки недействителен или старше двух минут. Выдели область заново.');
  if(typeof c.image!=='string'||c.image.length>2000000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(c.image))throw new AppError(400,'Нужен PNG/JPEG до 1,5 МБ.');
  // Never send full URL query parameters or fragments to the provider.
  const u=new URL(c.url);context={image:c.image,capturedAt:c.capturedAt,url:u.origin+u.pathname};
 }
 return {question,context};
}
export function calculateRisk(body){
 const keys=['budget','entry','stop','lossLimit','feePercent','slippagePercent'];
 for(const k of keys)if(typeof body[k]!=='number'||!Number.isFinite(body[k]))throw new AppError(400,'Заполни все поля расчёта числами.');
 const {budget,entry,stop,lossLimit,feePercent,slippagePercent}=body;
 if(budget<=0||budget>1e9||entry<=0||entry>1e9||stop<=0||stop>=entry||lossLimit<=0||lossLimit>budget||feePercent<0||feePercent>5||slippagePercent<0||slippagePercent>10)throw new AppError(400,'Проверь параметры: стоп ниже входа, риск больше нуля и не выше бюджета.');
 const fee=feePercent/100,slip=slippagePercent/100;
 const entryExec=entry*(1+slip),exitExec=stop*(1-slip);
 const unitCost=entryExec*(1+fee),unitLoss=unitCost-exitExec*(1-fee);
 const qty=Math.floor(Math.min(budget/unitCost,lossLimit/unitLoss)*1e8)/1e8;
 if(qty<=0)throw new AppError(400,'Сумма слишком мала для расчёта BTC.');
 return {symbol:'BTCUSDT',side:'long',quantity:qty,cashRequired:qty*unitCost,estimatedLoss:qty*unitLoss,entryExecution:entryExec,stopExecution:exitExec,assumptions:{feePercent,slippagePercent},notice:'Сценарная оценка, не гарантия убытка. Комиссия и проскальзывание заданы тобой; ограничения лота биржи не проверены. Заявка не создаётся.'};
}
