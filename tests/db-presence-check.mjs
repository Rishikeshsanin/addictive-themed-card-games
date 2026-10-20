// DeckVerse integration against disposable PostgreSQL ONLY.
// The test deliberately imports the real API and real schema migrations.
// No cloud credentials, service-role, Supabase connection or production data are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postgres from 'postgres';
import {evaluateRoomPresence, presenceOf, retentionSeconds} from '../src/presence.js';
import {sweepExpiredRoomSessions} from '../api/game.js';

const ADMIN=process.env.PRESENCE_TEST_ADMIN_URL;
const APP=process.env.DECKVERSE_DATABASE_URL;
function guard(value) {
  if (!value || process.env.PRESENCE_TEST_DISPOSABLE !== 'yes') throw Error('Disposable database guard not enabled');
  const u=new URL(value);
  if (!['127.0.0.1','localhost'].includes(u.hostname) ||
      u.pathname !== '/deckverse_presence_ci' || !['postgresql:','postgres:'].includes(u.protocol)) {
    throw Error('Refusing a non-local / non-disposable database');
  }
}
guard(ADMIN);
guard(APP);
if (new URL(ADMIN).username!=='postgres' || new URL(APP).username!=='deckverse_app') {
  throw Error('Expected fictional test database roles');
}

const db=postgres(ADMIN,{ssl:'require',max:6,prepare:false});
const app=postgres(APP,{ssl:'require',max:4,prepare:false});
const API=(await import('../api/game.js')).default;
let ipCounter=2;
const fakeIP=()=>`127.0.0.${ipCounter++ % 245 + 2}`;
const ms= (s)=>s*1000;
function request(action, payload={}, ip=fakeIP()) {
  const req={method:'POST',url:'/api/game',headers:{},socket:{remoteAddress:ip},body:{action,...payload}};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
    status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  return API(req,res).then(()=>({status:res.statusCode,body:res.body,headers:res.headers}));
}
async function ok(action,payload) {
  const r=await request(action,payload);
  assert.equal(r.status,200,JSON.stringify({action,status:r.status,body:r.body}));
  return r.body;
}
async function rejected(action,payload,status) {
  const r=await request(action,payload);
  assert.equal(r.status,status,JSON.stringify({action,expected:status,actual:r.status,body:r.body}));
  return r.body;
}
const as=(user,extra={})=>({code:user.code,token:user.token,...extra});
async function room(count=2) {
  const first=await ok('create',{name:'Host Alpha',mode:'remote',playerCount:count});
  const users=[{code:first.room.code,token:first.token,index:0}];
  for(let i=1;i<count;i++){
    const next=await ok('join',{code:first.room.code,name:`Guest ${i}`});
    assert.equal(next.me.index,i);
    users.push({code:first.room.code,token:next.token,index:i});
  }
  return {code:first.room.code,users};
}
async function details(code){
  const [r]=await db`select id,code,status,host_seat,presence_version,expires_at,state from deckverse.rooms where code=${code}`;
  const players=await db`select seat,active,ready,token_hash,last_seen_at,left_at from deckverse.players where room_id=${r.id} order by seat`;
  return {r,players};
}
async function stale(code,seat,seconds){
  await db`update deckverse.players set last_seen_at=now() - ${seconds} * interval '1 second'
    where room_id=(select id from deckverse.rooms where code=${code}) and seat=${seat}`;
}
async function readyAndStart(users){
  for(const player of users.slice(1))await ok('ready',as(player,{ready:true}));
  const result=await ok('start',as(users[0]));
  assert.equal(result.room.status,'playing');
  assert.equal(result.game.round,0);
}
async function install() {
  // The synthetic baseline is deliberately minimum API-compatible, not a live DB snapshot.
  await db.unsafe(`
    CREATE ROLE anon NOLOGIN;\n    CREATE ROLE authenticated NOLOGIN;\n    CREATE ROLE service_role NOLOGIN;\n    CREATE ROLE deckverse_app LOGIN PASSWORD 'fictional-disposable-only';
    CREATE SCHEMA hub;
    CREATE SCHEMA deckverse;
    CREATE FUNCTION hub.assert_app_scope(slug text,schema_name text)
      RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        IF slug <> 'deckverse' OR schema_name <> 'deckverse' THEN
          RAISE EXCEPTION 'Not DeckVerse-only';
        END IF;
      END $$;
    CREATE TABLE deckverse.rooms(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code char(6) UNIQUE NOT NULL,
      mode text NOT NULL DEFAULT 'same',
      status text NOT NULL DEFAULT 'lobby',
      state jsonb,
      reveal_mode text NOT NULL DEFAULT 'auto',
      reveal_seconds integer NOT NULL DEFAULT 2,
      reveal_until timestamptz,
      reveal_acks jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT (now()+interval '3 hours')
    );
    CREATE TABLE deckverse.players(
      room_id uuid NOT NULL REFERENCES deckverse.rooms(id),
      seat smallint NOT NULL CONSTRAINT players_seat_check CHECK(seat BETWEEN 0 AND 1),
      name text NOT NULL,
      token_hash char(64) NOT NULL,
      ready boolean NOT NULL DEFAULT false,
      active boolean NOT NULL DEFAULT true,
      last_seen_at timestamptz,
      PRIMARY KEY(room_id,seat)
    );
  `).simple();
  for(const n of ['004_multiplayer_rooms.sql','005_deckverse_rate_limits.sql','006_deckverse_presence.sql','007_theme_rooms.sql']) {
    const code=readFileSync(new URL(`../migrations/${n}`,import.meta.url),'utf8');
    await db.unsafe(code).simple();
  }
  // 006 MUST be safe on a second apply in a disposable database.
  await db.unsafe(readFileSync(new URL('../migrations/006_deckverse_presence.sql',import.meta.url),'utf8')).simple();
  await db.unsafe(`
    GRANT USAGE ON SCHEMA deckverse TO deckverse_app;
    GRANT SELECT,INSERT,UPDATE,DELETE ON deckverse.rooms,deckverse.players TO deckverse_app;
    ALTER TABLE deckverse.rooms ENABLE ROW LEVEL SECURITY;
    ALTER TABLE deckverse.players ENABLE ROW LEVEL SECURITY;
    CREATE POLICY room_app_rw ON deckverse.rooms FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
    CREATE POLICY player_app_rw ON deckverse.players FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
  `).simple();
}
try {
  await install();
} catch(e) {
  console.error('Disposable schema/migration rehearsal failed:',e.message);
  await db.end({timeout:2});
  await app.end({timeout:2});
  throw e;
}
test('004-007 migrations apply in order, 006 reapplies, isolated DeckVerse schema and app role',async()=>{
  const [tables]=await db`select count(*)::int AS n from information_schema.tables
    where table_schema='deckverse' and table_name IN ('rooms','players','rate_limit_counters')`;
  assert.equal(tables.n,3);
  const columns=await db`select column_name from information_schema.columns
    where table_schema='deckverse' and table_name='rooms'`;
  for(const col of ['host_seat','presence_version'])assert.ok(columns.some(x=>x.column_name===col));
  assert.ok(columns.some(x=>x.column_name==='theme_id'));
  const [role]=await app`select current_user as role`;
  assert.equal(role.role,'deckverse_app');
  const [rls]=await db`select relrowsecurity as rls from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='deckverse' and c.relname='rate_limit_counters'`;
  assert.equal(rls.rls,true);
});
test('authenticated heartbeat uses DB time, not forged client timestamp; no duplicate seat',async()=>{
  const r=await room();
  const before=await details(r.code);
  const past=Date.now()-10*60_000;
  await stale(r.code,0,60);
  let result=await ok('heartbeat',as(r.users[0],{serverNow:new Date(past).toISOString(),
    timestamp:'1999-01-01T00:00:00Z',seat:1}));
  assert.equal(result.me.index,0);
  const after=await details(r.code);
  assert.ok(after.players[0].last_seen_at.getTime() > Date.now()-10_000);
  assert.equal(after.players[1].token_hash,before.players[1].token_hash);
  assert.deepEqual(after.players.map(p=>p.seat),[0,1]);
  const t=after.players[0].last_seen_at.getTime();
  await ok('heartbeat',as(r.users[0],{timestamp:'2100-01-01T00:00:00Z'}));
  const newer=await details(r.code);
  assert.ok(newer.players[0].last_seen_at.getTime()>=t);
  assert.ok(newer.players[0].last_seen_at.getTime()<=Date.now()+2000);
});
test('15-second heartbeat cadence tolerates jitter and refreshes DB timestamp',async()=>{
  const r=await room();
  for(const s of [15,16,30]) {
    await stale(r.code,0,s);
    const seen=await ok('get',as(r.users[0]));
    assert.equal(seen.players.find(p=>p.index===0).presence,'online');
    const now=await ok('heartbeat',as(r.users[0]));
    assert.equal(now.players.find(p=>p.index===0).presence,'online');
  }
});
test('45-second suspect boundary and 2-minute lobby grace remain non-destructive',async()=>{
  const r=await room();
  for(const [s,want] of [[44,'online'],[46,'grace'],[119,'grace'],[121,'disconnected']]){
    await stale(r.code,0,s);
    const seen=await ok('get',as(r.users[1]));
    assert.equal(seen.players.find(p=>p.index===0).presence,want);
    assert.equal(seen.room.hostSeat,0); // read-only GET may derive, cannot transfer
  }
  await stale(r.code,0,119);
  const heartbeat=await ok('heartbeat',as(r.users[1]));
  assert.equal(heartbeat.room.hostSeat,0);
  await stale(r.code,0,121);
  const transferred=await ok('heartbeat',as(r.users[1]));
  assert.equal(transferred.room.hostSeat,1);
  assert.equal((await details(r.code)).players.length,2);
  await rejected('settings',as(r.users[0],{mode:'auto',seconds:3}),403);
  const changed=await ok('settings',as(r.users[1],{mode:'auto',seconds:3}));
  assert.equal(changed.room.revealSettings.seconds,3);
  await rejected('start',as(r.users[0]),403);
  // A transferred host may start if all participants are ready.
  await ok('ready',as(r.users[1],{ready:true}));
  await ok('start',as(r.users[1]));
});
test('host transfer with 2, 3 and 4 players elects exactly one clockwise owner',async()=>{
  for(const n of [2,3,4]){
    const r=await room(n);
    await stale(r.code,0,121);
    const candidates=await Promise.all(r.users.slice(1).map(p=>ok('heartbeat',as(p))));
    const state=await details(r.code);
    assert.equal(state.r.host_seat,1);
    assert.equal(Number(state.r.presence_version),1);
    assert.ok(candidates.every(x=>x.room.hostSeat===1));
    assert.equal(state.players.length,n);
    for(const p of r.users.slice(2))await rejected('settings',as(p,{mode:'auto',seconds:5}),403);
    await ok('settings',as(r.users[1],{mode:'auto',seconds:5}));
  }
});
test('5-minute battle grace pauses without card loss; original token resumes, new host retained',async()=>{
  const r=await room(2);
  await readyAndStart(r.users);
  const before=await details(r.code);
  await stale(r.code,0,299);
  let v=await ok('get',as(r.users[1]));
  assert.equal(v.room.paused,true);
  assert.equal(v.room.hostSeat,0);
  await stale(r.code,0,301);
  v=await ok('heartbeat',as(r.users[1]));
  assert.equal(v.room.hostSeat,1);
  assert.equal(v.room.paused,true);
  const during=await details(r.code);
  assert.deepEqual(during.r.state,before.r.state);
  assert.deepEqual(during.players.map(p=>p.token_hash),before.players.map(p=>p.token_hash));
  assert.deepEqual(during.players.map(p=>p.seat),[0,1]);
  assert.equal(during.r.status,'playing');
  const resumed=await ok('heartbeat',as(r.users[0]));
  assert.equal(resumed.room.paused,false);
  assert.equal(resumed.room.hostSeat,1);
  assert.deepEqual((await details(r.code)).r.state,before.r.state);
  assert.equal(resumed.me.index,0);
});
test('paused select is rejected and resumption permits exactly one round under concurrent requests',async()=>{
  const r=await room(2);
  await readyAndStart(r.users);
  const before=await details(r.code);
  const chooser=before.r.state.chooser;
  const other=1-chooser;
  await stale(r.code,other,180);
  await rejected('select',as(r.users[chooser],{expectedRound:0,stat:'attack'}),409);
  assert.deepEqual((await details(r.code)).r.state,before.r.state);
  await ok('heartbeat',as(r.users[other]));
  const [a,b]=await Promise.all([request('select',as(r.users[chooser],{expectedRound:0,stat:'attack'})),
    request('select',as(r.users[chooser],{expectedRound:0,stat:'attack'}))]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  const after=await details(r.code);
  assert.equal(after.r.state.round,1);
  assert.equal(after.r.state.players.reduce((s,p)=>s+p.deck.length,0)+after.r.state.pot.length,50);
});
test('stale token cannot reconnect as a new seat; explicit leave is authoritative',async()=>{
  const r=await room();
  await rejected('heartbeat',{code:r.code,token:'f'.repeat(64)},401);
  await ok('leave',as(r.users[0]));
  await rejected('heartbeat',as(r.users[0]),401);
  const after=await details(r.code);
  assert.equal(after.players[0].active,false);
  assert.ok(after.players[0].left_at instanceof Date);
  const current=await ok('heartbeat',as(r.users[1]));
  assert.equal(current.room.hostSeat,1);
});
test('expired rooms never revive, and legacy null timestamps do not imply abandonment',async()=>{
  const r=await room();
  await db`update deckverse.players set last_seen_at=null where room_id=(select id from deckverse.rooms where code=${r.code}) and seat=0`;
  const seen=await ok('get',as(r.users[1]));
  assert.equal(seen.players.find(p=>p.index===0).presence,'unknown');
  const state=await details(r.code);
  const computed=evaluateRoomPresence({players:state.players,playerCount:2,hostSeat:0,
    status:'lobby',now:Date.now()+2*60*60_000});
  assert.equal(computed.abandoned,false);
  await db`update deckverse.rooms set expires_at=now()-interval '1 second' where code=${r.code}`;
  await rejected('heartbeat',as(r.users[1]),404);
  assert.equal((await details(r.code)).r.status,'lobby'); // neither DELETE nor forfeit
});
test('room row lock serializes competing transfers and does not deadlock',async()=>{
  const r=await room(4);
  await stale(r.code,0,121);
  const results=await Promise.all([...Array(6)].map((_,i)=>request('heartbeat',
    as(r.users[1+i%3]))));
  assert.ok(results.every(x=>x.status===200));
  const after=await details(r.code);
  assert.equal(after.r.host_seat,1);
  assert.equal(Number(after.r.presence_version),1);
  const was=after.r.presence_version;
  await ok('heartbeat',as(r.users[0])); // old host returns; only original seat restored
  const restored=await details(r.code);
  assert.equal(restored.r.host_seat,1);
  assert.equal(restored.r.presence_version,was);
});
test('backgrounded session produces grace, not explicit leave or state corruption',async()=>{
  const r=await room();
  await readyAndStart(r.users);
  const baseline=await details(r.code);
  await stale(r.code,1,90); // browser hidden: no heartbeats
  const s=await ok('get',as(r.users[0]));
  assert.equal(s.room.paused,true);
  assert.equal(s.players.find(p=>p.index===1).presence,'grace');
  const after=await details(r.code);
  assert.equal(after.players[1].active,true);
  assert.equal(after.players[1].left_at,null);
  assert.deepEqual(after.r.state,baseline.r.state);
  await ok('heartbeat',as(r.users[1]));
  assert.equal((await ok('get',as(r.users[0]))).room.paused,false);
});
test('abandonment predicate after long inactivity is not an implemented cleanup worker',async()=>{
  const r=await room();
  await stale(r.code,0,40*60);
  await stale(r.code,1,40*60);
  const state=await details(r.code);
  const evaluated=evaluateRoomPresence({players:state.players,playerCount:2,hostSeat:0,
    status:'lobby',now:Date.now()});
  assert.equal(evaluated.abandoned,true);
  // No deletion/expiration is performed by the policy evaluator or read-only GET.
  assert.equal((await details(r.code)).r.status,'lobby');
});
test('simultaneous competing old/new host settings serialize to one authority',async()=>{
  const r=await room();
  await stale(r.code,0,121);
  const actions=await Promise.all([
    request('settings',as(r.users[0],{mode:'auto',seconds:3})),
    request('settings',as(r.users[1],{mode:'auto',seconds:5}))
  ]);
  assert.deepEqual(actions.map(x=>x.status).sort(),[200,403]);
  const committed=await details(r.code);
  const winner=actions.findIndex(x=>x.status===200);
  assert.equal(committed.r.host_seat,winner);
  assert.ok(Number(committed.r.presence_version)<=1);
});
test('simultaneous heartbeat and intentional leave cannot resurrect a departed seat',async()=>{
  const r=await room();
  const actions=await Promise.all([
    request('leave',as(r.users[0])),
    request('heartbeat',as(r.users[0]))
  ]);
  assert.equal(actions[0].status,200);
  assert.ok([200,401].includes(actions[1].status));
  const committed=await details(r.code);
  assert.equal(committed.players[0].active,false);
  assert.ok(committed.players[0].left_at instanceof Date);
  await rejected('heartbeat',as(r.users[0]),401);
});
test('active recovery TTL lasts 24 hours, fixing previous three-hour mismatch',async()=>{
  for(const n of [2,3,4]){
    const r=await room(n);
    await readyAndStart(r.users);
    const before=await details(r.code);
    const delta=before.r.expires_at.getTime()-Date.now();
    assert.ok(delta>23.9*3600000&&delta<=24*3600000+5000, `playing ${n}P TTL: ${delta}`);
    const total=before.r.state.players.reduce((a,p)=>a+p.deck.length,0)+before.r.state.pot.length;
    assert.equal(total,n===2?50:n*20);
    // Simulate four hours without heartbeats, but still inside the 24h lease.
    for(const user of r.users)await stale(r.code,user.index,4*3600);
    const v=await ok('get',as(r.users[0]));
    assert.equal(v.room.paused,true);
    assert.equal(v.game.round,0);
    assert.equal((await details(r.code)).r.state.players.reduce((a,p)=>a+p.deck.length,0),total);
    const heartbeat=await ok('heartbeat',as(r.users[0]));
    assert.equal(heartbeat.me.index,0);
    assert.ok((await details(r.code)).r.expires_at.getTime()>Date.now()+23.9*3600000);
  }
});
test('retention phases: lobby 30m, playing 24h, finished 30m and old token rejected',async()=>{
  assert.deepEqual(['lobby','playing','finished'].map(retentionSeconds),[1800,86400,1800]);
  assert.throws(()=>retentionSeconds('aborted'));
  const r=await room(2);
  const lobby=await details(r.code);
  assert.ok(lobby.r.expires_at.getTime()<Date.now()+31*60000);
  assert.ok(lobby.r.expires_at.getTime()>Date.now()+29*60000);
  await readyAndStart(r.users);
  const playing=await details(r.code);
  assert.ok(playing.r.expires_at.getTime()>Date.now()+23*3600000);
  const before=playing.r.state;
  await ok('leave',as(r.users[0]));
  const ended=await details(r.code);
  assert.equal(ended.r.status,'finished');
  assert.equal(ended.r.state.endReason,'forfeit');
  assert.ok(ended.r.expires_at.getTime()<Date.now()+31*60000);
  assert.deepEqual(ended.r.state.players,before.players);
  await rejected('get',as(r.users[0]),401);
  assert.equal((await ok('get',as(r.users[1]))).room.status,'finished');
});
test('soft expiration is bounded, transactional and preserves historical cards and hashes',async()=>{
  const r=await room(3);
  await readyAndStart(r.users);
  const before=await details(r.code);
  await db`update deckverse.rooms set expires_at=clock_timestamp()-interval '1 second' where code=${r.code}`;
  await rejected('get',as(r.users[0]),404);
  await rejected('heartbeat',as(r.users[1]),404);
  const count=await sweepExpiredRoomSessions(app,{batch:32});
  assert.ok(count>=3, `expired seats revoked: ${count}`);
  const after=await details(r.code);
  assert.equal(after.r.status,'playing'); // historical outcome not falsified
  assert.deepEqual(after.r.state,before.r.state);
  assert.deepEqual(after.players.map(p=>p.token_hash),before.players.map(p=>p.token_hash));
  assert.ok(after.players.every(p=>p.active===false&&p.ready===false&&p.left_at===null));
  assert.equal(await sweepExpiredRoomSessions(app,{batch:32}),0);
  await assert.rejects(()=>sweepExpiredRoomSessions(app,{batch:0}),/batch/);
});
test('cleanup skips locked rooms and does not expire an actively refreshing match',async()=>{
  const r=await room(2);
  await readyAndStart(r.users);
  const before=await details(r.code);
  await Promise.all([ok('heartbeat',as(r.users[0])),sweepExpiredRoomSessions(app,{batch:8})]);
  const after=await details(r.code);
  assert.deepEqual(after.r.state,before.r.state);
  assert.ok(after.players.every(p=>p.active));
  assert.ok(after.r.expires_at.getTime()>Date.now()+23.9*3600000);
});
test('single-snapshot GETs remain coherent during 2/3/4 host races and never disclose secrets',async()=>{
  for(const n of [2,3,4]){
    const r=await room(n);
    const before=await details(r.code);
    await stale(r.code,0,121);
    const outputs=await Promise.all([
      ...r.users.slice(1).map(user=>request('heartbeat',as(user))),
      ...r.users.map(user=>request('get',as(user)))
    ]);
    assert.ok(outputs.every(x=>x.status===200), JSON.stringify(outputs.filter(x=>x.status!==200)));
    const shaHashes=before.players.map(p=>p.token_hash);
    for(const output of outputs){
      assert.equal(output.body.players.length,n);
      assert.equal(new Set(output.body.players.map(p=>p.index)).size,n);
      assert.ok(output.body.players.some(p=>p.index===output.body.room.hostSeat));
      const serialized=JSON.stringify(output.body);
      for(const digest of shaHashes)assert.ok(!serialized.includes(digest),'token hash leaked');
      for(const user of r.users)assert.ok(!serialized.includes(user.token),'session token leaked');
      assert.ok(!serialized.includes('"deck":'),'future hidden decks leaked');
    }
    const final=await details(r.code);
    assert.equal(final.r.host_seat,1);
    assert.equal(Number(final.r.presence_version),1);
  }
});
test('expired lobby cleanup retains participants historical rows; no infinite access',async()=>{
  const r=await room(2);
  const before=await details(r.code);
  await db`update deckverse.rooms set expires_at=clock_timestamp()-interval '2 seconds' where code=${r.code}`;
  await rejected('get',as(r.users[1]),404);
  await sweepExpiredRoomSessions(app,{batch:32});
  const after=await details(r.code);
  assert.equal(after.r.status,'lobby');
  assert.equal(after.players.length,2);
  assert.deepEqual(after.players.map(p=>p.token_hash),before.players.map(p=>p.token_hash));
  assert.ok(after.players.every(p=>!p.active));
  await rejected('heartbeat',as(r.users[1]),404);
});
test.after(async()=>{
  await app.end({timeout:2});
  await db.end({timeout:2});
});
