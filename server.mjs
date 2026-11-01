import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DesktopBridge } from './desktop-bridge.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.wav':'audio/wav','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const commands = new Set(['play','pause','previous','next','seek']);
function json(res, status, data) {
 res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(data));
}
export function createAppServer({ bridge = new DesktopBridge() } = {}) {
const server=http.createServer(async (req,res) => {
 try {
  const url = new URL(req.url, 'http://localhost');
  if(url.pathname.startsWith('/api/')) {
   const hosts = [`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`];
   if (!hosts.includes(req.headers.host) || req.headers['x-side-a'] !== '1' ||
       (req.headers.origin && req.headers.origin !== 'http://'+req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') {
    json(res,403,{error:'Open Side A from its local server to connect to Windows.'}); return;
   }
   if(url.pathname === '/api/desktop/state' && req.method === 'GET') {
    const sessionId=url.searchParams.get('sessionId') || '';
    if(sessionId.length>512) {json(res,400,{error:'Invalid player.'});return;}
    try {json(res,200,await bridge.request('state',sessionId));}
    catch(error) {json(res,503,{error:error.message});}
    return;
   }
   if(url.pathname === '/api/desktop/control' && req.method === 'POST') {
    if(req.headers['content-type']?.split(';')[0] !== 'application/json') {json(res,415,{error:'Expected JSON.'});return;}
    let body='';
    for await (const chunk of req) {body+=chunk; if(Buffer.byteLength(body)>4096){json(res,413,{error:'Request too large.'});return;}}
    let data;
    try {data=JSON.parse(body);} catch {json(res,400,{error:'Invalid JSON.'});return;}
    if(!data || !commands.has(data.command) || typeof data.sessionId !== 'string' || !data.sessionId || data.sessionId.length>512 ||
       (data.command === 'seek' && (!Number.isFinite(data.position) || data.position<0 || data.position>604800))) {
     json(res,400,{error:'Invalid playback command.'});return;
    }
    try {json(res,200,await bridge.request(data.command,data.sessionId,data.position));}
    catch(error) {json(res,503,{error:error.message});}
    return;
   }
   json(res,404,{error:'Unknown endpoint or method.'}); return;
  }
  if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root,relative);
  const safe = path.relative(root,file);
  if(safe.startsWith('..') || path.isAbsolute(safe) || safe.split(path.sep).some(p=>p.startsWith('.')) || !/\.(html|css|js|svg|wav|png|jpg|json)$/.test(file)) {res.writeHead(403);res.end('Forbidden');return;}
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
});
server.on('close',()=>bridge.stop());
return server;
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const port=Number(process.env.PORT || process.argv.slice(2).find(arg=>/^\d+$/.test(arg)) || 4311);
 const bridge=new DesktopBridge();
 const server=createAppServer({bridge});
 server.on('error',error=>{console.error(error.code==='EADDRINUSE' ? `Port ${port} is in use. Close the other Side A window or run node server.mjs 4312.` : error.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>{
  const address='http://127.0.0.1:'+server.address().port;
  console.log('Local: '+address);
  if(process.argv.includes('--open') && process.platform==='win32') {
   const opener=spawn('rundll32.exe',['url.dll,FileProtocolHandler',address],{windowsHide:true,stdio:'ignore'});
   opener.on('error',()=>console.log('Open the address above in your browser.'));opener.unref();
  }
 });
 const stop=()=>{bridge.stop();server.close();};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 process.on('exit',()=>bridge.stop());
}
