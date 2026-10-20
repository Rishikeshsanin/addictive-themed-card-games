import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRematch} from '../src/rematch.js';
import {newGame,validate} from '../src/engine.js';
import {DECKS} from '../src/catalog.js';
const players=[{seat:0,ready:false},{seat:1,ready:false}];
const state={status:'finished',winner:0,matchNumber:1};
const decide=(p,seat=0,s=state,status='finished')=>decideRematch({status,state:s,players:p,seat});
test('rematch requires both players in an already finished game',()=>{
 assert.match(decide(players,0,state,'playing').error,/after the match/);
 assert.match(decide(players,0,{status:'playing'}).error,/after the match/);
 assert.match(decide([players[0]]).error,/All original/);
 assert.match(decide(players,2).error,/not a participant/);
 assert.match(decide(players,0,{...state,endReason:'forfeit'}).error,/player left/);
});
test('first consent does not start another game; duplicate consent is idempotent',()=>{
 const first=decide(players,0);
 assert.deepEqual(first,{votes:[0],restart:false});
 const duplicated=decide([{seat:0,ready:true},{seat:1,ready:false}],0);
 assert.deepEqual(duplicated,first);
});
test('either player may give the second consent to authorize exactly one fresh game',()=>{
 const a=decide([{seat:0,ready:true},{seat:1,ready:false}],1);
 const b=decide([{seat:0,ready:false},{seat:1,ready:true}],0);
 assert.deepEqual(a,{votes:[0,1],restart:true});
 assert.deepEqual(b,a);
 for(const n of [1,2,3]){const next=newGame({ids:DECKS[2]});next.matchNumber=n+1;validate(next);assert.equal(next.round,0);assert.equal(next.total,50);}
});

for(const n of [3,4]){
 test(n+'-player rematch needs all '+n+' original players',()=>{
  const state={status:'finished',playerCount:n,winner:0,matchNumber:2};
  const members=Array.from({length:n},(_,i)=>({seat:i,ready:i!==n-1}));
  const pending=decideRematch({status:'finished',state,players:members,seat:0});
  assert.equal(pending.restart,false);
  assert.equal(pending.votes.length,n-1);
  const approved=decideRematch({status:'finished',state,players:members,seat:n-1});
  assert.equal(approved.restart,true);assert.equal(approved.votes.length,n);
 });
}
