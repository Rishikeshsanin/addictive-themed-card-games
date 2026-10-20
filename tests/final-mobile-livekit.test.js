/**
 * FINAL DeckVerse mobile/LiveKit UI contract: real Chromium rendering, synthetic room API
 * and synthetic media with a mocked LiveKit SDK. No real DB, phone or LiveKit traffic.
 * Runs automatically under npm test / existing GitHub CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright-core';
import {newGame,takeTurn,viewFor} from '../src/engine.js';
import {startMultiGame,multiTurn,multiViewFor} from '../src/multi-engine.js';
import {DECKS} from '../src/catalog.js';

const root=process.cwd();
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8',
 '.css':'text/css;charset=utf-8','.json':'application/json','.svg':'image/svg+xml',
 '.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  const file=resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const bytes=await readFile(file);
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
  res.end(bytes);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end('Fixture unavailable');}
});
function createFixture(){
 const rooms=new Map(),tokens=new Map();
 let counter=0;
 function view(room,seat){
  const count=room.count,game=room.game,player=room.people[seat];
  const roomView={code:room.code,mode:room.mode,status:room.status,playerCount:count,
   hostSeat:room.hostSeat,paused:room.paused,revealSettings:{mode:'auto',seconds:2}};
  return {room:roomView,players:room.people.map((p,i)=>({...p,presence:room.offlineSeat===i?'disconnected':'online'})),
   me:{...player},game:game?{...(count===2?viewFor(game,seat):multiViewFor(game,seat)),
    matchNumber:room.matchNumber,rematchVotes:[...room.votes],endReason:null,
    reveal:game.last&&room.status==='playing'?{
     mode:'auto',seconds:2,required:count,until:room.revealUntil,acks:[]
    }:null}:null};
 }
 function accept(body){
  const {action}=body;
  if(action==='create'){
   const count=body.playerCount??2;assert.ok([2,3,4].includes(count));
   const code='QA'+String(++counter).padStart(4,'0');
   const room={code,count,mode:body.mode||'same',status:'lobby',game:null,
    hostSeat:0,paused:false,offlineSeat:null,matchNumber:1,votes:new Set(),
    people:[{index:0,name:body.name,ready:true}],revealUntil:null};
   rooms.set(code,room);
   const token='a'.repeat(63)+counter.toString(16).slice(-1);
   tokens.set(token,{code,seat:0});
   return {body:{...view(room,0),token}};
  }
  if(action==='join'){
   const room=rooms.get(body.code);if(!room)return {status:404,body:{error:'Room missing'}};
   const seat=room.people.length;
   if(seat>=room.count)return {status:409,body:{error:'Room full'}};
   room.people.push({index:seat,name:body.name,ready:false});
   const token=String(seat+1).repeat(63)+counter.toString(16).slice(-1);
   tokens.set(token,{code:room.code,seat});
   return {body:{...view(room,seat),token}};
  }
  const identity=tokens.get(body.token);
  const room=identity&&rooms.get(identity.code);
  if(!room||room.code!==body.code)return {status:401,body:{error:'Session expired'}};
  const seat=identity.seat;
  if(action==='ready')room.people[seat].ready=body.ready===true;
  if(action==='start'){
   if(seat!==room.hostSeat||room.people.length!==room.count||room.people.some(p=>!p.ready))
    return {status:403,body:{error:'Only ready host can start'}};
   room.status='playing';
   room.game=room.count===2?newGame({ids:DECKS[2],picker:()=>0,chooser:0}):
    startMultiGame({playerCount:room.count,picker:()=>0,chooser:0});
   room.people.forEach(p=>p.ready=false);
  }
  if(action==='select'){
   if(room.paused)return {status:409,body:{error:'Match paused while player reconnects'}};
   if(body.expectedRound!==room.game?.round)return {status:409,body:{error:'Stale round'}};
   if(seat!==room.game.chooser)return {status:403,body:{error:'Not your turn'}};
   room.game=room.count===2?takeTurn(room.game,seat,body.stat):multiTurn(room.game,seat,body.stat);
   room.status=room.game.status;
   room.revealUntil=new Date(Date.now()+2300).toISOString();
  }
  if(action==='rematch'){
   if(room.status!=='finished'||body.expectedMatchNumber!==room.matchNumber)
    return {status:409,body:{error:'Stale rematch'}};
   room.votes.add(seat);
   if(room.votes.size===room.count){
    room.votes.clear();room.matchNumber++;room.status='playing';room.revealUntil=null;
    room.game=room.count===2?newGame({ids:DECKS[2],picker:()=>0,chooser:0}):
     startMultiGame({playerCount:room.count,picker:()=>0,chooser:0});
   }
  }
  if(action==='heartbeat'||action==='get'||action==='settings'||action==='ack'){}
  if(action==='leave')return {body:{ok:true}};
  return {body:view(room,seat)};
 }
 return {rooms,accept,view,finish(room){
  assert.equal(room.status,'playing');
  room.status='finished';
  room.game={...room.game,status:'finished',winner:0,last:null};
  room.revealUntil=null;
 }};
}
function fakeSdk(){
 return `
 export const RoomEvent=Object.fromEntries(['TrackSubscribed','TrackUnsubscribed','Reconnecting',
  'Reconnected','Disconnected','AudioPlaybackStatusChanged','ParticipantDisconnected',
  'LocalTrackPublished','LocalTrackUnpublished','TrackMuted','TrackUnmuted'].map(x=>[x,x]));
 export const Track={Kind:{Audio:'audio',Video:'video'}};
 export class Room {
  constructor(){this.listeners=new Map();this.canPlayAudio=false;this.remoteParticipants=new Map();
   this.state='connected';this.created=[];window.__qaRooms??=[];window.__qaRooms.push(this);
   const local=this.localParticipant={
    isMicrophoneEnabled:false,isCameraEnabled:false,audioTrackPublications:new Map(),videoTrackPublications:new Map(),
    setMicrophoneEnabled:async on=>{
     if(on&&window.__denyMic)throw Object.assign(Error('synthetic denial'),{name:'NotAllowedError'});
     if(on){const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      this.created.push(...stream.getTracks());local.audioTrackPublications.set('mic',{track:this.wrap(stream.getAudioTracks()[0])});}
     else {for(const p of local.audioTrackPublications.values())p.track.stop();local.audioTrackPublications.clear();}
     local.isMicrophoneEnabled=on;
    },
    setCameraEnabled:async on=>{
     if(on&&window.__denyCam)throw Object.assign(Error('synthetic denial'),{name:'NotAllowedError'});
     if(on){const stream=await navigator.mediaDevices.getUserMedia({video:true});
      this.created.push(...stream.getTracks());local.videoTrackPublications.set('cam',{track:this.wrap(stream.getVideoTracks()[0])});}
     else {for(const p of local.videoTrackPublications.values())p.track.stop();local.videoTrackPublications.clear();}
     local.isCameraEnabled=on;
    }
   };
  }
  wrap(track){return {kind:track.kind,attach(){
   const el=document.createElement(track.kind==='video'?'video':'audio');
   el.srcObject=new MediaStream([track]);return el;
  },detach(){return []},stop(){track.stop()},restartTrack:async()=>{}};}
  on(name,cb){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(cb)}
  off(name,cb){this.listeners.get(name)?.delete(cb)}
  emit(name,...args){for(const cb of this.listeners.get(name)||[])cb(...args)}
  async connect(){this.connected=true}
  async startAudio(){this.canPlayAudio=true;this.emit('AudioPlaybackStatusChanged')}
  async disconnect(){this.disconnected=true;this.emit('Disconnected')}
 }`;
}
let activeBrowser;
async function openClient(browser,fixture,size){
 const context=await browser.newContext({viewport:size,permissions:['camera','microphone'],
  serviceWorkers:'block',deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/game?health=1',route=>route.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({status:'ready',app:'deckverse'})}));
 await page.route('**/api/game',async route=>{
  const req=route.request().postDataJSON();
  const response=fixture.accept(req);
  await route.fulfill({status:response.status||200,contentType:'application/json',body:JSON.stringify(response.body)});
 });
 await page.route('**/api/livekit-token',route=>{
  if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:'{"configured":true}'});
  return route.fulfill({status:200,contentType:'application/json',
   body:'{"url":"wss://fake.invalid","token":"fictional"}'});
 });
 await page.route('https://esm.sh/livekit-client@2.15.3',route=>route.fulfill({
  status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},
  body:fakeSdk()
 }));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());return u.hostname==='127.0.0.1'?route.continue():route.abort();
 });
 const started=performance.now();
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 return {context,page,errors,loadMs:performance.now()-started};
}
async function measure(page,stage,players,width){
 const report=await page.evaluate(()=>{
  window.scrollTo({left:100000,top:window.scrollY,behavior:'instant'});
  const scrollX=window.scrollX;
  window.scrollTo({left:0,top:window.scrollY,behavior:'instant'});
  const target=[...document.querySelectorAll(
   '#lobby-players .player-slot, #multi-arena .multi-card, #my-card, #their-card, #stat-buttons button, #call-dock .call-controls button'
  )].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().height>0);
  const clipped=target.filter(el=>{
   const r=el.getBoundingClientRect();
   const parent=getComputedStyle(el).display;
   return r.left < -2 || r.right > innerWidth+2 || r.width<=0;
  }).map(el=>({id:el.id,cls:String(el.className).slice(0,45)}));
  const buttons=[...document.querySelectorAll('#stat-buttons button:not([disabled])')];
  const dock=document.querySelector('#call-dock');
  const rect=dock?.getBoundingClientRect();
  const overlap=dock&&!dock.classList.contains('hidden')?buttons.filter(b=>{
   const r=b.getBoundingClientRect();return r.left<rect.right&&r.right>rect.left&&r.top<rect.bottom&&r.bottom>rect.top;
  }).length:0;
  return {scrollX,rawOverflow:document.documentElement.scrollWidth-innerWidth,clipped,
   blockedPlayableButtons:overlap,visibleControls:buttons.length,clientWidth:innerWidth};
 });
 assert.ok(report.scrollX<=2,`${stage} ${players}P ${width}px horizontal scroll: ${JSON.stringify(report)}`);
 assert.equal(report.clipped.length,0,`${stage} ${players}P ${width}px clipped controls: ${JSON.stringify(report)}`);
 assert.equal(report.blockedPlayableButtons,0,`${stage} ${players}P ${width}px call overlay blocks cards`);
 return report;
}
async function waitFor(page,fn){await page.waitForFunction(fn,null,{timeout:11000})}
test('final 2/3/4-player mobile lobby, round, pause, rematch and responsive UI', {timeout:145000},async()=>{
 const fixture=createFixture();const profiles=[{width:320,height:720},{width:390,height:844},
  {width:768,height:1024},{width:1366,height:900}];
 const samples=[],errors=[];
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 activeBrowser=browser;
 try{
  for(const players of [2,3,4]){
   const clients=[];
   try{
    for(let i=0;i<players;i++){
     const client=await openClient(browser,fixture,profiles[i]);
     clients.push(client);errors.push(client.errors);
     await measure(client.page,'landing',players,profiles[i].width);
     await client.page.locator('#pokemon-tile').click();
     await client.page.locator('[data-mode="remote"]').click();
     await client.page.locator('[data-player-count="'+players+'"]').click();
     await client.page.locator('#player-name').fill('Final QA '+players+'P '+i);
     await waitFor(client.page,()=>!document.querySelector('#create-room').disabled);
     await measure(client.page,'setup',players,profiles[i].width);
     if(i){await client.page.locator('#join-code').fill(clients[0].saved.code);await client.page.locator('#join-room').click();}
     else await client.page.locator('#create-room').click();
     await client.page.locator('#room-code').waitFor({state:'visible',timeout:11000});
     client.saved=await client.page.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')));
     assert.equal(client.saved.code,clients[0].saved.code);
     await measure(client.page,'lobby',players,profiles[i].width);
     if(i)await client.page.locator('#toggle-ready').click();
    }
    const host=clients[0],room=fixture.rooms.get(host.saved.code);
    assert.equal(room.people.length,players);
    await waitFor(host.page,()=>!document.querySelector('#start-match').disabled);
    await host.page.locator('#start-match').click();
    for(let i=0;i<players;i++){
     const p=clients[i].page;
     await p.locator('#battle').waitFor({state:'visible',timeout:12000});
     if(players>2){
      await waitFor(p,()=>document.querySelectorAll('#multi-arena .multi-player').length>0);
      assert.equal(await p.locator('#multi-arena .card-name').count(),1,'Only own future card exposed');
      assert.equal(await p.locator('#multi-arena .card-back').count(),players-1);
     } else {
      assert.equal(await p.locator('#their-card .card-back').count(),1,'Opponent must be concealed');
     }
     samples.push({players,width:profiles[i].width,stage:'battle',...(await measure(p,'battle',players,profiles[i].width))});
    }
    // Actual shared engine advances one server fixture turn; all browser snapshots update.
    const chooser=room.game.chooser;
    await clients[chooser].page.locator('.stat-button:not([disabled])').first().click();
    await waitFor(clients[chooser].page,()=>document.querySelector('#result.compact')!==null);
    assert.equal(room.game.round,1);
    if(players>2)assert.equal(await clients[chooser].page.locator('#multi-arena .card-name').count(),players);
    for(let i=0;i<players;i++){
     if(i===chooser)continue;
     await waitFor(clients[i].page,()=>document.querySelector('#result.compact')!==null);
    }
    // Exercise genuine browser offline/online events and retained session without backend mutation.
    const before=JSON.stringify(room.game.players.map(x=>x.deck));
    await clients[0].context.setOffline(true);
    await clients[0].page.locator('#network-status').waitFor({state:'visible',timeout:6000});
    await clients[0].context.setOffline(false);
    await clients[0].page.locator('#network-status').waitFor({state:'hidden',timeout:9000});
    assert.equal(JSON.stringify(room.game.players.map(x=>x.deck)),before);
    // Explicit host-transfer/pause fixture is UI only; SQL correctness belongs to DB suites.
    room.paused=true;room.offlineSeat=0;room.hostSeat=1;
    await waitFor(clients[0].page,()=>document.querySelector('#battle-status')?.textContent.includes('PAUSED'));
    await waitFor(clients[1].page,()=>!document.querySelector('#battle-settings-open')?.classList.contains('hidden'));
    const old=room.game.round;
    assert.ok(await clients[0].page.locator('#stat-buttons button:not([disabled])').count()===0);
    assert.equal(room.game.round,old);
    room.paused=false;room.offlineSeat=null;
    await waitFor(clients[0].page,()=>!document.querySelector('#battle-status')?.textContent.includes('PAUSED'));
    await clients[0].page.reload({waitUntil:'domcontentloaded'});
    await clients[0].page.locator('#battle').waitFor({state:'visible',timeout:11000});
    assert.equal((await clients[0].page.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')))).code,host.saved.code);
    assert.equal(JSON.stringify(room.game.players.map(x=>x.deck)),before);
    // Fixture-completed match: consent/rematch UI, not a natural 50/60/80-card finish.
    fixture.finish(room);
    for(const client of clients)await client.page.locator('#play-again').waitFor({state:'visible',timeout:11000});
    for(const client of clients)await client.page.locator('#play-again').click();
    await waitFor(host.page,()=>document.querySelector('#result')?.classList.contains('hidden'));
    assert.equal(room.matchNumber,2);
    assert.equal(room.game.round,0);
    assert.equal(room.game.players.reduce((n,p)=>n+p.deck.length,0),players===2?50:20*players);
    for(let i=0;i<players;i++){
     samples.push({players,width:profiles[i].width,stage:'rematch',...(await measure(clients[i].page,'rematch',players,profiles[i].width))});
    }
    await clients[0].page.screenshot({path:'/tmp/deckverse-final-'+players+'p-'+profiles[0].width+'.png',fullPage:true});
    console.log('PASS simulated '+players+'P lobby/round/reconnect/pause/host-transfer/rematch and '+clients.length+' viewport(s)');
   }finally{for(const c of clients)await c.context.close();}
  }
  for(const errorsForPage of errors)assert.deepEqual(errorsForPage,[],'JavaScript page errors');
  console.log('FINAL_MOBILE_QA_METRICS='+JSON.stringify(samples));
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});
