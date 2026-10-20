// DeckVerse expansion pack definitions. All numerical comparisons are transparent,
// fictional GAMEPLAY ratings, never official comic/anime power levels or cricket stats.
// Original art and rights clearance required before publishing named franchise themes.
import {PACK_ROSTERS,PACK_ENTRY_OVERRIDES} from './rosters.js';
import {CHARACTERS as CURATED_AVENGERS} from './avengers-curated.js';

export const DECK_SIZE=Object.freeze({2:50,3:60,4:80});
export const HAND_SIZE=Object.freeze({2:25,3:20,4:20});
const stat=(key,name,meaning,direction='max')=>Object.freeze({key,name,meaning,direction});
const rank=stat('rank','RANK','Subjective gameplay rank. Lowest wins.','min');
const configs=[
 {id:'avengers',name:'Avengers Saga',emoji:'⚡',hue:38,tagline:'Heroes and villains collide',fields:[rank,stat('strength','STRENGTH','Raw physical force'),stat('combat','COMBAT','Close combat skill'),stat('defense','DEFENSE','Resilience and shields'),stat('speed','SPEED','Travel and reflexes'),stat('intellect','INTELLECT','Strategy and invention'),stat('energy','ENERGY','Mystical, cosmic and technical energy'),stat('endurance','ENDURANCE','Long-battle stamina')],base:{hero:[73,78,76,76,81,70,80],cosmic:[90,81,88,85,77,92,89],villain:[79,77,78,70,78,83,82]}},
 {id:'ben10',name:'Ben 10 Alien Clash',emoji:'👽',hue:115,tagline:'The ultimate Omnitrix matchup',fields:[rank,stat('strength','STRENGTH','Raw physical force'),stat('speed','SPEED','Movement and flight'),stat('durability','DURABILITY','Damage resistance'),stat('intellect','INTELLECT','Thinking and instincts'),stat('technology','TECH','Technical compatibility'),stat('versatility','VERSATILITY','Variety of useful powers'),stat('energy','ENERGY','Special-energy projection')],base:{alien:[78,73,76,65,62,77,70],tactician:[66,67,64,83,82,83,78]}},
 {id:'shinchan',name:'Shin-chan Chaos',emoji:'🖍️',hue:18,tagline:'Funny Kasukabe challenges',fields:[rank,stat('mischief','MISCHIEF','Harmless troublemaking'),stat('comedy','COMEDY','Comic timing'),stat('courage','COURAGE','Facing a funny challenge'),stat('imagination','IMAGINATION','Inventive ideas'),stat('friendship','FRIENDSHIP','Helping your friends'),stat('speed','SPEED','Reactions and escapes'),stat('luck','LUCK','Lucky outcomes')],base:{comic:[77,82,75,81,84,75,77]}},
 {id:'dc',name:'DC Legends',emoji:'🦇',hue:250,tagline:'Legends, heroes and adversaries',fields:[rank,stat('strength','STRENGTH','Physical might'),stat('combat','COMBAT','Fighting technique'),stat('defense','DEFENSE','Armor and resistance'),stat('speed','SPEED','Movement and reflexes'),stat('intellect','INTELLECT','Strategy and inventiveness'),stat('energy','ENERGY','Magic, tech and cosmic power'),stat('endurance','ENDURANCE','Staying power')],base:{hero:[82,83,82,77,79,81,84],agile:[67,88,72,88,80,67,75],villain:[79,79,76,73,84,81,79]}},
 {id:'naruto',name:'Naruto Shinobi Clash',emoji:'🥷',hue:27,tagline:'Ninja tactics decide the match',fields:[rank,stat('chakra','CHAKRA','Reserve and control'),stat('taijutsu','TAIJUTSU','Close-range technique'),stat('ninjutsu','NINJUTSU','Technique strength'),stat('genjutsu','GENJUTSU','Illusion techniques'),stat('speed','SPEED','Agility and reflexes'),stat('strategy','STRATEGY','Battle intelligence'),stat('endurance','ENDURANCE','Stamina')],base:{ninja:[73,81,79,68,79,78,76],legend:[93,88,92,83,88,91,92],villain:[86,83,88,81,78,84,85],tailed_beast:[96,77,91,48,78,63,97],sage:[93,70,94,85,76,96,85]}},
 {id:'cricket',name:'Cricket Legends',emoji:'🏏',hue:148,tagline:'Batting, bowling and clutch moments',fields:[rank,stat('batting','BATTING','Editorial batting-impact score, NOT official average'),stat('bowling','BOWLING','Editorial bowling-impact score, NOT wickets'),stat('fielding','FIELDING','Catching and agility gameplay rating'),stat('leadership','LEADERSHIP','Tactical gameplay rating'),stat('clutch','CLUTCH','High-pressure performance gameplay rating'),stat('consistency','CONSISTENCY','Long-term gameplay reliability'),stat('athleticism','ATHLETICISM','Stamina and agility')],base:{bat:[89,33,77,79,82,87,79],bowl:[36,90,79,75,84,87,80],allround:[79,78,83,82,84,87,82],keeper:[83,30,97,98,88,92,79],keeper_bat:[91,28,94,80,87,88,83]}},
 {id:'fantasy',name:'Elemental Realms',emoji:'🐉',hue:289,tagline:'Original elemental creatures',rights:'original',fields:[rank,stat('might','MIGHT','Physical force'),stat('agility','AGILITY','Movement'),stat('defense','DEFENSE','Protection'),stat('magic','MAGIC','Spell output'),stat('wisdom','WISDOM','Tactical awareness'),stat('stamina','STAMINA','Sustained strength'),stat('versatility','VERSATILITY','Range of powers')],base:{fantasy:[75,77,78,82,75,79,78]}}
];
const iconic={
 avengers:{'Iron Man':[62,82,91,75,99,92,78],'Captain America':[76,98,83,76,79,14,91],'Thor':[97,91,95,81,71,99,97],'Hulk':[100,75,98,67,85,20,100],'Scarlet Witch':[46,62,79,70,78,100,81],'Vision':[86,76,96,83,94,96,93],'Shuri':[40,64,68,68,99,79,54],'Quicksilver':[46,68,47,100,56,7,60],'Spider-Man':[86,82,77,96,91,16,88],'Doctor Strange':[50,82,88,69,95,98,73],'Captain Marvel':[98,84,96,96,79,99,98],'Shang-Chi':[73,100,76,82,80,87,85],'Thanos':[99,97,98,72,97,75,100],'Loki':[73,72,82,73,95,96,85],'Rocket':[39,74,56,75,98,77,65],'Adam Warlock':[95,75,93,91,62,97,95],'Makkari':[68,77,73,99,73,48,86]},
 ben10:{'XLR8':[55,100,65,60,48,92,60],'Grey Matter':[18,34,28,100,97,92,22],'Four Arms':[99,50,98,62,50,42,60],'Way Big':[100,65,98,57,53,80,100],'Alien X':[100,95,100,88,42,100,100],'Upgrade':[68,72,83,92,100,94,82],'Diamondhead':[88,72,97,74,68,80,85],'Clockwork':[52,57,79,89,68,98,96],'Ben Tennyson':[81,85,79,75,73,98,85]},
 dc:{'Superman':[100,96,100,99,83,95,100],'Batman':[51,99,75,79,100,84,84],'Wonder Woman':[99,100,98,90,88,90,98],'Flash (Barry Allen)':[67,80,70,100,82,82,75],'Lex Luthor':[51,60,67,70,100,91,60],'Darkseid':[100,97,100,88,92,100,100],'Joker':[35,74,43,60,91,26,58],'Brainiac':[78,83,91,88,100,98,87],'Martian Manhunter':[94,86,94,92,92,94,98],'Kid Flash (Wally West)':[63,79,68,97,82,63,75]},
 naruto:{'Naruto Uzumaki':[100,93,99,74,97,86,100],'Sasuke Uchiha':[92,94,99,98,96,98,91],'Sakura Haruno':[90,96,75,61,86,84,98],'Rock Lee':[57,100,35,20,98,79,92],'Might Guy':[70,100,55,31,99,85,100],'Shikamaru Nara':[49,65,62,50,64,100,73],'Itachi Uchiha':[90,94,93,100,91,100,90],'Madara Uchiha':[100,99,100,97,94,100,100],'Kakashi Hatake':[85,97,97,89,92,99,89]},
 cricket:{'Sachin Tendulkar':[100,47,78,94,99,100,84],'Virat Kohli':[99,39,90,95,99,98,99],'Jasprit Bumrah':[47,100,89,79,99,96,86],'MS Dhoni':[91,42,99,100,100,98,86],'Shane Warne':[41,100,80,88,99,94,77],'Ravindra Jadeja':[84,89,100,86,92,91,97],'Ellyse Perry':[96,94,95,94,98,98,96],'Mithali Raj':[100,35,83,99,91,100,78],'Jhulan Goswami':[45,99,82,90,93,97,87],'Smriti Mandhana':[98,35,91,79,93,94,91]}
};
const curated=new Map(CURATED_AVENGERS.map(c=>[c.name,c]));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};
const clamp=n=>Math.max(10,Math.min(100,n));
function ratings(c,entry){
  const canonical=curated.get(entry.name);
  if(c.id==='avengers'&&canonical)return c.fields.slice(1).map(s=>canonical[s.key]);
  if(iconic[c.id]?.[entry.name])return [...iconic[c.id][entry.name]];
  let basis=c.base[entry.role]||Object.values(c.base)[0];
  if(c.id==='shinchan'){
    const scenario=entry.name.split(' — ')[1];
    basis={'Playtime Challenge':[86,81,66,92,80,84,76],'Festival Adventure':[72,86,78,88,97,66,86],'Secret Mission':[75,70,95,82,83,87,74],'Surprise Showdown':[89,96,78,87,74,72,97]}[scenario]||basis;
    if(entry.name.startsWith('Shinnosuke Nohara'))basis=basis.map((v,i)=>i===0||i===1?clamp(v+7):v);
  }
  if(c.id==='fantasy'){
    const kind=entry.name.split(' ').at(-1);
    basis={Wyvern:[94,82,83,94,56,85,68],Sentinel:[87,50,97,67,79,96,60],Warden:[75,73,91,76,89,94,82],Sprite:[28,99,43,91,83,54,96],Titan:[100,33,99,65,60,100,52],Ranger:[70,98,63,69,88,73,85],Golem:[97,38,99,71,54,99,67],Seer:[38,59,56,98,100,70,96],Drake:[94,91,85,91,65,83,76],Guardian:[88,77,98,80,78,95,80]}[kind]||basis;
  }
  const h=hash(c.id+':'+entry.name),focus=h%7,weak=(focus+3)%7;
  return basis.map((v,k)=>clamp(v+(hash(entry.name+':'+k)%15)-7+(k===focus?10:0)-(k===weak?12:0)));
}
function interleave(groups,themeId){
 const overrides=PACK_ENTRY_OVERRIDES[themeId]||{};
 const queues=groups.map(g=>g.names.map(name=>({name,group:overrides[name]?.group||g.group,role:overrides[name]?.role||g.role})));
 const cards=[];let idx=0;
 while(cards.length<80){
  const q=queues[idx++%queues.length];if(q.length)cards.push(q.shift());
  if(idx>1000)throw Error('Insufficient roster');
 }
 return cards;
}
function build(c){
 const entries=interleave(PACK_ROSTERS[c.id],c.id).map((data,i)=>({id:i+1,...data,ratings:ratings(c,data)}));
 const byPower=[...entries].sort((a,b)=>b.ratings.reduce((x,y)=>x+y,0)-a.ratings.reduce((x,y)=>x+y,0)||a.id-b.id);
 const ranked=new Map(byPower.map((e,i)=>[e.id,i+1]));
 const cards=entries.map(e=>Object.freeze({id:e.id,name:e.name,group:e.group,role:e.role,kind:c.id==='shinchan'?'original_situation':c.id==='fantasy'?'original_creature':'character',stats:Object.freeze(Object.fromEntries([['rank',ranked.get(e.id)],...c.fields.slice(1).map((s,k)=>[s.key,e.ratings[k]])])),provenance:c.id==='avengers'&&curated.has(e.name)?'curated_editorial':'editorial_gameplay_draft'}));
 return Object.freeze({id:c.id,name:c.name,emoji:c.emoji,hue:c.hue,tagline:c.tagline,rights:c.rights||'third_party_unlicensed_development',categories:Object.freeze(c.fields),cards:Object.freeze(cards),decks:Object.freeze(Object.fromEntries(Object.entries(DECK_SIZE).map(([n,size])=>[n,Object.freeze(cards.slice(0,size).map(x=>x.id))]))),disclaimer:c.id==='cricket'?'Stats are game ratings, NOT verified player career statistics.':c.id==='shinchan'?'Each card is an original imaginary situation, not a canonical episode.':'Subjective game ratings; not official measurements.'});
}
export const THEME_PACKS=Object.freeze(Object.fromEntries(configs.map(c=>[c.id,build(c)])));
export const THEME_IDS=Object.freeze(Object.keys(THEME_PACKS));
export const getTheme=id=>THEME_PACKS[id]||null;
export const getCard=(theme,id)=>getTheme(theme)?.cards[Number(id)-1]||null;
export function validatePack(pack){
 if(!pack||!Object.values(DECK_SIZE).every(size=>pack.cards.length>=size))throw Error('Theme needs at least 80 cards');
 if(pack.categories.length!==8||pack.categories[0].key!=='rank'||pack.categories[0].direction!=='min'||pack.categories.slice(1).some(x=>x.direction!=='max'))throw Error('Incorrect stat contract');
 const names=new Set(),ids=new Set(),ranks=new Set();
 for(const c of pack.cards){
  if(names.has(c.name)||ids.has(c.id)||ranks.has(c.stats.rank))throw Error('Repeated card/rank');
  names.add(c.name);ids.add(c.id);ranks.add(c.stats.rank);
  if(Object.keys(c.stats).length!==8||pack.categories.some(s=>!Number.isInteger(c.stats[s.key])||c.stats[s.key]<1||c.stats[s.key]>100))throw Error('Invalid stat');
 }
 for(const [n,size] of Object.entries(DECK_SIZE)){const d=pack.decks[n];if(d.length!==size||new Set(d).size!==size||d.some(id=>!ids.has(id)))throw Error('Incorrect deck manifest');}
 return true;
}
