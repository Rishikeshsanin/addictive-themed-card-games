import {DECKS, STAT_FIELDS, card} from '../src/catalog.js';
import {newGame, takeTurn} from '../src/engine.js';
// Reproducible heuristic simulation, NOT an official rating or promise about real players.
// Run: node scripts/simulate.js [match_count]
const matches=Math.min(10000,Math.max(1,Number(process.argv[2]||2000)));
let state=13454;
function random(){state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}
function picker(n){return Math.floor(random()*n)}
const strength=new Map();
for(const id of DECKS[2]){
 const c=card(id);
 const vals=STAT_FIELDS.map(s=>DECKS[2].reduce((count,other)=>{
  if(other===id)return count;
  const v=card(other)[s.key];return count+(c[s.key]===v?.5:(s.direction==='min'?c[s.key]<v:c[s.key]>v)?1:0);
 },0));
 strength.set(id,STAT_FIELDS[vals.indexOf(Math.max(...vals))].key);
}
const rounds=[],cycles=[],firstWins=[];
for(let i=0;i<matches;i++){
 const start=i%2, seen=new Set();let game=newGame({ids:DECKS[2],chooser:start,picker}),finish='complete';
 for(let k=0;k<3000&&game.status==='playing';k++){
  const stateKey=game.players[0].deck.join(',')+'|'+game.players[1].deck.join(',')+'|'+game.pot.join(',')+'|'+game.chooser+'|'+game.consecutiveTies%2;
  if(seen.has(stateKey)){finish='cycle';break}
  seen.add(stateKey);
  const top=game.players[game.chooser].deck[0];
  game=takeTurn(game,game.chooser,strength.get(top));
 }
 if(game.status!=='finished')finish=finish==='cycle'?'cycle':'round-cap';
 if(finish!=='complete')cycles.push(finish);
 else {rounds.push(game.round);firstWins.push(game.winner===start?1:0)}
}
rounds.sort((a,b)=>a-b);
const pct=n=>Math.round(n*1000)/10;
console.log(JSON.stringify({simulations:matches,finished:rounds.length,stalled:cycles.length,firstChooserWinRate:pct(firstWins.reduce((a,b)=>a+b,0)/Math.max(1,firstWins.length)),medianRounds:rounds[Math.floor(rounds.length/2)]??null,p90Rounds:rounds[Math.floor(rounds.length*.9)]??null,p99Rounds:rounds[Math.floor(rounds.length*.99)]??null,model:'deterministic global top-percentile chooser; initial shuffles seeded'},null,2));
if(cycles.length>0)console.error('NOTICE: Stalled states found. Resolve long-match behavior before full release.');
