import test from 'node:test';
import assert from 'node:assert/strict';
import {recentSpotifyAlbums,spotifyTrack,spotifyAlbum,RecentRecords} from './record-library.js';
import {angleDelta,scrubPosition,TapTempo} from './platter.js';
import {ScratchVoice} from './scratch-dsp.js';
const album='a'.repeat(22),id='b'.repeat(22),other='c'.repeat(22);
const track=(trackId=id,albumId=album)=>({id:trackId,name:'Song',artists:[{name:'Artist'}],album:{uri:'spotify:album:'+albumId,name:'Album',images:[{width:640,url:'https://example.test/large.jpg'},{width:300,url:'https://example.test/cover.jpg'}]}});
test('SDK album URIs group multiple songs into one recent sleeve, newest listen first',()=>{
  const recent=recentSpotifyAlbums([{track:track(),played_at:'2026-01-01T00:00:00Z'},{track:track(other),played_at:'2026-01-02T00:00:00Z'},{track:track(id,other),played_at:'2026-01-03T00:00:00Z'}]);
  assert.equal(recent.length,2);assert.equal(recent[0].albumId,other);assert.equal(recent[1].id,other);
  assert.equal(recent[1].albumUri,'spotify:album:'+album);assert.equal(recent[1].cover,'https://example.test/cover.jpg');
  assert.equal(spotifyTrack({id:'<script>'}),null);assert.equal(spotifyTrack({id,type:'episode'}),null);
  assert.equal(spotifyAlbum({id:album,name:'Search album'}).uri,'');
});
test('crate keeps the latest album first, limits memory, and clears Spotify on disconnect',()=>{
  const records=new RecentRecords(2);
  records.remember({...spotifyTrack(track()),source:'spotify'});
  records.remember({source:'local',title:'Practice',albumId:'practice'});
  records.remember({...spotifyTrack(track(other)),source:'spotify'});
  assert.equal(records.items.length,2);assert.equal(records.items[0].id,other);
  records.removeSource('spotify');assert.equal(records.items.length,1);assert.equal(records.items[0].source,'local');
});
test('platter crosses zero smoothly in either direction and bounds seek positions',()=>{
  assert.equal(angleDelta(359,1),2);assert.equal(angleDelta(1,359),-2);
  assert.equal(scrubPosition(10,-360,100),8.2);assert.equal(scrubPosition(10,360,100),11.8);
  assert.equal(scrubPosition(0,-360,10),0);assert.equal(scrubPosition(9,720,10),9.95);
});
test('tap tempo needs four beats, ignores double clicks, and resets after a long pause',()=>{
  const tempo=new TapTempo();
  for(const t of [0,625,1250])assert.equal(tempo.tap(t),null);
  assert.equal(tempo.tap(1875),96);assert.equal(tempo.tap(1900),96);
  assert.equal(tempo.tap(6000),null);assert.equal(tempo.taps.length,1);
});
test('scratch PCM moves in both directions and becomes silent when the hand stops',()=>{
  const voice=new ScratchVoice(),data=Float32Array.from({length:48000},(_,i)=>Math.sin(i*.08));
  voice.load([data],48000);
  const out=[new Float32Array(2048),new Float32Array(2048)];
  voice.start(.5);voice.move(.5,1);voice.process(out,48000);
  assert.ok(voice.position>24000);assert.ok(out[0].some(value=>Math.abs(value)>.1));assert.deepEqual(out[0],out[1]);
  voice.start(.5);voice.move(.5,-1);voice.process(out,48000);assert.ok(voice.position<24000);
  for(let i=0;i<15;i++)voice.process(out,48000);
  assert.ok(out[0].every(value=>Math.abs(value)<.0001));
  voice.start(0);voice.move(0,-3);voice.process(out,48000);assert.ok(out[0].every(value=>value===0));
  voice.stop();voice.process(out,48000);assert.ok(out[0].every(value=>value===0));
});
