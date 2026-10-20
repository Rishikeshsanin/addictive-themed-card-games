// DeckVerse Round 4: reproducible, read-only audit of seven isolated theme prototypes.
// No DB/API/UI writes, no canonical rating claims, and no hidden-card information
// is used to choose a category. CI uses small seed batches; use CLI for larger studies.
import {THEME_IDS,THEME_PACKS,validatePack,DECK_SIZE,HAND_SIZE} from '../themes/packs/index.js';
import {startPackMatch,takeTurn} from '../themes/packs/engine.js';

export const AUDIT_SEED=20261021;
export const METHODS=Object.freeze(['best','random','rank']);
export const round=(x,d=3)=>x===null?null:Number(x.toFixed(d));
export const percentile=(arr,p)=>arr.length?[...arr].sort((a,b)=>a-b)[Math.floor((arr.length-1)*p)]:null;
const average=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:null;
const importantIds=new Set(['avengers','ben10','shinchan','dc','naruto','cricket','fantasy']);
const manualNotes=Object.freeze({
 'avengers:Thor':'Compare claimed energy/endurance with other cosmic characters; subjective numeric power, not official canon.',
 'avengers:Hulk':'Review maximum strength and endurance versus very low energy; category depends on definition of energy projection.',
 'ben10:Alien X':'Potential multi-stat ceiling/dominance; needs explicit limitations and era/version context.',
 'ben10:Grey Matter':'Intellect vs physical stats should remain distinct; check high technology and versatility editorial assumptions.',
 'ben10:XLR8':'Speed must be top-tier; distinguish alien-form speed from overall strength.',
 'ben10:Ghostfreak':'Potential identity/version overlap with Zs’Skayr; specify whether this is Ben transformation or villain.',
 "ben10:Zs'Skayr":'Potential identity/version overlap with Ghostfreak; clarify which independent depiction is intended.',
 'naruto:Obito Uchiha':'Tobi also occurs in roster; clarify era/version and avoid unlabelled duplicate identity.',
 'naruto:Tobi':'Could be a persona of Obito Uchiha; require a named version or deliberate alt-form policy.',
 'naruto:Rock Lee':'Taijutsu emphasis vs low genjutsu must be deliberate, avoid reading scores as canonical measures.',
 'naruto:Might Guy':'Review numerical balance of taijutsu and endurance vs ninjutsu/genjutsu.',
 'dc:Flash (Barry Allen)':'Speed is the signature axis; ensure version definition and distinction from other speedsters.',
 'dc:Kid Flash (Wally West)':'Explicit different civilian identity from Barry; verify speed-era consistency instead of treating as duplicate.',
 'cricket:MS Dhoni':'MUST remain group Wicketkeepers & Captains, role keeper. Preserve high leadership/fielding as editorial game traits.',
 'cricket:Mithali Raj':'Specialist batting role is obscured by umbrella Women’s Cricket/allround role; revise taxonomy, not unverified numbers.',
 'cricket:Jhulan Goswami':'Specialist bowling role is obscured by umbrella Women’s Cricket/allround role; revise taxonomy.',
 'cricket:Smriti Mandhana':'Specialist batting role is obscured by umbrella Women’s Cricket/allround role; revise taxonomy.',
 'cricket:Sophie Ecclestone':'Specialist bowling role is obscured by umbrella Women’s Cricket/allround role; revise taxonomy.',
 'cricket:Alyssa Healy':'Specialist wicketkeeping/batting role is obscured by umbrella Women’s Cricket/allround role; revise taxonomy.',
 'cricket:Richa Ghosh':'Specialist wicketkeeper-batter role is obscured by umbrella Women’s Cricket/allround role; revise taxonomy.',
 'cricket:Adam Gilchrist':'Wicketkeeper-batter appears under Batters; explicitly annotate keeping specialization.',
 'cricket:Jos Buttler':'Wicketkeeper-batter appears under Batters; explicitly annotate keeping specialization.',
 'cricket:Kumar Sangakkara':'Keeper-batter appears under Batters; annotate playing-era role before classification claims.',
 'cricket:Jacques Kallis':'All-rounder is grouped as Batter; adjust taxonomy before using role defaults.',
 'cricket:Sanath Jayasuriya':'All-round contributions not represented by Batter-only role; review playing era.',
 'cricket:Glenn Maxwell':'All-round contributions not represented by Batter-only role; review role label.',
 'fantasy:Ember Sprite':'Original creature, but scenario strength templates repeat across realms; check elemental identity is reflected in seven stats.'
});
const severityWeight={critical:4,high:3,medium:2,low:1,none:0};
export function rng32(seed){
 let x=(seed>>>0)||0x9e3779b9;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296};
}
export function seedFor(master,theme,size,index){
 let x=(master ^ Math.imul(size,0x85ebca6b) ^ Math.imul(index+1,0x9e3779b1))>>>0;
 for(let i=0;i<theme.length;i++) x=Math.imul(x^theme.charCodeAt(i),16777619)>>>0;
 x^=x>>>16;x=Math.imul(x,0x7feb352d)>>>0;x^=x>>>15;x=Math.imul(x,0x846ca68b)>>>0;
 return (x^x>>>16)>>>0||1;
}
function requireStudyOptions({seeds,seed,cap,methods}){
 if(!Number.isSafeInteger(seeds)||seeds<1||seeds>500)throw Error('seeds must be 1..500');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('seed must be unsigned uint32');
 if(!Number.isInteger(cap)||cap<10||cap>10000)throw Error('cap must be 10..10000');
 if(!Array.isArray(methods)||methods.length<1||methods.some(x=>!METHODS.includes(x))||
    new Set(methods).size!==methods.length)throw Error('invalid methods');
}
function directScores(pack,ids){
 const lookup=new Map(pack.cards.map(c=>[c.id,c]));
 const rates=new Map(ids.map(id=>[id,{points:0,dominates7:0,dominates8:0,dominated7:0,dominated8:0}]));
 const categories=Object.fromEntries(pack.categories.map(k=>[k.key,{ties:0,pairs:0,distinct:new Set()}]));
 for(const key of pack.categories)for(const id of ids)categories[key.key].distinct.add(lookup.get(id).stats[key.key]);
 let seven=0,eight=0;
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  const a=lookup.get(ids[i]).stats,b=lookup.get(ids[j]).stats;
  let aw=0,bw=0;
  for(const rule of pack.categories){
   const ca=a[rule.key],cb=b[rule.key];
   const cat=categories[rule.key];cat.pairs++;
   if(ca===cb){cat.ties++;rates.get(ids[i]).points+=.5;rates.get(ids[j]).points+=.5;}
   else if(rule.direction==='min'?ca<cb:ca>cb){aw++;rates.get(ids[i]).points++}
   else{bw++;rates.get(ids[j]).points++}
  }
  if(aw>=7||bw>=7){
   seven++;const w=aw>=7?ids[i]:ids[j],l=aw>=7?ids[j]:ids[i];
   rates.get(w).dominates7++;rates.get(l).dominated7++;
  }
  if(aw===8||bw===8){
   eight++;const w=aw===8?ids[i]:ids[j],l=aw===8?ids[j]:ids[i];
   rates.get(w).dominates8++;rates.get(l).dominated8++;
  }
 }
 const denominator=8*(ids.length-1);
 for(const x of rates.values())x.winRate=x.points/denominator;
 const wins=[...rates.values()].map(x=>x.winRate);
 return {cards:ids.length,pairs:ids.length*(ids.length-1)/2,sevenOfEightPairs:seven,eightOfEightPairs:eight,
  minCardRate:round(Math.min(...wins)),maxCardRate:round(Math.max(...wins)),
  meanCardRate:round(average(wins)),rates,
  categories:Object.fromEntries(Object.entries(categories).map(([key,v])=>
   [key,{tiePairs:v.ties,tieRate:round(v.ties/v.pairs,5),distinctValues:v.distinct.size,min:Math.min(...v.distinct),max:Math.max(...v.distinct)}]))};
}
function flagsFor(pack,card,full,manifests){
 const notes=[],tags=[];
 const rate=full.rates.get(card.id);
 const sev=(severity,key,message)=>{tags.push(severity+':'+key);notes.push({severity,key,reason:message})};
 if(rate.dominates8>=1)sev('high','all_category_domination','Wins all eight categories against '+rate.dominates8+' roster opponents');
 else if(rate.dominates7>=3)sev('high','seven_category_domination','Wins >=7 categories against '+rate.dominates7+' opponents');
 else if(rate.dominates7>0)sev('medium','seven_category_domination','Wins >=7 categories against '+rate.dominates7+' opponent(s)');
 if(rate.dominated8>=3)sev('medium','all_category_dominated','Loses every category against '+rate.dominated8+' opponents');
 if(rate.winRate>=.68||rate.winRate<=.32)sev('medium','aggregate_extreme','Static full-roster win fraction '+round(rate.winRate,3)+'; review magnitude');
 const nonrank=pack.categories.slice(1).map(c=>card.stats[c.key]);
 if(nonrank.filter(v=>v>=95).length>=5)sev('medium','ceiling_compression','At least five non-Rank categories score >=95, reducing differentiation');
 if(new Set(nonrank).size<=3)sev('medium','flat_profile','At most 3 distinct values across seven trait ratings');
 if(pack.id==='fantasy'){
  // Distinct realm labels must not automatically imply exact same category profile.
  const sameKind=pack.cards.filter(p=>p.name.split(' ').at(-1)===card.name.split(' ').at(-1));
  const identical=sameKind.filter(p=>p.id!==card.id&&pack.categories.slice(1).every(c=>p.stats[c.key]===card.stats[c.key]));
  if(identical.length)sev('medium','identical_realm_profile',identical.length+' different-realm card(s) have same seven stats');
 }
 const key=pack.id+':'+card.name;
 if(manualNotes[key]){
  let severity=key==='cricket:MS Dhoni'?'low':
    key.startsWith('cricket:')||key==='naruto:Tobi'||key==='naruto:Obito Uchiha'?'high':'medium';
  sev(severity,'editorial_context',manualNotes[key]);
 }
 if(pack.id==='cricket'&&card.group==="Women's Cricket"&&card.role==='allround'){
  sev('medium','taxonomy_loss','Women’s Cricket is a group, not necessarily an all-rounder playing position; requires role-level editorial audit');
 }
 if(pack.id==='shinchan'){
  const pieces=card.name.split(' — ');
  if(pieces.length!==2)sev('critical','scenario_format','Missing base-character and invented-scenario delimiter');
 }
 const deckPresence=[2,3,4].filter(n=>manifests[n].rates.has(card.id));
 const severity=notes.reduce((v,n)=>severityWeight[n.severity]>severityWeight[v]?n.severity:v,'none');
 return {id:card.id,name:card.name,group:card.group,role:card.role,kind:card.kind,
  provenance:card.provenance,stats:card.stats,winRate80:round(rate.winRate,4),
  winRate50:manifests[2].rates.has(card.id)?round(manifests[2].rates.get(card.id).winRate,4):null,
  winRate60:manifests[3].rates.has(card.id)?round(manifests[3].rates.get(card.id).winRate,4):null,
  inDecks:deckPresence,dominated7:rate.dominated7,dominates7:rate.dominates7,
  dominated8:rate.dominated8,dominates8:rate.dominates8,
  severity,flags:tags,review:notes};
}
export function rosterAudit(){
 const themes=[],allCards=[];
 for(const id of THEME_IDS){
  if(!importantIds.has(id))throw Error('unexpected theme '+id);
  const p=THEME_PACKS[id];
  validatePack(p);
  const mappings={};
  for(const n of [2,3,4]){
   if(p.decks[n].length!==DECK_SIZE[n])throw Error('Wrong manifest '+id+'/'+n);
   if(!p.decks[n].every(cid=>p.cards.some(c=>c.id===cid)))throw Error('Unknown card '+id);
   mappings[n]=directScores(p,p.decks[n]);
  }
  const normalized=new Map(),duplicate=[];
  for(const c of p.cards){
   const norm=c.name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
   if(normalized.has(norm))duplicate.push([normalized.get(norm),c.name]);
   normalized.set(norm,c.name);
  }
  const cardReviews=p.cards.map(c=>flagsFor(p,c,mappings[4],mappings));
  if(id==='cricket'){
   const dhoni=p.cards.find(c=>c.name==='MS Dhoni');
   if(!dhoni||dhoni.group!=='Wicketkeepers & Captains'||dhoni.role!=='keeper')
    throw Error('CRITICAL: MS Dhoni wicketkeeper/captain classification changed');
  }
  let scenario=null;
  if(id==='shinchan'){
   const ids=new Map();
   for(const c of p.cards){const [person,situation]=c.name.split(' — ');
    if(!person||!situation)throw Error('Missing Shin-chan scenario name');
    ids.set(person,new Set([...(ids.get(person)||[]),situation]));
   }
   scenario={baseCharacters:ids.size,scenariosPerCharacter:[...ids.values()].map(s=>s.size),
    exactFour:ids.size===20&&[...ids.values()].every(s=>s.size===4)};
   if(!scenario.exactFour)throw Error('Shin-chan must have exactly 20 original-character × 4 scenario cards');
  }
  const averageRelative=(n)=>round(average(p.decks[n].map(cid=>mappings[4].rates.get(cid).winRate)),5);
  const severe=cardReviews.filter(x=>x.severity==='high'||x.severity==='critical');
  const perGroup=Object.fromEntries([...new Set(p.cards.map(c=>c.group))].map(g=>[g,p.cards.filter(c=>c.group===g).length]));
  const result={id,name:p.name,rights:p.rights,categoryKeys:p.categories.map(x=>x.key),
   categories:p.categories.map(x=>({key:x.key,direction:x.direction,definition:x.meaning})),
   inventory:p.cards.length,duplicateCanonicalLabels:duplicate,scenario,perGroup,
   decks:Object.fromEntries([2,3,4].map(n=>[n,{cards:mappings[n].cards,
    sevenOfEightPairs:mappings[n].sevenOfEightPairs,eightOfEightPairs:mappings[n].eightOfEightPairs,
    winFractionRange:[mappings[n].minCardRate,mappings[n].maxCardRate],
    category:mappings[n].categories,
    fullRosterRelativeAvg:averageRelative(n)}])),
   severityCounts:Object.fromEntries(['critical','high','medium','low','none'].map(s=>[s,cardReviews.filter(c=>c.severity===s).length])),
   highestRisk:severe.slice(0,12).map(c=>({id:c.id,name:c.name,severity:c.severity,flags:c.flags}))};
  themes.push(result);allCards.push(...cardReviews.map(c=>({themeId:id,...c})));
 }
 return {version:1,themeCount:THEME_IDS.length,inventory:allCards.length,themes,allCards};
}
export function bestCategories(pack,size){
 const list=pack.decks[size],cards=new Map(pack.cards.map(c=>[c.id,c]));
 return new Map(list.map(id=>{
  const mine=cards.get(id).stats;
  const scored=pack.categories.map(s=>({
   key:s.key,score:list.reduce((total,other)=>{
    if(other===id)return total;
    const b=cards.get(other).stats[s.key];
    return total+(mine[s.key]===b?.5:(s.direction==='min'?mine[s.key]<b:mine[s.key]>b)?1:0);
   },0)
  }));
  scored.sort((a,b)=>b.score-a.score||pack.categories.findIndex(s=>s.key===a.key)-pack.categories.findIndex(s=>s.key===b.key));
  return [id,scored[0].key];
 }));
}
export function runMatch({themeId,size,seed,chooser,method='best',cap=1600,optimal=null}){
 const pack=THEME_PACKS[themeId];
 if(!pack||![2,3,4].includes(size)||!Number.isInteger(chooser)||chooser<0||chooser>=size)
  throw Error('Invalid theme/size/chooser');
 if(!METHODS.includes(method))throw Error('Invalid method');
 if(!Number.isInteger(cap)||cap<10||cap>10000)throw Error('Invalid cap');
 const random=rng32(seed),strategy=rng32((seed^0x9e3779b9)>>>0),pick=n=>Math.floor(random()*n);
 let s=startPackMatch({themeId,playerCount:size,pick,chooser}),ties=0,maxPot=0,maxAward=0;
 const categories=Object.fromEntries(pack.categories.map(c=>[c.key,0]));
 const chosen=optimal||bestCategories(pack,size),seen=new Set();
 let cycle=false;
 for(let k=0;k<cap&&s.status==='playing';k++){
  const snapshot=s.players.map(p=>p.deck.join(',')).join('|')+'#'+s.pot.join(',')+'#'+s.chooser+'#'+s.consecutiveTies;
  if(seen.has(snapshot)){cycle=true;break}
  seen.add(snapshot);
  const top=s.players[s.chooser].deck[0];
  const stat=method==='best'?chosen.get(top):method==='rank'?'rank':
   pack.categories[Math.floor(strategy()*pack.categories.length)].key;
  if(!stat)throw Error('No stat for selectable top card');
  categories[stat]++;
  s=takeTurn(s,s.chooser,stat);
  if(s.last.kind==='tie')ties++;
  maxPot=Math.max(maxPot,s.pot.length);maxAward=Math.max(maxAward,s.last.awarded);
 }
 const outcome=s.status==='finished'?'finished':cycle?'cycle':'round-cap';
 return {themeId,size,seed,chooser,method,outcome,winner:s.winner,rounds:s.round,ties,
  maxPot,maxAward,categories,firstChooserWin:s.status==='finished'&&s.winner===chooser,
  terminalPot:s.pot.length};
}
export function study({seeds=12,seed=AUDIT_SEED,cap=1600,methods=['best','random']}={}){
 requireStudyOptions({seeds,seed,cap,methods});
 const scenarios=[];
 for(const id of THEME_IDS)for(const size of [2,3,4]){
  const pack=THEME_PACKS[id],pre=bestCategories(pack,size);
  for(const method of methods){
   const runs=[],clusters=[];
   for(let i=0;i<seeds;i++){
    const currentSeed=seedFor(seed,id,size,i),block=[];
    for(let chooser=0;chooser<size;chooser++){
     const result=runMatch({themeId:id,size,seed:currentSeed,chooser,method,cap,optimal:pre});
     runs.push(result);block.push(result);
    }
    if(block.every(x=>x.outcome==='finished'))clusters.push(block.filter(x=>x.firstChooserWin).length/size);
   }
   const done=runs.filter(x=>x.outcome==='finished'),rounds=done.map(x=>x.rounds);
   const wins=Array(size).fill(0);
   for(const x of done)wins[x.winner]++;
   const calls=Object.fromEntries(pack.categories.map(c=>[c.key,runs.reduce((n,r)=>n+r.categories[c.key],0)]));
   const mean=average(clusters);
   const sd=clusters.length>1?Math.sqrt(clusters.reduce((v,x)=>v+(x-mean)**2,0)/(clusters.length-1)):null;
   const half=sd===null?null:1.96*sd/Math.sqrt(clusters.length);
   scenarios.push({themeId:id,size,method,seedBlocks:seeds,attempted:runs.length,finished:done.length,
    roundCap:runs.filter(x=>x.outcome==='round-cap').length,cycle:runs.filter(x=>x.outcome==='cycle').length,
    completion:round(runs.length?done.length/runs.length:0,4),winningSeats:wins,
    seatWinRateFinished:wins.map(w=>done.length?round(w/done.length,4):null),
    firstChooserRateFullyCompleteBlocks:mean===null?null:round(mean,4),
    firstChooserCI95:half===null?null:[round(Math.max(0,mean-half),4),round(Math.min(1,mean+half),4)],
    fullyFinishedBlocks:clusters.length,neutralRate:round(1/size,4),
    medianRounds:percentile(rounds,.5),p90Rounds:percentile(rounds,.9),p99Rounds:percentile(rounds,.99),
    longestRounds:rounds.length?Math.max(...rounds):null,maxPot:Math.max(0,...runs.map(x=>x.maxPot)),
    maxAward:Math.max(0,...runs.map(x=>x.maxAward)),
    tieRounds:runs.reduce((a,b)=>a+b.ties,0),allRounds:runs.reduce((a,b)=>a+b.rounds,0),
    categoryCalls:calls});
  }
 }
 return {seed,seeds,cap,methods,attempts:scenarios.reduce((n,s)=>n+s.attempted,0),
  schema:'7 themes × 2/3/4 players × all starting chooser seats per deterministic shuffled-seed block',
  strategy:'best chooses highest offline pairwise win-rate for own top-card (non-omniscient), random picks uniform category, rank always chooses Rank',
  censoring:'Incomplete rounds count as roundCap or repeated full-state cycle, not finishes. First-chooser CI only includes full seat-rotation seed blocks and is simulation-only.',
  scenarios};
}
export function cardsCsv(inventory=rosterAudit()){
 const header=['themeId','id','name','group','role','provenance','winRate80','winRate60','winRate50','severity',
  'dominates7','dominates8','dominated7','dominated8','inDecks','flags',
  ...THEME_PACKS.avengers.categories.map((x,i)=>'trait'+(i+1))];
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const rows=inventory.allCards.map(x=>{
  const pack=THEME_PACKS[x.themeId];return [x.themeId,x.id,x.name,x.group,x.role,x.provenance,x.winRate80,x.winRate60,x.winRate50,
   x.severity,x.dominates7,x.dominates8,x.dominated7,x.dominated8,x.inDecks.join('|'),x.flags.join('|'),
   ...pack.categories.map(c=>c.key+'='+x.stats[c.key])].map(q).join(',');
 });
 return [header.map(q).join(','),...rows].join('\n');
}
export function cardsMarkdown(inventory=rosterAudit()){
 const out=['# DeckVerse — Every-card editorial review (560 draft scores)',
  'All trait ratings are subjective *game design* numbers, not canonical facts. REVIEW severity is a heuristic, not a confirmed error.',
  'Generated by scripts/theme-fairness-audit.mjs. 50/60 win shares are blank for cards absent in that manifest.'];
 for(const pack of inventory.themes){
  out.push('## '+pack.name,'| # | Draft card / identity | Seven traits + Rank | 80-card win % | In 50 / 60 | Severity | Editorial reason |',
   '|---:|---|---|---:|---|---|---|');
  for(const c of inventory.allCards.filter(x=>x.themeId===pack.id)){
   const stats=pack.categories.map(key=>key.key+': '+c.stats[key.key]).join(', ');
   const reasons=c.review.length?c.review.map(x=>x.key+': '+x.reason).join('; '):'No automated rating anomaly found; human validation still required';
   const safe=text=>String(text).replaceAll('|','/').replaceAll('\n',' ');
   out.push('| '+c.id+' | '+safe(c.name)+' | '+stats+' | '+round(100*c.winRate80,2)+
    '% | '+(c.inDecks.includes(2)?'2P ':'')+(c.inDecks.includes(3)?'3P':'')+
    ' | '+c.severity.toUpperCase()+' | '+safe(reasons)+' |');
  }
 }
 return out.join('\n')+'\n';
}
function args(argv){
 const opt={};
 for(const part of argv){
  const m=/^--([a-z-]+)=(.+)$/.exec(part);
  if(!m)throw Error('Use --key=value');
  const [,key,val]=m;
  if(['seeds','seed','cap'].includes(key))opt[key]=Number(val);
  else if(key==='methods')opt.methods=val.split(',');
  else if(key==='output'&&['summary','cards-csv','cards-json','cards-markdown','full-json'].includes(val))opt.output=val;
  else throw Error('Unknown CLI parameter '+key);
 }
 return opt;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const {output='summary',...options}=args(process.argv.slice(2));
  const roster=rosterAudit();
  if(output==='cards-csv')console.log(cardsCsv(roster));
  else if(output==='cards-json')console.log(JSON.stringify(roster.allCards,null,2));
  else if(output==='cards-markdown')console.log(cardsMarkdown(roster));
  else{
   const sims=study(options);
   console.log(JSON.stringify(output==='full-json'?{roster,simulations:sims}:
    {inventory:roster.inventory,themes:roster.themes,simulations:sims},null,2));
  }
 }catch(err){console.error('THEME FAIRNESS AUDIT ERROR:',err.stack||err);process.exitCode=1}
}
