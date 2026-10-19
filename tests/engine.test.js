import test from 'node:test';import assert from 'node:assert/strict';import {newGame,takeTurn,validate,compare,shuffle,viewFor,benchmark} from '../src/engine.js';import {DECKS,REFERENCE,STAT_FIELDS,card,deckFor} from '../src/catalog.js';
test('full catalog and manifests contain unique valid cards',()=>{assert.equal(REFERENCE.length,200);for(const [n,total] of [[2,50],[3,60],[4,80]]){assert.equal(DECKS[n].length,total);assert.equal(new Set(DECKS[n]).size,total);assert.ok(DECKS[n].every(id=>card(id)));}});
test('shuffle is a permutation and deterministic with injected picker',()=>{assert.deepEqual(shuffle([1,2,3,4],()=>0),[2,3,4,1]);});
test('game deals 25 cards each and conceals rival top card',()=>{const g=newGame({ids:DECKS[2],picker:()=>0,chooser:0});assert.equal(g.players[0].deck.length,25);assert.equal(g.players[1].deck.length,25);assert.equal(viewFor(g,0).topCard.id,g.players[0].deck[0]);assert.equal(viewFor(g,0).players,undefined);assert.ok(!JSON.stringify(viewFor(g,0)).includes('"deck"'));validate(g)});
test('rank favors lower and others higher',()=>{for(const f of STAT_FIELDS){const a=card(DECKS[2][0]),b=card(DECKS[2][1]);const expected=a[f.key]===b[f.key]?-1:f.direction==='min'?(a[f.key]<b[f.key]?0:1):(a[f.key]>b[f.key]?0:1);assert.equal(compare(a.id,b.id,f.key),expected)}});
test('winning cards go to bottom in deterministic order',()=>{const g=newGame({ids:DECKS[2],picker:()=>0,chooser:0});const [a,b]=g.players.map(p=>p.deck[0]);const w=compare(a,b,'rank');const next=takeTurn(g,0,'rank');const target=[a,b][w];assert.equal(next.players[w].deck.at(-2),target);assert.equal(next.players[w].deck.at(-1),[a,b][1-w]);assert.equal(next.chooser,w);validate(next)});
test('tie pot carries cards and the second consecutive tie switches chooser',()=>{const g=newGame({ids:DECKS[2],picker:()=>0,chooser:0});let pair=null;for(const a of g.players[0].deck){for(const b of g.players[1].deck){const s=STAT_FIELDS.find(f=>f.key!=='rank'&&card(a)[f.key]===card(b)[f.key]);if(s){pair=[a,b,s.key];break;}}if(pair)break;}assert.ok(pair,'Should have at least one cross-player tie in the deck');g.players[0].deck=[pair[0],...g.players[0].deck.filter(x=>x!==pair[0])];g.players[1].deck=[pair[1],...g.players[1].deck.filter(x=>x!==pair[1])];const t=takeTurn(g,0,pair[2]);assert.equal(t.pot.length,2);assert.equal(t.chooser,0);assert.equal(t.consecutiveTies,1);validate(t)});
test('bad actors and unknown stats cannot select',()=>{const g=newGame({picker:()=>0,chooser:0});assert.throws(()=>takeTurn(g,1,'rank'));assert.throws(()=>takeTurn(g,0,'money'))});
test('conservation across 1000 legal turns',()=>{let g=newGame({picker:()=>0,chooser:0});for(let i=0;i<1000&&g.status==='playing';i++){const who=g.chooser;const c=card(g.players[who].deck[0]);const key=STAT_FIELDS[(c.id+i)%8].key;g=takeTurn(g,who,key);validate(g);}assert.equal(g.total,50)});
test('balance calculation uses all eight categories for all pairs',()=>{for(const [n,pairs] of [[2,1225],[3,1770],[4,3160]]){const b=benchmark(DECKS[n]);assert.equal(b.pairs,pairs);assert.equal(b.comparisons,pairs*8)}});
test('power alternates only after every second consecutive tie',()=>{
 const g=newGame({ids:DECKS[2],picker:()=>0,chooser:0});
 let pair1=null,pair2=null;
 for(const a of g.players[0].deck)for(const b of g.players[1].deck){
  const k=STAT_FIELDS.find(x=>x.key!=='rank'&&card(a)[x.key]===card(b)[x.key]);
  if(!k)continue;
  if(!pair1)pair1=[a,b,k.key];
  else if(a!==pair1[0]&&b!==pair1[1]&&!pair2)pair2=[a,b,k.key];
 }
 assert.ok(pair1&&pair2,'Need two disjoint tied pairs in the curated deck');
 g.players[0].deck=[pair1[0],pair2[0],...g.players[0].deck.filter(id=>id!==pair1[0]&&id!==pair2[0])];
 g.players[1].deck=[pair1[1],pair2[1],...g.players[1].deck.filter(id=>id!==pair1[1]&&id!==pair2[1])];
 const t1=takeTurn(g,0,pair1[2]);assert.equal(t1.pot.length,2);assert.equal(t1.chooser,0);
 const t2=takeTurn(t1,0,pair2[2]);assert.equal(t2.pot.length,4);assert.equal(t2.chooser,1);
 const t3=takeTurn(t2,1,'rank');assert.equal(t3.pot.length,0);assert.equal(t3.consecutiveTies,0);
 assert.equal(t3.last.awarded.length,6);validate(t3);
});
test('two-player deck is balanced under all category comparisons',()=>{
 const b=benchmark(DECKS[2]);
 assert.equal(b.completeDominance,0);
 assert.ok(b.score.every(x=>x.rate>.44&&x.rate<.56),'All 50 cards must be within the agreed game-only win band');
});
