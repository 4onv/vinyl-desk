import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AudioDeck, demos, acceptsAudio, formatTime} from './audio.js';
class FakeAudio extends EventTarget {
 constructor(){super();this.paused=true;this.ended=false;this.currentTime=0;this.duration=48;}
 set src(value){this._src=value;this.currentTime=0;}
 get src(){return this._src;}
 async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
}
globalThis.Audio=FakeAudio;
test('transport preserves pause, advances while playing, and wraps the crate',async()=>{
 const deck=new AudioDeck();deck.next();assert.equal(deck.index,1);assert.equal(deck.playing,false);
 await deck.play();deck.next();assert.equal(deck.index,2);assert.equal(deck.playing,true);
 deck.next();assert.equal(deck.index,0);deck.audio.currentTime=12;deck.previous();assert.equal(deck.index,0);assert.equal(deck.audio.currentTime,0);
 deck.previous();assert.equal(deck.index,2);deck.dispose();
});
test('seeking is bounded and does not seek before metadata exists',()=>{
 const deck=new AudioDeck();deck.seek(100);assert.equal(deck.audio.currentTime,48);deck.seek(-8);assert.equal(deck.audio.currentTime,0);deck.audio.duration=NaN;deck.seek(12);assert.equal(deck.audio.currentTime,0);
});
test('local import rejects non-audio, preserves filenames as text, and releases file URLs',()=>{
 const deck=new AudioDeck();assert.equal(deck.import([new File(['x'],'notes.txt',{type:'text/plain'})]),0);assert.equal(deck.tracks.length,3);
 const name='<img src=x onerror=alert(1)>.wav';const file=new File(['RIFF'],name,{type:'audio/wav'});assert.equal(deck.import([file]),1);assert.equal(deck.track.title,name.slice(0,-4));assert.equal(deck.track.local,true);assert.match(deck.track.url,/^blob:/);deck.dispose();
});
test('rejected playback exposes a useful error',async()=>{const deck=new AudioDeck();deck.audio.play=async()=>{throw new Error('blocked');};await deck.play();assert.match(deck.error,/Playback could not start/);});
test('original demo WAVs contain 48 seconds of valid PCM audio',async()=>{
 for(const track of demos){const wav=await readFile(new URL(track.url,import.meta.url));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt32LE(40),wav.length-44);assert.equal((wav.length-44)/wav.readUInt32LE(28),48);assert.ok((await readFile(new URL(track.cover,import.meta.url))).length>100);}
});
test('time labels handle unavailable media and long tracks',()=>{assert.equal(formatTime(Infinity),'0:00');assert.equal(formatTime(367),'6:07');assert.equal(acceptsAudio({name:'record.FLAC',type:''}),true);});
