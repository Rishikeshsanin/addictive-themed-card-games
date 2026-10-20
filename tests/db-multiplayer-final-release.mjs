/**
 * Final integrated-candidate stress: REAL loopback HTTP -> unmodified api/game.js ->
 * disposable PostgreSQL 16; no mocked API or remote service.
 *
 * The existing db-multiplayer-check workflow provisions a fictional pre-V2 room and
 * applies migrations 004/005/006 before calling this file from db-multiplayer-browser.
 * HTTP uses distinct 127/8 loopback source addresses for accelerated games so the
 * independently tested per-IP rate limiter does not make long simulations invalid.
 * NEVER run with a real Supabase URL, password or database.
 */
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import fs from 'node:fs/promises';
import postgres from 'postgres';
import {performance} from 'node:perf_hooks';
import {DECKS,STAT_FIELDS,card} from '../src/catalog.js';
import {validate} from '../src/engine.js';
import {validateMulti} from '../src/multi-engine.js';

const service=process.env.DECKVERSE_DATABASE_URL||'';
const fixtureUrl=process.env.DB_MULTIPLAYER_FIXTURE_URL||'';
function requireDisposable(raw,user){
 const u=new URL(raw);
 assert.equal(u.protocol,'postgres:');
 assert.equal(u.hostname,'127.0.0.1','Database must be loopback');
 assert.equal(u.port,'5432','Dedicated disposable test port only');
 assert.equal(u.pathname,'/deckverse_ci','Database must be disposable');
 assert.equal(decodeURIComponent(u.username),user,'Restricted fictional test role only');
 assert.equal(u.searchParams.get('sslmode'),'require','Test TLS required');
}
assert.equal(process.env.DB_MULTIPLAYER_TEST_ONLY,'1','Explicit disposable database opt-in required');
requireDisposable(service,'deckverse_app');
requireDisposable(fixtureUrl,'deckverse_ci_fixture');

const {default:handler}=await import('../api/game.js');
const sql=postgres(fixtureUrl,{ssl:'require',prepare:false,max:5});
let web,peer=0;
const sample=Object.create(null),events=[],cases=[];
const ip=()=>{const n=peer++;return `127.9.${Math.floor(n/240)%240}.${n%240+10}`};
const latency=(name,ms)=>{(sample[name]??=[]).push(Number(ms.toFixed(2)))};
const assertStatus=(out,status,label)=>assert.equal(out.status,status,`${label}: expected ${status}, received ${out.status}: ${JSON.stringify(out.body).slice(0,350)}`);
async function call(action,body={},source=ip()){
 const payload=JSON.stringify({action,...body});
 const start=performance.now();
 const outcome=await new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:4186,method:'POST',path:'/api/game',
   localAddress:source,headers:{'content-type':'application/json','content-length':Buffer.byteLength(payload)}},
   res=>{let text='';res.on('data',b=>{text+=b;if(text.length>250000)req.destroy(Error('Overlong API response'))});
    res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text)})}catch(e){reject(Error('Bad JSON response '+text.slice(0,150)))}})});
  req.on('error',reject);req.end(payload);
 });
 latency(action,performance.now()-start);
 return outcome;
}
async function ok(action,body,source){const r=await call(action,body,source);assertStatus(r,200,action);return r.body}
async function fail(action,body,status,source){const r=await call(action,body,source);assertStatus(r,status,action);return r.body}
async function row(code){const [x]=await sql`select id,code,player_count,status,state,host_seat,presence_version,reveal_until,expires_at from deckverse.rooms where code=${code}`;assert.ok(x);return x}
const login=(room,seat=0)=>({code:room.code,token:room.players[seat].token});
async function create(n){
 const first=await ok('create',{name:'Final Host '+n,mode:'same',playerCount:n});
 const room={code:first.room.code,n,players:[{seat:0,token:first.token}]};
 return room;
}
async function fill(room){
 for(let i=1;i<room.n;i++){
  const v=await ok('join',{code:room.code,name:'Final Guest '+i,mode:'same'});
  assert.equal(v.me.index,i);
  room.players.push({seat:i,token:v.token});
 }
}
async function start(room){
 for(let i=1;i<room.n;i++)await ok('ready',{...login(room,i),ready:true});
 const x=await ok('start',login(room));
 assert.equal(x.game.round,0);
 assert.equal(x.game.matchNumber,1);
 assert.deepEqual(x.game.counts,Array(room.n).fill(room.n===2?25:20));
 return x;
}
function conserved(state,n){
 const ids=[...state.players.flatMap(p=>p.deck),...state.pot];
 assert.equal(ids.length, n===2?50:n*20,'Cards must not be lost');
 assert.equal(new Set(ids).size,ids.length,'Card IDs must be unique');
 assert.deepEqual([...ids].sort((a,b)=>a-b),[...DECKS[n]].sort((a,b)=>a-b));
 if(n===2)validate(state);else validateMulti(state);
}
async function visible(room,state){
 const views=await Promise.all(room.players.map((p,i)=>ok('get',login(room,i))));
 for(const [i,v] of views.entries()){
  assert.equal(v.game.round,state.round);
  assert.equal(v.game.counts[i],state.players[i].deck.length);
  assert.equal(v.game.topCard?.id,state.players[i].deck[0]);
  assert.equal(v.game.winner,state.winner);
  assert.ok(!JSON.stringify(v.game).includes('"deck"'),'Never reveal opponents future deck');
  assert.ok(!JSON.stringify(v).includes('"token_hash"'),'No hashed credentials in snapshots');
  assert.equal(v.room.status,state.status==='playing'?'playing':'finished');
  if(state.last)assert.deepEqual(v.game.last.cards,views[0].game.last.cards,'Played cards differ by viewer');
 }
}
function chooseStat(id){
 const vals=DECKS[4].map(card);
 const mine=card(id);
 const rank=STAT_FIELDS.map(s=>{
  const wins=vals.reduce((v,c)=>v+((s.direction==='min'?mine[s.key]<c[s.key]:mine[s.key]>c[s.key])?1:0),0);
  return {key:s.key,wins};
 }).sort((a,b)=>b.wins-a.wins);
 return rank[0].key;
}
async function bypassReveal(room){
 const r=await row(room.code);
 await sql`update deckverse.rooms set reveal_until=now()-interval '1 second' where id=${r.id}`;
}
async function fastMatch(room,{epoch,limit=3000}){
 let observed=0;
 for(let k=0;k<limit;k++){
  const before=(await row(room.code)).state;
  conserved(before,room.n);
  assert.equal(before.matchNumber,epoch);
  if(before.status==='finished')break;
  if(k>0)await bypassReveal(room);
  const actor=before.chooser, top=before.players[actor].deck[0];
  assert.ok(top,'No chooser top card');
  const stat=chooseStat(top);
  const alive=before.players.map((p,i)=>p.deck.length?{seat:i,value:card(p.deck[0])[stat]}:null).filter(Boolean);
  const rule=STAT_FIELDS.find(s=>s.key===stat);
  const best=rule.direction==='min'?Math.min(...alive.map(a=>a.value)):Math.max(...alive.map(a=>a.value));
  const leading=alive.filter(a=>a.value===best);
  const response=await ok('select',{...login(room,actor),expectedRound:before.round,stat});
  const after=(await row(room.code)).state;
  assert.equal(after.round,before.round+1);
  assert.equal(response.game.round,after.round);
  if(leading.length===1)assert.equal(after.last.winner,leading[0].seat,'Incorrect comparison winner');
  conserved(after,room.n);
  if(k%25===0)await visible(room,after);
  // Every participant periodically refreshes an authenticated heartbeat.
  if(k%45===0)await Promise.all(room.players.map((p,i)=>ok('heartbeat',login(room,i))));
  observed++;
  if(after.status==='finished')break;
 }
 const ended=(await row(room.code)).state;
 assert.equal(ended.status,'finished',`${room.n}P match epoch ${epoch} exceeded round cap`);
 assert.equal(ended.winner>=0&&ended.winner<room.n,true);
 assert.equal(ended.players[ended.winner].deck.length,room.n===2?50:room.n*20);
 assert.equal(ended.pot.length,0);
 await visible(room,ended);
 events.push({case:'complete-match',players:room.n,epoch,rounds:observed});
 return ended;
}
async function rematch(room,epoch,prior){
 // Two identical votes cannot replace a second distinct player's agreement.
 await ok('rematch',{...login(room),expectedMatchNumber:epoch});
 await ok('rematch',{...login(room),expectedMatchNumber:epoch});
 assert.equal((await row(room.code)).status,'finished','Duplicate vote started rematch');
 const responses=await Promise.all(room.players.slice(1).map((_,index)=>
  call('rematch',{...login(room,index+1),expectedMatchNumber:epoch})));
 for(const r of responses)assertStatus(r,200,'unanimous consent');
 const now=await row(room.code);
 assert.equal(now.status,'playing');
 assert.equal(now.state.matchNumber,epoch+1);
 assert.equal(now.state.round,0);assert.equal(now.state.pot.length,0);
 assert.deepEqual(now.state.players.map(p=>p.deck.length),Array(room.n).fill(room.n===2?25:20));
 assert.notDeepEqual(now.state.players.map(p=>p.deck),prior.players.map(p=>p.deck),'New match did not reshuffle');
 await fail('rematch',{...login(room),expectedMatchNumber:epoch},409);
 const seats=await sql`select seat from deckverse.players where room_id=${now.id} and active=true order by seat`;
 assert.deepEqual(seats.map(p=>p.seat),Array.from({length:room.n},(_,i)=>i));
 conserved(now.state,room.n);
 events.push({case:'unanimous-rematch',players:room.n,epoch:epoch+1});
}
async function stress(){
 for(const n of [2,3,4]){
  const room=await create(n);await fill(room);await start(room);
  const savedRoom=(await row(room.code)).id;
  for(let epoch=1;epoch<=2;epoch++){
   const complete=await fastMatch(room,{epoch});
   if(epoch===1)await rematch(room,epoch,complete);
  }
  assert.equal((await row(room.code)).id,savedRoom,'Rematches created another room');
  cases.push(`${n}P twice-completed over HTTP + unanimous fresh rematch`);
  console.log('PASS final SQL+HTTP '+n+'P 2 full matches, conservation/privacy/rematches');
 }
}
async function capacityRace(){
 const r=await create(4);
 const results=await Promise.all(Array.from({length:7},(_,i)=>call('join',{code:r.code,name:'Concurrent '+i,mode:'same'})));
 assert.equal(results.filter(x=>x.status===200).length,3,'Capacity race accepted too many participants');
 assert.equal(results.filter(x=>x.status===400).length,4);
 const stored=await row(r.code);
 const seats=await sql`select seat from deckverse.players where room_id=${stored.id} and active=true order by seat`;
 assert.deepEqual(seats.map(x=>x.seat),[0,1,2,3]);
 cases.push('7 concurrent joins / 3 seats: only 3 committed');
}
async function hostRecovery(){
 const r=await create(3);await fill(r);await start(r);
 const s=await row(r.code),initial=JSON.stringify(s.state);
 // Only the timestamp is changed through a fictional admin fixture. The host
 // transfer and pause/resume must occur through genuine authenticated POSTs.
 await sql`update deckverse.players set last_seen_at=now()-interval '7 minutes'
   where room_id=${s.id} and seat=0`;
 const active=await ok('heartbeat',login(r,1));
 assert.equal(active.room.hostSeat,1,'Did not transfer to online clockwise guest');
 assert.equal(active.room.paused,true,'Game must pause while host disconnected');
 const moved=await row(r.code);
 assert.equal(moved.host_seat,1);
 assert.equal(moved.presence_version>0,true);
 assert.equal(JSON.stringify(moved.state),initial,'Host transfer mutated cards');
 await fail('select',{...login(r,1),stat:'rank',expectedRound:moved.state.round},409);
 // Reconnect with original token; player membership and cards must be preserved.
 const back=await ok('heartbeat',login(r,0));
 await fail('settings',{...login(r),mode:'auto',seconds:3},403);
 await ok('settings',{...login(r,1),mode:'auto',seconds:3});
 assert.equal(back.room.hostSeat,1);
 assert.equal(back.room.paused,false);
 assert.equal(JSON.stringify((await row(r.code)).state),initial);
 await ok('select',{...login(r,moved.state.chooser),stat:'rank',expectedRound:moved.state.round});
 assert.equal((await row(r.code)).state.round,moved.state.round+1);
 cases.push('3P stale host: pause, transfer, reconnect, same room/card state');
}
async function concurrentTurn(){
 const r=await create(4);await fill(r);await start(r);
 const before=await row(r.code);
 const b={...login(r,before.state.chooser),expectedRound:0,stat:'rank'};
 const results=await Promise.all(Array.from({length:12},()=>call('select',b)));
 assert.equal(results.filter(x=>x.status===200).length,1,'Duplicate concurrent turns committed');
 assert.equal(results.filter(x=>x.status===409).length,11,'Stale identical turns not rejected');
 assert.equal((await row(r.code)).state.round,1);
 conserved((await row(r.code)).state,4);
 // All seats see identical last-round cards after the conflicting requests.
 await visible(r,(await row(r.code)).state);
 cases.push('4P 12 concurrent same-round requests: one winner, 11 rejected');
}
async function migrationParity(){
 const [p]=await sql`select ssl from pg_stat_ssl where pid=pg_backend_pid()`;
 assert.equal(p.ssl,true);
 const [legacy]=await sql`select id,player_count,host_seat,presence_version,status from deckverse.rooms where code='LEGACY'`;
 assert.equal(legacy.player_count,2);
 assert.equal(legacy.host_seat,0);
 assert.equal(Number(legacy.presence_version),0);
 assert.equal(legacy.status,'lobby');
 const [original]=await sql`select seat,name,ready,left_at from deckverse.players where room_id=${legacy.id}`;
 assert.equal(original.seat,0);assert.equal(original.name,'Legacy fixture');
 assert.equal(original.ready,true);assert.equal(original.left_at,null);
 const [constraints]=await sql`select pg_get_constraintdef(oid) as definition from pg_constraint
  where conrelid='deckverse.players'::regclass and conname='players_seat_check'`;
 assert.match(constraints.definition,/3/);
 const policies=await sql`select tablename,policyname from pg_policies where schemaname='deckverse'`;
 assert.ok(policies.some(p=>p.tablename==='rate_limit_counters'));
 const tables=await sql`select relname,relrowsecurity,relforcerowsecurity from pg_class
  where relnamespace='deckverse'::regnamespace and relkind='r'`;
 for(const name of ['rooms','players','rate_limit_counters']){
  const t=tables.find(t=>t.relname===name);assert.ok(t);
  assert.equal(t.relrowsecurity,true,`RLS missing ${name}`);
  assert.equal(t.relforcerowsecurity,true,`FORCE RLS missing ${name}`);
 }
 const columns=await sql`select table_name,column_name from information_schema.columns
  where table_schema='deckverse'`;
 for(const key of ['rooms:player_count','rooms:host_seat','rooms:presence_version',
  'players:left_at','rate_limit_counters:key_hash']){
  assert.ok(columns.some(c=>c.table_name+':'+c.column_name===key),'Missing migrated column '+key);
 }
 cases.push('Legacy 2P preservation + 004/005/006 columns, seat expansion and RLS');
}
function stats(arr){
 const sorted=[...arr].sort((a,b)=>a-b);
 return {count:arr.length,p50:sorted[Math.floor((arr.length-1)*.5)],
  p95:sorted[Math.floor((arr.length-1)*.95)],max:sorted.at(-1)};
}
try{
 web=createServer(async(req,res)=>{
  res.status=n=>{res.statusCode=n;return res};
  res.json=v=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(v))};
  try{
   if(req.url!=='/api/game'||req.method!=='POST'){res.writeHead(404);res.end();return}
   let b='';for await(const chunk of req){b+=chunk;if(b.length>8000)throw Error('Excessive body')}
   req.body=JSON.parse(b);
   await handler(req,res);
  }catch(e){res.writeHead(500);res.end(JSON.stringify({error:'Local test server error'}))}
 });
 await new Promise((resolve,reject)=>{web.once('error',reject);web.listen(4186,'127.0.0.1',resolve)});
 await migrationParity();
 await capacityRace();
 await concurrentTurn();
 await hostRecovery();
 await stress();
 const summary={classification:'REAL localhost HTTP + disposable PostgreSQL 16; NOT production',
  cases,matchEvidence:events,
  latencyMs:Object.fromEntries(Object.entries(sample).map(([k,v])=>[k,stats(v)])),
  totalCalls:Object.values(sample).reduce((a,x)=>a+x.length,0)};
 // Preserve the earlier detailed transactional latency report in the existing CI artifact.
 const earlier=JSON.parse(await fs.readFile('/tmp/deckverse-db-multiplayer-results.json','utf8'));
 await fs.writeFile('/tmp/deckverse-db-multiplayer-results.json',
  JSON.stringify({...earlier,finalRelease:summary},null,2));
 console.log('PASS FINAL RELEASE MULTIPLAYER QA '+JSON.stringify(summary));
}catch(e){
 console.error('FAIL FINAL RELEASE MULTIPLAYER QA '+(e.stack||String(e)));
 process.exitCode=1;
}finally{
 if(web)await new Promise(resolve=>web.close(resolve));
 await sql.end({timeout:5});
}
