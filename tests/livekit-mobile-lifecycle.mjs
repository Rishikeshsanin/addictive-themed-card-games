// Deterministic LiveKit lifecycle contract tests. No cloud token, camera or secret is required.
// Run: node --test tests/livekit-mobile-lifecycle.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

class Element {
 constructor(tag = 'div') {
  this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.attributes = {};
  this.classNames = new Set(); this.classList = {
   add: name => this.classNames.add(name),
   toggle: (name, enabled) => enabled ? this.classNames.add(name) : this.classNames.delete(name),
   contains: name => this.classNames.has(name)
  };
  this.textContent = ''; this.disabled = false;
 }
 appendChild(child) { child.parent = this; this.children.push(child); return child; }
 replaceChildren(...children) { this.children = []; for (const child of children) this.appendChild(child); }
 remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(el => el !== this); }
 setAttribute(name, value) { this.attributes[name] = value; }
 querySelector(selector) {
  const tag = selector.toUpperCase(); return this.children.find(el => el.tagName === tag && !el.removed) || null;
 }
}
class Track {
 constructor(kind) { this.kind = kind; this.attaches = 0; this.stopped = false; this.elements = []; }
 attach() { this.attaches++; const element = new Element(this.kind === 'audio' ? 'audio' : 'video'); this.elements.push(element); return element; }
 detach(element) { const targets = element ? [element] : this.elements; for (const el of targets) el.remove(); return targets; }
 stop() { this.stopped = true; }
 async restartTrack({facingMode}) { this.facingMode = facingMode; }
}
class MockRoom {
 constructor() {
  this.listeners = new Map(); this.canPlayAudio = true; this.remoteParticipants = new Map(); this.state = 'connected';
  this.localParticipant = {
   isMicrophoneEnabled: false, isCameraEnabled: false,
   audioTrackPublications: new Map(), videoTrackPublications: new Map(),
   setMicrophoneEnabled: async enabled => {
    if (enabled && this.failMicrophone) throw Object.assign(new Error('denied'), {name:'NotAllowedError'});
    this.localParticipant.isMicrophoneEnabled = enabled;
    if (enabled) this.localParticipant.audioTrackPublications.set('mic', {track:new Track('audio')});
    else this.localParticipant.audioTrackPublications.clear();
   },
   setCameraEnabled: async enabled => {
    if (enabled && this.failCamera) throw Object.assign(new Error('no camera'), {name:'NotFoundError'});
    this.localParticipant.isCameraEnabled = enabled;
    if (enabled) this.localParticipant.videoTrackPublications.set('camera', {track:new Track('video')});
    else this.localParticipant.videoTrackPublications.clear();
   }
  };
  MockRoom.instances.push(this);
 }
 on(name, handler) { if (!this.listeners.has(name)) this.listeners.set(name,new Set()); this.listeners.get(name).add(handler); }
 off(name, handler) { this.listeners.get(name)?.delete(handler); }
 emit(name, ...args) { for (const handler of this.listeners.get(name) || []) handler(...args); }
 async connect() { this.connected = true; }
 async disconnect() { this.disconnected = true; this.emit('Disconnected'); }
 async startAudio() { this.audioStarted = true; this.canPlayAudio = true; this.emit('AudioPlaybackStatusChanged'); }
}
MockRoom.instances = [];
const SDK = `export const Room = globalThis.__deckverseMockRoom;
export const Track = {Kind:{Audio:'audio',Video:'video'}};
export const RoomEvent = Object.fromEntries(['TrackSubscribed','TrackUnsubscribed','ParticipantDisconnected','Reconnecting','Reconnected','Disconnected','AudioPlaybackStatusChanged','LocalTrackPublished','LocalTrackUnpublished','TrackMuted','TrackUnmuted'].map(key=>[key,key]));`;
const ids = ['call-dock','call-status','call-join','call-mic','call-camera','call-leave',
 'call-audio','call-flip','call-minimize','local-video','remote-video'];
let instance = 0;
async function setup(width = 390, fetcher = async () => ({ok:true,status:200,json:async()=>({url:'wss://example.invalid',token:'test-placeholder'})})) {
 MockRoom.instances.length = 0;
 const elements = new Map(ids.map(id => [id,new Element()]));
 const listeners = new Map();
 globalThis.window = {innerWidth:width,addEventListener:(name,fn)=>listeners.set('window:'+name,fn)};
 globalThis.document = {
  visibilityState:'visible',getElementById:id=>elements.get(id)||null,
  createElement:tag=>new Element(tag),
  addEventListener:(name,fn)=>listeners.set('document:'+name,fn),
  querySelectorAll: selector => selector.split(',').flatMap(part=>{
   const [parent,tag] = part.trim().split(' ');
   const id = parent.replace('#','');
   return (elements.get(id)?.children||[]).filter(el=>el.tagName.toLowerCase()===tag);
  })
 };
 globalThis.fetch = fetcher;
 globalThis.__deckverseMockRoom = MockRoom;
 const source = await fs.readFile(new URL('../src/livekit-call.js',import.meta.url),'utf8');
 const sdkUrl = 'data:text/javascript;base64,'+Buffer.from(SDK).toString('base64');
 const patched = source.replace("'https://esm.sh/livekit-client@2.15.3'",JSON.stringify(sdkUrl));
 const mod = await import('data:text/javascript;base64,'+Buffer.from(patched+`\n// test ${++instance}`).toString('base64'));
 const toasts = [];
 mod.initCallControls(()=>({mode:'remote',code:'TEST12',token:'fake-test-session'}),message=>toasts.push(message));
 return {mod, elements, listeners, toasts, get lastRoom(){return MockRoom.instances.at(-1);}};
}
// Tests run sequentially to avoid shared fake DOM/global SDK cross-talk.
test('lazy media, explicit join, accessibility and mobile-safe minimized default',async()=>{
 const ctx = await setup();
 assert.equal(MockRoom.instances.length,0);
 assert.equal(ctx.elements.get('call-dock').classList.contains('minimized'),true);
 assert.match(ctx.elements.get('call-dock').style.top,/safe-area/);
 await ctx.mod.connectCall(()=>({mode:'remote',code:'TEST12',token:'test'}));
 assert.equal(ctx.lastRoom.localParticipant.isMicrophoneEnabled,true);
 assert.equal(ctx.lastRoom.localParticipant.isCameraEnabled,false);
 assert.equal(ctx.elements.get('call-mic').attributes['aria-label'],'Mute microphone');
 await ctx.mod.toggleMicCall();
 assert.equal(ctx.elements.get('call-mic').attributes['aria-label'],'Unmute microphone');
 await ctx.mod.disconnectCall();
 assert.equal(ctx.lastRoom.disconnected,true);
 assert.equal(ctx.elements.get('call-join').classList.contains('hidden'),false);
});
test('no duplicate media attachment, video/camera switching, audio unlock, and track cleanup',async()=>{
 const ctx = await setup(); await ctx.mod.connectCall(()=>({mode:'remote',code:'TEST12',token:'test'}));
 const r = ctx.lastRoom, mic = r.localParticipant.audioTrackPublications.get('mic').track;
 const audio = new Track('audio'), v1 = new Track('video'), v2 = new Track('video');
 r.emit('TrackSubscribed',audio); r.emit('TrackSubscribed',audio);
 r.emit('TrackSubscribed',v1); r.emit('TrackSubscribed',v2);
 assert.equal(audio.attaches,1); assert.equal(v1.attaches,1);
 assert.equal(ctx.elements.get('remote-video').children.length,2,'both remote cameras remain visible');
 r.emit('TrackUnsubscribed',v1);
 assert.equal(v1.elements[0].removed,true);
 r.canPlayAudio=false; r.emit('AudioPlaybackStatusChanged');
 assert.equal(ctx.elements.get('call-audio').classList.contains('hidden'),false);
 await ctx.mod.enableCallAudio(); assert.equal(r.audioStarted,true);
 await ctx.mod.toggleCameraCall();
 assert.equal(r.localParticipant.isCameraEnabled,true);
 await ctx.mod.flipCameraCall();
 assert.equal(r.localParticipant.videoTrackPublications.get('camera').track.facingMode,'environment');
 await ctx.mod.disconnectCall();
 assert.equal(mic.stopped,true);
 assert.equal(audio.elements[0].removed,true);
 assert.equal(v2.elements[0].removed,true);
 assert.equal(ctx.elements.get('local-video').classList.contains('hidden'),true);
 assert.equal([...r.listeners.values()].every(set=>set.size===0),true,'all SDK listeners are removed');
});
test('denied microphone is listen-only, absent camera does not break calling, no auto resume on visibility',async()=>{
 const ctx = await setup(1200); await ctx.mod.connectCall(()=>({mode:'remote',code:'TEST12',token:'test'}));
 const r = ctx.lastRoom;
 r.failMicrophone=true; await ctx.mod.toggleMicCall(); // Toggle off, then denied on.
 await ctx.mod.toggleMicCall();
 assert.equal(r.localParticipant.isMicrophoneEnabled,false);
 assert.match(ctx.elements.get('call-status').textContent,/permission denied/i);
 r.failCamera=true; await ctx.mod.toggleCameraCall();
 assert.match(ctx.elements.get('call-status').textContent,/No compatible Camera/i);
 globalThis.document.visibilityState='hidden'; ctx.listeners.get('document:visibilitychange')();
 globalThis.document.visibilityState='visible'; ctx.listeners.get('document:visibilitychange')();
 assert.equal(r.localParticipant.isCameraEnabled,false);
 assert.equal(r.localParticipant.isMicrophoneEnabled,false);
 await ctx.mod.disconnectCall();
});
test('unexpected disconnect, failed reconnect guidance, and rejoin are isolated from old room events',async()=>{
 const ctx = await setup();
 await ctx.mod.connectCall(()=>({mode:'remote',code:'TEST12',token:'test'}));
 const first=ctx.lastRoom;
 first.emit('Reconnecting'); assert.match(ctx.elements.get('call-status').textContent,/Reconnecting/);
 first.emit('Reconnected'); assert.match(ctx.elements.get('call-status').textContent,/reconnected/);
 first.emit('Disconnected'); assert.match(ctx.elements.get('call-status').textContent,/reconnection failed/);
 assert.equal(ctx.elements.get('call-join').classList.contains('hidden'),false);
 await ctx.mod.connectCall(()=>({mode:'remote',code:'TEST12',token:'test'}));
 const second=ctx.lastRoom; first.emit('Disconnected');
 assert.notEqual(first,second);
 assert.equal(ctx.elements.get('call-leave').classList.contains('hidden'),false);
 await ctx.mod.disconnectCall();
});
test('cancel during in-flight token fetch prevents a late room or media capture',async()=>{
 let abortSeen=false;
 const ctx = await setup(390, async (_url, options) => new Promise((resolve,reject)=>{
  options.signal.addEventListener('abort',()=>{abortSeen=true;reject(Object.assign(new Error('aborted'),{name:'AbortError'}));});
 }));
 const promise=ctx.mod.connectCall(()=>({mode:'remote',code:'TEST12',token:'test'}));
 await ctx.mod.disconnectCall();
 await promise;
 assert.equal(abortSeen,true);
 assert.equal(MockRoom.instances.length,0);
 assert.equal(ctx.elements.get('call-join').disabled,false);
});
