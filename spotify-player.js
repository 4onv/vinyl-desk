import {spotifyTrack} from './record-library.js';
let sdkPromise;
export function loadSpotifySDK() {
  if(globalThis.Spotify?.Player) return Promise.resolve(globalThis.Spotify);
  if(sdkPromise) return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const fail=()=>{clearTimeout(timer);script.remove();sdkPromise=null;reject(new Error('Spotify’s player could not load. Check your connection, or try Chrome or Edge.'));};
    const timer=setTimeout(fail,20000);
    globalThis.onSpotifyWebPlaybackSDKReady=()=>{clearTimeout(timer);resolve(globalThis.Spotify);};
    script.src='https://sdk.scdn.co/spotify-player.js';script.onerror=fail;document.head.append(script);
  });
  return sdkPromise;
}
export class SpotifyPlayer extends EventTarget {
  constructor(auth,{loader=loadSpotifySDK,now=()=>performance.now()}={}) {
    super();Object.assign(this,{auth,loader,now});this.status='disconnected';this.error='';this.historyError='';
    this.volume=.65;this.recent=[];this.generation=0;this.hidden=false;
  }
  notify() {this.dispatchEvent(new Event('change'));}
  get ready() {return this.status==='ready' && !!this.deviceId;}
  get playing() {return !!this.state && !this.state.paused && !this.state.loading && !this.playbackFailed;}
  get position() {return this.state?Math.min(this.duration,this.state.position/1000+(this.playing?(this.now()-this.receivedAt)/1000:0)):0;}
  get duration() {return (this.state?.duration||0)/1000;}
  get repeat() {return this.state?.repeat_mode===2;}
  async connect() {
    if(this.ready) return;
    if(this.connecting) return this.connecting;
    this.player?.disconnect();clearTimeout(this.poll);
    const generation=++this.generation;this.status='connecting';this.error='';this.notify();
    this.connecting=(async()=>{
      try {
        await this.auth.accessToken();
        const sdk=await this.loader();if(generation!==this.generation) return;
        const player=new sdk.Player({name:'Side A',volume:this.volume,enableMediaSession:true,
          getOAuthToken:callback=>this.auth.accessToken().then(token=>{if(generation===this.generation)callback(token);}).catch(error=>{if(generation===this.generation)this.fail(error.message);}),
        });
        this.player=player;
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Spotify took too long to connect. Try reconnecting in Chrome or Edge.')),25000);
          this.cancelConnect=()=>{clearTimeout(timer);resolve();};
          const rejectWith=message=>{
            if(generation!==this.generation)return;
            clearTimeout(timer);clearTimeout(this.poll);this.status='error';this.deviceId=null;this.state=null;player.disconnect();this.fail(message);reject(new Error(message));
          };
          player.addListener('ready',({device_id})=>{
            if(generation!==this.generation || this.status==='error') return;
            clearTimeout(timer);this.deviceId=device_id;this.status='ready';this.error='';this.notify();resolve();this.schedulePoll();
          });
          player.addListener('not_ready',()=>{if(generation===this.generation){this.deviceId=null;this.status='offline';this.state=null;this.notify();}});
          player.addListener('player_state_changed',state=>{if(generation===this.generation)this.applyState(state);});
          player.addListener('initialization_error',()=>rejectWith('This browser cannot initialize Spotify’s protected audio. Open Side A in Chrome or Edge with protected content playback available.'));
          player.addListener('authentication_error',()=>rejectWith('Spotify sign-in expired or was refused. Disconnect and sign in again.'));
          player.addListener('account_error',()=>rejectWith('Spotify Premium and access to this developer app are required for direct playback.'));
          player.addListener('playback_error',()=>{
            if(generation!==this.generation)return;
            // Stop a failed stream instead of displaying an advancing clock or skipping the queue.
            if(!this.playbackFailed)Promise.resolve(player.pause()).catch(()=>{});
            this.playbackFailed=true;
            this.fail('Spotify could not play audio in this browser. Open Side A in Chrome or Edge and try again. If one song fails there, choose another record.');
          });
          player.addListener('autoplay_failed',()=>{if(generation===this.generation)this.fail('Press Play here to let this browser start Spotify audio.');});
          Promise.resolve(player.connect()).then(ok=>{if(!ok)rejectWith('Spotify could not connect this player. Try reconnecting.');}).catch(()=>rejectWith('Spotify could not connect this player.'));
        });
      } catch(error) {
        if(generation===this.generation) {this.player?.disconnect();this.player=null;this.deviceId=null;this.status='error';this.error=error.message;this.notify();}
        throw error;
      }
    })().finally(()=>{if(generation===this.generation){this.connecting=null;this.cancelConnect=null;}});
    return this.connecting;
  }
  fail(message) {this.error=message;this.notify();}
  applyState(state) {
    this.state=state;this.receivedAt=this.now();this.track=spotifyTrack(state?.track_window?.current_track);
    this.notify();
  }
  schedulePoll() {
    clearTimeout(this.poll);
    if(!this.ready || this.hidden) return;
    const generation=this.generation;
    this.poll=setTimeout(async()=>{
      try {const state=await this.player?.getCurrentState();if(generation===this.generation)this.applyState(state||null);}catch{}
      if(generation===this.generation)this.schedulePoll();
    },12000);
  }
  visibility(hidden) {this.hidden=hidden;this.schedulePoll();}
  async refreshHistory() {
    this.historyError='';const generation=this.generation;
    try {
      const data=await this.auth.api('/me/player/recently-played?limit=50');
      if(generation!==this.generation) return;
      this.recent=data.items||[];
      this.historyLoaded=true;
    } catch(error) {if(generation===this.generation)this.historyError=error.message;}
    this.notify();
  }
  async activate() {
    if(!this.ready) throw new Error('Connect Spotify’s player first.');
    const player=this.player,deviceId=this.deviceId,generation=this.generation;
    await player.activateElement();
    const current=await player.getCurrentState();
    if(generation!==this.generation)throw new Error('Spotify’s player was disconnected.');
    if(!current) {
      await this.auth.api('/me/player',{method:'PUT',body:{device_ids:[deviceId],play:false}});
    }
    if(generation!==this.generation)throw new Error('Spotify’s player was disconnected.');
    this.playbackFailed=false;this.error='';this.notify();
    return deviceId;
  }
  async playRecord(record) {
    const deviceId=await this.activate();
    const body=record.albumUri?{context_uri:record.albumUri,...(record.uri?{offset:{uri:record.uri}}:{})}:{uris:[record.uri]};
    await this.auth.api('/me/player/play?device_id='+encodeURIComponent(deviceId),{method:'PUT',body});
    this.notify();
  }
  async play() {await this.activate();await this.player.resume();this.notify();}
  async playURI(uri) {
    if(!/^spotify:(track|album|playlist|artist):[A-Za-z0-9]{22}$/.test(uri)) throw new Error('Choose a Spotify song, album, artist, or playlist for direct playback.');
    const deviceId=await this.activate();
    await this.auth.api('/me/player/play?device_id='+encodeURIComponent(deviceId),{method:'PUT',body:uri.startsWith('spotify:track:')?{uris:[uri]}:{context_uri:uri}});
    this.notify();
  }
  async pause() {if(this.ready)await this.player.pause();}
  async toggle() {if(this.playing)await this.pause();else await this.play();}
  async seek(seconds) {if(this.ready && Number.isFinite(seconds)) await this.player.seek(Math.round(Math.max(0,Math.min(Math.max(0,this.duration-.1),seconds))*1000));}
  async next() {if(this.ready)await this.player.nextTrack();}
  async previous() {if(this.ready)await this.player.previousTrack();}
  async setVolume(volume) {this.volume=Math.max(0,Math.min(1,volume));if(this.ready)await this.player.setVolume(this.volume);this.notify();}
  async setRepeat(enabled) {if(this.ready)await this.auth.api('/me/player/repeat?state='+(enabled?'track':'off')+'&device_id='+encodeURIComponent(this.deviceId),{method:'PUT'});}
  disconnect() {
    this.generation++;this.cancelConnect?.();this.cancelConnect=null;this.connecting=null;clearTimeout(this.poll);this.player?.disconnect();this.player=null;this.deviceId=null;this.state=null;this.track=null;this.playbackFailed=false;this.status='disconnected';this.error='';this.notify();
  }
  signOut() {this.disconnect();this.auth.clear();this.recent=[];this.historyError='';this.historyLoaded=false;this.notify();}
}
