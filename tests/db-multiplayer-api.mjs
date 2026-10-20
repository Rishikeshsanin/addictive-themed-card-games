/**
 * DeckVerse V2 real API -> postgres transaction tests.
 * Strictly isolated disposable PostgreSQL, with SQL fixtures limited to deckverse.
 * No Hub / production network requests, no production migrations or secrets.
 * Server POSTs execute api/game.js UNMODIFIED, including authentication/rate limits/room locks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import postgres from 'postgres';
import {DECKS,card,STAT_FIELDS} from '../src/catalog.js';
import {validateMulti} from '../src/multi-engine.js';
import {validate} from '../src/engine.js';

const URL=process.env.DECKVERSE_DATABASE_URL||'';
const FIXTURE=process.env.DB_MULTIPLAYER_FIXTURE_URL||'';
if(process.env.DB_MULTIPLAYER_TEST_ONLY!=='1'||!URL.includes('@127.0.0.1:5432/deckverse_ci')||
   !FIXTURE.includes('@127.0.0.1:5432/deckverse_ci'))
 throw Error('REFUSING execution: disposable loopback deckverse_ci PostgreSQL only');
const {default:handler}=await import('../api/game.js');
const fixture=postgres(FIXTURE,{ssl:'require',max:5,prepare:false});
const records=Object.create(null),errors=[];
let clientNumber=10;
const newIP=()=>{const n=clientNumber++;return '198.18.'+Math.floor(n/240)+'.'+(n%240+1)};
function record(name,ms){(records[name]??=[]).push(Math.round(ms*10)/10)}
async function invoke(action,data={},ip=newIP()){
 const req={method:'POST',url:'/api/game',headers:{},socket:{remoteAddress:ip},body:{action,...data}};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
  status(n){this.statusCode=n;return this},json(value){this.value=value;return this}};
 const before=performance.now();
 await handler(req,res);
 record(action,performance.now()-before);
 return {status:res.statusCode,...res.value};
}
const good=async(action,data,ip)=>{
 const result=await invoke(action,data,ip);
 assert.equal(result.status,200,action+' failed: '+JSON.stringify(result));
 return result;
};
const rejected=async(action,data,ip,code=409)=>{
 const result=await invoke(action,data,ip);
 assert.equal(result.status,code,action+' unexpectedly accepted: '+JSON.stringify(result));
 return result;
};
async function createRoom(n,{manual=false,defaultCount=false}={}){
 const ip=newIP();
 const host=await good('create',{name:'QA Host '+n,mode:'same',...(defaultCount?{}:{playerCount:n})},ip);
 assert.equal(host.room.playerCount,n);
 if(manual)await good('settings',{code:host.room.code,token:host.token,mode:'manual',seconds:2},ip);
 return {code:host.room.code,n,members:[{seat:0,token:host.token,ip}],host};
}
async function fillRoom(r){
 for(let i=1;i<r.n;i++){
  const ip=newIP();
  const data=await good('join',{code:r.code,name:'QA Guest '+i,mode:'same'},ip);
  assert.equal(data.me.index,i);
  r.members.push({seat:i,token:data.token,ip});
 }
}
const auth=(r,seat=0)=>({code:r.code,token:r.members[seat].token});
async function readyAndStart(r){
 await rejected('start',auth(r),r.members[0].ip,400);
 for(let i=1;i<r.n;i++)await good('ready',{...auth(r,i),ready:true},r.members[i].ip);
 const initial=await good('get',auth(r),r.members[0].ip);
 assert.equal(initial.players.length,r.n);assert.ok(initial.players.every(p=>p.ready));
 const result=await Promise.all([invoke('start',auth(r),r.members[0].ip),invoke('start',auth(r),r.members[0].ip)]);
 assert.deepEqual(result.map(x=>x.status).sort(),[200,400],'Start must be row-locked and only happen once');
 const started=result.find(x=>x.status===200);
 assert.equal(started.game.round,0);assert.equal(started.game.matchNumber,1);
 return started;
}
async function row(r){const [data]=await fixture`select id,status,state,player_count,reveal_acks,reveal_until from deckverse.rooms where code=${r.code}`;assert.ok(data);return data}
async function inspect(r){
 const stored=await row(r),state=stored.state;
 assert.equal(stored.player_count,r.n);
 assert.equal(state.total,r.n===2?50:r.n*20);
 if(r.n===2)validate(state);else validateMulti(state);
 const dealt=[...state.players.flatMap(p=>p.deck),...state.pot];
 assert.equal(dealt.length,state.total);
 assert.equal(new Set(dealt).size,dealt.length);
 assert.deepEqual([...dealt].sort((a,b)=>a-b),[...DECKS[r.n]].sort((a,b)=>a-b));
 const views=await Promise.all(r.members.map(m=>good('get',auth(r,m.seat),m.ip)));
 for(const [seat,v] of views.entries()){
  assert.equal(v.room.status,stored.status);
  assert.equal(v.game.round,state.round);
  assert.equal(v.game.counts.length,r.n);
  assert.equal(v.game.counts[seat],state.players[seat].deck.length);
  assert.equal(v.game.topCard?.id,state.players[seat].deck[0]??undefined);
  assert.equal(v.game.players,undefined);
  assert.equal(v.game.pot,state.pot.length);
  assert.equal(v.game.chooser,state.chooser);
  assert.ok(!JSON.stringify(v.game).includes('"deck"'),'Never return full deck data');
  if(state.last)assert.deepEqual(v.game.last.cards,views[0].game.last.cards,'all seats must see identical played cards');
  assert.ok(!('token_hash' in v.me));
  assert.ok(!('token_hash' in v.players[0]));
 }
 return {stored,state,views};
}
function statResult(state,field){
 const active=state.players.map((p,i)=>({seat:i,id:p.deck[0]})).filter(p=>p.id!==undefined);
 const scores=active.map(x=>card(x.id)[field]);
 const best=field==='rank'?Math.min(...scores):Math.max(...scores);
 const leaders=active.filter(x=>card(x.id)[field]===best);
 return {active,leaders,best};
}
async function choose(r,key,{ip=null}={}){
 const previous=(await row(r)).state;
 const actor=previous.chooser;
 const expected=statResult(previous,key);
 const reply=await good('select',{...auth(r,actor),stat:key,expectedRound:previous.round},ip||r.members[actor].ip);
 const now=(await row(r)).state;
 assert.equal(now.round,previous.round+1);
 assert.equal(now.last.stat,key);
 assert.deepEqual(now.last.cards.map((x,i)=>typeof x==='number'?i:x.seat),expected.active.map(x=>x.seat));
 // 2P engine uses winner indices, 3P uses objects; all must follow eight-stat rule.
 if(expected.leaders.length===1)assert.equal(now.last.winner,expected.leaders[0].seat);
 else assert.ok(['tie','sudden-death','last-standing'].includes(now.last.kind));
 assert.equal(reply.game.round,now.round);
 await inspect(r);
 return now;
}
async function fastForward(r){
 // Legitimate fixture-only DB time travel after the deadline has already been tested once.
 const stored=await row(r);
 await fixture`update deckverse.rooms set reveal_until=now()-interval '1 second' where id=${stored.id}`;
}
async function fixtureHeads(r,heads,field){
 const saved=await row(r),s=saved.state;
 assert.equal(heads.length,r.n);
 const all=s.players.flatMap(p=>p.deck),potted=s.pot;
 const used=new Set(heads.filter(x=>x!==null));
 assert.equal(used.size,heads.filter(x=>x!==null).length);
 const rest=all.filter(id=>!used.has(id));
 let cursor=0;
 for(let i=0;i<r.n;i++){
  const size=s.players[i].deck.length;
  if(size===0){assert.equal(heads[i],null);continue}
  s.players[i].deck=[heads[i],...rest.slice(cursor,cursor+size-1)];
  cursor+=size-1;
 }
 assert.equal(cursor,rest.length);s.last=null;s.revealPolicy={mode:'auto',seconds:2};
 if(r.n===2)validate(s);else validateMulti(s);
 await fixture`update deckverse.rooms set state=${fixture.json(s)},reveal_until=null,reveal_acks='[]'::jsonb where id=${saved.id}`;
}
function tieHand(ids,n){
 for(const stat of STAT_FIELDS.filter(x=>x.key!=='rank')){
  const byValue=new Map();
  for(const id of ids){
   const v=card(id)[stat.key];
   byValue.set(v,[...(byValue.get(v)||[]),id]);
  }
  for(const group of byValue.values()){
   if(group.length<2)continue;
   const worse=ids.filter(id=>id!==group[0]&&id!==group[1]&&
     card(id)[stat.key]<card(group[0])[stat.key]);
   if(worse.length>=n-2)return {field:stat.key,heads:[group[0],group[1],...worse.slice(0,n-2)]};
  }
 }
 throw Error('No tie hand');
}
async function forceEndgame(r){
 const saved=await row(r),s=saved.state,all=DECKS[r.n];
 const best=[...all].sort((a,b)=>card(a).rank-card(b).rank);
 const lowest=best[0],highest=best.at(-1);
 s.players.forEach((p,i)=>{p.deck=i===0?[lowest]:i===1?[highest]:[]});
 s.pot=all.filter(id=>id!==lowest&&id!==highest);
 s.round=Math.max(1,s.round);
 s.status='playing';s.winner=null;s.chooser=0;s.consecutiveTies=0;s.last=null;
 s.revealPolicy={mode:'auto',seconds:2};
 if(r.n===2)validate(s);else validateMulti(s);
 await fixture`update deckverse.rooms set state=${fixture.json(s)},status='playing',
  reveal_mode='auto',reveal_seconds=2,reveal_until=null,reveal_acks='[]'::jsonb where id=${saved.id}`;
}
async function startNewMatchRematch(r,epoch){
 const original=(await row(r)).state;
 const result=await Promise.all(r.members.map(m=>invoke('rematch',{...auth(r,m.seat),expectedMatchNumber:epoch},m.ip)));
 assert.equal(result.filter(x=>x.status===200).length,r.n,'All votes may be accepted exactly once');
 const updated=(await row(r)).state;
 assert.equal(updated.matchNumber,epoch+1);
 assert.equal(updated.round,0);assert.equal(updated.pot.length,0);
 assert.equal(updated.status,'playing');
 assert.notDeepEqual(updated.players.map(p=>p.deck),original.players.map(p=>p.deck),'Match deck should be reshuffled');
 const resultState=await inspect(r);
 assert.deepEqual(resultState.views.map(v=>v.game.rematchVotes),r.members.map(()=>[]));
 assert.equal((await fixture`select count(*)::int as n from deckverse.players where room_id=${(await row(r)).id} and active=true`)[0].n,r.n);
 return updated;
}
async function suite(n){
 const r=await createRoom(n,{defaultCount:n===2});
 await fillRoom(r);
 const started=await readyAndStart(r);
 assert.deepEqual(started.game.counts,Array(n).fill(n===2?25:20));
 await inspect(r);
 // Coordinator-owned API currently converts plain engine assertion errors to 503.
 // Log this as a deployment blocker rather than representing 503 as a valid 4xx.
 for(const payload of [
  {...auth(r,(started.game.chooser+1)%n),expectedRound:0,stat:'rank'},
  {...auth(r,started.game.chooser),expectedRound:0,stat:'not-a-stat'}]){
  const wrong=await invoke('select',payload,newIP());
  assert.ok([400,503].includes(wrong.status),'Invalid turn unexpectedly accepted: '+JSON.stringify(wrong));
  if(wrong.status===503){errors.push('COORDINATOR API: invalid actor/category returns 503 instead of 400');}
 }
 await choose(r,'rank');
 await rejected('select',{...auth(r,(await row(r)).state.chooser),expectedRound:0,stat:'rank'},r.members[0].ip);
 await rejected('select',{...auth(r,(await row(r)).state.chooser),expectedRound:1,stat:'attack'},r.members[0].ip);
 await new Promise(resolve=>setTimeout(resolve,2100));
 const afterDelay=await good('get',auth(r),r.members[0].ip);
 assert.equal(afterDelay.game.reveal.active,false,'Auto reveal must expire');
 const before=(await row(r)).state;
 const requests=await Promise.all([invoke('select',{...auth(r,before.chooser),stat:'attack',expectedRound:before.round},r.members[before.chooser].ip),
  invoke('select',{...auth(r,before.chooser),stat:'attack',expectedRound:before.round},r.members[before.chooser].ip)]);
 assert.deepEqual(requests.map(x=>x.status).sort(),[200,409],'Concurrent category presses must serialize');
 await inspect(r);
 for(const key of STAT_FIELDS.map(x=>x.key).filter(x=>x!=='rank'&&x!=='attack')){
  await fastForward(r);await choose(r,key);
 }
 if(n>2){
  await fastForward(r);
  const s=(await row(r)).state;
  const hand=tieHand(s.players.flatMap(p=>p.deck),n);
  // Only run a full N-player top-card tie while every seat still has a deck.
  if(s.players.every(p=>p.deck.length)){
   await fixtureHeads(r,hand.heads,hand.field);
   const tied=await choose(r,hand.field);
   assert.equal(tied.last.kind,'tie');assert.ok(tied.pot.length>=n);
   assert.equal(tied.consecutiveTies,1);
   await fastForward(r);
   const won=await choose(r,'rank');
   assert.equal(won.pot.length,0);
   assert.ok(won.last.awardedCount>=n*2,'Jackpot must be awarded once');
  }
 }
 // Seed deterministic legitimate near-terminal persisted state, then resolve
 // using the actual server transaction (distinct from unmodified organic play).
 await forceEndgame(r);
 const previous=await row(r),finished=await choose(r,'rank');
 assert.equal(finished.status,'finished');
 assert.equal(finished.winner,0);
 assert.equal(finished.players[0].deck.length,n===2?50:n*20);
 assert.equal((await row(r)).status,'finished');
 await rejected('rematch',{...auth(r,0),expectedMatchNumber:0},r.members[0].ip);
 const rematched=await startNewMatchRematch(r,1);
 assert.deepEqual(rematched.players.map(p=>p.deck.length),Array(n).fill(n===2?25:20));
 await rejected('rematch',{...auth(r,0),expectedMatchNumber:1},r.members[0].ip);
 await forceEndgame(r);await choose(r,'rank');
 await rejected('rematch',{...auth(r,0),expectedMatchNumber:1},r.members[0].ip);
 await startNewMatchRematch(r,2);
 console.log('PASS '+n+'P: SQL create/join/start/concurrent turns/8 stats/hidden decks/finish/epoch rematches');
}
async function manual(n){
 const r=await createRoom(n,{manual:true});await fillRoom(r);await readyAndStart(r);
 await choose(r,'rank');
 let response=await good('get',auth(r),r.members[0].ip);
 assert.equal(response.game.reveal.required,n);assert.equal(response.game.reveal.active,true);
 const round=response.game.round;
 await rejected('ack',{...auth(r),expectedRound:round-1},r.members[0].ip);
 for(let i=0;i<n-1;i++){
  await good('ack',{...auth(r,i),expectedRound:round},r.members[i].ip);
  await good('ack',{...auth(r,i),expectedRound:round},r.members[i].ip);
  const check=await good('get',auth(r),r.members[0].ip);
  assert.equal(check.game.reveal.acks.length,i+1);
  assert.equal(check.game.reveal.active,true);
 }
 await rejected('select',{...auth(r,(await row(r)).state.chooser),expectedRound:round,stat:'rank'},r.members[0].ip);
 await good('ack',{...auth(r,n-1),expectedRound:round},r.members[n-1].ip);
 response=await good('get',auth(r),r.members[0].ip);
 assert.equal(response.game.reveal.active,false);
 await choose(r,'rank');
 console.log('PASS '+n+'P: SQL manual reveal '+n+'/'+n+' acknowledgements');
}
async function joinRace(){
 const r=await createRoom(3);
 const race=await Promise.all(Array.from({length:4},(_,i)=>invoke('join',{code:r.code,name:'Race '+i,mode:'same'},newIP())));
 assert.equal(race.filter(x=>x.status===200).length,2);
 assert.equal(race.filter(x=>x.status===400).length,2);
 const rows=await fixture`select seat,name from deckverse.players where room_id=${(await row(r)).id} and active=true order by seat`;
 assert.deepEqual(rows.map(p=>p.seat),[0,1,2]);
 assert.equal(new Set(rows.map(p=>p.name)).size,3);
 console.log('PASS concurrency: four simultaneous joins produced only two seats');
}
async function forfeit(n){
 const r=await createRoom(n);await fillRoom(r);await readyAndStart(r);
 await good('leave',auth(r,1),r.members[1].ip);
 const status=await good('get',auth(r),r.members[0].ip);
 assert.equal(status.room.status,'finished');assert.equal(status.game.endReason,'forfeit');
 assert.equal(status.game.status,n===2?'finished':'aborted');
 await rejected('rematch',{...auth(r),expectedMatchNumber:1},r.members[0].ip);
 console.log('PASS '+n+'P: forfeit closes match and blocks rematch');
}
async function organic(n){
 const r=await createRoom(n);await fillRoom(r);await readyAndStart(r);
 const ids=DECKS[n],best=new Map(ids.map(id=>{
  const mine=card(id);
  const scores=STAT_FIELDS.map(rule=>({key:rule.key,score:ids.reduce((v,other)=>v+(id!==other?(mine[rule.key]===card(other)[rule.key]?0.5:(rule.direction==='min'?mine[rule.key]<card(other)[rule.key]:mine[rule.key]>card(other)[rule.key])?1:0):0),0)}));
  scores.sort((a,b)=>b.score-a.score);return [id,scores[0].key];
 }));
 let result=null;
 for(let turn=0;turn<3000;turn++){
  // Exercise the authenticated heartbeat path so long simulated matches do not
  // incorrectly trigger the real five-minute per-player presence pause.
  if(turn%20===0)for(const m of r.members)
   await good('heartbeat',auth(r,m.seat),newIP());
  const saved=await row(r),s=saved.state;
  if(s.status==='finished'){result=s;break}
  const top=s.players[s.chooser].deck[0];assert.ok(top);
  if(turn>0)await fastForward(r);
  // Each accelerated round uses a fictional socket source to isolate gameplay
  // from the separately tested, legitimate per-IP durable rate-limit budgets.
  const reply=await good('select',{...auth(r,s.chooser),stat:best.get(top),expectedRound:s.round},newIP());
  if(turn%100===0){
   const state=(await row(r)).state;
   if(n===2)validate(state);else validateMulti(state);
  }
  if(reply.game.status==='finished'){result=(await row(r)).state;break}
 }
 assert.ok(result,'DB-driven '+n+'P match did not terminate within 3000 rounds');
 assert.equal(result.players.filter(p=>p.deck.length>0).length,1);
 assert.equal(result.pot.length,0);
 assert.equal(result.players[result.winner].deck.length,n===2?50:n*20);
 console.log('PASS '+n+'P: organic API/SQL full game in '+result.round+' accelerated rounds');
}
function percentile(a,q){const x=[...a].sort((p,v)=>p-v);return x[Math.min(x.length-1,Math.floor(q*(x.length-1)))];}
try{
 const [tls]=await fixture`select ssl from pg_stat_ssl where pid=pg_backend_pid()`;
 assert.equal(tls.ssl,true,'fixture SQL must use PostgreSQL SSL');
 const [legacy]=await fixture`select player_count from deckverse.rooms where code='LEGACY'`;
 assert.equal(legacy.player_count,2,'existing 2P rows must default to two seats');
 const [seatRule]=await fixture`select pg_get_constraintdef(oid) as definition from pg_constraint
  where conrelid='deckverse.players'::regclass and conname='players_seat_check'`;
 assert.match(seatRule.definition,/3/,'004 must permit 4-player seat index 3');
 for(const n of [2,3,4])await suite(n);
 for(const n of [2,3,4])await manual(n);
 await joinRace();
 await forfeit(2);await forfeit(4);
 for(const n of [2,3,4])await organic(n);
 const summary={kind:'real-postgresql-local-ci',time:new Date().toISOString(),
  migration:'Disposable legacy fixture expanded using 004,005,006; hub.assert_app_scope is test-only stub',
  suites:'2P/3P/4P transactional API, manual/auto, tie, race, rematch, forfeit, organic completion',
  coordinatorBlockers:[...new Set(errors)],
  latencyMs:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,{calls:v.length,p50:percentile(v,0.5),p95:percentile(v,.95),max:Math.max(...v)}]))};
 await fs.writeFile('/tmp/deckverse-db-multiplayer-results.json',JSON.stringify(summary,null,2));
 console.log('DATABASE MULTIPLAYER QA PASS '+JSON.stringify(summary));
}catch(error){errors.push(error.stack||String(error));console.error('DATABASE MULTIPLAYER QA FAIL',error.stack||error);process.exitCode=1}
finally{await fixture.end({timeout:5})}
