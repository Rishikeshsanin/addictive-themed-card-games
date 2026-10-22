import test from 'node:test';import assert from 'node:assert/strict';
import {THEME_IDS,THEME_PACKS,getTheme,getCard,DECK_SIZE,HAND_SIZE,validatePack} from '../themes/packs/index.js';
import {startPackMatch,validateMatch,takeTurn,viewFor,compareCards,shuffle,bestBlindCategory} from '../themes/packs/engine.js';
test('Seven full playable theme manifests provide 50/60/80 distinct cards',()=>{
 assert.deepEqual([...THEME_IDS],['avengers','ben10','shinchan','dc','naruto','cricket','fantasy']);
 for(const id of THEME_IDS){
  const p=getTheme(id);assert.equal(p.cards.length,80,id);assert.equal(validatePack(p),true);
  assert.equal(new Set(p.cards.map(c=>c.name)).size,80,id);
  assert.equal(p.categories.length,8,id);
  assert.equal(p.categories[0].direction,'min',id);
  assert.ok(p.categories.slice(1).every(c=>c.direction==='max'),id);
  for(const n of [2,3,4]){assert.equal(p.decks[n].length,DECK_SIZE[n],id+' '+n);assert.equal(new Set(p.decks[n]).size,DECK_SIZE[n]);}
 }
});
test('Each theme owns appropriate categories and provenance',()=>{
 assert.deepEqual(getTheme('ben10').categories.map(c=>c.key),['rank','strength','speed','durability','intellect','technology','versatility','energy']);
 assert.deepEqual(getTheme('shinchan').categories.map(c=>c.key),['rank','mischief','comedy','courage','imagination','friendship','speed','luck']);
 assert.deepEqual(getTheme('naruto').categories.map(c=>c.key),['rank','chakra','taijutsu','ninjutsu','genjutsu','speed','strategy','endurance']);
 assert.deepEqual(getTheme('cricket').categories.map(c=>c.key),['rank','batting','bowling','fielding','leadership','clutch','consistency','athleticism']);
 assert.equal(getTheme('fantasy').rights,'original');
 assert.equal(getTheme('shinchan').cards.filter(c=>c.kind==='original_situation').length,80);
 assert.equal(getTheme('cricket').cards.some(c=>c.provenance==='verified_career_statistics'),false);
 assert.equal(getCard('avengers',1).name,'Iron Man');
 assert.ok(getCard('avengers',1).stats.intellect>getCard('avengers',1).stats.strength);
 assert.ok(getTheme('ben10').cards.find(c=>c.name==='XLR8').stats.speed>getTheme('ben10').cards.find(c=>c.name==='Four Arms').stats.speed);
 assert.ok(getTheme('dc').cards.find(c=>c.name==='Flash (Barry Allen)').stats.speed>getTheme('dc').cards.find(c=>c.name==='Batman').stats.speed);
});
test('2/3/4 hand sizes, rank rule, card secrecy and conservation',()=>{
 for(const id of THEME_IDS)for(const n of [2,3,4]){
  const s=startPackMatch({themeId:id,playerCount:n,pick:()=>0,chooser:0});
  assert.equal(s.players.length,n);assert.equal(s.total,DECK_SIZE[n]);
  assert.deepEqual(s.players.map(p=>p.deck.length),Array(n).fill(HAND_SIZE[n]));
  assert.equal(validateMatch(s),true);
  const view=viewFor(s,0);assert.equal(view.counts.reduce((a,b)=>a+b,0),DECK_SIZE[n]);
  assert.equal(view.topCard.id,s.players[0].deck[0]);assert.equal(view.players,undefined);
  assert.equal(JSON.stringify(view).includes('"deck"'),false);
  assert.equal(compareCards(id,s.players[0].deck[0],s.players[1].deck[0],'rank'),getCard(id,s.players[0].deck[0]).stats.rank<getCard(id,s.players[1].deck[0]).stats.rank?0:1);
  assert.throws(()=>takeTurn(s,1,'rank'),/Only the current caller/);
  assert.throws(()=>takeTurn(s,0,'invalid_category'),/Invalid category/);
 }
});
test('Gameplay ties put cards into jackpot; next win clears it',()=>{
 for(const id of THEME_IDS){
  let s=startPackMatch({themeId:id,playerCount:2,pick:()=>0,chooser:0});
  const p=getTheme(id),first=s.players[0].deck,second=s.players[1].deck;
  let pair=null;
  for(const stat of p.categories.slice(1)){
   for(const a of first){
    const b=second.find(x=>getCard(id,x).stats[stat.key]===getCard(id,a).stats[stat.key]);
    if(b!==undefined){pair=[a,b,stat.key];break}
   }
   if(pair)break;
  }
  assert.ok(pair,'At least one cross-seat tie in '+id);
  const [a,b,key]=pair;
  for(const [deck,wanted] of [[first,a],[second,b]]){
   const ix=deck.indexOf(wanted);[deck[0],deck[ix]]=[deck[ix],deck[0]];
  }
  assert.equal(validateMatch(s),true);
  const t=takeTurn(s,0,key);
  assert.equal(t.last.kind,'tie',id);assert.equal(t.pot.length,2);
  assert.equal(validateMatch(t),true);
  const win=takeTurn(t,t.chooser,'rank');
  assert.equal(win.pot.length,0);assert.equal(win.last.awarded,4);assert.equal(validateMatch(win),true);
 }
});
test('Blind bot may only choose using its own card and pack-wide distribution',()=>{
 const s=startPackMatch({themeId:'naruto',playerCount:3,pick:()=>0,chooser:1});
 const key=bestBlindCategory(s,1);
 assert.ok(getTheme('naruto').categories.some(c=>c.key===key));
 assert.throws(()=>bestBlindCategory(s,0),/No eligible caller/);
});
test('Every pack safely executes many concurrent-format logical turns',()=>{
 let seed=81023;const pick=n=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)%n};
 for(const id of THEME_IDS)for(const n of [2,3,4]){
   let s=startPackMatch({themeId:id,playerCount:n,pick});
   for(let turn=0;turn<360&&s.status==='playing';turn++){
     const before=JSON.stringify(s);
     const category=getTheme(id).categories[pick(8)].key;
     s=takeTurn(s,s.chooser,category);
     assert.equal(validateMatch(s),true);
     assert.notEqual(JSON.stringify(s),before);
   }
 }
});
test('Avoid duplicated cards in random shuffle, and reject invalid options',()=>{
 assert.deepEqual(shuffle([1,2,3],()=>0),[2,3,1]);
 assert.throws(()=>shuffle([1,2],()=>100),/Invalid random index/);
 assert.throws(()=>startPackMatch({themeId:'missing'}),/Unknown theme/);
 assert.throws(()=>startPackMatch({themeId:'avengers',playerCount:5}),/Only 2, 3, 4/);
});