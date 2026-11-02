import {AudioDeck,formatTime} from './audio.js';
import {DesktopConnection,LinkPlayer,parseMusicLink} from './connections.js';
import {SpotifyAuth,validClientId} from './spotify-auth.js';
import {SPOTIFY_CLIENT_ID} from './spotify-config.js';
import {SpotifyPlayer} from './spotify-player.js';
import {RecentRecords,spotifyAlbum,spotifyTrack} from './record-library.js';
import {Platter,TapTempo} from './platter.js';
import {ScratchEngine} from './scratch.js';

const $=id=>document.getElementById(id);
const deck=new AudioDeck(),desktop=new DesktopConnection(),links=new LinkPlayer($('link-player'));
const auth=new SpotifyAuth(),spotify=new SpotifyPlayer(auth),records=new RecentRecords(),scratch=new ScratchEngine(),tempo=new TapTempo();
const localServer=['127.0.0.1','localhost'].includes(location.hostname);
let mode='local',trackKey='',sessionSignature='',localCount=0,historySeen,remembered='',rememberedCover='',message='',searchGeneration=0,changing=false;
const setText=(id,value)=>{value=String(value??'');if($(id).textContent!==value)$(id).textContent=value;};
const report=error=>{message=error?.message||String(error);setText('notice',message);if($('connections').open)setText('spotify-status',message);};
const run=action=>Promise.resolve().then(action).catch(report);
try {if(!validClientId(auth.clientId))auth.configure(SPOTIFY_CLIENT_ID);} catch(error){report(error);}

function model() {
  if(mode==='spotify') return {mode,track:spotify.track||{title:'Pick a record',artist:'Your Spotify albums are waiting below.'},
    playing:spotify.playing,position:spotify.position,duration:spotify.duration,
    controls:{play:spotify.ready,pause:spotify.ready,seek:spotify.ready&&spotify.duration>0,next:spotify.ready,previous:spotify.ready},volume:spotify.volume,repeat:spotify.repeat};
  if(mode==='desktop') {
    const track=desktop.state.track;
    return {mode,track:track||{title:'Waiting for your music',artist:'Start a song in your music app.'},
      playing:!!track?.playing,position:desktop.position,duration:track?.duration||0,controls:track?.controls||{}};
  }
  if(mode==='link') return {mode,track:{title:links.config?'Your '+links.config.name+' pick':'Your music',artist:'Use the official player below.'},
    playing:!!links.playing,position:links.position||0,duration:links.duration||0,controls:{play:links.ready,pause:links.ready,seek:links.ready&&links.config?.kind==='episode'}};
  return {mode,track:deck.track,playing:deck.playing,position:deck.audio.currentTime,duration:Number.isFinite(deck.audio.duration)?deck.audio.duration:0,
    controls:{play:true,pause:true,seek:Number.isFinite(deck.audio.duration)&&deck.audio.duration>0,next:true,previous:true},volume:deck.audio.volume,repeat:deck.audio.loop};
}
function keyOf(state) {return state.mode+':'+(state.track.id||state.track.url||[state.track.app,state.track.title,state.track.artist].join('|'));}
function invalidateDrag() {if(platter.drag)platter.drag.invalid=true;platter.cancel();scratch.stop();}
async function changeMode(next) {
  if(next===mode)return;
  changing=true;invalidateDrag();
  try {
    if(mode==='local'){deck.audio.pause();scratch.release();}
    if(mode==='spotify'){try {await spotify.pause();}catch{}finally{spotify.disconnect();}}
    if(mode==='desktop'){if(desktop.state.track?.playing&&desktop.state.track.controls.pause)await desktop.control('pause');desktop.disconnect();}
    if(mode==='link')links.destroy();
    mode=next;message='';trackKey='';remembered='';
  } finally {changing=false;renderCrate();render();}
}
async function useLocal(index,play=true) {await changeMode('local');if(index!==undefined)deck.load(index,play);render();}
async function useSpotify(record) {
  await changeMode('spotify');
  const connection=spotify.connect();
  if(!spotify.historyLoaded)spotify.refreshHistory();
  await connection;
  if(mode!=='spotify')return;
  if(record)await spotify.playRecord(record);
  render();
}
function showConnections() {
  $('spotify-client').value=auth.clientId;
  setText('spotify-redirect',new URL('./spotify-callback.html',location.href).href);
  $('link-error').textContent='';$('connections').showModal();renderConnection();
}
function renderConnection() {
  setText('connect-music',auth.signedIn?'Music connections ↗':'Connect Spotify ↗');
  setText('spotify-connect',!auth.signedIn?'Sign in with Spotify':spotify.status==='connecting'?'Connecting…':mode==='spotify'&&spotify.ready?'Back to the music':'Play Spotify here');
  $('spotify-connect').disabled=spotify.status==='connecting';
  $('spotify-disconnect').hidden=!auth.signedIn;
  setText('spotify-status',spotify.error||(spotify.ready?'Connected. Choose an album below and listen here.':auth.signedIn?'Signed in. Your Spotify account is connected to this tab.':'Premium account required.'));
  $('spotify-search-section').hidden=!auth.signedIn;
}
function createSleeve(track,onPlay,{local=false,index=0,search=false}={}) {
  const card=document.createElement('article');card.className=local?'local-record':'vinyl-card';
  const button=document.createElement('button');button.className='album'+(local?'':' vinyl-album');
  const displayName=search&&track.uri?track.title:track.album||track.title;
  button.setAttribute('aria-label','Play '+displayName);button.dataset.key=track.key||track.url||track.albumId||'';
  const art=document.createElement('span');art.className='sleeve-art';
  if(!local){const vinyl=document.createElement('span');vinyl.className='shelf-vinyl';vinyl.setAttribute('aria-hidden','true');art.append(vinyl);}
  const image=document.createElement('img');image.src=track.cover||'assets/connected.svg';image.alt='';image.className='album-art';image.draggable=false;image.loading='lazy';image.decoding='async';art.append(image);
  const title=document.createElement('span');title.className='album-name';title.textContent=displayName;
  const artist=document.createElement('span');artist.className='album-meta';artist.textContent=track.artist||'Your recent music';
  title.title=title.textContent;artist.title=artist.textContent;
  button.append(art,title,artist);button.onclick=()=>run(onPlay);card.append(button);
  if(track.source==='spotify') {
    const credit=document.createElement('a');credit.className='spotify-credit';credit.href=search&&track.uri?track.url:track.albumUrl||track.url;credit.target='_blank';credit.rel='noopener noreferrer';credit.setAttribute('aria-label','Open '+displayName+' on Spotify');
    const logo=document.createElement('img');logo.src='assets/spotify-logo.svg';logo.alt='Spotify';logo.width=70;logo.height=20;
    credit.append(logo,document.createTextNode('↗'));card.append(credit);
  } else if(local) {
    button.draggable=true;button.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',String(index));event.dataTransfer.effectAllowed='copy';});
  } else if(track.source==='desktop') {
    button.disabled=true;button.setAttribute('aria-label',(track.album||track.title)+' — played in '+track.app);
    const caption=document.createElement('span');caption.className='spotify-credit';caption.textContent='Played in '+track.app;card.append(caption);
  }
  return card;
}
function renderCrate() {
  const source=mode==='desktop'?'desktop':auth.signedIn?'spotify':'local',items=records.items.filter(item=>item.source===source).slice(0,12);
  $('crate').replaceChildren(...items.map(track=>createSleeve(track,()=>track.source==='spotify'?useSpotify(track):useLocal(track.index))));
  $('crate-empty').hidden=items.length>0;setText('count',String(items.length).padStart(2,'0'));
  $('crate-spotify-link').hidden=source!=='spotify';
}
function renderLocal() {
  if(localCount===deck.tracks.length)return;
  localCount=deck.tracks.length;
  $('local-crate').replaceChildren(...deck.tracks.map((track,index)=>createSleeve(track,()=>useLocal(index),{local:true,index})));
}
function remember(state) {
  if(!state.playing || mode==='link')return;
  const key=keyOf(state);if(remembered===key&&rememberedCover===state.track.cover)return;
  remembered=key;rememberedCover=state.track.cover;
  const track=mode==='local'?{...state.track,source:'local',index:deck.index,albumId:state.track.url}:mode==='desktop'?{...state.track,source:'desktop'}:state.track;
  if(records.remember(track))renderCrate();
}
function renderDesktop() {
  const sessions=desktop.state.sessions,signature=JSON.stringify([sessions,desktop.sessionId]);
  if(signature!==sessionSignature) {
    $('desktop-player').replaceChildren(new Option('Choose a player',''),...sessions.map(session=>new Option(session.name,session.id)));
    if(desktop.sessionId&&!sessions.some(session=>session.id===desktop.sessionId)){
      const missing=new Option('Selected player is unavailable',desktop.sessionId);missing.disabled=true;$('desktop-player').add(missing);
    }
    $('desktop-player').value=desktop.sessionId;sessionSignature=signature;
  }
  setText('connection-status',desktop.error||(desktop.state.track?'Audio plays in '+desktop.state.track.app+'.':'Start a song in a music app, then choose it here.'));
}
function renderTempo(state=model()) {
  const bpm=tempo.bpm||state.track.bpm;
  setText('bpm',bpm||'—');setText('bpm-kind',tempo.bpm?'TAPPED':state.track.bpm?'ORIGINAL TEMPO':tempo.taps.length?'KEEP TAPPING':'SONG TEMPO');
}
function render() {
  if(changing)return;
  const state=model(),key=keyOf(state),{track,playing,controls}=state;
  if(key!==trackKey){invalidateDrag();scratch.release();tempo.reset();trackKey=key;message='';renderTempo(state);}
  renderLocal();remember(state);
  $('back-to-crate').hidden=mode==='local';$('desktop-options').hidden=mode!=='desktop';$('link-section').hidden=mode!=='link';
  if(mode==='local'){
    setText('source-name','A little something from '+(track.local?'your collection':'us'));setText('source-detail','Local audio · Grab the record to scratch.');
    setText('deck-hint','Drag the vinyl forward or backward. Local audio follows your hand.');
    setText('control-note','33⅓ is platter RPM, not BPM. Tap the beat to measure song tempo.');
  } else if(mode==='spotify'){
    setText('source-name',spotify.ready?'Spotify, connected to Side A':spotify.status==='connecting'?'Connecting your Spotify player…':'Your Spotify account');
    setText('source-detail','Full playback here. The Spotify desktop app can stay closed.');
    setText('deck-hint','Drag the vinyl to rewind or skip ahead. Release to continue.');
    setText('control-note','Spotify supports seeking, not scratch or reverse audio. Tap tempo to measure BPM; Spotify does not supply it to this app.');
  } else if(mode==='desktop'){
    renderDesktop();setText('source-name','Following '+(track.app||'your Windows player'));setText('source-detail','Track info and controls from your open music app.');
    setText('deck-hint','Drag the vinyl to seek when your music app supports it.');setText('control-note','Audio, volume, and repeat stay in your music app. Tap tempo to measure BPM.');
  } else {
    setText('source-name','Listening with '+(links.config?.name||'your player'));setText('source-detail','An official player at your listening desk.');
    setText('deck-hint','Use the official player below to choose and start music.');setText('control-note','The service’s player controls playback, volume, and its queue. Previews may apply.');
  }
  document.body.classList.toggle('playing',playing);document.body.classList.toggle('spotify-mode',mode==='spotify');
  setText('play',playing?'Ⅱ':'▶');$('play').setAttribute('aria-label',playing?'Pause':'Play');
  $('needle').setAttribute('aria-label',playing?'Lift needle and pause':'Lower needle and play');$('power').setAttribute('aria-label',playing?'Pause record':'Play record');
  for(const id of ['play','needle','power'])$(id).disabled=!(playing?controls.pause:controls.play);
  $('previous').disabled=!controls.previous;$('next').disabled=!controls.next;$('seek').disabled=!controls.seek;
  $('repeat').disabled=!['local','spotify'].includes(mode)||(mode==='spotify'&&!spotify.ready);$('repeat').setAttribute('aria-pressed',String(!!state.repeat));
  $('volume').disabled=state.volume===undefined;
  if(document.activeElement!==$('volume'))$('volume').value=state.volume??.65;
  $('volume-value').value=state.volume===undefined?'—':Math.round(state.volume*100)+'%';
  setText('deck-state',playing?'THE NEEDLE IS DOWN':mode==='spotify'&&spotify.status==='connecting'?'CONNECTING YOUR PLAYER':mode==='spotify'&&spotify.error?'PLAYER NEEDS ATTENTION':'READY WHEN YOU ARE');
  setText('title',track.title);setText('artist',track.artist||track.app||'');
  const cover=track.cover||'assets/connected.svg';
  if($('sleeve').getAttribute('src')!==cover)$('sleeve').src=cover;
  $('sleeve').alt=(track.album||track.title)+' artwork';
  const labelCover=mode==='spotify'?'assets/connected.svg':cover;
  if($('record-cover').getAttribute('src')!==labelCover)$('record-cover').src=labelCover;
  setText('record-label-text',mode==='local'?'ORIGINAL PRESSING':'SIDE A · STEREO');
  document.querySelector('.side-badge').textContent=mode==='local'?'A'+(deck.index+1):'↗';
  $('track-link').hidden=mode!=='spotify'||!spotify.track;
  if(spotify.track)$('track-link').href=spotify.track.url;
  document.documentElement.style.setProperty('--accent',track.color||'#789171');
  setText('notice',message||(mode==='local'?deck.error:mode==='spotify'?spotify.error:mode==='desktop'?desktop.error:links.error)||'');
  setText('history-note',mode==='desktop'?'Albums played through your connected Windows app, in this tab.':spotify.historyError||(auth.signedIn?'Your recently played Spotify albums. New listens move to the front.':'Records played in this tab appear here automatically.'));
  renderConnection();renderProgress(state);
}
function renderProgress(state=model()) {
  if(document.hidden)return;
  const position=platter.drag?.position??state.position;
  setText('elapsed',formatTime(position));setText('duration',formatTime(state.duration));
  if(document.activeElement!==$('seek')){$('seek').max=state.duration||1;$('seek').value=position;}
  platter.update({...state,canSeek:!!state.controls.seek});
}
async function toggle() {
  message='';if($('play').disabled)return;
  if(mode==='local')deck.toggle();
  else if(mode==='spotify'){if(!spotify.state&&records.items.some(item=>item.source==='spotify'))await spotify.playRecord(records.items.find(item=>item.source==='spotify'));else await spotify.toggle();}
  else if(mode==='desktop')await desktop.control(desktop.state.track?.playing?'pause':'play');
  else links.toggle();
  render();
}
async function seek(position) {
  if(!model().controls.seek)return;
  if(mode==='local')deck.seek(position);else if(mode==='spotify')await spotify.seek(position);else if(mode==='desktop')await desktop.control('seek',position);else links.seek(position);
  renderProgress();
}
const platter=new Platter($('record'),{
  state:()=>{const state=model();return {...state,trackKey:keyOf(state),canSeek:!!state.controls.seek};},
  onStart:async drag=>{
    message='';drag.pause=Promise.resolve();
    if(drag.mode==='local'){
      deck.audio.pause();
      try {await scratch.prepare(deck.track);if(platter.drag===drag&&!drag.invalid){scratch.start(drag.position,deck.audio.volume);drag.scratchReady=true;}}
      catch(error){if(platter.drag===drag)report(error);}
    } else if(drag.mode==='spotify'&&drag.playing)drag.pause=spotify.pause();
    else if(drag.mode==='desktop'&&drag.playing&&drag.controls.pause)drag.pause=desktop.control('pause');
    await drag.pause;
  },
  onMove:(position,rate,drag)=>{if(drag.scratchReady)scratch.move(position,rate);setText('elapsed',formatTime(position));$('seek').value=position;},
  onEnd:async(position,drag)=>{
    scratch.stop();
    if(!drag){await seek(position);return;}
    await drag.pause;
    if(drag.invalid||drag.trackKey!==keyOf(model()))return;
    if(drag.degrees!==0)await seek(position);
    if(drag.playing){if(mode==='local')await deck.play();else if(mode==='spotify')await spotify.play();else if(mode==='desktop')await desktop.control('play');}
    render();
  },
  onError:report,
});

deck.addEventListener('change',event=>{if(mode==='local'){if(event.reason==='timeupdate')renderProgress();else render();}});
desktop.addEventListener('change',()=>{if(mode==='desktop')render();});
links.addEventListener('change',()=>{if(mode==='link')render();});
spotify.addEventListener('change',()=>{
  if(historySeen!==spotify.recent){historySeen=spotify.recent;records.importSpotify(spotify.recent);remembered='';renderCrate();}
  render();
});
for(const id of ['play','needle','power'])$(id).onclick=()=>run(toggle);
for(const command of ['previous','next'])$(command).onclick=()=>run(async()=>{invalidateDrag();if(mode==='local')deck[command]();else if(mode==='spotify')await spotify[command]();else if(mode==='desktop')await desktop.control(command);});
$('seek').onchange=event=>run(()=>seek(Number(event.target.value)));
$('seek').oninput=event=>setText('elapsed',formatTime(Number(event.target.value)));
$('volume').oninput=event=>{const value=Number(event.target.value);$('volume-value').value=Math.round(value*100)+'%';if(mode==='local')deck.audio.volume=value;};
$('volume').onchange=event=>{if(mode==='spotify')run(()=>spotify.setVolume(Number(event.target.value)));};
$('repeat').onclick=()=>run(async()=>{if(mode==='local')deck.audio.loop=!deck.audio.loop;else if(mode==='spotify')await spotify.setRepeat(!spotify.repeat);render();});
$('tap-tempo').onclick=()=>{tempo.tap(performance.now());renderTempo();};
$('connect-music').onclick=showConnections;$('crate-connect').onclick=showConnections;
$('try-scratch').onclick=()=>run(()=>useLocal(3));$('back-to-crate').onclick=()=>run(()=>useLocal(undefined,false));
$('spotify-connect').onclick=()=>run(async()=>{
  const client=$('spotify-client').value.trim();
  if(client!==auth.clientId){spotify.signOut();records.removeSource('spotify');renderCrate();auth.configure(client);}
  if(!auth.signedIn){location.assign(await auth.authorize(new URL('./spotify-callback.html',location.href).href));return;}
  $('connections').close();await useSpotify();
});
$('spotify-disconnect').onclick=()=>run(async()=>{
  await changeMode('local');spotify.signOut();records.removeSource('spotify');historySeen=undefined;searchGeneration++;
  $('search-results').replaceChildren();setText('search-status','');$('spotify-search').value='';renderCrate();render();
});
$('connect-desktop').textContent=localServer?'Connect to Windows':'Set up local connection ↗';
$('connect-desktop').onclick=()=>run(async()=>{if(!localServer){$('local-setup').hidden=false;return;}await changeMode('desktop');$('connections').close();await desktop.connect();});
$('desktop-player').onchange=event=>run(()=>desktop.select(event.target.value));
$('music-link-form').onsubmit=event=>{
  event.preventDefault();run(async()=>{
    let config;try{config=parseMusicLink($('music-link').value);}catch(error){setText('link-error',error.message);return;}
    setText('link-error','');
    if(config.provider==='spotify'&&auth.signedIn&&['track','album','playlist','artist'].includes(config.kind)){
      $('connections').close();await useSpotify();await spotify.playURI(config.uri);return;
    }
    await changeMode('link');$('connections').close();setText('link-provider',config.name);$('open-provider').href=config.url;setText('open-provider','Open in '+config.name+' ↗');await links.load(config);
  });
};
$('spotify-search-form').onsubmit=event=>{
  event.preventDefault();const query=$('spotify-search').value.trim();if(!query)return;
  const generation=++searchGeneration;setText('search-status','Looking for your next record…');
  run(async()=>{
    try{
      const data=await auth.api('/search?'+new URLSearchParams({q:query,type:'album,track',limit:'8'}));
      if(generation!==searchGeneration||!auth.signedIn)return;
      const found=[...(data.albums?.items||[]).map(spotifyAlbum),...(data.tracks?.items||[]).map(spotifyTrack)].filter(Boolean);
      $('search-results').replaceChildren(...found.map(track=>createSleeve(track,()=>useSpotify(track),{search:true})));
      setText('search-status',found.length?found.length+' records and songs on Spotify':'No records found. Try another name.');
    }catch(error){if(generation===searchGeneration)setText('search-status',error.message);}
  });
};
document.querySelectorAll('.import').forEach(button=>button.onclick=()=>$('files').click());
$('files').onchange=event=>{const files=[...event.target.files];event.target.value='';run(async()=>{await useLocal(undefined,false);deck.import(files);});};
const drop=$('drop-zone');
drop.ondragover=event=>{event.preventDefault();drop.classList.add('drag-over');};
drop.ondragleave=event=>{if(!drop.contains(event.relatedTarget))drop.classList.remove('drag-over');};
drop.ondrop=event=>{
  event.preventDefault();drop.classList.remove('drag-over');
  if(event.dataTransfer.files.length){const files=[...event.dataTransfer.files];run(async()=>{await useLocal(undefined,false);deck.import(files);});}
  else{const raw=event.dataTransfer.getData('text/plain');if(/^\d+$/.test(raw))run(()=>useLocal(Number(raw)));}
};
function setPower(enabled) {
  document.body.classList.toggle('low-power',enabled);$('low-power').setAttribute('aria-pressed',String(enabled));setText('low-power',enabled?'◦ Low-power on':'◦ Low-power off');
  try{localStorage.setItem('side-a.low-power',String(enabled));}catch{}
}
$('low-power').onclick=()=>setPower(!document.body.classList.contains('low-power'));
try{setPower(localStorage.getItem('side-a.low-power')!=='false');}catch{}
document.addEventListener('keydown',event=>{
  if(/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)||event.target===$('record')||$('shortcuts').open||$('connections').open)return;
  if(event.code==='Space'){event.preventDefault();run(toggle);}
  if(['ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();run(()=>seek(Math.max(0,model().position+(event.code==='ArrowLeft'?-5:5))));}
});
$('help').onclick=()=>$('shortcuts').showModal();
let clock;
function visibility() {
  document.body.classList.toggle('page-hidden',document.hidden);spotify.visibility(document.hidden);desktop.hidden=document.hidden;
  clearInterval(clock);if(!document.hidden){renderProgress();clock=setInterval(()=>{if(model().playing)renderProgress();},1000);}
}
document.addEventListener('visibilitychange',visibility);
window.addEventListener('pagehide',()=>{clearInterval(clock);desktop.disconnect();spotify.disconnect();links.destroy();scratch.dispose();deck.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
renderCrate();render();visibility();
if(auth.signedIn)run(()=>useSpotify());
