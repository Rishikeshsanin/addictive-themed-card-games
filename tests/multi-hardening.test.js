import test from 'node:test';
import assert from 'node:assert/strict';
import {startMultiGame,multiTurn,multiViewFor,validateMulti} from '../src/multi-engine.js';
import {card,DECKS,STAT_FIELDS} from '../src/catalog.js';

// Deliberately synthetic game states below are unit fixtures; no database or live rooms.
const picker=()=>0;
const allDeckCards=s=>s.players.flatMap(p=>p.deck);
function putHeads(s,heads){
 const original=allDeckCards(s),used=new Set(heads.filter(x=>x!==null));
 assert.equal(used.size,heads.filter(x=>x!==null).length,'head cards unique');
 for(const id of used)assert.ok(original.includes(id),'head belongs to playable decks');
 const rest=original.filter(x=>!used.has(x));
 let at=0;
 s.players.forEach((p,i)=>{
  const size=p.deck.length;
  if(!size){assert.equal(heads[i],null);return}
  p.deck=[heads[i],...rest.slice(at,at+size-1)];
  at+=size-1;
 });
 assert.equal(at,rest.length);
 validateMulti(s);
 return s;
}
const better=(a,b,rule)=>rule.direction==='min'?card(a)[rule.key]<card(b)[rule.key]:card(a)[rule.key]>card(b)[rule.key];
function winningHeads(ids,n,rule){
 const winner=ids.find(id=>ids.filter(other=>other!==id&&better(id,other,rule)).length>=n-1);
 assert.ok(winner,'Need a unique leading card');
 const weaker=ids.filter(id=>id!==winner&&better(winner,id,rule));
 return [winner,...weaker.slice(0,n-1)];
}
function tiedHeads(ids,n){
 for(const rule of STAT_FIELDS.filter(s=>s.key!=='rank')){
  const byValue=new Map();
  for(const id of ids){const val=card(id)[rule.key];byValue.set(val,[...(byValue.get(val)||[]),id])}
  for(const group of byValue.values()){
   if(group.length<2)continue;
   const weaker=ids.filter(id=>better(group[0],id,rule));
   if(weaker.length>=n-2)return {key:rule.key,heads:[group[0],group[1],...weaker.slice(0,n-2)]};
  }
 }
 throw Error('No available tie hand for fixture');
}
for(const n of [3,4]){
 test(n+'P: all eight categories produce the right decisive winner and preserve every card',()=>{
  for(const rule of STAT_FIELDS){
   const s=startMultiGame({playerCount:n,chooser:0,picker});
   putHeads(s,winningHeads(DECKS[n],n,rule));
   const r=multiTurn(s,0,rule.key);
   assert.equal(r.last.kind,'win',rule.key);assert.equal(r.last.winner,0,rule.key);
   assert.equal(r.last.awardedCount,n);assert.equal(r.pot.length,0);
   assert.equal(r.players[0].deck.length,20+n-1);validateMulti(r);
   assert.equal(s.round,0,'Turns must not mutate server input');
  }
 });
 test(n+'P: multiway tie puts ALL played cards into a pot and next decisive win awards it exactly once',()=>{
  const s=startMultiGame({playerCount:n,chooser:0,picker});
  const tie=tiedHeads(DECKS[n],n);
  putHeads(s,tie.heads);
  const a=multiTurn(s,0,tie.key);
  assert.equal(a.last.kind,'tie');assert.equal(a.pot.length,n);
  assert.equal(a.last.awardedCount,0);
  assert.equal(a.chooser,0);assert.equal(a.consecutiveTies,1);
  const b=multiTurn(a,a.chooser,'rank');
  assert.equal(b.last.kind,'win');assert.equal(b.last.awardedCount,n*2);
  assert.equal(b.pot.length,0);assert.equal(b.players.reduce((x,p)=>x+p.deck.length,0),20*n);
  validateMulti(b);
  const view=multiViewFor(b,1);
  assert.equal(view.players,undefined);assert.equal(view.last.cards.length,n);
  assert.equal(view.last.awardedCount,n*2);
  const deckBefore=JSON.stringify(b.players);
  view.last.cards[0].name='changed';
  assert.equal(JSON.stringify(b.players),deckBefore,'Viewer changes cannot change decks');
 });
 test(n+'P: consecutive tie alternates clockwise chooser on every even tie only',()=>{
  let s=startMultiGame({playerCount:n,chooser:0,picker});
  for(let round=1;round<=3;round++){
   const hand=tiedHeads(allDeckCards(s),n);
   putHeads(s,hand.heads);
   s=multiTurn(s,s.chooser,hand.key);
   assert.equal(s.last.kind,'tie');
   assert.equal(s.pot.length,n*round);
   assert.equal(s.consecutiveTies,round);
   assert.equal(s.chooser,round===1?0:1);
  }
 });
 test(n+'P: exhausted all-player tie resolves once by unique Rank and ends the match',()=>{
  const s=startMultiGame({playerCount:n,chooser:0,picker});
  const hand=tiedHeads(DECKS[n],n);
  const used=new Set(hand.heads);
  s.players=hand.heads.map(id=>({deck:[id]}));
  s.pot=DECKS[n].filter(id=>!used.has(id));
  validateMulti(s);
  const resolved=multiTurn(s,0,hand.key);
  const rankWinner=hand.heads.findIndex(id=>card(id).rank===Math.min(...hand.heads.map(id=>card(id).rank)));
  assert.equal(resolved.last.kind,'sudden-death');
  assert.equal(resolved.winner,rankWinner);
  assert.equal(resolved.status,'finished');
  assert.equal(resolved.players[resolved.winner].deck.length,n*20);
  assert.equal(resolved.pot.length,0);validateMulti(resolved);
 });
 test(n+'P: all players only see their own future top card, never deck order',()=>{
  const s=startMultiGame({playerCount:n,chooser:0,picker});
  for(let viewer=0;viewer<n;viewer++){
   const view=multiViewFor(s,viewer),payload=JSON.stringify(view);
   assert.equal(view.topCard.id,s.players[viewer].deck[0]);
   assert.ok(!payload.includes('"deck"'));
   for(let other=0;other<n;other++)if(other!==viewer){
    assert.equal(payload.includes('"id":'+s.players[other].deck[0]+','),false);
   }
  }
 });
}
test('4P: next chooser skips an eliminated seat during consecutive-tie rotation',()=>{
 const s=startMultiGame({playerCount:4,chooser:0,picker});
 s.pot.push(...s.players[1].deck);s.players[1].deck=[];
 const available=allDeckCards(s),hand=tiedHeads(available,3);
 putHeads(s,[hand.heads[0],null,hand.heads[1],hand.heads[2]]);
 s.consecutiveTies=1;
 const after=multiTurn(s,0,hand.key);
 assert.equal(after.last.kind,'tie');assert.equal(after.chooser,2);
 assert.equal(after.consecutiveTies,2);validateMulti(after);
});
test('3P: one deck left after a tie receives the jackpot (current rule; see coordinator ambiguity)',()=>{
 const s=startMultiGame({playerCount:3,chooser:0,picker}),hand=tiedHeads(DECKS[3],3);
 const used=new Set(hand.heads),extra=DECKS[3].find(id=>!used.has(id));
 s.players=[{deck:[hand.heads[0]]},{deck:[hand.heads[1]]},{deck:[hand.heads[2],extra]}];
 s.pot=DECKS[3].filter(id=>!used.has(id)&&id!==extra);
 const r=multiTurn(s,0,hand.key);
 assert.equal(r.last.kind,'last-standing');assert.equal(r.winner,2);
 assert.equal(r.players[2].deck.length,60);assert.equal(r.pot.length,0);
 validateMulti(r);
});
test('corrupt multiplayer state is rejected before making a turn',()=>{
 const s=startMultiGame({playerCount:3,chooser:0,picker});
 s.players[1].deck[0]=s.players[0].deck[0];
 assert.throws(()=>multiTurn(s,0,'rank'),/Duplicate card/);
 const t=startMultiGame({playerCount:3,chooser:0,picker});
 t.round=-1;assert.throws(()=>validateMulti(t),/round counter/);
});
