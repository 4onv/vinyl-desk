import test from 'node:test';
import assert from 'node:assert/strict';
import {SpotifyPlayer} from './spotify-player.js';
function fixture({ready=true}={}) {
  let sdk,clock=0;
  const requests=[];
  class FakePlayer {
    constructor(options){this.options=options;this.listeners={};sdk=this;this.pauses=0;this.seeks=[];}
    addListener(name,callback){this.listeners[name]=callback;}
    emit(name,data){this.listeners[name]?.(data);}
    async connect(){if(ready)queueMicrotask(()=>this.emit('ready',{device_id:'side-a-device'}));return true;}
    disconnect(){this.disconnected=true;}
    async getCurrentState(){return this.state||null;}
    async activateElement(){this.activated=true;}
    async pause(){this.pauses++;}
    async resume(){this.resumed=true;}
    async seek(position){this.seeks.push(position);}
    async setVolume(value){this.volume=value;}
  }
  const auth={accessToken:async()=>'test',api:async(path,options)=>{requests.push({path,...options});return {items:[]};},clear(){}};
  const player=new SpotifyPlayer(auth,{loader:async()=>({Player:FakePlayer}),now:()=>clock});
  return {player,requests,get sdk(){return sdk;},advance:ms=>clock+=ms};
}
const state={position:10000,duration:120000,paused:false,loading:false,repeat_mode:0,track_window:{current_track:{id:'a'.repeat(22),name:'Test',artists:[],album:{id:'b'.repeat(22),name:'Album'}}}};
test('direct playback activates Side A and targets its device with the recent track offset',async()=>{
  const f=fixture();await f.player.connect();
  await f.player.playRecord({albumUri:'spotify:album:'+'b'.repeat(22),uri:'spotify:track:'+'a'.repeat(22)});
  assert.equal(f.sdk.activated,true);
  assert.deepEqual(f.requests[0].body,{device_ids:['side-a-device'],play:false});
  assert.equal(f.requests[1].path,'/me/player/play?device_id=side-a-device');
  assert.equal(f.requests[1].body.offset.uri,'spotify:track:'+'a'.repeat(22));
  f.requests.length=0;f.sdk.state=state;
  await f.player.playRecord({albumUri:'spotify:album:'+'b'.repeat(22),uri:''});
  assert.deepEqual(f.requests[0].body,{context_uri:'spotify:album:'+'b'.repeat(22)});
  f.player.disconnect();
});
test('Spotify seek bounds milliseconds and a playback failure stops the display and stream',async()=>{
  const f=fixture();await f.player.connect();f.sdk.emit('player_state_changed',state);f.advance(2500);
  assert.equal(f.player.position,12.5);await f.player.seek(999);await f.player.seek(-1);
  assert.deepEqual(f.sdk.seeks,[119900,0]);
  f.sdk.emit('playback_error',{message:'Playback error'});assert.equal(f.player.playing,false);assert.equal(f.sdk.pauses,1);assert.match(f.player.error,/Chrome or Edge/);
  f.advance(2000);assert.equal(f.player.position,10);
  f.player.disconnect();f.sdk.emit('player_state_changed',state);assert.equal(f.player.state,null);
});
test('disconnect cancels a pending connection and ignores late SDK readiness',async()=>{
  const f=fixture({ready:false});const connection=f.player.connect();
  await new Promise(resolve=>setImmediate(resolve));const old=f.sdk;f.player.disconnect();
  await connection;old.emit('ready',{device_id:'stale'});
  assert.equal(f.player.ready,false);assert.equal(f.player.status,'disconnected');assert.equal(old.disconnected,true);
});
test('switching away during activation cannot transfer or play on another device',async()=>{
  const f=fixture();await f.player.connect();
  let resume;f.sdk.getCurrentState=()=>new Promise(resolve=>resume=resolve);
  const pending=f.player.playRecord({uri:'spotify:track:'+'a'.repeat(22)});
  await new Promise(resolve=>setImmediate(resolve));f.player.disconnect();resume(null);
  await assert.rejects(pending,/disconnected/);assert.deepEqual(f.requests,[]);
});
