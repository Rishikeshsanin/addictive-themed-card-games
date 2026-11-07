import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_IDS,getTheme} from '../themes/packs/index.js';
import {startPackMatch,takeTurn,chooseBotCategory,validateMatch} from '../themes/packs/engine.js';

// Repeatable self-play diagnostic, not a substitute for human playtesting or
// a causal fairness experiment. No production data or opponent-deck peeking.
const rng=(seed0)=>{
 let seed=seed0>>>0;
 return bound=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%bound};
};
const percentile=(sorted,q)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(q*sorted.length)-1))];
function fullDominance(p){
 const stats=p.categories.slice(1).map(s=>s.key);
 let pairs=0;
 for(const a of p.cards)for(const b of p.cards){
  if(a===b)continue;
  if(stats.every(key=>a.stats[key]>b.stats[key]))pairs++;
 }
 return pairs;
}
test('VNext quick matches terminate and report theme/seat/skill diagnostic distributions',()=>{
 const all=[];
 const perTheme=[];
 for(const [t,id] of THEME_IDS.entries()){
  const rounds=[],categories=Object.create(null);
  let ties=0,firstWins=0,completed=0;
  for(const n of [2,3,4])for(const [d,difficulty] of ['easy','normal','expert'].entries())for(let iteration=0;iteration<6;iteration++){
   const pick=rng(923031+t*9919+n*1091+d*181+iteration*17);
   const first=iteration%n;
   let state=startPackMatch({themeId:id,playerCount:n,pick,chooser:first,ruleset:'quick'});
   for(let step=0;state.status==='playing'&&step<52;step++){
    const cat=chooseBotCategory(state,state.chooser,{difficulty,pick});
    categories[cat]=(categories[cat]||0)+1;
    state=takeTurn(state,state.chooser,cat);
    ties+=Number(state.last.kind==='tie');
    assert.equal(validateMatch(state),true);
   }
   assert.equal(state.status,'finished',id+'/'+n+'/'+difficulty+'/'+iteration);
   assert.equal(state.pot.length,0,'No unclaimed Quick Clash jackpot');
   assert.equal(state.players.reduce((sum,p)=>sum+p.deck.length,0),state.total,'No card loss');
   assert.ok(state.round<=state.roundLimit+1,'No runaway beyond jackpot-decider round');
   rounds.push(state.round);
   completed++;firstWins+=Number(state.winner===first);
   all.push({id,n,difficulty,rounds:state.round,firstWins:state.winner===first});
  }
  const sorted=[...rounds].sort((a,b)=>a-b);
  perTheme.push({theme:id,matches:completed,allSevenDominancePairs:fullDominance(getTheme(id)),firstChooserWinPct:Number((firstWins/completed*100).toFixed(1)),medianRounds:percentile(sorted,.5),p90Rounds:percentile(sorted,.9),p99Rounds:percentile(sorted,.99),ties,categoryCounts:categories});
 }
 assert.equal(all.length,12*3*3*6);
 const aggregate=[...all].sort((a,b)=>a.rounds-b.rounds);
 console.log('VNEXT_BALANCE_SELFPLAY='+JSON.stringify({matches:all.length,medianRounds:percentile(aggregate.map(x=>x.rounds),.5),p90Rounds:percentile(aggregate.map(x=>x.rounds),.9),p99Rounds:percentile(aggregate.map(x=>x.rounds),.99),themes:perTheme}));
});
