// Compare the protected production source with the actual VNext PR at matched seeds.
// This is a repeatable engineering benchmark, not a guarantee of fairness or enjoyment.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {THEME_IDS,getTheme} from '../themes/packs/index.js';
import * as currentEngine from '../themes/packs/engine.js';

const baselineRoot=process.env.BASELINE_ROOT;
assert.ok(baselineRoot,'Set BASELINE_ROOT to a detached checkout of the protected stable commit');
const load=async path=>import(pathToFileURL(resolve(baselineRoot,path)).href);
const base=await load('themes/packs/index.js');
const oldEngine=await load('themes/packs/engine.js');
assert.deepEqual(THEME_IDS,base.THEME_IDS,'Theme order and IDs must not change');
const safeRound=n=>Math.round(n*100)/100;
const pct=(numerator,denominator)=>denominator?safeRound(100*numerator/denominator):null;
const prng=initial=>{
 let seed=initial>>>0;
 return n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
};
const nth=(values,q)=>{
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];
};
const stats=values=>({samples:values.length,mean:values.length?safeRound(values.reduce((a,b)=>a+b,0)/values.length):null,p50:nth(values,.5),p90:nth(values,.9),p99:nth(values,.99),max:values.length?Math.max(...values):null});
function domination(pack){
 const keys=pack.categories.slice(1).map(s=>s.key);
 let total=0;for(const a of pack.cards)for(const b of pack.cards){
  if(a.id!==b.id&&keys.every(key=>a.stats[key]>b.stats[key]))total++;
 }
 return total;
}
const content=[];
let edited=0,reranked=0,regrouped=0,oldDom=0,newDom=0;
for(const id of THEME_IDS){
 const previous=base.getTheme(id),updated=getTheme(id);
 assert.equal(previous.cards.length,80);assert.equal(updated.cards.length,80);
 assert.deepEqual(previous.categories.map(s=>s.key),updated.categories.map(s=>s.key));
 const oldCards=new Map(previous.cards.map(c=>[c.id,c]));
 let dataChanged=0,ranksChanged=0,groupsChanged=0;
 for(const card of updated.cards){
  const old=oldCards.get(card.id);
  assert.ok(old&&old.name===card.name,'Deck identity or order changed: '+id+' '+card.id);
  const changed=updated.categories.slice(1).some(s=>old.stats[s.key]!==card.stats[s.key]);
  if(changed)dataChanged++;
  if(old.stats.rank!==card.stats.rank)ranksChanged++;
  if(old.group!==card.group||old.role!==card.role)groupsChanged++;
 }
 for(const n of [2,3,4])assert.deepEqual(updated.decks[n],previous.decks[n],'Deck manifests changed '+id+' '+n);
 const d0=domination(previous),d1=domination(updated);
 edited+=dataChanged;reranked+=ranksChanged;regrouped+=groupsChanged;oldDom+=d0;newDom+=d1;
 content.push({theme:id,ratingsEdited:dataChanged,rankOrderChanged:ranksChanged,groupOrRoleChanged:groupsChanged,oldDominancePairs:d0,newDominancePairs:d1,reductionPct:pct(d0-d1,d0)});
}
function playClassic(engine,id,n,trial,seed){
 const pick=prng(seed);
 const first=trial%n;
 let game=engine.startPackMatch({themeId:id,playerCount:n,chooser:first,pick});
 let moves=0,ties=0;
 for(;game.status==='playing'&&moves<1500;moves++){
  const stat=engine.bestBlindCategory(game,game.chooser);
  game=engine.takeTurn(game,game.chooser,stat);
  if(game.last.kind==='tie')ties++;
 }
 engine.validateMatch(game);
 return {finished:game.status==='finished',rounds:game.round,firstWon:game.status==='finished'&&game.winner===first,winner:game.winner,ties};
}
const classics={previous:[],current:[],pairedFinished:0,pairedSameWinner:0,pairedNewLessRounds:0,pairedNewMoreRounds:0};
for(const [t,id] of THEME_IDS.entries())for(const n of [2,3,4])for(let trial=0;trial<4;trial++){
 const seed=(732113+t*9971+n*1103+trial*89)>>>0;
 const old=playClassic(oldEngine,id,n,trial,seed),now=playClassic(currentEngine,id,n,trial,seed);
 classics.previous.push({...old,theme:id,players:n});
 classics.current.push({...now,theme:id,players:n});
 if(old.finished&&now.finished){
  classics.pairedFinished++;
  classics.pairedSameWinner+=Number(old.winner===now.winner);
  classics.pairedNewLessRounds+=Number(now.rounds<old.rounds);
  classics.pairedNewMoreRounds+=Number(now.rounds>old.rounds);
 }
}
const classicSummary=matches=>({
 matches:matches.length,
 finished:matches.filter(m=>m.finished).length,
 hit1500RoundSafetyLimit:matches.filter(m=>!m.finished).length,
 completedRoundStats:stats(matches.filter(m=>m.finished).map(m=>m.rounds)),
 longestObserved:Math.max(...matches.map(m=>m.rounds)),
 byPlayers:[2,3,4].map(n=>{
  const sample=matches.filter(m=>m.players===n),complete=sample.filter(m=>m.finished);
  return {players:n,matches:sample.length,finished:complete.length,firstChooserWinPct:pct(complete.filter(m=>m.firstWon).length,complete.length),neutralExpectedPct:safeRound(100/n),rounds:stats(complete.map(m=>m.rounds))};
 })
});
const quick=[];
for(const [t,id] of THEME_IDS.entries())for(const n of [2,3,4])for(const [d,difficulty] of ['easy','normal','expert'].entries())for(let trial=0;trial<16;trial++){
 const pick=prng((529811+t*7759+n*1267+d*333+trial*73)>>>0);
 const first=trial%n;
 let game=currentEngine.startPackMatch({themeId:id,playerCount:n,chooser:first,pick,ruleset:'quick'});
 let ties=0,moves=0;
 for(;game.status==='playing'&&moves<51;moves++){
  const stat=currentEngine.chooseBotCategory(game,game.chooser,{difficulty,pick});
  game=currentEngine.takeTurn(game,game.chooser,stat);
  ties+=Number(game.last.kind==='tie');
 }
 assert.equal(game.status,'finished','Quick must terminate '+id+' '+n+' '+difficulty+' '+trial);
 assert.equal(game.pot.length,0,'No quick jackpot left');
 assert.equal(game.players.reduce((acc,p)=>acc+p.deck.length,0),game.total,'Card conservation');
 assert.ok(game.round<=game.roundLimit+1,'Quick exceeds upper bound');
 quick.push({theme:id,players:n,difficulty,rounds:game.round,ties,firstWon:game.winner===first});
}
const quickSummary={
 matches:quick.length,finished:quick.length,
 rounds:stats(quick.map(m=>m.rounds)),
 byPlayers:[2,3,4].map(n=>{
  const sample=quick.filter(m=>m.players===n);
  return {players:n,samples:sample.length,firstChooserWinPct:pct(sample.filter(m=>m.firstWon).length,sample.length),neutralExpectedPct:safeRound(100/n),rounds:stats(sample.map(m=>m.rounds)),avgTieRounds:safeRound(sample.reduce((a,b)=>a+b.ties,0)/sample.length)};
 }),
 byDifficulty:['easy','normal','expert'].map(d=>{
  const sample=quick.filter(m=>m.difficulty===d);
  return {difficulty:d,samples:sample.length,rounds:stats(sample.map(m=>m.rounds))};
 })
};
const report={
 baseline:'aa57d25832fe2e200bfb65f8d89e3f40dd1b6fc1',
 current:process.env.GITHUB_SHA||'working-tree',
 coverage:{themes:THEME_IDS.length,cards:THEME_IDS.length*80,matchedClassicPairs:classics.previous.length,quickMatches:quick.length,allScenariosSeeded:true},
 content:{ratingsEdited:edited,rankOrderChanged:reranked,groupOrRoleChanged:regrouped,allSevenDominationPrevious:oldDom,allSevenDominationCurrent:newDom,dominationReductionPct:pct(oldDom-newDom,oldDom),themes:content},
 classic:{previous:classicSummary(classics.previous),current:classicSummary(classics.current),paired:{finishedOnBoth:classics.pairedFinished,sameWinner:classics.pairedSameWinner,newFinishedFaster:classics.pairedNewLessRounds,newFinishedSlower:classics.pairedNewMoreRounds}},
 quick:quickSummary,
 caveats:['Bot vs bot heuristic self-play; not human retention or preference measurement','Classic uses only 4 paired seeds per theme/player configuration and safety cap 1500 rounds','Quick is only available in VNext: shorter mode versus uncapped Classic is an intentionally different ruleset, not an equivalent-game speedup','First chooser rate has sampling error and must be compared to the correct 1/N neutral chance for each player count','Category domination is an imperfect proxy for counterplay, not a complete game balance score']
};
const summary=[
'# DeckVerse — same-seed protected baseline vs Gameplay VNext',
'',
'**Protected:** '+report.baseline,
'**VNext:** '+report.current,
'**Scope:** 12 packs × 80 cards; paired Classic heuristic matches and VNext Quick Clash.',
'',
'| Metric | Baseline | VNext |',
'|---|---:|---:|',
'| Seven-category dominating ordered pairs | '+oldDom+' | '+newDom+' |',
'| Same-card non-Rank ratings changed | — | '+edited+' |',
'| Ranked positions changed | — | '+reranked+' |',
'| Groups / roles changed | — | '+regrouped+' |',
'| Classic completed (of '+classics.previous.length+') | '+report.classic.previous.finished+' | '+report.classic.current.finished+' |',
'| Classic median rounds of completed matches | '+report.classic.previous.completedRoundStats.p50+' | '+report.classic.current.completedRoundStats.p50+' |',
'| Classic p90 rounds of completed matches | '+report.classic.previous.completedRoundStats.p90+' | '+report.classic.current.completedRoundStats.p90+' |',
'| Classic longest observed (capped at 1500) | '+report.classic.previous.longestObserved+' | '+report.classic.current.longestObserved+' |',
'| Quick Clash completed | N/A | '+quick.length+'/'+quick.length+' |',
'| Quick Clash median rounds | N/A | '+quickSummary.rounds.p50+' |',
'| Quick Clash p99 rounds | N/A | '+quickSummary.rounds.p99+' |',
'',
'**Note:** Classic matches use 4 matched seeds per theme/player count; these are not unbiased real-player win-rate estimates. Results are conditional on the stated deterministic bot policy and capped simulations.',
'',
'## Per-theme card dominance and edit coverage',
'',
'| Theme | Previous | VNext | Non-Rank cards edited | Rank changes | Group/role edits |',
'|---|---:|---:|---:|---:|---:|',
...content.map(x=>'| '+x.theme+' | '+x.oldDominancePairs+' | '+x.newDominancePairs+' | '+x.ratingsEdited+' | '+x.rankOrderChanged+' | '+x.groupOrRoleChanged+' |'),
'',
'## Quick Clash by player count',
'',
'| Players | Matches | First chooser wins | Neutral expectation | p50 | p90 | p99 |',
'|---|---:|---:|---:|---:|---:|---:|',
...quickSummary.byPlayers.map(x=>'| '+x.players+' | '+x.samples+' | '+x.firstChooserWinPct+'% | '+x.neutralExpectedPct+'% | '+x.rounds.p50+' | '+x.rounds.p90+' | '+x.rounds.p99+' |'),
'',
'## Limits',
...report.caveats.map(x=>'- '+x)
].join('\n')+'\n';
writeFileSync('/tmp/deckverse-vnext-comparison.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('/tmp/deckverse-vnext-comparison.md',summary);
console.log('VNEXT_COMPARISON_JSON='+JSON.stringify(report));
console.log('VNEXT_COMPARISON_MARKDOWN\n'+summary);
