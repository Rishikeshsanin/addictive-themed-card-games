// Chromium mobile emulation + synthetic microphone/camera. No real LiveKit server or physical devices.
// Run with local Playwright installed: node tests/livekit-mobile-browser.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';

const source = await readFile(new URL('../src/livekit-call.js',import.meta.url),'utf8');
const fakeSdk = `
export const RoomEvent = Object.fromEntries(['TrackSubscribed','TrackUnsubscribed','ParticipantDisconnected','Reconnecting','Reconnected','Disconnected','AudioPlaybackStatusChanged','LocalTrackPublished','LocalTrackUnpublished','TrackMuted','TrackUnmuted'].map(k=>[k,k]));
export const Track = {Kind:{Audio:'audio',Video:'video'}};
export class Room {
 constructor() {
  this.listeners = new Map(); this.canPlayAudio = true; this.state='connected'; this.remoteParticipants=new Map();
  this.createdMedia = []; window.__rooms.push(this);
  this.localParticipant = {
   isMicrophoneEnabled:false,isCameraEnabled:false,audioTrackPublications:new Map(),videoTrackPublications:new Map(),
   setMicrophoneEnabled:async on=>{
    if(on){const media=await navigator.mediaDevices.getUserMedia({audio:true});this.createdMedia.push(...media.getTracks());this.localParticipant.audioTrackPublications.set('mic',{track:this.wrap(media.getAudioTracks()[0])})}
    else{for(const pub of this.localParticipant.audioTrackPublications.values())pub.track.stop();this.localParticipant.audioTrackPublications.clear()}
    this.localParticipant.isMicrophoneEnabled=on;
   },
   setCameraEnabled:async on=>{
    if(on){const media=await navigator.mediaDevices.getUserMedia({video:true});this.createdMedia.push(...media.getTracks());this.localParticipant.videoTrackPublications.set('cam',{track:this.wrap(media.getVideoTracks()[0])})}
    else{for(const pub of this.localParticipant.videoTrackPublications.values())pub.track.stop();this.localParticipant.videoTrackPublications.clear()}
    this.localParticipant.isCameraEnabled=on;
   }
  }
 }
 wrap(media) {return {kind:media.kind,attach(){const e=document.createElement(media.kind==='video'?'video':'audio');e.srcObject=new MediaStream([media]);return e},detach(){return []},stop(){media.stop()},restartTrack:async()=>{}}}
 on(event,cb){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(cb)}
 off(event,cb){this.listeners.get(event)?.delete(cb)}
 emit(event,...args){for(const cb of this.listeners.get(event)||[])cb(...args)}
 async connect(){this.connected=true}
 async disconnect(){this.disconnected=true;this.emit('Disconnected')}
 async startAudio(){this.canPlayAudio=true;this.emit('AudioPlaybackStatusChanged')}
}
`;
const sdkUrl = 'data:text/javascript;base64,'+Buffer.from(fakeSdk).toString('base64');
const clientUrl = 'data:text/javascript;base64,'+Buffer.from(source.replace("'https://esm.sh/livekit-client@2.15.3'",JSON.stringify(sdkUrl))).toString('base64');
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0}.hidden{display:none!important}#call-dock{position:fixed;right:7px;bottom:7px;width:181px;background:#333;color:#fff;z-index:5;padding:8px}#call-dock.minimized .video-stack{display:none}.game-actions{position:fixed;bottom:7px;left:5px;width:calc(100% - 10px);height:60px;background:#ccc}</style>
<div class="game-actions" id="game-actions">Gameplay controls</div>
<div id="call-dock"><button id="call-minimize">-</button><div id="call-status"></div>
<div id="video-stack" class="video-stack"><div id="remote-video"></div><div id="local-video"></div></div>
<div id="call-controls"><button id="call-join">Join Voice</button><button id="call-mic">Mic</button><button id="call-camera">Camera</button><button id="call-flip">Flip</button><button id="call-audio">Enable Audio</button><button id="call-leave">Leave</button></div></div>
<script>window.__rooms=[];</script>
<script type="module">import * as call from '${clientUrl}';window.__call=call;call.initCallControls(()=>({mode:'remote',code:'TEST12',token:'mock-session'}),()=>{});</script>`;
const server=createServer((req,res)=>{res.setHeader('content-type','text/html;charset=utf-8');res.end(html)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 for(const viewport of [{width:390,height:844},{width:320,height:568}]){
  const page=await browser.newPage({viewport,permissions:['microphone','camera'],serviceWorkers:'block'});
  await page.route('**/api/livekit-token',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'wss://example.invalid',token:'mock-token'})}));
  await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__call);
  assert.equal(await page.evaluate(()=>navigator.mediaDevices.getUserMedia!==undefined),true);
  assert.equal(await page.evaluate(()=>window.__rooms.length),0,'no SDK/media before explicit click');
  assert.equal(await page.locator('#call-dock').evaluate(el=>el.classList.contains('minimized')),true);
  const dock=await page.locator('#call-dock').boundingBox(),controls=await page.locator('#game-actions').boundingBox();
  assert.ok(dock.y+dock.height<=controls.y,'mobile dock must not obscure simulated bottom controls');
  await page.locator('#call-join').click();
  await page.waitForFunction(()=>window.__rooms?.[0]?.localParticipant.isMicrophoneEnabled);
  assert.equal(await page.evaluate(()=>window.__rooms[0].localParticipant.isCameraEnabled),false);
  await page.locator('#call-camera').click();
  await page.waitForFunction(()=>window.__rooms[0].localParticipant.isCameraEnabled);
  await page.locator('#local-video video').waitFor();
  await page.locator('#call-mic').click();
  assert.equal(await page.evaluate(()=>window.__rooms[0].localParticipant.isMicrophoneEnabled),false);
  await page.locator('#call-leave').click();
  await page.waitForFunction(()=>window.__rooms[0].createdMedia.every(track=>track.readyState==='ended'));
  assert.equal(await page.locator('#local-video video').count(),0);
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__call);
  assert.equal(await page.evaluate(()=>window.__rooms.length),0,'refresh never autocaptures');
  console.log('PASS synthetic Chromium mobile emulation '+viewport.width+'x'+viewport.height);
  await page.close();
 }
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
