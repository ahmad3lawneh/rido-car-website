import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../site/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
createServer(async(req,res)=>{
  try {
    let path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(path.endsWith('/')) path+='index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(resolve(root)+sep)) {res.writeHead(403);res.end();return;}
    const data=await readFile(file);
    res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(data);
  }catch {res.writeHead(404);res.end('Not found');}
}).listen(8787,'127.0.0.1',()=>console.log('RIDO CAR preview: http://127.0.0.1:8787'));
