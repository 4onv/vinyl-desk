import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DesktopBridge} from './desktop-bridge.mjs';

// Read-only OS smoke test. Never starts, pauses, or changes a user's music.
test('Windows helper starts and projects real media-session metadata', {skip:process.platform!=='win32',timeout:30000}, async t=>{
  const bridge=new DesktopBridge();t.after(()=>bridge.stop());
  const state=await bridge.request('state');
  assert.equal(state.available,true);assert.ok(Array.isArray(state.sessions));
  if(state.sessions.length) {
    const selected=await bridge.request('state',state.sessions[0].id);
    if(selected.track) {
      assert.equal(typeof selected.track.title,'string');assert.equal(typeof selected.track.playing,'boolean');
      assert.ok(Number.isFinite(selected.track.duration));assert.ok(Number.isFinite(selected.track.position));
      assert.equal(typeof selected.track.controls.play,'boolean');
      if(selected.track.cover) assert.match(selected.track.cover,/^data:image\/(jpeg|png|webp|gif|bmp);base64,/);
    }
  }
});
