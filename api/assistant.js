import {AppError,authenticate,validateContext,calculateRisk} from '../lib/core.js';
import {market,account,chat,modelInfo} from '../lib/providers.js';
export const config={maxDuration:90};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const origin=req.headers.origin||'';
 // CORS is not authentication. Every operation still needs a strong bearer token.
 if(/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
 }
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 try{
  if(req.method!=='POST')throw new AppError(405,'Используется POST.');
  authenticate(req.headers.authorization,process.env.APP_ACCESS_TOKEN);
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new AppError(415,'Требуется JSON.');
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
  if(Buffer.byteLength(raw)>2200000)throw new AppError(413,'Слишком большой запрос. Выдели меньшую область.');
  let b;try{b=JSON.parse(raw);}catch{throw new AppError(400,'Некорректный JSON.');}
  if(!b||Array.isArray(b)||typeof b!=='object')throw new AppError(400,'Некорректный запрос.');
  let data;
  switch(b.action){
   case 'status':data={mode:'read-only',tradingEnabled:false,model:process.env.POLZA_MODEL||'openai/gpt-6-astra',polzaConfigured:!!process.env.POLZA_API_KEY,bybitDemoConfigured:!!(process.env.BYBIT_DEMO_API_KEY&&process.env.BYBIT_DEMO_API_SECRET),notice:'Наличие ключа не означает проверенное соединение.'};break;
   case 'checkModel':data=await modelInfo(process.env);break;
   case 'market':data=await market();break;
   case 'account':data=await account(process.env);break;
   case 'risk':data=calculateRisk(b);break;
   case 'chat':data=await chat(validateContext(b),process.env);break;
   default:throw new AppError(400,'Неизвестная операция. Отправка заявок в этой версии отсутствует.');
  }
  return res.status(200).json(data);
 }catch(e){return res.status(e instanceof AppError?e.status:500).json({error:e instanceof AppError?e.message:'Внутренняя ошибка. Запрос не выполнен.'});}
}
