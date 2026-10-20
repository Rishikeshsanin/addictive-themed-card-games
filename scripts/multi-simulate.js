// Reproducible heuristic study, not a claim of real-human match duration.
// Run: node scripts/multi-simulate.js [games_per_player_count]
import {DECKS,card,STAT_FIELDS} from '../src/catalog.js';
import {startMultiGame,multiTurn} from '../src/multi-engine.js';
const count=Math.min(500,Math.max(1,parseInt(process.argv[2]||'100',10)));
let state=913251;const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296};
for(const n of [3,4]){
 const winners=[],rounds=[],stalled={cycles:0,cap:0};
 const best=new Map(DECKS[n].map(id=>{
  const mine=card(id);
  const scores=STAT_FIELDS.map(rule=>({key:rule.key,score:DECKS[n].reduce((p,other)=>p+(id!==other?(mine[rule.key]===card(other)[rule.key]?.5:(rule.direction==='min'?mine[rule.key]<card(other)[rule.key]:mine[rule.key]>card(other)[rule.key])?1:0):0),0)}));
  return [id,scores.sort((a,b)=>b.score-a.score)[0].key];
 }));
 for(let game=0;game<count;game++){
  const start=game%n,seen=new Set();
  let m=startMultiGame({playerCount:n,chooser:start,picker:k=>Math.floor(rand()*k)});
  let outcome='cap';
  for(let turn=0;turn<3000;turn++){
   if(m.status==='finished'){outcome='finish';break}
   const hash=m.players.map(p=>p.deck.join(',')).join('|')+'/'+m.pot.join(',')+'/'+m.chooser+'/'+m.consecutiveTies%2;
   if(seen.has(hash)){outcome='cycle';break}
   seen.add(hash);
   const top=m.players[m.chooser].deck[0];
   m=multiTurn(m,m.chooser,best.get(top));
  }
  if(m.status==='finished')outcome='finish';
  if(outcome==='finish'){winners.push(m.winner===start?1:0);rounds.push(m.round)}
  else stalled[outcome]++;
 }
 rounds.sort((a,b)=>a-b);
 const output={players:n,attempted:count,finished:rounds.length,stalled,chooserWinPct:Math.round(100*winners.reduce((a,b)=>a+b,0)/Math.max(winners.length,1)*10)/10,medianRounds:rounds[Math.floor(rounds.length/2)]??null,p90Rounds:rounds[Math.floor(.9*rounds.length)]??null,p99Rounds:rounds[Math.floor(.99*rounds.length)]??null,simulation:'heuristic best-category choice and seeded shuffles; not human play'};
 console.log(JSON.stringify(output,null,2));
}
