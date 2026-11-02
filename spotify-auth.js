export const SPOTIFY_SCOPES = ['streaming','user-read-private','user-read-email','user-read-playback-state','user-modify-playback-state','user-read-recently-played'];
export const AUTH_KEYS = {client:'side-a.spotify.client.v1',transaction:'side-a.spotify.pkce.v1',session:'side-a.spotify.session.v1'};
export const validClientId = value => /^[a-f0-9]{32}$/i.test(value || '');
const read = (storage,key) => {try {return JSON.parse(storage.getItem(key));} catch {return null;}};
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
export async function pkceChallenge(verifier, cryptography = globalThis.crypto) {
  return base64url(await cryptography.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
}
export function validateRedirect(value) {
  const url=new URL(value);
  if(url.username || url.password || url.search || url.hash ||
    !(url.protocol==='https:' || (url.protocol==='http:' && ['127.0.0.1','[::1]'].includes(url.hostname)))) {
    throw new Error('Use HTTPS, or open local Side A at http://127.0.0.1:4311. Spotify does not accept localhost redirects.');
  }
  return url.href;
}

// PKCE uses a public Client ID. Access/refresh tokens stay in this browser tab.
export class SpotifyAuth {
  constructor({session=globalThis.sessionStorage,settings=globalThis.localStorage,fetcher=(...args)=>fetch(...args),cryptography=globalThis.crypto,now=()=>Date.now()}={}) {
    Object.assign(this,{session,settings,fetcher,cryptography,now});this.refreshing=null;this.retryAt=0;
  }
  get clientId() {try{return this.settings.getItem(AUTH_KEYS.client)||'';}catch{return '';}}
  get tokens() {
    const data=read(this.session,AUTH_KEYS.session);
    return data?.clientId===this.clientId && typeof data.accessToken==='string' && Number.isFinite(data.expiresAt) ? data : null;
  }
  get signedIn() {return !!this.tokens;}
  configure(clientId) {
    clientId=clientId.trim();
    if(!validClientId(clientId)) throw new Error('Paste the 32-character Client ID from your Spotify developer app. Do not paste its secret.');
    if(clientId!==this.clientId) this.clear();
    this.settings.setItem(AUTH_KEYS.client,clientId);
  }
  async authorize(redirect) {
    if(!validClientId(this.clientId)) throw new Error('Set up your Spotify Client ID first.');
    redirect=validateRedirect(redirect);
    const verifier=base64url(this.cryptography.getRandomValues(new Uint8Array(64)));
    const state=base64url(this.cryptography.getRandomValues(new Uint8Array(32)));
    const challenge=await pkceChallenge(verifier,this.cryptography);
    this.session.setItem(AUTH_KEYS.transaction,JSON.stringify({verifier,state,redirect,clientId:this.clientId,createdAt:this.now()}));
    const url=new URL('https://accounts.spotify.com/authorize');
    url.search=new URLSearchParams({client_id:this.clientId,response_type:'code',redirect_uri:redirect,
      code_challenge_method:'S256',code_challenge:challenge,state,scope:SPOTIFY_SCOPES.join(' ')}).toString();
    return url.href;
  }
  async complete(callbackUrl) {
    const url=new URL(callbackUrl),transaction=read(this.session,AUTH_KEYS.transaction);
    this.session.removeItem(AUTH_KEYS.transaction);
    if(!transaction || url.searchParams.get('state')!==transaction.state || transaction.clientId!==this.clientId ||
      !Number.isFinite(transaction.createdAt) || this.now()-transaction.createdAt>600000 || this.now()<transaction.createdAt ||
      url.origin+url.pathname!==transaction.redirect) throw new Error('This sign-in expired or came from another tab. Return to Side A and connect again.');
    if(url.searchParams.has('error')) throw new Error('Spotify sign-in was cancelled. You can connect again whenever you are ready.');
    const code=url.searchParams.get('code');if(!code) throw new Error('Spotify did not return an authorization code.');
    const data=await this.tokenRequest({grant_type:'authorization_code',client_id:this.clientId,code,
      redirect_uri:transaction.redirect,code_verifier:transaction.verifier});
    this.save(data);
  }
  async tokenRequest(values) {
    let response;
    try {response=await this.fetcher('https://accounts.spotify.com/api/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(15000),
    });} catch {throw new Error('Spotify could not be reached. Check your connection and try signing in again.');}
    const data=await response.json().catch(()=>({}));
    if(!response.ok) {
      if(data.error==='invalid_grant' || data.error==='invalid_client') this.clear();
      throw new Error(data.error==='invalid_client' ? 'Spotify rejected this Client ID. Check your developer app and redirect URI.' : 'Spotify sign-in could not be refreshed. Connect your account again.');
    }
    return data;
  }
  save(data) {
    if(typeof data.access_token!=='string' || !Number.isFinite(data.expires_in) || data.expires_in<=0) throw new Error('Spotify returned an incomplete sign-in response.');
    const previous=this.tokens;
    this.session.setItem(AUTH_KEYS.session,JSON.stringify({clientId:this.clientId,accessToken:data.access_token,
      refreshToken:typeof data.refresh_token==='string'?data.refresh_token:previous?.refreshToken||'',expiresAt:this.now()+data.expires_in*1000}));
  }
  async accessToken(force=false) {
    const token=this.tokens;if(!token) throw new Error('Connect your Spotify account first.');
    if(!force && token.expiresAt>this.now()+60000) return token.accessToken;
    if(!token.refreshToken) {this.clear();throw new Error('Your Spotify session expired. Connect again.');}
    if(!this.refreshing) this.refreshing=(async()=>{
      const data=await this.tokenRequest({grant_type:'refresh_token',refresh_token:token.refreshToken,client_id:this.clientId});
      // Disconnecting while a refresh is pending must not restore a signed-out session.
      if(!this.tokens || this.tokens.refreshToken!==token.refreshToken) throw new Error('Spotify was disconnected.');
      this.save(data);return this.tokens.accessToken;
    })().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async api(path,{method='GET',body}={},retry=true) {
    if(!/^\/(me(?:[/?]|$)|albums\/|tracks\/|search\?)/.test(path)) throw new Error('Unsupported Spotify request.');
    if(this.now()<this.retryAt) throw new Error('Spotify is asking for a short break. Try again in '+Math.ceil((this.retryAt-this.now())/1000)+' seconds.');
    const token=await this.accessToken();
    let response;
    try {response=await this.fetcher('https://api.spotify.com/v1'+path,{method,
      headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    } catch {throw new Error('Spotify could not be reached. Check your connection and try again.');}
    if(response.status===401 && retry) {await this.accessToken(true);return this.api(path,{method,body},false);}
    if(response.status===429) {
      const delay=Number(response.headers.get('retry-after'));
      this.retryAt=this.now()+(Number.isFinite(delay)&&delay>0?delay:30)*1000;
      throw new Error('Spotify is limiting requests. Give it a moment, then try again.');
    }
    if(response.status===204) return null;
    const data=await response.json().catch(()=>({}));
    if(!response.ok) {
      if(response.status===403) throw new Error('Spotify denied access. Check Premium, the app’s permitted users, and the permissions you approved.');
      if(response.status===404) throw new Error('Spotify could not find this player or record. Reconnect Side A or choose another album.');
      throw new Error('Spotify could not complete that request ('+response.status+'). Try again.');
    }
    return data;
  }
  clear() {this.session.removeItem(AUTH_KEYS.session);this.session.removeItem(AUTH_KEYS.transaction);this.retryAt=0;}
}
