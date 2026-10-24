import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_IDS,getTheme} from '../themes/packs/index.js';
import {QUICK_ROUND_LIMIT,RULESETS,startPackMatch,takeTurn,viewFor,validateMatch,chooseBotCategory,bestBlindCategory} from '../themes/packs/engine.js';

const seeded=(initial)=>{let seed=initial>>>0;return bound=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%bound}};

test('Classic game rules remain default, uncapped and structurally unchanged',()=>{
 const g=startPackMatch({themeId:'avengers',playerCount:2,pick:seeded(123),chooser:0});
 assert.equal(g.ruleset,'classic');assert.equal(g.roundLimit,null);
 g.round=200;const next=takeTurn(g,0,'rank');
 assert.equal(next.ruleset,'classic');assert.equal(next.roundLimit,null);
 assert.equal(next.endReason==='round-limit',false);
 assert.equal(validateMatch(next),true);
});

test('Quick Clash limits are separately configured for 2/3/4 players and never affect Classic',()=>{
 assert.deepEqual(QUICK_ROUND_LIMIT,{2:35,3:42,4:48});
 assert.deepEqual(RULESETS,['classic','quick']);
 for(const id of THEME_IDS)for(const count of [2,3,4]){
  const g=startPackMatch({themeId:id,playerCount:count,pick:seeded(100+count),chooser:0,ruleset:'quick'});
  assert.equal(g.roundLimit,QUICK_ROUND_LIMIT[count]);
  assert.equal(g.total,count===2?50:count===3?60:80);
  assert.equal(validateMatch(g),true);
  assert.equal(viewFor(g,0).ruleset,'quick');
  assert.equal(viewFor(g,0).roundLimit,QUICK_ROUND_LIMIT[count]);
 }
 assert.throws(()=>startPackMatch({themeId:'avengers',ruleset:'secret'}),/Unknown match ruleset/);
});

test('Quick Clash safely completes all 12 themes at 2/3/4 seats with seeded blind bot play',()=>{
 for(const [themeIndex,id] of THEME_IDS.entries())for(const n of [2,3,4])for(let i=0;i<4;i++){
  const pick=seeded(themeIndex*392+n*102+i);
  let state=startPackMatch({themeId:id,playerCount:n,chooser:i%n,pick,ruleset:'quick'});
  for(let k=0;k<120&&state.status==='playing';k++){
   const key=state.round>=state.roundLimit&&state.pot.length>0?'rank':state.chooser===0?
    getTheme(id).categories[pick(8)].key:chooseBotCategory(state,state.chooser,{difficulty:'normal',pick});
   state=takeTurn(state,state.chooser,key);
   assert.equal(validateMatch(state),true);
  }
  assert.equal(state.status,'finished',id+' '+n+' players case '+i);
  assert.ok(state.round<=state.roundLimit+1,'Jackpot settlement only one extra decisive round');
  assert.equal(state.players.reduce((sum,p)=>sum+p.deck.length,0)+state.pot.length,state.total);
  assert.equal(state.pot.length,0,'No jackpot may remain unclaimed');
  assert.ok(['round-limit','elimination'].includes(state.endReason));
  if(state.endReason==='round-limit'){
   assert.ok(state.quickResult);
   const high=Math.max(...state.quickResult.counts);
   assert.equal(state.quickResult.counts[state.winner],high,'Winner must hold the most cards');
   assert.equal(state.quickResult.counts.reduce((a,b)=>a+b,0),state.total);
  }
 }
});

test('A jackpot at the Quick Clash deadline is settled by mandatory Rank, preserving every card',()=>{
 const id='shinchan';
 const g=startPackMatch({themeId:id,playerCount:2,pick:()=>0,chooser:0,ruleset:'quick'});
 const p=getTheme(id);
 let pair=null;
 for(const stat of p.categories.slice(1)){for(const a of g.players[0].deck){
  const b=g.players[1].deck.find(b=>p.cards[a-1].stats[stat.key]===p.cards[b-1].stats[stat.key]);
  if(b!==undefined){pair=[a,b,stat.key];break}
 }if(pair)break}
 assert.ok(pair,'Test requires a possible same-category tie');
 for(const [deck,id] of [[g.players[0].deck,pair[0]],[g.players[1].deck,pair[1]]]){
  const j=deck.indexOf(id);[deck[0],deck[j]]=[deck[j],deck[0]];
 }
 g.round=g.roundLimit-1;
 const tied=takeTurn(g,0,pair[2]);
 assert.equal(tied.status,'playing');
 assert.equal(tied.pot.length,2);
 assert.equal(tied.round,tied.roundLimit);
 assert.throws(()=>takeTurn(tied,tied.chooser,pair[2]),/Resolve the jackpot with Rank first/);
 const settled=takeTurn(tied,tied.chooser,'rank');
 assert.equal(settled.status,'finished');assert.equal(settled.endReason,'round-limit');
 assert.equal(settled.pot.length,0);
 assert.equal(validateMatch(settled),true);
});

test('Bot difficulty never reads private rival decks; invalid selections are rejected',()=>{
 const pick=seeded(963);
 const s=startPackMatch({themeId:'wwe',playerCount:4,chooser:2,pick,ruleset:'quick'});
 assert.equal(chooseBotCategory(s,2,{difficulty:'expert'}),bestBlindCategory(s,2));
 for(const difficulty of ['easy','normal','expert']){
  for(let i=0;i<12;i++){const chosen=chooseBotCategory(s,2,{difficulty,pick});assert.ok(getTheme('wwe').categories.some(cat=>cat.key===chosen));}
 }
 assert.throws(()=>chooseBotCategory(s,2,{difficulty:'impossible'}),/Unknown bot difficulty/);
 assert.throws(()=>chooseBotCategory(s,0,{difficulty:'expert'}),/No eligible caller/);
 const stripped=structuredClone(s);
 stripped.players[0].deck.reverse();stripped.players[1].deck.reverse();
 // Reordering hidden opponents must not change the expert selection.
 assert.equal(chooseBotCategory(stripped,2,{difficulty:'expert'}),chooseBotCategory(s,2,{difficulty:'expert'}));
});
