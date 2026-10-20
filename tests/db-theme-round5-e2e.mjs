/**
 * Round 5 E2E: REAL loopback HTTP -> UNMODIFIED api/game.js -> disposable PG17.6.
 * No mocks of HTTP actions, auth, server registry, room locks or game state.
 * Only explicit, labelled force-endgame setup manipulates fictional DB rows.
 */
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {getServerManifest,getServerCard, getServerTheme,ALLOWED_THEME_IDS} from '../src/server/theme-registry.js';
import {validateServerThemeMatch,themeViewFor} from '../src/server/theme-match.js';
import {consumeQuota} from '../src/server/rate-limit.js';

const NAME='deckverse_round5_ci';
function checkEnv(name,role){
 assert.equal(process.env.DECKVERSE_ROUND5_DISPOSABLE,'YES','Disposable-only opt-in missing');
 const value=process.env[name]||'',u=new URL(value);
 assert.ok(['postgres:','postgresql:'].includes(u.protocol));
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'5432');
 assert.equal(u.pathname,'/'+NAME);assert.equal(decodeURIComponent(u.username),role);
 assert.equal(u.searchParams.get('sslmode'),'require');
 return value;
}
const APP=checkEnv('DECKVERSE_DATABASE_URL','deckverse_app');
const ADMIN=checkEnv('ROUND5_PG_ADMIN_URL','postgres');
const sql=postgres(ADMIN,{ssl:'require',max:3,prepare:false,connect_timeout:4});
const {default:handler}=await import('../api/game.js');
const server=createServer(async(req,res)=>{
 res.status=code=>{res.statusCode=code;return res};
 res.json=payload=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(payload));return res};
 if(req.url!=='/api/game'){res.statusCode=404;res.end();return}
 try{
  if(req.method==='POST'){
   let text='';
   for await(const chunk of req){
    text+=chunk;
    if(text.length>8000)throw Error('Oversized test POST body');
   }
   req.body=JSON.parse(text);
  }
  await handler(req,res);
 }catch(error){
  if(!res.headersSent){res.statusCode=500;res.end(JSON.stringify({error:'Local HTTP harness: '+error.message}))}
 }
});
const listen=()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const close=()=>new Promise(resolve=>server.close(resolve));
let ipN=0,assertions=0,scenarios=0;
const address=()=>{const x=ipN++;return '127.88.'+Math.floor(x/230)%230+'.'+(x%230+10)};
const hash=x=>createHash('sha256').update(x).digest('hex');
async function post(action,payload={},ip=address()){
 const body=JSON.stringify({action,...payload});
 const result=await new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,
   localAddress:ip,method:'POST',path:'/api/game',
   headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},
   res=>{
    let text='';res.on('data',chunk=>{text+=chunk;if(text.length>180000)req.destroy(Error('Excess response'))});
    res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text)})}catch(e){reject(Error('Invalid API JSON: '+text.slice(0,300)))}})
   });
  req.on('error',reject);req.setTimeout(12000,()=>req.destroy(Error('HTTP request timeout')));
  req.end(body);
 });
 return result;
}
const checked=async(action,payload,status=200,ip)=>{
 const out=await post(action,payload,ip);
 assert.equal(out.status,status,action+' HTTP expected '+status+' received '+out.status+' '+JSON.stringify(out.body).slice(0,460));
 assertions++;return out.body;
};
const auth=(room,i=0)=>({code:room.code,token:room.members[i].token});
async function row(code){
 const [r]=await sql.unsafe("SELECT id,code,status,state,theme_id,player_count,host_seat,presence_version,reveal_until FROM deckverse.rooms WHERE code=$1",[code]);
 assert.ok(r,'Missing persisted room');return r;
}
async function tokens(code){
 return (await sql.unsafe("SELECT seat,token_hash,active,left_at FROM deckverse.players WHERE room_id=(SELECT id FROM deckverse.rooms WHERE code=$1) ORDER BY seat",[code]))
  .map(p=>({seat:p.seat,hash:p.token_hash.trim(),active:p.active,leftAt:p.left_at}));
}
async function create(n,theme,{implicitPokemon=false}={}){
 const payload={name:'QA Round5 Host',mode:'same',playerCount:n};
 if(!implicitPokemon)payload.themeId=theme;
 const first=await checked('create',payload);
 assert.equal(first.room.themeId,theme);
 assert.equal(first.room.playerCount,n);
 assert.equal(first.me.index,0);
 assert.equal(first.game,null);
 const room={code:first.room.code,theme,n,members:[{token:first.token,seat:0}]};
 assert.match(first.token,/^[a-f0-9]{64}$/);
 assert.equal((await row(room.code)).theme_id,theme);
 return room;
}
async function join(room,name,seatHint){
 const r=await checked('join',{code:room.code,name,themeId:room.theme});
 assert.ok(!room.members.some(m=>m.seat===r.me.index));
 room.members[r.me.index]={token:r.token,seat:r.me.index};
 if(seatHint!==undefined)assert.equal(r.me.index,seatHint);
 assert.equal(r.room.themeId,room.theme);
 return r;
}
async function inspect(room){
 const r=await row(room.code);
 const s=r.state;
 assert.equal(r.theme_id,room.theme);
 assert.equal(r.player_count,room.n);
 assert.equal(validateServerThemeMatch(s,room.theme),true);
 const actual=[...s.players.flatMap(p=>p.deck),...s.pot];
 assert.equal(actual.length,room.n===2?50:room.n*20);
 assert.equal(new Set(actual).size,actual.length);
 assert.deepEqual([...actual].sort((a,b)=>a-b),[...getServerManifest(room.theme,room.n)].sort((a,b)=>a-b));
 for(let i=0;i<room.n;i++){
  const view=await checked('get',auth(room,i));
  assert.equal(view.room.themeId,room.theme);
  assert.equal(view.game?.topCard?.id,s.players[i].deck[0]);
  assert.equal(view.game.round,s.round);
  assert.equal(view.game.players,undefined);
  assert.ok(!JSON.stringify(view).includes('"token_hash"'));
  assert.ok(!JSON.stringify(view.game).includes('"deck":'));
  assert.equal(view.game.counts.reduce((a,b)=>a+b,0)+view.game.pot,s.total);
 }
 assertions++;
 return r;
}
async function runOne(theme,n){
 const room=await create(n,theme,{implicitPokemon:theme==='pokemon'&&n===2});
 await checked('join',{code:room.code,name:'Bad Theme',themeId:theme==='pokemon'?'avengers':'pokemon'},409);
 for(let i=1;i<n;i++)await join(room,'QA Guest '+i,i);
 if(theme==='pokemon'&&n===2){
  await checked('join',{code:room.code,name:'Invalid Ghost',themeId:'pokemon'},400);
 }
 await checked('start',auth(room),400);
 for(let i=1;i<n;i++)await checked('ready',{...auth(room,i),ready:true});
 const outcomes=await Promise.all([
  post('start',auth(room)),post('start',auth(room))
 ]);
 assert.deepEqual(outcomes.map(x=>x.status).sort((a,b)=>a-b),[200,400],'Concurrent start must serialize');
 const started=outcomes.find(x=>x.status===200).body;
 assert.equal(started.game.matchNumber,1);
 assert.equal(started.game.round,0);
 assert.deepEqual(started.game.counts,Array(n).fill(n===2?25:20));
 const preTokens=await tokens(room.code),roomId=(await row(room.code)).id;
 for(let i=0;i<n;i++)assert.equal(preTokens[i].hash,hash(room.members[i].token));
 await inspect(room);
 const state=(await row(room.code)).state,chooser=state.chooser;
 const outputs=await Promise.all([post('select',{...auth(room,chooser),stat:'rank',expectedRound:0}),
    post('select',{...auth(room,chooser),stat:'rank',expectedRound:0})]);
 assert.deepEqual(outputs.map(x=>x.status).sort((a,b)=>a-b),[200,409],
  'Concurrent same-round turn must resolve exactly once: '+JSON.stringify(outputs.map(o=>o.status)));
 assert.equal((await inspect(room)).state.round,1);
 await checked('heartbeat',{...auth(room,0),themeId:theme==='pokemon'?'fantasy':'pokemon'},409);
 // Fixture-only near-terminal deck, then real API rank resolution and real rematch.
 const before=await row(room.code),s=before.state;
 const manifest=[...getServerManifest(theme,n)].sort((a,b)=>getServerCard(theme,a).stats.rank-getServerCard(theme,b).stats.rank);
 const best=manifest[0],worst=manifest.at(-1);
 s.players=s.players.map((p,i)=>({...p,deck:i===0?[best]:i===1?[worst]:[]}));
 s.pot=manifest.filter(id=>id!==best&&id!==worst);
 s.chooser=0;s.consecutiveTies=0;s.round=Math.max(1,s.round);
 s.status='playing';s.winner=null;s.last=null;
 s.revealPolicy={mode:'auto',seconds:2};
 assert.equal(validateServerThemeMatch(s,theme),true);
 await sql.unsafe("UPDATE deckverse.rooms SET state=$1::jsonb, reveal_until=NULL, reveal_acks='[]'::jsonb, reveal_mode='auto' WHERE code=$2",[s,room.code]);
 const won=await checked('select',{...auth(room,0),stat:'rank',expectedRound:s.round});
 assert.equal(won.room.status,'finished','Fixture-assisted game must finish through actual API');
 const final=await row(room.code);
 assert.equal(final.state.winner,0);
 assert.equal(final.theme_id,theme);
 await checked('rematch',{...auth(room,0),themeId:theme==='pokemon'?'dc':'pokemon',expectedMatchNumber:1},409);
 const replies=await Promise.all(room.members.map((_,i)=>post('rematch',{...auth(room,i),expectedMatchNumber:1})));
 assert.ok(replies.every(x=>x.status===200),'Distinct rematch votes failed: '+JSON.stringify(replies.map(x=>({status:x.status,error:x.body.error}))));
 const after=await inspect(room);
 assert.equal(after.state.matchNumber,2);
 assert.equal(after.state.round,0);
 assert.equal(after.theme_id,theme);
 assert.equal(after.id,roomId);
 assert.deepEqual(await tokens(room.code),preTokens,'Session tokens or active seats changed during rematch');
 await assert.rejects(()=>sql.unsafe('UPDATE deckverse.rooms SET theme_id=$1 WHERE code=$2',[theme==='pokemon'?'dc':'pokemon',room.code]),
    e=>{assert.equal(e.code,'23514');return true});
 scenarios++;
 console.log('ROUND5_THEME_HTTP_PASS theme='+theme+' seats='+n+' id='+roomId+' create/join/start/select/reveal/finish/rematch/auth/immutable');
}
async function concurrentJoins(){
 const room=await create(4,'fantasy');
 await join(room,'Bounded Guest 1',1);
 await join(room,'Bounded Guest 2',2);
 const results=await Promise.all(Array.from({length:7},(_,i)=>post('join',{code:room.code,themeId:'fantasy',name:'Racing Guest '+i})));
 assert.equal(results.filter(x=>x.status===200).length,1,'Exactly one final seat should fill');
 assert.ok(results.filter(x=>x.status!==200).every(x=>x.status===400),'Unexpected join errors');
 const p=await tokens(room.code);
 assert.deepEqual(p.map(x=>x.seat),[0,1,2,3]);
 assert.equal(p.filter(x=>x.active).length,4);
 console.log('ROUND5_JOIN_RACE_PASS successes=1 contenders=7');
}
async function hostRecovery(){
 const room=await create(4,'avengers');
 for(let i=1;i<4;i++)await join(room,'Presence Guest '+i,i);
 const saved=await tokens(room.code);
 await sql.unsafe("UPDATE deckverse.players SET last_seen_at=clock_timestamp()-interval '150 seconds' WHERE room_id=(SELECT id FROM deckverse.rooms WHERE code=$1) AND seat=0",[room.code]);
 const outcomes=await Promise.all(Array.from({length:6},(_,j)=>post('heartbeat',auth(room,1+j%3))));
 assert.ok(outcomes.every(x=>x.status===200),'Host transfer heartbeat failures');
 let r=await row(room.code);
 assert.equal(r.host_seat,1);
 assert.equal(Number(r.presence_version),1);
 assert.equal(r.theme_id,'avengers');
 await checked('heartbeat',auth(room,0));
 r=await row(room.code);
 assert.equal(r.host_seat,1,'Late original host should not steal host role');
 assert.deepEqual(await tokens(room.code),saved,'Host transfer changed session tokens');
 await checked('leave',auth(room,0));
 await checked('heartbeat',auth(room,0),401);
 const left=(await tokens(room.code))[0];
 assert.equal(left.active,false);assert.ok(left.leftAt instanceof Date);
 const entrant=await checked('join',{code:room.code,themeId:'avengers',name:'Rejoin Replacement'});
 assert.equal(entrant.me.index,0);
 assert.notEqual(hash(entrant.token),saved[0].hash);
 const updated=(await tokens(room.code))[0];
 assert.equal(updated.leftAt,null);assert.equal(updated.active,true);
 assert.equal((await row(room.code)).theme_id,'avengers');
 console.log('ROUND5_HOST_RECOVERY_PASS persistedHost=1 oldTokenRevoked=true rejoinSeat=0');
}
async function legacy(){
 const code='ABC123',token0='a'.repeat(64),token1='b'.repeat(64);
 const old=await row(code),oldTokens=await tokens(code);
 assert.equal(old.theme_id,'pokemon');assert.equal(old.status,'playing');
 assert.equal(old.state.matchNumber,1);
 const v0=await checked('get',{code,token:token0});
 const v1=await checked('get',{code,token:token1});
 assert.equal(v0.room.themeId,'pokemon');assert.equal(v1.room.themeId,'pokemon');
 assert.notEqual(v0.game.topCard.id,v1.game.topCard.id);
 assert.ok(!JSON.stringify(v0).includes('"deck":'));
 await checked('heartbeat',{code,token:token0,themeId:'dc'},409);
 const choose=await checked('select',{code,token:token0,stat:'rank',expectedRound:0});
 assert.equal(choose.game.round,1);
 assert.equal((await row(code)).theme_id,'pokemon');
 assert.deepEqual(await tokens(code),oldTokens,'Legacy sessions modified by ordinary gameplay');
 console.log('ROUND5_LEGACY_POKEMON_PASS unchangedRoomTheme=1 activeLegacySessions=2 cardsPreserved');
}
try{
 await listen();
 const v=(await sql.unsafe('SHOW server_version_num'))[0].server_version_num;
 assert.equal(Number(v),170006,'PG17.6-only e2e test');
 const direct=postgres(APP,{ssl:'require',max:1,prepare:false,connect_timeout:4});
 try{
  const v1=(await sql.unsafe("SELECT state FROM deckverse.rooms WHERE code='ABC123'"))[0].state;
  const view=themeViewFor(v1,0,{roomThemeId:'pokemon'});
  assert.ok(view.topCard,'Stored legacy 2P state must be directly readable');
  console.log('ROUND5_LEGACY_VIEW_PREFLIGHT_PASS');
  const roleResult=(await direct.unsafe("SELECT current_user AS role"))[0];
  assert.equal(roleResult.role,'deckverse_app');
  const hits=await consumeQuota(direct,{scope:'game-read-1m',subject:'ip:127.88.0.1',max:1200,seconds:60});
  assert.equal(hits.hits,1);
  console.log('ROUND5_APP_LIMITER_PREFLIGHT_PASS');
  const joined=await direct.unsafe("SELECT r.id,p.seat FROM deckverse.rooms r JOIN deckverse.players p ON p.room_id=r.id AND p.active=true WHERE r.code='ABC123' AND r.expires_at>clock_timestamp()");
  assert.equal(joined.length,2);
  console.log('ROUND5_APP_ROOM_JOIN_PREFLIGHT_PASS');
 }finally{await direct.end({timeout:5})}
 const role=await post('get',{code:'ABC123',token:'a'.repeat(64)});
 assert.equal(role.status,200,'API must connect with limited deckverse_app role');
 await legacy();
 for(const theme of ALLOWED_THEME_IDS)
  for(const n of [2,3,4])await runOne(theme,n);
 await checked('create',{name:'Wrong Theme',mode:'same',playerCount:2,themeId:'POKEMON'},400);
 await checked('create',{name:'Untrusted Cards',mode:'same',playerCount:2,themeId:'fantasy',deckOrder:[1,2,3]},400);
 await concurrentJoins();
 await hostRecovery();
 console.log('ROUND5_E2E_SUCCESS',JSON.stringify({pgVersion:v,themeCount:ALLOWED_THEME_IDS.length,combinations:scenarios,
  assertions,legacyPokemon:true,concurrency:true,hostRecovery:true,sessionPreservation:true,
  realHttp:true,realPostgreSQL:true,fixtureAssistedFinish:true}));
}finally{
 await close();
 await sql.end({timeout:5});
}
