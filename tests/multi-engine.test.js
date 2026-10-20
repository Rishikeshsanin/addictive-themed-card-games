import test from 'node:test';
import assert from 'node:assert/strict';
import {startMultiGame,multiTurn,multiViewFor,validateMulti} from '../src/multi-engine.js';
import {card,DECKS,STAT_FIELDS} from '../src/catalog.js';
const picker=()=>0;
for(const n of [3,4]){
 test(n+' players: shuffled '+(n*20)+'-card deck deals exactly 20 per player',()=>{
  const s=startMultiGame({playerCount:n,picker,chooser:0});
  assert.equal(s.players.length,n);
  assert.deepEqual(s.players.map(p=>p.deck.length),Array(n).fill(20));
  assert.equal(s.total,20*n);assert.equal(s.pot.length,0);validateMulti(s);
 });
 test(n+' players: only chooser may call legitimate stat',()=>{
  const s=startMultiGame({playerCount:n,picker,chooser:0});
  assert.throws(()=>multiTurn(s,1,'rank'),/category-selection/);
  assert.throws(()=>multiTurn(s,0,'unknown'),/Invalid category/);
  const r=multiTurn(s,0,'rank');validateMulti(r);assert.equal(r.round,1);
  assert.equal(r.last.cards.length,n);
  assert.equal(r.last.awardedCount,n);
  assert.equal(r.pot.length,0);
 });
 test(n+' players: hidden cards remain hidden for every viewer',()=>{
  const s=startMultiGame({playerCount:n,picker,chooser:0});
  for(let seat=0;seat<n;seat++){
   const view=multiViewFor(s,seat);
   assert.equal(view.topCard.id,s.players[seat].deck[0]);
   assert.equal(view.players,undefined);
   assert.ok(!JSON.stringify(view).includes('"deck"'));
  }
 });
 test(n+' players: random legal play conserves cards for 400 turns',()=>{
  let seed=n*1234;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
  for(let trial=0;trial<4;trial++){
   let s=startMultiGame({playerCount:n,picker:max=>Math.floor(random()*max)});
   for(let turn=0;turn<400&&s.status==='playing';turn++){
    const key=STAT_FIELDS[Math.floor(random()*STAT_FIELDS.length)].key;
    s=multiTurn(s,s.chooser,key);validateMulti(s);
   }
   assert.equal(s.total,n*20);
  }
 });
}
test('3-player tie pot with multiple tied winners remains conserved',()=>{
 const s=startMultiGame({playerCount:3,picker,chooser:0});
 let setup=null;
 for(const field of STAT_FIELDS.filter(f=>f.key!=='rank')){
  const groups=new Map();
  for(const id of DECKS[3]){const value=card(id)[field.key];if(!groups.has(value))groups.set(value,[]);groups.get(value).push(id)}
  for(const [value,ids] of groups){
   if(ids.length<2)continue;
   const other=DECKS[3].find(id=>!ids.includes(id)&&(field.direction==='min'?card(id)[field.key]>value:card(id)[field.key]<value));
   if(other){setup=[ids[0],ids[1],other,field.key];break}
  }
  if(setup)break;
 }
 assert.ok(setup,'Deck includes a tieable 3-way combination');
 const [a,b,c,key]=setup;
 const chosen=[a,b,c];const pool=new Set(chosen);
 const rest=s.players.flatMap(p=>p.deck).filter(id=>!pool.has(id));
 for(let p=0;p<3;p++)s.players[p].deck=[chosen[p],...rest.slice(p*19,(p+1)*19)];
 validateMulti(s);
 const r=multiTurn(s,0,key);
 assert.equal(r.last.kind,'tie');assert.equal(r.pot.length,3);
 assert.equal(r.consecutiveTies,1);assert.equal(r.chooser,0);validateMulti(r);
});
test('sudden-death awards jackpot when all remaining decks exhaust on a tie',()=>{
 const s=startMultiGame({playerCount:3,picker,chooser:0});
 let match=null;for(const f of STAT_FIELDS.filter(x=>x.key!=='rank'))for(const a of DECKS[3])for(const b of DECKS[3]){
   if(a!==b&&card(a)[f.key]===card(b)[f.key]){match=[a,b,f.key];break}if(match)break;
 }
 assert.ok(match);
 // Keep conservation while dealing 3 cards: put 57 others in the pot, three on top.
 const [a,b,key]=match,remaining=DECKS[3].filter(id=>id!==a&&id!==b);
 const c=remaining.shift();s.players=[{deck:[a]},{deck:[b]},{deck:[c]}];s.pot=remaining;
 s.chooser=0;validateMulti(s);
 const after=multiTurn(s,0,key);
 assert.equal(after.status,'finished');
 assert.ok([0,1,2].includes(after.winner));
 assert.equal(after.players[after.winner].deck.length,60);
 validateMulti(after);
});
