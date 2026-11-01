import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAppServer } from './server.mjs';
const calls=[];
const bridge={request:async(...args)=>{calls.push(args);return {available:true,sessions:[],track:null};},stop:()=>{}};
let server,origin;
before(async()=>{server=createAppServer({bridge});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;});
after(()=>new Promise(resolve=>server.close(resolve)));
const headers={'X-Side-A':'1','Content-Type':'application/json'};
test('local metadata is uncached and only explicit same-origin commands reach Windows',async()=>{
  const state=await fetch(origin+'/api/desktop/state?sessionId=Spotify.exe',{headers});
  assert.equal(state.status,200);assert.equal(state.headers.get('cache-control'),'no-store');
  assert.deepEqual(calls.at(-1),['state','Spotify.exe']);
  const control=await fetch(origin+'/api/desktop/control',{method:'POST',headers:{...headers,Origin:origin},body:JSON.stringify({command:'pause',sessionId:'Spotify.exe'})});
  assert.equal(control.status,200);assert.deepEqual(calls.at(-1),['pause','Spotify.exe',undefined]);
});
test('cross-origin, DNS-rebinding, and plain form requests cannot read or control desktop players',async()=>{
  const before=calls.length;
  for(const badHeaders of [{},{...headers,Origin:'https://evil.example'},{...headers,'Sec-Fetch-Site':'cross-site'}]) {
    assert.equal((await fetch(origin+'/api/desktop/state',{headers:badHeaders})).status,403);
  }
  const rebound=await new Promise((resolve,reject)=>{
    const req=http.get(origin+'/api/desktop/state',{headers:{...headers,Host:'evil.example:'+server.address().port}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);
  });
  assert.equal(rebound,403);assert.equal(calls.length,before);
});
test('invalid commands, oversized bodies, and executable paths never reach the helper',async()=>{
  const before=calls.length;
  for(const data of [{command:'shell',sessionId:'Spotify.exe'},{command:'play',sessionId:''},{command:'seek',sessionId:'Spotify.exe',position:-1},{command:'seek',sessionId:'Spotify.exe',position:'10'},null]) {
    assert.equal((await fetch(origin+'/api/desktop/control',{method:'POST',headers,body:JSON.stringify(data)})).status,400);
  }
  assert.equal((await fetch(origin+'/api/desktop/control',{method:'POST',headers,body:' '.repeat(5000)})).status,413);
  assert.equal((await fetch(origin+'/windows-media.ps1')).status,403);
  assert.equal((await fetch(origin+'/api/desktop/control',{method:'POST',headers:{'X-Side-A':'1'},body:'command=play'})).status,415);
  assert.equal(calls.length,before);
});
