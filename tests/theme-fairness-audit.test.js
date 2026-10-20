// Round 4 theme pack validation. Does not edit rules, scores or roster contents.
import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_PACKS,THEME_IDS,DECK_SIZE,HAND_SIZE} from '../themes/packs/index.js';
import {AUDIT_SEED,rosterAudit,seedFor,rng32,runMatch,study,bestCategories,cardsCsv} from '../scripts/theme-fairness-audit.mjs';
const packKeys=['avengers','ben10','shinchan','dc','naruto','cricket','fantasy'];

test('all seven thematic 80-card rosters use eight meaningful typed comparisons',()=>{
 assert.deepEqual(THEME_IDS,packKeys);
 const inventory=rosterAudit();
 assert.equal(inventory.inventory,560);
 assert.equal(inventory.themeCount,7);
 assert.equal(inventory.allCards.length,560);
 assert.equal(new Set(inventory.allCards.map(c=>c.themeId+':'+c.id)).size,560);
 for(const p of inventory.themes){
  assert.equal(p.inventory,80);
  assert.deepEqual(p.duplicateCanonicalLabels,[]);
  assert.equal(p.categoryKeys.length,8);
  assert.equal(p.categories[0].key,'rank');
  assert.equal(p.categories[0].direction,'min');
  assert.ok(p.categories.slice(1).every(c=>c.direction==='max'&&c.definition.length>8));
  for(const n of [2,3,4]){
   assert.equal(p.decks[n].cards,DECK_SIZE[n]);
   assert.ok(p.decks[n].winFractionRange[0]>=0&&p.decks[n].winFractionRange[1]<=1);
   assert.equal(p.decks[n].category.rank.tiePairs,0);
   assert.equal(p.decks[n].category.rank.distinctValues,DECK_SIZE[n]);
  }
 }
 for(const c of inventory.allCards){
  assert.equal(Object.keys(c.stats).length,8);
  assert.equal(c.inDecks.includes(4),true);
  assert.ok(Number.isFinite(c.winRate80));
  assert.ok(['critical','high','medium','low','none'].includes(c.severity));
 }
});
test('Cricket Dhoni specialism is preserved, and vague women’s allround taxonomy is diagnosed',()=>{
 const ms=THEME_PACKS.cricket.cards.find(x=>x.name==='MS Dhoni');
 assert.ok(ms);assert.equal(ms.role,'keeper');assert.equal(ms.group,'Wicketkeepers & Captains');
 const inv=rosterAudit();
 assert.ok(inv.allCards.some(c=>c.themeId==='cricket'&&c.name==='Mithali Raj'&&c.flags.some(f=>f.includes('taxonomy_loss'))));
 assert.ok(inv.allCards.some(c=>c.themeId==='cricket'&&c.name==='MS Dhoni'&&c.review.some(r=>r.reason.includes('MUST remain'))));
});
test('Shin-chan packs 20 identifiable characters x exactly four invented scenarios, not aliases',()=>{
 const pack=THEME_PACKS.shinchan;
 const cases=['Playtime Challenge','Festival Adventure','Secret Mission','Surprise Showdown'];
 const seen=new Map();
 for(const c of pack.cards){
  assert.equal(c.kind,'original_situation');
  const [character,scenario]=c.name.split(' — ');
  assert.ok(character);
  assert.ok(cases.includes(scenario));
  const entries=seen.get(character)||new Set();entries.add(scenario);seen.set(character,entries);
 }
 assert.equal(seen.size,20);
 assert.ok([...seen.values()].every(s=>s.size===4));
 assert.equal(rosterAudit().themes.find(p=>p.id==='shinchan').scenario.exactFour,true);
});
test('first 50/60/80 manifests retain intended hand sizes but disclose every additional card bias',()=>{
 const inventory=rosterAudit();
 for(const p of inventory.themes){
  for(const n of [2,3,4]){
   assert.equal(THEME_PACKS[p.id].decks[n].length,n*HAND_SIZE[n]);
   const group=p.decks[n];assert.ok(group.sevenOfEightPairs>=0);
   assert.equal(group.category.rank.tieRate,0);
  }
  assert.equal(p.decks[4].fullRosterRelativeAvg,0.5);
  const s=inventory.allCards.filter(c=>c.themeId===p.id);
  assert.equal(s.filter(c=>c.inDecks.includes(2)).length,50);
  assert.equal(s.filter(c=>c.inDecks.includes(3)).length,60);
 }
});
test('fixed seeds replay exact same shuffle, outcome, tie and source-specific category decisions',()=>{
 const id='ben10',s=seedFor(AUDIT_SEED,id,3,2),shuffleSeed=seedFor(AUDIT_SEED,id,3,3);
 assert.equal(s,seedFor(AUDIT_SEED,id,3,2));assert.notEqual(s,shuffleSeed);
 const a=rng32(s),b=rng32(s);
 assert.deepEqual(Array.from({length:8},()=>a()),Array.from({length:8},()=>b()));
 const options={themeId:id,size:3,seed:s,chooser:1,method:'best',cap:400};
 assert.deepEqual(runMatch(options),runMatch(options));
 assert.ok(['cycle','round-cap','finished'].includes(runMatch(options).outcome));
 assert.ok([...bestCategories(THEME_PACKS.ben10,3).values()].every(x=>THEME_PACKS.ben10.categories.some(c=>c.key===x)));
 assert.throws(()=>runMatch({...options,size:5}),/Invalid/);
 assert.throws(()=>runMatch({...options,method:'oracle'}),/Invalid/);
});
test('round cap is explicit right censoring, not falsely reported as match termination',()=>{
 const result=runMatch({themeId:'shinchan',size:4,seed:123456,chooser:0,method:'random',cap:10});
 assert.ok(['round-cap','finished','cycle'].includes(result.outcome));
 if(result.outcome!=='finished')assert.equal(result.winner,null);
 assert.ok(result.rounds<=10);
 assert.ok(result.maxPot>=0&&result.maxPot<=80);
 assert.ok(result.maxAward>=0&&result.maxAward<=80);
});
test('every 560-card editorial row is CSV-exportable with severity and per-theme stats',()=>{
 const inventory=rosterAudit();
 const csv=cardsCsv(inventory);
 assert.equal(csv.split('\n').length,561);
 assert.ok(csv.includes('MS Dhoni'));
 assert.ok(csv.includes('Alien X'));
 assert.ok(csv.includes('original_situation')===false); // csv writes provenance/group/role, not kind
 assert.ok(inventory.allCards.some(c=>c.flags.length>0));
});
test('reproducible seven-theme 2/3/4-seat seeded fairness and long-match controls',()=>{
 const options={seeds:4,seed:AUDIT_SEED,cap:1200,methods:['best','random','rank']};
 const outcome=study(options);
 assert.equal(outcome.scenarios.length,7*3*3);
 assert.equal(outcome.attempts,7*(2+3+4)*4*3);
 for(const s of outcome.scenarios){
  assert.equal(s.finished+s.roundCap+s.cycle,s.attempted);
  assert.equal(s.winningSeats.reduce((a,b)=>a+b,0),s.finished);
  assert.equal(s.categoryCalls.rank>=0,true);
  assert.equal(Object.values(s.categoryCalls).reduce((a,b)=>a+b,0),s.allRounds);
  assert.ok(s.maxPot<=DECK_SIZE[s.size]);
  assert.ok(s.maxAward<=DECK_SIZE[s.size]);
  assert.ok(s.fullyFinishedBlocks<=4);
  assert.ok(s.medianRounds===null||s.medianRounds<=1200);
 }
 const sample=study({...options,seeds:2});
 assert.deepEqual(sample,study({...options,seeds:2}),'Seeded study cannot depend on ambient RNG');
 // Publish compact per-theme numbers in GitHub Actions logs for documentation.
 for(const id of packKeys){
  const rows=outcome.scenarios.filter(x=>x.themeId===id);
  console.log('THEME FAIRNESS MEASURE '+JSON.stringify({theme:id,scenarios:rows.map(s=>({
   n:s.size,strategy:s.method,attempted:s.attempted,finished:s.finished,capped:s.roundCap,cycle:s.cycle,
   firstChooser:s.firstChooserRateFullyCompleteBlocks,seatWins:s.winningSeats,
   median:s.medianRounds,p90:s.p90Rounds,longest:s.longestRounds,ties:s.tieRounds,
   maxPot:s.maxPot,maxAward:s.maxAward}))}));
 }
});
