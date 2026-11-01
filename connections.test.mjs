import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopConnection, parseMusicLink } from './connections.js';

test('share links become official embeds without tracking parameters',()=>{
  const spotify=parseMusicLink('https://open.spotify.com/intl-fr/track/0Lr4kGOYn9l83EjuK6cZFQ?si=tracking');
  assert.equal(spotify.embed,'https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ');
  assert.equal(parseMusicLink('spotify:track:0Lr4kGOYn9l83EjuK6cZFQ').url,spotify.url);
  const apple=parseMusicLink('https://music.apple.com/us/album/an-album/123456?i=987654&at=tracking');
  assert.equal(apple.embed,'https://embed.music.apple.com/us/album/an-album/123456?i=987654');
  assert.equal(parseMusicLink('https://music.apple.com/us/playlist/example/pl.abcdef').provider,'apple');
  assert.match(parseMusicLink('https://soundcloud.com/artist/sets/my-record?si=tracking').embed,/^https:\/\/w.soundcloud.com\/player\/\?/);
  assert.equal(parseMusicLink('https://music.youtube.com/watch?v=M7lc1UVf-VE&si=tracking').embed,'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE');
  assert.equal(parseMusicLink('https://youtu.be/M7lc1UVf-VE').name,'YouTube');
});
test('untrusted domains, markup, credentials, redirects, and unsupported links are rejected',()=>{
  for(const value of ['javascript:alert(1)','<iframe src=x>','http://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ',
    'https://open.spotify.com.evil.example/track/0Lr4kGOYn9l83EjuK6cZFQ','https://open.spotify.com@evil.example/a',
    'https://user:password@open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ','https://127.0.0.1/private',
    'https://spotify.link/short','https://soundcloud.com/discover','https://youtube.com/redirect?v=M7lc1UVf-VE',
    'https://music.apple.com/us/album/bad/not-an-id','https://open.spotify.com:8080/track/0Lr4kGOYn9l83EjuK6cZFQ']) {
    assert.throws(()=>parseMusicLink(value),undefined,value);
  }
});
const response = data => ({ok:true,json:async()=>data});
test('desktop auto-selects Spotify, sends only explicit controls, and disconnects cleanly',async t=>{
  const calls=[];
  const connection=new DesktopConnection(async(path,options)=>{
    calls.push({path,options});
    return response({sessions:[{id:'Spotify.exe',name:'Spotify'}],track:path.includes('sessionId=Spotify.exe')?{playing:false,position:3,duration:48}:null});
  });
  t.after(()=>connection.disconnect());await connection.connect();
  assert.equal(connection.sessionId,'Spotify.exe');assert.equal(connection.position,3);
  assert.equal(calls.filter(call=>call.options.method==='POST').length,0);
  await connection.control('seek',12);
  const command=calls.find(call=>call.options.method==='POST');
  assert.deepEqual(JSON.parse(command.options.body),{command:'seek',sessionId:'Spotify.exe',position:12});
  assert.equal(command.options.headers['X-Side-A'],'1');connection.disconnect();assert.equal(connection.active,false);
});
test('stale responses cannot restore playback after disconnecting',async t=>{
  let finish;
  const connection=new DesktopConnection(()=>new Promise(resolve=>{finish=resolve;}));
  t.after(()=>connection.disconnect());
  const pending=connection.connect();connection.disconnect();
  finish(response({sessions:[{id:'Spotify.exe',name:'Spotify'}],track:{title:'stale'}}));await pending;
  assert.equal(connection.state.track,null);assert.equal(connection.active,false);
});
test('connection errors clear stale playback and remain recoverable',async t=>{
  const connection=new DesktopConnection(async()=>({ok:false,json:async()=>({error:'Windows player closed.'})}));
  t.after(()=>connection.disconnect());await connection.connect();
  assert.equal(connection.state.track,null);assert.equal(connection.error,'Windows player closed.');
});
