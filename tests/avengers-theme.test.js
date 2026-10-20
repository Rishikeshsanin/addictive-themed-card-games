import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTERS,DECK,STAT_FIELDS,FACTIONS,card} from '../themes/avengers/data.js';
import {newDuel,compare,playTurn,validateDuel,viewFor,shuffle} from '../themes/avengers/engine.js';
test('Avengers Saga catalog holds exactly fifty unique story-specific single-form characters',()=>{
 assert.equal(CHARACTERS.length,50);
 assert.equal(DECK.length,50);
 assert.equal(new Set(CHARACTERS.map(c=>c.id)).size,50);
 assert.equal(new Set(CHARACTERS.map(c=>c.rank)).size,50);
 assert.equal(new Set(CHARACTERS.map(c=>c.name)).size,50);
 assert.equal(CHARACTERS.filter(c=>c.faction==='Avengers').length,14);
 assert.equal(CHARACTERS.filter(c=>c.faction==='Allies').length,12);
 assert.equal(CHARACTERS.filter(c=>c.faction==='Guardians').length,10);
 assert.equal(CHARACTERS.filter(c=>c.faction==='Villains').length,14);
 assert.deepEqual([...FACTIONS],['All','Avengers','Allies','Guardians','Villains']);
 for(const c of CHARACTERS){
  assert.ok(c.signature.length>4&&c.weakness.length>4,'Every character needs lore strength and limitation');
  assert.ok(Number.isInteger(c.hue)&&c.hue>=0&&c.hue<=360);
  assert.ok(STAT_FIELDS.every(s=>Number.isInteger(c[s.key])&&c[s.key]>=1&&c[s.key]<=100),'Game-tuned stat must be 1..100 for '+c.name);
 }
});
test('All eight categories follow lower rank / higher other rules',()=>{
 assert.equal(STAT_FIELDS.length,8);
 assert.equal(STAT_FIELDS[0].key,'rank');
 assert.equal(STAT_FIELDS[0].direction,'min');
 for(const s of STAT_FIELDS.slice(1))assert.equal(s.direction,'max');
 const a=card(3),b=card(1);
 for(const f of STAT_FIELDS){
  const expected=a[f.key]===b[f.key]?-1:f.direction==='min'?(a[f.key]<b[f.key]?0:1):(a[f.key]>b[f.key]?0:1);
  assert.equal(compare(a.id,b.id,f.key),expected);
 }
 assert.throws(()=>compare(1,2,'weight'),/Unknown stat/);
});
test('MCU-inspired battle specialties are deliberate rather than copy-pasted',()=>{
 assert.ok(card(4).strength>card(1).strength,'Hulk dominates Iron Man physically');
 assert.ok(card(1).intellect>card(4).intellect,'Iron Man superior technical intellect to Hulk composite');
 assert.ok(card(21).speed>card(3).speed,'Quicksilver is faster than Thor in this scenario');
 assert.ok(card(7).energy>card(5).energy,'Chaos magic beats unenhanced energy output');
 assert.ok(card(24).combat>card(3).combat,'Shang-Chi has specialist close-combat skill');
 assert.ok(card(37).rank<card(1).rank,'Thanos outranks Iron Man but does not win every category');
 assert.ok(card(1).intellect>card(37).intellect,'Tony can challenge Thanos through technology');
});
test('50-card deal and hidden opponent upcoming cards',()=>{
 const s=newDuel({picker:()=>0,chooser:0});
 assert.deepEqual(s.players.map(p=>p.deck.length),[25,25]);
 assert.equal(s.pot.length,0);
 assert.equal(viewFor(s,0).topCard.id,s.players[0].deck[0]);
 assert.equal(viewFor(s,0).players,undefined);
 assert.equal(viewFor(s,0).counts[1],25);
 assert.equal(JSON.stringify(viewFor(s,0)).includes('"deck"'),false);
 validateDuel(s);
});
test('Winner collects own card followed by opponent card at bottom; input not mutated',()=>{
 const g=newDuel({picker:()=>0,chooser:0});
 const before=JSON.stringify(g);
 const a=g.players[0].deck[0],b=g.players[1].deck[0];
 const winner=compare(a,b,'rank');
 const next=playTurn(g,0,'rank');
 assert.equal(JSON.stringify(g),before);
 assert.deepEqual(next.players[winner].deck.slice(-2),[winner===0?a:b,winner===0?b:a]);
 assert.equal(next.chooser,winner);
 assert.equal(next.last.awarded,2);
 validateDuel(next);
});
test('Tie pot and every second consecutive tie moves category control',()=>{
 const g=newDuel({picker:()=>0,chooser:0});
 let pair1=null,pair2=null;
 for(const a of g.players[0].deck)for(const b of g.players[1].deck){
  const stat=STAT_FIELDS.find(f=>f.key!=='rank'&&card(a)[f.key]===card(b)[f.key]);
  if(!stat)continue;
  if(!pair1)pair1=[a,b,stat.key];
  else if(a!==pair1[0]&&b!==pair1[1]&&!pair2)pair2=[a,b,stat.key];
 }
 assert.ok(pair1&&pair2,'Curated deck should support at least 2 independent equal-stat ties');
 for(const [seat,idx] of [[0,0],[1,1]]){
  const first=pair1[idx],second=pair2[idx];
  g.players[seat].deck=[first,second,...g.players[seat].deck.filter(id=>id!==first&&id!==second)];
 }
 const a=playTurn(g,0,pair1[2]);
 assert.equal(a.last.type,'tie');assert.equal(a.pot.length,2);assert.equal(a.chooser,0);
 const b=playTurn(a,0,pair2[2]);
 assert.equal(b.last.type,'tie');assert.equal(b.pot.length,4);assert.equal(b.chooser,1);
 const c=playTurn(b,1,'rank');
 assert.equal(c.pot.length,0);assert.equal(c.last.awarded,6);validateDuel(c);
});
test('Sudden-death on final tied pair awards all cards without deadlock',()=>{
 const g=newDuel({picker:()=>0,chooser:0});
 let found=null;for(const s of STAT_FIELDS.slice(1)){for(const a of DECK){const b=DECK.find(x=>x!==a&&card(x)[s.key]===card(a)[s.key]);if(b){found=[a,b,s.key];break}}if(found)break}
 assert.ok(found);
 const [a,b,key]=found;
 g.players=[{deck:[a]},{deck:[b]}];g.pot=DECK.filter(id=>id!==a&&id!==b);
 validateDuel(g);
 const n=playTurn(g,0,key);
 assert.equal(n.status,'finished');assert.equal(n.last.type,'sudden-death');assert.equal(n.players[n.winner].deck.length,50);validateDuel(n);
});
test('Random legal play always conserves fifty cards and never mutates invalid actor state',()=>{
 let seed=2911;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
 for(let run=0;run<30;run++){
  let g=newDuel({picker:max=>Math.floor(rand()*max)});
  for(let round=0;round<2000&&g.status==='playing';round++){
   const key=STAT_FIELDS[Math.floor(rand()*8)].key;
   g=playTurn(g,g.chooser,key);validateDuel(g);
  }
  assert.equal(g.total,50);
 }
 const testState=newDuel({picker:()=>0,chooser:0});
 assert.throws(()=>playTurn(testState,1,'rank'),/Only the category caller/);
 assert.throws(()=>playTurn(testState,0,'power'),/Unknown stat/);
});
test('shuffle preserves the collection and rejects bad RNG indexes',()=>{
 assert.deepEqual(shuffle([1,2,3,4],()=>0),[2,3,4,1]);
 assert.throws(()=>shuffle([1,2],()=>99),/Invalid shuffle index/);
});
