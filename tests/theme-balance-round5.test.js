// Round 5 targeted balance + taxonomy assertions. No game rules or API are changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_PACKS,THEME_IDS,DECK_SIZE,validatePack} from '../themes/packs/index.js';
import {PACK_ROSTERS,PACK_ENTRY_OVERRIDES} from '../themes/packs/rosters.js';
import {rosterAudit} from '../scripts/theme-fairness-audit.mjs';
import {startPackMatch,takeTurn,validateMatch} from '../themes/packs/engine.js';

const card=(theme,name)=>{
 const c=THEME_PACKS[theme].cards.find(c=>c.name===name);
 assert.ok(c,'Expected character '+theme+':'+name);return c;
};

test('560 identities, stable ordered 50/60/80 manifests, Rank-min contract and distinct cards survive',()=>{
 assert.equal(THEME_IDS.length,7);
 for(const id of THEME_IDS){
  const p=THEME_PACKS[id];assert.equal(p.cards.length,80);
  assert.equal(validatePack(p),true);
  assert.deepEqual(p.cards.map(c=>c.id),Array.from({length:80},(_,i)=>i+1));
  assert.equal(p.categories.length,8);
  assert.equal(p.categories[0].key,'rank');
  assert.equal(p.categories[0].direction,'min');
  assert.ok(p.categories.slice(1).every(c=>c.direction==='max'));
  for(const n of [2,3,4]){
   assert.equal(p.decks[n].length,DECK_SIZE[n]);
   assert.deepEqual(p.decks[n],p.cards.slice(0,DECK_SIZE[n]).map(c=>c.id),
    'Round 5 must not add/remove/reshuffle card IDs in manifest');
  }
 }
});

test('role annotations reference exactly one existing card and cannot overwrite Dhoni',()=>{
 const names=Object.fromEntries(Object.entries(PACK_ROSTERS).map(([id,groups])=>
  [id,new Set(groups.flatMap(g=>g.names))]));
 for(const [theme,entries] of Object.entries(PACK_ENTRY_OVERRIDES)){
  assert.ok(THEME_IDS.includes(theme));
  for(const [name,entry] of Object.entries(entries)){
   assert.ok(names[theme].has(name),'Override must name an existing roster card');
   assert.ok(typeof entry.role==='string'&&entry.role.length>1);
   const found=card(theme,name);
   assert.equal(found.role,entry.role);
   if(entry.group)assert.equal(found.group,entry.group);
  }
 }
 assert.equal(PACK_ENTRY_OVERRIDES.cricket['MS Dhoni'],undefined);
 const dhoni=card('cricket','MS Dhoni');
 assert.equal(dhoni.role,'keeper');
 assert.equal(dhoni.group,'Wicketkeepers & Captains');
 assert.equal(dhoni.stats.leadership,100);
 assert.equal(dhoni.stats.fielding,99);
});

test('cricket playing specialists no longer inherit a blanket allround role',()=>{
 for(const name of ['Mithali Raj','Smriti Mandhana','Meg Lanning','Beth Mooney','Laura Wolvaardt','Shafali Verma'])
  assert.equal(card('cricket',name).role,'bat',name);
 for(const name of ['Jhulan Goswami','Sophie Ecclestone'])
  assert.equal(card('cricket',name).role,'bowl',name);
 for(const name of ['Richa Ghosh','Alyssa Healy','Adam Gilchrist','Jos Buttler','Kumar Sangakkara']){
  const c=card('cricket',name);assert.equal(c.role,'keeper_bat',name);
  assert.ok(c.stats.fielding>=70,'Keeper skill should remain meaningful');
 }
 for(const name of ['Jacques Kallis','Sanath Jayasuriya','Glenn Maxwell','Yuvraj Singh'])
  assert.equal(card('cricket',name).role,'allround',name);
 for(const name of ['Mithali Raj','Jhulan Goswami','Smriti Mandhana','Alyssa Healy'])
  assert.equal(card('cricket',name).group,"Women's Cricket");
 assert.ok(card('cricket','Sophie Ecclestone').stats.bowling>
  card('cricket','Sophie Ecclestone').stats.batting,
  'The editorial bowling specialist must not inherit a batting-focused default');
});

test('tailed beasts, sage ancestors and trademarked identity distinctions are explicit',()=>{
 for(const name of ['Shukaku','Kurama','Gyuki']){
  const c=card('naruto',name);
  assert.equal(c.group,'Tailed Beasts');assert.equal(c.role,'tailed_beast');
  assert.ok(c.stats.chakra>c.stats.genjutsu);
 }
 for(const name of ['Hagoromo Otsutsuki','Hamura Otsutsuki']){
  const c=card('naruto',name);
  assert.equal(c.group,'Otsutsuki Ancestors');assert.equal(c.role,'sage');
  assert.ok(c.stats.ninjutsu>c.stats.taijutsu);
 }
 // Separate depictions are still editorially unresolved; never silently merge IDs.
 assert.notEqual(card('naruto','Tobi').id,card('naruto','Obito Uchiha').id);
 assert.notEqual(card('ben10','Ghostfreak').id,card('ben10',"Zs'Skayr").id);
});

test('three targeted thematic profiles retain their signature strengths with meaningful weak axes',()=>{
 const alien=card('ben10','Alien X');
 assert.equal(alien.stats.energy,100);assert.equal(alien.stats.versatility,100);
 assert.equal(alien.stats.technology,42);
 assert.ok(alien.stats.technology<alien.stats.energy);
 const makkari=card('avengers','Makkari');
 assert.equal(makkari.stats.speed,99);assert.ok(makkari.stats.speed>makkari.stats.strength);
 const wally=card('dc','Kid Flash (Wally West)');
 assert.equal(wally.stats.speed,97);assert.ok(wally.stats.speed>wally.stats.combat);
 const barry=card('dc','Flash (Barry Allen)');
 assert.equal(barry.stats.speed,100);
});

test('Shin-chan is unchanged: 20 distinct people each have four ORIGINAL situations',()=>{
 const names=new Map();
 for(const c of THEME_PACKS.shinchan.cards){
  assert.equal(c.kind,'original_situation');
  const [person,scene]=c.name.split(' — ');
  assert.ok(person&&scene);
  const entries=names.get(person)||new Set();entries.add(scene);names.set(person,entries);
 }
 assert.equal(names.size,20);
 assert.ok([...names.values()].every(x=>x.size===4));
});

test('full roster balance diagnostics count 560 cards and expose remaining risks, not fictional canon',()=>{
 const audit=rosterAudit();
 assert.equal(audit.inventory,560);
 let alerts=0;
 for(const t of audit.themes){
  assert.equal(t.inventory,80);
  assert.ok(t.decks[4].sevenOfEightPairs>=0);
  assert.equal(t.decks[4].category.rank.tiePairs,0);
  alerts+=t.severityCounts.high+t.severityCounts.medium;
  console.log('ROUND5 STATIC MEASURE '+JSON.stringify({
   theme:t.id,severity:t.severityCounts,
   dominantPairs:[t.decks[2].sevenOfEightPairs,t.decks[3].sevenOfEightPairs,t.decks[4].sevenOfEightPairs],
   strength:t.decks[4].winFractionRange,
   fiftyAgainstFull:t.decks[2].fullRosterRelativeAvg,
   sixtyAgainstFull:t.decks[3].fullRosterRelativeAvg,
   worstCards:t.highestRisk.slice(0,4)
  }));
 }
 assert.ok(alerts>0,'No human review may be automatically replaced by a scoring pass');
});

test('2/3/4-player turn mechanics, private future cards and card conservation are unchanged',()=>{
 let seed=21021;const pick=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
 for(const id of THEME_IDS)for(const n of [2,3,4]){
  let state=startPackMatch({themeId:id,playerCount:n,pick,chooser:0});
  for(let round=0;round<64&&state.status==='playing';round++){
   const before=state.total;
   const top=state.players[state.chooser].deck[0];
   assert.ok(Number.isInteger(top));
   const category=THEME_PACKS[id].categories[round%8].key;
   state=takeTurn(state,state.chooser,category);
   assert.equal(validateMatch(state),true);
   assert.equal(state.players.reduce((a,p)=>a+p.deck.length,0)+state.pot.length,before);
   const unplayed=new Set(state.players.flatMap(p=>p.deck).concat(state.pot));
   assert.equal(unplayed.size,state.total);
  }
 }
});
