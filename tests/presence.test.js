import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESENCE_POLICY as P, advanceHeartbeat, evaluateRoomPresence,
  presenceOf, validatePresencePolicy,
} from '../src/presence.js';
const T = Date.parse('2026-10-20T12:00:00Z');
const player = (seat, age = 0, active = true) =>
  ({seat, active, last_seen_at: new Date(T-age).toISOString()});
const check = (players, extra={}) => evaluateRoomPresence({players,playerCount:2,hostSeat:0,
  status:'playing',now:T,...extra});

test('phase thresholds distinguish connected, grace and disconnected (not a forfeit)', () => {
  assert.equal(presenceOf(player(0,44_999),{status:'lobby',now:T}).state,'online');
  assert.equal(presenceOf(player(0,45_000),{status:'lobby',now:T}).state,'grace');
  assert.equal(presenceOf(player(0,120_000),{status:'lobby',now:T}).state,'grace');
  assert.equal(presenceOf(player(0,120_001),{status:'lobby',now:T}).state,'disconnected');
  assert.equal(presenceOf(player(0,299_999),{status:'playing',now:T}).state,'grace');
  assert.equal(presenceOf(player(0,300_001),{status:'playing',now:T}).state,'disconnected');
  assert.equal(presenceOf(player(0,180_001),{status:'finished',now:T}).state,'disconnected');
});
test('backgrounding a browser keeps seat and cards through grace', () => {
  const r = check([player(0,100_000),player(1)]);
  assert.equal(r.paused,true);
  assert.equal(r.hostChanged,false);
  assert.equal(r.abandoned,false);
  assert.deepEqual(r.roster.map(p=>p.seat),[0,1]);
});
test('reconnect with original session restores presence without changing seat', () => {
  const roster=[player(0,100_000),player(1)];
  const recovered=advanceHeartbeat(roster[0],{serverNow:T});
  assert.equal(recovered.seat,0);
  assert.equal(check([recovered,roster[1]]).paused,false);
  assert.equal(check(roster).paused,true);
});
test('heartbeat replay and earlier server timestamp never move last_seen backwards', () => {
  const p=player(1);
  assert.deepEqual(advanceHeartbeat(p,{serverNow:T-1_000}),p);
  assert.deepEqual(advanceHeartbeat(advanceHeartbeat(p,{serverNow:T}),{serverNow:T}),p);
  assert.throws(()=>advanceHeartbeat({...p,active:false},{serverNow:T}),/Inactive/);
});
test('lobby host within grace retains ownership; disconnected host yields to connected guest', () => {
  let r=check([player(0,119_000),player(1)],{status:'lobby'});
  assert.equal(r.hostSeat,0);
  r=check([player(0,121_000),player(1)],{status:'lobby'});
  assert.equal(r.hostSeat,1);
  assert.equal(r.hostChanged,true);
});
test('active battle host may transfer only after full five-minute grace', () => {
  assert.equal(check([player(0,299_000),player(1)]).hostSeat,0);
  const r=check([player(0,301_000),player(1)]);
  assert.equal(r.hostSeat,1);
  assert.equal(r.paused,true); // control transferred; no automatic gameplay/forfeit
});
test('clockwise election is deterministic in 3 and 4 player rooms', () => {
  const three=evaluateRoomPresence({players:[player(2),player(0),player(1,400_000)],
    playerCount:3,hostSeat:1,status:'playing',now:T});
  assert.equal(three.hostSeat,2);
  const four=evaluateRoomPresence({players:[player(3),player(1),player(2,400_000),player(0)],
    playerCount:4,hostSeat:2,status:'playing',now:T});
  assert.equal(four.hostSeat,3);
});
test('multiple disconnected players never elect an offline replacement', () => {
  const r=check([player(0,500_000),player(1,501_000)]);
  assert.equal(r.hostSeat,0);
  assert.equal(r.hostChanged,false);
  assert.equal(r.paused,true);
});
test('former host reconnect cannot steal an already-transferred host lease', () => {
  const initial=check([player(0,301_000),player(1)]);
  const restored=check([player(0),player(1)],{hostSeat:initial.hostSeat});
  assert.equal(restored.hostSeat,1);
  assert.equal(restored.hostChanged,false);
  assert.equal(restored.paused,false);
});
test('intentional leave differs from timeout; cannot heartbeat an exited session', () => {
  const left={...player(0),active:false};
  assert.equal(presenceOf(left,{status:'playing',now:T}).state,'left');
  assert.equal(check([left,player(1)]).hostSeat,1);
  assert.throws(()=>advanceHeartbeat(left,{serverNow:T}));
});
test('abandonment needs all players gone and enough server-observed inactivity', () => {
  assert.equal(check([player(0,86_399_999),player(1,86_399_999)]).abandoned,false);
  assert.equal(check([player(0,86_400_001),player(1,86_400_001)]).abandoned,true);
  assert.equal(check([player(0,86_400_001),player(1)]).abandoned,false);
  assert.equal(check([player(0,1_800_001),player(1,1_800_001)],{status:'lobby'}).abandoned,true);
  assert.equal(check([player(0,1_800_001),player(1,1_800_001)],{status:'finished'}).abandoned,true);
});
test('legacy null/invalid timestamp is unknown and blocks automated expiration', () => {
  const r=check([{seat:0,active:true,last_seen_at:null},player(1,86_400_001)]);
  assert.deepEqual(r.roster.map(p=>p.state),['unknown','disconnected']);
  assert.equal(r.abandoned,false);
  assert.equal(r.hostChanged,false);
});
test('missing roster or duplicate/stale seats do not manufacture a new player', () => {
  assert.equal(check([player(1)]).paused,true);
  assert.throws(()=>check([player(0),player(0)]),/duplicate/);
  assert.throws(()=>check([player(0),player(2)]),/seat/);
});
test('concurrent valid retries are idempotent under serialized room lock semantics', async () => {
  let roster=[player(0,400_000),player(1)]; let hostSeat=0;
  // Simulates sequential transactions after acquiring FOR UPDATE on the same room.
  for (const act of ['sweep','heartbeat','sweep','heartbeat','sweep']) {
    if(act==='heartbeat') roster[0]=advanceHeartbeat(roster[0],{serverNow:T});
    const result=check(roster,{hostSeat});hostSeat=result.hostSeat;
  }
  assert.equal(hostSeat,1);
  assert.equal(check(roster,{hostSeat}).paused,false);
  assert.equal(new Set(roster.map(p=>p.seat)).size,2);
});
test('config validation rejects unsafe grace/threshold inversions', () => {
  assert.equal(validatePresencePolicy(P),P);
  assert.throws(()=>validatePresencePolicy({...P,suspectAfterMs:10}),/threshold/);
  assert.throws(()=>validatePresencePolicy({...P,graceMs:{...P.graceMs,playing:30_000}}),/threshold/);
  assert.throws(()=>evaluateRoomPresence({players:[],playerCount:2,status:'unknown',now:T}),/status/);
});
