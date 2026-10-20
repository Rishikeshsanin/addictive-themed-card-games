/**
 * Round 5: REAL isolated HTTP handlers + disposable PostgreSQL 16 + independent
 * Chromium browser contexts. Eight themes x 2/3/4 people. This tests SERVER
 * contract through browser fetch, AND the combined Agent C themed multiplayer UI.
 *
 * Baseline screenshots and integrated UI-driven cases are distinctly labelled.
 * Never connect this harness to Supabase, Vercel or real LiveKit.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import postgres from 'postgres';
import {chromium} from 'playwright-core';
import {ALLOWED_THEME_IDS,DECK_SIZE_BY_PLAYERS} from '../src/server/theme-registry.js';

assert.equal(process.env.ROUND5_LOCAL_ONLY,'YES');
assert.equal(process.env.DB_INTEGRATION_LOCAL_ONLY,'YES');
for(const key of ['DB_INTEGRATION_ADMIN_URL','DECKVERSE_DATABASE_URL']){
 const u=new URL(process.env[key]||'');
 assert.equal(u.hostname,'127.0.0.1','Remote database forbidden');
 assert.equal(u.pathname,'/deckverse_ci','Only disposable CI schema allowed');
 assert.equal(u.port,'5432','Only isolated fixed localhost port allowed');
}
process.env.LIVEKIT_URL='wss://synthetic-only.invalid';
process.env.LIVEKIT_API_KEY='ci-fictional';
process.env.LIVEKIT_API_SECRET='ci-fictional-only-no-livekit-cloud';
const {default:gameHandler}=await import('../api/game.js');
const db=postgres(process.env.DB_INTEGRATION_ADMIN_URL,{ssl:false,prepare:false,max:4});
const root=process.cwd(),output='/tmp',events=[],defects=[],metrics=[];
const record=(name,status,detail={})=>{events.push({name,status,...detail});console.log('ROUND5_'+status+' '+name+' '+JSON.stringify(detail));};
const TYPES={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
function response(res){return{
 setHeader:(name,value)=>res.setHeader(name,value),
 status(code){res.statusCode=code;return this},
 json(data){if(!res.writableEnded){res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}return this}
};}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/game'){
   let raw='';
   if(req.method==='POST')for await(const chunk of req){
    raw+=chunk;if(raw.length>7000){res.writeHead(413);res.end();return;}
   }
   req.body=raw?JSON.parse(raw):{};
   await gameHandler(req,response(res));
   return;
  }
  if(url.pathname==='/api/livekit-token'){
   // This deliberately does not contact any LiveKit service or mint real tokens.
   res.writeHead(503,{'content-type':'application/json'});
   res.end('{"error":"Synthetic QA: LiveKit Cloud unavailable"}');return;
  }
  const p=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!p.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const data=await readFile(p);
  res.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream','cache-control':'no-store'});
  res.end(data);
 }catch(error){
  console.error('ROUND5_SERVER_ERROR',error.message);
  if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500);
  if(!res.writableEnded)res.end('Local CI test-server exception');
 }
});
let browser;
function expected(out,code,label){
 assert.equal(out.status,code,label+' unexpected status '+out.status+' body='+JSON.stringify(out.data).slice(0,420));
 return out.data;
}
async function fromBrowser(page,action,fields={}){
 return page.evaluate(async body=>{
  const res=await fetch('/api/game',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(body),cache:'no-store'});
  return {status:res.status,data:await res.json()};
 },{action,...fields});
}
async function context(width=390){
 const c=await browser.newContext({viewport:{width,height:width===320?700:width===390?844:width===768?1024:900},
  reducedMotion:'reduce',serviceWorkers:'block',
  permissions:['camera','microphone'],
  deviceScaleFactor:1});
 const p=await c.newPage(),errors=[],consoleErrors=[];
 p.on('pageerror',err=>errors.push(err.message));
 p.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('net::ERR_BLOCKED_BY_CLIENT'))consoleErrors.push(msg.text())});
 await p.route('**/*',route=>{
  const u=new URL(route.request().url());
  return u.hostname==='127.0.0.1'?route.continue():route.abort('blockedbyclient');
 });
 await p.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 return {c,p,errors,consoleErrors};
}
function cleanView(v,theme,n,seat){
 assert.equal(v.room.themeId,theme,'server theme must be persisted and echoed');
 assert.equal(v.room.playerCount,n);
 assert.equal(v.room.theme.categories.length,8);
 assert.equal(v.me.index,seat);
 const json=JSON.stringify(v);
 assert.ok(!json.includes('token_hash')&&!json.includes('"state":')&&!json.includes('"deck":')&&!json.includes('"players":{'),'Do not disclose DB state or hidden decks');
 if(v.game){
  assert.equal(v.game.total,DECK_SIZE_BY_PLAYERS[n]);
  assert.equal(v.game.counts.length,n);
  assert.equal(v.game.me,seat);
 }
}
async function resetQuota(){
 // ONLY fictional PostgreSQL; avoids rate-limit ceilings during 24 cases.
 await db`DELETE FROM deckverse.rate_limit_counters`;
}
async function roomRow(code){
 const [r]=await db`SELECT id,code,status,player_count,theme_id,state,host_seat FROM deckverse.rooms WHERE code=${code}`;
 assert.ok(r,'Missing CI room');return r;
}
async function uiGeometry(page,width,stage,{allowHidden=true}={}){
 const v=await page.evaluate(()=>{
  window.scrollTo({left:99999,top:window.scrollY,behavior:'instant'});
  const scroll=window.scrollX;window.scrollTo({left:0,top:window.scrollY,behavior:'instant'});
  const interesting=[...document.querySelectorAll('#stat-buttons button,#multi-arena .battle-card,#battle .tabletop .battle-card,#call-dock button')].filter(el=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
  });
  const cut=interesting.filter(el=>{const r=el.getBoundingClientRect();return r.left< -2||r.right>innerWidth+2}).map(el=>el.id||el.className).slice(0,8);
  const dock=document.querySelector('#call-dock');
  const buttons=[...document.querySelectorAll('#stat-buttons button:not([disabled])')];
  const blocked=dock&&!dock.classList.contains('hidden')?buttons.filter(b=>{
   const a=b.getBoundingClientRect(),d=dock.getBoundingClientRect();
   const l=Math.max(a.left,d.left),t=Math.max(a.top,d.top),r=Math.min(a.right,d.right),bt=Math.min(a.bottom,d.bottom);
   if(r-l<3||bt-t<3)return false;
   const target=document.elementFromPoint((r+l)/2,(t+bt)/2);
   return Boolean(target&&dock.contains(target));
  }).length:0;
  return {scroll,overflow:document.documentElement.scrollWidth-innerWidth,cut,blocked,
   dockVisible:!!dock&&!dock.classList.contains('hidden'),gameVisible:!!document.querySelector('#battle:not(.hidden)')};
 });
 metrics.push({stage,width,...v});
 assert.ok(v.scroll<=2,'Baseline '+width+' horizontal scroll');
 assert.deepEqual(v.cut,[],'Baseline '+width+' cropped controls');
 if(v.dockVisible&&v.gameVisible)assert.equal(v.blocked,0,'Live gameplay call dock blocks controls '+width);
 return v;
}
async function syntheticMedia(page){
 const state=await page.evaluate(async()=>{
  const media=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
  const tracks=media.getTracks(),before=tracks.map(t=>({kind:t.kind,state:t.readyState}));
  for(const t of tracks)t.stop();
  return {before,after:tracks.map(t=>t.readyState)};
 });
 assert.equal(state.before.length,2);
 assert.ok(state.before.every(t=>t.state==='live'));
 assert.deepEqual(state.after,['ended','ended']);
 record('synthetic media permission/capture/cleanup','PASS',{classification:'Chromium fake capture only; no LiveKit SDK/Cloud'});
}
async function scenario(theme,n,index){
 await resetQuota();
 const widths=[320,390,768,1366];
 const users=[];
 try{
  for(let i=0;i<n;i++)users.push(await context(widths[i]));
  const create=expected(await fromBrowser(users[0].p,'create',{name:'R5 Host '+index,mode:'remote',playerCount:n,themeId:theme}),200,theme+' create');
  const code=create.room.code;
  assert.match(create.token,/^[a-f0-9]{64}$/);
  const sessions=[{code,token:create.token,index:0}];
  cleanView(create,theme,n,0);
  const other=theme==='pokemon'?'avengers':'pokemon';
  expected(await fromBrowser(users[0].p,'create',{name:'Malicious Client',mode:'same',playerCount:n,themeId:'__proto__'}),400,'unapproved theme');
  for(let i=1;i<n;i++){
   expected(await fromBrowser(users[i].p,'join',{code,name:'R5 Guest '+index+'-'+i,themeId:other}),409,'theme override on join');
   const result=expected(await fromBrowser(users[i].p,'join',{code,name:'R5 Guest '+index+'-'+i,themeId:theme}),200,'join');
   assert.equal(result.me.index,i);
   sessions.push({code,token:result.token,index:i});
   cleanView(result,theme,n,i);
   expected(await fromBrowser(users[i].p,'ready',{code,token:result.token,ready:true,themeId:theme}),200,'ready');
   if(i===1)expected(await fromBrowser(users[i].p,'ready',{code,token:result.token,ready:true,themeId:theme}),200,'duplicate ready idempotent');
  }
  const host=sessions[0];
  const started=expected(await fromBrowser(users[0].p,'start',{...host,themeId:theme}),200,'start');
  cleanView(started,theme,n,0);
  assert.equal(started.room.status,'playing');
  assert.deepEqual(started.game.counts,Array(n).fill(n===2?25:20));
  expected(await fromBrowser(users[0].p,'start',{...host,themeId:theme}),400,'duplicate start');
  const original=await roomRow(code);
  assert.equal(original.theme_id,theme);
  assert.equal(original.state.themeId||'pokemon',theme);
  const views=[];
  for(let i=0;i<n;i++){
   const snap=expected(await fromBrowser(users[i].p,'get',sessions[i]),200,'get');
   cleanView(snap,theme,n,i);views.push(snap);
   const hide=JSON.stringify(snap.game);
   for(let otherSeat=0;otherSeat<n;otherSeat++)if(otherSeat!==i){
    const foreign=original.state.players[otherSeat].deck[0];
    assert.ok(!hide.includes('"id":'+foreign+','),'Future opponent card leaked to player '+i);
   }
  }
  const chooser=started.game.chooser,key=started.room.theme.categories[1].key;
  const wrong=(chooser+1)%n;
  expected(await fromBrowser(users[wrong].p,'select',{...sessions[wrong],stat:key,expectedRound:0,themeId:theme}),403,'only chooser');
  const chosen=expected(await fromBrowser(users[chooser].p,'select',{...sessions[chooser],stat:key,expectedRound:0,themeId:theme}),200,'first round');
  assert.equal(chosen.game.round,1);
  assert.equal(chosen.game.last.cards.length,n);
  expected(await fromBrowser(users[chooser].p,'select',{...sessions[chooser],stat:key,expectedRound:0,themeId:theme}),409,'duplicate turn');
  const round=await roomRow(code);
  const total=round.state.players.reduce((sum,p)=>sum+p.deck.length,0)+round.state.pot.length;
  assert.equal(total,DECK_SIZE_BY_PLAYERS[n],'No card loss after turn');
  if(theme==='pokemon'&&n===3){
   const before=JSON.stringify(round.state.players.map(p=>p.deck));
   await users[0].c.setOffline(true);
   const offline=await users[0].p.evaluate(()=>navigator.onLine);
   assert.equal(offline,false);
   await users[0].c.setOffline(false);
   assert.equal((await users[0].p.evaluate(()=>navigator.onLine)),true);
   expected(await fromBrowser(users[0].p,'get',host),200,'reconnect without cards lost');
   assert.equal(JSON.stringify((await roomRow(code)).state.players.map(p=>p.deck)),before);
   // transfer host while keeping all seats and game state; only fictional timestamps updated.
   await db`UPDATE deckverse.players SET last_seen_at=clock_timestamp()-interval '8 minutes' WHERE room_id=${round.id} AND seat=0`;
   const changed=expected(await fromBrowser(users[1].p,'heartbeat',sessions[1]),200,'heartbeat host transfer');
   assert.equal(changed.room.hostSeat,1);
   assert.equal(changed.room.paused,true);
   const [paused]=await db`SELECT state FROM deckverse.rooms WHERE id=${round.id}`;
   const actor=paused.state.chooser;
   expected(await fromBrowser(users[actor].p,'select',{...sessions[actor],stat:key,expectedRound:1}),409,'paused selection');
   expected(await fromBrowser(users[0].p,'heartbeat',host),200,'host resume heartbeat');
   record('host transfer + paused selection + reconnect','PASS',{theme,n,classification:'DB timestamp fixture'});
  }
  // Seed only TERMINAL MATCH STATUS; NOT a naturally completed 50/60/80-card game.
  const last=await roomRow(code);
  const finished={...last.state,status:'finished',winner:0,endReason:null};
  await db`UPDATE deckverse.rooms SET status='finished',state=${db.json(finished)},reveal_until=null,reveal_acks='[]'::jsonb WHERE id=${last.id}`;
  for(let i=0;i<n;i++){
   const r=expected(await fromBrowser(users[i].p,'rematch',{...sessions[i],expectedMatchNumber:1,themeId:theme}),200,'unanimous rematch vote');
   assert.equal(r.room.themeId,theme);
   if(i===0){
    const duplicate=expected(await fromBrowser(users[i].p,'rematch',{...sessions[i],expectedMatchNumber:1,themeId:theme}),200,'duplicate vote');
    assert.equal(duplicate.room.status,'finished');
   }
  }
  const after=expected(await fromBrowser(users[0].p,'get',host),200,'new match');
  assert.equal(after.room.status,'playing');
  assert.equal(after.game.matchNumber,2);
  assert.equal(after.game.round,0);
  assert.equal(after.room.themeId,theme);
  assert.deepEqual(after.game.counts,Array(n).fill(n===2?25:20));
  expected(await fromBrowser(users[0].p,'rematch',{...host,expectedMatchNumber:1,themeId:theme}),409,'stale rematch rejected');
  assert.equal((await roomRow(code)).theme_id,theme);
  for(const client of users)assert.deepEqual(client.errors,[],'Browser page errors '+theme+'/'+n);
  if(theme==='pokemon'){
   for(const width of [320,390,768,1366]){
    const c=await context(width);
    try{
     await uiGeometry(c.p,width,'baseline-before-agent-C');
     await c.p.screenshot({path:output+'/deckverse-round5-baseline-'+width+'.png',fullPage:true,timeout:12000});
     if(width===390)await syntheticMedia(c.p);
     record('frontend theme controls require Agent C','PENDING',{theme,n,width,reason:'Base src/app.js does not yet render an eight-theme room/game UI'});
    }finally{await c.c.close();}
   }
  }
  record('API browser matrix','PASS',{theme,n,seats:sessions.length,cardCount:DECK_SIZE_BY_PLAYERS[n],
   round:1,rematchMatchNumber:2,frontend:'PENDING_AGENT_C',database:'disposable postgres:16',sdk:'not loaded'});
 }finally{for(const c of users)await c.c.close().catch(()=>{});}
}

/**
 * Combined Agent C + E acceptance. Unlike the API fetch matrix above, these
 * checks interact with real game UI controls and their authenticated sessions.
 * This runs ONLY with the isolated localhost Docker PostgreSQL fixture.
 */
async function themedUiScenario(theme,n,width){
 await resetQuota();
 const clients=[];
 const identity=t=>String(t).replace(/[^a-z0-9]/gi,'');
 try{
  for(let i=0;i<n;i++)clients.push(await context(i===0?width:i===1?390:768));
  const host=clients[0].p;
  await host.locator('[data-theme-id="'+theme+'"]').first().click();
  await host.locator('#setup:not(.hidden)').waitFor({timeout:12000});
  assert.equal(await host.locator('[data-choose-theme="'+theme+'"]').getAttribute('aria-pressed'),'true');
  await host.locator('[data-player-count="'+n+'"]').click();
  await host.locator('[data-mode="remote"]').click();
  await host.locator('#player-name').fill('UI Host '+identity(theme));
  await host.locator('#create-room').click();
  await host.locator('#lobby:not(.hidden)').waitFor({timeout:16000});
  const code=(await host.locator('#room-code').textContent()).trim();
  assert.match(code,/^[A-Z0-9]{6}$/);
  const first=await roomRow(code);
  assert.equal(first.theme_id,theme,'UI must create requested theme in server-owned room');
  assert.equal(first.player_count,n);
  const guestSessions=[];
  for(let i=1;i<n;i++){
   const guest=clients[i].p;
   await guest.locator('#top-play').click();
   await guest.locator('#setup:not(.hidden)').waitFor();
   const decoy=theme==='pokemon'?'avengers':'pokemon';
   await guest.locator('[data-choose-theme="'+decoy+'"]').click();
   await guest.locator('#player-name').fill('UI Guest '+i+' '+identity(theme));
   await guest.locator('#join-code').fill(code);
   await guest.locator('#join-room').click();
   await guest.locator('#lobby:not(.hidden)').waitFor({timeout:16000});
   assert.ok((await guest.locator('#lobby-theme').textContent()).length>2);
   assert.equal(await guest.evaluate(()=>document.body.dataset.onlineTheme),theme,
    'Joining must follow the persisted host theme, never the guest selector');
   const guestSession=await guest.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')));
   assert.ok(guestSession?.token,'Guest must retain authenticated private session');
   guestSessions.push(guestSession);
   await guest.locator('#toggle-ready').click();
  }
  await host.waitForFunction(()=>{
   const button=document.querySelector('#start-match');
   return button&&!button.disabled&&!button.classList.contains('hidden');
  },{timeout:20000});
  await host.locator('#start-match').click();
  for(const client of clients)await client.p.locator('#battle:not(.hidden)').waitFor({timeout:18000});
  const started=await roomRow(code);
  assert.equal(started.status,'playing');
  assert.equal(started.theme_id,theme);
  assert.equal(started.state.players.length,n);
  const cats=(await fromBrowser(host,'get',{
   code,token:(await host.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')))).token
  })).data.room.theme.categories;
  assert.equal(cats.length,8);
  for(const client of clients){
   const page=client.p;
   assert.equal(await page.locator('#stat-buttons button').count(),8,'Eight theme-specific UI action buttons');
   assert.deepEqual((await page.locator('#stat-buttons button').evaluateAll(buttons=>buttons.map(b=>b.dataset.stat))).sort(),
    cats.map(s=>s.key).sort(),'Stats must match the server-approved selected theme');
   assert.equal(await page.evaluate(()=>document.body.dataset.onlineTheme),theme);
   if(theme!=='pokemon'){
    const hidden=n===2?page.locator('#their-card .theme-facedown'):page.locator('#multi-arena .theme-facedown');
    assert.ok(await hidden.count()>=1,'Opponent future card must remain concealed in the DOM');
   }
   await uiGeometry(page,(await page.evaluate(()=>innerWidth)),'integrated-theme-ui', {allowHidden:false});
   assert.deepEqual(client.errors,[],'Integrated UI page exception '+theme+'/'+n);
  }
  const chooser=started.state.chooser;
  await clients[chooser].p.waitForFunction(()=>{
   return document.querySelectorAll('#stat-buttons button:not([disabled])').length===8;
  },{timeout:14000});
  await clients[chooser].p.locator('#stat-buttons button:not([disabled])').first().click();
  await clients[chooser].p.locator('#result.compact').waitFor({timeout:13000});
  const advanced=await roomRow(code);
  assert.equal(advanced.state.round,1,'Actual UI click must advance persisted room exactly one round');
  assert.equal(advanced.theme_id,theme);
  if(theme!=='pokemon'){
   const revealed=n===2?clients[chooser].p.locator('#their-card .theme-card-name'):
    clients[chooser].p.locator('#multi-arena .theme-card-name');
   assert.ok(await revealed.count()>=1,'Theme character name visible after round reveal');
  }
  if(width===320||width===1366)
   await clients[chooser].p.screenshot({
    path:'/tmp/deckverse-round5-integrated-'+theme+'-'+n+'-'+width+'.png',fullPage:true,timeout:14000
   });
  record('INTEGRATED THEMED UI','PASS',{theme,n,width,realSelection:true,realJoin:true,
   eightServerCategories:true,privateHiddenCards:true,realTurn:true,database:'disposable'});
 }finally{for(const client of clients)await client.c.close().catch(()=>{});}
}

try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 for(let i=0;i<ALLOWED_THEME_IDS.length;i++){
  const theme=ALLOWED_THEME_IDS[i];
  for(const n of [2,3,4])await scenario(theme,n,i);
 }
 assert.equal(events.filter(e=>e.name==='API browser matrix'&&e.status==='PASS').length,24);
 // Full browser-click acceptance: eight server-owned themes at every 2/3/4
 // player count, with all four responsive viewport sizes rotated across cases.
 for(let i=0;i<ALLOWED_THEME_IDS.length;i++)
  for(const n of [2,3,4])
   await themedUiScenario(ALLOWED_THEME_IDS[i],n,[320,390,768,1366][(i+n-2)%4]);
 assert.equal(events.filter(e=>e.name==='INTEGRATED THEMED UI'&&e.status==='PASS').length,24);
 const report={classification:'real localhost HTTP -> real game.js -> disposable PostgreSQL 16, independently managed Chromium',
  frontendAgentC:'24 UI-driven cases executed on this combined branch',physicalDevices:'NOT TESTED',
  liveKitCloud:'NOT TESTED',matchCompletion:'synthetic terminal state for rematch',
  passedMatrix:24,totalMatrix:24,events,metrics,defects};
 await writeFile('/tmp/deckverse-round5-report.json',JSON.stringify(report,null,2));
 console.log('ROUND5_FINAL_API_MATRIX_PASS 24 API scenarios + 24 UI-driven cases across eight themes');
}finally{await browser?.close();await new Promise(done=>server.close(done));await db.end();}
