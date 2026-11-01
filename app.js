import { AudioDeck, formatTime } from './audio.js';
const $ = id => document.getElementById(id);
const deck = new AudioDeck();
let renderedCount = 0, renderedIndex = -1;
function renderCrate() {
  $('crate').replaceChildren();
  deck.tracks.forEach((track, index) => {
    const button = document.createElement('button'); button.className = 'album'; button.draggable = true; button.dataset.index = index;
    button.setAttribute('aria-label', `Play ${track.title}`);
    const image = document.createElement('img'); image.src = track.cover; image.alt = ''; image.className = 'album-art'; image.draggable = false;
    const title = document.createElement('span'); title.className = 'album-name'; title.textContent = track.title;
    const artist = document.createElement('span'); artist.className = 'album-meta'; artist.textContent = track.artist;
    button.append(image,title,artist);
    button.addEventListener('click', () => deck.load(index,true));
    button.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(index)); event.dataTransfer.effectAllowed = 'copy'; });
    $('crate').append(button);
  });
  const add = document.createElement('button'); add.className = 'add-record'; add.innerHTML = '<span>＋</span> Add to your collection<small>MP3, WAV, OGG & more</small>'; add.onclick = () => $('files').click(); $('crate').append(add);
  $('count').textContent = String(deck.tracks.length).padStart(2,'0'); renderedCount = deck.tracks.length;
}
function render() {
  if (renderedCount !== deck.tracks.length) renderCrate();
  document.body.classList.toggle('playing', deck.playing);
  $('play').textContent = deck.playing ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', deck.playing ? 'Pause' : 'Play');
  $('needle').setAttribute('aria-label', deck.playing ? 'Lift needle and pause' : 'Lower needle and play');
  $('power').setAttribute('aria-label', deck.playing ? 'Pause record' : 'Play record');
  $('deck-state').textContent = deck.playing ? 'THE NEEDLE IS DOWN' : 'READY WHEN YOU ARE';
  $('elapsed').textContent = formatTime(deck.audio.currentTime); $('duration').textContent = formatTime(deck.audio.duration);
  $('seek').max = Number.isFinite(deck.audio.duration) ? deck.audio.duration : 48; $('seek').value = deck.audio.currentTime;
  $('notice').textContent = deck.error;
  if (renderedIndex !== deck.index) {
    $('title').textContent = deck.track.title; $('artist').textContent = deck.track.artist;
    for(const id of ['sleeve','record-cover']) { $(id).src = deck.track.cover; $(id).alt = `${deck.track.title} artwork`; }
    document.documentElement.style.setProperty('--accent',deck.track.color);
    document.querySelectorAll('.album').forEach((button,index)=>{button.classList.toggle('selected',index===deck.index);button.setAttribute('aria-pressed',String(index===deck.index));});
    renderedIndex = deck.index;
  }
}
deck.addEventListener('change', render);
for(const id of ['play','needle','power']) $(id).onclick = () => deck.toggle();
$('previous').onclick = () => deck.previous(); $('next').onclick = () => deck.next();
$('seek').oninput = event => deck.seek(Number(event.target.value));
$('volume').oninput = event => { deck.audio.volume = Number(event.target.value); $('volume-value').value = Math.round(deck.audio.volume*100)+'%'; };
$('repeat').onclick = () => { deck.audio.loop = !deck.audio.loop; $('repeat').setAttribute('aria-pressed',String(deck.audio.loop)); };
document.querySelectorAll('.import').forEach(button=>button.onclick=()=>$('files').click());
$('files').onchange = event => { deck.import(event.target.files); event.target.value = ''; };
const drop = $('drop-zone');
drop.ondragover = event => { event.preventDefault(); drop.classList.add('drag-over'); };
drop.ondragleave = event => { if (!drop.contains(event.relatedTarget)) drop.classList.remove('drag-over'); };
drop.ondrop = event => { event.preventDefault(); drop.classList.remove('drag-over'); if (event.dataTransfer.files.length) deck.import(event.dataTransfer.files); else { const raw = event.dataTransfer.getData('text/plain'); if (/^\d+$/.test(raw)) deck.load(Number(raw),true); } };
document.addEventListener('keydown',event=>{ if (/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName) || $('shortcuts').open) return; if(event.code==='Space'){event.preventDefault();deck.toggle();} if(event.code==='ArrowRight'){event.preventDefault();deck.seek(deck.audio.currentTime+5);} if(event.code==='ArrowLeft'){event.preventDefault();deck.seek(deck.audio.currentTime-5);} });
$('help').onclick=()=>$('shortcuts').showModal();
window.addEventListener('pagehide',()=>deck.dispose());
render();
