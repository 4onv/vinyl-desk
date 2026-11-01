import { AudioDeck, formatTime } from './audio.js';
import { DesktopConnection, LinkPlayer, parseMusicLink } from './connections.js';
const $ = id => document.getElementById(id);
const deck = new AudioDeck();
const desktop = new DesktopConnection();
const links = new LinkPlayer($('link-player'));
const localServer = ['127.0.0.1','localhost'].includes(location.hostname);
let mode = 'local', renderedCount = 0, sessionSignature = '';
const setText = (id,value) => { if($(id).textContent!==value) $(id).textContent=value; };

function changeMode(next) {
  if(mode==='local') deck.audio.pause();
  if(mode==='link') links.destroy();
  if(mode==='desktop') desktop.disconnect();
  mode=next;
  $('back-to-crate').hidden=mode==='local';$('desktop-options').hidden=mode!=='desktop';$('link-section').hidden=mode!=='link';
  render();
}
async function leaveDesktop() {
  // Switching audio sources should not leave two songs playing at once.
  if(mode==='desktop' && desktop.state.track?.playing && desktop.state.track.controls.pause) await desktop.control('pause');
}
async function useLocal(action) {await leaveDesktop();changeMode('local');action?.();render();}
function renderCrate() {
  $('crate').replaceChildren();
  deck.tracks.forEach((track,index)=>{
    const button=document.createElement('button');button.className='album';button.draggable=true;button.dataset.index=index;
    button.setAttribute('aria-label',`Play ${track.title}`);
    const image=document.createElement('img');image.src=track.cover;image.alt='';image.className='album-art';image.draggable=false;
    const title=document.createElement('span');title.className='album-name';title.textContent=track.title;
    const artist=document.createElement('span');artist.className='album-meta';artist.textContent=track.artist;
    button.append(image,title,artist);button.addEventListener('click',()=>useLocal(()=>deck.load(index,true)));
    button.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',String(index));event.dataTransfer.effectAllowed='copy';});
    $('crate').append(button);
  });
  const add=document.createElement('button');add.className='add-record';add.innerHTML='<span>＋</span> Add to your collection<small>MP3, WAV, OGG & more</small>';add.onclick=()=>$('files').click();$('crate').append(add);
  $('count').textContent=String(deck.tracks.length).padStart(2,'0');renderedCount=deck.tracks.length;
}
function renderDesktop() {
  const sessions=desktop.state.sessions,signature=JSON.stringify([sessions,desktop.sessionId]);
  if(signature!==sessionSignature) {
    $('desktop-player').replaceChildren(new Option('Choose a player',''),...sessions.map(session=>new Option(session.name,session.id)));
    if(desktop.sessionId && !sessions.some(session=>session.id===desktop.sessionId)) {
      const missing=new Option('Selected player is unavailable',desktop.sessionId);missing.disabled=true;$('desktop-player').add(missing);
    }
    $('desktop-player').value=desktop.sessionId;sessionSignature=signature;
  }
  setText('connection-status',desktop.error || (desktop.state.track ? 'Connected. Audio plays in '+desktop.state.track.app+'.' :
    !sessions.length ? 'Start a song in Spotify or another music app. Side A will keep looking.' : 'Choose the app you want on your turntable.'));
}
function render() {
  if(renderedCount!==deck.tracks.length) renderCrate();
  let track,playing,position,duration,controls;
  if(mode==='local') {
    track=deck.track;playing=deck.playing;position=deck.audio.currentTime;duration=Number.isFinite(deck.audio.duration)?deck.audio.duration:0;
    controls={play:true,pause:true,next:true,previous:true,seek:duration>0};
    setText('source-name','From your record crate');setText('source-detail','Your files, or a little something from us.');
    setText('deck-hint','Drag a sleeve onto the turntable, or tap a record to play.');setText('notice',deck.error);
  } else if(mode==='desktop') {
    renderDesktop();track=desktop.state.track || {title:'Waiting for your music',artist:'Start a song in your music app.'};
    playing=!!desktop.state.track?.playing;position=desktop.position;duration=track.duration||0;controls=track.controls||{};
    setText('source-name',desktop.state.track ? 'Connected to '+track.app : 'Your desktop, on the turntable');
    setText('source-detail','Track info and controls from Windows. No music account setup.');
    setText('deck-hint','Pick your music in its app. Settle in here.');
    setText('control-note','Volume stays in your music app. Available controls depend on the player.');setText('notice',desktop.error);
  } else {
    track={title:links.config ? 'Your '+links.config.name+' pick' : 'A new connection',artist:'The official player is below the turntable.'};
    playing=!!links.playing;position=links.position||0;duration=links.duration||0;
    controls={play:links.ready,pause:links.ready,seek:links.ready && links.config?.kind==='episode'};
    setText('source-name',links.config ? 'Listening with '+links.config.name : 'Loading your player');
    setText('source-detail','An official player, right at your listening desk.');setText('deck-hint','Use the player below to choose and start your music.');
    setText('control-note',links.ready ? 'Use Spotify’s player for the queue and volume. Playback may be a preview.' : 'Use the official player below. Its controls and artwork stay inside the player.');setText('notice',links.error||'');
  }
  document.body.classList.toggle('playing',playing);$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'Pause':'Play');
  $('needle').setAttribute('aria-label',playing?'Lift needle and pause':'Lower needle and play');$('power').setAttribute('aria-label',playing?'Pause record':'Play record');
  for(const id of ['play','needle','power']) $(id).disabled=!(playing?controls.pause:controls.play);
  $('previous').disabled=!controls.previous;$('next').disabled=!controls.next;$('seek').disabled=!controls.seek;
  $('repeat').disabled=mode!=='local';$('repeat').setAttribute('aria-pressed',String(mode==='local' && deck.audio.loop));
  $('volume').disabled=mode!=='local';$('volume').value=deck.audio.volume;$('volume-value').value=mode==='local'?Math.round(deck.audio.volume*100)+'%':'—';$('control-note').hidden=mode==='local';
  setText('deck-state',playing?'THE NEEDLE IS DOWN':mode==='desktop'&&!desktop.state.track?'WAITING FOR YOUR PLAYER':mode==='link'&&!links.ready?'USE THE PLAYER BELOW':'READY WHEN YOU ARE');
  setText('elapsed',formatTime(position));setText('duration',formatTime(duration));
  if(document.activeElement!==$('seek')) {$('seek').max=duration||1;$('seek').value=position;}
  setText('title',track.title||'Untitled track');setText('artist',track.artist||track.app||'');
  const cover=track.cover||'assets/connected.svg';
  for(const id of ['sleeve','record-cover']) {if($(id).getAttribute('src')!==cover) $(id).src=cover;$(id).alt=track.cover?`${track.title} artwork`:'Side A connected record illustration';}
  document.querySelector('.record-label small').textContent=mode==='local'?'THE QUIET HOURS':'CONNECTED';document.querySelector('.side-badge').textContent=mode==='local'?'A'+(deck.index+1):'↗';
  document.documentElement.style.setProperty('--accent',track.color||'#789171');
  document.querySelectorAll('.album').forEach((button,index)=>{const selected=mode==='local'&&index===deck.index;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
}
function toggle() {
  if($('play').disabled) return;
  if(mode==='local') deck.toggle();else if(mode==='desktop') desktop.control(desktop.state.track?.playing?'pause':'play');else links.toggle();
}
function seek(position) {
  if($('seek').disabled) return;
  if(mode==='local') deck.seek(position);else if(mode==='desktop') desktop.control('seek',position);else links.seek(position);
}
deck.addEventListener('change',render);desktop.addEventListener('change',render);links.addEventListener('change',render);
for(const id of ['play','needle','power']) $(id).onclick=toggle;
for(const command of ['previous','next']) $(command).onclick=()=>{if(mode==='local') deck[command]();else if(mode==='desktop') desktop.control(command);};
$('seek').onchange=event=>seek(Number(event.target.value));$('seek').oninput=event=>setText('elapsed',formatTime(Number(event.target.value)));
$('volume').oninput=event=>{deck.audio.volume=Number(event.target.value);};$('repeat').onclick=()=>{deck.audio.loop=!deck.audio.loop;render();};
$('back-to-crate').onclick=()=>useLocal();$('connect-music').onclick=()=>{$('link-error').textContent='';$('connections').showModal();};
$('connect-desktop').textContent=localServer?'Connect to Windows':'Set up local connection ↗';
$('connect-desktop').onclick=()=>{if(!localServer) {$('local-setup').hidden=false;return;}changeMode('desktop');$('connections').close();desktop.connect();};
$('desktop-player').onchange=event=>desktop.select(event.target.value);
$('music-link-form').onsubmit=async event=>{
  event.preventDefault();let config;
  try {config=parseMusicLink($('music-link').value);} catch(error) {$('link-error').textContent=error.message;return;}
  $('link-error').textContent='';await leaveDesktop();changeMode('link');$('connections').close();
  $('link-provider').textContent=config.name;$('open-provider').href=config.url;$('open-provider').textContent='Open in '+config.name+' ↗';links.load(config);
};
document.querySelectorAll('.import').forEach(button=>button.onclick=()=>$('files').click());
$('files').onchange=event=>{const files=[...event.target.files];event.target.value='';useLocal(()=>deck.import(files));};
const drop=$('drop-zone');
drop.ondragover=event=>{event.preventDefault();drop.classList.add('drag-over');};drop.ondragleave=event=>{if(!drop.contains(event.relatedTarget)) drop.classList.remove('drag-over');};
drop.ondrop=event=>{
  event.preventDefault();drop.classList.remove('drag-over');
  if(event.dataTransfer.files.length) {const files=[...event.dataTransfer.files];useLocal(()=>deck.import(files));}
  else {const raw=event.dataTransfer.getData('text/plain');if(/^\d+$/.test(raw)) useLocal(()=>deck.load(Number(raw),true));}
};
document.addEventListener('keydown',event=>{
  if(/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)||$('shortcuts').open||$('connections').open) return;
  if(event.code==='Space') {event.preventDefault();toggle();}
  if(['ArrowRight','ArrowLeft'].includes(event.code)) {event.preventDefault();const current=mode==='local'?deck.audio.currentTime:mode==='desktop'?desktop.position:links.position;seek(Math.max(0,(current||0)+(event.code==='ArrowRight'?5:-5)));}
});
$('help').onclick=()=>$('shortcuts').showModal();
const clock=setInterval(()=>{if(mode==='desktop'&&desktop.state.track?.playing) render();},500);
window.addEventListener('pagehide',()=>{clearInterval(clock);desktop.disconnect();links.destroy();deck.dispose();});
render();
