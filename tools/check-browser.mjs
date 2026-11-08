import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const qa=root+'.qa/';mkdirSync(qa,{recursive:true});
const profile=qa+'chrome-'+randomUUID();
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try {
  let port;
  for(let i=0;i<100;i++){if(existsSync(profile+'/DevToolsActivePort')){
    port=readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0];break;}await delay(100);}
  if(!port)throw Error('Chrome debugging unavailable');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  await call('Page.enable');
  const results=[];
  for(const [name,width,height,path] of [['desktop',1440,1000,''],['mobile',390,844,''],['small-mobile',320,740,''],['privacy-mobile',390,844,'privacy.html']]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await call('Page.navigate',{url:'http://127.0.0.1:8787/'+path});
    for(let i=0;i<40;i++){const x=await call('Runtime.evaluate',{expression:"document.readyState==='complete'",returnByValue:true});if(x.result.value)break;await delay(100);}
    const check=await call('Runtime.evaluate',{expression:`JSON.stringify({
      title:document.title,rtl:document.documentElement.dir==='rtl',
      width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),
      brokenAnchors:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.querySelector(a.getAttribute('href'))).length,
      whatsapp:[...document.links].some(a=>a.href==='https://wa.me/962782630529'),
      forms:document.forms.length,externalScripts:document.querySelectorAll('script[src]').length
    })`,returnByValue:true});
    const result={name,...JSON.parse(check.result.value)};results.push(result);
    if(!result.rtl||!result.images||result.scrollWidth>result.width||result.brokenAnchors||!result.whatsapp||result.forms||result.externalScripts)throw Error('Site check failed: '+name);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(qa+name+'.png',Buffer.from(shot.data,'base64'));
  }
  writeFileSync(qa+'results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:true,checks:results}));
  await call('Browser.close');
} finally {ws?.close();if(chrome.exitCode===null)chrome.kill();}
