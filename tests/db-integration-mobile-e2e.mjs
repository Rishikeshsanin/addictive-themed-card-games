// DeckVerse V2 combined API + real disposable PostgreSQL + Chromium test lane.
// Only connects to http://127.0.0.1 and deckverse_ci. Never contact production.
// Run AFTER db-integration-mobile-setup.mjs with DB_INTEGRATION_LOCAL_ONLY=YES.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {performance} from 'node:perf_hooks';
import postgres from 'postgres';
import {chromium} from 'playwright-core';

assert.equal(process.env.DB_INTEGRATION_LOCAL_ONLY,'YES','Explicit disposable opt-in is required');
const appUrl = new URL(process.env.DECKVERSE_DATABASE_URL||'');
const adminUrl = new URL(process.env.DB_INTEGRATION_ADMIN_URL||'');
for(const u of [appUrl,adminUrl]){
 assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname),'Refusing non-loopback database');
 assert.equal(u.pathname,'/deckverse_ci','Refusing non-CI database');
}
process.env.LIVEKIT_URL='wss://livekit-ci.invalid';
process.env.LIVEKIT_API_KEY='ci-placeholder-key-only';
process.env.LIVEKIT_API_SECRET='ci-fake-nonproduction-signing-secret-only';
const [{default:gameHandler},{default:tokenHandler}]=await Promise.all([import('../api/game.js'),import('../api/livekit-token.js')]);
const db=postgres(process.env.DB_INTEGRATION_ADMIN_URL,{ssl:false,max:2,prepare:false});
const root=resolve(new URL('..',import.meta.url).pathname);
const output=resolve('artifacts/db-integration-mobile');
await mkdir(output,{recursive:true});
const jsonHeaders={'content-type':'application/json'};
const events=[], metrics=[];
const record=(name,passed,detail={})=>{events.push({name,status:passed?'PASS':'FAIL',...detail});console.log((passed?'PASS ':'FAIL ')+name+': '+JSON.stringify(detail))};
const pctl=(name,elapsed)=>{metrics.push({name,ms:Math.round(elapsed*10)/10})};
const percent=(x,p)=>{const a=[...x].sort((b,c)=>b-c);return a[Math.max(0,Math.ceil(a.length*p)-1)]??null};
let browser=null;
function respond(res){
 return {
  setHeader:(n,v)=>res.setHeader(n,v),
  status(code){res.statusCode=code;return this},
  json(data){if(!res.writableEnded){res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(data));}return this}
 };
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/game'||url.pathname==='/api/livekit-token'){
   let text='';
   if(req.method==='POST'){
    for await(const chunk of req){text+=chunk;if(text.length>6500){res.writeHead(413);res.end();return;}}
   }
   req.body = text?JSON.parse(text):{};
   await (url.pathname==='/api/game'?gameHandler:tokenHandler)(req,respond(res));
   return;
  }
  const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const data=await readFile(path);
  res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
 }catch(error){
  if(!res.headersSent)res.writeHead(error?.code==='ENOENT'?404:500);
  if(!res.writableEnded)res.end(error?.code==='ENOENT'?'not found':'test harness server error');
 }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const headers={...jsonHeaders};
async function api(action,payload={}){
 const started=performance.now();
 const response=await fetch(origin+'/api/game',{method:'POST',headers,body:JSON.stringify({action,...payload})});
 const body=await response.json();
 pctl('api:'+action,performance.now()-started);
 return {status:response.status,headers:response.headers,body};
}
async function liveToken(code,token){
 const response=await fetch(origin+'/api/livekit-token',{method:'POST',headers,body:JSON.stringify({code,token})});
 return {status:response.status,headers:response.headers,body:await response.json()};
}
async function must(action,payload){
 const r=await api(action,payload);assert.equal(r.status,200,`${action}: ${JSON.stringify(r.body).slice(0,300)}`);return r.body;
}
async function inBrowser(page,action,body={}){
 return page.evaluate(async({action,body})=>{
  const r=await fetch('/api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...body})});
  return {status:r.status,body:await r.json(),retryAfter:r.headers.get('retry-after')};
 },{action,body});
}
function stateOf(page){return page.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')||'null'));}
async function createPage(width=390,height=844){
 const context=await browser.newContext({viewport:{width,height},permissions:['camera','microphone'],serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',err=>errors.push(err.message.slice(0,180)));
 // Allow loopback application only; all third-party image/font requests are blocked.
 // A separate per-page fake SDK route in callTests intentionally fulfills the SDK request.
 await page.route('**/*',route=>{
  const host=new URL(route.request().url()).hostname;
  if(host==='127.0.0.1')return route.continue();
  return route.abort();
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.locator('#pokemon-tile').click();
 return {page,context,errors};
}
async function enter(client,{name,mode='same',count=2,code=null}){
 const p=client.page;
 await p.locator(`[data-mode="${mode}"]`).click();
 await p.locator(`[data-player-count="${count}"]`).click();
 await p.locator('#player-name').fill(name);
 await p.locator('#create-room').waitFor({state:'visible'});
 await p.waitForFunction(()=>!document.getElementById('create-room').disabled);
 const started=performance.now();
 if(code){await p.locator('#join-code').fill(code);await p.locator('#join-room').click();}
 else await p.locator('#create-room').click();
 await p.locator('#room-code').waitFor({state:'visible',timeout:20000});
 pctl('browser:'+(code?'join':'create'),performance.now()-started);
 const saved=await stateOf(p);
 assert.match(saved.code,/^[A-Z0-9]{6}$/);
 return saved;
}
async function screenshot(page,name){
 await page.screenshot({path:join(output,name+'.png'),fullPage:true,timeout:12000}).catch(error=>console.log('Screenshot unavailable '+name+': '+error.message.slice(0,130)));
}
async function countDb(code){
 const r=await db`SELECT r.id, r.status, r.state, r.host_seat, r.presence_version, count(p.*)::integer AS seats
 FROM deckverse.rooms r JOIN deckverse.players p ON p.room_id=r.id AND p.active=true
 WHERE r.code=${code} GROUP BY r.id`;
 return r[0];
}
async function fakeFinish(code){
 const [row]=await db`SELECT state FROM deckverse.rooms WHERE code=${code}`;
 assert.equal(row.state.status,'playing');
 const finished={...row.state,status:'finished',winner:0,endReason:null};
 await db`UPDATE deckverse.rooms SET status='finished',state=${db.json(finished)},reveal_until=null,reveal_acks='[]'::jsonb WHERE code=${code}`;
}
async function sessionRoundtrip(client,saved){
 const before=await must('get',{code:saved.code,token:saved.token});
 await client.context.setOffline(true);
 await client.page.locator('#network-status').waitFor({state:'visible',timeout:6000});
 assert.equal((await stateOf(client.page)).token,saved.token);
 await client.context.setOffline(false);
 await client.page.locator('#network-status').waitFor({state:'hidden',timeout:10000});
 await client.page.reload({waitUntil:'domcontentloaded'});
 await client.page.locator('#battle').waitFor({state:'visible',timeout:12000});
 const after=await must('get',{code:saved.code,token:saved.token});
 assert.equal(after.room.code,before.room.code);
 assert.deepEqual(after.game.counts,before.game.counts);
 assert.equal(after.game.round,before.game.round);
 assert.equal(after.game.topCard?.id,before.game.topCard?.id);
 assert.equal((await countDb(saved.code)).seats,before.room.playerCount);
}
async function checkGeometry(page,tag){
 const info=await page.evaluate(()=>{
  const dock=document.querySelector('#call-dock'),buttons=[...document.querySelectorAll('#stat-buttons button:not([disabled])')];
  const rect=dock.getBoundingClientRect();
  const intersection=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  return {overflow:document.documentElement.scrollWidth-innerWidth,
   dock:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
   blocked:buttons.filter(b=>intersection(rect,b.getBoundingClientRect())>2).length,
   count:buttons.length};
 });
 assert.ok(info.overflow<=2,`${tag}: horizontal overflow ${JSON.stringify(info)}`);
 assert.equal(info.blocked,0,`${tag}: expanded call dock covers gameplay buttons: ${JSON.stringify(info)}`);
 record('geometry:'+tag,true,info);
}
const fakeSdk = `
export const RoomEvent=Object.fromEntries(['TrackSubscribed','TrackUnsubscribed','ParticipantDisconnected','Reconnecting','Reconnected','Disconnected','AudioPlaybackStatusChanged','LocalTrackPublished','LocalTrackUnpublished','TrackMuted','TrackUnmuted'].map(k=>[k,k]));
export const Track={Kind:{Audio:'audio',Video:'video'}};
export class Room{
 constructor(){this.listeners=new Map();this.state='connected';this.canPlayAudio=false;this.remoteParticipants=new Map();this.createdMedia=[];(window.__qaRooms??=[]).push(this);
 this.localParticipant={isMicrophoneEnabled:false,isCameraEnabled:false,audioTrackPublications:new Map(),videoTrackPublications:new Map(),
 setMicrophoneEnabled:async on=>{if(on){const m=await navigator.mediaDevices.getUserMedia({audio:true});this.createdMedia.push(...m.getTracks());this.localParticipant.audioTrackPublications.set('mic',{track:this.wrap(m.getAudioTracks()[0])})}else{for(const p of this.localParticipant.audioTrackPublications.values())p.track.stop();this.localParticipant.audioTrackPublications.clear()}this.localParticipant.isMicrophoneEnabled=on},
 setCameraEnabled:async on=>{if(on){const m=await navigator.mediaDevices.getUserMedia({video:true});this.createdMedia.push(...m.getTracks());this.localParticipant.videoTrackPublications.set('cam',{track:this.wrap(m.getVideoTracks()[0])})}else{for(const p of this.localParticipant.videoTrackPublications.values())p.track.stop();this.localParticipant.videoTrackPublications.clear()}this.localParticipant.isCameraEnabled=on}}}
 wrap(track){return {kind:track.kind,attach(){const el=document.createElement(track.kind==='video'?'video':'audio');el.srcObject=new MediaStream([track]);return el},detach(){return []},stop(){track.stop()},restartTrack:async()=>{}}}
 on(event,cb){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(cb)}
 off(event,cb){this.listeners.get(event)?.delete(cb)}
 emit(event,...args){for(const cb of this.listeners.get(event)||[])cb(...args)}
 async connect(){this.connected=true}
 async startAudio(){this.canPlayAudio=true;this.emit('AudioPlaybackStatusChanged')}
 async disconnect(){this.disconnected=true;this.emit('Disconnected')}
}`;
async function callTests(host,guest){
 const p=host.page;
 // Never contact LiveKit Cloud. Replace SDK import and LiveKit token issuance in browser.
 await p.route('https://esm.sh/livekit-client@2.15.3',route=>route.fulfill({status:200,
  headers:{'access-control-allow-origin':'*','cache-control':'no-store'},contentType:'text/javascript',body:fakeSdk}));
 await p.route('**/api/livekit-token',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'wss://fake-ci.invalid',token:'synthetic-placeholder'})}));
 // Existing LiveKit client loaded lazily only after click.
 assert.equal(await p.evaluate(()=>window.__qaRooms?.length??0),0);
 await p.locator('#call-join').click();
 await p.waitForFunction(()=>window.__qaRooms?.[0]?.localParticipant.isMicrophoneEnabled,null,{timeout:15000});
 assert.equal(await p.evaluate(()=>window.__qaRooms[0].localParticipant.isCameraEnabled),false);
 await p.locator('#call-audio').waitFor({state:'visible'});
 await p.locator('#call-audio').click();
 assert.equal(await p.evaluate(()=>window.__qaRooms[0].canPlayAudio),true);
 await p.locator('#call-mic').click();
 await p.waitForFunction(()=>window.__qaRooms[0].localParticipant.isMicrophoneEnabled===false);
 await p.locator('#call-mic').click();
 await p.waitForFunction(()=>window.__qaRooms[0].localParticipant.isMicrophoneEnabled===true);
 await p.locator('#call-camera').click();
 await p.waitForFunction(()=>window.__qaRooms[0].localParticipant.isCameraEnabled);
 await p.locator('#call-minimize').click();
 await p.locator('#local-video video').waitFor({state:'visible'});
 await checkGeometry(p,'390-expanded-livekit');
 await screenshot(p,'remote-call-expanded-390');
 await p.locator('#call-leave').click();
 await p.waitForFunction(()=>window.__qaRooms[0].createdMedia.every(t=>t.readyState==='ended'));
 assert.equal(await p.locator('#local-video video').count(),0);
 record('synthetic LiveKit mic/camera, mute, playback unlock and release',true,{classification:'synthetic Chromium + stub SDK'});
}
async function run(){
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 for(const count of [2,3,4]){
  const clients=[]; const mode=count===2?'remote':'same';
  try{
   const sizes=count===2?[{width:390,height:844},{width:320,height:568}]:count===3?[{width:320,height:568},{width:768,height:1024},{width:390,height:844}]:[{width:390,height:844},{width:768,height:1024},{width:1366,height:768},{width:320,height:568}];
   for(const size of sizes)clients.push(await createPage(size.width,size.height));
   const host=await enter(clients[0],{name:`QA Host ${count}`,count,mode});
   const saved=[host];
   for(let i=1;i<count;i++)saved.push(await enter(clients[i],{name:`QA Guest ${count}-${i}`,count,mode,code:host.code}));
   assert.equal((await countDb(host.code)).seats,count);
   for(let i=1;i<count;i++)await clients[i].page.locator('#toggle-ready').click();
   await clients[0].page.waitForFunction(()=>!document.querySelector('#start-match').disabled,null,{timeout:14000});
   await clients[0].page.locator('#start-match').click();
   await clients[0].page.locator('#battle').waitFor({state:'visible',timeout:12000});
   const snapshot=await must('get',{code:host.code,token:host.token});
   assert.equal(snapshot.room.status,'playing');
   assert.equal(snapshot.room.playerCount,count);
   assert.deepEqual(snapshot.game.counts,Array(count).fill(count===2?25:20));
   assert.equal(snapshot.game.counts.reduce((a,b)=>a+b,0),count===2?50:count===3?60:80);
   assert.equal((await countDb(host.code)).seats,count);
   for(let i=0;i<count;i++){
    await clients[i].page.locator('#battle').waitFor({state:'visible',timeout:12000});
    const overflowInfo=await clients[i].page.evaluate(()=>{
     const rawOverflow=document.documentElement.scrollWidth-innerWidth;
     window.scrollTo({left:10000,top:window.scrollY,behavior:'instant'});
     const actualScrollX=window.scrollX;
     window.scrollTo({left:0,top:window.scrollY,behavior:'instant'});
     const nodes=[...document.querySelectorAll('#multi-arena .battle-card, .tabletop .battle-card, #stat-buttons button')]
      .filter(el=>el.getBoundingClientRect().width>0);
     const blocked=nodes.filter(el=>{
      const r=el.getBoundingClientRect(); return r.left < -2 || r.right > innerWidth + 2;
     }).map(el=>({tag:el.tagName,cls:String(el.className||'').slice(0,80)})).slice(0,6);
     return {rawOverflow,actualScrollX,blocked,decorativeOverflow:rawOverflow>2&&actualScrollX<=2};
    });
    if(overflowInfo.actualScrollX>2 || overflowInfo.blocked.length){
     record(`interactive viewport clipping ${count}P seat ${i} at ${sizes[i].width}px`,false,overflowInfo);
     await screenshot(clients[i].page,`overflow-${count}p-${sizes[i].width}`);
    }else record(`usable mobile layout ${count}P seat ${i} at ${sizes[i].width}px`,true,overflowInfo);
    if(count>2){
     assert.equal(await clients[i].page.locator('#multi-arena .multi-player').count(),count);
     assert.equal(await clients[i].page.locator('#multi-arena .card-name').count(),1,'opponent top cards must be concealed');
    }
   }
   record(`${count}P browser room creation, joining, readiness, start and card secrecy`,true,{roomSize:count,classification:'disposable PostgreSQL + synthetic Chromium'});
   for(let i=0;i<clients.length;i++) await screenshot(clients[i].page,`started-${count}p-${sizes[i].width}`);
   await sessionRoundtrip(clients[0],host);
   record(`${count}P offline/online/refresh preserves seats and cards`,true,{classification:'disposable PostgreSQL + synthetic Chromium'});
   if(count===2){
    const invalid=await liveToken(host.code,'f'.repeat(64));
    assert.equal(invalid.status,403);
    const legit=await liveToken(host.code,host.token);
    assert.equal(legit.status,200,`valid participant token: ${JSON.stringify(legit.body).slice(0,120)}`);
    assert.ok(legit.body.url.endsWith('.invalid'),'token endpoint must remain synthetic');
    const claims=JSON.parse(Buffer.from(legit.body.token.split('.')[1],'base64url').toString());
    assert.match(claims.sub,/^deckverse-/);
    assert.ok(claims.video?.room?.startsWith('deckverse-')||claims.room?.startsWith('deckverse-'),'signed token is room scoped');
    record('LiveKit token rejects outsider and signs only synthetic room-scoped grants',true,{classification:'disposable DB + fictional local LiveKit signing credentials'});
    await callTests(clients[0],clients[1]);
   }
   if(count===3){
    const before=await must('get',{code:host.code,token:saved[1].token});
    await db`UPDATE deckverse.players SET last_seen_at=now()-interval '7 minutes'
      WHERE room_id=(SELECT id FROM deckverse.rooms WHERE code=${host.code}) AND seat=0`;
    const transitioned=await must('heartbeat',{code:host.code,token:saved[1].token});
    assert.equal(transitioned.room.hostSeat,1,'stale host must transfer to connected member');
    assert.equal(transitioned.room.paused,true,'stale participant pauses game');
    assert.equal(transitioned.players[0].presence,'disconnected');
    assert.deepEqual(transitioned.game.counts,before.game.counts);
    const pausedPlay=await api('select',{code:host.code,token:saved[1].token,expectedRound:before.game.round,stat:'hp'});
    assert.equal(pausedPlay.status,409);
    assert.match(pausedPlay.body.error,/paused/i);
    await clients[1].page.waitForFunction(()=>document.querySelector('#battle-status')?.textContent.includes('PAUSED'),null,{timeout:10000});
    await screenshot(clients[1].page,'presence-paused-3p');
    const returned=await must('heartbeat',{code:host.code,token:host.token});
    assert.equal(returned.room.paused,false);
    assert.equal(returned.room.hostSeat,1,'recovered old host must not silently seize host role');
    assert.deepEqual(returned.game.counts,before.game.counts);
    record('host transfer, paused-game lockout, reconnect recovery with stable cards',true,{classification:'disposable PostgreSQL + synthetic browser'});
   }
   // Fast synthetic terminal fixture: test unanimous API/UI rematch, NOT natural-match completion.
   await fakeFinish(host.code);
   for(const client of clients)await client.page.locator('#play-again').waitFor({state:'visible',timeout:12000});
   const oldId=(await countDb(host.code)).id;
   for(let i=0;i<count;i++)await clients[i].page.locator('#play-again').click();
   let restarted=null;
   for(let n=0;n<30;n++){
    const current=await must('get',{code:host.code,token:host.token});
    if(current.room.status==='playing' && current.game?.matchNumber===2){restarted=current;break}
    await new Promise(done=>setTimeout(done,150));
   }
   assert.ok(restarted,`${count}P unanimous votes did not commit a rematch`);
   assert.equal(restarted.room.status,'playing');
   assert.equal(restarted.game.matchNumber,2);
   assert.equal(restarted.game.counts.reduce((a,b)=>a+b,0),count===2?50:count===3?60:80);
   assert.equal((await countDb(host.code)).id,oldId,'rematch must reuse room');
   assert.equal((await countDb(host.code)).seats,count,'rematch must preserve original roster');
   const stale=await api('rematch',{code:host.code,token:host.token,expectedMatchNumber:1});
   assert.equal(stale.status,409);
   record(`${count}P unanimous rematch, stale-vote rejection and same room`,true,{classification:'synthetic finished-state fixture + real PostgreSQL and API'});
   for(const client of clients)assert.deepEqual(client.errors,[],'Browser page error');
  } finally{
   for(const client of clients)await client.context.close().catch(()=>{});
  }
 }
 // Browser-originated limiter test, using only private ephemeral test rooms.
 const limiter=await createPage(390,844);
 try{
  let denied=null,successful=0;
  for(let attempt=0;attempt<12;attempt++){
   const result=await inBrowser(limiter.page,'create',{name:'Rate QA '+attempt,mode:'same',playerCount:2});
   if(result.status===200)successful++;
   if(result.status===429){denied=result;break;}
   assert.equal(result.status,200,`limiter unexpected response: ${JSON.stringify(result)}`);
  }
  assert.ok(denied,'Create limiter must deny burst of >8 rooms from same IP');
  assert.ok(Number(denied.retryAfter)>=1);
  assert.match(denied.body.error,/too many requests/i);
  record('browser API durable create throttle + Retry-After + safe message',true,{successful,denial:429,retryAfterSeconds:Number(denied.retryAfter),classification:'disposable PostgreSQL'});
 } finally {await limiter.context.close();}
 const groups=new Map();
 for(const {name,ms} of metrics){if(!groups.has(name))groups.set(name,[]);groups.get(name).push(ms);}
 const perf=[...groups].map(([name,values])=>({name,samples:values.length,minMs:Math.min(...values),p50Ms:percent(values,.5),p95Ms:percent(values,.95),maxMs:Math.max(...values)}));
 await (await import('node:fs/promises')).writeFile(join(output,'results.json'),JSON.stringify({classification:'CI-local loopback PostgreSQL + Chromium emulation (not physical phones or LiveKit Cloud)',tests:events,performance:perf,environment:{node:process.version,chromiumPath:process.env.CHROME_PATH||'/usr/bin/chromium'}},null,2));
 console.log('PERFORMANCE (local disposable CI only): '+JSON.stringify(perf));
 const failures=events.filter(x=>x.status==='FAIL');
 console.log('INTEGRATED MOBILE QA: '+(events.length-failures.length)+' passing groups; '+failures.length+' failing');
 if(failures.length)throw Error('Coordinator-owned V2 release blocker(s): '+failures.map(x=>x.name).join('; '));
}
try{await run()}catch(error){
 // Preserve evidence even if a hard assertion interrupts the scenario sequence.
 const summary=[...new Set(metrics.map(x=>x.name))].map(name=>{
  const values=metrics.filter(x=>x.name===name).map(x=>x.ms);
  return {name,samples:values.length,minMs:Math.min(...values),p50Ms:percent(values,.5),p95Ms:percent(values,.95),maxMs:Math.max(...values)};
 });
 await (await import('node:fs/promises')).writeFile(join(output,'partial-results.json'),JSON.stringify({
  status:'INCOMPLETE / FAILED',classification:'disposable local PostgreSQL and synthetic Chromium only',
  completedGroups:events,performance:summary,error:error.message
 },null,2));
 throw error;
}finally{
 await browser?.close();
 await db.end();
 await new Promise(resolve=>server.close(resolve));
}
