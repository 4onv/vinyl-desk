export function parseMusicLink(input) {
  let text = input.trim();
  const uri = /^spotify:(track|album|playlist|artist|episode|show):([a-zA-Z0-9]{22})$/.exec(text);
  if (uri) text = `https://open.spotify.com/${uri[1]}/${uri[2]}`;
  let url;
  try { url = new URL(text); } catch { throw new Error('Paste a full share link from Spotify, Apple Music, SoundCloud, or YouTube.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Use a secure https:// share link from your music app.');
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/$/, '');
  if (host === 'open.spotify.com') {
    const match = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]{22})$/.exec(path);
    if (match) return { provider:'spotify', name:'Spotify', kind:match[1], uri:`spotify:${match[1]}:${match[2]}`, url:`https://open.spotify.com/${match[1]}/${match[2]}`, embed:`https://open.spotify.com/embed/${match[1]}/${match[2]}`, height:352 };
  }
  if (host === 'music.apple.com') {
    const match = /^\/[a-z]{2}\/(album|song|playlist)\/(?:[^/]+\/)?([a-zA-Z0-9.-]+)$/.exec(path);
    if (match && (match[1] === 'playlist' ? /^pl\.[\w.-]+$/.test(match[2]) : /^\d+$/.test(match[2]))) {
      const clean = new URL('https://music.apple.com'+path);
      if (/^\d+$/.test(url.searchParams.get('i') || '')) clean.searchParams.set('i',url.searchParams.get('i'));
      return {provider:'apple',name:'Apple Music',url:clean.href,embed:clean.href.replace('music.apple.com','embed.music.apple.com'),height:450};
    }
  }
  if (['soundcloud.com','www.soundcloud.com'].includes(host) && /^\/[-\w]+\/(?:sets\/)?[-\w]+$/.test(path)) {
    const clean='https://soundcloud.com'+path;
    return {provider:'soundcloud',name:'SoundCloud',url:clean,embed:'https://w.soundcloud.com/player/?url='+encodeURIComponent(clean)+'&auto_play=false&show_artwork=true',height:300};
  }
  if (['youtube.com','www.youtube.com','music.youtube.com','youtu.be'].includes(host)) {
    const id=host==='youtu.be' ? path.slice(1) : path==='/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed)\/([^/]+)$/.exec(path)?.[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(id || '')) return {provider:'youtube',name:'YouTube',url:'https://www.youtube.com/watch?v='+id,embed:'https://www.youtube-nocookie.com/embed/'+id,height:360};
  }
  throw new Error('That link is not supported yet. Copy the full song, album, playlist, or video link from the service (shortened links need to be opened first).');
}

export class DesktopConnection extends EventTarget {
  constructor(fetcher = (...args) => fetch(...args)) {
    super(); this.fetcher=fetcher; this.sessionId=''; this.state={sessions:[],track:null}; this.error=''; this.active=false; this.generation=0;
  }
  notify() { this.dispatchEvent(new Event('change')); }
  async request(path, options = {}) {
    const response=await this.fetcher('/api/desktop/'+path,{...options,headers:{'X-Side-A':'1',...options.headers},signal:AbortSignal.timeout(18000)});
    let result;
    try {result=await response.json();} catch {throw new Error('Run Side A with Start.cmd to enable Windows playback controls.');}
    if(!response.ok) throw new Error(result.error || 'The desktop player could not be reached.');
    return result;
  }
  connect() { this.disconnect(); this.active=true; this.error=''; return this.refresh(); }
  select(id) { this.sessionId=id; this.state.track=null; this.notify(); return this.refresh(); }
  async refresh() {
    clearTimeout(this.timer);
    const generation=++this.generation;
    try {
      let state=await this.request('state?sessionId='+encodeURIComponent(this.sessionId));
      if(!this.active || generation!==this.generation) return;
      if(!this.sessionId) {
        const spotify=state.sessions.find(session=>/spotify/i.test(session.id));
        if(spotify) {this.sessionId=spotify.id;state=await this.request('state?sessionId='+encodeURIComponent(this.sessionId));}
      }
      if(!this.active || generation!==this.generation) return;
      this.state=state; this.error=''; this.receivedAt=performance.now();
    } catch(error) {
      if(!this.active || generation!==this.generation) return;
      this.error=error.message; this.state={sessions:[],track:null};
    }
    this.notify();
    if(this.active && generation===this.generation) this.timer=setTimeout(()=>this.refresh(),this.hidden?10000:this.error?5000:2500);
  }
  async control(command,position) {
    if(!this.active || !this.sessionId || this.busy) return;
    const generation=++this.generation;
    clearTimeout(this.timer); this.busy=true;
    try {
      await this.request('control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,sessionId:this.sessionId,position})});
      if(this.active && generation===this.generation) {this.error=''; await this.refresh();}
    } catch(error) {
      if(this.active && generation===this.generation) {this.error=error.message;this.notify();this.timer=setTimeout(()=>this.refresh(),4000);}
    } finally {this.busy=false;}
  }
  get position() {
    const track=this.state.track;
    return track ? Math.min(track.duration,track.position+(track.playing?(performance.now()-this.receivedAt)/1000:0)) : 0;
  }
  disconnect() {this.active=false;this.generation++;clearTimeout(this.timer);this.state={sessions:[],track:null};}
}

let spotifyAPI;
function loadSpotifyAPI() {
  if(spotifyAPI) return spotifyAPI;
  spotifyAPI=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>{script.remove();spotifyAPI=null;reject(new Error('Spotify controls did not load. Use its player below.'));},12000);
    window.onSpotifyIframeApiReady=api=>{clearTimeout(timer);resolve(api);};
    script.src='https://open.spotify.com/embed/iframe-api/v1';
    script.onerror=()=>{clearTimeout(timer);script.remove();spotifyAPI=null;reject(new Error('Spotify controls did not load. Use its player below.'));};
    document.head.append(script);
  });
  return spotifyAPI;
}

export class LinkPlayer extends EventTarget {
  constructor(mount) {super();this.mount=mount;this.generation=0;}
  notify() {this.dispatchEvent(new Event('change'));}
  async load(config) {
    this.destroy();const generation=this.generation;this.config=config;this.error='';
    if(config.provider!=='spotify') {this.iframe(config);this.notify();return;}
    this.mount.textContent='Loading Spotify…';this.notify();
    try {
      const api=await loadSpotifyAPI();
      if(generation!==this.generation) return;
      const target=document.createElement('div');this.mount.replaceChildren(target);
      api.createController(target,{uri:config.uri,width:'100%',height:config.height},controller=>{
        if(generation!==this.generation) {controller.destroy();return;}
        this.controller=controller;
        controller.addListener('ready',()=>{if(generation===this.generation){this.ready=true;this.notify();}});
        controller.addListener('playback_update',event=>{
          if(generation!==this.generation) return;
          this.position=event.data.position/1000;this.duration=event.data.duration/1000;
          this.playing=!event.data.isPaused && !event.data.isBuffering && (!this.duration || this.position<this.duration-.05);
          this.notify();
        });
      });
    } catch(error) {
      if(generation!==this.generation) return;
      this.error=error.message;this.iframe(config);this.notify();
    }
  }
  iframe(config) {
    const frame=document.createElement('iframe');frame.src=config.embed;frame.title=config.name+' music player';
    frame.height=config.height;frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;
    frame.referrerPolicy='strict-origin-when-cross-origin';
    this.mount.replaceChildren(frame);
  }
  toggle() {if(this.ready) this.controller?.togglePlay();}
  seek(seconds) {if(this.ready && this.config?.kind==='episode') this.controller?.seek(seconds);}
  destroy() {this.generation++;this.controller?.destroy();this.controller=null;this.config=null;this.ready=false;this.playing=false;this.position=0;this.duration=0;this.error='';this.mount.replaceChildren();}
}
