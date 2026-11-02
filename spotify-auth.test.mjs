import test from 'node:test';
import assert from 'node:assert/strict';
import {SpotifyAuth,AUTH_KEYS,pkceChallenge,validateRedirect} from './spotify-auth.js';
class MemoryStorage {
  constructor(){this.data=new Map();}
  getItem(key){return this.data.get(key)??null;}
  setItem(key,value){this.data.set(key,String(value));}
  removeItem(key){this.data.delete(key);}
}
const client='0123456789abcdef0123456789abcdef',redirect='http://127.0.0.1:4311/spotify-callback.html';
function fixture(fetcher) {
  const session=new MemoryStorage(),settings=new MemoryStorage();
  let time=1000000;
  const auth=new SpotifyAuth({session,settings,fetcher,now:()=>time});
  auth.configure(client);
  return {auth,session,settings,advance:ms=>time+=ms};
}
const tokens=()=>Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});
test('PKCE matches the RFC 7636 SHA-256 vector and rejects insecure redirects',async()=>{
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(validateRedirect(redirect),redirect);
  for(const value of ['http://localhost:4311/','http://example.com/','https://a:b@example.com/','https://example.com/?x=1'])assert.throws(()=>validateRedirect(value));
});
test('OAuth exchanges a single-use PKCE code without a client secret or persistent tokens',async()=>{
  let sent;
  const {auth,session,settings}=fixture(async(url,options)=>{sent={url,options};return tokens();});
  const url=new URL(await auth.authorize(redirect)),transaction=JSON.parse(session.getItem(AUTH_KEYS.transaction));
  assert.equal(url.searchParams.get('code_challenge'),await pkceChallenge(transaction.verifier));
  const callback=redirect+'?code=test-code&state='+url.searchParams.get('state');
  await auth.complete(callback);
  assert.equal(sent.options.body.get('code_verifier'),transaction.verifier);
  assert.equal(sent.options.body.has('client_secret'),false);
  assert.equal(auth.signedIn,true);assert.equal(settings.getItem(AUTH_KEYS.session),null);
  assert.equal(session.getItem(AUTH_KEYS.transaction),null);
  await assert.rejects(auth.complete(callback),/expired/);
});
test('state, redirect, and expiry failures cannot exchange a code',async()=>{
  let calls=0;
  for(const kind of ['state','redirect','expired','timestamp']) {
    const {auth,session,advance}=fixture(async()=>{calls++;return tokens();});
    const url=new URL(await auth.authorize(redirect));
    let callback=redirect+'?code=x&state='+url.searchParams.get('state');
    if(kind==='state')callback+='wrong';
    if(kind==='redirect')callback=callback.replace('4311','4312');
    if(kind==='expired')advance(600001);
    if(kind==='timestamp'){const txn=JSON.parse(session.getItem(AUTH_KEYS.transaction));delete txn.createdAt;session.setItem(AUTH_KEYS.transaction,JSON.stringify(txn));}
    await assert.rejects(auth.complete(callback),/expired/);
  }
  assert.equal(calls,0);
});
test('concurrent refresh requests share one exchange and sign-out wins an in-flight refresh',async()=>{
  let resolve,calls=0;
  const {auth,advance}=fixture(()=>{calls++;return new Promise(done=>resolve=done);});
  auth.save({access_token:'old',refresh_token:'r',expires_in:3600});advance(3600000);
  const a=auth.accessToken(),b=auth.accessToken();
  assert.equal(calls,1);auth.clear();resolve(tokens());
  await assert.rejects(a,/disconnected/);await assert.rejects(b,/disconnected/);assert.equal(auth.signedIn,false);
});
test('429 honours Retry-After and prevents request storms',async()=>{
  let calls=0;
  const {auth,advance}=fixture(async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'60'}});});
  auth.save({access_token:'a',refresh_token:'r',expires_in:3600});
  await assert.rejects(auth.api('/me/player'),/limiting/);
  await assert.rejects(auth.api('/me/player'),/60 seconds/);assert.equal(calls,1);
  advance(60001);await assert.rejects(auth.api('/me/player'),/limiting/);assert.equal(calls,2);
});
test('an unauthorized API request refreshes once and retries with the new token',async()=>{
  const seen=[];
  const {auth}=fixture(async(url,options)=>{
    if(url.includes('/api/token'))return tokens();
    seen.push(options.headers.Authorization);
    return seen.length===1?new Response('{}',{status:401}):Response.json({items:[]});
  });
  auth.save({access_token:'old',refresh_token:'r',expires_in:3600});
  assert.deepEqual(await auth.api('/me/player/recently-played?limit=50'),{items:[]});
  assert.deepEqual(seen,['Bearer old','Bearer test-access']);
});
