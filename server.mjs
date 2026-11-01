import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 4311);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.wav':'audio/wav','.png':'image/png','.json':'application/json'};
const server=http.createServer(async (req,res) => {
 try {
  const url = new URL(req.url, 'http://localhost');
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root,relative);
  const safe = path.relative(root,file);
  if(safe.startsWith('..') || path.isAbsolute(safe) || safe.split(path.sep).some(p=>p.startsWith('.')) || !/\.(html|css|js|svg|wav|png|json)$/.test(file)) {res.writeHead(403);res.end('Forbidden');return;}
  if(!(await stat(file)).isFile()) throw new Error('Not a file');
  const bytes=await readFile(file);
  const headers={'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
  if(req.headers.range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(!match || (!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':'bytes */'+bytes.length});res.end();return;}
   const start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));
   const end=match[1]&&match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
   if(start>end||start>=bytes.length){res.writeHead(416,{'Content-Range':'bytes */'+bytes.length});res.end();return;}
   res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':'bytes '+start+'-'+end+'/'+bytes.length});
   res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));
  }else{res.writeHead(200,{...headers,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);}
 } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
