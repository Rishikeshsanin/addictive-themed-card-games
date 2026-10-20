import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRematch} from '../src/rematch.js';
import {startMultiGame,validateMulti} from '../src/multi-engine.js';
const members=n=>Array.from({length:n},(_,seat)=>({seat,ready:false,active:true}));
const finished=n=>({status:'finished',playerCount:n,matchNumber:7,winner:0});
for(const n of [2,3,4]){
 test(n+'P: exactly '+n+' distinct original seats must agree and duplicates are idempotent',()=>{
  const state=finished(n),players=members(n);
  assert.deepEqual(decideRematch({status:'finished',state,players,seat:0,expectedMatchNumber:7}),{votes:[0],restart:false});
  players[0].ready=true;
  assert.deepEqual(decideRematch({status:'finished',state,players,seat:0,expectedMatchNumber:7}),{votes:[0],restart:false});
  for(let i=1;i<n-1;i++)players[i].ready=true;
  const last=decideRematch({status:'finished',state,players,seat:n-1,expectedMatchNumber:7});
  assert.equal(last.restart,true);assert.deepEqual(last.votes,Array.from({length:n},(_,i)=>i));
 });
 test(n+'P: stale match, wrong or duplicate seats and departure cannot restart',()=>{
  const state=finished(n),players=members(n);
  assert.match(decideRematch({status:'finished',state,players,seat:0,expectedMatchNumber:6}).error,/previous match/);
  assert.match(decideRematch({status:'finished',state,players,seat:0,expectedMatchNumber:NaN}).error,/previous match/);
  assert.match(decideRematch({status:'finished',state,players:[...players.slice(0,n-1),{seat:0,ready:true}],seat:0}).error,/seats/);
  assert.match(decideRematch({status:'finished',state,players:players.slice(1),seat:1}).error,/All original/);
  assert.match(decideRematch({status:'finished',state,players,seat:n}).error,/not a participant/);
  assert.match(decideRematch({status:'finished',state:{...state,endReason:'forfeit'},players,seat:0}).error,/player left/);
 });
}
for(const n of [3,4]){
 test(n+'P: after unanimous approval a new game has fresh state and correct card count',()=>{
  const match=startMultiGame({playerCount:n});
  match.matchNumber=8;
  validateMulti(match);
  assert.equal(match.round,0);assert.equal(match.pot.length,0);
  assert.deepEqual(match.players.map(p=>p.deck.length),Array(n).fill(20));
  assert.equal(new Set(match.players.flatMap(p=>p.deck)).size,20*n);
 });
}
